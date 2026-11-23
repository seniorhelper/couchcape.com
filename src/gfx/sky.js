// CouchCape gfx: skies.
//  - atmoSkyMaterial(): day / dusk dome (palette gradient + Mie halo + limb-darkened sun disk + horizon haze that matches
//    the aerial-perspective fog toward the sun, so far geometry melts into the sky in the same direction the light comes from)
//  - auroraSkyMaterial(): 'neon-night' sky with slow aurora curtains (<= 0.05 Hz drift, no flashing)
//  - studioSkyMaterial(): soft studio sphere with two softboxes (clay / paradox levels, mostly for reflections)
//  - realStarSky(scene, opts): the real night sky (HYG star catalog + baked Milky Way + deep-sky objects), ported from the
//    owner's Attack of the AI renderer and rewritten readable. Data: game/data/stars.bin, starnames.json, dso.json.
// All domes use the "z = w" trick, so they always sit on the far plane and never need to follow the camera.
import * as THREE from 'three';

const DOME_VS = `varying vec3 vD;
void main(){ vD = position; vec4 p = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0); gl_Position = p.xyww; gl_Position.z = gl_Position.w * 0.99999; }`;
const DITHER = `float tpIgn(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;

export const FOG_SUN = { dir: { x: -0.42, y: 0.26, z: -0.87 }, color: { r: 1, g: 0.85, b: 0.7 }, amt: { value: 0 } }; // shared by the fog patch

// ------------------------------------------------------------------ day / dusk
export function atmoSkyMaterial(pal) {
  const U = {
    uTop: { value: new THREE.Color(pal.top) }, uMid: { value: new THREE.Color(pal.mid) }, uHor: { value: new THREE.Color(pal.hor) },
    uLow: { value: new THREE.Color(pal.low) }, uNadir: { value: new THREE.Color(pal.nadir) }, uSunCol: { value: new THREE.Color(pal.sun) },
    uSunDir: { value: new THREE.Vector3(-0.42, 0.26, -0.87).normalize() }, uSunSize: { value: pal.sunSize ?? 0.022 },
    uFog: { value: new THREE.Color(pal.fog ?? pal.hor) }, uFogSun: { value: new THREE.Color(pal.fogSun ?? pal.sun) }, uFogAmt: { value: pal.fogSunAmt ?? 0.35 },
    uHaze: { value: pal.haze ?? 0.6 }, uDisk: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: U, vertexShader: DOME_VS,
    fragmentShader: `varying vec3 vD; uniform vec3 uTop, uMid, uHor, uLow, uNadir, uSunCol, uSunDir, uFog, uFogSun; uniform float uSunSize, uFogAmt, uHaze, uDisk;
