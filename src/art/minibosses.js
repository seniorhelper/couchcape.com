// CouchCape mini-bosses: The Foreman, Static Duchess, Grudge Golem, The Distorter.
// 100% procedural, original. three r160 only. Faces +Z. Origin at feet. Meters.
// API per model: build() -> { group, update(dt,t), setState('idle'|'attack'|'sealed'), weakPoints:[chest, head], height }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const sm = x => x * x * (3 - 2 * x);
function hash(n) { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }

/* ---------------------------------------------------------------- build-time helpers */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c1 = new THREE.Color(), _c2 = new THREE.Color();

// add geometry to an accumulator: non-indexed, position/normal/uv/color, transformed
function add(list, geo, col, x, y, z, o) {
  o = o || {};
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  const s = o.s === undefined ? 1 : o.s, sa = typeof s === 'number' ? [s, s, s] : s, r = o.r || [0, 0, 0];
  _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e); _p.set(x || 0, y || 0, z || 0); _s.set(sa[0], sa[1], sa[2]);
  _m.compose(_p, _q, _s); g.applyMatrix4(_m);
  const pos = g.attributes.position, c = new Float32Array(n * 3);
  _c1.set(col);
  if (o.c2 !== undefined) {
    _c2.set(o.c2); g.computeBoundingBox();
    const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, d = Math.max(1e-4, y1 - y0);
    for (let i = 0; i < n; i++) {
      const t = (pos.getY(i) - y0) / d; c[i * 3] = _c1.r + (_c2.r - _c1.r) * t; c[i * 3 + 1] = _c1.g + (_c2.g - _c1.g) * t; c[i * 3 + 2] = _c1.b + (_c2.b - _c1.b) * t;
    }
  } else for (let i = 0; i < n; i++) { c[i * 3] = _c1.r; c[i * 3 + 1] = _c1.g; c[i * 3 + 2] = _c1.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  list.push(g);
}
function merged(list) { const g = mergeGeometries(list); g.computeBoundingSphere(); list.length = 0; return g; }

function rbox(w, h, d, r, seg) {
  seg = seg || 4;
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    v.sub(c); if (v.lengthSq() > 1e-9) v.normalize().multiplyScalar(r); v.add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
const sph = (rw, rh) => new THREE.SphereGeometry(1, rw || 14, rh || 10);
function tubeG(pts, r, seg, rad, closed) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, !!closed, 'catmullrom', 0.5), seg, r, rad || 3, !!closed);
}
function V(x, y, z) { return new THREE.Vector3(x, y, z); }
function starGeo(depth) {
  const sh = new THREE.Shape(); const n = 5;
  for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n + Math.PI / 2, r = i % 2 ? 0.46 : 1; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g;
}
class Helix extends THREE.Curve {
  constructor(r0, r1, h, turns) { super(); this.r0 = r0; this.r1 = r1; this.h = h; this.turns = turns; }
  getPoint(t, o) { o = o || new THREE.Vector3(); const a = t * this.turns * TAU, r = this.r0 + (this.r1 - this.r0) * t; return o.set(Math.cos(a) * r, -this.h * t, Math.sin(a) * r); }
}

// faceted translucent crystal that encases a body (origin at feet), spikes jut out
function crystalShellGeo(w, h, d, seed, colA, colB) {
  const L = [];
  const ic = new THREE.IcosahedronGeometry(1, 1); const p = ic.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.14 * (hash(Math.round(x * 50) + Math.round(y * 70) * 7 + Math.round(z * 90) * 13 + seed) - 0.5);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  ic.computeVertexNormals();
  add(L, ic, colA, 0, h / 2, 0, { s: [w * 0.62, h * 0.54, d * 0.62], c2: colB });
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU + hash(i + seed), rr = w * 0.5 + hash(i * 3 + seed) * w * 0.15, hh = h * (0.18 + 0.2 * hash(i * 5 + seed));
    add(L, new THREE.ConeGeometry(w * 0.07, hh, 5), colB, Math.cos(a) * rr * 0.9, hh * 0.45, Math.sin(a) * rr * 0.9, { r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] });
  }
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + seed, hh = h * 0.18;
    add(L, new THREE.ConeGeometry(w * 0.06, hh, 5), colA, Math.cos(a) * w * 0.14, h * 0.96, Math.sin(a) * w * 0.14, { r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] });
  }
  return merged(L);
}
function makeShell(w, h, d, seed, colA, colB, tint) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0, roughness: 0.12, metalness: 0.0, emissive: tint, emissiveIntensity: 0.55, depthWrite: false });
  const mesh = new THREE.Mesh(crystalShellGeo(w, h, d, seed, colA, colB), mat);
  mesh.userData.mat = 'crystal'; mesh.visible = false; mesh.renderOrder = 5; mesh.name = 'sealShell';
  return { mesh, mat };
}

function std(o) { return new THREE.MeshStandardMaterial(o); }
function icoCore(r, hex) {
  const mat = new THREE.MeshBasicMaterial({ color: hex });
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat); m.userData.glow = true; return m;
}

/* ---------------------------------------------------------------- state controller (no allocation) */
function ctl() {
  return {
    state: 'idle', st: 0, wind: 0, seal: 0, pulse: 0, w: 0, s: 0, jolt: 0,
    set(s) { if (s !== this.state) { this.prev = this.state; this.state = s; this.st = 0; } },
    step(dt, t) {
      this.st += dt;
      const a = this.state === 'attack';
      this.wind = a ? Math.min(1, this.st / 1.2) : Math.max(0, this.wind - dt / 0.7);
      this.seal = this.state === 'sealed' ? Math.min(1, this.seal + dt / 0.9) : Math.max(0, this.seal - dt / 0.6);
      this.pulse = 0.5 + 0.5 * Math.sin(t * TAU * (a ? 1.0 : 0.6));
      this.w = sm(this.wind); this.s = sm(this.seal);
    }
  };
}
function applyShell(sh, s) {
  const v = s > 0.01; sh.mesh.visible = v;
  if (v) { sh.mat.opacity = 0.42 * s; sh.mesh.scale.set(0.75 + 0.25 * s, s, 0.75 + 0.25 * s); }
}

