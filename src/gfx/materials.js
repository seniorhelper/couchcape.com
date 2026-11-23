// CouchCape gfx: material library + material-tag contract.
//  applyMaterials(root)  - swaps opaque MeshStandard/Lambert/Phong meshes tagged with mesh.userData.mat for a SHARED
//                          textured PBR material per tag+variant (+colour). See RECIPES and INTEGRATE.md for the options.
//  upgradeCity(cityRoot) - upgrades Aurelia's own materials (tagged material.userData.gfx in city.js) in place.
//  rimify(group, color)  - cheap fresnel rim (one pow) on a hero's lit materials, for readability against busy skies.
//  asteroidGeometry(seed, detail, opts) - cratered rock geometry (port of the Attack of the AI asteroid builder).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTextureSet, triplanar } from './textures.js';

// tag -> recipe. kind/variant pick the texture set; scale = triplanar repeats per metre; ns = normal strength.
export const RECIPES = {
  rock:    { kind: 'rock', variant: 'craggy', rough: 1, metal: 0, scale: 0.3, ns: 1.1, env: 0.6 },
  stone:   { kind: 'stone', variant: 'default', rough: 1, metal: 0, scale: 0.45, ns: 0.8, env: 0.8 },
  marble:  { kind: 'marble', variant: 'white', rough: 1, metal: 0, scale: 0.18, ns: 0.4, env: 1.15 },
  crystal: { kind: 'crystal', variant: 'default', rough: 1, metal: 0.1, scale: 0.7, ns: 0.8, env: 1.5, glow: 0.35 },
  metal:   { kind: 'metal', variant: 'brushed', rough: 1, metal: 1, scale: 0.8, ns: 0.7, env: 1.1 },
  brass:   { kind: 'brass', variant: 'default', rough: 1, metal: 1, scale: 0.7, ns: 0.8, env: 1.1, color: 0xd9a54a },
  wood:    { kind: 'wood', variant: 'planks', rough: 1, metal: 0, scale: 0.5, ns: 1, env: 0.6 },
  grass:   { kind: 'grass', variant: 'default', rough: 1, metal: 0, scale: 0.8, ns: 1, env: 0.4 },
  foliage: { kind: 'foliage', variant: 'default', rough: 1, metal: 0, scale: 1.1, ns: 1, env: 0.5 },
  clay:    { kind: 'clay', variant: 'default', rough: 1, metal: 0, scale: 1.4, ns: 1, env: 0.7 },
  cloth:   { kind: 'fabric', variant: 'default', rough: 1, metal: 0, scale: 3, ns: 0.8, env: 0.4 },
  skin:    { kind: 'clay', variant: 'default', rough: 0.72, metal: 0, scale: 6, ns: 0.25, env: 0.5, albAmt: 0.12, rim: 0.25 },
  ice:     { kind: 'crystal', variant: 'default', rough: 2.5, metal: 0, scale: 0.4, ns: 0.6, env: 1.5, color: 0xdff4ff, glow: 0.12 },
  glass:   { kind: 'mirror', variant: 'default', rough: 1, metal: 0, scale: 0.5, ns: 0.2, env: 1.6, opacity: 0.32 },
  water:   { kind: 'mirror', variant: 'default', rough: 1.6, metal: 0, scale: 0.15, ns: 2.5, env: 1.2, color: 0x2f7d96, opacity: 0.88 },
  neon:    { kind: null, rough: 0.35, metal: 0, env: 0.6, glow: 1.6 },
};
const MATS = new Map();
const managed = new Set(); // shared materials we made (for env intensity per preset)

function setFor(r, ud) {
  let kind = r.kind, variant = ud.matVariant || r.variant;
  if (typeof variant === 'string' && variant.startsWith('checker')) { kind = 'checker'; variant = variant.split(':')[1] || 'checker'; }
  if (variant === 'mirror') kind = 'mirror';
  return kind ? getTextureSet(kind, { variant, colors: ud.matColors }) : null;
}
function uvClone(tex, rep) { if (rep === 1) return tex; const t = tex.clone(); t.repeat.set(rep, rep); t.needsUpdate = true; return t; }