${DITHER}
void main(){
  vec3 d = normalize(vD); float y = d.y; float mu = dot(d, uSunDir);
  // palette gradient (keeps the art-directed Aurelia colours)
  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.3, y)); c = mix(c, uTop, smoothstep(0.22, 0.95, y));
  vec3 b = mix(uHor, uLow, smoothstep(0.0, -0.2, y)); b = mix(b, uNadir, smoothstep(-0.2, -1.0, y));
  c = mix(c, b, smoothstep(0.0, -0.02, y));
  // Rayleigh-ish: sky opposite the sun is a touch deeper, sun side a touch brighter
  c *= 0.93 + 0.14 * (mu * 0.5 + 0.5);
  // aerial perspective: the horizon band equals the fog colour seen in that direction (same formula as the fog patch)
  float mup = max(mu, 0.0);
  vec3 fogC = uFog + uFogSun * pow(mup, 6.0) * uFogAmt;
  c = mix(c, fogC, exp(-abs(y) * 9.0) * uHaze);
  // Mie forward scattering halo + sun disk with limb darkening
  c += uSunCol * (pow(mup, 7.0) * 0.12 + pow(mup, 60.0) * 0.35 + pow(mup, 900.0) * 0.9) * (0.4 + 0.6 * smoothstep(-0.05, 0.1, y));
  float ca = cos(uSunSize); float r = clamp((1.0 - mu) / (1.0 - ca), 0.0, 1.0);
  float disk = 1.0 - smoothstep(0.82, 1.0, r);
  float limb = 0.55 + 0.45 * sqrt(max(1.0 - r * r, 0.0));
  c += uSunCol * disk * limb * 14.0 * uDisk * smoothstep(-0.02, 0.01, y);
  c += (tpIgn(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  m.userData.sky = 'atmo';
  return m;
}

// ------------------------------------------------------------------ neon night with aurora
export function auroraSkyMaterial(pal = {}) {
  const U = {
    uTime: { value: 0 }, uTop: { value: new THREE.Color(pal.top ?? 0x070a22) }, uHor: { value: new THREE.Color(pal.hor ?? 0x3a1650) },
    uGlow: { value: new THREE.Color(pal.glow ?? 0xff4fa8) }, uA: { value: new THREE.Color(pal.auroraA ?? 0x2affc0) }, uB: { value: new THREE.Color(pal.auroraB ?? 0xb45cff) },
    uGain: { value: pal.gain ?? 1 }, uStars: { value: pal.stars ?? 1 },
  };
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: U, vertexShader: DOME_VS,
    fragmentShader: `varying vec3 vD; uniform float uTime, uGain, uStars; uniform vec3 uTop, uHor, uGlow, uA, uB;
${DITHER}
float h1(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
float h2(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 d = normalize(vD); float y = d.y;
  vec3 c = mix(uHor, uTop, smoothstep(-0.02, 0.55, y));
  c += uGlow * exp(-abs(y) * 14.0) * 0.35;                       // city glow on the horizon
  c = mix(c, uTop * 0.4, smoothstep(0.0, -0.4, y));
  // aurora: curtains along azimuth, vertical rays, drifting very slowly
  float az = atan(d.x, d.z); float t = uTime * 0.02;
  float ec = 0.30 + 0.10 * n1(az * 1.3 + t * 3.0) + 0.05 * sin(az * 2.0 + t * 5.0);
  float band = exp(-pow((y - ec) / 0.11, 2.0)) * smoothstep(0.03, 0.12, y);
  float rays = 0.45 + 0.55 * n1(az * 38.0 + n1(az * 4.0 + t * 6.0) * 6.0);
  float curtain = smoothstep(0.25, 0.85, n1(az * 3.2 - t * 4.0));
  float a = band * rays * curtain;
  vec3 ac = mix(uA, uB, smoothstep(ec - 0.05, ec + 0.14, y));
  c += ac * a * 0.55 * uGain;
  // a sprinkle of faint procedural stars (real stars can be layered with realStarSky)
  vec2 g = vec2(az * 120.0, y * 120.0); vec2 gi = floor(g); float s = h2(gi);
  float st = step(0.992, s) * smoothstep(0.5, 0.05, length(fract(g) - 0.5)) * smoothstep(0.05, 0.3, y);
  c += vec3(0.8, 0.85, 1.0) * st * 0.6 * uStars;
  c += (tpIgn(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  m.userData.sky = 'aurora';
  return m;
}

// ------------------------------------------------------------------ studio (clay / paradox)
export function studioSkyMaterial(pal = {}) {
  const U = { uTop: { value: new THREE.Color(pal.top ?? 0xf6efe6) }, uBot: { value: new THREE.Color(pal.bot ?? 0xcfc3b8) }, uBox: { value: pal.box ?? 3.0 }, uKey: { value: new THREE.Vector3(-0.5, 0.6, 0.6).normalize() } };
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: U, vertexShader: DOME_VS,
    fragmentShader: `varying vec3 vD; uniform vec3 uTop, uBot, uKey; uniform float uBox;
void main(){ vec3 d = normalize(vD);
  vec3 c = mix(uBot, uTop, smoothstep(-0.3, 0.5, d.y));
  // two big soft boxes give clay and glossy op-art surfaces readable highlights
  float k = smoothstep(0.92, 0.97, dot(d, uKey)); float f = smoothstep(0.9, 0.96, dot(d, normalize(vec3(0.7, 0.35, 0.5))));
  c += vec3(1.0, 0.97, 0.92) * k * uBox + vec3(0.85, 0.9, 1.0) * f * uBox * 0.4;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  m.userData.sky = 'studio';
  return m;
}

export function skyDome(material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), material);
  m.frustumCulled = false; m.renderOrder = -100; m.name = 'gfx-sky'; m.matrixAutoUpdate = false;
  return m;
}