/* ================================================================ 1. THE FOREMAN */
const FM = { glassA: 0x2f6f8a, glassB: 0xcdf3f7, metal: 0xd9822b, metalD: 0x4b5160, amber: 0xffb347, crystA: 0x9fefff, crystB: 0xcfb2ff };
function buildForeman() {
  const c = ctl(), group = new THREE.Group(); group.name = 'Foreman';
  const G = [], M = [], L = [], K = [];
  // legs & boots
  for (const sd of [-1, 1]) {
    const x = sd * 1.35;
    add(M, rbox(2.0, 0.95, 3.0, 0.32), FM.metalD, x, 0.47, 0.4, { c2: 0x6b7384 });
    add(M, rbox(1.7, 0.3, 2.4, 0.12), FM.metal, x, 0.98, 0.5);
    add(G, rbox(1.5, 1.8, 1.7, 0.4), FM.glassA, x, 1.85, 0, { c2: FM.glassB });
    add(M, rbox(1.7, 0.7, 1.0, 0.25), FM.metal, x, 2.35, 0.8);
    add(G, rbox(1.75, 1.0, 1.95, 0.42), FM.glassA, x, 3.0, 0, { c2: FM.glassB });
  }
  // pelvis belt + buckle lamp
  add(M, rbox(4.5, 0.95, 2.7, 0.38), FM.metal, 0, 3.55, 0, { c2: 0xf0a24a });
  add(M, rbox(1.0, 0.7, 0.3, 0.12), FM.metalD, 0, 3.55, 1.32);
  add(L, new THREE.IcosahedronGeometry(0.24, 0), FM.amber, 0, 3.55, 1.52);
  // torso
  add(G, rbox(5.4, 2.9, 3.2, 0.75), FM.glassA, 0, 5.5, 0, { c2: FM.glassB });
  add(G, rbox(3.2, 0.9, 2.3, 0.4), FM.glassA, 0, 4.1, 0, { c2: 0x7fc2d4 });
  // furnace
  add(M, new THREE.TorusGeometry(0.98, 0.2, 6, 14), FM.metal, 0, 5.4, 1.62);
  add(M, new THREE.CylinderGeometry(0.94, 0.94, 0.3, 14), 0x2d303a, 0, 5.4, 1.5, { r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; add(L, new THREE.IcosahedronGeometry(0.1, 0), FM.amber, Math.cos(a) * 1.18, 5.4 + Math.sin(a) * 1.18, 1.62); }
  for (const sd of [-1, 1]) add(L, new THREE.BoxGeometry(0.12, 2.0, 0.1), FM.amber, sd * 2.3, 5.5, 1.62);
  // ore backpack
  add(M, rbox(3.2, 2.3, 1.3, 0.4), 0x8a93a8, 0, 5.6, -2.0, { c2: 0xc4ccdc });
  for (let i = 0; i < 5; i++) add(G, new THREE.ConeGeometry(0.34, 1.5 + hash(i) * 0.8, 5), i % 2 ? FM.crystB : FM.crystA, (i - 2) * 0.62, 7.0 + hash(i + 3) * 0.2, -2.1, { r: [-0.15, 0, (i - 2) * -0.12] });
  // shoulders
  for (const sd of [-1, 1]) {
    add(G, sph(10, 8), FM.glassA, sd * 3.0, 6.3, 0, { s: [1.2, 1.0, 1.1], c2: FM.glassB });
    add(M, new THREE.CylinderGeometry(0.85, 1.05, 0.55, 8), FM.metal, sd * 3.05, 7.05, 0, { r: [0, 0, sd * -0.12] });
    add(L, new THREE.IcosahedronGeometry(0.2, 0), FM.amber, sd * 3.05, 7.4, 0.2);
  }
  // left arm (static, relaxed)
  add(G, rbox(1.15, 1.9, 1.15, 0.4), FM.glassA, -3.15, 5.2, 0, { c2: FM.glassB });
  add(M, sph(10, 8), FM.metal, -3.15, 4.15, 0.05, { s: 0.7 });
  add(G, rbox(1.1, 1.8, 1.1, 0.4), FM.glassA, -3.15, 3.2, 0.25, { c2: FM.glassB });
  add(M, rbox(1.6, 1.3, 1.6, 0.4), FM.metalD, -3.15, 2.1, 0.4);
  // neck + head
  add(M, new THREE.CylinderGeometry(0.75, 0.9, 0.6, 8), FM.metalD, 0, 7.1, 0);
  add(G, rbox(2.5, 1.7, 2.3, 0.55), FM.glassA, 0, 7.65, 0.05, { c2: FM.glassB });
  add(M, rbox(2.0, 0.55, 0.3, 0.15), 0x262a34, 0, 7.7, 1.15);
  for (const sd of [-1, 1]) add(L, rbox(0.5, 0.22, 0.1, 0.05, 2), 0xfff0b0, sd * 0.55, 7.7, 1.33);
  add(M, rbox(1.0, 0.25, 0.25, 0.1), FM.metal, 0, 7.15, 1.12);
  // crown (moves): brim + shard crown
  const crownG = new THREE.Group(); crownG.position.y = 8.2;
  add(K, new THREE.TorusGeometry(1.35, 0.24, 6, 18), FM.metal, 0, 0, 0, { r: [Math.PI / 2, 0, 0], s: [1, 1, 0.6] });
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU, rr = 1.05; const hh = 0.85 + 0.45 * hash(i * 2 + 1);
    add(K, new THREE.ConeGeometry(0.3, hh, 5), i % 2 ? FM.crystB : FM.crystA, Math.cos(a) * rr, hh * 0.45, Math.sin(a) * rr, { r: [Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38], c2: 0xffffff });
  }
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; add(K, new THREE.ConeGeometry(0.22, 1.0, 5), FM.crystA, Math.cos(a) * 0.6, 0.45, Math.sin(a) * 0.6, { r: [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15] }); }
  // drill arm (animated)
  const A = [], B = [];
  add(A, rbox(1.35, 1.9, 1.35, 0.45), FM.glassA, 0, -1.0, 0, { c2: FM.glassB });
  add(A, sph(10, 8), FM.metal, 0, -2.05, 0, { s: 0.8 });
  add(A, rbox(1.5, 1.7, 1.5, 0.45), FM.metalD, 0, -3.0, 0, { c2: 0x7d8598 });
  add(A, new THREE.CylinderGeometry(0.95, 0.95, 0.55, 10), FM.metal, 0, -4.0, 0);
  add(A, new THREE.TorusGeometry(0.9, 0.12, 5, 12), 0xffd27a, 0, -3.75, 0, { r: [Math.PI / 2, 0, 0] });
  add(B, new THREE.ConeGeometry(0.82, 2.7, 8), 0xc8ccd6, 0, -1.4, 0, { r: [Math.PI, 0, 0], c2: 0x555b6a });
  add(B, tubeG(new Helix(0.84, 0.05, 2.5, 2.6).getPoints(46), 0.13, 46, 4), 0xffd27a, 0, -0.1, 0);
  add(B, new THREE.CylinderGeometry(0.9, 0.9, 0.3, 10), FM.metalD, 0, -0.1, 0);

  const mG = std({ vertexColors: true, metalness: 0.5, roughness: 0.2, flatShading: true, emissive: 0x16384a, emissiveIntensity: 0.6 });
  const mM = std({ vertexColors: true, metalness: 0.65, roughness: 0.4, flatShading: true });
  const mK = std({ vertexColors: true, metalness: 0.1, roughness: 0.15, flatShading: true, emissive: 0x6a5fb0, emissiveIntensity: 0.4 });
  const mL = new THREE.MeshBasicMaterial({ vertexColors: true });
  const body = new THREE.Mesh(merged(G), mG); body.userData.mat = 'glass';
  const metal = new THREE.Mesh(merged(M), mM); metal.userData.mat = 'metal';
  const lamps = new THREE.Mesh(merged(L), mL);
  const crown = new THREE.Mesh(merged(K), mK); crown.userData.mat = 'crystal'; crownG.add(crown);
  const armG = new THREE.Group(); armG.position.set(3.0, 6.3, 0);
  const arm = new THREE.Mesh(merged(A), mM); arm.userData.mat = 'metal'; armG.add(arm);
  const bit = new THREE.Group(); bit.position.y = -4.25;
  const bitM = new THREE.Mesh(merged(B), mM); bitM.userData.mat = 'metal'; bit.add(bitM); armG.add(bit);
  group.add(body, metal, lamps, crownG, armG);

  const c0 = icoCore(0.62, 0xffb347), c1 = icoCore(0.46, 0xbff6ff);
  c0.position.set(0, 5.4, 1.78); c1.position.set(0, 8.95, 0);
  group.add(c0, c1);
  const sh = makeShell(8.5, 9.4, 6, 3, 0xcfeaff, 0xa9d8ff, 0x5a7cc0); group.add(sh.mesh);
  let spin = 0;
  return {
    group, weakPoints: [c0, c1], height: 9.2,
    setState(s) { c.set(s); },
    update(dt, t) {
      c.step(dt, t); const w = c.w, s = c.s, calm = 1 - s, p = c.pulse;
      armG.rotation.x = -0.9 + 2.9 * w + Math.sin(t * 0.7) * 0.05 * calm;
      armG.rotation.z = -0.22 * w;
      spin += dt * TAU * (0.35 + 0.75 * w) * calm; bit.rotation.y = spin;
      const cy = 8.2 + Math.sin(t * 1.1) * 0.07 * calm + 0.2 * w;
      crownG.position.y = cy; crownG.rotation.y += dt * 0.35 * calm;
      const k = (0.55 + 0.25 * p + 0.2 * w) * (1 - 0.6 * s);
      mL.color.setScalar(k);
      const pu = 1 + 0.07 * p * calm;
      c0.scale.setScalar(pu * (1 + 0.15 * w)); c1.scale.setScalar(pu * (1 + 0.15 * w)); c1.position.y = cy + 0.75;
      const kc = (0.7 + 0.3 * (p * 0.6 + w * 0.4)) * (1 - 0.65 * s);
      c0.material.color.setRGB(kc, kc * 0.72, kc * 0.28); c1.material.color.setRGB(kc * 0.75, kc * 0.97, kc);
      const dm = 1 - 0.5 * s; mG.color.setScalar(dm); mM.color.setScalar(dm); mK.color.setScalar(dm);
      applyShell(sh, s);
    }
  };
}

