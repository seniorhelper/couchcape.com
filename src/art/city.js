// Aurelia (placeholder name) - luminous floating utopian city. 100% procedural, no lights, no shadows.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const PI = Math.PI;
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ utils
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry(20261122);
const rr = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function h3(i, j, k) { let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177); n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967295; }
function vn(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
           l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
const fbm = (x, y, z) => 0.6 * vn(x, y, z) + 0.3 * vn(x * 2.1, y * 2.1, z * 2.1) + 0.1 * vn(x * 4.3, y * 4.3, z * 4.3) - 0.5;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _n = new THREE.Vector3(), _c1 = new THREE.Color(), _c2 = new THREE.Color();

// ------------------------------------------------------------------ palette
const PAL = {
  cream: 0xfbeedf, white: 0xfffaf0, shadow: 0xb9aedb, rockTop: 0xeadccd, rockBot: 0x9a8dbb,
  gold: 0xe8b25c, bronze: 0xa4642f, ivory: 0xf5ebd5,
  gA: 0x8fcf6c, gB: 0x4fa966, gC: 0x35905c,
  pink: 0xffa6d0, pinkL: 0xffd0e6, mag: 0xe2509f,
};
const SHADOW = new THREE.Color(0xc7a6cf);
const ALB = 0.8;

// color functions: (out, wx, wy, wz, nx, ny, nz)
const flat = (hex) => { const c = new THREE.Color(hex); return (o) => o.copy(c); };
function shade(hex, under = 0.5, jit = 0.04) {
  const c = new THREE.Color(hex);
  return (o, x, y, z, nx, ny, nz) => {
    o.copy(c);
    const t = clamp(0.55 - ny * 0.55, 0, 1);
    o.lerp(SHADOW, t * under);
    const j = (vn(x * 0.3, y * 0.3, z * 0.3) - 0.5) * jit; o.r += j; o.g += j; o.b += j;
    o.multiplyScalar(ALB);
  };
}
function grad(y0, hex0, y1, hex1) {
  const a = new THREE.Color(hex0), b = new THREE.Color(hex1);
  return (o, x, y) => { o.copy(a).lerp(b, clamp((y - y0) / (y1 - y0))); };
}

class Bucket {
  constructor() { this.geos = []; }
  add(geo, cf, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.attributes.uv) g.deleteAttribute('uv');
    const s = o.s ?? 1;
    _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
    if (o.q) _q.copy(o.q); else { _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ'); _q.setFromEuler(_e); }
    _p.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    _m.compose(_p, _q, _s); g.applyMatrix4(_m);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      cf(_c1, pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
      col[i * 3] = _c1.r; col[i * 3 + 1] = _c1.g; col[i * 3 + 2] = _c1.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(g);
  }
  // beam between two points using a unit-Y geometry
  beam(geo, a, b, thick, cf) {
    const d = _n.copy(b).sub(a); const len = d.length();
    _q.setFromUnitVectors(UP, d.normalize());
    const q = _q.clone();
    this.add(geo, cf, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, sx: thick, sy: len, sz: thick, q });
  }
  mesh(mat) {
    if (!this.geos.length) return null;
    const g = mergeGeometries(this.geos, false);
    this.geos.forEach((x) => x.dispose()); this.geos = [];
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.updateMatrix(); m.frustumCulled = false; return m;
  }
}

// ------------------------------------------------------------------ geometry helpers
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg);
function displace(geo, amp, freq, maskFn, seed = 0) {
  if (!geo.index) { geo.deleteAttribute('uv'); geo.deleteAttribute('normal'); geo = mergeVertices(geo, 1e-4); geo.computeVertexNormals(); }
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = fbm(x * freq + seed, y * freq, z * freq - seed) * amp * (maskFn ? maskFn(x, y, z) : 1);
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals(); return geo;
}
function sweep(pts, nrm, wFn, hFn, N = 18, sec = 8) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const pos = [], idx = [];
  const T = new THREE.Vector3(), S = new THREE.Vector3(), U = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const t = i / N; curve.getPointAt(t, P); curve.getTangentAt(t, T);
    S.crossVectors(T, nrm).normalize(); U.crossVectors(S, T).normalize();
    const w = wFn(t), h = hFn(t);
    for (let j = 0; j < sec; j++) {
      const a = (j / sec) * TAU, c = Math.cos(a) * w, s = Math.sin(a) * h;
      pos.push(P.x + S.x * c + U.x * s, P.y + S.y * c + U.y * s, P.z + S.z * c + U.z * s);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < sec; j++) {
    const a = i * sec + j, b = i * sec + ((j + 1) % sec), c = (i + 1) * sec + j, d = (i + 1) * sec + ((j + 1) % sec);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function columnGeo(h, r, seg = 12, simple = false) {
  const R = r;
  if (simple) return lathe([[R * 1.6, 0], [R * 1.1, h * 0.06], [R * 0.85, h * 0.5], [R * 1.1, h * 0.94], [R * 1.6, h * 0.97], [0, h]], seg);
  return lathe([[R * 1.7, 0], [R * 1.7, h * 0.03], [R * 1.25, h * 0.055], [R * 1.0, h * 0.09], [R * 0.86, h * 0.5], [R * 0.84, h * 0.8],
    [R * 1.0, h * 0.91], [R * 1.5, h * 0.945], [R * 1.75, h * 0.965], [R * 1.75, h], [0, h]], seg);
}
const G = {
  ico0: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  sph: new THREE.SphereGeometry(1, 12, 8),
  dome: new THREE.SphereGeometry(1, 20, 8, 0, TAU, 0, PI / 2),
  box: new THREE.BoxGeometry(1, 1, 1),
  beam: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1),
  beamT: new THREE.CylinderGeometry(0.35, 0.5, 1, 6, 1),
  oct: new THREE.OctahedronGeometry(1, 0),
};
function torusGeo(R, t, seg = 48, tseg = 6) { const g = new THREE.TorusGeometry(R, t, tseg, seg); g.rotateX(PI / 2); return g; }
const bushGeos = [0, 1, 2].map((i) => { const g = G.ico1.clone(); g.scale(1, 0.78, 1); return displace(g, 0.7, 1.3, null, i * 7.3); });
const ico2 = new THREE.IcosahedronGeometry(1, 2);
const lawnGeo = lathe([[1, 0], [0.85, 0.2], [0.5, 0.42], [0, 0.5]], 28);

// ------------------------------------------------------------------ shared uniforms & sky constants
const UT = { value: 0 };
const SUN_DIR = new THREE.Vector3(-0.42, 0.26, -0.87).normalize();
const SKY = {
  top: new THREE.Color(0x8f9df0), mid: new THREE.Color(0xc2b0f0), hor: new THREE.Color(0xffcfc4), low: new THREE.Color(0xf2d6ea), nadir: new THREE.Color(0xaeb6f2),
  sun: new THREE.Color(0xffe1b0),
};
const FOG_COL = new THREE.Color(0xe9cfe2);
const UNI = {
  uSkyT: { value: new THREE.Color(0xa9b4f4) }, uSkyH: { value: new THREE.Color(0xffd6cb) },
  uSunDir: { value: SUN_DIR }, uSunCol: { value: new THREE.Color(0xffe6bd) }, uTime: UT,
  uFakeRefl: { value: 1.0 }, // gfx/materials.js lowers this once the real PMREM environment is on
};

// MeshStandard + fake sky reflections (+ optional plaza tile pattern)
function skyReflect(mat, { k = 0.12, p = 3.0, sky = 0.6, spec = 0.8, plaza = false, sway = false } = {}) {
  mat.customProgramCacheKey = () => `sky${k}_${p}_${sky}_${spec}_${plaza}_${sway}`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, UNI);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWP;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWP = position.xz;
${sway ? `float kk = -position.y; float ph = uTime*0.9 + instanceMatrix[3].x*0.21 + instanceMatrix[3].z*0.17;
transformed.x += sin(ph)*0.028*kk; transformed.z += cos(ph*0.8)*0.02*kk;` : ''}`);
    const pattern = plaza ? `
{ float r = length(vWP); float a = atan(vWP.y, vWP.x);
  float ringW = 4.4; float ri = floor(r/ringW); float rf = fract(r/ringW);
  float n = max(6.0, floor(6.2831853*(ri+0.5)));
  float off = 0.5*mod(ri,2.0);
  float au = a/6.2831853*n + off; float ai = mod(floor(au), n); float af = fract(au);
  float arcL = 6.2831853*(ri+0.5)*ringW/n;
  float gr = min(min(rf,1.0-rf)*ringW, min(af,1.0-af)*arcL);
  float hh = fract(sin(dot(vec2(ri,ai),vec2(12.9898,78.233)))*43758.5453);
  grout = 1.0 - smoothstep(0.04, 0.13, gr);
  vec3 base = vec3(0.56,0.52,0.58) + (hh-0.5)*0.10 + vec3(0.04,0.0,0.06)*mod(ri+ai,2.0);
  // gold bands
  float band = smoothstep(0.35,0.2,abs(r-44.5)) + smoothstep(0.35,0.2,abs(r-61.5)) + smoothstep(0.22,0.12,abs(r-30.5));
  base = mix(base, vec3(0.80,0.58,0.30), clamp(band,0.0,1.0)*0.9);
  // central medallion
  if (r < 11.0) { float pet = 4.5 + 5.0*abs(sin(a*6.0)); float inS = smoothstep(pet+0.15, pet-0.15, r);
    base = mix(base, vec3(0.82,0.60,0.38), inS*0.85); base = mix(base, vec3(0.85,0.45,0.58), smoothstep(2.2,1.9,r)*0.9); grout = max(grout*0.5, smoothstep(0.2,0.1,abs(r-pet))*0.5*inS); }
  diffuseColor.rgb = mix(base, vec3(0.34,0.28,0.42), grout*0.9);
}` : '';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vWP; uniform vec3 uSkyT, uSkyH, uSunDir, uSunCol; uniform float uFakeRefl;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float grout = 0.0;${pattern}`)
      .replace('#include <opaque_fragment>', `
{ vec3 nrm = normalize(normal); vec3 vd = normalize(vViewPosition);
  float fr = pow(1.0 - clamp(dot(nrm, vd), 0.0, 1.0), ${p.toFixed(2)});
  vec3 rv = inverseTransformDirection(reflect(-vd, nrm), viewMatrix);
  vec3 skc = mix(uSkyH, uSkyT, smoothstep(0.0, 0.85, rv.y));
  float az = atan(rv.x, rv.z);
  float sl = 0.06 + 0.05*sin(az*5.0+1.0) + 0.04*sin(az*11.0+2.0) + 0.02*sin(az*23.0+0.5);
  float bld = smoothstep(sl+0.015, sl-0.03, rv.y) * ${sky.toFixed(2)};
  skc = mix(skc, vec3(0.86,0.78,0.92), bld);
  skc += uSunCol * pow(max(dot(rv, uSunDir), 0.0), 70.0) * ${spec.toFixed(2)};
  float R = (${k.toFixed(3)} + (0.7 - ${k.toFixed(3)}) * fr) * (1.0 - smoothstep(0.12, 0.75, roughnessFactor)) ${plaza ? '* (1.0 - grout*0.8)' : ''} * uFakeRefl;
  outgoingLight = mix(outgoingLight, skc, clamp(R, 0.0, 0.95));
}
#include <opaque_fragment>`);
  };
  return mat;
}