// ================================================================== real star sky (HYG)
// radec (radians) -> unit vector. Celestial north = +Y, RA 0h = +X, RA 6h = -Z.
function radec(ra, dec, v) { const c = Math.cos(dec); return v.set(c * Math.cos(ra), Math.sin(dec), -c * Math.sin(ra)); }
const DEG = Math.PI / 180;
// B-V colour index -> linear RGB (Ballesteros temperature + Planckian fit), softened toward white for a natural look
function bvToRGB(bv, out) {
  bv = Math.max(-0.4, Math.min(2, bv));
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)) / 100;
  let r, g, b;
  if (T <= 66) { r = 255; g = 99.4708025861 * Math.log(T) - 161.1195681661; } else { r = 329.698727446 * (T - 60) ** -0.1332047592; g = 288.1221695283 * (T - 60) ** -0.0755148492; }
  b = T >= 66 ? 255 : T <= 19 ? 0 : 138.5177312231 * Math.log(T - 10) - 305.0447927307;
  r = (Math.min(255, Math.max(0, r)) / 255) ** 2.2; g = (Math.min(255, Math.max(0, g)) / 255) ** 2.2; b = (Math.min(255, Math.max(0, b)) / 255) ** 2.2;
  const m = Math.max(r, g, b), w = 0.3;
  out[0] = r / m + (1 - r / m) * w; out[1] = g / m + (1 - g / m) * w; out[2] = b / m + (1 - b / m) * w; return out;
}
// galactic frame (J2000): north galactic pole and galactic centre directions
function galFrame() {
  const Z = radec(192.85948 * DEG, 27.12825 * DEG, new THREE.Vector3());
  const C = radec(266.40499 * DEG, -28.93617 * DEG, new THREE.Vector3());
  const X = C.clone().addScaledVector(Z, -C.dot(Z)).normalize();
  return { X, Y: new THREE.Vector3().crossVectors(Z, X).normalize(), Z };
}
function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let e = t; e = Math.imul(e ^ (e >>> 15), e | 1); e ^= e + Math.imul(e ^ (e >>> 7), e | 61); return ((e ^ (e >>> 14)) >>> 0) / 4294967296; }; }

const NOISE_GLSL = `
float sq(float x){ return x*x; }
vec3 hash33(vec3 p3){ p3 = fract(p3*vec3(.1031,.1030,.0973)); p3 += dot(p3,p3.yxz+33.33); return -1.+2.*fract((p3.xxy+p3.yxx)*p3.zyx); }
float gnoise(vec3 p){
  vec3 i=floor(p), f=fract(p); vec3 u=f*f*f*(f*(f*6.-15.)+10.);
  float a=dot(hash33(i),f), b=dot(hash33(i+vec3(1,0,0)),f-vec3(1,0,0));
  float c=dot(hash33(i+vec3(0,1,0)),f-vec3(0,1,0)), d=dot(hash33(i+vec3(1,1,0)),f-vec3(1,1,0));
  float e=dot(hash33(i+vec3(0,0,1)),f-vec3(0,0,1)), g=dot(hash33(i+vec3(1,0,1)),f-vec3(1,0,1));
  float h=dot(hash33(i+vec3(0,1,1)),f-vec3(0,1,1)), k=dot(hash33(i+vec3(1,1,1)),f-vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y), mix(mix(e,g,u.x),mix(h,k,u.x),u.y), u.z);
}
float fbm(vec3 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*gnoise(p); p=p*2.02+vec3(17.1,3.7,9.2); a*=.5; } return .5+.9*s; }`;

