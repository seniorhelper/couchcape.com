// CouchCape heroes A (v0.3 polish): ribbon (Rally), chrona, prism (Prisma), verdant.
// 100% procedural three.js (r160). No external assets, no lights, no shadows.
// Each build() -> { group, update(dt, t), cast(), gloveColor }
// Meshes carry userData.mat tags per the material contract; draw calls <= 10 per hero.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const { Vector3: V3, Matrix4: M4, Quaternion: Q, Color: C } = THREE;
const TAU = Math.PI * 2;
const UP = new V3(0, 1, 0);
const _c = new C(), _c2 = new C();

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const frac = (x) => x - Math.floor(x);
const hash2 = (a, b) => frac(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
function mixHex(a, b, t) { _c.set(a); _c2.set(b); return _c.lerp(_c2, clamp(t)).getHex(); }
function shade(h, f) { _c.set(h); _c.multiplyScalar(f); return _c.getHex(); }
const v3 = (x, y, z) => new V3(x, y, z);
function interp(tab, y) { // tab rows [y, a, b, ...] ascending in y
  if (y <= tab[0][0]) return tab[0].slice(1);
  for (let i = 1; i < tab.length; i++) {
    if (y <= tab[i][0]) {
      const t = (y - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]);
      return tab[i].slice(1).map((v, k) => lerp(tab[i - 1][k + 1], v, t));
    }
  }
  return tab[tab.length - 1].slice(1);
}

// ---------------------------------------------------------------- geometry bag
function prep(geo, col, o) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(k === 'color' && col === null)) g.deleteAttribute(k);
  let m = o.m;
  if (!m && (o.p || o.r || o.s !== undefined)) {
    const s = o.s === undefined ? [1, 1, 1] : (typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s);
    const r = o.r || [0, 0, 0], p = o.p || [0, 0, 0];
    m = new M4().compose(v3(p[0], p[1], p[2]), new Q().setFromEuler(new THREE.Euler(r[0], r[1], r[2], o.ro || 'XYZ')), v3(s[0], s[1], s[2]));
  }
  if (m) g.applyMatrix4(m);
  if (o.flat) g.computeVertexNormals();
  if (col === null) return g;
  const pos = g.attributes.position, n = pos.count;
  const rgba = o.a !== undefined, cs = rgba ? 4 : 3, arr = new Float32Array(n * cs);
  const fn = typeof col === 'function', afn = typeof o.a === 'function';
  if (!fn) _c.set(col);
  const nor = g.attributes.normal;
  for (let i = 0; i < n; i += 3) {
    let cx = 0, cy = 0, cz = 0;
    if (o.face || afn) for (let k = 0; k < 3; k++) { cx += pos.getX(i + k) / 3; cy += pos.getY(i + k) / 3; cz += pos.getZ(i + k) / 3; }
    let fh = 0;
    if (fn && o.face) fh = col(cx, cy, cz, nor.getX(i), nor.getY(i), nor.getZ(i));
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      if (fn) _c.set(o.face ? fh : col(pos.getX(j), pos.getY(j), pos.getZ(j), nor.getX(j), nor.getY(j), nor.getZ(j)));
      arr[j * cs] = _c.r; arr[j * cs + 1] = _c.g; arr[j * cs + 2] = _c.b;
      if (rgba) arr[j * cs + 3] = afn ? o.a(cx, cy, cz) : o.a;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, cs));
  return g;
}
class Bag {
  constructor() { this.g = []; }
  add(geo, col, o = {}) { this.g.push(prep(geo, col, o)); }
  build(pv) { const g = mergeGeometries(this.g, false); if (pv) g.translate(-pv.x, -pv.y, -pv.z); return g; }
}

// ---------------------------------------------------------------- primitives
function weld(g) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); const w = mergeVertices(g, 1e-5); w.computeVertexNormals(); return w; }
const SMOOTH = new Map();
function sphG(w = 12, h = 8) { const k = w + ':' + h; if (!SMOOTH.has(k)) SMOOTH.set(k, weld(new THREE.SphereGeometry(1, w, h))); return SMOOTH.get(k); }
function sboxG(w, h, d, p = 4, seg = 10) { // superellipsoid "rounded box"
  const g = new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1)), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const f = 1 / Math.pow(Math.pow(Math.abs(x), p) + Math.pow(Math.abs(y), p) + Math.pow(Math.abs(z), p), 1 / p);
    pos.setXYZ(i, x * f * w / 2, y * f * h / 2, z * f * d / 2);
  }
  return weld(g);
}
// smooth ellipsoid blob helper: add at p with radii s
const blob = (bag, p, s, col, w = 12, h = 8, o = {}) => bag.add(sphG(w, h), col, { p, s, ...o });
const SPH = (r = 1, w = 10, h = 7) => { const g = sphG(w, h).clone(); g.scale(r, r, r); return g; };
const OCTA = new THREE.OctahedronGeometry(1, 0);

