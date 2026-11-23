// CouchCape gfx: lighting presets. ONE sun direction drives the directional light, the sky's sun disk/halo, the
// aerial-perspective fog tint, the city's fake sky reflections and the PMREM environment (fixes the old mismatch where
// Aurelia's clouds were lit from the upper right while the sun and light sat to the left).
// setupLighting(scene, renderer, {preset}) -> rig { hemi, sun, sky, preset, setPreset(name), sunDir, update(dt,t) }
import * as THREE from 'three';
import { atmoSkyMaterial, auroraSkyMaterial, studioSkyMaterial, skyDome, FOG_SUN } from './sky.js';

const AURELIA = { top: 0x8f9df0, mid: 0xc2b0f0, hor: 0xffcfc4, low: 0xf2d6ea, nadir: 0xaeb6f2, sun: 0xffe1b0 };
export const PRESETS = {
  'aurelia-day': {
    sky: 'atmo', pal: { ...AURELIA, fog: 0xe9cfe2, fogSun: 0xffe0b8, fogSunAmt: 0.45, haze: 0.55, sunSize: 0.026 },
    sunDir: [-0.42, 0.26, -0.87], sunColor: 0xffe6c8, sunI: 2.1, hemiSky: 0xf4eaff, hemiGround: 0x8a76a8, hemiI: 0.4,
    fog: { color: 0xe9cfe2, near: 90, far: 900 }, bg: 0xe7cde0, tone: THREE.ACESFilmicToneMapping, exposure: 0.95, env: 0.45,
  },
  dusk: {
    sky: 'atmo', pal: { top: 0x3b3f8f, mid: 0x9a6fb8, hor: 0xffa27a, low: 0xc98aa8, nadir: 0x4b4a8a, sun: 0xffb070, fog: 0xd99aa0, fogSun: 0xffa060, fogSunAmt: 0.8, haze: 0.7, sunSize: 0.03 },
    sunDir: [0.75, 0.09, -0.65], sunColor: 0xffb27a, sunI: 2.0, hemiSky: 0xb8a0ff, hemiGround: 0x4a3050, hemiI: 0.5,
    fog: { color: 0xd99aa0, near: 60, far: 700 }, bg: 0x9a6fb8, tone: THREE.ACESFilmicToneMapping, exposure: 1.05, env: 0.7,
  },
  space: {
    sky: 'stars', sunDir: [0.72, 0.38, 0.58], sunColor: 0xfff3e2, sunI: 3.4, hemiSky: 0x2a3858, hemiGround: 0x0a0b10, hemiI: 0.32,
    fog: null, bg: 0x000000, tone: THREE.ACESFilmicToneMapping, exposure: 1.1, env: 0.35,
    envPal: { top: 0x0a1020, mid: 0x0a1020, hor: 0x141a30, low: 0x05060a, nadir: 0x020203, sun: 0xfff3e2, fog: 0x0a0e1a, fogSunAmt: 0, haze: 0, sunSize: 0.03 },
  },
  neon: {
    sky: 'aurora', pal: {}, sunDir: [-0.3, 0.55, 0.78], sunColor: 0xa9bcff, sunI: 0.9, hemiSky: 0x7a55e0, hemiGround: 0x0c1a3a, hemiI: 0.55,
    fog: { color: 0x241a46, near: 40, far: 520 }, fogSun: 0xff4fa8, fogSunAmt: 0.25, bg: 0x070a22, tone: THREE.ACESFilmicToneMapping, exposure: 1.15, env: 0.9, stars: true,
  },
  'clay-studio': {
    sky: 'studio', pal: { top: 0xf6efe6, bot: 0xcbbdb0, box: 3 }, sunDir: [-0.45, 0.75, 0.48], sunColor: 0xfff1e0, sunI: 2.0, hemiSky: 0xfff4ea, hemiGround: 0xb59c8c, hemiI: 0.7,
    fog: null, bg: 0xf1e6da, tone: THREE.AgXToneMapping, exposure: 1.05, env: 0.8,
  },
  paradox: {
    sky: 'studio', pal: { top: 0xf7f7fa, bot: 0xd9d9e2, box: 2.2 }, sunDir: [0.35, 0.85, 0.4], sunColor: 0xffffff, sunI: 1.6, hemiSky: 0xffffff, hemiGround: 0xc8c8d4, hemiI: 0.9,
    fog: { color: 0xf1f1f5, near: 60, far: 600 }, bg: 0xf1f1f5, tone: THREE.AgXToneMapping, exposure: 1.0, env: 0.9,
  },
};

// ------------------------------------------------------------------ aerial-perspective fog (global, cheap)
// Adds one varying + a pow() to the fog chunk: fog brightens/warms toward the sun, exactly like the sky's horizon haze.
let fogPatched = false;
export function patchAerialFog() {
  if (fogPatched) return; fogPatched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogDir;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogDir = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;\n#endif';
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogDir;\n\tuniform vec3 fogSunDir;\n\tuniform vec3 fogSunColor;\n\tuniform float fogSunAmt;');
  C.fog_fragment = C.fog_fragment.replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );',
    'vec3 fogC = fogColor + fogSunColor * ( fogSunAmt * pow( max( dot( normalize( vFogDir ), fogSunDir ), 0.0 ), 6.0 ) );\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );');
  // plain objects are shared by reference through UniformsUtils.clone, so one update reaches every material
  const add = (u) => { if (u && u.fogColor) { u.fogSunDir = { value: FOG_SUN.dir }; u.fogSunColor = { value: FOG_SUN.color }; u.fogSunAmt = FOG_SUN.amt; } };
  for (const k in THREE.ShaderLib) add(THREE.ShaderLib[k].uniforms);
  add(THREE.UniformsLib.fog);
}