// One-time bake of the Milky Way into a small cube map (sqrt-encoded RGBA8, mipmapped). The expensive fbm runs only here.
function bakeMilkyWay(renderer, size) {
  const G = galFrame();
  const rt = new THREE.WebGLCubeRenderTarget(size, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthTest: false, depthWrite: false,
    uniforms: { uGX: { value: G.X }, uGY: { value: G.Y }, uGZ: { value: G.Z } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `precision highp float; varying vec3 vDir; uniform vec3 uGX, uGY, uGZ;${NOISE_GLSL}
void main(){
  vec3 d = normalize(vDir);
  float b = asin(clamp(dot(d, uGZ), -1., 1.)), l = atan(dot(d, uGY), dot(d, uGX));
  float gc = acos(clamp(dot(d, uGX), -1., 1.));
  float n1 = fbm(d * 4.0 + 1.3), n2 = fbm(d * 11.0 + 7.7), n3 = fbm(d * 27.0 + 3.1);
  float warp = (fbm(d * 2.5 + 9.0) - .5) * .16, bw = b + warp, wl = abs(l);
  float thin = exp(-sq(bw / .11)), wide = exp(-sq(bw / .34)), lon = .30 + .70 * exp(-wl * wl / 1.805), bulge = exp(-sq(gc / .32));
  float I = .75 * thin * (.35 + 1.25 * smoothstep(.30, .78, n1)) * lon * (.65 + .7 * n3) + .32 * wide * lon * (.55 + .9 * n1) + .85 * bulge * (.7 + .6 * n2);
  float lane = exp(-sq((bw - .012 + .035 * (n1 - .5)) / (.045 + .03 * n2)));
  float dustAmt = .30 + .70 * exp(-wl * wl / 2.645);
  float pch = smoothstep(.46, .86, fbm(d * 9.0 + vec3(warp * 18., 2., 5.)));
  float dust = clamp(lane * dustAmt * (.35 + .6 * n2) + pch * (thin * .6 + wide * .18) * dustAmt, 0., .78);
  dust = dust * dust * (3. - 2. * dust); I *= 1. - dust;
  vec3 col = mix(vec3(.60, .72, 1.), vec3(1., .80, .55), clamp(.20 + .9 * (bulge + .55 * exp(-wl * wl / .98)), 0., 1.));
  col = mix(col, vec3(1., .42, .55), smoothstep(.62, .82, fbm(d * 16.0 + vec3(11., 3., 6.))) * thin * .27);
  vec3 c = col * I * .105 + vec3(.0022, .0034, .0075) * (.6 + .8 * n1);
  gl_FragColor = vec4(sqrt(clamp(c / .5, 0., 1.)), 1.);
}`,
  });
  const sc = new THREE.Scene(); const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat); box.frustumCulled = false; sc.add(box);
  const cam = new THREE.CubeCamera(0.1, 10, rt); const xr = renderer.xr.enabled; renderer.xr.enabled = false;
  const prev = renderer.getRenderTarget(); cam.update(renderer, sc); renderer.setRenderTarget(prev); renderer.xr.enabled = xr;
  mat.dispose(); box.geometry.dispose();
  return rt;
}