/* ================================================================ 2. STATIC DUCHESS */
const DU = { mag: 0xff4fd8, cyan: 0x4ff3ff, gold: 0xffe45e, vio: 0x3a1d7a, white: 0xfff2ff };
function buildDuchess() {
  const c = ctl(), group = new THREE.Group(); group.name = 'StaticDuchess';
  const GL = [], GF = [], BL = [], AL = [], SC = [];
  // gown profile
  const prof = new THREE.SplineCurve([new THREE.Vector2(2.75, 0.25), new THREE.Vector2(2.55, 0.9), new THREE.Vector2(2.0, 1.7), new THREE.Vector2(1.35, 2.6), new THREE.Vector2(0.85, 3.3), new THREE.Vector2(0.5, 3.95), new THREE.Vector2(0.64, 4.45), new THREE.Vector2(0.7, 4.85), new THREE.Vector2(0.55, 5.3)]).getPoints(26);
  // fill (lathe, translucent)
  const lp = prof.map(v => new THREE.Vector2(v.x * 0.97, v.y));
  add(GF, new THREE.LatheGeometry(lp, 22), DU.vio, 0, 0, 0, { c2: 0x7a3fd0 });
  add(GF, sph(14, 10), 0x6b34c0, 0, 6.35, 0, { s: 0.52 });
  // meridian lines
  for (let k = 0; k < 28; k++) {
    const a = k / 28 * TAU, pts = [];
    for (let i = 0; i < prof.length; i++) {
      const pv = prof[i], rip = 1 + 0.045 * Math.sin(pv.y * 3.1 + k * 1.7) * Math.max(0, 1 - pv.y / 4.0);
      if (pv.y > 3.97 && k % 2) break; // odd lines stop at the waist
      pts.push(V(Math.cos(a) * pv.x * rip, pv.y, Math.sin(a) * pv.x * rip));
    }
    add(GL, tubeG(pts, 0.032, 30, 3), k % 2 ? DU.cyan : DU.mag, 0, 0, 0, { c2: k % 2 ? 0xd9ffff : 0xffd0f4 });
  }
  // rings
  for (const yy of [0.9, 1.7, 2.6, 3.3]) {
    let R = 0; for (let i = 1; i < prof.length; i++) if (prof[i].y >= yy) { R = prof[i].x; break; }
    add(GL, new THREE.TorusGeometry(R, 0.04, 3, 40), yy > 2 ? DU.cyan : DU.mag, 0, yy, 0, { r: [Math.PI / 2, 0, 0] });
  }
  { // scalloped hem
    const pts = []; for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; pts.push(V(Math.cos(a) * 2.8, 0.25 + 0.22 * Math.abs(Math.sin(a * 6)) , Math.sin(a) * 2.8)); }
    add(GL, tubeG(pts, 0.07, 96, 4, true), DU.gold, 0, 0, 0);
  }
  // bodice seams, neckline
  add(BL, tubeG([V(0.0, 3.95, 0.52), V(0.12, 4.4, 0.68), V(0.16, 4.9, 0.66)], 0.03, 8, 3), DU.cyan, 0, 0, 0);
  add(BL, tubeG([V(-0.55, 5.3, 0.3), V(-0.28, 5.0, 0.55), V(0, 4.88, 0.6), V(0.28, 5.0, 0.55), V(0.55, 5.3, 0.3)], 0.04, 24, 3), DU.white, 0, 0, 0);
  add(BL, tubeG([V(-0.85, 5.15, 0), V(-0.4, 5.45, 0.1), V(0, 5.5, 0.15), V(0.4, 5.45, 0.1), V(0.85, 5.15, 0)], 0.05, 24, 3), DU.mag, 0, 0, 0);
  add(BL, tubeG([V(0, 5.5, 0.1), V(0, 5.85, 0.1)], 0.05, 4, 3), DU.cyan, 0, 0, 0);
  // head
  const hy = 6.35;
  add(BL, new THREE.TorusGeometry(0.56, 0.032, 3, 28), DU.mag, 0, hy, 0);
  add(BL, new THREE.TorusGeometry(0.56, 0.032, 3, 28), DU.cyan, 0, hy, 0, { r: [0, Math.PI / 2, 0] });
  add(BL, new THREE.TorusGeometry(0.56, 0.028, 3, 28), DU.white, 0, hy, 0, { r: [Math.PI / 2, 0, 0] });
  for (const sd of [-1, 1]) {
    add(BL, tubeG([V(sd * 0.32, hy + 0.1, 0.5), V(sd * 0.22, hy + 0.04, 0.54), V(sd * 0.12, hy + 0.1, 0.54)], 0.025, 8, 3), DU.white, 0, 0, 0);
    for (let i = 0; i < 3; i++) add(BL, tubeG([V(sd * (0.32 - i * 0.1), hy + 0.1, 0.5 + 0.03 * i), V(sd * (0.36 - i * 0.1) , hy + 0.19, 0.52)], 0.015, 2, 3), DU.mag, 0, 0, 0);
    add(BL, sph(6, 5), DU.mag, sd * 0.33, hy - 0.12, 0.48, { s: [0.09, 0.07, 0.03] });
  }
  add(BL, tubeG([V(-0.16, hy - 0.2, 0.52), V(0, hy - 0.28, 0.56), V(0.16, hy - 0.2, 0.52)], 0.03, 10, 3), DU.mag, 0, 0, 0);
  // crown band
  { const pts = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; pts.push(V(Math.cos(a) * 0.62, 6.88 + (i % 2 ? 0.5 : 0.02), Math.sin(a) * 0.62)); }
    add(BL, tubeG(pts, 0.035, 56, 3, true), DU.gold, 0, 0, 0); add(BL, new THREE.TorusGeometry(0.62, 0.04, 3, 28), DU.gold, 0, 6.9, 0, { r: [Math.PI / 2, 0, 0] }); }
  // hair
  for (let k = 0; k < 7; k++) { const x0 = (k - 3) * 0.13; add(BL, tubeG([V(x0, 6.85, -0.4), V(x0 * 2.2, 6.2, -0.78), V(x0 * 3, 5.1, -0.98), V(x0 * 3.4 + Math.sin(k) * 0.2, 4.0, -0.9), V(x0 * 3.8, 3.2, -0.7)], 0.03, 22, 3), k % 2 ? DU.cyan : DU.mag, 0, 0, 0, { c2: 0xffffff }); }
  // left arm, hand on hip
  add(BL, tubeG([V(-0.88, 5.2, 0), V(-1.45, 4.45, -0.05), V(-0.95, 3.85, 0.4)], 0.06, 20, 3), DU.mag, 0, 0, 0);
  add(BL, sph(6, 5), DU.cyan, -0.92, 3.84, 0.42, { s: 0.14 });
  // right arm group + scepter
  add(AL, tubeG([V(0, 0, 0), V(0.62, -0.88, 0.1), V(0.72, -0.3, 0.7)], 0.06, 20, 3), DU.mag, 0, 0, 0);
  add(AL, sph(6, 5), DU.cyan, 0.72, -0.28, 0.72, { s: 0.15 });
  add(AL, tubeG([V(0.72, -1.15, 0.72), V(0.72, 1.15, 0.72)], 0.045, 8, 4), DU.gold, 0, 0, 0, { c2: DU.white });
  add(AL, new THREE.TorusGeometry(0.1, 0.03, 3, 10), DU.cyan, 0.72, 0.1, 0.72, { r: [Math.PI / 2, 0, 0] });
  { const fr = []; const W = 0.46, H = 0.78, rr = 0.18;
    const corner = (cx, cy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + i / 4 * Math.PI / 2; fr.push(V(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0)); } };
    corner(W - rr, H - rr, 0); corner(-W + rr, H - rr, Math.PI / 2); corner(-W + rr, -H + rr, Math.PI); corner(W - rr, -H + rr, Math.PI * 1.5);
    add(AL, tubeG(fr, 0.045, 60, 3, true), DU.mag, 0.72, 1.85, 0.72, { r: [-0.18, 0, 0] });
    for (const sd of [-1, 1]) add(AL, new THREE.IcosahedronGeometry(0.07, 0), DU.gold, 0.72 + sd * 0.5, 2.62, 0.72);
    const sc = new THREE.PlaneGeometry(0.7, 1.3); add(SC, sc, 0x37e8ff, 0, 0, 0, { c2: 0xff8ae8 });
  }
  const mkB = (o) => new THREE.MeshBasicMaterial(o);
  const mGF = mkB({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false });
  const mGL = mkB({ vertexColors: true });
  const mBL = mkB({ vertexColors: true });
  const mAL = mkB({ vertexColors: true });
  const mSC = mkB({ vertexColors: true });
  const gownG = new THREE.Group();
  const fill = new THREE.Mesh(merged(GF), mGF), gl = new THREE.Mesh(merged(GL), mGL); gl.userData.mat = 'neon'; gl.userData.matLocked = true; fill.userData.mat = 'neon'; fill.userData.matLocked = true;
  gownG.add(fill, gl);
  const bl = new THREE.Mesh(merged(BL), mBL); bl.userData.mat = 'neon'; bl.userData.matLocked = true;
  const armG = new THREE.Group(); armG.position.set(0.88, 5.1, 0);
  const al = new THREE.Mesh(merged(AL), mAL); al.userData.mat = 'neon'; al.userData.matLocked = true; armG.add(al);
  const scr = new THREE.Mesh(merged(SC), mSC); scr.userData.mat = 'neon'; scr.userData.matLocked = true; scr.position.set(0.72, 1.86, 0.74); scr.rotation.x = -0.18; armG.add(scr);
  // orbiting star-likes
  const NS = 8;
  const stars = new THREE.InstancedMesh(starGeo(0.3), new THREE.MeshBasicMaterial(), NS);
  stars.userData.mat = 'neon'; stars.userData.matLocked = true; stars.frustumCulled = false;
  const sc = [DU.gold, DU.mag, DU.cyan, DU.white];
  for (let i = 0; i < NS; i++) stars.setColorAt(i, _c1.set(sc[i % 4]));
  const dummy = new THREE.Object3D();
  group.add(gownG, bl, armG, stars);
  const c0 = icoCore(0.3, 0xffd0f6), c1 = icoCore(0.2, 0xd9ffff);
  c0.position.set(0, 4.55, 0.74); c1.position.set(0, 7.25, 0);
  group.add(c0, c1);
  const sh = makeShell(6.2, 8.0, 6.2, 11, 0xd6e8ff, 0xffc8f4, 0x8a60d0); group.add(sh.mesh);
  return {
    group, weakPoints: [c0, c1], height: 7.9,
    setState(s) { c.set(s); },
    update(dt, t) {
      c.step(dt, t); const w = c.w, s = c.s, calm = 1 - s, p = c.pulse;
      gownG.rotation.y = Math.sin(t * 0.5) * 0.07 * calm; gownG.scale.x = 1 + 0.015 * Math.sin(t * 1.3) * calm;
      armG.rotation.x = 0.75 * w; armG.rotation.z = (Math.sin(t * 0.9) * 0.05 - 0.12 * w) * calm;
      const kb = (1 - 0.55 * s) * (0.85 + 0.15 * p + 0.15 * w);
      mGL.color.setScalar(Math.min(1, kb)); mBL.color.setScalar(Math.min(1, kb)); mAL.color.setScalar(Math.min(1, kb));
      mGF.color.setScalar(1 - 0.5 * s); mSC.color.setScalar((0.7 + 0.2 * p + 0.3 * w) * (1 - 0.65 * s)); stars.material.color.setScalar(1 - 0.55 * s);
      const sp = (0.5 + 0.9 * w) * calm, R = 1.3 - 0.3 * w;
      for (let i = 0; i < NS; i++) {
        const a = t * sp + i / NS * TAU, ar = t * 0.5 * calm + i;
        dummy.position.set(Math.cos(a) * R, 6.95 + 0.15 * Math.sin(a * 2 + i), Math.sin(a) * R);
        dummy.rotation.set(0, Math.PI / 2 - a, 0.2 * Math.sin(ar));
        dummy.scale.setScalar(0.3 * (1 + 0.12 * Math.sin(t * 1.5 + i * 2)));
        dummy.updateMatrix(); stars.setMatrixAt(i, dummy.matrix);
      }
      stars.instanceMatrix.needsUpdate = true;
      const pu = 1 + 0.08 * p * calm + 0.15 * w; c0.scale.setScalar(pu); c1.scale.setScalar(pu);
      const kc = (0.75 + 0.25 * (p * 0.6 + w * 0.4)) * (1 - 0.6 * s);
      c0.material.color.setRGB(kc, kc * 0.7, kc * 0.95); c1.material.color.setRGB(kc * 0.8, kc, kc);
      applyShell(sh, s);
    }
  };
}