function limb(bag, a, b, ra, rb, col, o = {}) {
  const seg = o.seg || 8, d = new V3().subVectors(b, a), len = d.length();
  if (len < 1e-6) return;
  d.divideScalar(len);
  const q = new Q().setFromUnitVectors(UP, d);
  const m = new M4().compose(a.clone().add(b).multiplyScalar(0.5), q, v3(1, 1, 1));
  const caps = o.caps || 'round';
  bag.add(new THREE.CylinderGeometry(rb, ra, len, seg, 1, caps !== 'flat'), col, { ...o, m });
  if (caps === 'round') {
    const sh = Math.max(3, seg >> 2) + 1;
    bag.add(SPH(ra, seg, sh), col, { ...o, m: null, p: [a.x, a.y, a.z], r: undefined, s: undefined });
    bag.add(SPH(rb, seg, sh), col, { ...o, m: null, p: [b.x, b.y, b.z], r: undefined, s: undefined });
  }
}
function bandAt(bag, a, b, t, r, h, col, o = {}) { // thin ring around limb a->b at t
  const d = new V3().subVectors(b, a).normalize(), c = a.clone().lerp(b, t);
  limb(bag, c.clone().addScaledVector(d, -h / 2), c.clone().addScaledVector(d, h / 2), r, r, col, { seg: 10, ...o, caps: 'flat' });
}
// tapered sweep tube along a polyline (smooth, closed by radius -> 0 at ends if rfn says so)
function sweep(pts, rfn, rs = 6, flat = 1, twist = null) {
  const n = pts.length, R = typeof rfn === 'number' ? () => rfn : rfn;
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) T.push(new V3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize());
  let ref = Math.abs(T[0].y) < 0.9 ? UP : v3(1, 0, 0);
  N.push(new V3().crossVectors(T[0], ref).normalize()); B.push(new V3().crossVectors(T[0], N[0]).normalize());
  for (let i = 1; i < n; i++) {
    const q = new Q().setFromUnitVectors(T[i - 1], T[i]);
    N.push(N[i - 1].clone().applyQuaternion(q)); B.push(B[i - 1].clone().applyQuaternion(q));
  }
  const pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), r = R(u), tw = twist ? twist(u) : 0, ct = Math.cos(tw), st = Math.sin(tw);
    for (let k = 0; k < rs; k++) {
      const a = k / rs * TAU, cx = Math.cos(a) * r, cy = Math.sin(a) * r * flat;
      const nn = N[i], bb = B[i];
      const ux = cx * ct - cy * st, uy = cx * st + cy * ct;
      pos.push(pts[i].x + nn.x * ux + bb.x * uy, pts[i].y + nn.y * ux + bb.y * uy, pts[i].z + nn.z * ux + bb.z * uy);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < rs; k++) {
    const a = i * rs + k, b = i * rs + (k + 1) % rs, c = a + rs, d = b + rs;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function curvePts(pts, n, tension = 0.5) { const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', tension); return c.getPoints(n); }
function ellTube(rows, seg, capTop = true, capBot = false, p = 2) { // rows [y, rx, rz, cx?, cz?]; p>2 = squarer cross-section
  const pos = [], idx = [], R = rows.length;
  for (let j = 0; j < R; j++) for (let i = 0; i < seg; i++) {
    const a = i / seg * TAU, r = rows[j], sn = Math.sin(a), cs = Math.cos(a);
    const k = p === 2 ? 1 : 1 / Math.pow(Math.pow(Math.abs(sn), p) + Math.pow(Math.abs(cs), p), 1 / p);
    pos.push((r[3] || 0) + r[1] * sn * k, r[0], (r[4] || 0) + r[2] * cs * k);
  }
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < seg; i++) {
    const a = j * seg + i, b = j * seg + (i + 1) % seg, c = (j + 1) * seg + i, d = (j + 1) * seg + (i + 1) % seg;
    idx.push(a, b, c, b, d, c);
  }
  const addCap = (j, up) => {
    const r = rows[j], ci = pos.length / 3;
    pos.push(r[3] || 0, r[0], r[4] || 0);
    for (let i = 0; i < seg; i++) { const a = j * seg + i, b = j * seg + (i + 1) % seg; if (up) idx.push(ci, b, a); else idx.push(ci, a, b); }
  };
  if (capTop) addCap(R - 1, true);
  if (capBot) addCap(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// grid strip between two polylines (same length) -> surface patch; faces toward 'out' direction hint
function stripBetween(A, B, rows = 1, out = null) {
  const n = A.length, pos = [], idx = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i < n; i++) { const t = j / rows; pos.push(lerp(A[i].x, B[i].x, t), lerp(A[i].y, B[i].y, t), lerp(A[i].z, B[i].z, t)); }
  for (let j = 0; j < rows; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  if (out) { const nr = g.attributes.normal, p = g.attributes.position; let s = 0; for (let i = 0; i < nr.count; i++) s += nr.getX(i) * out.x + nr.getY(i) * out.y + nr.getZ(i) * out.z; if (s < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); } }
  return g;
}

function stripRows(rowsArr, out) { // list of equal-length polylines -> surface patch
  const n = rowsArr[0].length, R = rowsArr.length, pos = [], idx = [];
  for (const r of rowsArr) for (const p of r) pos.push(p.x, p.y, p.z);
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nr = g.attributes.normal; let s = 0; for (let i = 0; i < nr.count; i++) s += nr.getX(i) * out.x + nr.getY(i) * out.y + nr.getZ(i) * out.z;
  if (s < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}

// ---------------------------------------------------------------- hands (palm faces +/-X, fingers along -Y, thumb toward +Z*tz)
function hand(bag, base, s, col, sz = 1, curl = 0.35, o = {}) {
  const T = (x, y, z) => v3(x * sz, y * sz, z * sz).applyMatrix4(base);
  const ps = -s, seg = o.hseg || 5, tz = o.tz || 1, tip = o.tip || col, palm = o.palmCol || col;
  const palmM = base.clone().multiply(new M4().makeTranslation(0, -0.046 * sz, 0));
  bag.add(sboxG(0.034 * sz, 0.09 * sz, 0.082 * sz, 3, 10), palm, { m: palmM });
  const pad = T(ps * 0.012, -0.04, 0.032 * tz); bag.add(SPH(0.024 * sz, 6, 4), palm, { p: [pad.x, pad.y, pad.z] });
  const heel = T(ps * 0.004, -0.008, 0); bag.add(SPH(0.026 * sz, 6, 4), col, { p: [heel.x, heel.y, heel.z] });
  const zs = [-0.031, -0.0105, 0.0105, 0.031], Ls = [0.052, 0.068, 0.074, 0.064], cm = [1.18, 1.05, 1.0, 0.92];
  for (let f = 0; f < 4; f++) {
    const fi = tz > 0 ? f : 3 - f, L = Ls[fi], z = zs[f];
    let prev = T(0, -0.088, z);
    const lens = [0.46, 0.3, 0.24], ang = [curl * 0.55 * cm[fi], curl * 1.0 * cm[fi], curl * 0.75 * cm[fi]], rad = [0.0108, 0.0098, 0.0088, 0.0074];
    let a = 0, x = 0, y = -0.088;
    bag.add(SPH(rad[0] * sz, 4, 3), col, { p: [prev.x, prev.y, prev.z] });
    for (let j = 0; j < 3; j++) {
      a += ang[j];
      x += ps * Math.sin(a) * L * lens[j]; y -= Math.cos(a) * L * lens[j];
      const q = T(x, y, z);
      limb(bag, prev, q, rad[j] * sz, rad[j + 1] * sz, j === 2 ? tip : col, { seg, caps: j === 2 ? 'round' : 'none' });
      if (j < 1) bag.add(SPH(rad[j + 1] * sz * 1.02, 4, 3), col, { p: [q.x, q.y, q.z] });
      prev = q;
    }
  }
  const t0 = T(ps * 0.006, -0.03, 0.036 * tz), t1 = T(ps * (0.01 + 0.016 * curl), -0.054, 0.062 * tz), t2 = T(ps * (0.016 + 0.026 * curl), -0.074, 0.066 * tz), t3 = T(ps * (0.024 + 0.036 * curl), -0.09, 0.064 * tz);
  limb(bag, t0, t1, 0.0145 * sz, 0.0125 * sz, col, { seg, caps: 'round' });
  limb(bag, t1, t2, 0.0125 * sz, 0.0105 * sz, col, { seg, caps: 'round' });
  limb(bag, t2, t3, 0.0105 * sz, 0.0085 * sz, tip, { seg, caps: 'round' });
}

// ---------------------------------------------------------------- leaf scale (curved kite with midrib; not a stud)
const LEAF = (() => {
  const S0 = [0, 0, 0], S1 = [0, -0.5, 0.05], S2 = [0, -1, 0.2], L1 = [-0.5, -0.28, -0.015], L2 = [-0.3, -0.74, 0.05], R1 = [0.5, -0.28, -0.015], R2 = [0.3, -0.74, 0.05];
  const tris = [[S0, L1, S1], [L1, L2, S1], [S1, L2, S2], [S0, S1, R1], [R1, S1, R2], [S1, S2, R2]];
  const pos = []; for (const t of tris) for (const p of t) pos.push(...p);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
})();
function leaf(bag, pos, n, down, w, h, th, col, tilt = 0.3, o = {}) { // leaf hangs along 'down', lying on the surface with normal n
  const z = n.clone().normalize();
  const up = down.clone().multiplyScalar(-1); up.addScaledVector(z, -up.dot(z)).normalize();
  const x = new V3().crossVectors(up, z).normalize();
  const y2 = up.clone().addScaledVector(z, -tilt).normalize();
  const z2 = new V3().crossVectors(x, y2).normalize();
  const m = new M4().makeBasis(x.multiplyScalar(w), y2.multiplyScalar(h), z2.multiplyScalar(Math.max(th, 0.001) * 10)).setPosition(pos);
  bag.add(LEAF, col, { m, flat: true, face: true, ...o });
}

// ---------------------------------------------------------------- sculpted head
function headDeform(S, x, y, z, o) {
  const ax = Math.abs(x), rm = (S.rx + S.ry + S.rz) / 3;
  const f3 = 1 / Math.cbrt(ax * ax * ax + Math.abs(y * y * y) + Math.abs(z * z * z)), sb = 1 + (f3 - 1) * sstep(0.1, -0.55, y) * 0.85;
  let px = S.rx * x * sb, py = S.ry * y * (1 + (sb - 1) * 0.5), pz = S.rz * z * sb;
  const jt = sstep(-0.1, -0.95, y);
  px *= 1 - S.jaw * jt * jt; pz *= 1 - 0.05 * jt;
  if (y > 0.25 && z < 0) pz *= 1 + 0.09 * (y - 0.25);
  let d = 0;
  d += S.cheek * Math.exp(-((ax - 0.62) ** 2 + (y + 0.16) ** 2 + (z - 0.66) ** 2) / 0.18);
  d += S.brow * Math.exp(-((y - 0.3) ** 2) / 0.011) * sstep(0.3, 0.85, z) * (1 - 0.55 * x * x);
  d -= S.sock * Math.exp(-((ax - 0.43) ** 2 + (y - 0.1) ** 2 + (z - 0.88) ** 2) / 0.07);
  d += S.muzzle * Math.exp(-((x * x) * 0.8 + (y + 0.5) ** 2 + (z - 0.85) ** 2) / 0.12);
  d += S.fore * Math.exp(-((ax * 0.8) ** 2 + (y - 0.62) ** 2 + (z - 0.75) ** 2) / 0.12);
  d += (S.chin || 0) * Math.exp(-((x * x) * 1.4 + (y + 0.9) ** 2 + (z - 0.5) ** 2) / 0.1);
  o.set(px + x * d * rm, py + y * d * rm, pz + z * d * rm);
  return o;
}
function skullGeo(S) {
  const g = sphG(26, 18).clone(), pos = g.attributes.position, o = new V3();
  for (let i = 0; i < pos.count; i++) { headDeform(S, pos.getX(i), pos.getY(i), pos.getZ(i), o); pos.setXYZ(i, o.x, o.y, o.z); }
  g.computeVertexNormals();
  return g;
}
function mkSurf(S) { // point on head surface at azimuth a, elevation e (radians) + offset along the surface normal
  const o = new V3();
  return (a, e, off = 0, out = new V3()) => {
    const ce = Math.cos(e), x = Math.sin(a) * ce, y = Math.sin(e), z = Math.cos(a) * ce;
    headDeform(S, x, y, z, o);
    const nx = x / S.rx, ny = y / S.ry, nz = z / S.rz, nl = Math.hypot(nx, ny, nz);
    return out.set(o.x + off * nx / nl, o.y + off * ny / nl, o.z + off * nz / nl);
  };
}

// eyelids: cap shells + lashes rotated about the eye centre each blink (vertex update, no extra draw calls)
class Lids {
  constructor() { this.eyes = []; this.geo = null; }
  addEye(start, count, c, psi, qp, qn, openA, closeA) { this.eyes.push({ start, count, c, psi, qp, qn, openA, closeA }); }
  set(amount) {
    const g = this.geo, P = g.attributes.position.array, N = g.attributes.normal.array;
    for (let ei = 0; ei < this.eyes.length; ei++) {
      const e = this.eyes[ei];
      const beta = lerp(e.openA, e.closeA, amount), cb = Math.cos(beta), sb = Math.sin(beta), cp = Math.cos(e.psi), sp = Math.sin(e.psi);
      for (let i = 0; i < e.count; i++) {
        const j = i * 3, k = (e.start + i) * 3;
        let x = e.qp[j], y = e.qp[j + 1], z = e.qp[j + 2];
        let y2 = y * cb - z * sb, z2 = y * sb + z * cb;
        P[k] = e.c.x + x * cp + z2 * sp; P[k + 1] = e.c.y + y2; P[k + 2] = e.c.z - x * sp + z2 * cp;
        x = e.qn[j]; y = e.qn[j + 1]; z = e.qn[j + 2];
        y2 = y * cb - z * sb; z2 = y * sb + z * cb;
        N[k] = x * cp + z2 * sp; N[k + 1] = y2; N[k + 2] = -x * sp + z2 * cp;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }
}
function blinker(lids) {
  let nb = 2.2, bt = -1, last = -1, n = 0;
  return (t, dt) => {
    if (nb - t > 7) nb = t + 2;
    if (bt < 0 && t >= nb) { bt = 0; n++; }
    let a = 0;
    if (bt >= 0) { bt += dt; const u = bt / 0.2; if (u >= 1) { bt = -1; nb = t + 3 + 3 * hash2(n, 4.1); a = 0; } else a = Math.pow(Math.sin(u * Math.PI), 0.8); }
    if (a !== last) { lids.set(a); last = a; }
  };
}

// Build a head (head-local coords, +Z forward) into bag. Returns { P, lids }.
function buildHead(bag, S, K) {
  const P = mkSurf(S), tmp = new V3(), tmp2 = new V3();
  const skinF = (x, y, z, nx, ny) => {
    const t = clamp(-ny * 0.9 + 0.1) * 0.55, ax = Math.abs(x);
    const bl = Math.exp(-((ax - S.rx * 0.62) ** 2 / 0.0012 + (y + S.ry * 0.14) ** 2 / 0.0016 + (z - S.rz * 0.6) ** 2 / 0.004));
    const so = Math.exp(-((ax - S.rx * 0.4) ** 2 / 0.0007 + (y - S.ry * 0.1) ** 2 / 0.0007 + (z - S.rz * 0.8) ** 2 / 0.003));
    let h = mixHex(K.skin, K.skin2, t);
    h = mixHex(h, K.blush || K.skin2, bl * (K.blushAmt === undefined ? 0.35 : K.blushAmt));
    h = mixHex(h, K.skin2, so * 0.35);
    return mixHex(h, K.skinHi || 0xffffff, sstep(0.35, 1, ny) * 0.08);
  };
  bag.add(skullGeo(S), skinF, {});
  const E = S.eye, M = S.mouth, Nz = S.nose, Br = S.brows, sides = [-1, 1];
  for (const s of sides) { // ears
    const p = P(s * 1.52, -0.02, 0, tmp), es = S.ear || 1;
    bag.add(sphG(8, 6), K.skin, { p: [p.x, p.y, p.z + 0.004], s: [0.009 * es, 0.03 * es, 0.021 * es], r: [0, s * 0.4, 0] });
    bag.add(sphG(6, 4), mixHex(K.skin, K.skin2, 0.6), { p: [p.x - s * 0.0005, p.y - 0.002, p.z + 0.007], s: [0.006 * es, 0.019 * es, 0.012 * es], r: [0, s * 0.4, 0] });
    bag.add(sphG(6, 4), K.skin, { p: [p.x, p.y - 0.027 * es, p.z + 0.006], s: [0.007 * es, 0.009 * es, 0.009 * es] });
    if (K.earring) bag.add(sphG(6, 5), K.earring, { p: [p.x + s * 0.003, p.y - 0.043 * es, p.z + 0.006], s: [0.0055, 0.0055, 0.0055] });
  }
  { // nose
    const tip = P(0, Nz.e, Nz.len, new V3()), top = P(0, 0.16, 0, new V3());
    const mid = top.clone().lerp(tip, 0.5); mid.z += Nz.bridge * 0.002;
    bag.add(sweep([top, mid, tip.clone().add(v3(0, 0.004, -0.004))], (u) => Nz.r * (0.5 + 0.55 * u), 7, 1.0), K.skin, {});
    bag.add(sphG(8, 6), K.skin, { p: [tip.x, tip.y, tip.z], s: [Nz.r * 1.05, Nz.r * 0.92, Nz.r] });
    for (const s of sides) {
      const w = P(s * Nz.wa, Nz.e - 0.035, Nz.len * 0.42, tmp);
      bag.add(sphG(6, 5), K.skin, { p: [w.x, w.y, w.z], s: [Nz.r * 0.72, Nz.r * 0.7, Nz.r * 0.75] });
      const nn = P(s * Nz.wa * 0.62, Nz.e - 0.075, Nz.len * 0.55, tmp);
      bag.add(sphG(5, 4), mixHex(K.skin2, 0x2a1410, 0.55), { p: [nn.x, nn.y, nn.z], s: [Nz.r * 0.28, Nz.r * 0.16, Nz.r * 0.3] });
    }
  }
  for (const s of sides) { // brows
    const pts = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(P(s * lerp(Br.a0, Br.a1, u), Br.e + Br.arch * Math.sin(u * Math.PI * 0.9) + Br.tilt * u, 0.002 + Br.th * 0.5, new V3())); }
    bag.add(sweep(pts, (u) => Br.th * (u < 0.1 ? 0.55 + u * 4 : 1) * (1 - 0.6 * Math.pow(u, 1.6)) + 0.0004, 5, 0.65), Br.col, {});
  }
  { // mouth
    const N = 10, u = (i) => i / N * 2 - 1, shape = (uu) => Math.pow(Math.max(0, 1 - uu * uu), 0.55);
    const line = (off, dy = 0) => { const arr = []; for (let i = 0; i <= N; i++) { const uu = u(i); arr.push(P(uu * M.w, M.e + M.smile * uu * uu + dy * shape(uu), off, new V3())); } return arr; };
    const rowsOf = (off, f0, f1, n) => { const r = []; for (let j = 0; j <= n; j++) r.push(line(off, -M.open * lerp(f0, f1, j / n))); return r; };
    if (M.open > 0) {
      const fwd = v3(0, 0, 1);
      bag.add(stripRows(rowsOf(0.0005, 0, 1, 5), fwd), K.cavity, {});
      bag.add(stripRows(rowsOf(0.0011, 0, 0.45, 2), fwd), 0xfffaf0, {});
      bag.add(stripRows(rowsOf(0.0009, 0.62, 0.96, 3), fwd), K.tongue, {});
    }
    const upperPts = [], lowerPts = [];
    for (let i = 0; i <= N; i++) { const uu = u(i); upperPts.push(P(uu * M.w, M.e + M.smile * uu * uu + M.lipU * 0.45 * shape(uu), 0, new V3())); lowerPts.push(P(uu * M.w, M.e + M.smile * uu * uu - M.open * Math.pow(shape(uu), 1.2) - M.lipL * 0.45 * shape(uu), 0, new V3())); }
    const rp = (k) => (t) => k * Math.pow(Math.max(0, 1 - Math.pow(2 * t - 1, 2)), 0.5) * 0.5 + 0.0007;
    bag.add(sweep(upperPts, rp(M.lipU), 5, 0.8), K.lip, {});
    bag.add(sweep(lowerPts, rp(M.lipL), 5, 0.85), K.lip2 || K.lip, {});
    if (M.open <= 0) bag.add(sweep(line(0.0003), (t) => 0.0016 * Math.pow(Math.max(0, 1 - Math.pow(2 * t - 1, 2)), 0.4) + 0.0002, 3), K.crease || 0x4a1a18, {});
    if (M.dimple) for (const s of sides) { const p = P(s * (M.w + 0.06), M.e + M.smile + 0.02, 0, tmp); bag.add(sphG(6, 4), mixHex(K.skin, K.skin2, 0.8), { p: [p.x, p.y, p.z], s: [0.004, 0.006, 0.002] }); }
  }
  const lids = new Lids(), lidBags = [], EB = K.eyeBag || bag;
  for (const s of sides) { // eyes + lids
    const pe = P(s * E.a, E.e, 0, new V3());
    const dir = new V3(pe.x / S.rx / S.rx, pe.y / S.ry / S.ry, pe.z / S.rz / S.rz).normalize();
    const c = pe.clone().addScaledVector(dir, -E.r * E.sink);
    const gz = v3(-s * (E.cross || 0), E.lookY || 0, 1).normalize(), qg = new Q().setFromUnitVectors(UP, gz), sy = E.sy || 1;
    const mt = (push = 0) => new M4().makeTranslation(c.x + gz.x * push, c.y + gz.y * push, c.z + gz.z * push).multiply(new M4().makeScale(1, sy, 1)).multiply(new M4().makeRotationFromQuaternion(qg));
    const mq = (qq) => new M4().makeTranslation(c.x, c.y, c.z).multiply(new M4().makeScale(1, sy, 1)).multiply(new M4().makeRotationFromQuaternion(qq));
    EB.add(sphG(10, 7), (x, y) => mixHex(K.sclera || 0xfaf8f4, K.scleraEdge || 0xd8cfd0, sstep(0.45, 1, Math.hypot(x - c.x, y - c.y) / E.r) * 0.9), { p: [c.x, c.y, c.z], s: [E.r, E.r * sy, E.r] });
    EB.add(new THREE.SphereGeometry(E.r * 1.012, 10, 3, 0, TAU, 0, E.iris), K.limbal || shade(E.col, 0.35), { m: mt() });
    const ca = Math.cos(E.iris * 0.9);
    EB.add(new THREE.SphereGeometry(E.r * 1.018, 10, 3, 0, TAU, 0, E.iris * 0.9), (x, y, z) => { const d = tmp2.set(x - c.x, y - c.y, z - c.z).normalize().dot(gz); return mixHex(E.col, E.col2 || mixHex(E.col, 0xffffff, 0.45), 1 - clamp((d - ca) / (1 - ca))); }, { m: mt() });
    EB.add(new THREE.SphereGeometry(E.r * 1.026, 12, 2, 0, TAU, 0, E.iris * E.pupil), K.pupil || 0x08060a, { m: mt() });
    const cl = gz.clone().applyAxisAngle(v3(1, 0, 0), -E.iris * 0.55).applyAxisAngle(v3(0, 1, 0), -s * E.iris * 0.45);
    EB.add(new THREE.SphereGeometry(E.r * 1.034, 6, 2, 0, TAU, 0, E.iris * 0.2), 0xffffff, { m: mq(new Q().setFromUnitVectors(UP, cl)) });
    const cl2 = gz.clone().applyAxisAngle(v3(1, 0, 0), E.iris * 0.5).applyAxisAngle(v3(0, 1, 0), s * E.iris * 0.4);
    EB.add(new THREE.SphereGeometry(E.r * 1.032, 5, 2, 0, TAU, 0, E.iris * 0.09), 0xf4f9ff, { m: mq(new Q().setFromUnitVectors(UP, cl2)) });
    const lb = new Bag(), R = E.r * 1.1, pm = 1.62, rm = R * Math.sin(pm), ym = R * Math.cos(pm);
    lb.add(new THREE.SphereGeometry(R, 12, 5, 0, TAU, 0, pm), (x, y) => mixHex(K.skin, K.skin2, sstep(0.45, -0.05, y / R) * 0.55), {});
    lb.add(new THREE.TorusGeometry(rm, E.r * 0.06 * (E.liner || 1), 4, 16, Math.PI), K.lash || 0x1a0f0b, { m: new M4().compose(v3(0, ym, 0), new Q().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2), v3(1, 1, 1)) });
    if (E.lashes) for (let i = 0; i < E.lashes; i++) {
      const ph = lerp(-1.15, 1.15, i / (E.lashes - 1)), outer = s * ph > 0 ? 1.2 : 0.7, ll = E.r * (0.5 + 0.38 * Math.abs(ph) / 1.15 * outer);
      const pp = v3(rm * Math.sin(ph), ym, rm * Math.cos(ph)), dd = v3(Math.sin(ph), 0.5, Math.cos(ph)).normalize();
      limb(lb, pp, pp.clone().addScaledVector(dd, ll), E.r * 0.07, 0.0003, K.lash || 0x1a0f0b, { seg: 4, caps: 'none' });
    }
    lidBags.push({ g: lb.build(), c, s });
  }
  let off = bag.g.reduce((n, g) => n + g.attributes.position.count, 0);
  for (const lb of lidBags) {
    const g = lb.g, cnt = g.attributes.position.count;
    lids.addEye(off, cnt, lb.c, lb.s * (E.yaw || 0.3), g.attributes.position.array.slice(), g.attributes.normal.array.slice(), E.openA, E.closeA);
    bag.g.push(g); off += cnt;
  }
  return { P, lids };
}
function finishHead(mesh, lids) { lids.geo = mesh.geometry; lids.set(0); }

// ---------------------------------------------------------------- animated geometry
class Thick { // thick ribbon (elliptical cross-section tube) updated each frame, allocation-free
  constructor(rows, K, mat) {
    this.n = rows; this.K = K;
    const nv = rows * K, idx = [];
    this.pos = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3);
    this.colA = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
    for (let j = 0; j < rows - 1; j++) for (let k = 0; k < K; k++) { const a = j * K + k, b = j * K + (k + 1) % K, c = a + K, d = b + K; idx.push(a, c, b, b, c, d); }
    this.geo = new THREE.BufferGeometry();
    this.posA = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.norA = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posA); this.geo.setAttribute('normal', this.norA); this.geo.setAttribute('color', this.colA);
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.frustumCulled = false;
    this.P = Array.from({ length: rows }, () => new V3()); this.T = Array.from({ length: rows }, () => new V3());
    this._a = new V3(); this._b = new V3(); this._s = new V3(); this._n = new V3();
  }
  setColors(fn) { const a = this.colA.array, K = this.K; for (let j = 0; j < this.n; j++) for (let k = 0; k < K; k++) { _c.set(fn(j / (this.n - 1), Math.cos(k / K * TAU))); const i = (j * K + k) * 3; a[i] = _c.r; a[i + 1] = _c.g; a[i + 2] = _c.b; } this.colA.needsUpdate = true; }
  update(pathFn, wFn, thFn, twFn, t) {
    const n = this.n, K = this.K, P = this.P, T = this.T, a = this._a, b = this._b, s = this._s, nn = this._n;
    for (let j = 0; j < n; j++) pathFn(j / (n - 1), t, P[j]);
    for (let j = 0; j < n; j++) T[j].subVectors(P[Math.min(n - 1, j + 1)], P[Math.max(0, j - 1)]).normalize();
    for (let j = 0; j < n; j++) {
      const u = j / (n - 1), Tn = T[j];
      a.crossVectors(Tn, UP); if (a.lengthSq() < 1e-4) a.set(1, 0, 0); a.normalize();
      b.crossVectors(Tn, a);
      const tw = twFn(u, t), w = Math.max(wFn(u), 0.002), th = Math.max(thFn(u), 0.002);
      s.copy(a).multiplyScalar(Math.cos(tw)).addScaledVector(b, Math.sin(tw));
      nn.crossVectors(s, Tn).normalize();
      const p = P[j];
      for (let k = 0; k < K; k++) {
        const ang = k / K * TAU, cs = Math.cos(ang), sn = Math.sin(ang), i = (j * K + k) * 3;
        this.pos[i] = p.x + s.x * w * cs + nn.x * th * sn; this.pos[i + 1] = p.y + s.y * w * cs + nn.y * th * sn; this.pos[i + 2] = p.z + s.z * w * cs + nn.z * th * sn;
        let nx = s.x * cs * th + nn.x * sn * w, ny = s.y * cs * th + nn.y * sn * w, nz = s.z * cs * th + nn.z * sn * w;
        const l = Math.hypot(nx, ny, nz) || 1;
        this.nor[i] = nx / l; this.nor[i + 1] = ny / l; this.nor[i + 2] = nz / l;
      }
    }
    this.posA.needsUpdate = true; this.norA.needsUpdate = true;
  }
}
class Cloth { // grid sheets in one geometry, animated every frame
  constructor(sheets, mat, withUV = false) {
    this.sheets = sheets; let nv = 0;
    for (const s of sheets) { s.off = nv; nv += (s.cols + 1) * (s.rows + 1); }
    this.nv = nv; this.pos = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = [];
    for (const s of sheets) {
      const W = s.cols + 1;
      for (let j = 0; j <= s.rows; j++) for (let i = 0; i <= s.cols; i++) {
        const k = s.off + j * W + i, u = i / s.cols, v = j / s.rows;
        _c.set(s.color ? s.color(u, v) : 0xffffff); col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
        uv[k * 2] = u; uv[k * 2 + 1] = 1 - v;
      }
      for (let j = 0; j < s.rows; j++) for (let i = 0; i < s.cols; i++) {
        const a = s.off + j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, b, c, b, d, c);
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.posA = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.norA = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posA); this.geo.setAttribute('normal', this.norA);
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (withUV) this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.frustumCulled = false;
    this._o = new V3(); this._du = new V3(); this._dv = new V3(); this._n = new V3();
  }
  update(t, k) {
    const o = this._o, pos = this.pos, nor = this.nor;
    for (let si = 0; si < this.sheets.length; si++) {
      const s = this.sheets[si], W = s.cols + 1;
      for (let j = 0; j <= s.rows; j++) for (let i = 0; i <= s.cols; i++) {
        const u = i / s.cols, v = j / s.rows, id = (s.off + j * W + i) * 3;
        s.base(u, v, o); s.sway(u, v, t, k, o);
        pos[id] = o.x; pos[id + 1] = o.y; pos[id + 2] = o.z;
      }
      for (let j = 0; j <= s.rows; j++) for (let i = 0; i <= s.cols; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(s.cols, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(s.rows, j + 1);
        const a = (s.off + j * W + i0) * 3, b = (s.off + j * W + i1) * 3, c = (s.off + j0 * W + i) * 3, d = (s.off + j1 * W + i) * 3;
        this._du.set(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
        this._dv.set(pos[d] - pos[c], pos[d + 1] - pos[c + 1], pos[d + 2] - pos[c + 2]);
        this._n.crossVectors(this._du, this._dv);
        if (this._n.lengthSq() < 1e-14) this._n.set(0, 0, 1); else this._n.normalize();
        const id = (s.off + j * W + i) * 3;
        nor[id] = this._n.x; nor[id + 1] = this._n.y; nor[id + 2] = this._n.z;
      }
    }
    this.posA.needsUpdate = true; this.norA.needsUpdate = true;
  }
}
function castCtl() {
  let t = 0;
  return { go() { t = 0.6; }, step(dt) { if (t <= 0) return 0; t = Math.max(0, t - dt); const x = 1 - t / 0.6; return Math.min(1, Math.sin(x * Math.PI) * 1.5); } };
}
const stdMat = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, ...o });
const basicMat = (o = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, ...o });