const STAR_VS = `attribute vec3 aDir; attribute vec3 aCol; attribute float aMag;
uniform vec2 uRes; uniform float uGain, uLimit;
varying vec2 vLocal; varying float vHalf, vFlux; varying vec3 vCol;
void main(){
  float flux = .5 * pow(10., -.4 * (aMag - 6.5)) * uGain;
  flux *= 1. - .62 * smoothstep(5.6, 7.4, aMag);            // faintest stars dimmer, so constellations read
  flux *= 1. - smoothstep(uLimit - 0.5, uLimit, aMag);      // magnitude limit (hazy / city skies)
  float halfPx = 3.2 + 1.7 * sqrt(flux);
  vec4 c = projectionMatrix * vec4(mat3(modelViewMatrix) * aDir * 100.0, 1.0);
  vLocal = position.xy * halfPx; vHalf = halfPx; vFlux = flux; vCol = aCol;
  if (c.w < 1e-3 || flux < 0.002) { gl_Position = vec4(2., 2., 2., 1.); return; }
  vec2 px = c.xy / c.w * .5 * uRes + position.xy * halfPx;
  gl_Position = vec4(px / (.5 * uRes), .99999, 1.);
}`;
const STAR_FS = `precision highp float; varying vec2 vLocal; varying float vHalf, vFlux; varying vec3 vCol;
void main(){
  float r = length(vLocal); float win = 1. - smoothstep(.55 * vHalf, vHalf, r); if (win <= 0.) discard;
  const float sig = .9;
  float core = vFlux / (6.2832 * sig * sig) * exp(-r * r / (2. * sig * sig));
  float halo = .012 * vFlux * pow(1. + r * r / 4.84, -1.5);
  vec3 c = vCol * (core + halo) * win; c = 1. - exp(-c);
  gl_FragColor = vec4(c, 1.);
  #include <colorspace_fragment>
}`;

/**
 * realStarSky(scene, opts) -> handle (sync); stars appear when the data has loaded (handle.ready resolves).
 * opts: renderer (needed for the Milky Way bake), base (URL of game/data/), quality 'low'|'medium'|'high',
 *       gain (star brightness), milkyWay (0..1 brightness, 0 = off), limit (faintest magnitude shown), rotation (THREE.Euler)
 * handle: { group, ready, setVisible(b), setGain(x), starInfoAt(dirWorld) -> {name, distanceLy, spectral, constellation}|null, dispose() }
 */