/* ================================================================ 3. GRUDGE GOLEM */
let _clayTex = null;
function clayTexture() {
  if (_clayTex) return _clayTex;
  if (typeof document === 'undefined') return null;
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    const x = hash(i * 3.1) * S, y = hash(i * 7.7 + 1) * S, rot = hash(i * 1.3) * Math.PI, sz = 18 + hash(i * 9.1) * 26;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const px = x + ox, py = y + oy; if (px < -60 || px > S + 60 || py < -60 || py > S + 60) continue;
      g.save(); g.translate(px, py); g.rotate(rot);
      for (let r = 1; r < 8; r++) { g.beginPath(); g.ellipse(0, 0, sz * r / 8 * 0.8, sz * r / 8, 0, 0, TAU); g.strokeStyle = 'rgba(70,60,50,' + (0.2 - r * 0.012) + ')'; g.lineWidth = 2.2; g.stroke(); }
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  _clayTex = t; return t;
}
function buildGolem() {
  const c = ctl(), group = new THREE.Group(); group.name = 'GrudgeGolem';
  const rig = new THREE.Group(); group.add(rig);
  const CL = [], FA = [];
  const MUD = 0x8c6a49, MUD2 = 0x6b4e36, MUDL = 0xa8825c;
  // legs, feet
  for (const sd of [-1, 1]) {
    add(CL, new THREE.CapsuleGeometry(0.95, 1.0, 6, 14), MUD2, sd * 1.35, 1.5, 0, { c2: MUD });
    add(CL, sph(14, 10), MUD2, sd * 1.4, 0.55, 0.6, { s: [1.25, 0.6, 1.7] });
  }
  // belly, chest, hump
  add(CL, sph(20, 14), MUD, 0, 3.7, 0, { s: [2.5, 2.2, 2.1], c2: MUDL });
  add(CL, sph(18, 12), MUD, 0, 5.35, -0.15, { s: [2.7, 1.5, 1.8], c2: MUDL });
  add(CL, sph(14, 10), MUD2, 0, 5.7, -1.3, { s: [1.6, 1.1, 1.0] });   // sulky hump
  // chest cavity lip
  add(CL, new THREE.TorusGeometry(0.72, 0.22, 8, 18), MUD2, 0, 4.55, 1.8);
  // head (slumped forward)
  add(CL, sph(18, 12), MUD, 0, 6.55, 1.05, { s: [1.35, 1.1, 1.2], c2: MUDL });
  // tuft + gem nest
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; add(CL, new THREE.ConeGeometry(0.2, 0.7, 7), MUD2, Math.cos(a) * 0.35, 7.55, 1.0 + Math.sin(a) * 0.35, { r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] }); }
  // grumpy brow (two slabs angled down to the middle) + heavy lids
  for (const sd of [-1, 1]) add(CL, new THREE.CapsuleGeometry(0.2, 0.85, 4, 8), MUD2, sd * 0.55, 6.95, 2.05, { r: [0, 0, Math.PI / 2 + sd * 0.38] });
  add(CL, sph(10, 8), MUD2, 0, 6.2, 2.3, { s: [0.22, 0.2, 0.2] });   // nose blob
  // face
  for (const sd of [-1, 1]) {
    add(FA, sph(10, 8), 0xf4efe0, sd * 0.58, 6.65, 2.08, { s: [0.3, 0.3, 0.16] });
    add(FA, sph(8, 6), 0x2a2018, sd * 0.52, 6.58, 2.22, { s: [0.13, 0.15, 0.08] });  // pupils, looking away
    add(FA, new THREE.BoxGeometry(0.7, 0.2, 0.3), MUD2, sd * 0.58, 6.88, 2.14, { r: [0, 0, sd * 0.2] }); // lid
  }
  add(FA, new THREE.TorusGeometry(0.46, 0.09, 6, 14, Math.PI), 0x3a2a20, 0, 5.82, 2.1, { s: [1, 0.7, 1] });
  add(FA, sph(8, 6), MUDL, 0, 5.62, 2.17, { s: [0.5, 0.15, 0.16] });  // pout
  // arms (separate meshes)
  const armGeo = () => {
    const A = [];
    add(A, new THREE.CapsuleGeometry(0.72, 1.45, 6, 12), MUD, 0, -1.1, 0, { c2: MUD2 });
    add(A, sph(10, 8), MUD2, 0, -2.2, 0, { s: 0.82 });
    add(A, new THREE.CapsuleGeometry(0.66, 1.5, 6, 12), MUD, 0, -3.3, 0.15, { c2: MUD2 });
    add(A, sph(14, 10), MUDL, 0, -4.7, 0.25, { s: [0.95, 1.0, 0.9] });
    for (let i = 0; i < 3; i++) add(A, sph(8, 6), MUDL, (i - 1) * 0.5, -5.45, 0.4, { s: [0.26, 0.3, 0.26] });
    return merged(A);
  };
  const tex = clayTexture();
  const mC = std({ vertexColors: true, roughness: 0.95, metalness: 0, map: tex, bumpMap: tex, bumpScale: 2.2 });
  const mF = std({ vertexColors: true, roughness: 0.7, metalness: 0 });
  const bodyM = new THREE.Mesh(merged(CL), mC); bodyM.userData.mat = 'clay';
  const faceM = new THREE.Mesh(merged(FA), mF); faceM.userData.mat = 'clay';
  const armL = new THREE.Group(), armR = new THREE.Group();
  const gA = armGeo();
  const aL = new THREE.Mesh(gA, mC), aR = new THREE.Mesh(gA, mC); aL.userData.mat = aR.userData.mat = 'clay';
  armL.add(aL); armR.add(aR); armL.position.set(-3.0, 5.4, 0); armR.position.set(3.0, 5.4, 0);
  rig.add(bodyM, faceM, armL, armR);
  // insult pebbles
  const NP = 20, STUCK = 12;
  const peb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), std({ roughness: 0.9, flatShading: true }), NP);
  peb.userData.mat = 'rock'; peb.frustumCulled = false;
  const pcol = [0x9c9a92, 0x7f7d78, 0xb3afa6, 0xc9a7b8, 0xd8c47a, 0x9db4c6];
  const ax = new Float32Array(NP), ay = new Float32Array(NP), az = new Float32Array(NP), psz = new Float32Array(NP), pph = new Float32Array(NP), prot = new Float32Array(NP);
  for (let i = 0; i < NP; i++) {
    peb.setColorAt(i, _c1.set(pcol[i % pcol.length]));
    // anchors on the body ellipsoids
    const th = hash(i * 2.3 + 5) * TAU, ph = 0.25 + hash(i * 4.1 + 2) * 0.55; // ph: 0 top .. 1 bottom
    const ca = Math.cos(th), sa = Math.sin(th);
    const yy = 3.0 + (1 - ph) * 2.9, e = Math.sqrt(Math.max(0.05, 1 - Math.pow((yy - 3.7) / 2.3, 2)));
    ax[i] = ca * 2.55 * e; ay[i] = yy; az[i] = sa * 2.15 * e;
    if (az[i] < -0.5 && i % 2) az[i] = -az[i];
    psz[i] = 0.14 + hash(i * 6.7) * 0.16; pph[i] = hash(i * 8.9); prot[i] = hash(i * 1.9) * TAU;
  }
  rig.add(peb);
  const sh = makeShell(7.4, 8.0, 6.0, 7, 0xe6f2ff, 0xbfd8ff, 0x6a86c0);
  const c0 = icoCore(0.5, 0xffc97a), c1 = icoCore(0.3, 0x7ff5df);
  const b0 = new THREE.Vector3(0, 4.55, 1.85), b1 = new THREE.Vector3(0, 7.85, 1.0);
  group.add(c0, c1, sh.mesh);
  let puff = 1, puffT = 1, wasAtk = false;
  return {
    group, weakPoints: [c0, c1], height: 8.0,
    setState(s) { if (s === 'attack' && !wasAtk) puffT = Math.min(puff * 1.15, 1.32); if (s !== c.state || s === 'attack') { /* edge handled in update */ } c.set(s); },
    update(dt, t) {
      c.step(dt, t); const w = c.w, s = c.s, calm = 1 - s, p = c.pulse;
      const atk = c.state === 'attack';
      if (atk) { wasAtk = true; puff += Math.min(puffT - puff, 0.15 / 1.2 * dt * 1.6) ; if (puff > puffT) puff = puffT; }
      else { if (wasAtk) wasAtk = false; puffT = 1; puff = Math.max(1, puff - 0.15 / 2.5 * dt); }
      const br = 1 + 0.012 * Math.sin(t * 1.2) * calm;
      rig.scale.set(puff, puff * br, puff);
      armL.rotation.x = -0.15 - 1.75 * w + Math.sin(t * 0.8) * 0.05 * calm; armR.rotation.x = -0.1 - 1.75 * w + Math.sin(t * 0.8 + 1.2) * 0.05 * calm;
      armL.rotation.z = -0.12 - 0.15 * w; armR.rotation.z = 0.12 + 0.15 * w;
      faceM.position.y = bodyM.position.y = 0;
      // pebbles
      const rate = (atk ? 0.35 : 0.12) * calm;
      for (let i = 0; i < NP; i++) {
        let k = 1, x = ax[i], y = ay[i], z = az[i];
        if (i >= STUCK) {
          pph[i] += dt * rate * (0.8 + 0.4 * hash(i)); if (pph[i] >= 1) pph[i] -= 1;
          const q = pph[i], e = sm(q), far = (1 - e) * 4.5;
          const len = Math.sqrt(x * x + (y - 3.7) * (y - 3.7) + z * z) + 1e-4;
          x += x / len * far; y += (y - 3.7) / len * far + 1.0 * (1 - e) ; z += z / len * far;
          k = sm(Math.min(1, q / 0.12)) * (1 - sm(Math.max(0, (q - 0.9) / 0.1)));
        }
        const j = (i < STUCK ? 1 + 0.04 * Math.sin(t * 1.4 + i) : 1);
        dummy.position.set(x, y, z); dummy.rotation.set(prot[i], prot[i] * 2, 0); dummy.scale.setScalar(psz[i] * k * j);
        dummy.updateMatrix(); peb.setMatrixAt(i, dummy.matrix);
      }
      peb.instanceMatrix.needsUpdate = true;
      // cores follow puff
      c0.position.set(b0.x * puff, b0.y * puff, b0.z * puff); c1.position.set(b1.x * puff, b1.y * puff, b1.z * puff);
      const pu = 1 + 0.08 * p * calm + 0.12 * w; c0.scale.setScalar(pu * puff); c1.scale.setScalar(pu * puff);
      const kc = (0.7 + 0.3 * (p * 0.6 + w * 0.4)) * (1 - 0.6 * s);
      c0.material.color.setRGB(kc, kc * 0.78, kc * 0.45); c1.material.color.setRGB(kc * 0.5, kc, kc * 0.88);
      const dm = 1 - 0.45 * s; mC.color.setScalar(dm); mF.color.setScalar(dm); peb.material.color.setScalar(dm);
      applyShell(sh, s);
    }
  };
}
const dummy = new THREE.Object3D();