// fog-aware ShaderMaterial helper
function fogUniforms(extra) { return THREE.UniformsUtils.merge([THREE.UniformsLib.fog, extra]); }

// ================================================================== main
export function buildCity(scene) {
  const root = new THREE.Group(); root.name = 'aurelia'; scene.add(root);
  scene.fog = new THREE.Fog(FOG_COL.getHex(), 90, 900);
  scene.background = new THREE.Color(0xe7cde0);

  // ---------------------------------------------------------------- materials
  const matStone = skyReflect(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.0 }), { k: 0.10, p: 3.0, sky: 0.5, spec: 0.5 });
  const matPlaza = skyReflect(new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.1, metalness: 0.05 }), { k: 0.07, p: 4.0, sky: 0.9, spec: 1.1, plaza: true });
  const matBronze = skyReflect(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.35 }), { k: 0.1, p: 3.0, sky: 0.2, spec: 0.9 });
  const matFol = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const matRock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const matGlow = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  const matVine = skyReflect(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }), { k: 0.0, p: 3, sky: 0, spec: 0, sway: true });
  const matShip = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  const matCrystal = new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.1, emissive: 0x9a86e8, emissiveIntensity: 0.55, flatShading: true });
  const matTree = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  // gfx tags: src/gfx/materials.js upgradeCity() adds triplanar PBR detail to these shared materials
  [[matStone, 'stone'], [matPlaza, 'plaza'], [matBronze, 'bronze'], [matFol, 'fol'], [matRock, 'rock'], [matVine, 'vine'], [matShip, 'ship'], [matCrystal, 'crystal'], [matTree, 'tree']].forEach(([m, t]) => { m.userData.gfx = t; });
  root.userData.look = { SUN_DIR, UNI, SKY, FOG_COL };

  const B = { stone: new Bucket(), bronze: new Bucket(), fol: new Bucket(), rock: new Bucket(), glow: new Bucket(), mtn: new Bucket() };
  const treeMats = [], vineList = [[], [], []], crystalMats = [], mistList = [];
  const stone = (hex = PAL.cream, u = 0.5) => shade(hex, u);
  const goldGlow = flat(0xffe2a8), pinkGlow = flat(0xffc6e2), tealGlow = flat(0xbff4ff);

  // ---------------------------------------------------------------- sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY.top }, mid: { value: SKY.mid }, hor: { value: SKY.hor }, low: { value: SKY.low }, nadir: { value: SKY.nadir }, sunCol: { value: SKY.sun }, sunDir: { value: SUN_DIR } },
    vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vD; uniform vec3 top, mid, hor, low, nadir, sunCol, sunDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec3 d = normalize(vD); float y = d.y;
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.3, y)); c = mix(c, top, smoothstep(0.22, 0.95, y));
  vec3 b = mix(hor, low, smoothstep(0.0, -0.2, y)); b = mix(b, nadir, smoothstep(-0.2, -1.0, y));
  c = mix(c, b, step(y, 0.0) * 0.0 + smoothstep(0.0, -0.02, y));
  float sd = max(dot(d, sunDir), 0.0);
  c += hor * pow(sd, 2.0) * 0.18 * (1.0 - smoothstep(0.0, 0.6, abs(y)));
  c += sunCol * (pow(sd, 900.0) * 1.6 + pow(sd, 60.0) * 0.38 + pow(sd, 7.0) * 0.12);
  c += (hash(gl_FragCoord.xy) - 0.5) * 0.012;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat); sky.renderOrder = -100; sky.frustumCulled = false; sky.userData.gfxSky = true; root.add(sky);

  // ---------------------------------------------------------------- clouds / mist (soft billboards)
  const puffMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: UT, uSunDir: { value: SUN_DIR }, lit: { value: new THREE.Color(0xfff0ea) }, shd: { value: new THREE.Color(0xc4b6ea) } },
    vertexShader: `varying vec2 vUv; varying vec3 vT; varying vec2 vSun; uniform float uTime; uniform vec3 uSunDir;
void main(){ vUv = uv; vec4 c = modelViewMatrix * instanceMatrix * vec4(0.,0.,0.,1.);
  float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
  float br = 1.0 + 0.05*sin(uTime*0.4 + instanceMatrix[3].x*0.05);
  c.xy += position.xy * vec2(sx, sy) * br;
  #ifdef USE_INSTANCING_COLOR
    vT = instanceColor;
  #else
    vT = vec3(1.0);
  #endif
  vec3 sv = mat3(viewMatrix) * uSunDir; vSun = normalize(sv.xy + vec2(0.0, 0.35)); // lit side faces the real sun
  gl_Position = projectionMatrix * c; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vT; varying vec2 vSun; uniform vec3 lit, shd;
float lobe(vec2 p, vec2 c, vec2 s){ return 1.0 - smoothstep(0.0, 1.0, length((p - c) / s)); }
void main(){ vec2 p = (vUv - 0.5) * 2.0;
  float a = lobe(p, vec2(0.0, -0.05), vec2(0.95, 0.5)); a = max(a, lobe(p, vec2(-0.45, 0.0), vec2(0.5, 0.6)));
  a = max(a, lobe(p, vec2(0.2, 0.2), vec2(0.55, 0.62))); a = max(a, lobe(p, vec2(0.55, -0.05), vec2(0.45, 0.42)));
  a = a * a * (3.0 - 2.0 * a);
  float l = smoothstep(-0.55, 0.65, dot(p, vSun));
  vec3 col = mix(shd, lit, l) * vT;
  gl_FragColor = vec4(col, a * 0.92);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` });
  const quad = new THREE.PlaneGeometry(1, 1);
  const cloudPos = [];
  // upper ring clusters
  for (let c = 0; c < 15; c++) {
    const ang = rnd() * TAU, dist = rr(260, 415), cy = rr(20, 150);
    const n = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) cloudPos.push([Math.cos(ang) * dist + rr(-40, 40), cy + rr(-8, 8), Math.sin(ang) * dist + rr(-40, 40), rr(55, 120), rr(24, 48), 1]);
  }
  // cloud sea below
  for (let i = 0; i < 70; i++) {
    const ang = rnd() * TAU, dist = Math.sqrt(rnd()) * 400;
    cloudPos.push([Math.cos(ang) * dist, rr(-150, -95), Math.sin(ang) * dist, rr(90, 190), rr(34, 70), 0.97]);
  }
  const clouds = new THREE.InstancedMesh(quad, puffMat, cloudPos.length); clouds.frustumCulled = false;
  cloudPos.forEach((c, i) => {
    _m.compose(_p.set(c[0], c[1], c[2]), _q.identity(), _s.set(c[3], c[4], 1)); clouds.setMatrixAt(i, _m);
    _c1.setRGB(c[5], c[5] * (0.98 + rnd() * 0.02), 1); clouds.setColorAt(i, _c1);
  });
  clouds.renderOrder = -50; root.add(clouds);

  // ---------------------------------------------------------------- distant mountains + islands
  {
    const layers = [{ r: 418, base: -150, amp: 70, off: 40, top: 0x9fa9de, bot: 0xe6d2ea, seed: 1 }, { r: 405, base: -150, amp: 52, off: 10, top: 0xb7aee4, bot: 0xecd7e8, seed: 2 }, { r: 392, base: -150, amp: 34, off: -25, top: 0xcdbfe9, bot: 0xf1dbe6, seed: 3 }];
    const N = 180;
    layers.forEach((L) => {
      const pos = [], col = [], idx = [];
      const ct = new THREE.Color(L.top), cb = new THREE.Color(L.bot);
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU;
        const x = Math.cos(a), z = Math.sin(a);
        const n1 = 0.5 * Math.abs(Math.sin(a * 7 + L.seed)) + 0.3 * Math.abs(Math.sin(a * 17 + L.seed * 2)) + 0.2 * Math.abs(Math.sin(a * 41 + L.seed * 5));
        const hgt = L.base + L.off + 105 + n1 * L.amp * 1.2 - L.amp * 0.5;
        pos.push(x * L.r, L.base, z * L.r, x * L.r, hgt, z * L.r);
        col.push(cb.r, cb.g, cb.b, ct.r, ct.g, ct.b);
        if (i < N) { const a0 = i * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      B.mtn.geos.push(g);
    });
  }

  // ---------------------------------------------------------------- shared placement lists
  const treeList = []; // [x,y,z,s,ry,colorIdx]
  const tree = (x, y, z, s = 1, ry = rnd() * TAU) => treeList.push([x, y, z, s, ry, rnd()]);
  const bushes = (x, y, z, r, hex) => {
    const col = new THREE.Color(hex);
    B.fol.add(pick(bushGeos), (o, wx, wy) => { o.copy(col).lerp(_c2.set(PAL.gA), clamp((wy - y) / (r * 1.4)) * 0.6); }, { x, y: y + r * 0.25, z, s: r, ry: rnd() * TAU });
  };
  const lawn = (x, y, z, r, tintA = PAL.gA, tintB = PAL.gB) => {
    const a = new THREE.Color(tintA), b = new THREE.Color(tintB);
    B.fol.add(lawnGeo, (o, wx, wy, wz) => { const d = Math.hypot(wx - x, wz - z) / r; o.copy(a).lerp(b, clamp(d * d * 1.2 + (vn(wx * 0.2, 0, wz * 0.2) - 0.5) * 0.5)); }, { x, y, z, sx: r, sy: Math.min(1.6, r * 0.06), sz: r });
  };
  const vine = (x, y, z, len) => {
    const i = len < 6 ? 0 : len < 11 ? 1 : 2; vineList[i].push([x, y, z, len / [4, 8, 14][i], rnd() * TAU]);
  };
  const crystalList = []; // [x,y,z,w,h,quat,hue]
  const fallList = [];
  const clockParts = [];
  const hubTop = [];

  // garden filler on a deck
  function garden(x, cy, z, R, o = {}) {
    const nb = Math.floor(R * (o.bush ?? 0.35));
    for (let i = 0; i < nb; i++) {
      const a = rnd() * TAU, d = R * rr(0.12, 0.8);
      bushes(x + Math.cos(a) * d, cy + 0.2, z + Math.sin(a) * d, rr(0.7, 1.7), pick([PAL.gB, PAL.gC, PAL.gA]));
    }
    const nt = o.trees ?? Math.floor(R / 7);
    for (let i = 0; i < nt; i++) {
      const a = (i / nt) * TAU + rr(-0.3, 0.3), d = R * rr(0.45, 0.78);
      tree(x + Math.cos(a) * d, cy + 0.3, z + Math.sin(a) * d, rr(0.9, 1.5) * (o.treeScale ?? 1));
    }
  }

  // mushroom saucer profile (bottom -> top)
  function saucer(R, d, L, stemR, tip, lod = 1) {
    const pts = [];
    if (tip) { pts.push([0.2, -d - L - 8], [stemR * 0.45, -d - L - 1], [stemR * 0.7, -d - L * 0.55], [stemR * 0.92, -d - L * 0.18]); }
    else { pts.push([stemR * 2.0, -d - L], [stemR * 1.3, -d - L * 0.86], [stemR * 1.08, -d - L * 0.5]); }
    pts.push([stemR, -d]);
    const r0 = stemR / R;
    const ns = [4, 6, 8][lod];
    for (let i = 1; i <= ns; i++) {
      const rho = r0 + (0.985 - r0) * (i / ns);
      pts.push([R * rho, -d * Math.pow(1 - rho, 1.55)]);
    }
    pts.push([R * 0.995, -0.75], [R, -0.25], [R, 0.1], [R * 0.98, 0.18], [R * 0.9, 0.04], [0, 0]);
    return lathe(pts, [20, 28, 36][lod]);
  }
  const rimTorus = {};
  function deck(x, y, z, R, d, L, stemR, o = {}) {
    const lod = o.lod ?? 2;
    const g = saucer(R, d, L, stemR, o.tip, lod);
    displace(g, o.rough ?? 0.9, 0.12, (px, py) => (py < -1.5 ? 1 : 0), x * 0.1);
    const cA = o.cream ?? PAL.cream;
    B.stone.add(g, (out, wx, wy, wz, nx, ny, nz) => {
      shade(cA, 0.6, 0.05)(out, wx, wy, wz, nx, ny, nz);
      const t = smooth(y - d * 0.55, y - d * 1.4, wy); out.lerp(_c2.set(PAL.rockBot), t * 0.7 * (1 - clamp(ny * 2)));
    }, { x, y, z });
    const key = Math.round(R * 10);
    B.glow.add(rimTorus[key + '_' + lod] ??= torusGeo(R * 0.992, 0.2, [20, 28, 40][lod], 3), o.glowFn ?? goldGlow, { x, y: y + 0.12, z });
    if (lod > 0) B.stone.add(rimTorus['p' + key + lod] ??= torusGeo(R * 0.965, 0.42, [0, 24, 36][lod], 4), stone(PAL.white, 0.3), { x, y: y + 0.4, z });
  }

  // mushroom tower
  function tower(x, y, z, o = {}) {
    const tiers = o.tiers ?? [{ r: 28, d: 11 }, { r: 18, d: 7, up: 9 }, { r: 9.5, d: 5, up: 8 }];
    const bottom = o.bottom ?? -135;
    let cy = y; const stemR = o.stem ?? 2.2;
    const decks = [];
    tiers.forEach((t, i) => {
      if (i > 0) cy += t.up;
      const L = i === 0 ? (cy - t.d) - bottom : t.up;
      deck(x, cy, z, t.r, t.d, L, stemR * (1 - i * 0.2), { tip: i === 0, cream: o.cream, glowFn: o.glowFn, rough: o.rough, lod: o.detail === 0 ? 0 : (o.lod ?? 2) });
      lawn(x, cy + 0.15, z, t.r * 0.82, o.lawnA, o.lawnB);
      if (o.detail !== 0) garden(x, cy + 0.3, z, t.r * 0.82, { trees: o.trees?.[i], bush: o.bush, treeScale: o.treeScale });
      decks.push({ r: t.r, y: cy });
    });
    const top = decks[decks.length - 1];
    if (o.pavilion !== false && top.r > 7) pavilion(x, top.y + 0.2, z, Math.min(top.r * 0.55, 6.2), o.dome);
    // hanging vines below rims
    if (o.detail !== 0) decks.forEach((dk, i) => {
      const n = Math.floor(dk.r * 0.3);
      for (let k = 0; k < n; k++) { const a = rnd() * TAU; vine(x + Math.cos(a) * dk.r * 0.96, dk.y - 0.4 - rnd() * 0.6, z + Math.sin(a) * dk.r * 0.96, rr(3, 14)); }
    });
    return decks;
  }

  function pavilion(x, y, z, r, domeHex = 0xffe3f1) {
    const n = 8; const col = columnGeo(r * 0.9, r * 0.045, 6, true);
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; B.stone.add(col, stone(PAL.white, 0.3), { x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r }); }
    B.stone.add(torusGeo(r, r * 0.05, 40, 6), stone(PAL.white, 0.3), { x, y: y + r * 0.9, z });
    B.stone.add(torusGeo(r, r * 0.06, 40, 6), stone(PAL.cream, 0.3), { x, y: y + 0.12, z });
    B.glow.add(G.dome, flat(domeHex), { x, y: y + r * 0.9, z, s: r * 0.98 });
    B.stone.add(G.dome, stone(PAL.white, 0.2), { x, y: y + r * 0.9 + r * 0.98, z, s: r * 0.22 });
    B.stone.add(lathe([[r * 0.12, 0], [r * 0.05, r * 0.5], [0.0, r * 1.3]], 8), stone(PAL.white, 0.2), { x, y: y + r * 0.9 + r * 1.15, z });
  }

  function spire(x, y, z, h, r, o = {}) {
    const pts = [[r * 2.4, -2], [r * 2.4, 0], [r * 1.6, h * 0.04], [r * 1.2, h * 0.12], [r, h * 0.3], [r * 0.78, h * 0.55], [r * 0.5, h * 0.8], [r * 0.2, h * 0.94], [0, h]];
    B.stone.add(lathe(pts, 10), stone(o.hex ?? PAL.white, 0.5), { x, y, z });
    const collar = (o.bronze ? B.bronze : B.stone);
    [0.3, 0.55, 0.78].forEach((t, i) => {
      const rad = [r, r * 0.78, r * 0.5][i] * 1.02;
      collar.add(torusGeo(rad, rad * 0.28, 8, 4), o.bronze ? grad(0, PAL.bronze, 1, PAL.gold) : stone(PAL.cream, 0.3), { x, y: y + h * t, z });
    });
    if (o.bronze) B.bronze.add(G.oct, grad(y + h * 0.9, PAL.bronze, y + h, PAL.gold), { x, y: y + h * 0.88, z, sx: r * 0.5, sy: r * 1.1, sz: r * 0.5 });
    B.glow.add(G.ico0, o.tip ?? goldGlow, { x, y: y + h * 0.985, z, s: Math.max(0.4, r * 0.32) });
    if (o.sats) for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + rnd(), d = r * 2.4; const hh = h * rr(0.28, 0.4);
      B.stone.add(lathe([[r * 0.7, -1], [r * 0.55, hh * 0.3], [r * 0.3, hh * 0.75], [0, hh]], 8), stone(PAL.cream, 0.4), { x: x + Math.cos(a) * d, y, z: z + Math.sin(a) * d });
    }
  }

  // sweeping arch between two ground points (a,b: THREE.Vector3)
  function arch(a, b, rise, w, hh, bucket = B.stone, cf = stone(PAL.white, 0.45), vines = 0, lean = 0) {
    const pts = []; const dir = new THREE.Vector3().subVectors(b, a); const nrm = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    for (let i = 0; i <= 10; i++) {
      const t = i / 10; const s = Math.sin(t * PI);
      const p = new THREE.Vector3().lerpVectors(a, b, t); p.y += rise * Math.pow(s, 0.72); p.addScaledVector(nrm, lean * s); pts.push(p);
    }
    bucket.add(sweep(pts, nrm, (t) => w * (0.85 + 0.8 * Math.pow(Math.abs(2 * t - 1), 2.4)), (t) => hh * (0.9 + 0.5 * Math.pow(Math.abs(2 * t - 1), 2)), 22, 8), cf);
    const cv = new THREE.CatmullRomCurve3(pts);
    for (let i = 0; i < vines; i++) { const t = rr(0.15, 0.85); const p = cv.getPointAt(t); vine(p.x + rr(-0.4, 0.4), p.y - w * 0.4, p.z + rr(-0.4, 0.4), rr(3, 11)); }
  }

  // ---------------------------------------------------------------- PLAZA
  const plazaR = 62;
  {
    const g = new THREE.CircleGeometry(plazaR, 128); g.rotateX(-PI / 2);
    const col = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, matPlaza); m.frustumCulled = false; root.add(m);
    // body
    const pts = [[3, -170], [6, -130], [9, -95], [14, -62], [24, -38], [40, -20], [57, -9], [69, -3.5], [74, -1.2], [74.8, -0.5], [74, -0.05], [0, -0.05]];
    const body = lathe(pts, 56); displace(body, 4, 0.05, (px, py, pz) => smooth(-3, -25, py), 3);
    B.stone.add(body, (o, wx, wy, wz, nx, ny, nz) => {
      shade(PAL.cream, 0.5)(o, wx, wy, wz, nx, ny, nz);
      o.lerp(_c2.set(PAL.rockTop), smooth(-1.5, -9, wy)); o.lerp(_c2.set(PAL.rockBot), smooth(-12, -75, wy) * 0.85);
    });
    // lawn ring 62..72
    const lp = [[73.4, 0.1], [71.5, 0.3], [69, 0.55], [66, 0.6], [63, 0.35], [61.6, 0.02]];
    const lg = lathe([[73.6, -0.1], ...lp, [61.6, -0.1]], 128);
    B.fol.add(lg, (o, wx, wy, wz) => { o.set(PAL.gA).lerp(_c2.set(PAL.gB), clamp(vn(wx * 0.12, 0, wz * 0.12) * 1.3 - 0.2)); });
    B.stone.add(torusGeo(61.9, 0.55, 128, 6), stone(PAL.white, 0.3), { y: 0.1 });
    B.stone.add(torusGeo(74.2, 0.9, 128, 6), stone(PAL.white, 0.3), { y: 0.1 });
    B.glow.add(torusGeo(73.8, 0.16, 128, 4), goldGlow, { y: 0.95 });
    // under-rim glow ring
    B.glow.add(torusGeo(70, 0.22, 96, 4), pinkGlow, { y: -3.4 });
    // vines around rim
    for (let i = 0; i < 34; i++) { const a = rnd() * TAU; vine(Math.cos(a) * 73.6, -1.2, Math.sin(a) * 73.6, rr(5, 16)); }
    // planters inside plaza
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.13, px = Math.cos(a) * 39, pz = Math.sin(a) * 39;
      if (Math.abs(px) < 21 && pz < 12) continue;
      B.stone.add(lathe([[0, 0], [2.0, 0], [2.3, 0.5], [2.3, 1.1], [2.0, 1.25], [0, 1.25]], 16), stone(PAL.cream, 0.3), { x: px, y: 0, z: pz });
      B.fol.add(lawnGeo, flat(PAL.gB), { x: px, y: 1.2, z: pz, sx: 2.0, sy: 1.0, sz: 2.0 });
      tree(px, 1.2, pz, 0.7);
    }
    // outer lawn trees & bushes
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + rr(-0.05, 0.05), d = rr(64, 71);
      tree(Math.cos(a) * d, 0.35, Math.sin(a) * d, rr(1.0, 1.7));
      bushes(Math.cos(a + 0.05) * (d - 2), 0.4, Math.sin(a + 0.05) * (d - 2), rr(0.9, 1.7), pick([PAL.gB, PAL.gC]));
    }
    // arcade: 16 columns pairs + arches at r=56
    const nA = 16, rA = 55;
    const col2 = columnGeo(9.5, 0.55, 10);
    for (let i = 0; i < nA; i++) {
      const a0 = (i / nA) * TAU, a1 = ((i + 1) / nA) * TAU;
      const p0 = new THREE.Vector3(Math.cos(a0) * rA, 9.2, Math.sin(a0) * rA), p1 = new THREE.Vector3(Math.cos(a1) * rA, 9.2, Math.sin(a1) * rA);
      B.stone.add(col2, stone(PAL.white, 0.35), { x: p0.x, y: 0, z: p0.z });
      arch(p0, p1, 9, 0.55, 0.7, B.stone, stone(PAL.white, 0.45), 4);
      const mid = p0.clone().lerp(p1, 0.5); mid.y += 9 * 0.95;
      B.glow.add(G.ico1, goldGlow, { x: mid.x, y: mid.y - 3.4, z: mid.z, s: 0.38 });
    }
    // giant sweeping arches
    const nG = 7, rG = 74;
    for (let i = 0; i < nG; i++) {
      const a0 = (i / nG) * TAU + 0.1, a1 = ((i + 1) / nG) * TAU + 0.1;
      const p0 = new THREE.Vector3(Math.cos(a0) * rG, 0, Math.sin(a0) * rG), p1 = new THREE.Vector3(Math.cos(a1) * rG, 0, Math.sin(a1) * rG);
      [p0, p1].forEach((p) => { B.stone.add(lathe([[3.6, -6], [3.0, 0], [2.2, 4], [1.6, 11], [1.45, 22]], 12), stone(PAL.white, 0.4), { x: p.x, y: 0, z: p.z }); });
      p0.y = 0; p1.y = 0;
      arch(p0, p1, i % 2 ? 36 : 46, 1.5, 1.25, B.stone, stone(PAL.white, 0.5), 6, i % 2 ? 6 : -6);
    }
  }

  // ---------------------------------------------------------------- towers (scenery + hero)
  const reserved = [];
  const T = (x, y, z, o) => { reserved.push([x, z, (o?.tiers?.[0]?.r ?? 28) + 12]); return tower(x, y, z, o); };
  const decksA = T(-92, 3, -108, { tiers: [{ r: 28, d: 11 }, { r: 18, d: 7, up: 10 }, { r: 10, d: 5, up: 9 }] });
  fallList.push({ x: -92 + 28 * 0.7, y: 2.6, z: -108 + 28 * 0.7, ang: PI * 0.25, w: 9, h: 95, bow: 3, tint: 0 });
  T(94, 2, -125, { tiers: [{ r: 25, d: 10 }, { r: 16, d: 6, up: 9 }, { r: 8.5, d: 4, up: 8 }] });
  fallList.push({ x: 94 - 25 * 0.72, y: 1.6, z: -125 + 25 * 0.7, ang: PI * 0.75, w: 7, h: 85, bow: 2.5, tint: 0 });
  T(48, -6, -88, { tiers: [{ r: 16, d: 7 }, { r: 10, d: 4, up: 7 }], pavilion: false, bottom: -120 });
  T(-50, -2, -72, { tiers: [{ r: 17, d: 7 }, { r: 10, d: 4, up: 7 }], bottom: -120 });
  T(165, 22, 28, { tiers: [{ r: 26, d: 10 }, { r: 15, d: 6, up: 9 }], bottom: -130 });
  T(-150, 12, 62, { tiers: [{ r: 24, d: 10 }, { r: 14, d: 6, up: 9 }, { r: 7, d: 4, up: 8 }], bottom: -130 });
  T(28, -10, 128, { tiers: [{ r: 24, d: 10 }, { r: 14, d: 6, up: 9 }], bottom: -130 });
  T(-85, -4, 125, { tiers: [{ r: 20, d: 8 }, { r: 12, d: 5, up: 8 }], bottom: -130 });
  T(100, 0, 105, { tiers: [{ r: 18, d: 8 }, { r: 10, d: 5, up: 8 }], bottom: -130 });
  // far towers (cheap)
  for (let i = 0; i < 11; i++) {
    let x, z, ok, tries = 0;
    do { const a = rnd() * TAU, d = rr(230, 390); x = Math.cos(a) * d; z = Math.sin(a) * d; ok = reserved.every((r) => Math.hypot(x - r[0], z - r[1]) > r[2] + 40); tries++; } while (!ok && tries < 40);
    if (!ok) continue;
    const r0 = rr(14, 26), y = rr(-10, 55);
    T(x, y, z, { tiers: [{ r: r0, d: r0 * 0.4 }, { r: r0 * 0.62, d: r0 * 0.25, up: r0 * 0.34 }], detail: 0, bottom: -140 });
    if (rnd() < 0.7) spire(x + rr(-6, 6), y + r0 * 0.5, z + rr(-6, 6), rr(40, 90), 1.5, { sats: true });
  }

  // tall slender spires in the distance
  const spireSpots = [[-30, -2, -300], [30, 5, -280], [-120, 20, -250], [150, 25, -150], [-200, 5, -140], [210, 10, 0], [-210, 10, 40], [-40, 0, 230], [120, 0, 200], [-160, 10, 150], [200, 15, -60], [-250, 30, -200], [240, 30, -220]];
  spireSpots.forEach(([x, y, z]) => {
    const h = rr(70, 125);
    B.stone.add(deckBase(rr(8, 12)), stone(PAL.cream, 0.5), { x, y: y - 1, z });
    spire(x, y, z, h, rr(1.6, 2.6), { sats: true });
    spire(x + rr(-9, 9), y, z + rr(-9, 9), h * rr(0.45, 0.65), 1.2, {});
  });
  function deckBase(r) { return lathe([[0.2, -26], [r * 0.18, -14], [r * 0.5, -3], [r, -0.3], [r, 0.2], [0, 0.2]], 14); }

  function giantTree(x, y, z) {
    const V = THREE.Vector3; const nz = new V(0, 0, 1);
    B.fol.add(sweep([new V(0, -1, 0), new V(0.8, 6, 0.3), new V(-0.4, 12, -0.2), new V(0.6, 17, 0.3)], nz, (t) => 1.4 - 0.8 * t, (t) => 1.4 - 0.8 * t, 10, 8), grad(y, 0x8a6a62, y + 18, 0xb88f8a), { x, y, z });
    const blobs = [displace(ico2.clone(), 0.42, 1.2, null, 1), displace(ico2.clone(), 0.42, 1.3, null, 5), displace(ico2.clone(), 0.42, 1.1, null, 9)];
    const cols = [0xff9fd0, 0xff86c0, 0xffc0dd, 0xe86aaa];
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * TAU + 0.4, d = i < 8 ? rr(3, 6.5) : 0, cy = y + (i < 8 ? rr(14.5, 19) : 21.5), sz = i < 8 ? rr(5.5, 7.2) : 7;
      const c0 = new THREE.Color(cols[i % 4]);
      const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
      B.fol.add(blobs[i % 3], (o, wx, wy) => { o.copy(c0).lerp(_c2.set(PAL.pinkL), clamp((wy - cy) / sz) * 0.5 + 0.1); o.lerp(_c2.set(PAL.mag), clamp((cy - wy) / sz) * 0.25); }, { x: bx, y: cy, z: bz, sx: sz, sy: sz * 0.8, sz, ry: rnd() * TAU });
      if (i < 8) B.fol.add(sweep([new V(x + 0.4, y + 13, z), new V((x + bx) / 2, y + 15.5, (z + bz) / 2), new V(bx, cy - 2, bz)], new V(-Math.sin(a), 0, Math.cos(a)), (t) => 0.55 - 0.3 * t, (t) => 0.55 - 0.3 * t, 5, 6), flat(0xa07c76));
    }
    for (let i = 0; i < 20; i++) { const a = rnd() * TAU; vine(x + Math.cos(a) * rr(3, 8), y + rr(15, 19), z + Math.sin(a) * rr(3, 8), rr(4, 10)); }
  }

  // ---------------------------------------------------------------- Bloom Gardens
  const bloom = { x: 130, y: 10, z: -70 };
  {
    const tiers = [{ r: 34, d: 14 }, { r: 25, d: 10, up: 8 }, { r: 17, d: 8, up: 8 }, { r: 9, d: 5, up: 7 }];
    const dk = tower(bloom.x, bloom.y, bloom.z, { tiers, trees: [16, 11, 8, 4], pavilion: false, treeScale: 1.2, lawnA: 0xa8dc78, bottom: -130, glowFn: pinkGlow });
    const top = dk[3];
    // giant blossom tree
    giantTree(bloom.x, top.y + 0.3, bloom.z);
    // extra blossom arbors on lowest tier
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + 0.4, a2 = a + 0.28;
      const p0 = new THREE.Vector3(bloom.x + Math.cos(a) * 27, bloom.y + 0.3, bloom.z + Math.sin(a) * 27), p1 = new THREE.Vector3(bloom.x + Math.cos(a2) * 27, bloom.y + 0.3, bloom.z + Math.sin(a2) * 27);
      arch(p0, p1, 8, 0.4, 0.5, B.stone, stone(PAL.white, 0.4), 5);
    }
    // waterfalls cascading from tiers (facing plaza -x/+z)
    fallList.push({ x: bloom.x - 34 * 0.8, y: bloom.y + 0.8, z: bloom.z + 34 * 0.6, ang: PI * 0.8, w: 10, h: 90, bow: 3, tint: 1 });
    fallList.push({ x: bloom.x - 25 * 0.75, y: dk[1].y + 0.6, z: bloom.z - 25 * 0.66, ang: PI * 1.2, w: 6, h: 70, bow: 2.5, tint: 1 });
    // two spires + hearts of garden
    spire(bloom.x + 12, dk[2].y, bloom.z - 8, 40, 1.4, { sats: true, tip: pinkGlow });
  }

  // ---------------------------------------------------------------- Clockwork Spires
  const clock = { x: -150, y: 35, z: -60 };
  const clockRoot = new THREE.Group();
  const clockDir = new THREE.Vector3(-0.0 - clock.x, 0, -clock.z).normalize(); // toward plaza
  let clockMeshes = [];
  {
    const dk = tower(clock.x, clock.y, clock.z, { tiers: [{ r: 32, d: 13 }, { r: 21, d: 8, up: 7 }], bottom: -135, glowFn: goldGlow, cream: PAL.ivory, detail: 1, pavilion: false, trees: [6, 3] });
    // bronze trim ring
    B.bronze.add(torusGeo(32, 0.7, 60, 6), grad(0, PAL.bronze, 1, PAL.gold), { x: clock.x, y: clock.y + 0.6, z: clock.z });
    B.bronze.add(torusGeo(21, 0.55, 48, 6), grad(0, PAL.bronze, 1, PAL.gold), { x: clock.x, y: dk[1].y + 0.5, z: clock.z });
    const side = new THREE.Vector3(-clockDir.z, 0, clockDir.x);
    // spires
    const topY = dk[1].y;
    [-1, 1].forEach((sgn) => {
      const sx = clock.x + side.x * sgn * 27, sz = clock.z + side.z * sgn * 27;
      spire(sx, topY, sz, 118, 2.3, { bronze: true, hex: PAL.ivory, sats: true, tip: tealGlow });
    });
    for (let i = 0; i < 5; i++) {
      const a = Math.atan2(-clockDir.z, -clockDir.x) + (i - 2) * 0.5, d = 17; const bx = clock.x + Math.cos(a) * d, bz = clock.z + Math.sin(a) * d;
      spire(bx, topY, bz, rr(45, 85), 1.6, { bronze: i % 2 === 0, hex: PAL.ivory });
    }
    for (let i = 0; i < 6; i++) { const a = Math.atan2(-clockDir.z, -clockDir.x) + (i - 2.5) * 0.45; spire(clock.x + Math.cos(a) * 31, clock.y + 0.4, clock.z + Math.sin(a) * 31, rr(22, 38), 1.0, { bronze: true, hex: PAL.ivory }); }
    // clock assembly
    const cy = topY + 52;
    clockRoot.position.set(clock.x, cy, clock.z);
    clockRoot.lookAt(clock.x + clockDir.x, cy, clock.z + clockDir.z);
    const q = clockRoot.quaternion.clone();
    // static: dial + ticks + side braces (world-space merge)
    const L = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(clockRoot.position);
    const dialG = new THREE.CylinderGeometry(15, 15, 0.9, 40); dialG.rotateX(PI / 2);
    B.stone.add(dialG, flat(0xfff6e4), { q, x: clockRoot.position.x, y: cy, z: clockRoot.position.z });
    B.glow.add(new THREE.CylinderGeometry(7, 7, 1.2, 32).rotateX(PI / 2), flat(0xfff0cf), { q, x: clockRoot.position.x, y: cy, z: clockRoot.position.z });
    const tickG = new THREE.BoxGeometry(0.6, 3, 0.5);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const p = L(Math.cos(a) * 12.2, Math.sin(a) * 12.2, 0.7); _e.set(0, 0, a - PI / 2); const qq = q.clone().multiply(new THREE.Quaternion().setFromEuler(_e)); B.bronze.add(tickG, grad(0, PAL.bronze, 1, PAL.gold), { q: qq, x: p.x, y: p.y, z: p.z, sx: i % 3 === 0 ? 1.8 : 1, sy: i % 3 === 0 ? 1.4 : 1 }); }
    const a = L(-27, 0, 0), b = L(-14.5, 0, 0), c = L(27, 0, 0), d = L(14.5, 0, 0);
    B.bronze.beam(G.beamT, a, b, 1.3, flat(PAL.bronze)); B.bronze.beam(G.beamT, c, d, 1.3, flat(PAL.bronze));
    // rotating parts
    const gearShape = (R, teeth, hole, depth) => {
      const sh = new THREE.Shape(); const n = teeth * 4;
      for (let i = 0; i < n; i++) { const t = (i / n) * TAU; const k = i % 4; const rad = (k === 1 || k === 2) ? R : R * 0.9; const a2 = t - 0.0; if (i === 0) sh.moveTo(Math.cos(a2) * rad, Math.sin(a2) * rad); else sh.lineTo(Math.cos(a2) * rad, Math.sin(a2) * rad); }
      sh.closePath();
      const hp = new THREE.Path(); hp.absarc(0, 0, hole, 0, TAU, true); sh.holes.push(hp);
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 1, curveSegments: 24 });
      g.translate(0, 0, -depth / 2); return g;
    };
    const mk = (geoList, speed, z) => {
      const bk = new Bucket();
      geoList.forEach(([g, cf, o]) => bk.add(g, cf, o || {}));
      const m = bk.mesh(matBronze); m.matrixAutoUpdate = true; m.position.z = z; m.userData.speed = speed; clockRoot.add(m); clockMeshes.push(m);
    };
    const bz = grad(-20, PAL.bronze, 20, PAL.gold);
    mk([[torusGeo(24, 0.9, 64, 6).rotateX(-PI / 2), bz], [gearShape(20.5, 36, 18.8, 1.4), bz, {}]], 0.03, 0.4);
    mk([[gearShape(17, 28, 14.5, 1.2), bz, {}]], -0.045, 1.2);
    const spokeG = new THREE.BoxGeometry(1, 1, 1);
    const spokes = []; for (let i = 0; i < 6; i++) { const a2 = (i / 6) * TAU; spokes.push([spokeG, bz, { rz: a2, x: Math.cos(a2) * 8.5, y: Math.sin(a2) * 8.5, sx: 17, sy: 0.8, sz: 0.8 }]); }
    // spokes: centered on axis, rotated
    const sp2 = []; for (let i = 0; i < 3; i++) sp2.push([spokeG, bz, { rz: (i / 3) * PI, sx: 36, sy: 0.9, sz: 0.9 }]);
    mk([[gearShape(11, 18, 9.5, 1.0), bz, {}], ...sp2.slice(0, 0)], 0.07, 2.0);
    // hands
    const handG = new THREE.CylinderGeometry(0.3, 0.8, 1, 4);
    mk([[handG, flat(0xd79a52), { sx: 1.2, sy: 10.5, sz: 0.6, y: 5.2 }], [G.ico1, flat(PAL.gold), { s: 1.3 }]], -0.02, 3.2);
    mk([[handG, flat(0xe9b86a), { sx: 0.8, sy: 14, sz: 0.5, y: 7 }]], 0.005, 2.6);
    root.add(clockRoot);
    fallList.push({ x: clock.x + clockDir.x * 30, y: clock.y + 0.8, z: clock.z + clockDir.z * 30, ang: Math.atan2(clockDir.z, clockDir.x) + 0.0, w: 7, h: 110, bow: 3, tint: 0, raw: true });
  }

  // ---------------------------------------------------------------- Prism Falls
  const prism = { x: 70, y: 20, z: -210 };
  {
    const cliffs = [
      { dx: 0, dy: 0, dz: 0, r: 30, depth: 85 }, { dx: -38, dy: 12, dz: 14, r: 18, depth: 60 }, { dx: 34, dy: -9, dz: -14, r: 20, depth: 65 },
    ];
    cliffs.forEach((c, ci) => {
      const cx = prism.x + c.dx, cy = prism.y + c.dy, cz = prism.z + c.dz;
      const pts = []; for (let k = 10; k >= 0; k--) { const t = k / 10; pts.push([c.r * Math.pow(1 - Math.pow(t, 1.25), 0.78) + 0.2, -c.depth * t]); }
      pts.push([c.r * 0.98, 0.5], [c.r * 0.6, 1.2], [0, 1.2]);
      const g = lathe(pts, 30); displace(g, c.r * 0.34, 0.14, (px, py) => 0.5 + 0.5 * smooth(0, -20, py), ci * 5);
      B.rock.add(g, (o, wx, wy, wz, nx, ny) => {
        o.set(PAL.rockTop).lerp(_c2.set(0xcdb9de), clamp((cy - wy) / c.depth * 1.3)); o.lerp(_c2.set(PAL.rockBot), smooth(0.45, 1, (cy - wy) / c.depth) * 0.8);
        const st = vn(wx * 0.6, wy * 0.15, wz * 0.6); o.multiplyScalar(0.92 + st * 0.14); o.lerp(_c2.set(0xf0c4b4), (0.5 + 0.5 * Math.sin(wy * 0.4 + st * 4)) * 0.28 * (1 - smooth(0.5, 1, (cy - wy) / c.depth)));
        const moss = (cy - wy) < 3 + vn(wx * 0.3, 0, wz * 0.3) * 9; if (moss) o.lerp(_c2.set(PAL.gB), 0.75 * (1 - clamp((cy - wy) / 12)));
      }, { x: cx, y: cy, z: cz });
      lawn(cx, cy + 1.1, cz, c.r * 0.95, 0xa8e0a0, 0x62b49a);
      // crystals on top and sides
      const nc = 26 + c.r * 1.0;
      for (let i = 0; i < nc; i++) {
        const a = rnd() * TAU, d = c.r * Math.sqrt(rnd()) * 0.92; const h = rr(2.5, 9) * (c.r / 40 + 0.5);
        const tilt = rr(0, 0.5); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt));
        crystalList.push([cx + Math.cos(a) * d, cy + 1, cz + Math.sin(a) * d, rr(0.8, 1.9) * (h / 8 + 0.5), h, q, rnd()]);
      }
      for (let i = 0; i < 10; i++) { // sideways crystal buds
        const a = rnd() * TAU, ty = rr(-c.depth * 0.45, -2); const t = -ty / c.depth; const rad = c.r * Math.pow(1 - Math.pow(t, 1.25), 0.78);
        const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)).normalize());
        crystalList.push([cx + Math.cos(a) * rad * 0.92, cy + ty, cz + Math.sin(a) * rad * 0.92, rr(0.9, 1.8), rr(3, 8), q, rnd()]);
      }
      for (let i = 0; i < 4; i++) { const a = rnd() * TAU; tree(cx + Math.cos(a) * c.r * 0.6, cy + 1.2, cz + Math.sin(a) * c.r * 0.6, rr(1, 1.6)); }
      for (let i = 0; i < 14; i++) { const a = rnd() * TAU; vine(cx + Math.cos(a) * c.r * 0.96, cy + 0.5, cz + Math.sin(a) * c.r * 0.96, rr(4, 13)); }
    });
    // falls from the plaza-facing side of each cliff
    const f = (dx, dy, dz, r, ang, w, h) => fallList.push({ x: prism.x + dx + Math.cos(ang) * r * 0.96, y: prism.y + dy + 0.9, z: prism.z + dz + Math.sin(ang) * r * 0.96, ang, w, h, bow: 3.5, tint: 2 });
    f(0, 0, 0, 30, 1.9, 12, 120); f(0, 0, 0, 30, 1.2, 8, 100); f(-38, 12, 14, 18, 2.4, 7, 105); f(34, -9, -14, 20, 1.4, 8, 90);
  }
  const rainbowAnchor = new THREE.Vector3(prism.x - 10, prism.y - 70, prism.z + 55);

  // ---------------------------------------------------------------- Skyharbor
  const harbor = { x: -70, y: 55, z: -190 };
  const ships = []; const dockSlots = [];
  {
    const dk0 = deckAt(harbor.x, harbor.y, harbor.z, 28, 11, 80);
    deckAt(harbor.x - 38, harbor.y + 12, harbor.z + 14, 14, 6, 60);
    deckAt(harbor.x + 34, harbor.y - 8, harbor.z - 10, 12, 5, 60);
    function deckAt(x, y, z, R, d, L) { deck(x, y, z, R, d, L, 2.0, { tip: true, lod: 1 }); lawn(x, y + 0.15, z, R * 0.55); garden(x, y + 0.3, z, R * 0.55, { trees: 3 }); return y; }
    // control tower
    B.stone.add(lathe([[3.2, 0], [2.2, 4], [1.7, 14], [2.4, 20], [4.4, 22.5], [4.8, 24], [0, 25]], 14), stone(PAL.white, 0.4), { x: harbor.x + 4, y: harbor.y, z: harbor.z - 4 });
    B.glow.add(new THREE.TorusGeometry(4.6, 0.25, 4, 36).rotateX(PI / 2), goldGlow, { x: harbor.x + 4, y: harbor.y + 23, z: harbor.z - 4 });
    B.stone.add(G.dome, stone(PAL.white, 0.2), { x: harbor.x + 4, y: harbor.y + 24, z: harbor.z - 4, s: 4.2 });
    spire(harbor.x + 4, harbor.y + 28, harbor.z - 4, 22, 0.5, { tip: pinkGlow });
    // piers radiating, with mooring masts
    const piers = [[0.9, 40], [2.25, 34], [3.6, 38], [5.2, 32]];
    piers.forEach(([a, len], i) => {
      const ex = harbor.x + Math.cos(a) * len, ez = harbor.z + Math.sin(a) * len, ey = harbor.y + 0.3 + (i % 2) * 2;
      const s0 = new THREE.Vector3(harbor.x + Math.cos(a) * 20, harbor.y + 0.3, harbor.z + Math.sin(a) * 20), e0 = new THREE.Vector3(ex, ey, ez);
      B.stone.beam(G.beamT, s0, e0, 3.0, stone(PAL.cream, 0.5));
      B.glow.beam(G.beam, s0.clone().add(new THREE.Vector3(0, 0.4, 0)), e0.clone().add(new THREE.Vector3(0, 0.4, 0)), 0.18, goldGlow);
      B.stone.add(lathe([[0.7, 0], [0.45, 4], [0.3, 14], [0.0, 16]], 8), stone(PAL.white, 0.3), { x: ex, y: ey, z: ez });
      B.glow.add(G.ico0, pinkGlow, { x: ex, y: ey + 15.8, z: ez, s: 0.7 });
      B.stone.add(columnGeo(5, 0.3, 8), stone(PAL.white, 0.3), { x: (s0.x + ex) / 2, y: ey - 5.4, z: (s0.z + ez) / 2 }); // under-pier support
      dockSlots.push([ex + Math.cos(a) * 8, ey + 8 + (i % 2) * 2, ez + Math.sin(a) * 8, a]);
      for (let k = 0; k < 4; k++) vine(s0.x + (e0.x - s0.x) * rnd(), ey - 1, s0.z + (e0.z - s0.z) * rnd(), rr(3, 9));
    });
    fallList.push({ x: harbor.x + 28 * 0.8, y: harbor.y + 0.5, z: harbor.z + 28 * 0.6, ang: 0.64, w: 6, h: 105, bow: 2.5, tint: 0 });
    for (let i = 0; i < 24; i++) { const a = rnd() * TAU; vine(harbor.x + Math.cos(a) * 27, harbor.y - 0.5, harbor.z + Math.sin(a) * 27, rr(4, 13)); }
  }

  // airship builder
  function makeShip(scale = 1, hullHex = PAL.cream, stripe = PAL.pink) {
    const bk = new Bucket();
    const hull = new THREE.SphereGeometry(1, 22, 12); hull.scale(1, 1, 2.6);
    const sc = new THREE.Color(stripe), hc = new THREE.Color(hullHex);
    bk.add(hull, (o, wx, wy, wz, nx, ny, nz) => { o.copy(hc); const band = Math.sin(Math.atan2(wx, wy + 0.01) * 6); if (band > 0.55 && wy > -0.2) o.lerp(sc, 0.8); if (ny < -0.2) o.lerp(SHADOW, 0.35); }, { s: 3.4, sz: 3.4 });
    bk.add(new THREE.SphereGeometry(1, 10, 8), flat(PAL.gold), { y: -4.2, sx: 1.1, sy: 0.9, sz: 3.4 });
    bk.add(G.sph, flat(stripe), { y: 2.6, z: -9.2, sx: 0.12, sy: 2.6, sz: 2.6 });
    bk.add(G.sph, flat(stripe), { y: -2.6, z: -9.2, sx: 0.12, sy: 2.6, sz: 2.6 });
    bk.add(G.sph, flat(stripe), { z: -9.2, sx: 3.4, sy: 0.12, sz: 2.6 });
    bk.add(torusGeo(1.2, 0.18, 16, 4).rotateX(PI / 2), flat(PAL.gold), { z: -10.8, s: 1 });
    bk.add(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 4), flat(PAL.gold), { y: -2.3, z: 2, sx: 1, sy: 1 });
    bk.add(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 4), flat(PAL.gold), { y: -2.3, z: -2 });
    for (let i = 0; i < 5; i++) bk.add(G.ico0, flat(0xfff2c0), { x: ((i % 2) ? 0.6 : -0.6) * 1.0, y: -4.0, z: -2.2 + i * 1.1, s: 0.25 });
    const m = bk.mesh(matShip); m.scale.setScalar(scale); m.matrixAutoUpdate = true; return m;
  }
  const dockShips = dockSlots.slice(0, 3).map((s, i) => { const m = makeShip(rr(0.7, 0.95), pick([PAL.cream, PAL.ivory]), pick([PAL.pink, 0xa8c4ff, 0xffc890])); m.position.set(s[0], s[1], s[2]); m.rotation.y = -s[3] + PI / 2 + rr(-0.2, 0.2); m.userData.base = s[1]; m.userData.ph = i * 2.1; root.add(m); return m; });
  const cruisers = [0, 1].map((i) => { const m = makeShip(rr(1.2, 1.8), PAL.white, i ? 0xa8c4ff : PAL.pink); m.userData = { ang: i * PI + 1, R: 190 + i * 60, y: 38 + i * 30, spd: (i ? -0.012 : 0.016) }; root.add(m); return m; });

  // ---------------------------------------------------------------- Boss arena
  const boss = { x: 0, y: 70, z: -340, r: 60 };
  let bossHalo, bossShards;
  {
    const nP = 14;
    for (let i = 0; i < nP; i++) {
      const a = (i / nP) * TAU + 0.1, d = 50 + (i % 2) * 8, R = rr(8.5, 11), y = boss.y + Math.sin(i * 1.7) * 3.5;
      const x = boss.x + Math.cos(a) * d, z = boss.z + Math.sin(a) * d;
      deck(x, y, z, R, R * 0.55, 12, 1.2, { tip: true, rough: 1.2, glowFn: i % 2 ? pinkGlow : goldGlow, lod: 1 });
      lawn(x, y + 0.15, z, R * 0.6, 0xa8dc78, 0x62b49a);
      if (i % 3 === 0) { // broken arch
        const p0 = new THREE.Vector3(x - 4, y + 0.2, z), p1 = new THREE.Vector3(x + 4, y + 0.2, z);
        arch(p0, p1, 6, 0.5, 0.6, B.stone, stone(PAL.white, 0.45), 0);
      } else tree(x + rr(-2, 2), y + 0.3, z + rr(-2, 2), rr(0.9, 1.3));
      B.stone.add(columnGeo(rr(3, 6), 0.4, 8), stone(PAL.white, 0.4), { x: x + Math.cos(a + 1) * R * 0.5, y: y + 0.1, z: z + Math.sin(a + 1) * R * 0.5 });
    }
    for (let i = 0; i < 7; i++) { // inner stepping discs
      const a = (i / 7) * TAU + 0.3, d = 24, x = boss.x + Math.cos(a) * d, z = boss.z + Math.sin(a) * d, y = boss.y - 2 + (i % 2) * 2;
      deck(x, y, z, 4.5, 2.5, 6, 0.7, { tip: true, rough: 0.5, lod: 0 });
    }
    // glowing halo ring
    const hm = new THREE.MeshBasicMaterial({ color: 0xffe0b8, fog: true });
    bossHalo = new THREE.Mesh(new THREE.TorusGeometry(boss.r + 6, 1.0, 8, 128).rotateX(PI / 2), hm); bossHalo.position.set(boss.x, boss.y - 1, boss.z); root.add(bossHalo);
    const hm2 = new THREE.Mesh(new THREE.TorusGeometry(boss.r + 6, 2.4, 6, 128).rotateX(PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc6e2, transparent: true, opacity: 0.22, fog: true, depthWrite: false })); hm2.position.copy(bossHalo.position); root.add(hm2);
    bossHalo.userData.glow = hm2;
    // shards
    const sg = displace(G.ico1.clone(), 0.35, 1.2, null, 4); sg.scale(1, 1.4, 1);
    bossShards = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), 70);
    for (let i = 0; i < 70; i++) {
      const a = rnd() * TAU, d = rr(36, 80);
      _m.compose(_p.set(Math.cos(a) * d, rr(-12, 18), Math.sin(a) * d), _q.setFromEuler(_e.set(rnd() * 3, rnd() * 3, rnd() * 3)), _s.setScalar(rr(0.5, 1.9)));
      bossShards.setMatrixAt(i, _m); bossShards.setColorAt(i, _c1.set(pick([PAL.cream, PAL.rockTop, 0xd8c9f0, PAL.pinkL])));
    }
    bossShards.position.set(boss.x, boss.y, boss.z); bossShards.frustumCulled = false; root.add(bossShards);
  }

  // ---------------------------------------------------------------- floating islands below
  {
    const spots = []; let tries = 0;
    while (spots.length < 18 && tries++ < 300) {
      const a = rnd() * TAU, d = rr(40, 380), y = rr(-170, -45), r = rr(8, 26);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (reserved.some((q) => Math.hypot(x - q[0], z - q[1]) < q[2] + r + 6) || spots.some((s) => Math.hypot(x - s[0], z - s[2]) < r + s[3] + 20 && Math.abs(y - s[1]) < 30) || Math.hypot(x, z) < 80 && y > -100) continue;
      spots.push([x, y, z, r]);
    }
    spots.forEach(([x, y, z, r], i) => {
      const depth = r * rr(1.1, 1.7);
      const pts = []; for (let k = 9; k >= 0; k--) { const t = k / 9; pts.push([r * Math.pow(1 - Math.pow(t, 1.2), 0.75) + 0.15, -depth * t]); }
      pts.push([r * 0.97, 0.4], [r * 0.5, 0.9], [0, 0.9]);
      const g = lathe(pts, 16); displace(g, r * 0.25, 0.14, null, i * 3);
      B.rock.add(g, (o, wx, wy) => { o.set(PAL.rockTop).lerp(_c2.set(PAL.rockBot), clamp((y - wy) / depth)); }, { x, y, z });
      lawn(x, y + 0.8, z, r * 0.95, PAL.gA, PAL.gB);
      const nt = Math.floor(r / 5); for (let k = 0; k < nt; k++) { const a = rnd() * TAU, d = rnd() * r * 0.6; tree(x + Math.cos(a) * d, y + 0.9, z + Math.sin(a) * d, rr(0.9, 1.5)); }
      for (let k = 0; k < Math.floor(r / 4); k++) { const a = rnd() * TAU; vine(x + Math.cos(a) * r * 0.9, y + 0.2, z + Math.sin(a) * r * 0.9, rr(3, 12)); }
      if (r > 14) fallList.push({ x: x + r * 0.9, y: y + 1, z, ang: 0, w: 3.2, h: 60, bow: 1.5, tint: 0 });
    });
  }

  // ---------------------------------------------------------------- build static meshes
  [[B.stone, matStone], [B.bronze, matBronze], [B.fol, matFol], [B.rock, matRock], [B.glow, matGlow]].forEach(([b, m]) => { const mesh = b.mesh(m); if (mesh) root.add(mesh); });
  { const m = B.mtn.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide })); m.renderOrder = -90; root.add(m); }

  // blossom trees (instanced)
  {
    const bk = new Bucket();
    const trunkPts = [new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.18, 1.1, 0.05), new THREE.Vector3(0.05, 2.2, 0.15), new THREE.Vector3(0.35, 3.2, 0.1)];
    bk.add(sweep(trunkPts, new THREE.Vector3(0, 0, 1), (t) => 0.2 - 0.1 * t, (t) => 0.2 - 0.1 * t, 6, 6), grad(0, 0x8d6c60, 4, 0xb8908a));
    bk.add(sweep([new THREE.Vector3(0.1, 1.9, 0.1), new THREE.Vector3(-0.5, 2.6, 0.2), new THREE.Vector3(-1.1, 3.3, 0.3)], new THREE.Vector3(0, 0, 1), (t) => 0.1 - 0.05 * t, (t) => 0.1 - 0.05 * t, 4, 5), flat(0xa8827a));
    const cols = [PAL.pink, 0xff8ec4, PAL.pinkL, PAL.mag];
    const blobs = [[0.35, 4.3, 0.1, 1.7], [-1.2, 3.8, 0.4, 1.15], [1.4, 3.7, -0.3, 1.15]];
    blobs.forEach(([x, y, z, r], i) => {
      const g = displace(G.ico1.clone(), 0.3, 1.4, null, i * 3.1);
      const c0 = new THREE.Color(cols[i % 3]);
      bk.add(g, (o, wx, wy) => { o.copy(c0).lerp(_c2.set(PAL.pinkL), clamp((wy - 3.5) / 2.2) * 0.6); o.lerp(_c2.set(PAL.mag), clamp((4.0 - wy) / 1.8) * 0.35); }, { x, y, z, s: r });
    });
    const big = treeList.filter((t) => t[3] > 2.5), rest = treeList.filter((t) => t[3] <= 2.5);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    treeList.length = 0; treeList.push(...big, ...rest.slice(0, 160 - big.length));
    const g = mergeGeometries(bk.geos, false);
    const im = new THREE.InstancedMesh(g, matTree, treeList.length); im.frustumCulled = false;
    treeList.forEach((t, i) => {
      _m.compose(_p.set(t[0], t[1], t[2]), _q.setFromAxisAngle(UP, t[4]), _s.setScalar(t[3])); im.setMatrixAt(i, _m);
      _c1.setRGB(1, 0.82 + t[5] * 0.18, 0.9 + t[5] * 0.1); im.setColorAt(i, _c1);
    });
    root.add(im);
  }

  // vines (instanced, 3 length classes)
  {
    const caps = [170, 110, 70];
    [4, 8, 14].forEach((L, vi) => {
      const vl = vineList[vi]; for (let i = vl.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [vl[i], vl[j]] = [vl[j], vl[i]]; } vl.length = Math.min(vl.length, caps[vi]);
      if (!vineList[vi].length) return;
      const bk = new Bucket(); const n = [9, 17, 30][vi];
      bk.add(G.beamT, flat(0x5fa357), { y: -L / 2, sx: 0.09, sy: L, sz: 0.09 });
      const leaf = G.oct.clone();
      for (let i = 0; i < n; i++) {
        const y = -(i + 0.5) / n * L, side = i % 2 ? 1 : -1; const c = rnd() < 0.12 ? pick([PAL.pink, PAL.pinkL]) : pick([PAL.gA, PAL.gB, 0x7dc46a, 0x9bd86a]);
        bk.add(leaf, grad(y - 0.3, new THREE.Color(c).multiplyScalar(0.8).getHex(), y + 0.3, c), { x: side * 0.16, y, z: rr(-0.05, 0.05), sx: 0.3, sy: 0.09, sz: rr(0.45, 0.7), rz: side * rr(0.3, 0.9), ry: rr(-0.8, 0.8) });
      }
      const g = mergeGeometries(bk.geos, false);
      const im = new THREE.InstancedMesh(g, matVine, vineList[vi].length); im.frustumCulled = false;
      vineList[vi].forEach((v, i) => {
        _m.compose(_p.set(v[0], v[1], v[2]), _q.setFromAxisAngle(UP, v[4]), _s.set(1, 1, 1).multiplyScalar(v[3])); im.setMatrixAt(i, _m);
        const t = rnd(); _c1.setRGB(1, 1, 0.95 + t * 0.05); im.setColorAt(i, _c1);
      });
      root.add(im);
    });
  }

  // crystals
  {
    const bk = new Bucket();
    const cg = lathe([[0, 0], [0.9, 0.05], [1.0, 0.2], [1.0, 0.68], [0.0, 1.0]], 6);
    const crysIM = new THREE.InstancedMesh(cg, matCrystal, crystalList.length); crysIM.frustumCulled = false;
    const hues = [0x8fe8ff, 0xc9a6ff, 0xff9fd0, 0x9ff5c8, 0xffd9a0];
    crystalList.forEach((c, i) => {
      _m.compose(_p.set(c[0], c[1], c[2]), c[5], _s.set(c[3], c[4], c[3])); crysIM.setMatrixAt(i, _m); crysIM.setColorAt(i, _c1.set(hues[Math.floor(c[6] * hues.length)]));
    });
    root.add(crysIM);
  }

  // waterfalls (one merged mesh)
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: fogUniforms({ uTime: UT }),
    vertexShader: `varying vec2 vUv; varying vec3 vTint; varying float vLen; attribute vec3 tint; attribute float len; uniform float uTime;
#include <fog_pars_vertex>
void main(){ vUv = uv; vTint = tint; vLen = len; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `varying vec2 vUv; varying vec3 vTint; varying float vLen; uniform float uTime;
#include <fog_pars_fragment>
void main(){
  float f = vUv.y * vLen * 0.5 - uTime * 2.4;
  float cx = vUv.x * 58.0;
  float s1 = 0.5 + 0.5*sin(cx + sin(f*0.9 + vUv.x*5.0)*0.9);
  float s2 = 0.5 + 0.5*sin(cx*1.7 + 1.3 + sin(f*1.3)*1.1);
  float st = s1*s2 * (0.65 + 0.35*sin(f*2.2 + vUv.x*11.0));
  float st2 = 0.5 + 0.5*sin(f*0.8 - vUv.x*9.0);
  vec3 base = mix(vec3(0.55,0.82,0.98), vec3(0.78,0.95,1.0), st2);
  vec3 col = mix(base, vec3(1.0), st*0.8) * mix(vec3(1.0), vTint, 0.5);
  float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
  float fade = (1.0 - smoothstep(0.7, 1.0, vUv.y)) * smoothstep(0.0, 0.015, vUv.y);
  float a = (0.42 + 0.45*st) * edge * fade;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}` });
  {
    const pos = [], uvs = [], tn = [], ln = [], idx = []; const cols = 4, rows = 12;
    const tints = [[1, 1, 1], [1.0, 0.8, 0.95], [0.85, 0.9, 1.0]];
    fallList.forEach((f) => {
      const ox = Math.cos(f.ang), oz = Math.sin(f.ang); const rx = -oz, rz = ox; const base = pos.length / 3;
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const u = i / cols, v = j / rows;
        const wdt = (u - 0.5) * f.w * (1 + 0.45 * v); const out = f.bow * (smooth(0, 0.18, v) + v * 0.3);
        pos.push(f.x + rx * wdt + ox * out, f.y - v * f.h, f.z + rz * wdt + oz * out); uvs.push(u, v); const t = tints[f.tint]; tn.push(t[0], t[1], t[2]); ln.push(f.h);
      }
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      // mist at base
      for (let k = 0; k < 5; k++) mistList.push([f.x + ox * (f.bow + 4) + rr(-6, 6), f.y - f.h + rr(-4, 6), f.z + oz * (f.bow + 4) + rr(-6, 6), rr(16, 34)]);
      // mist at top lip
      mistList.push([f.x + ox * 2, f.y + 1.5, f.z + oz * 2, rr(7, 11)]);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(tn, 3)); g.setAttribute('len', new THREE.Float32BufferAttribute(ln, 1)); g.setIndex(idx);
    const m = new THREE.Mesh(g, waterMat); m.frustumCulled = false; m.renderOrder = 2; root.add(m);
    // mist puffs
    const mist = new THREE.InstancedMesh(quad, puffMat, mistList.length); mist.frustumCulled = false;
    mistList.forEach((p, i) => { _m.compose(_p.set(p[0], p[1], p[2]), _q.identity(), _s.set(p[3], p[3] * 0.7, 1)); mist.setMatrixAt(i, _m); mist.setColorAt(i, _c1.setRGB(1, 1, 1)); });
    mist.renderOrder = 3; root.add(mist);
  }

  // rainbow
  {
    const N = 64, pos = [], uvs = [], idx = []; const R0 = 58, R1 = 68;
    for (let i = 0; i <= N; i++) for (let j = 0; j < 2; j++) { const a = (i / N) * PI; const r = j ? R1 : R0; pos.push(Math.cos(a) * r, Math.sin(a) * r, 0); uvs.push(i / N, j); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv;
vec3 hsv(float h){ vec3 k = clamp(abs(mod(h*6.0+vec3(0.,4.,2.),6.0)-3.0)-1.0,0.0,1.0); return mix(vec3(1.0), k, 0.45); }
void main(){ float band = vUv.y; vec3 c = hsv(1.0 - band*0.82);
  float a = pow(sin(vUv.x*3.14159), 0.8) * smoothstep(0.0,0.25,band) * smoothstep(1.0,0.75,band) * 0.3;
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` }));
    m.position.copy(rainbowAnchor); m.lookAt(rainbowAnchor.x - 20, rainbowAnchor.y, rainbowAnchor.z + 70); m.renderOrder = 1; m.frustumCulled = false; root.add(m);
  }

  // petals
  const petalMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: UT },
    vertexShader: `attribute float seed; uniform float uTime; varying float vA;
void main(){ float H = 40.0; vec3 p = position; float m = mod(uTime*0.9 + seed*H, H); p.y += H*0.5 - m; p.x += sin(uTime*0.35 + seed*40.0)*4.0; p.z += cos(uTime*0.3 + seed*31.0)*4.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(260.0 / -mv.z, 2.0, 12.0); vA = smoothstep(0.0, 4.0, m) * smoothstep(H, H-6.0, m); }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 0.7, 0.85, vA * (1.0 - d*1.6));
  #include <colorspace_fragment>
}` });
  {
    const n = 220, pos = [], sd = [];
    for (let i = 0; i < n; i++) {
      const inBloom = i < 140;
      if (inBloom) pos.push(bloom.x + rr(-40, 40), bloom.y + 20, bloom.z + rr(-40, 40)); else pos.push(rr(-55, 55), 14, rr(-55, 30));
      sd.push(rnd());
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.Float32BufferAttribute(sd, 1));
    const pts = new THREE.Points(g, petalMat); pts.frustumCulled = false; root.add(pts);
  }

  // ---------------------------------------------------------------- outputs
  const toPlaza = (c, dist, up) => { const d = new THREE.Vector3(-c.x, 0, -c.z).normalize(); return new THREE.Vector3(c.x + d.x * dist, c.y + up, c.z + d.z * dist); };
  const districts = [
    { id: 'bloom', name: 'Bloom Gardens', pos: toPlaza(bloom, 55, 24) },
    { id: 'clockwork', name: 'Clockwork Spires', pos: toPlaza(clock, 62, 40) },
    { id: 'prism', name: 'Prism Falls', pos: toPlaza(prism, 58, 20) },
    { id: 'skyharbor', name: 'Skyharbor', pos: toPlaza(harbor, 52, 16) },
  ];
  const spawn = new THREE.Vector3(0, 1.2, 12);
  const bossArena = { center: new THREE.Vector3(boss.x, boss.y, boss.z), radius: boss.r };

  const _cs = Math.cos, _sn = Math.sin;
  function update(dt, t) {
    UT.value = t;
    clouds.rotation.y = t * 0.004;
    for (let i = 0; i < clockMeshes.length; i++) { const m = clockMeshes[i]; m.rotation.z = t * m.userData.speed; }
    for (let i = 0; i < dockShips.length; i++) { const s = dockShips[i]; s.position.y = s.userData.base + _sn(t * 0.5 + s.userData.ph) * 0.7; s.rotation.z = _sn(t * 0.4 + s.userData.ph) * 0.03; }
    for (let i = 0; i < cruisers.length; i++) {
      const c = cruisers[i], u = c.userData; u.ang += u.spd * dt;
      c.position.set(_cs(u.ang) * u.R, u.y + _sn(t * 0.3 + i) * 1.5, _sn(u.ang) * u.R - 80);
      c.rotation.y = -u.ang + (u.spd > 0 ? 0 : PI);
    }
    bossHalo.rotation.y = t * 0.02; bossShards.rotation.y = t * 0.03;
    bossHalo.userData.glow.material.opacity = 0.2 + 0.05 * _sn(t * 0.6);
  }
  // keep the sky dome / fog tint in step with the scene
  return { update, districts, spawn, bossArena, root };
}