// ---------------------------------------------------------------- rig helpers (pivot graph; geometry authored in absolute metres)
function node(parent, abs, parentAbs) {
  const g = new THREE.Group(); const pa = parentAbs || v3(0, 0, 0);
  g.position.set(abs.x - pa.x, abs.y - pa.y, abs.z - pa.z); g.userData.abs = abs.clone(); g.userData.base = g.position.clone();
  parent.add(g); return g;
}
function meshOn(n, bag, mat, tag) { const m = new THREE.Mesh(bag.build ? bag.build(n.userData.abs) : bag, mat); m.userData.mat = tag; n.add(m); return m; }
function tagMesh(m, tag) { m.userData.mat = tag; return m; }
// shared idle: contrapposto weight shift, breathing, head drift. c = {hip, chest, head, shift}
function idlePose(R, t, c) {
  const w = Math.sin(t * 0.37) * 0.5 + 0.25 * Math.sin(t * 0.93 + 1.3), b = 0.5 + 0.5 * Math.sin(t * 1.55);
  R.pelvis.rotation.z = c.hip + 0.012 * w; R.pelvis.rotation.y = (c.hipY || 0) + 0.02 * Math.sin(t * 0.29);
  R.pelvis.position.x = R.pelvis.userData.base.x + (c.shift || 0) + 0.005 * w;
  R.chest.rotation.z = c.chest - 0.016 * w; R.chest.rotation.y = (c.chestY || 0) - 0.03 * Math.sin(t * 0.29 + 0.5);
  R.chest.position.y = R.chest.userData.base.y + 0.003 * b;
  R.chestMesh.scale.set(1 + 0.011 * b, 1 + 0.008 * b, 1 + 0.02 * b);
  R.head.rotation.z = c.head + 0.02 * Math.sin(t * 0.43 + 0.4); R.head.rotation.y = (c.headY || 0) + 0.11 * Math.sin(t * 0.27) + 0.04 * Math.sin(t * 0.71 + 2); R.head.rotation.x = (c.headX || 0) + 0.025 * Math.sin(t * 0.5 + 1) + 0.01 * (b - 0.5);
}