function eligible(o) {
  if (!o.isMesh || !o.userData || !o.userData.mat || o.userData.matLocked === true) return false;
  const m = o.material; if (!m || Array.isArray(m)) return false;
  if (m.isShaderMaterial || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return false;
  if (m.blending === THREE.AdditiveBlending) return false;
  if (m.isMeshBasicMaterial) return false; // transparent or not: basic = hand-tuned unlit look, leave it
  if (m.map || m.emissiveMap || m.alphaMap) return false; // textured (possibly animated, e.g. water offset): never replace
  return m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial;
}

export function materialFor(tag, mesh) {
  const r = RECIPES[tag]; if (!r) return null;
  const ud = mesh.userData, src = mesh.material, geo = mesh.geometry;
  const uv = !!(geo && geo.attributes.uv) && !ud.matTriplanar;
  const space = ud.matSpace || (mesh.isInstancedMesh ? 'object' : 'world');
  const color = ud.matColor ?? (r.color && src.color.getHex() === 0xffffff ? r.color : src.color.getHex());
  const em = src.emissive ? src.emissive.getHex() : 0;
  const rep = ud.matRepeat ?? 1, scale = ud.matScale ?? r.scale;
  const vc = !!src.vertexColors; // preserved: levels tint with vertex colours / instanceColor
  const key = [tag, ud.matVariant || '', ud.matColors || '', uv ? 'uv' + rep : 'tp' + space + scale, color, em, src.side, src.flatShading ? 1 : 0, src.transparent ? src.opacity : 1, vc ? 'vc' : ''].join('|');
  if (MATS.has(key)) return MATS.get(key);
  const set = setFor(r, ud);
  const m = new THREE.MeshStandardMaterial({ color, vertexColors: vc, roughness: r.rough, metalness: r.metal, side: src.side, flatShading: !!src.flatShading, envMapIntensity: r.env });
  m.name = `gfx-${tag}${ud.matVariant ? '-' + ud.matVariant : ''}`; m.userData.envBase = r.env;
  if (set && set.kind === 'mirror' && tag !== 'glass' && tag !== 'water') m.metalness = 1;
  const glow = r.glow ?? 0;
  if (glow) { m.emissive.setHex(em || color); m.emissiveIntensity = glow; } else if (em) { m.emissive.setHex(em); m.emissiveIntensity = src.emissiveIntensity ?? 1; }
  const op = r.opacity ?? (src.transparent ? src.opacity : 1);
  if (op < 1) { m.transparent = true; m.opacity = op; m.depthWrite = false; }
  if (set) {
    if (uv) {
      m.map = uvClone(set.map, rep); m.normalMap = uvClone(set.normalMap, rep); m.roughnessMap = uvClone(set.roughnessMap, rep);
      if (tag === 'water') m.normalMap = set.normalMap.clone(); m.normalScale.set(r.ns, r.ns); if (r.albAmt !== undefined && r.albAmt < 0.5) m.map = null;
    } else triplanar(m, set, { scale, space, normalStr: r.ns, albAmt: r.albAmt ?? 1, albGain: 1 });
  }
  if (tag === 'water') m.userData.scroll = true;
  MATS.set(key, m); managed.add(m);
  return m;
}

/** Swap tagged meshes under root to shared gfx materials. Returns {upgraded, skipped}. Safe to call more than once. */
export function applyMaterials(root) {
  let upgraded = 0, skipped = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.userData || !o.userData.mat) return;
    if (o.userData.gfxDone) return;
    if (!eligible(o)) { skipped++; return; }
    const m = materialFor(o.userData.mat, o);
    if (!m) { skipped++; return; }
    o.material = m; o.userData.gfxDone = true; upgraded++;
  });
  return { upgraded, skipped };
}
export function managedMaterials() { return managed; }
export function updateMaterials(dt, t) { // water drift: UV water scrolls its own normal map clone (no allocation)
  for (const m of managed) if (m.userData.scroll && m.normalMap) m.normalMap.offset.set(t * 0.012, t * 0.007);
}

// ------------------------------------------------------------------ Aurelia (city.js) upgrade
// material.userData.gfx tag -> [texture kind, variant, triplanar opts, material changes]
const CITY = {
  stone:  ['stone', 'default', { scale: 0.33, albAmt: 0.5, normalStr: 0.8 }, { roughness: 0.85 }],
  plaza:  ['stone', 'default', { scale: 0.25, albAmt: 0.35, normalStr: 0.25 }, { roughness: 0.35 }],
  bronze: ['brass', 'default', { scale: 0.5, albAmt: 0.55, normalStr: 0.9 }, { roughness: 1.0, metalness: 0.75 }],
  fol:    ['foliage', 'default', { scale: 0.7, albAmt: 0.55, normalStr: 0.9 }, { roughness: 1.4 }],
  tree:   ['foliage', 'default', { scale: 0.9, albAmt: 0.3, normalStr: 0.8 }, { roughness: 1.4 }],
  vine:   ['foliage', 'default', { scale: 1.5, albAmt: 0.5, normalStr: 0.8 }, { roughness: 1.3 }],
  rock:   ['rock', 'strata', { scale: 0.085, albAmt: 0.85, normalStr: 1.2, fade: 400 }, { roughness: 1.0 }],
  ship:   ['metal', 'painted', { scale: 0.6, albAmt: 0.3, normalStr: 0.6, space: 'object' }, { roughness: 1.0 }],
  crystal:['crystal', 'default', { scale: 0.5, albAmt: 0.3, normalStr: 0.7, space: 'object' }, { roughness: 1.0 }],
};
/** Upgrade Aurelia in place. rig (optional) = lighting rig, so the city's sun follows the preset sun. */
export function upgradeCity(cityRoot, rig = null) {
  const done = new Set(); let n = 0; const look = cityRoot.userData.look || null;
  cityRoot.traverse((o) => {
    if (o.userData && o.userData.gfxSky) { o.visible = false; return; } // gfx owns the sky dome now
    if (!o.isMesh || !o.material || done.has(o.material)) return;
    const m = o.material, tag = m.userData && m.userData.gfx; if (!tag || !CITY[tag]) return;
    done.add(m);
    const [kind, variant, tp, props] = CITY[tag];
    const set = getTextureSet(kind, { variant });
    Object.assign(m, props);
    m.envMapIntensity = 0.7; m.userData.envBase = 0.7; managed.add(m);
    triplanar(m, set, { albGain: 1 / Math.max(0.05, set.mean), ...tp });
    if (tag === 'plaza') o.userData.gfxPlaza = true;
    n++;
  });
  if (look) {
    if (look.UNI && look.UNI.uFakeRefl) look.UNI.uFakeRefl.value = 0.45; // the real PMREM env now carries most reflections
    if (rig && look.SUN_DIR) { const sync = () => look.SUN_DIR.copy(rig.sunDir); sync(); rig.onPreset(sync); }
  }
  return n;
}