/* ================================================================ 4. THE DISTORTER */
function buildDistorter() {
  const c = ctl(), group = new THREE.Group(); group.name = 'Distorter';
  // skeleton of ellipsoid segments (all one instanced draw)
  const seg = []; // [x,y,z, rx,ry,rz, phase, kind(0 body,1 armL,2 armR), idx]
  const push = (x, y, z, rx, ry, rz, ph, kind, idx) => seg.push([x, y, z, rx, ry, rz, ph, kind, idx || 0]);
  for (const sd of [-1, 1]) {   // legs
    push(sd * 0.95, 0.34, 0.45, 0.95, 0.4, 1.35, sd, 0);
    for (let i = 0; i < 4; i++) push(sd * 0.95, 0.9 + i * 0.52, 0, 0.7 - i * 0.03, 0.7, 0.7 - i * 0.03, i * 0.8 + sd, 0);
  }
  const tp = [[3.0, 1.15, 0.85], [3.6, 1.02, 0.78], [4.2, 0.95, 0.72], [4.8, 1.2, 0.85], [5.4, 1.35, 0.95], [5.95, 1.0, 0.8]];
  tp.forEach((v, i) => push(0, v[0], 0, v[1] + 0.12, 0.8, v[2] + 0.1, i * 0.9 + 3, 0));
  const NARM = 5;
  for (const sd of [-1, 1]) for (let i = 0; i < NARM; i++) push(0, 0, 0, i === NARM - 1 ? 0.7 : 0.5, i === NARM - 1 ? 0.7 : 0.5, i === NARM - 1 ? 0.6 : 0.5, i * 0.7 + sd, sd < 0 ? 1 : 2, i);
  const NI = seg.length;
  const mirrorMat = std({ metalness: 0.55, roughness: 0.16, emissive: 0x2a2f60, emissiveIntensity: 0.55 });
  const segs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mirrorMat, NI);
  segs.userData.mat = 'mirror'; segs.frustumCulled = false;
  const cA = new THREE.Color(0xb9a8ff), cB = new THREE.Color(0x6ff2f0), cC = new THREE.Color(0xffb6ea);
  const bx = new Float32Array(NI), by = new Float32Array(NI), bz = new Float32Array(NI), rx = new Float32Array(NI), ry = new Float32Array(NI), rz = new Float32Array(NI), ph = new Float32Array(NI), kd = new Uint8Array(NI), ix = new Uint8Array(NI);
  seg.forEach((v, i) => {
    bx[i] = v[0]; by[i] = v[1]; bz[i] = v[2]; rx[i] = v[3]; ry[i] = v[4]; rz[i] = v[5]; ph[i] = v[6]; kd[i] = v[7]; ix[i] = v[8];
    const hh = v[7] ? 4.5 : v[1]; const f = Math.max(0, Math.min(1, hh / 6)); _c1.copy(cA).lerp(cB, f).lerp(cC, 0.25 * Math.sin(i * 1.3) * 0.5 + 0.1);
    segs.setColorAt(i, _c1);
  });
  // chest mirror frame
  const F = [];
  add(F, new THREE.TorusGeometry(1.05, 0.14, 6, 22), 0xf2c14e, 0, 0, 0, { c2: 0xfff0a0 });
  add(F, new THREE.CircleGeometry(0.98, 22), 0x8ad8ff, 0, 0, -0.05, { c2: 0xe8caff });
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; add(F, new THREE.IcosahedronGeometry(0.16, 0), 0xff9de8, Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0.05); }
  const frameMat = std({ vertexColors: true, metalness: 0.4, roughness: 0.25, emissive: 0x302040, emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const frame = new THREE.Mesh(merged(F), frameMat); frame.userData.mat = 'mirror'; frame.position.set(0, 4.4, 1.0);
  // head group (non-uniform scale warps its children)
  const head = new THREE.Group(); head.position.set(0, 6.65, 0.1);
  const H = [], FC = [], CR = [];
  add(H, sph(18, 12), 0xc9b8ff, 0, 0, 0, { s: [0.85, 0.82, 0.8], c2: 0x8ff6f2 });
  const mH = std({ vertexColors: true, metalness: 0.55, roughness: 0.14, emissive: 0x2a2f60, emissiveIntensity: 0.5 });
  const headM = new THREE.Mesh(merged(H), mH); headM.userData.mat = 'mirror';
  // mismatched fun-house eyes + wide crooked grin
  add(FC, sph(10, 8), 0xffffff, -0.34, 0.12, 0.66, { s: [0.3, 0.38, 0.12] });
  add(FC, sph(8, 6), 0x1f2040, -0.34, 0.12, 0.76, { s: [0.14, 0.2, 0.06] });
  add(FC, sph(10, 8), 0xffffff, 0.34, 0.2, 0.7, { s: [0.14, 0.14, 0.08] });
  add(FC, sph(8, 6), 0x1f2040, 0.34, 0.2, 0.76, { s: [0.07, 0.07, 0.04] });
  add(FC, tubeG([V(-0.5, -0.28, 0.66), V(-0.2, -0.46, 0.74), V(0.2, -0.4, 0.74), V(0.52, -0.16, 0.66)], 0.055, 16, 4), 0x2a2250, 0, 0, 0);
  add(FC, tubeG([V(-0.6, 0.45, 0.58), V(-0.34, 0.52, 0.64), V(-0.12, 0.47, 0.64)], 0.04, 8, 3), 0x2a2250, 0, 0, 0);
  const mFC = std({ vertexColors: true, roughness: 0.45 });
  const faceM = new THREE.Mesh(merged(FC), mFC);
  // ripple crown: wavy prongs
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, hh = 0.55 + 0.35 * (i % 2); add(CR, new THREE.ConeGeometry(0.15, hh, 4), i % 2 ? 0xff9de8 : 0xf2c14e, Math.cos(a) * 0.5, 0.78 + hh * 0.3, Math.sin(a) * 0.5, { r: [Math.sin(a) * 0.4, a, -Math.cos(a) * 0.4] }); }
  const crownM = new THREE.Mesh(merged(CR), std({ vertexColors: true, metalness: 0.4, roughness: 0.25, flatShading: true, emissive: 0x402040, emissiveIntensity: 0.4 }));
  head.add(headM, faceM, crownM);
  group.add(segs, frame, head);
  const c0 = icoCore(0.34, 0xffe9a8), c1 = icoCore(0.26, 0xc9fff8);
  c0.position.set(0, 4.4, 1.42); c1.position.set(0, 7.75, 0.1);
  group.add(c0, c1);
  const sh = makeShell(7.0, 8.0, 5.0, 19, 0xe4eeff, 0xf6d0ff, 0x7a70d0); group.add(sh.mesh);
  const mats = [mirrorMat, mH, frameMat, mFC, crownM.material];
  return {
    group, weakPoints: [c0, c1], height: 7.9,
    setState(s) { c.set(s); },
    update(dt, t) {
      c.step(dt, t); const w = c.w, s = c.s, calm = 1 - s, p = c.pulse;
      const amp = (0.16 + 0.12 * w) * calm, ts = t * 0.55;
      for (let i = 0; i < NI; i++) {
        let x = bx[i], y = by[i], z = bz[i];
        let sx = rx[i], sy = ry[i], sz = rz[i];
        if (kd[i]) {
          const sd = kd[i] === 1 ? -1 : 1, ang = 0.4 + 0.12 * Math.sin(ts * 1.3 + sd) * calm + w * 1.5, L = ix[i] * 0.68 + 0.2;
          x = sd * (1.6 + Math.sin(ang) * L); y = 5.5 - Math.cos(ang) * L; z = 0.15 + 0.2 * Math.sin(ts + i) * calm + w * 0.4;
        }
        const wv = Math.sin(ts * 2.0 + ph[i]), wv2 = Math.sin(ts * 1.4 + ph[i] * 1.7 + 1.0);
        x += Math.sin(ts + y * 0.8 + ph[i]) * 0.18 * (y / 6) * calm;
        sx *= 1 + amp * 1.6 * wv; sz *= 1 - amp * 1.2 * wv; sy *= 1 + amp * 0.9 * wv2;
        dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix(); segs.setMatrixAt(i, dummy.matrix);
      }
      segs.instanceMatrix.needsUpdate = true;
      head.scale.set(1 + amp * 1.6 * Math.sin(ts * 1.5 + 1), 1 + amp * 1.8 * Math.sin(ts * 1.1 + 4), 1 - amp * Math.sin(ts * 1.5 + 1));
      head.rotation.z = Math.sin(ts * 0.9) * 0.1 * calm;
      frame.scale.set(1 + amp * 1.3 * Math.sin(ts * 1.2), 1.3 * (1 - amp * 1.3 * Math.sin(ts * 1.2)), 0.5);
      frame.rotation.z = Math.sin(ts * 0.7) * 0.06 * calm;
      const pu = 1 + 0.08 * p * calm + 0.15 * w; c0.scale.setScalar(pu); c1.scale.setScalar(pu); c1.position.y = 7.75 + 0.06 * Math.sin(ts * 1.1 + 4) * 0.3;
      const kc = (0.72 + 0.28 * (p * 0.6 + w * 0.4)) * (1 - 0.6 * s);
      c0.material.color.setRGB(kc, kc * 0.9, kc * 0.62); c1.material.color.setRGB(kc * 0.78, kc, kc * 0.97);
      const dm = 1 - 0.5 * s; for (let i = 0; i < mats.length; i++) mats[i].color.setScalar(dm);
      mirrorMat.emissiveIntensity = (0.55 + 0.35 * w * p) * (1 - 0.5 * s); frameMat.emissiveIntensity = 0.4 + 0.4 * w * p;
      applyShell(sh, s);
    }
  };
}

export const MINIBOSSES = { foreman: buildForeman, duchess: buildDuchess, golem: buildGolem, distorter: buildDistorter };