// ================================================================= 1. RIBBON (Rally)
function buildRibbon() {
  const group = new THREE.Group(), rig = new THREE.Group(); group.add(rig);
  const B = 0x2c4ad6, BL = 0x7fb0ff, BD = 0x1b2c98, NV = 0x131d66, HR = 0x1a2896, HR2 = 0x4f6cf0, HR3 = 0x8fb8ff;
  const SK = 0xf3b98e, SK2 = 0xd98f66;
  const P = v3;
  const mainMat = stdMat({ roughness: 0.48, metalness: 0.04 }), skinMat = stdMat({ roughness: 0.55 }), hairMat = stdMat({ roughness: 0.5 });
  // ---- legs (static contrapposto: weight on Rally's right leg, free left leg relaxed)
  const legs = new Bag();
  const stripe = (s) => (x, y, z) => (s * x > 0.09 && z > -0.02 && z < 0.06 && y > 0.5 ? BL : mixHex(B, BD, clamp((0.62 - y) * 1.2) * 0.5));
  const LP = { '-1': { hip: P(-0.11, 0.9, 0), knee: P(-0.12, 0.55, 0.02), ank: P(-0.115, 0.16, 0.0), yaw: 0.05 }, '1': { hip: P(0.11, 0.88, 0), knee: P(0.15, 0.55, 0.07), ank: P(0.17, 0.16, 0.0), yaw: 0.32 } };
  for (const s of [-1, 1]) {
    const { hip, knee, ank, yaw } = LP[s];
    limb(legs, hip, knee, 0.135, 0.108, stripe(s), { seg: 10 });
    limb(legs, knee, ank.clone().add(P(0, 0.1, 0)), 0.1, 0.07, (x, y) => mixHex(B, BD, clamp((0.36 - y) * 2) * 0.55), { seg: 10 });
    blob(legs, [knee.x, knee.y, knee.z + 0.012], [0.115, 0.11, 0.115], B, 12, 8);
    bandAt(legs, knee, ank, 0.9, 0.086, 0.035, BL, { seg: 10 });
    // tall faceted boot
    const bx = ank.x, bz = ank.z;
    const bootCol = (x, y, z) => { const a = Math.atan2(z - bz, x - bx); const f = Math.floor((a + Math.PI) / TAU * 8 + y * 9); return f % 2 === 0 ? mixHex(BD, B, 0.3) : mixHex(BL, B, 0.35); };
    legs.add(new THREE.CylinderGeometry(0.095, 0.108, 0.4, 8, 1, false), bootCol, { p: [bx, 0.27, bz], r: [0, yaw, 0], flat: true, face: true });
    blob(legs, [bx, 0.47, bz], [0.105, 0.028, 0.105], BL, 12, 5);
    legs.add(sboxG(0.2, 0.11, 0.34, 3.2, 12), (x, y, z) => (y > 0.07 && z > bz + 0.1 ? BL : (y < 0.025 ? NV : BD)), { p: [bx, 0.06, bz + 0.07], r: [0, yaw, 0] });
    blob(legs, [bx + Math.sin(yaw) * 0.12, 0.085, bz + Math.cos(yaw) * 0.2], [0.075, 0.05, 0.07], BL, 10, 6);
    legs.add(new THREE.OctahedronGeometry(0.06), BL, { p: [bx + Math.sin(yaw) * 0.04, 0.2, bz + Math.cos(yaw) * 0.12], s: [1, 1.2, 0.5], r: [0.4, yaw, 0], flat: true });
  }
  rig.add(tagMesh(new THREE.Mesh(legs.build(), mainMat), 'cloth'));
  // ---- pelvis + chest
  const pelvis = node(rig, P(0, 0.9, 0), P(0, 0, 0)); pelvis.rotation.z = -0.045; pelvis.position.x = -0.012;
  const pelv = new Bag();
  pelv.add(ellTube([[0.8, 0.17, 0.115], [0.87, 0.18, 0.12], [0.95, 0.16, 0.11], [1.04, 0.145, 0.102], [1.1, 0.14, 0.098]], 22, false, true, 2.3), (x, y, z) => mixHex(B, BD, clamp((0.86 - y) * 4) * 0.5), {});
  pelv.add(ellTube([[0.95, 0.165, 0.113], [1.0, 0.162, 0.111], [1.03, 0.152, 0.106]], 22, false, false, 2.3), BL, {});
  pelv.add(new THREE.OctahedronGeometry(0.045), NV, { p: [0, 0.99, 0.112], s: [1, 1.15, 0.5], flat: true });
  pelv.add(new THREE.OctahedronGeometry(0.03), 0xdfeaff, { p: [0, 0.99, 0.122], s: [1, 1.15, 0.4], flat: true });
  meshOn(pelvis, pelv, mainMat, 'cloth');
  const chest = node(pelvis, P(0, 1.1, 0), P(0, 0.9, 0)); chest.rotation.z = 0.075;
  const chestMesh = new THREE.Group(); chestMesh.userData.abs = chest.userData.abs; chest.add(chestMesh);
  const ch = new Bag();
  const tab = [[1.08, 0.14, 0.098], [1.16, 0.165, 0.108], [1.25, 0.2, 0.12], [1.33, 0.205, 0.115], [1.39, 0.15, 0.09], [1.43, 0.06, 0.06]];
  ch.add(ellTube(tab.map((r) => [r[0], r[1], r[2]]), 24, true, false, 2.4), (x, y, z) => mixHex(B, BD, clamp((1.14 - y) * 5) * 0.45), {});
  const surfZ = (x, y) => { const [rx, rz] = interp(tab, y); return rz * Math.pow(Math.max(0.02, 1 - Math.pow(Math.abs(x) / rx, 2.4)), 1 / 2.4) + 0.008; };
  const sashPts = []; for (let i = 0; i <= 12; i++) { const u = i / 12, x = lerp(-0.155, 0.1, u), y = lerp(1.38, 1.1, u); sashPts.push(P(x, y, surfZ(x, y))); }
  ch.add(sweep(sashPts, (u) => 0.036 * (1 - 0.15 * u), 8, 0.35), BL, {});
  ch.add(sweep(sashPts.map((p) => P(p.x, p.y, p.z + 0.004)), (u) => 0.008, 5, 0.4), 0xe4efff, {});
  ch.add(new THREE.OctahedronGeometry(0.035), 0xe9f2ff, { p: [-0.02, 1.245, surfZ(-0.02, 1.245) + 0.012], s: [1, 1.2, 0.45], flat: true });
  limb(ch, P(0, 1.37, 0.004), P(0, 1.47, 0.012), 0.05, 0.047, SK2, { seg: 10 });
  blob(ch, [0, 1.385, 0.004], [0.095, 0.03, 0.085], BL, 14, 5);
  for (const s of [-1, 1]) { blob(ch, [s * 0.225, 1.3, 0], [0.085, 0.078, 0.085], B, 12, 8); blob(ch, [s * 0.232, 1.335, 0], [0.09, 0.04, 0.09], BL, 12, 5); }
  meshOn(chestMesh, ch, mainMat, 'cloth');
  // ---- head
  const head = node(chest, P(0, 1.43, 0.0), P(0, 1.1, 0));
  const S = { rx: 0.127, ry: 0.14, rz: 0.13, jaw: 0.3, chin: 0.02, cheek: 0.03, brow: 0.006, sock: 0.012, muzzle: 0.016, fore: 0.012, ear: 1.3,
    eye: { a: 0.5, e: 0.1, r: 0.033, sink: 0.5, iris: 0.82, pupil: 0.52, col: 0x2a58de, col2: 0x86b6ff, sy: 1.1, openA: -0.5, closeA: 0.45, lashes: 0, liner: 1.2, cross: 0.0, yaw: 0.3, lookY: 0.04 },
    nose: { e: -0.2, len: 0.012, r: 0.0125, wa: 0.1, bridge: 0 },
    mouth: { w: 0.6, e: -0.55, smile: 0.2, open: 0.2, lipU: 0.007, lipL: 0.009, dimple: true },
    brows: { a0: 0.13, a1: 0.78, e: 0.34, arch: 0.05, tilt: 0.05, th: 0.0105, col: HR } };
  const K = { skin: SK, skin2: SK2, blush: 0xf27d6b, blushAmt: 0.45, lip: 0xe0715f, lip2: 0xe8806c, cavity: 0x4a0f1c, tongue: 0xe8707f, lash: 0x14196a };
  const hb = new Bag(), { lids } = buildHead(hb, S, K);
  const headMesh = new THREE.Mesh(hb.build(), skinMat); tagMesh(headMesh, 'skin'); headMesh.position.set(0, 0.125, 0.012); head.add(headMesh); finishHead(headMesh, lids);
  // ---- hair (head-local, big swept spikes)
  const hair = new Bag(), hc = (x, y) => mixHex(shade(HR, 0.8), HR2, clamp((y + 0.0) * 3));
  hair.add(new THREE.SphereGeometry(1, 22, 12, 0, TAU, 0, 1.28), hc, { s: [S.rx * 1.08, S.ry * 1.1, S.rz * 1.12], r: [-0.42, 0, 0], p: [0, 0.004, -0.006] });
  const surf = mkSurf({ ...S, rx: S.rx * 1.05, ry: S.ry * 1.05, rz: S.rz * 1.05 });
  const locks = [ // [az, el, tipVec, radius]  chunky swept blades
    [0.0, 1.0, [0.0, 0.17, -0.07], 0.07], [0.62, 0.95, [0.1, 0.14, -0.06], 0.064], [-0.62, 0.95, [-0.1, 0.14, -0.06], 0.064],
    [1.2, 0.78, [0.15, 0.08, -0.09], 0.062], [-1.2, 0.78, [-0.15, 0.08, -0.09], 0.062],
    [0.45, 1.28, [0.05, 0.15, -0.16], 0.066], [-0.45, 1.28, [-0.05, 0.15, -0.16], 0.066],
    [2.0, 0.72, [0.1, 0.04, -0.17], 0.06], [-2.0, 0.72, [-0.1, 0.04, -0.17], 0.06], [3.1, 0.8, [0.0, 0.06, -0.19], 0.066]];
  const fringe = [[-0.95, 0.62, [-0.07, -0.02, 0.05], 0.044], [-0.5, 0.78, [-0.03, -0.045, 0.07], 0.05], [0.0, 0.84, [0.01, -0.05, 0.075], 0.052], [0.5, 0.78, [0.04, -0.045, 0.07], 0.05], [0.95, 0.62, [0.07, -0.02, 0.05], 0.044]];
  for (const [az, el, tv, r0] of fringe) {
    const a = surf(az, el + 0.18, 0.004, new V3()), d = a.clone().add(v3(tv[0], tv[1], tv[2]));
    hair.add(sweep(curvePts([a, a.clone().lerp(d, 0.5).add(v3(0, 0.012, 0.012)), d], 5), (u) => r0 * Math.pow(1 - u, 0.7) + 0.0008, 6, 0.5), (x, y, z) => mixHex(HR, HR2, clamp((y - 0.0) * 3)), {});
  }
  for (const [az, el, tv, r0] of locks) {
    const a = surf(az, el, 0, new V3()), b = a.clone().add(v3(tv[0] * 0.4, tv[1] * 0.7 + 0.03, tv[2] * 0.3)), c = a.clone().add(v3(tv[0] * 0.75, tv[1] * 0.95 + 0.05, tv[2] * 0.7)), d = a.clone().add(v3(tv[0], tv[1], tv[2]));
    hair.add(sweep(curvePts([a, b, c, d], 6), (u) => r0 * Math.pow(1 - u, 0.55) + 0.0008, 7, 0.5), (x, y, z) => mixHex(HR2, HR3, clamp((y - 0.05) * 4.5)), {});
  }
  const hairNode = new THREE.Group(); hairNode.position.copy(headMesh.position); head.add(hairNode);
  const hairMesh = new THREE.Mesh(hair.build(), hairMat); tagMesh(hairMesh, 'cloth'); hairNode.add(hairMesh);
  // ---- arms (hands on hips)
  const armOf = (s) => {
    const n = node(chest, P(s * 0.225, 1.3, 0), P(0, 1.1, 0)), a = new Bag();
    const E = P(s * 0.15, -0.2, -0.045), W = P(-s * 0.02, -0.32, 0.075);
    blob(a, [0, 0, 0], [0.078, 0.075, 0.078], B, 12, 8);
    limb(a, P(0, 0, 0), E, 0.068, 0.058, B, { seg: 10 });
    blob(a, [E.x, E.y, E.z], [0.062, 0.062, 0.062], BL, 10, 7);
    limb(a, E, W, 0.056, 0.047, B, { seg: 10 });
    bandAt(a, E, W, 0.9, 0.054, 0.05, BL, { seg: 10 });
    const bm = new M4().compose(W.clone().add(P(s * 0.01, -0.04, 0.0)), new Q().setFromEuler(new THREE.Euler(-1.1, 0, s * 0.35)), v3(1, 1, 1));
    hand(a, bm, s, SK, 1.25, 0.95, { tz: -1, hseg: 5 });
    const m = new THREE.Mesh(a.build(), mainMat); tagMesh(m, 'cloth'); n.add(m); return n;
  };
  const armL = armOf(1), armR = armOf(-1);
  // ---- scarf ribbons: thick looping tube-ribbon
  const scarfMat = stdMat({ roughness: 0.4, emissive: 0x0a1650, emissiveIntensity: 0.55 });
  const strip = new Thick(68, 8, scarfMat); tagMesh(strip.mesh, 'cloth');
  strip.setColors((u, c) => mixHex(mixHex(B, BL, u * 0.55), 0xe0ecff, (c * 0.5 + 0.5) * 0.35 + (1 - Math.abs(2 * u - 1)) * 0.0));
  rig.add(strip.mesh);
  const base = [[-0.98, 0.62, 0.3], [-1.08, 0.95, 0.4], [-0.98, 1.3, 0.34], [-1.06, 1.62, 0.18], [-1.16, 1.9, -0.02], [-0.98, 2.04, -0.14], [-0.74, 1.88, -0.02], [-0.62, 1.6, 0.1], [-0.4, 1.42, -0.1], [-0.2, 1.4, -0.17], [0.0, 1.42, -0.18],
    [0.2, 1.43, -0.14], [0.4, 1.52, -0.06], [0.62, 1.7, 0.04], [0.84, 1.92, 0.14], [1.04, 1.84, 0.3], [0.98, 1.56, 0.36], [0.76, 1.54, 0.18], [0.7, 1.78, -0.12], [0.94, 2.06, -0.3], [1.1, 2.2, -0.34]].map((p) => v3(...p));
  const pts = base.map((p) => p.clone()), curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5), NB = base.length;
  let amp = 1;
  const scarfPath = (u, t, out) => {
    for (let k = 0; k < NB; k++) { const w = clamp(Math.abs(k - 10) / 8) * amp; pts[k].set(base[k].x + w * 0.06 * Math.sin(t * 1.3 + k * 0.9), base[k].y + w * 0.07 * Math.sin(t * 1.1 + k * 1.3 + 1), base[k].z + w * 0.08 * Math.sin(t * 0.9 + k * 0.7 + 2)); }
    curve.getPoint(u, out);
  };
  const scarfW = (u) => 0.095 * Math.min(1, Math.sin(u * Math.PI) * 3 + 0.06) + 0.004, scarfT = (u) => 0.028 * Math.min(1, Math.sin(u * Math.PI) * 3 + 0.2) + 0.004;
  const scarfTw = (u, t) => u * 6 + Math.sin(t * 0.8 + u * 4) * 0.5;
  // cast: binding spiral ribbon
  const bindMat = stdMat({ roughness: 0.3, emissive: 0x3d7bff, emissiveIntensity: 0.9 });
  const bind = new Thick(52, 6, bindMat); bind.setColors((u, c) => mixHex(0x7fd0ff, 0xdfeeff, c * 0.5 + 0.5)); bind.mesh.visible = false; tagMesh(bind.mesh, 'neon'); rig.add(bind.mesh);
  const cc = castCtl(), upd = { kk: 0 };
  const bindPath = (u, t, out) => { const a = u * TAU * 2.1 + t * 2.4, r = (0.46 + 0.1 * Math.sin(u * 9 + t)) * (0.35 + 0.65 * upd.kk); out.set(Math.cos(a) * r, 0.12 + u * 1.6, Math.sin(a) * r); };
  const R = { pelvis, chest, chestMesh, head }, blink = blinker(lids);
  return {
    group, gloveColor: 0x2f55e8,
    cast() { cc.go(); },
    update(dt, t) {
      const k = cc.step(dt); upd.kk = k;
      idlePose(R, t, { hip: -0.045, chest: 0.075, head: -0.06, shift: -0.012, headY: 0.06 });
      blink(t, dt);
      hairNode.rotation.x = 0.03 * Math.sin(t * 1.7); hairNode.rotation.z = 0.04 * Math.sin(t * 1.3 + 1);
      amp = 1 + 1.2 * k;
      strip.update(scarfPath, scarfW, scarfT, scarfTw, t);
      const th = 2.35 * k;
      armL.rotation.z = th + 0.03 * Math.sin(t * 1.9); armR.rotation.z = -th - 0.03 * Math.sin(t * 1.9 + 1);
      armL.rotation.x = -0.4 * k; armR.rotation.x = -0.4 * k;
      bind.mesh.visible = k > 0.02;
      if (bind.mesh.visible) bind.update(bindPath, () => 0.06, () => 0.018, (u, tt) => u * 5 + tt, t);
    },
  };
}