// ------------------------------------------------------------------ rim light
const RIMMED = new WeakSet();
export function rimify(group, color = 0xffffff, { strength = 0.6, power = 3.0 } = {}) {
  const col = new THREE.Color(color);
  group.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (RIMMED.has(m) || m.isShaderMaterial || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) continue;
      RIMMED.add(m);
      const U = { uRimC: { value: col.clone() }, uRimS: { value: strength }, uRimP: { value: power } };
      m.userData.rim = U;
      const prev = m.onBeforeCompile, baseKey = m.customProgramCacheKey();
      m.onBeforeCompile = (sh, r) => {
        prev.call(m, sh, r); Object.assign(sh.uniforms, U);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRimC; uniform float uRimS, uRimP;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRimC * (uRimS * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), uRimP));');
      };
      m.customProgramCacheKey = () => 'rim|' + baseKey;
      m.needsUpdate = true;
    }
  });
}

// ------------------------------------------------------------------ asteroid / boulder geometry
function vnoise3(seed) { // smooth 3D value noise (CPU, build time only)
  const h = (i, j, k) => { let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177) ^ Math.imul(seed, 2246822519); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  return (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v), l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w); };
}
/** Cratered, lumpy rock of radius ~1 with height-based vertex colours (AO-ish). detail 2..4 (icosphere). */
export function asteroidGeometry(seed = 11, detail = 3, { elong = [1, 0.85, 0.9], craters = 14, rough = 0.26, tint = [0.3, 0.27, 0.245] } = {}) {
  let r = seed >>> 0; const rnd = () => { r = (r + 0x6D2B79F5) | 0; let t = Math.imul(r ^ (r >>> 15), 1 | r); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const N = vnoise3(seed * 7 + 1);
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4);
  const P = g.attributes.position, cr = [];
  for (let i = 0; i < craters; i++) cr.push({ v: new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(), r: 0.16 + rnd() * 0.4 * rnd() + 0.06, d: 0.14 + rnd() * 0.18 });
  const hgt = new Float32Array(P.count), v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).normalize();
    let t = 1 + (N(v.x * 1.6 + 5, v.y * 1.6, v.z * 1.6) - 0.5) * 1.54 * rough + (N(v.x * 4 + 9, v.y * 4, v.z * 4) - 0.5) * 0.62 * rough + (N(v.x * 11, v.y * 11 + 3, v.z * 11) - 0.5) * 0.2 * rough;
    for (const c of cr) { const a = Math.acos(Math.min(1, v.dot(c.v))) / c.r; if (a < 1.35) t += (a < 1 ? -c.d * (1 - a * a) : 0) + 0.35 * c.d * Math.exp(-(((a - 1.05) / 0.2) ** 2)); }
    hgt[i] = t; v.multiplyScalar(t); v.x *= elong[0]; v.y *= elong[1]; v.z *= elong[2]; P.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  let lo = 9, hi = -9; for (const t of hgt) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
  const col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i); const k = 0.3 + 0.9 * ((hgt[i] - lo) / (hi - lo + 1e-6)) ** 1.1, n = 0.85 + 0.3 * N(v.x * 3 + 20, v.y * 3, v.z * 3), q = N(v.x * 1.2, v.y * 1.2 + 50, v.z * 1.2);
    col[i * 3] = k * n * (tint[0] + 0.07 * q); col[i * 3 + 1] = k * n * (tint[1] + 0.04 * q); col[i * 3 + 2] = k * n * (tint[2] - 0.04 * q);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); const s = 1 / g.boundingSphere.radius; g.scale(s, s, s); g.computeBoundingSphere();
  return g;
}