export function realStarSky(scene, opts = {}) {
  const { renderer = null, base = new URL('../../data/', import.meta.url).href, quality = 'medium', gain = 1, milkyWay = 1, limit = 8, rotation = null } = opts;
  const group = new THREE.Group(); group.name = 'real-star-sky'; if (rotation) group.rotation.copy(rotation);
  scene.add(group);
  const res = new THREE.Vector2(1280, 800), tmp = new THREE.Vector2();
  const shared = { uRes: { value: res }, uGain: { value: gain }, uLimit: { value: limit } };
  const named = [];
  let mwRT = null, mats = [], geos = [];
  const updateRes = (r, s, cam) => { if (cam.viewport && cam.viewport.z > 0) res.set(cam.viewport.z, cam.viewport.w); else { r.getDrawingBufferSize(tmp); res.copy(tmp); } };

  const ready = Promise.all([
    fetch(base + 'stars.bin').then((r) => r.arrayBuffer()), fetch(base + 'starnames.json').then((r) => r.json()), fetch(base + 'dso.json').then((r) => r.json()),
  ]).then(([bin, names, dsos]) => {
    const a = new Float32Array(bin), real = a.length / 4, extra = quality === 'low' ? 0 : quality === 'medium' ? 5000 : 11000, total = real + extra;
    const dir = new Float32Array(total * 3), col = new Float32Array(total * 3), mag = new Float32Array(total), v = new THREE.Vector3(), c3 = [0, 0, 0];
    for (let i = 0; i < real; i++) { radec(a[i * 4], a[i * 4 + 1], v); dir.set([v.x, v.y, v.z], i * 3); mag[i] = a[i * 4 + 2]; bvToRGB(a[i * 4 + 3], c3); col.set(c3, i * 3); }
    // faint unresolved stars concentrated along the galactic plane (fills the band like a real dark-sky photo)
    const G = galFrame(), R = rng(90210); let n = real, guard = 0;
    while (n < total && guard++ < extra * 60) {
      v.set(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); const L = v.length(); if (L > 1 || L < 0.05) continue; v.divideScalar(L);
      const b = Math.asin(THREE.MathUtils.clamp(v.dot(G.Z), -1, 1)), gc = Math.acos(THREE.MathUtils.clamp(v.dot(G.X), -1, 1));
      const p = 0.06 + Math.exp(-(b * b) / 0.0512) * (0.35 + 0.9 * Math.exp(-(gc * gc) / 2.42)); if (R() > p) continue;
      dir.set([v.x, v.y, v.z], n * 3); mag[n] = 7.2 + 2.4 * R() ** 0.8; bvToRGB(0.1 + R() * 1.3, c3); col.set(c3, n * 3); n++;
    }
    for (const k of Object.keys(names)) { const i = +k; if (i < real) named.push({ i, dx: dir[i * 3], dy: dir[i * 3 + 1], dz: dir[i * 3 + 2], info: names[k], mag: mag[i] }); }

    // stars: one instanced draw (quad per star, sized in pixels, so they stay sharp points in both eyes)
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3)); g.setIndex([0, 1, 2, 2, 1, 3]);
    g.setAttribute('aDir', new THREE.InstancedBufferAttribute(dir, 3)); g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3)); g.setAttribute('aMag', new THREE.InstancedBufferAttribute(mag, 1));
    g.instanceCount = n;
    const sm = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: STAR_VS, fragmentShader: STAR_FS, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: false });
    const stars = new THREE.Mesh(g, sm); stars.frustumCulled = false; stars.renderOrder = -99; stars.name = 'stars'; stars.onBeforeRender = updateRes; group.add(stars);
    mats.push(sm); geos.push(g);

    // deep-sky objects: galaxies, globular / open clusters, planetary nebulae (soft sprites at their true positions & sizes)
    const TYPES = { Gxy: 0, GC: 1, OC: 2, PN: 3 }, COLS = { Gxy: [1, 0.88, 0.72], GC: [1, 0.9, 0.72], OC: [0.72, 0.82, 1], PN: [0.35, 1, 0.85] };
    const ds = dsos.filter(([, , m, t]) => t in TYPES && !(t === 'OC' && m > 4.8) && !(t === 'GC' && m > 6.5) && !(t === 'PN' && m > 8.6));
    if (ds.length) {
      const dd = new Float32Array(ds.length * 3), di = new Float32Array(ds.length * 4), dc = new Float32Array(ds.length * 4);
      ds.forEach(([ra, dec, m, t, name, sizeArc], k) => {
        radec(ra, dec, v); dd.set([v.x, v.y, v.z], k * 3);
        const sDeg = sizeArc / 60; let amp = Math.min(0.22, Math.max(0.015, 0.35 * 10 ** (-0.2 * (m - 3.6)) * (0.5 / Math.max(sDeg, 0.2)) ** 0.5));
        if (t === 'OC') amp *= 0.45; if (t === 'PN') amp = 0.05;
        di.set([Math.min(sDeg, 7) * DEG * 0.6, amp * 0.55, TYPES[t], (name.length * 37 % 10) / 10 * 3.14], k * 4);
        dc.set([...COLS[t], 0.35 + 0.5 * ((name.length * 37) % 10) / 10], k * 4);
      });
      const dg = new THREE.InstancedBufferGeometry();
      dg.setAttribute('position', g.getAttribute('position')); dg.setIndex(g.getIndex());
      dg.setAttribute('aDir', new THREE.InstancedBufferAttribute(dd, 3)); dg.setAttribute('aInfo', new THREE.InstancedBufferAttribute(di, 4)); dg.setAttribute('aCol', new THREE.InstancedBufferAttribute(dc, 4));
      dg.instanceCount = ds.length;
      const dm = new THREE.ShaderMaterial({
        uniforms: { uGain: shared.uGain }, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
        vertexShader: `attribute vec3 aDir; attribute vec4 aInfo; attribute vec4 aCol; varying vec2 vUv; varying vec4 vInfo; varying vec4 vCol;
void main(){ vec3 d = aDir; vec3 rt = abs(d.y) > .95 ? normalize(cross(vec3(1.,0.,0.), d)) : normalize(cross(vec3(0.,1.,0.), d)); vec3 up = cross(d, rt);
  float S = max(aInfo.x, 0.004); vec3 P = normalize(d + (rt * position.x + up * position.y) * S) * 100.0;
  vUv = position.xy; vInfo = aInfo; vCol = aCol;
  vec4 c = projectionMatrix * vec4(mat3(modelViewMatrix) * P, 1.0); gl_Position = c; gl_Position.z = c.w * 0.99999; }`,
        fragmentShader: `precision highp float; uniform float uGain; varying vec2 vUv; varying vec4 vInfo; varying vec4 vCol;
void main(){ float cs = cos(vInfo.w), sn = sin(vInfo.w); vec2 u = vec2(cs * vUv.x - sn * vUv.y, sn * vUv.x + cs * vUv.y);
  float r0 = length(vUv); float win = 1. - smoothstep(.55, 1., r0); if (win <= 0.) discard; float I;
  if (vInfo.z < .5) { vec2 q = vec2(u.x, u.y / max(vCol.a, .15)); float r = length(q); I = exp(-r * 5.5) * .8 + exp(-r * r * 55.) * 1.4; }
  else if (vInfo.z < 1.5) I = pow(1. + r0 * r0 * 90., -1.15);
  else if (vInfo.z < 2.5) I = exp(-r0 * r0 * 5.) * .55;
  else I = exp(-pow((r0 - .30) / .20, 2.0)) * .8 + exp(-r0 * r0 * 25.) * .7;
  gl_FragColor = vec4(vCol.rgb * I * win * vInfo.y * uGain, 1.);
  #include <colorspace_fragment>
}`,
      });
      const dmesh = new THREE.Mesh(dg, dm); dmesh.frustumCulled = false; dmesh.renderOrder = -98; dmesh.name = 'dso'; group.add(dmesh);
      mats.push(dm); geos.push(dg);
    }
    return handle;
  }).catch((e) => { console.warn('realStarSky: data failed to load', e); return handle; });

  // Milky Way (baked once; sampled with one cube lookup per pixel at runtime)
  if (renderer && milkyWay > 0) {
    mwRT = bakeMilkyWay(renderer, quality === 'high' ? 512 : 256);
    const mm = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthTest: false, depthWrite: false, uniforms: { tMW: { value: mwRT.texture }, uGain: { value: milkyWay } },
      vertexShader: DOME_VS,
      fragmentShader: `varying vec3 vD; uniform samplerCube tMW; uniform float uGain; ${DITHER}
void main(){ vec3 e = textureCube(tMW, normalize(vD)).rgb; vec3 c = e * e * .5 * uGain; c += (tpIgn(gl_FragCoord.xy) - .5) / 255. * step(.002, c.g);
  gl_FragColor = vec4(c, 1.);
  #include <colorspace_fragment>
}`,
    });
    const mw = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), mm); mw.frustumCulled = false; mw.renderOrder = -100; mw.name = 'milkyway'; group.add(mw);
    mats.push(mm); geos.push(mw.geometry);
  }

  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), cos2 = Math.cos(2 * DEG);
  const handle = {
    group, ready,
    setVisible(b) { group.visible = b; },
    setGain(x) { shared.uGain.value = x; },
    setLimit(m) { shared.uLimit.value = m; },
    // nearest named star within 2 degrees of a world-space direction (e.g. the gaze ray) -> facts for the narrator
    starInfoAt(dirWorld) {
      _v.copy(dirWorld).applyQuaternion(group.getWorldQuaternion(_q).invert()).normalize();
      let best = null, bd = 1e9;
      for (const s of named) { const d = s.dx * _v.x + s.dy * _v.y + s.dz * _v.z; if (d < cos2) continue; const a = Math.acos(Math.min(1, d)) * (1 + 0.15 * s.mag); if (a < bd) { bd = a; best = s; } }
      if (!best) return null; const [name, distanceLy, spectral, constellation] = best.info; return { name, distanceLy, spectral, constellation };
    },
    dispose() { mats.forEach((m) => m.dispose()); geos.forEach((g) => g.dispose()); if (mwRT) mwRT.dispose(); group.removeFromParent(); },
  };
  return handle;
}