// ================================================================= 2. CHRONA
function buildChrona() {
  const group = new THREE.Group(), rig = new THREE.Group(); group.add(rig);
  const SKIN = 0x80502f, SKIN2 = 0x56301d, BR = 0xb8743a, BRD = 0x7e4a22, BRL = 0xe0a05c, IV = 0xf3ebd8, IV2 = 0xd8c8a6, GOLD = 0xf0b940, HAIRW = 0xf6f3ec;
  const P = v3;
  const metalMat = stdMat({ roughness: 0.34, metalness: 0.45, emissive: 0x20120a, emissiveIntensity: 0.45 }), skinMat = stdMat({ roughness: 0.52 }), hairMat = stdMat({ roughness: 0.55 });
  const clothMat = stdMat({ roughness: 0.52, side: THREE.DoubleSide, emissive: 0x2a2418, emissiveIntensity: 0.55 });
  // ---- legs: copper leggings, ivory greaves, heels (weight on Chrona's left leg)
  const legs = new Bag();
  const LP = { '1': { hip: P(0.09, 0.97, 0), knee: P(0.095, 0.52, 0.012), ank: P(0.08, 0.115, -0.004), toe: 0.2, yaw: 0.06 }, '-1': { hip: P(-0.09, 0.96, 0), knee: P(-0.1, 0.52, 0.06), ank: P(-0.1, 0.115, 0.07), toe: 0.2, yaw: -0.3 } };
  for (const s of [-1, 1]) {
    const { hip, knee, ank, yaw } = LP[s];
    limb(legs, hip, knee, 0.082, 0.056, (x, y) => mixHex(BR, BRL, clamp((y - 0.5) * 1.1)), { seg: 10 });
    limb(legs, knee, ank.clone().add(P(0, 0.05, 0)), 0.054, 0.034, (x, y) => (y < 0.3 ? IV : mixHex(BR, IV2, clamp((0.5 - y) * 2.2))), { seg: 9 });
    for (let i = 0; i < 4; i++) bandAt(legs, hip, knee, 0.16 + i * 0.22, 0.078 - i * 0.008 + 0.006, 0.04, i % 2 ? BRD : GOLD, { seg: 10 });
    blob(legs, [knee.x, knee.y + 0.005, knee.z + 0.03], [0.05, 0.06, 0.03], IV, 9, 6);
    // elegant heeled shoe
    const fx = ank.x, fz = ank.z, ca = Math.cos(yaw), sa = Math.sin(yaw);
    const F = (dx, y, dz) => P(fx + dx * ca + dz * sa, y, fz - dx * sa + dz * ca);
    limb(legs, F(0, 0.1, -0.005), F(0, 0.05, 0.1), 0.036, 0.03, IV, { seg: 9 });
    limb(legs, F(0, 0.05, 0.1), F(0, 0.016, 0.185), 0.03, 0.017, IV, { seg: 9 });
    limb(legs, F(0, 0.09, -0.03), F(0, 0.01, -0.04), 0.03, 0.012, IV, { seg: 8 });
    limb(legs, F(0, 0.078, -0.04), F(0, 0.0, -0.04), 0.013, 0.009, BRD, { seg: 6 });
    bandAt(legs, F(0, 0.115, 0), F(0, 0.26, 0), 0.04, 0.04, 0.012, GOLD, { seg: 10 });
  }
  rig.add(tagMesh(new THREE.Mesh(legs.build(), metalMat), 'brass'));
  // ---- pelvis + chest
  const pelvis = node(rig, P(0, 0.98, 0), P(0, 0, 0)); pelvis.rotation.z = 0.05; pelvis.position.x = 0.012;
  const pb = new Bag();
  pb.add(ellTube([[0.86, 0.15, 0.1], [0.95, 0.152, 0.1], [1.03, 0.125, 0.088], [1.12, 0.108, 0.08]], 20, false, true), (x, y) => mixHex(BR, BRD, clamp((0.96 - y) * 5) * 0.6), {});
  for (const [y, c] of [[0.99, GOLD], [1.1, GOLD]]) pb.add(ellTube([[y - 0.012, 0.132 - (y - 0.99) * 0.35, 0.092 - (y - 0.99) * 0.1], [y + 0.012, 0.13 - (y - 0.99) * 0.35, 0.09 - (y - 0.99) * 0.1]], 20, false), c, {});
  pb.add(new THREE.OctahedronGeometry(0.03), 0xffe9a6, { p: [0, 1.04, 0.098], s: [1, 1.7, 0.6], flat: true });
  meshOn(pelvis, pb, metalMat, 'brass');
  const chest = node(pelvis, P(0, 1.14, 0), P(0, 0.98, 0)); chest.rotation.z = -0.06;
  const chestMesh = new THREE.Group(); chestMesh.userData.abs = chest.userData.abs; chest.add(chestMesh);
  const cb = new Bag();
  const tt = [[1.14, 0.106, 0.08], [1.22, 0.115, 0.086], [1.3, 0.134, 0.104], [1.38, 0.128, 0.088], [1.45, 0.125, 0.07], [1.5, 0.07, 0.055]];
  for (let j = 0; j < 4; j++) {
    const y0 = 1.14 + j * 0.065, y1 = y0 + 0.085, a = interp(tt, y0), b = interp(tt, y1);
    cb.add(ellTube([[y0, a[0] * 1.05, a[1] * 1.05], [y1, b[0] * 1.0, b[1] * 1.0]], 20, false), (x, y) => mixHex(j % 2 ? BR : BRL, BRD, clamp((y - y0) / 0.085) * 0.55), {});
    cb.add(ellTube([[y0 - 0.003, a[0] * 1.055, a[1] * 1.055], [y0 + 0.009, a[0] * 1.05, a[1] * 1.05]], 20, false), GOLD, {});
  }
  cb.add(ellTube([[1.36, 0.128, 0.09], [1.46, 0.118, 0.07], [1.5, 0.07, 0.055]], 20, true), SKIN, {});
  for (const s of [-1, 1]) { // bust plates + ivory panel
    cb.add(sphG(12, 8), (x, y) => mixHex(BRL, BR, clamp((1.3 - y) * 6)), { p: [s * 0.055, 1.3, 0.07], s: [0.064, 0.058, 0.05] });
    cb.add(new THREE.TorusGeometry(0.058, 0.0045, 4, 14), GOLD, { p: [s * 0.055, 1.3, 0.098], s: [1, 0.95, 0.5] });
  }
  cb.add(sboxG(0.085, 0.3, 0.03, 3, 10), IV, { p: [0, 1.24, 0.098] });
  cb.add(sboxG(0.02, 0.28, 0.034, 3, 8), GOLD, { p: [0, 1.24, 0.102] });
  limb(cb, P(0, 1.45, 0.0), P(0, 1.6, 0.012), 0.04, 0.035, SKIN, { seg: 10 });
  cb.add(ellTube([[1.45, 0.082, 0.064], [1.5, 0.062, 0.05], [1.545, 0.052, 0.044]], 14, false), BR, {}); // gorget
  bandAt(cb, P(0, 1.46, 0.0), P(0, 1.6, 0.012), 0.38, 0.062, 0.012, GOLD, { seg: 12 });
  meshOn(chestMesh, cb, metalMat, 'brass');
  // ---- head
  const head = node(chest, P(0, 1.5, 0.008), P(0, 1.14, 0));
  const S = { rx: 0.084, ry: 0.113, rz: 0.098, jaw: 0.32, chin: 0.012, cheek: 0.022, brow: 0.004, sock: 0.009, muzzle: 0.006, fore: 0.004, ear: 0.95,
    eye: { a: 0.46, e: 0.085, r: 0.0125, sink: 0.55, iris: 0.6, pupil: 0.45, col: 0x4a2a12, col2: 0xb98a4a, sy: 0.84, openA: -0.5, closeA: 0.5, lashes: 6, liner: 1.3, yaw: 0.3, cross: 0.01 },
    nose: { e: -0.2, len: 0.016, r: 0.0095, wa: 0.09, bridge: 1 },
    mouth: { w: 0.42, e: -0.5, smile: 0.025, open: 0, lipU: 0.0095, lipL: 0.012 },
    brows: { a0: 0.13, a1: 0.7, e: 0.3, arch: 0.045, tilt: 0.02, th: 0.0034, col: 0x4a4540 } };
  const K = { skin: SKIN, skin2: SKIN2, blush: 0xa4503a, blushAmt: 0.3, skinHi: 0xe0a974, lip: 0x8c3a38, lip2: 0x9a4440, lash: 0x120a08, earring: GOLD, crease: 0x3a1210, sclera: 0xf6f1ea };
  const hb = new Bag(), { lids } = buildHead(hb, S, K);
  const headMesh = new THREE.Mesh(hb.build(), skinMat); tagMesh(headMesh, 'skin'); headMesh.position.set(0, 0.19, 0.012); head.add(headMesh); finishHead(headMesh, lids);
  // ---- hair: cropped white, swept-up styled top
  const hair = new Bag(), hcol = (x, y, z) => mixHex(0xd6d2c8, HAIRW, clamp((y + 0.02) * 6));
  hair.add(new THREE.SphereGeometry(1, 22, 12, 0, TAU, 0, 1.5), hcol, { s: [S.rx * 1.09, S.ry * 1.08, S.rz * 1.1], r: [-0.5, 0, 0], p: [0, 0.006, -0.006] });
  const surf = mkSurf({ ...S, rx: S.rx * 1.07, ry: S.ry * 1.07, rz: S.rz * 1.07 });
  const wave = [[0, 1.0, [0, 0.045, -0.07]], [0.4, 0.98, [0.025, 0.04, -0.065]], [-0.4, 0.98, [-0.025, 0.04, -0.065]], [0.8, 0.9, [0.05, 0.025, -0.05]], [-0.8, 0.9, [-0.05, 0.025, -0.05]], [0.2, 1.15, [0.01, 0.045, -0.08]], [-0.25, 1.15, [-0.01, 0.045, -0.08]], [0.1, 0.8, [0.0, 0.05, -0.02]], [-0.3, 0.82, [-0.0, 0.05, -0.02]], [0.6, 0.78, [0.03, 0.03, -0.015]], [-0.65, 0.78, [-0.03, 0.03, -0.015]]];
  for (const [az, el, tv] of wave) {
    const a = surf(az, el, 0, new V3()), d = a.clone().add(v3(tv[0], tv[1], tv[2])), m = a.clone().lerp(d, 0.5).add(v3(tv[0] * 0.4, 0.014, -tv[2] * 0.2));
    hair.add(sweep(curvePts([a, m, d], 6), (u) => 0.036 * Math.pow(1 - u, 0.6) + 0.0007, 6, 0.5), (x, y) => mixHex(0xe4e0d6, 0xffffff, clamp((y - 0.1) * 5)), {});
  }
  const hairNode = new THREE.Group(); hairNode.position.copy(headMesh.position); head.add(hairNode);
  tagMesh(hairNode.add(new THREE.Mesh(hair.build(), hairMat)) && hairNode.children[0], 'cloth');
  // ---- arms
  const armOf = (s) => {
    const n = node(chest, P(s * 0.2, 1.45, 0), P(0, 1.14, 0)), a = new Bag();
    const E = P(s * 0.035, -0.27, s > 0 ? 0.0 : 0.02), W = P(s * 0.06, -0.5, s > 0 ? 0.03 : 0.08);
    limb(a, P(0, 0, 0), E, 0.044, 0.034, SKIN, { seg: 8 });
    limb(a, E, W, 0.034, 0.025, SKIN, { seg: 8 });
    bandAt(a, P(0, 0, 0), E, 0.52, 0.042, 0.012, GOLD, { seg: 10 });
    limb(a, E.clone().lerp(W, 0.1), E.clone().lerp(W, 0.85), 0.038, 0.032, (x, y) => mixHex(BRL, BR, clamp((-0.3 - y) * 3)), { seg: 10, caps: 'flat' });
    for (const t of [0.12, 0.5, 0.85]) bandAt(a, E, W, t, 0.036 - t * 0.006, 0.012, GOLD, { seg: 10 });
    const bm = new M4().compose(W.clone().add(P(s * 0.003, -0.012, 0.004)), new Q().setFromEuler(new THREE.Euler(-0.08, 0, s * 0.07)), v3(1, 1, 1));
    hand(a, bm, s, SKIN, 0.92, 0.42, { tip: mixHex(SKIN, 0xe0a974, 0.25) });
    // layered pauldron
    for (const [r, dy, rl, sc] of [[0.078, 0.0, IV, 1], [0.07, -0.03, BRL, 0.95], [0.062, -0.06, BR, 0.9]]) {
      a.add(new THREE.SphereGeometry(r, 10, 4, 0, TAU, 0, 1.45), (x, y) => mixHex(rl, BRD, clamp((-y + 0.02) * 4) * 0.35), { p: [s * 0.03, 0.04 + dy, 0], s: [1.2 * sc, 0.62, 1.15 * sc], r: [0, 0, -s * 0.45] });
    }
    const d = v3(s * 0.9, 0.4, 0).normalize();
    a.add(new THREE.ConeGeometry(0.04, 0.11, 6), IV, { m: new M4().compose(P(s * 0.085, 0.07, 0), new Q().setFromUnitVectors(UP, d), v3(1, 1, 0.55)), flat: true });
    a.add(new THREE.ConeGeometry(0.03, 0.09, 6), GOLD, { m: new M4().compose(P(s * 0.075, 0.015, 0), new Q().setFromUnitVectors(UP, v3(s * 0.8, -0.2, 0).normalize()), v3(1, 1, 0.55)), flat: true });
    const m = new THREE.Mesh(a.build(), metalMat); tagMesh(m, 'skin'); n.add(m); return n;
  };
  const armL = armOf(1), armR = armOf(-1);
  // ---- ivory flowing gown panels
  const mk = (A, Bt, wT, wB, side, out, bow, ph, amp, pointed = 0.7) => ({
    cols: 5, rows: 12,
    color: (u, v) => mixHex(mixHex(IV, IV2, v * 0.55 + 0.1 * Math.abs(2 * u - 1)), 0xe9b44e, sstep(0.95, 1, v)),
    base(u, v, o) {
      const w = lerp(wT, wB, v) * 1.25, wu = (u - 0.5) * w * (1 - pointed * sstep(0.8, 1, v) * 0.85), bw = bow * Math.sin(Math.PI * v * 0.9);
      o.set(lerp(A.x, Bt.x, v) + side.x * wu + out.x * bw, lerp(A.y, Bt.y, v) + side.y * wu + out.y * bw, lerp(A.z, Bt.z, v) + side.z * wu + out.z * bw);
    },
    sway(u, v, t, k, o) {
      const a = amp * Math.pow(v, 1.4) * (Math.sin(t * 1.15 + ph + v * 2.4 + u * 1.2) + 0.4 * Math.sin(t * 2.1 + ph * 2 + v * 4)) * (1 + 0.7 * k);
      o.x += out.x * a; o.y += out.y * a * 0.5; o.z += out.z * a; o.x += side.x * a * 0.15; o.z += side.z * a * 0.15;
    },
  });
  const sheets = [
    mk(P(0, 1.02, 0.115), P(0, 0.12, 0.24), 0.24, 0.2, P(1, 0, 0), P(0, 0.2, 1).normalize(), 0.04, 0, 0.04),
    mk(P(0.1, 1.02, 0.05), P(0.36, 0.06, 0.07), 0.24, 0.26, P(0, 0, 1), P(1, 0, 0), 0.05, 1.5, 0.05),
    mk(P(-0.1, 1.02, 0.05), P(-0.32, 0.3, 0.1), 0.22, 0.22, P(0, 0, 1), P(-1, 0, 0), 0.04, 3.1, 0.05),
    mk(P(0, 1.02, -0.1), P(0, 0.03, -0.48), 0.3, 0.36, P(1, 0, 0), P(0, 0.2, -1).normalize(), 0.06, 2.2, 0.07),
    mk(P(0.07, 1.02, 0.1), P(0.22, 0.3, 0.22), 0.14, 0.13, P(0.5, 0, -0.2).normalize(), P(0.3, 0, 1).normalize(), 0.03, 0.8, 0.035),
    mk(P(-0.07, 1.02, 0.1), P(-0.2, 0.44, 0.2), 0.14, 0.13, P(0.5, 0, 0.2).normalize(), P(-0.3, 0, 1).normalize(), 0.03, 4, 0.035),
    mk(P(0.1, 1.02, -0.06), P(0.26, 0.12, -0.28), 0.2, 0.22, P(0.4, 0, 0.8).normalize(), P(0.8, 0, -0.4).normalize(), 0.03, 5.2, 0.05),
    mk(P(-0.1, 1.02, -0.06), P(-0.24, 0.2, -0.24), 0.2, 0.2, P(0.4, 0, -0.8).normalize(), P(-0.8, 0, -0.4).normalize(), 0.03, 6.1, 0.05),
  ];
  const cloth = new Cloth(sheets, clothMat); tagMesh(cloth.mesh, 'cloth'); rig.add(cloth.mesh);
  // ---- orbiting lit clock discs (instanced) + thin gold rings
  const disc = new Bag();
  disc.add(new THREE.CylinderGeometry(0.1, 0.1, 0.014, 16), (x, y, z) => mixHex(0xfdf6e4, 0xf0dcae, Math.hypot(x, y) / 0.1 * 0.8), { r: [Math.PI / 2, 0, 0] });
  disc.add(new THREE.TorusGeometry(0.104, 0.0085, 4, 16), (x, y) => mixHex(GOLD, 0xffe39a, (x + 0.1) * 4), {});
  for (let i = 0; i < 12; i += 3) { const a = i / 12 * TAU, big = true; disc.add(new THREE.BoxGeometry(big ? 0.012 : 0.006, big ? 0.028 : 0.016, 0.005), 0x9a6414, { p: [Math.sin(a) * 0.075, Math.cos(a) * 0.075, 0.009], r: [0, 0, -a] }); }
  disc.add(new THREE.BoxGeometry(0.008, 0.064, 0.005), 0x6a410e, { p: [0, 0.028, 0.012] });
  disc.add(new THREE.BoxGeometry(0.01, 0.045, 0.005), 0x6a410e, { p: [0.014, -0.006, 0.014], r: [0, 0, 2.2] });
  disc.add(sphG(6, 4), GOLD, { p: [0, 0, 0.014], s: [0.014, 0.014, 0.008] });
  
  const discMat = stdMat({ roughness: 0.38, metalness: 0.25, emissive: 0xffdca0, emissiveIntensity: 0.28 }), N = 4;
  const discs = new THREE.InstancedMesh(disc.build(), discMat, N); discs.frustumCulled = false; tagMesh(discs, 'brass');
  const rings = new THREE.InstancedMesh(prep(new THREE.TorusGeometry(1, 0.0055, 3, 32), 0xffe7a0, {}), stdMat({ roughness: 0.3, metalness: 0.5, emissive: 0xffdca0, emissiveIntensity: 0.55 }), N); rings.frustumCulled = false; tagMesh(rings, 'brass');
  const orbit = [
    { c: [0, 1.5, 0], R: 0.54, n: [0.5, 1, 0.2], w: 0.55, ph: 0.2 }, { c: [0, 1.18, 0], R: 0.66, n: [-0.4, 1, 0.5], w: -0.42, ph: 1.9 },
    { c: [0, 0.86, 0], R: 0.62, n: [0.25, 1, -0.5], w: 0.5, ph: 3.5 }, { c: [0, 0.54, 0], R: 0.7, n: [-0.45, 1, -0.2], w: -0.38, ph: 5.0 },
    { c: [0, 1.76, 0], R: 0.48, n: [0.1, 1, -0.7], w: 0.62, ph: 4.2 },
  ];
  const dummy = new THREE.Object3D(), tmpV = new V3(), tgt = new V3();
  for (const o of orbit) { const n = v3(...o.n).normalize(), q = new Q().setFromUnitVectors(v3(0, 0, 1), n); o.q = q; o.u = v3(1, 0, 0).applyQuaternion(q); o.v = v3(0, 1, 0).applyQuaternion(q); o.cv = v3(...o.c); }
  orbit.forEach((o, i) => { dummy.position.copy(o.cv); dummy.quaternion.copy(o.q); dummy.scale.setScalar(o.R); dummy.updateMatrix(); rings.setMatrixAt(i, dummy.matrix); });
  rig.add(discs); rig.add(rings);
  const cc = castCtl(); let spin = 0;
  const R = { pelvis, chest, chestMesh, head }, blink = blinker(lids);
  return {
    group, gloveColor: 0xc07a3a,
    cast() { cc.go(); },
    update(dt, t) {
      const k = cc.step(dt);
      idlePose(R, t, { hip: 0.05, chest: -0.06, head: 0.03, shift: 0.012, headY: -0.05 });
      blink(t, dt);
      hairNode.rotation.z = 0.02 * Math.sin(t * 1.1);
      cloth.update(t, k);
      spin += dt * (1 + 3.5 * k);
      for (let i = 0; i < N; i++) {
        const o = orbit[i], a = o.ph + spin * o.w;
        tmpV.copy(o.cv).addScaledVector(o.u, Math.cos(a) * o.R).addScaledVector(o.v, Math.sin(a) * o.R);
        dummy.position.copy(tmpV); tgt.set(tmpV.x * 2, tmpV.y, tmpV.z * 2);
        dummy.scale.setScalar(1 + 0.3 * k); dummy.lookAt(tgt); dummy.updateMatrix(); discs.setMatrixAt(i, dummy.matrix);
      }
      discs.instanceMatrix.needsUpdate = true;
      const th = 0.85 * k;
      armL.rotation.z = th + 0.02 * Math.sin(t * 1.4); armR.rotation.z = -th - 0.02 * Math.sin(t * 1.4 + 1);
      armL.rotation.x = -1.1 * k; armR.rotation.x = -1.1 * k;
      metalMat.emissiveIntensity = 0.45 + 0.9 * k; discMat.emissiveIntensity = 0.28 + 0.4 * k;
    },
  };
}