// ------------------------------------------------------------------ environment (low-res PMREM from the sky)
function bakeEnv(renderer, pmrem, skyMat, extra) {
  const sc = new THREE.Scene(); const dome = skyDome(skyMat); sc.add(dome); if (extra) sc.add(extra);
  const rt = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cam = new THREE.CubeCamera(0.05, 50, rt);
  const xr = renderer.xr.enabled, prev = renderer.getRenderTarget(); renderer.xr.enabled = false;
  cam.update(renderer, sc); renderer.setRenderTarget(prev); renderer.xr.enabled = xr;
  const env = pmrem.fromCubemap(rt.texture); rt.dispose(); dome.geometry.dispose();
  return env;
}

export function setupLighting(scene, renderer, { preset = 'aurelia-day' } = {}) {
  patchAerialFog();
  // adopt the lights main.js already made (so nothing is doubled), else create them
  let hemi = null, sun = null;
  scene.traverse((o) => { if (!hemi && o.isHemisphereLight) hemi = o; if (!sun && o.isDirectionalLight) sun = o; });
  if (!hemi) { hemi = new THREE.HemisphereLight(); scene.add(hemi); }
  if (!sun) { sun = new THREE.DirectionalLight(); scene.add(sun); }
  if (!sun.target.parent) scene.add(sun.target);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sunDir = new THREE.Vector3(), envCache = new Map(), listeners = [];
  const skies = {}; let dome = null, cur = null, time = 0;
  const pivot = new THREE.Vector3(); // shadow / light centre (moved by shadows.js)

  function skyMatFor(p) {
    if (p.sky === 'atmo') return atmoSkyMaterial(p.pal);
    if (p.sky === 'aurora') return auroraSkyMaterial(p.pal);
    if (p.sky === 'studio') return studioSkyMaterial(p.pal);
    return null; // 'stars': handled by realStarSky (index.js)
  }
  function placeSun() { sun.target.position.copy(pivot); sun.position.copy(pivot).addScaledVector(sunDir, 120); sun.target.updateMatrixWorld(); }

  function setPreset(name) {
    const p = PRESETS[name]; if (!p) { console.warn('gfx: unknown preset', name); return; }
    cur = name; rig.preset = name;
    sunDir.fromArray(p.sunDir).normalize();
    sun.color.setHex(p.sunColor); sun.intensity = p.sunI; placeSun();
    hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGround); hemi.intensity = p.hemiI;
    renderer.toneMapping = p.tone; renderer.toneMappingExposure = p.exposure;
    if (p.fog) { if (!scene.fog || !scene.fog.isFog) scene.fog = new THREE.Fog(p.fog.color, p.fog.near, p.fog.far); scene.fog.color.setHex(p.fog.color); scene.fog.near = p.fog.near; scene.fog.far = p.fog.far; }
    else scene.fog = null;
    scene.background = new THREE.Color(p.bg);
    // fog sun tint follows the same sun
    FOG_SUN.dir.x = sunDir.x; FOG_SUN.dir.y = sunDir.y; FOG_SUN.dir.z = sunDir.z;
    const fc = new THREE.Color(p.pal?.fogSun ?? p.fogSun ?? p.sunColor); FOG_SUN.color.r = fc.r; FOG_SUN.color.g = fc.g; FOG_SUN.color.b = fc.b;
    FOG_SUN.amt.value = p.fog ? (p.pal?.fogSunAmt ?? p.fogSunAmt ?? 0.3) : 0;
    // sky dome
    if (!skies[name]) { const m = skyMatFor(p); skies[name] = m ? skyDome(m) : null; if (skies[name]) { skies[name].visible = false; scene.add(skies[name]); } }
    if (dome) dome.visible = false; dome = skies[name]; if (dome) { dome.visible = true; const u = dome.material.uniforms; if (u.uSunDir) u.uSunDir.value.copy(sunDir); if (u.uFog && scene.fog) u.uFog.value.copy(scene.fog.color); }
    rig.sky = dome;
    // environment: baked once per preset at 64px (the sun disk is toned down so it doesn't double the light's specular)
    if (!envCache.has(name)) {
      const m = p.sky === 'stars' ? atmoSkyMaterial(p.envPal) : skyMatFor(p);
      if (m.uniforms.uSunDir) m.uniforms.uSunDir.value.copy(sunDir);
      if (m.uniforms.uDisk) m.uniforms.uDisk.value = 0.15;
      if (m.uniforms.uFog && p.fog) m.uniforms.uFog.value.setHex(p.fog.color);
      const env = bakeEnv(renderer, pmrem, m); m.dispose();
      envCache.set(name, env.texture);
    }
    scene.environment = p.env > 0 ? envCache.get(name) : null;
    rig.envIntensity = p.env;
    for (const f of listeners) f(name, p);
  }

  const rig = {
    hemi, sun, sky: null, preset: null, sunDir, pivot, envIntensity: 1, presets: PRESETS,
    setPreset, onPreset(f) { listeners.push(f); },
    placeSun,
    setSunDir(v) { sunDir.copy(v).normalize(); placeSun(); FOG_SUN.dir.x = sunDir.x; FOG_SUN.dir.y = sunDir.y; FOG_SUN.dir.z = sunDir.z; if (dome && dome.material.uniforms.uSunDir) dome.material.uniforms.uSunDir.value.copy(sunDir); for (const f of listeners) f(rig.preset, PRESETS[rig.preset]); },
    update(dt, t) { time = t; if (dome && dome.material.uniforms.uTime) dome.material.uniforms.uTime.value = t; },
  };
  setPreset(preset);
  return rig;
}