// ================================================================= 3. PRISM (Prisma)
function galaxyTexture() {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 120);
  gr.addColorStop(0, 'rgba(255,245,255,1)'); gr.addColorStop(0.1, 'rgba(255,130,235,.95)'); gr.addColorStop(0.35, 'rgba(150,70,255,.5)'); gr.addColorStop(0.7, 'rgba(60,40,200,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 380; i++) {
    const t = i / 380, a = t * 5.6 + arm * TAU / 3 + (hash2(i, arm) - 0.5) * 0.4, r = 8 + t * 108 + (hash2(arm, i) - 0.5) * 12;
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.94;
    g.fillStyle = `hsla(${310 - t * 110},95%,${78 - t * 28}%,${0.95 - t * 0.5})`; g.beginPath(); g.arc(x, y, 1.2 + hash2(i, 3) * 2, 0, TAU); g.fill();
  }
  g.fillStyle = '#fff'; g.fillRect(0, 0, 6, 6); // white texel block used by the star points (uv 0..0.02)
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2; return tex;
}
// diamond lattice on a parametric closed tube. S(uu, vv, out) uu in [0,nu), vv in [0,nv]; axis(vv,out)
function lattice(bag, S, axis, nu, nv, colorFn, inset = 0.86, k0 = 0, k1 = nv) {
  const gp = [], gc = [], op = [], oc = [];
  const CP = [new V3(), new V3(), new V3(), new V3()], I = [new V3(), new V3(), new V3(), new V3()], cen = new V3(), ax = new V3(), nrm = new V3(), e1 = new V3(), e2 = new V3();
  const tri = (arr, carr, a, b, c, flip, col, al) => {
    if (flip) { const t = b; b = c; c = t; }
    e1.subVectors(b, a); e2.subVectors(c, a); if (e1.cross(e2).lengthSq() < 1e-12) return;
    for (const p of [a, b, c]) { arr.push(p.x, p.y, p.z); carr.push(col.r, col.g, col.b, al); }
  };
  const gold = new THREE.Color(0xf0b43a), cc = new THREE.Color();
  for (let k = k0; k <= k1; k++) for (let i = 0; i < nu; i++) {
    const cx = i + 0.5 * (k & 1), cy = k;
    S(cx, clamp(cy - 1, 0, nv), CP[0]); S(cx + 0.5, cy, CP[1]); S(cx, clamp(cy + 1, 0, nv), CP[2]); S(cx - 0.5, cy, CP[3]);
    cen.set(0, 0, 0); for (const p of CP) cen.add(p); cen.multiplyScalar(0.25);
    axis(cy, ax);
    nrm.subVectors(CP[1], CP[0]).cross(e1.subVectors(CP[2], CP[0]));
    const flip = nrm.dot(e2.subVectors(cen, ax)) < 0;
    for (let m = 0; m < 4; m++) I[m].copy(cen).lerp(CP[m], inset);
    const [hex, al] = colorFn(i, k, cen);
    cc.set(hex);
    tri(gp, gc, I[0], I[1], I[2], flip, cc, al); tri(gp, gc, I[0], I[2], I[3], flip, cc, al);
    for (let m = 0; m < 4; m++) { const n2 = (m + 1) % 4; tri(op, oc, CP[m], CP[n2], I[n2], flip, gold, 1); tri(op, oc, CP[m], I[n2], I[m], flip, gold, 1); }
  }
  const mkG = (pos, col) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.computeVertexNormals(); return g; };
  bag.add(mkG(gp, gc), null, {}); bag.add(mkG(op, oc), null, {});
}
function glassPalette(i, k, v) {
  const r = hash2(i + 3, k * 1.7), b = 0.78 + 0.3 * hash2(k, i + 9);
  let pal;
  if (v < 0.42) pal = [0xe8a317, 0x0fb9b0, 0xe0308a, 0xf06a20, 0x7a3cd8, 0xe860b8, 0x2a5ff0, 0x0fb9b0];
  else if (v < 0.8) pal = [0x7a3cd8, 0xe0308a, 0x4a4fe6, 0xaa44e8, 0x1ab0d8, 0xe8a317];
  else pal = [0x6a3ce8, 0x2a5ff0, 0xe0308a, 0x13aac8, 0x9a44f0];
  return shade(pal[Math.floor(r * pal.length) % pal.length], b);
}
const toRGBA = (bag, a = 0.9) => { bag.g = bag.g.map((g) => { const c = g.attributes.color; if (c.itemSize === 4) return g; const n = c.count, arr = new Float32Array(n * 4); for (let i = 0; i < n; i++) { arr[i * 4] = c.getX(i); arr[i * 4 + 1] = c.getY(i); arr[i * 4 + 2] = c.getZ(i); arr[i * 4 + 3] = a; } g.setAttribute('color', new THREE.BufferAttribute(arr, 4)); return g; }); return bag; };
function glassMaterial() { // glass with a cheap fresnel rim (one fragment line), no transmission pass
  const m = stdMat({ roughness: 0.14, metalness: 0.08, transparent: true, depthWrite: false, emissive: 0x1a0a40, emissiveIntensity: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      float fr = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);
      gl_FragColor.rgb += vec3(0.5, 0.72, 1.0) * fr * 0.85;
      gl_FragColor.a = clamp(gl_FragColor.a + fr * 0.5, 0.0, 1.0);`);
  };
  m.customProgramCacheKey = () => 'prisma-glass';
  return m;
}
function buildPrism() {
  const group = new THREE.Group(), rig = new THREE.Group(); group.add(rig);
  const P = v3, A = 0.9;
  const glassMat = glassMaterial(), eyeMat = basicMat();
  const tab = [[0, 0.56, 0.54], [0.08, 0.45, 0.43], [0.2, 0.31, 0.28], [0.4, 0.19, 0.165], [0.6, 0.15, 0.125], [0.8, 0.13, 0.108], [0.92, 0.12, 0.096], [1.05, 0.088, 0.07], [1.15, 0.092, 0.076], [1.28, 0.122, 0.094], [1.36, 0.16, 0.086], [1.43, 0.085, 0.058]];
  const NU = 12, NV = 18, YT = 1.43, KS = 12; // split row (gown / bodice)
  const yAt = (vv) => YT * (vv / NV);
  const body = (uu, vv, o) => { const y = yAt(vv), [rx, rz] = interp(tab, y), a = uu / NU * TAU; o.set(rx * Math.sin(a), y, rz * Math.cos(a)); };
  const bodyAxis = (vv, o) => o.set(0, yAt(vv), 0);
  const chestC = P(0, 1.24, 0.09);
  const colF = (i, k, c) => [glassPalette(i, k, yAt(k) / YT), c.distanceTo(chestC) < 0.1 ? 0.1 : A];
  // lower gown (static)
  const gown = new Bag(); lattice(gown, body, bodyAxis, NU, NV, colF, 0.86, 1, KS - 1);
  rig.add(tagMesh(new THREE.Mesh(toRGBA(gown, A).build(), glassMat), 'glass'));
  // pelvis + chest nodes
  const pelvis = node(rig, P(0, 0.95, 0), P(0, 0, 0)); pelvis.rotation.z = 0.04;
  const chest = node(pelvis, P(0, 1.02, 0), P(0, 0.95, 0)); chest.rotation.z = -0.05;
  const chestMesh = new THREE.Group(); chestMesh.userData.abs = chest.userData.abs; chest.add(chestMesh);
  const up = new Bag(); lattice(up, body, bodyAxis, NU, NV, colF, 0.86, KS, NV);
  limb(up, P(0, 1.38, 0), P(0, 1.61, 0.012), 0.04, 0.034, 0x4d8ff0, { seg: 9, a: A, caps: 'none' });
  up.add(SPH(0.05, 10, 6), 0x5aa0ff, { p: [0, 1.4, 0], s: [1.3, 0.5, 0.9], a: A });
  meshOn(chestMesh, toRGBA(up, A), glassMat, 'glass');
  // galaxy core with depth: textured spiral disc + core + parallax stars (one additive draw)
  const gTex = galaxyTexture();
  const galMat = new THREE.MeshBasicMaterial({ map: gTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); galMat.forceSinglePass = true;
  const gal = new Bag();
  const uvAt = (g, u, v) => { const n = g.attributes.position.count, a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; } g.setAttribute('uv', new THREE.BufferAttribute(a, 2)); return g; };
  const galGeoms = [];
  const disc = new THREE.CircleGeometry(0.105, 24); // uv from circle
  const addColored = (g, col, tr, uvc) => { const gg = g.index ? g.toNonIndexed() : g.clone(); gg.applyMatrix4(tr); if (uvc) { gg.deleteAttribute('uv'); uvAt(gg, uvc[0], uvc[1]); } const n = gg.attributes.position.count, c = new Float32Array(n * 3); _c.set(col); for (let i = 0; i < n; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; } gg.setAttribute('color', new THREE.BufferAttribute(c, 3)); if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2)); gg.deleteAttribute('normal'); galGeoms.push(gg); };
  const galPivot = new THREE.Group(); galPivot.position.set(0, 1.24 - chest.userData.abs.y, 0.035); chestMesh.add(galPivot);
  addColored(disc, 0xb0b0c0, new M4(), null);
  addColored(new THREE.CircleGeometry(0.06, 18), 0x909098, new M4().makeTranslation(0, 0, 0.03), null); // inner bright layer: reads as depth through parallax
  addColored(new THREE.IcosahedronGeometry(0.016, 1), 0x806880, new M4().makeTranslation(0, 0, 0.016), [0.5, 0.5]);
  for (let i = 0; i < 36; i++) { // stars scattered through the torso volume
    const a = hash2(i, 1) * TAU, rr = Math.sqrt(hash2(i, 2)) * 0.085, z = (hash2(i, 5) - 0.3) * 0.12, y = (hash2(i, 7) - 0.5) * 0.26, sz = 0.004 + 0.004 * hash2(i, 9);
    const hue = hash2(i, 11); _c.setHSL(0.5 + hue * 0.45, 0.9, 0.78);
    addColored(new THREE.OctahedronGeometry(sz, 0), _c.getHex(), new M4().makeTranslation(Math.cos(a) * rr, y, z - 0.01), [0.005, 0.005]);
  }
  const galMesh = new THREE.Mesh(mergeGeometries(galGeoms, false), galMat); galMesh.renderOrder = 2; tagMesh(galMesh, 'neon'); galMesh.frustumCulled = false;
  // two-layer parallax: split discs from stars is unnecessary; rotate whole mesh slowly, discs are already in the same plane family
  galPivot.add(galMesh);
  // ---- head (glass, sculpted)
  const head = node(chest, P(0, 1.47, 0.01), P(0, 1.02, 0));
  const S = { rx: 0.082, ry: 0.11, rz: 0.094, jaw: 0.32, chin: 0.012, cheek: 0.02, brow: 0.004, sock: 0.009, muzzle: 0.006, fore: 0.004, ear: 0.9,
    eye: { a: 0.46, e: 0.085, r: 0.0165, sink: 0.55, iris: 0.82, pupil: 0.3, col: 0x3ae8ff, col2: 0xffffff, sy: 0.95, openA: -0.52, closeA: 0.5, lashes: 7, liner: 1.2, yaw: 0.3, cross: 0.01 },
    nose: { e: -0.2, len: 0.014, r: 0.0085, wa: 0.085, bridge: 1 },
    mouth: { w: 0.4, e: -0.5, smile: 0.03, open: 0, lipU: 0.0085, lipL: 0.011 },
    brows: { a0: 0.13, a1: 0.68, e: 0.3, arch: 0.05, tilt: 0.03, th: 0.0032, col: 0x7a4ae0 } };
  const eyeBag = new Bag();
  const K = { skin: 0x74a8ff, skin2: 0x3a46d0, blush: 0xe27ad8, blushAmt: 0.4, skinHi: 0xcfe8ff, lip: 0xe0309a, lip2: 0xea4aa8, lash: 0x2a1a7a, crease: 0x6a1a7a, sclera: 0xa8ecff, scleraEdge: 0x3a8ae0, limbal: 0x1a6ae0, pupil: 0x4a1ab0, eyeBag };
  const hb = new Bag(), { lids } = buildHead(hb, S, K); toRGBA(hb, 0.9);
  const headMesh = new THREE.Mesh(hb.build(), glassMat); tagMesh(headMesh, 'glass'); headMesh.position.set(0, 0.2, 0.012); head.add(headMesh); finishHead(headMesh, lids);
  const eyeMesh = new THREE.Mesh(eyeBag.build(), eyeMat); tagMesh(eyeMesh, 'neon'); eyeMesh.position.copy(headMesh.position); head.add(eyeMesh);
  // ---- crown of curling glass ribbons (head-local, double-sided strips + gold thread)
  const crown = new Bag();
  const ribbon = (pts, w0, colFn, tw = 3) => {
    const n = 22, Pp = curvePts(pts, n), Tn = [], pos = [], col = [], idx = [];
    for (let i = 0; i <= n; i++) Tn.push(Pp[Math.min(n, i + 1)].clone().sub(Pp[Math.max(0, i - 1)]).normalize());
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = new V3().crossVectors(Tn[i], UP); if (a.lengthSq() < 1e-4) a.set(1, 0, 0); a.normalize(); const b = new V3().crossVectors(Tn[i], a);
      const th = u * tw, s = a.multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th)), w = w0 * (1 - u * 0.8) + 0.002;
      _c.set(colFn(u));
      for (const sg of [-1, 1]) { pos.push(Pp[i].x + s.x * w * sg, Pp[i].y + s.y * w * sg, Pp[i].z + s.z * w * sg); col.push(_c.r, _c.g, _c.b, 0.9); }
    }
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
    crown.add(g, null, {});
    crown.add(sweep(Pp, (u) => 0.0032 * (1 - u * 0.6), 3), 0xf3b83a, { a: 1 });
  };
  const cpal = [0x1fc9bd, 0xe8359f, 0xf5b52b, 0x8a42e6, 0x3d6be8, 0xff7e3d, 0x1fc9bd, 0xe8359f];
  for (let k = 0; k < 8; k++) {
    const a0 = k / 8 * TAU + 0.3, hh = hash2(k, 2), pts = [], dir = k % 2 ? 1 : -1;
    for (let i = 0; i <= 14; i++) {
      const sN = i / 14, th = sN * sN * TAU * (0.9 + 0.3 * hh) * dir, cr = 0.03 + 0.15 * sN;
      const rad = 0.06 + 0.07 * sN + cr * Math.sin(th), a = a0 + sN * 0.9 * dir;
      pts.push(v3(Math.sin(a) * rad, 0.09 + 0.5 * Math.pow(sN, 0.85) * (0.75 + 0.3 * hh) + cr * (1 - Math.cos(th)) * 0.8, Math.cos(a) * rad - 0.01));
    }
    ribbon(pts, 0.04 + 0.012 * hash2(k, 7), (u) => mixHex(cpal[k], cpal[(k + 2) % 8], u), 2.5 + k * 0.3);
  }
  crown.add(new THREE.TorusGeometry(0.066, 0.006, 5, 20), 0xf3b83a, { p: [0, 0.085, -0.008], r: [Math.PI / 2, 0, 0], a: 1 });
  crown.add(new THREE.SphereGeometry(0.07, 14, 5, 0, TAU, 0, 0.55), (x, y) => mixHex(0x7a3cd8, 0x1fc9bd, clamp((y - 0.08) * 12)), { p: [0, 0.035, -0.008], a: 0.9 });
  const crownNode = new THREE.Group(); crownNode.position.copy(headMesh.position); head.add(crownNode);
  const crownMat = glassMat.clone(); crownMat.side = THREE.DoubleSide; crownMat.forceSinglePass = true; crownMat.onBeforeCompile = glassMat.onBeforeCompile; crownMat.customProgramCacheKey = () => 'prisma-glass';
  crownNode.add(tagMesh(new THREE.Mesh(toRGBA(crown, 0.9).build(), crownMat), 'glass'));
  // ---- arms (glass lattice tubes + glass hands)
  const armOf = (s) => {
    const n = node(chest, P(s * 0.15, 1.38, 0), P(0, 1.02, 0)), a = new Bag();
    const E = P(s * 0.05, -0.27, 0.0), W = P(s * 0.09, -0.5, 0.045);
    const Pt = (v, o) => { const m = 1 - v, c = P(s * 0.015, -0.29, 0); o.set(2 * m * v * c.x + v * v * W.x, 2 * m * v * c.y + v * v * W.y, 2 * m * v * c.z + v * v * W.z); };
    const nu = 6, nv = 6, rad = (v) => lerp(0.034, 0.02, v);
    const Sf = (uu, vv, o) => { Pt(vv / nv, o); const r = rad(vv / nv), ang = uu / nu * TAU; o.x += Math.sin(ang) * r; o.z += Math.cos(ang) * r; };
    lattice(a, Sf, (vv, o) => Pt(vv / nv, o), nu, nv, (i, k) => [glassPalette(i, k + 5, 0.9 - k * 0.12), A], 0.85, 1, nv);
    a.add(SPH(0.045, 9, 6), 0x7a3cd8, { p: [0, 0, 0], a: 0.92 });
    const bm = new M4().compose(W.clone().add(P(s * 0.004, -0.006, 0.004)), new Q().setFromEuler(new THREE.Euler(-0.1, 0, s * 0.18)), v3(1, 1, 1));
    hand(a, bm, s, 0x9fd8ff, 0.92, 0.3, { tip: 0xf5c04a, palmCol: 0x7fb8ff, hseg: 4 });
    const m = new THREE.Mesh(toRGBA(a, A).build(), glassMat); tagMesh(m, 'glass'); n.add(m); return n;
  };
  const armL = armOf(1), armR = armOf(-1);
  // ---- cast beams (additive cones)
  const beamGeo = (() => {
    const g = new THREE.CylinderGeometry(0.02, 0.1, 3.2, 10, 6, true); g.translate(0, -1.6, 0);
    const p = g.attributes.position, n = p.count, col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const u = clamp(-p.getY(i) / 3.2); _c.setHSL(0.93 - u * 0.5, 1, 0.62 - u * 0.12); col[i * 4] = _c.r; col[i * 4 + 1] = _c.g; col[i * 4 + 2] = _c.b; col[i * 4 + 3] = 0.75 * (1 - u * u); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.deleteAttribute('uv'); return g;
  })();
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); beamMat.forceSinglePass = true;
  const beams = [];
  for (const [g, s] of [[armL, 1], [armR, -1]]) { const b = new THREE.Mesh(beamGeo, beamMat); tagMesh(b, 'neon'); b.position.set(s * 0.09, -0.52, 0.045); b.visible = false; b.frustumCulled = false; g.add(b); beams.push(b); }
  const cc = castCtl(), R = { pelvis, chest, chestMesh, head }, blink = blinker(lids);
  return {
    group, gloveColor: 0xb35cff,
    cast() { cc.go(); },
    update(dt, t) {
      const k = cc.step(dt);
      idlePose(R, t, { hip: 0.04, chest: -0.05, head: 0.025, shift: 0.01, headY: -0.04 });
      blink(t, dt);
      crownNode.rotation.z = 0.04 * Math.sin(t * 0.9); crownNode.rotation.x = 0.03 * Math.sin(t * 0.7 + 1);
      galPivot.rotation.z = -t * 0.35; galPivot.scale.setScalar(1 + 0.05 * Math.sin(t * 1.4) + 0.4 * k);
      glassMat.emissiveIntensity = 0.5 + 0.15 * Math.sin(t * 1.2) + 1.0 * k;
      const wv = 0.04 * Math.sin(t * 1.2);
      armL.rotation.x = armR.rotation.x = -1.45 * k; armL.rotation.z = wv + 0.3 * k; armR.rotation.z = -0.04 * Math.sin(t * 1.2 + 1) - 0.3 * k;
      for (const b of beams) { b.visible = k > 0.03; b.scale.set(0.6 + 0.4 * k, k, 0.6 + 0.4 * k); }
    },
  };
}

// ================================================================= 4. VERDANT
function vineTexture(emissive) {
  if (typeof document === 'undefined') return null;
  const W = 256, Ht = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = Ht;
  const g = cv.getContext('2d');
  if (emissive) { g.fillStyle = '#000'; g.fillRect(0, 0, W, Ht); } else {
    const gr = g.createLinearGradient(0, 0, 0, Ht); gr.addColorStop(0, 'rgba(24,150,92,0.66)'); gr.addColorStop(1, 'rgba(20,170,110,0.42)');
    g.fillStyle = gr; g.fillRect(0, 0, W, Ht);
  }
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lime = emissive ? '#b8ff3a' : 'rgba(205,255,110,0.95)';
  const branch = (x, y, ang, len, w, depth) => {
    g.strokeStyle = lime; g.fillStyle = lime; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y);
    let cx = x, cy = y, a = ang; const steps = 9;
    for (let i = 0; i < steps; i++) {
      a += (rnd() - 0.5) * 0.7; const nx = cx + Math.cos(a) * len / steps, ny = cy + Math.sin(a) * len / steps;
      g.quadraticCurveTo(cx + Math.cos(a + 0.6) * 4, cy + Math.sin(a + 0.6) * 4, nx, ny); cx = nx; cy = ny;
      if (i % 2 === 1) { const sd = (i % 4 === 1 ? 1 : -1); g.stroke(); g.save(); g.translate(cx, cy); g.rotate(a + sd * 1.0); g.beginPath(); g.ellipse(7, 0, 9, 3.2, 0, 0, TAU); g.fill(); g.restore(); g.beginPath(); g.moveTo(cx, cy); }
      if (depth > 0 && i === 4) { g.stroke(); branch(cx, cy, a + (rnd() > 0.5 ? 0.9 : -0.9), len * 0.55, Math.max(1, w * 0.7), depth - 1); g.beginPath(); g.moveTo(cx, cy); }
    }
    g.stroke();
  };
  for (let i = 0; i < 9; i++) branch(14 + i * 28 + rnd() * 10, Ht - 4, -Math.PI / 2 + (rnd() - 0.5) * 0.5, 230 + rnd() * 170, 3, 2);
  for (let i = 0; i < 4; i++) branch(rnd() * W, 4, Math.PI / 2 + (rnd() - 0.5) * 0.8, 120 + rnd() * 60, 2.4, 1);
  g.strokeStyle = emissive ? '#5fae1c' : 'rgba(60,220,140,.9)'; g.lineWidth = 6; g.strokeRect(2, 2, W - 4, Ht - 4);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
function buildVerdant(opts = {}) {
  const group = new THREE.Group(), rig = new THREE.Group(); group.add(rig);
  const SKIN = 0xb47c55, SKIN2 = 0x8a5a3a, CH = 0x3a4540, CHD = 0x232a28, BLK = 0x16181a, LEATH = 0x3b2a1e, LIME = 0xb9ff3c, HAIRC = 0x1c130f, MOSS = 0x2f5a3a;
  const P = v3;
  const armorMat = stdMat({ roughness: 0.55, metalness: 0.2, emissive: 0x0a140a, emissiveIntensity: 0.5 }), skinMat = stdMat({ roughness: 0.58 }), hairMat = stdMat({ roughness: 0.62 });
  const glowMat = basicMat();
  const scaleCol = (base) => (x, y, z) => shade(base, 0.72 + 0.6 * hash2(Math.round(x * 90) + y * 33, Math.round(z * 90)));
  const sCH = scaleCol(CH);
  // ---- legs (static contrapposto: weight on right leg)
  const legs = new Bag();
  const LP = { '-1': { hip: P(-0.1, 0.95, 0), knee: P(-0.105, 0.52, 0.015), ank: P(-0.095, 0.1, 0), yaw: 0.04 }, '1': { hip: P(0.1, 0.94, 0), knee: P(0.125, 0.52, 0.07), ank: P(0.14, 0.1, 0.0), yaw: 0.3 } };
  for (const s of [-1, 1]) {
    const { hip, knee, ank, yaw } = LP[s];
    limb(legs, hip, knee, 0.088, 0.068, CHD, { seg: 9 });
    limb(legs, knee, ank, 0.064, 0.05, CHD, { seg: 8 });
    for (let r = 0; r < 5; r++) {
      const t = 0.1 + r * 0.17, c = hip.clone().lerp(knee, t), rad = lerp(0.088, 0.068, t) + 0.004;
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + (r % 2) * 0.39, n = P(Math.sin(a), 0, Math.cos(a)); leaf(legs, c.clone().addScaledVector(n, rad), n, P(0, -1, 0), 0.075, 0.1, 0.012, sCH, 0.3); }
    }
    blob(legs, [knee.x, knee.y + 0.005, knee.z + 0.058], [0.062, 0.062, 0.03], CH, 10, 6);
    // boot
    const bx = ank.x, bz = ank.z, ca = Math.cos(yaw), sa = Math.sin(yaw);
    limb(legs, P(bx, 0.06, bz), P(bx + 0.005, 0.45, bz + 0.005), 0.068, 0.078, BLK, { seg: 10 });
    legs.add(sboxG(0.17, 0.1, 0.3, 3.2, 10), BLK, { p: [bx + sa * 0.06, 0.05, bz + ca * 0.06], r: [0, yaw, 0] });
    legs.add(sboxG(0.18, 0.025, 0.32, 3, 8), 0x0a0b0c, { p: [bx + sa * 0.06, 0.012, bz + ca * 0.06], r: [0, yaw, 0] });
    bandAt(legs, P(bx, 0.06, bz), P(bx + 0.005, 0.45, bz + 0.005), 0.5, 0.078, 0.03, LEATH, { seg: 10 });
    bandAt(legs, P(bx, 0.06, bz), P(bx + 0.005, 0.45, bz + 0.005), 0.85, 0.083, 0.03, LEATH, { seg: 10 });
    legs.add(sboxG(0.12, 0.08, 0.05, 3, 8), CH, { p: [bx, 0.43, bz + 0.07], r: [0.4, 0, 0] });
  }
  rig.add(tagMesh(new THREE.Mesh(legs.build(), armorMat), 'cloth'));
  // ---- pelvis + chest
  const pelvis = node(rig, P(0, 0.95, 0), P(0, 0, 0)); pelvis.rotation.z = -0.04; pelvis.position.x = -0.01;
  const tab = [[0.86, 0.16, 0.11], [0.96, 0.152, 0.106], [1.06, 0.15, 0.104], [1.14, 0.17, 0.11], [1.26, 0.195, 0.118], [1.38, 0.21, 0.122], [1.46, 0.17, 0.1]];
  const tr = (y) => interp(tab, y);
  const pb = new Bag();
  pb.add(ellTube([[0.86, 0.16, 0.11], [0.96, 0.152, 0.106], [1.06, 0.15, 0.104], [1.14, 0.158, 0.106]], 20, false, true), CHD, {});
  pb.add(ellTube([[0.955, 0.158, 0.113], [1.03, 0.153, 0.109]], 20, false), LEATH, {});
  pb.add(sboxG(0.06, 0.055, 0.025, 3, 8), 0x7a7d70, { p: [0, 0.995, 0.115] });
  for (const [x, z, ry] of [[-0.145, 0.07, 0.5], [0.155, 0.06, -0.5], [0.0, -0.12, 0]]) {
    pb.add(sboxG(0.075, 0.095, 0.05, 3, 8), LEATH, { p: [x, 0.93, z], r: [0, ry, 0] });
    pb.add(sboxG(0.078, 0.03, 0.054, 3, 8), shade(LEATH, 1.3), { p: [x, 0.968, z], r: [0, ry, 0] });
  }
  for (let r = 0; r < 3; r++) { const y = 1.1 - r * 0.055, [rx, rz] = tr(y); for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + (r % 2) * 0.22, n = P(Math.sin(a) * rz, 0, Math.cos(a) * rx).normalize(); leaf(pb, P(rx * Math.sin(a), y, rz * Math.cos(a)).addScaledVector(n, 0.006), n, P(0, -1, 0), 0.085, 0.09, 0.014, sCH, 0.3); } }
  meshOn(pelvis, pb, armorMat, 'foliage');
  const chest = node(pelvis, P(0, 1.14, 0), P(0, 0.95, 0)); chest.rotation.z = 0.06;
  const chestMesh = new THREE.Group(); chestMesh.userData.abs = chest.userData.abs; chest.add(chestMesh);
  const cb = new Bag();
  cb.add(ellTube(tab.filter((r) => r[0] >= 1.12).map((r) => [r[0], r[1], r[2]]).concat([[1.5, 0.07, 0.06]]), 22, true, false, 2.2), CHD, {});
  for (let r = 0; r < 7; r++) {
    const y = 1.42 - r * 0.048, [rx, rz] = tr(y), cnt = 14;
    for (let k = 0; k < cnt; k++) { const a = k / cnt * TAU + (r % 2) * 0.22, x = rx * Math.sin(a), z = rz * Math.cos(a), n = P(x / (rx * rx), 0, z / (rz * rz)).normalize(); leaf(cb, P(x, y, z).addScaledVector(n, 0.008), n, P(0, -1, 0), 0.098, 0.105, 0.016, sCH, 0.3); }
  }
  limb(cb, P(0, 1.44, 0), P(0, 1.6, 0.012), 0.048, 0.042, SKIN2, { seg: 10 });
  // cowl (hood down): bunched cloth ring with folds
  { const rows = [], R0 = [[1.4, 0.22, 0.15], [1.46, 0.2, 0.14], [1.52, 0.135, 0.11], [1.56, 0.1, 0.085]]; const g = ellTube(R0, 24, false, false);
    const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), a = Math.atan2(x, z), f = 1 + 0.13 * Math.sin(a * 6 + y * 14) * sstep(1.4, 1.5, y); pos.setXYZ(i, x * f, y, z * f - (z < 0 ? 0.0 : 0) - 0.01); }
    g.computeVertexNormals(); cb.add(g, (x, y, z) => mixHex(MOSS, 0x1d3a26, clamp((1.5 - y) * 4)), {}); }
  meshOn(chestMesh, cb, armorMat, 'foliage');
  // glowing chest vines
  const gl = new Bag();
  const normalAt = (x, y) => { const [rx, rz] = tr(y); return P(x / (rx * rx), 0, Math.sqrt(Math.max(0.01, 1 - (x / rx) ** 2)) * rz / (rz * rz)).normalize(); };
  const surfZ = (x, y, off) => { const [rx, rz] = tr(y); return rz * Math.sqrt(Math.max(0.05, 1 - (x / rx) * (x / rx))) + off; };
  const vine = (bag, pts, r, lf = 1) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    bag.add(sweep(curve.getPoints(pts.length * 4), r, 4), (x, y) => mixHex(0x7fe02a, LIME, 0.5 + 0.5 * Math.sin(y * 20)), {});
    const n = pts.length * 2;
    for (let i = 1; i < n; i++) { const u = i / n, p = curve.getPoint(u), tg = curve.getTangent(u), nn = normalAt(p.x, p.y), sd = i % 2 ? 1 : -1; const side = new V3().crossVectors(tg, nn).normalize().multiplyScalar(sd), dir = tg.clone().multiplyScalar(-1).addScaledVector(side, 1.2).normalize(); leaf(bag, p.clone().addScaledVector(dir, 0.02), nn, dir.clone().multiplyScalar(-1), 0.02, 0.05 * lf, 0.004, LIME, 0.0); }
  };
  const tv = (x, y) => P(x, y, surfZ(x, y, 0.03));
  vine(gl, [tv(-0.02, 1.15), tv(0.05, 1.22), tv(-0.04, 1.3), tv(0.06, 1.37), tv(0.12, 1.42), tv(0.17, 1.46)], 0.006);
  vine(gl, [tv(0.03, 1.16), tv(-0.06, 1.24), tv(0.03, 1.31), tv(-0.07, 1.38), tv(-0.13, 1.43), tv(-0.17, 1.46)], 0.006);
  gl.add(new THREE.OctahedronGeometry(0.018), LIME, { p: [0, 0.995 - 0, 0.13], s: [1, 1.3, 0.6] });
  const glowPelvis = new THREE.Mesh(gl.build(chest.userData.abs), glowMat); tagMesh(glowPelvis, 'neon'); chestMesh.add(glowPelvis);
  // ---- head (+ beard in the same skin mesh)
  const head = node(chest, P(0, 1.5, 0.01), P(0, 1.14, 0));
  const S = { rx: 0.098, ry: 0.126, rz: 0.108, jaw: 0.16, chin: 0.022, cheek: 0.02, brow: 0.012, sock: 0.012, muzzle: 0.01, fore: 0.006, ear: 1.0,
    eye: { a: 0.47, e: 0.08, r: 0.0145, sink: 0.55, iris: 0.6, pupil: 0.44, col: 0x3a2410, col2: 0x9a6a30, sy: 0.84, openA: -0.46, closeA: 0.5, lashes: 0, liner: 0.9, yaw: 0.3, cross: 0.01 },
    nose: { e: -0.2, len: 0.02, r: 0.0098, wa: 0.09, bridge: 1.5 },
    mouth: { w: 0.34, e: -0.5, smile: 0.02, open: 0, lipU: 0.0065, lipL: 0.009 },
    brows: { a0: 0.1, a1: 0.7, e: 0.285, arch: 0.025, tilt: 0.05, th: 0.0068, col: 0x1a110c } };
  const K = { skin: SKIN, skin2: SKIN2, blush: 0xa4583c, blushAmt: 0.25, skinHi: 0xe0aa7a, lip: 0x8a4a3a, lip2: 0x8f503e, lash: 0x150d09, crease: 0x2e1410 };
  const hb = new Bag(), { lids, P: surfP } = buildHead(hb, S, K);
  // beard shell from the skull surface (jagged edge, leaves a mouth opening)
  { const g = sphG(36, 24), pos = g.attributes.position, idx = g.index.array, o = new V3(), v = [], mk = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); headDeform(S, x, y, z, o);
      const edge = -0.3 + 0.24 * Math.abs(x) - 0.1 * (z < 0.2 ? 1 : 0), mouth = (x * x) / 0.16 + ((y + 0.5) * (y + 0.5)) / 0.012;
      const m = sstep(0, 0.1, edge - y) * sstep(0.85, 1.25, mouth) * sstep(-0.55, -0.2, z);
      const f = 1 + 0.05 * m - 0.012;
      v.push(o.x * f, o.y * f - 0.002 * m, o.z * f - 0.002 * m); mk.push(m);
    }
    const pp = []; for (let i = 0; i < idx.length; i += 3) { const a = idx[i], b = idx[i + 1], c = idx[i + 2]; if (mk[a] > 0.001 || mk[b] > 0.001 || mk[c] > 0.001) for (const q of [a, b, c]) pp.push(v[q * 3], v[q * 3 + 1], v[q * 3 + 2]); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); bg.computeVertexNormals();
    hb.add(bg, (x, y, z) => shade(0x2a1c14, 0.8 + 0.4 * hash2(Math.round(x * 400), Math.round(y * 400 + z * 300))), { flat: false });
    for (const s of [-1, 1]) { // moustache
      const pts = [surfP(s * 0.04, -0.4, 0.004, new V3()), surfP(s * 0.2, -0.43, 0.007, new V3()), surfP(s * 0.38, -0.5, 0.005, new V3()), surfP(s * 0.5, -0.58, 0.003, new V3())];
      hb.add(sweep(curvePts(pts, 6), (u) => 0.0075 * (1 - 0.65 * u) + 0.0012, 5, 0.7), 0x2a1c14, {});
    }
  }
  const headMesh = new THREE.Mesh(hb.build(), skinMat); tagMesh(headMesh, 'skin'); headMesh.position.set(0, 0.2, 0.012); head.add(headMesh); finishHead(headMesh, lids);
  // ---- hair: top knot + long wavy locks (swaying mesh)
  const hair = new Bag(), hcol = (x, y, z) => shade(HAIRC, 0.8 + 0.6 * hash2(Math.round(x * 80), Math.round(y * 60 + z * 70)));
  hair.add(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, 1.55), hcol, { s: [S.rx * 1.13, S.ry * 1.12, S.rz * 1.16], r: [-0.32, 0, 0], p: [0, 0.008, -0.014] });
  hair.add(sphG(10, 7), hcol, { p: [0, S.ry * 1.1, -0.045], s: [0.05, 0.045, 0.05] });
  hair.add(sweep(curvePts([P(0, S.ry * 0.95, -0.03), P(0, S.ry * 1.18, -0.05), P(0.01, S.ry * 1.22, -0.07)], 4), 0.028, 6), hcol, {});
  const hs = mkSurf({ ...S, rx: S.rx * 1.06, ry: S.ry * 1.06, rz: S.rz * 1.06 });
  for (let l = 0; l < 12; l++) {
    const az = Math.PI + (l / 11 - 0.5) * 3.7, el = 0.05 + 0.5 * hash2(l, 3), a = hs(az, el, 0.002, new V3()), pts = [a.clone()], len = 0.3 + 0.08 * hash2(l, 1), ph = l * 1.7;
    for (let i = 1; i <= 7; i++) { const u = i / 7, p = a.clone(); p.y -= u * len + 0.01 * u; p.x += Math.sin(az) * 0.03 * u + Math.sin(u * 7 + ph) * 0.016 * u; p.z += Math.cos(az) * 0.025 * u - 0.01 * u + Math.cos(u * 6 + ph) * 0.012 * u; if (Math.abs(az - Math.PI) > 1.3) p.z = Math.min(p.z, 0.07); pts.push(p); }
    hair.add(sweep(curvePts(pts, 8), (u) => 0.022 * (1 - u * 0.65), 4, 0.8), hcol, {});
  }
  for (const s of [-1, 1]) hair.add(sweep(curvePts([hs(s * 1.35, 0.55, 0.003, new V3()), hs(s * 1.5, 0.1, 0.012, new V3()), hs(s * 1.55, -0.3, 0.018, new V3()).add(v3(0, -0.1, 0))], 6), (u) => 0.014 * (1 - 0.4 * u), 5, 0.7), hcol, {});
  const hairNode = new THREE.Group(); hairNode.position.copy(headMesh.position); head.add(hairNode);
  const hairMesh = new THREE.Mesh(hair.build(), hairMat); tagMesh(hairMesh, 'cloth'); hairNode.add(hairMesh);
  // ---- hood (up) variant: real cowled shell with lime trim; hidden unless opts.hood
  const hd = new Bag();
  { const g = sphG(24, 16), pos = g.attributes.position, idx = g.index.array, v = [], o = new V3();
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); headDeform(S, x, y, z, o); const back = clamp(-z * 0.9 + 0.2), drop = (y < 0 ? 0.09 * (-y) * back : 0); v.push([o.x * 1.3, o.y * 1.2 - drop + (z < -0.3 ? -0.03 * back : 0), o.z * 1.28 - 0.03, x, y, z]); }
    const open = (q) => { const [, , , x, y, z] = q; return z > 0.1 && (x * x) / 0.46 + ((y + 0.05) * (y + 0.05)) / 0.5 < 1; };
    const pp = []; for (let i = 0; i < idx.length; i += 3) { const a = v[idx[i]], b = v[idx[i + 1]], c = v[idx[i + 2]]; if (a[4] < -0.55 && a[5] > 0.2) continue; if (!open(a) && !open(b) && !open(c)) pp.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); hg.computeVertexNormals();
    hd.add(hg, (x, y, z) => mixHex(MOSS, 0x1b3a28, clamp((0.05 - y) * 4 + (z < 0 ? 0.3 : 0))), {});
    hd.add(sphG(8, 6), 0x1b3a28, { p: [0, -0.02, -0.15], s: [0.04, 0.12, 0.05], r: [0.5, 0, 0] });
  }
  const hoodMesh = new THREE.Mesh(hd.build(), stdMat({ roughness: 0.7, side: THREE.DoubleSide })); tagMesh(hoodMesh, 'cloth'); hoodMesh.position.copy(headMesh.position); hoodMesh.visible = !!opts.hood; head.add(hoodMesh);
  hairMesh.visible = !opts.hood;
  // ---- arms (leaf-scale sleeves, fingerless gloves)
  const armOf = (s) => {
    const n = node(chest, P(s * 0.235, 1.43, 0), P(0, 1.14, 0)), a = new Bag();
    const E = P(s * 0.03, -0.27, 0.02), W = P(s * 0.045, -0.52, 0.07);
    limb(a, P(0, 0, 0), E, 0.062, 0.054, CHD, { seg: 9 });
    limb(a, E, W, 0.052, 0.042, CHD, { seg: 9 });
    for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) { const t = 0.15 + r * 0.22, c = E.clone().lerp(W, t), an = k / 7 * TAU + r * 0.4, nn = P(Math.sin(an), 0, Math.cos(an)); leaf(a, c.clone().addScaledVector(nn, lerp(0.052, 0.042, t) + 0.004), nn, P(0, -1, 0), 0.056, 0.07, 0.01, sCH, 0.3); }
    for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) { const t = 0.12 + r * 0.3, c = P(0, 0, 0).lerp(E, t), an = k / 8 * TAU + r * 0.4, nn = P(Math.sin(an), 0, Math.cos(an)); leaf(a, c.clone().addScaledVector(nn, 0.062), nn, P(0, -1, 0), 0.07, 0.085, 0.012, sCH, 0.3); }
    for (let r = 0; r < 3; r++) leaf(a, P(s * (0.04 + r * 0.012), 0.05 - r * 0.045, 0), P(s * 1, 0.5 - r * 0.2, 0), P(s * 0.4, -1, 0), 0.13, 0.13 - r * 0.01, 0.03, sCH, 0.2);
    bandAt(a, E, W, 0.92, 0.047, 0.035, LEATH, { seg: 9 });
    const bm = new M4().compose(W.clone().add(P(s * 0.004, -0.008, 0.004)), new Q().setFromEuler(new THREE.Euler(-0.12, 0, s * 0.06)), v3(1, 1, 1));
    hand(a, bm, s, SKIN, 1.0, 0.45, { palmCol: BLK, tip: SKIN, hseg: 5 });
    const pts = [P(s * 0.065, 0.02, 0.02), P(s * 0.075, -0.1, 0.03), P(s * 0.07, -0.2, 0.01), P(s * 0.06, -0.3, 0.04), P(s * 0.062, -0.42, 0.07), P(s * 0.06, -0.5, 0.085)];
    a.add(sweep(curvePts(pts, 14), 0.0042, 4), LIME, {});
    const m = new THREE.Mesh(a.build(), armorMat); tagMesh(m, 'foliage'); n.add(m); return n;
  };
  const armL = armOf(1), armR = armOf(-1);
  // ---- cape: translucent living cloth with deep folds
  const capeMat = new THREE.MeshStandardMaterial({ map: vineTexture(false), emissiveMap: vineTexture(true), emissive: 0xffffff, emissiveIntensity: 0.85, color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.45 });
  capeMat.forceSinglePass = true;
  const TH = 1.95;
  const capeSheet = {
    cols: 22, rows: 16,
    base(u, v, o) {
      const e = Math.abs(2 * u - 1), th = (u - 0.5) * 2 * TH;
      const top = 1.47 + 0.24 * Math.pow(1 - e, 2.6), hem = 0.1 + 0.3 * Math.pow(e, 1.5);
      const folds = (0.05 * Math.sin(th * 5.5 + 1) + 0.025 * Math.sin(th * 11 + 2)) * v * v;
      const R = 0.34 + 0.2 * Math.pow(v, 1.2) + 0.07 * (1 - e) * (1 - v) * (1 - v) + folds;
      o.set(R * Math.sin(th), lerp(top, hem, v), -R * Math.cos(th) * (1 - 0.06 * v));
    },
    sway(u, v, t, k, o) {
      const th = (u - 0.5) * 2 * TH, a = v * v;
      const w = 0.05 * a * Math.sin(t * 1.1 + th * 2.2 + v * 3) + 0.025 * a * Math.sin(t * 2.2 + th * 4 + v * 5) + 0.1 * k * a;
      o.x += Math.sin(th) * w; o.z -= Math.cos(th) * w; o.y += 0.01 * a * Math.sin(t * 1.4 + th * 3);
    },
  };
  const cape = new Cloth([capeSheet], capeMat, true); cape.mesh.renderOrder = 1; tagMesh(cape.mesh, 'cloth'); rig.add(cape.mesh);
  // ---- cast vine whips
  const whip = new Bag();
  for (const s of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 14; i++) { const u = i / 14, a = u * 9 + (s > 0 ? 0 : 1.5), r = 0.06 * (1 - u * 0.4); pts.push(P(Math.cos(a) * r + s * u * 0.06, Math.sin(a) * r, u * 1.5)); }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    whip.add(sweep(curve.getPoints(30), (u) => 0.014 * (1 - u * 0.5), 4), (x, y, z) => mixHex(LIME, 0x6fd424, clamp(z / 1.5)), {});
    for (let i = 1; i < 12; i++) { const u = i / 12, p = curve.getPoint(u), tg = curve.getTangent(u), ss = i % 2 ? 1 : -1, nn = P(Math.cos(u * 9), Math.sin(u * 9), 0), dir = tg.clone().addScaledVector(nn, ss * 1.1).normalize(); leaf(whip, p.clone().addScaledVector(dir, 0.03), nn, dir, 0.04, 0.08, 0.006, LIME, 0); }
  }
  const whipMesh = new THREE.Mesh(whip.build(), glowMat); tagMesh(whipMesh, 'neon'); whipMesh.visible = false; whipMesh.frustumCulled = false; rig.add(whipMesh);
  const cc = castCtl(), R = { pelvis, chest, chestMesh, head }, blink = blinker(lids);
  return {
    group, gloveColor: 0x8fe03c,
    setHood(on) { hoodMesh.visible = !!on; hairMesh.visible = !on; },
    cast() { cc.go(); },
    update(dt, t) {
      const k = cc.step(dt);
      idlePose(R, t, { hip: -0.04, chest: 0.06, head: -0.04, shift: -0.01, headY: 0.05 });
      blink(t, dt);
      hairNode.rotation.x = 0.03 * Math.sin(t * 1.3); hairNode.rotation.z = 0.04 * Math.sin(t * 1.0 + 1);
      cape.update(t, k);
      const th = 1.35 * k;
      armL.rotation.x = armR.rotation.x = -th; armL.rotation.z = 0.1 * k + 0.02 * Math.sin(t * 1.3); armR.rotation.z = -0.1 * k - 0.02 * Math.sin(t * 1.3 + 1);
      capeMat.emissiveIntensity = 0.8 + 0.12 * Math.sin(t * 1.5) + 0.7 * k;
      whipMesh.visible = k > 0.03;
      if (whipMesh.visible) { whipMesh.position.set(0, 1.35, 0.58); whipMesh.scale.set(1, 1, Math.max(0.01, k)); }
    },
  };
}

export const HEROES_A = {
  ribbon: { name: 'Rally', tagline: 'Tie the world together.', build: buildRibbon },
  chrona: { name: 'Chrona', tagline: 'Take all the time you need.', build: buildChrona },
  prism: { name: 'Prisma', tagline: 'Every light has a story.', build: buildPrism },
  verdant: { name: 'Verdant', tagline: 'Where I walk, it grows.', build: buildVerdant },
};
