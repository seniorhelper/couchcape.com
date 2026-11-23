// heroes-b.js : procedural heroes 5-7 (fold, tinker, starling). 100% original, code only.
// v0.3 polish: sculpted faces (eyes with iris/pupil/catchlight/lids/lashes, brows, nose, lips), fingered hands,
// contrapposto poses, blinking + breathing, origami fox rebuild, tagged materials (mesh.userData.mat).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ helpers */
const _c = new THREE.Color();
const _cB = new THREE.Color();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const hexLerp = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mat(p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _e.set(r[0], r[1], r[2], 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
}
// rotate by r (XYZ order = 'YXZ' like mat) about a pivot point, then translate by sh
function about(pv, r, sh = [0, 0, 0]) {
  const R = mat([0, 0, 0], r);
  const A = new THREE.Matrix4().makeTranslation(pv[0] + sh[0], pv[1] + sh[1], pv[2] + sh[2]);
  const B = new THREE.Matrix4().makeTranslation(-pv[0], -pv[1], -pv[2]);
  return A.multiply(R).multiply(B);
}
// matrix placing a +Y-axis object so its base is at a and tip toward b
function matAlong(a, b, sx = 1, sz = 1, centered = true) {
  _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _v.length();
  _q.setFromUnitVectors(UP, _v.normalize());
  const k = centered ? 0.5 : 0;
  _p.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
  return { m: new THREE.Matrix4().compose(_p, _q, _s.set(sx, len, sz)), len };
}

class Bucket {
  constructor(seed = 1) { this.geos = []; this.r = rng(seed); }
  // color: hex | fn(x,y,z,u,v) | null (use geometry's own color attribute)
  // o: {flat, jitter, vert (per-vertex colors)}
  add(geo, color, matrix, o) {
    o = o || {};
    if (this.xf) matrix = matrix ? this.xf.clone().multiply(matrix) : this.xf;
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (o.flat || geo.userData.flat) g.computeVertexNormals();
    const pos = g.attributes.position;
    const uva = g.attributes.uv;
    const n = pos.count;
    const hasC = !!g.attributes.color && color == null;
    if (!hasC) {
      const col = new Float32Array(n * 3);
      const j = o.jitter || 0;
      const fn = typeof color === 'function';
      if (!fn) _c.set(color);
      for (let t = 0; t < n; t += 3) {
        let cx = 0, cy = 0, cz = 0, u = 0, v = 0;
        if (fn && !o.vert) {
          cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
          cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
          cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
          if (uva) {
            const s0 = Math.sin(uva.getX(t) * 6.2832) + Math.sin(uva.getX(t + 1) * 6.2832) + Math.sin(uva.getX(t + 2) * 6.2832);
            const c0 = Math.cos(uva.getX(t) * 6.2832) + Math.cos(uva.getX(t + 1) * 6.2832) + Math.cos(uva.getX(t + 2) * 6.2832);
            u = (Math.atan2(s0, c0) / 6.2832 + 1) % 1;
            v = (uva.getY(t) + uva.getY(t + 1) + uva.getY(t + 2)) / 3;
          }
          _c.set(color(cx, cy, cz, u, v));
        }
        const m = j ? 1 + (this.r() - 0.5) * 2 * j : 1;
        for (let k = 0; k < 3; k++) {
          if (fn && o.vert) _c.set(color(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k), uva ? uva.getX(t + k) : 0, uva ? uva.getY(t + k) : 0));
          col[(t + k) * 3] = _c.r * m; col[(t + k) * 3 + 1] = _c.g * m; col[(t + k) * 3 + 2] = _c.b * m;
        }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    g.deleteAttribute('uv');
    this.geos.push(g);
    return this;
  }
  m(geo, color, p, r, s, o) { return this.add(geo, color, mat(p, r, s), o); }
  geometry() { return mergeGeometries(this.geos, false); }
  // mesh with vertex colors; geometry shifted by -pivot; returns Mesh (caller positions it)
  mesh(material, tag, shift) {
    const g = this.geometry();
    if (shift) g.translate(shift[0], shift[1], shift[2]);
    const me = new THREE.Mesh(g, material);
    me.userData.mat = tag;
    me.frustumCulled = false;
    return me;
  }
  tris() { return this.geos.reduce((a, g) => a + g.attributes.position.count / 3, 0); }
}
// mesh placed inside a pivot Group at `pivot` (geometry kept in bucket coords)
function part(bucket, material, tag, pivot = [0, 0, 0]) {
  const grp = new THREE.Group();
  grp.position.set(pivot[0], pivot[1], pivot[2]);
  const me = bucket.mesh(material, tag, [-pivot[0], -pivot[1], -pivot[2]]);
  grp.add(me);
  grp.userData.mesh = me;
  return grp;
}

const SPH = (w = 10, h = 7) => new THREE.SphereGeometry(1, w, h);
const capSph = (w, h, tl) => { const g = new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, tl); g.rotateX(Math.PI / 2); return g; };
const ICO0 = new THREE.IcosahedronGeometry(1, 0);
const ICO1 = new THREE.IcosahedronGeometry(1, 1);
function ball(b, p, r, color, sc = [1, 1, 1], w = 10, h = 7, o) {
  return b.add(SPH(w, h), color, mat(p, [0, 0, 0], [r * sc[0], r * sc[1], r * sc[2]]), o);
}
function limb(b, a, c, r0, r1, color, seg = 8, o) {
  const { m } = matAlong(a, c);
  const g = new THREE.CylinderGeometry(r1, r0, 1, seg, 1);
  return b.add(g, color, m, o);
}
function cone(b, base, tip, r, color, seg = 4, o) {
  const { m } = matAlong(base, tip);
  return b.add(new THREE.ConeGeometry(r, 1, seg, 1), color, m, o);
}
function sbox(w, h, d) { const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1); g.userData.flat = true; return g; }
function rbox(w, h, d, r) {
  r = Math.min(r, Math.min(w, h, d) * 0.49);
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = g.attributes.position;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    _v2.set(clamp(_v.x, -hx, hx), clamp(_v.y, -hy, hy), clamp(_v.z, -hz, hz));
    _v.sub(_v2);
    if (_v.lengthSq() > 1e-12) _v.setLength(r);
    p.setXYZ(i, _v2.x + _v.x, _v2.y + _v.y, _v2.z + _v.z);
  }
  g.userData.flat = true;
  return g;
}
// strap/box laid between two points (long axis = Y of box)
function strap(b, a, c, w, t, color, r = 0.004) {
  _v.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = _v.length();
  const g = rbox(w, len, t, r);
  _q.setFromUnitVectors(UP, _v.normalize());
  const m2 = new THREE.Matrix4().compose(_p.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2), _q, _s.set(1, 1, 1));
  return b.add(g, color, m2);
}
function dome(r, sx, sy, sz, seg = 8) {
  const g = new THREE.SphereGeometry(r, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(sx, sy, sz);
  g.rotateX(Math.PI / 2); // dome faces +Z
  return g;
}
// lofted elliptical tube; rings = [{y,cx,cz,rx,rz}] ; uv = (angle from +z, ring fraction)
function loft(rings, N = 12, capTop = true, capBot = true) {
  const pos = [], idx = [], uv = [];
  const R = rings.length;
  for (let j = 0; j < R; j++) {
    const r = rings[j];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      pos.push((r.cx || 0) + r.rx * Math.sin(th), r.y, (r.cz || 0) + r.rz * Math.cos(th));
      uv.push(i / N, j / (R - 1));
    }
  }
  for (let j = 0; j < R - 1; j++) {
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      const a = j * N + i, b = j * N + i2, c = (j + 1) * N + i, d = (j + 1) * N + i2;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (j, up) => {
    const r = rings[j];
    const ci = pos.length / 3;
    pos.push(r.cx || 0, r.y, r.cz || 0); uv.push(0, j / (R - 1));
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      if (up) idx.push(ci, j * N + i, j * N + i2); else idx.push(ci, j * N + i2, j * N + i);
    }
  };
  if (capTop) cap(R - 1, true);
  if (capBot) cap(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// smooth tube through control points (Catmull-Rom), radius = array (spread evenly) or fn(t).
// o: {sides, sub, ref:[x,y,z] (direction of the "front" of the cross-section), en, eb (ellipse scales), capA, capB ('round'), raw}
function tubeGeo(pts, rad, o = {}) {
  const sides = o.sides || 6;
  let P;
  if (o.raw) P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  else {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
    const n = Math.max(2, (pts.length - 1) * (o.sub || 2));
    P = curve.getPoints(n);
  }
  const R = P.length;
  const rf = typeof rad === 'function' ? rad : (t) => {
    const f = t * (rad.length - 1), i = Math.min(rad.length - 2, Math.floor(f));
    return lerp(rad[i], rad[i + 1], f - i);
  };
  const T = [];
  for (let i = 0; i < R; i++) {
    const a = P[Math.max(0, i - 1)], c = P[Math.min(R - 1, i + 1)];
    T.push(c.clone().sub(a).normalize());
  }
  const ref = new THREE.Vector3().fromArray(o.ref || [0, 0, 1]);
  const en = o.en || 1, eb = o.eb || 1;
  const pos = [], uv = [], idx = [];
  let nrm = null;
  const rings = [];
  for (let i = 0; i < R; i++) {
    const t = T[i];
    if (!nrm) {
      nrm = ref.clone().sub(t.clone().multiplyScalar(ref.dot(t)));
      if (nrm.lengthSq() < 1e-4) nrm = new THREE.Vector3(0, 1, 0).sub(t.clone().multiplyScalar(t.y));
      nrm.normalize();
    } else {
      nrm.sub(t.clone().multiplyScalar(nrm.dot(t))).normalize();
    }
    rings.push([P[i], nrm.clone(), new THREE.Vector3().crossVectors(t, nrm).normalize(), rf(i / (R - 1))]);
  }
  const ringAt = (c, nn, bb, r, k) => {
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const cn = Math.cos(a) * r * en, sb = Math.sin(a) * r * eb;
      pos.push(c.x + nn.x * cn + bb.x * sb, c.y + nn.y * cn + bb.y * sb, c.z + nn.z * cn + bb.z * sb);
      uv.push(s / sides, k);
    }
  };
  const rowsList = [];
  if (o.capA) {
    const [c, nn, bb, r] = rings[0];
    const t = T[0];
    rowsList.push([c.clone().addScaledVector(t, -r * 0.8), nn, bb, r * 0.6, 0], [c.clone().addScaledVector(t, -r * 0.45), nn, bb, r * 0.9, 0]);
  }
  for (let i = 0; i < R; i++) rowsList.push([rings[i][0], rings[i][1], rings[i][2], rings[i][3], i / (R - 1)]);
  if (o.capB) {
    const [c, nn, bb, r] = rings[R - 1];
    const t = T[R - 1];
    rowsList.push([c.clone().addScaledVector(t, r * 0.45), nn, bb, r * 0.9, 1], [c.clone().addScaledVector(t, r * 0.8), nn, bb, r * 0.6, 1]);
  }
  for (const rw of rowsList) ringAt(rw[0], rw[1], rw[2], rw[3], rw[4]);
  const RR = rowsList.length;
  for (let j = 0; j < RR - 1; j++) for (let s = 0; s < sides; s++) {
    const s2 = (s + 1) % sides;
    const a = j * sides + s, b = j * sides + s2, c = (j + 1) * sides + s, d = (j + 1) * sides + s2;
    idx.push(a, b, c, b, d, c);
  }
  // apex fans
  const fan = (row, tip, rev) => {
    const ci = pos.length / 3;
    pos.push(tip.x, tip.y, tip.z); uv.push(0, row === 0 ? 0 : 1);
    for (let s = 0; s < sides; s++) {
      const s2 = (s + 1) % sides;
      if (rev) idx.push(ci, row * sides + s2, row * sides + s); else idx.push(ci, row * sides + s, row * sides + s2);
    }
  };
  if (o.capA) { const [c, , , r] = rings[0]; fan(0, c.clone().addScaledVector(T[0], -r * 1.0), true); }
  if (o.capB) { const [c, , , r] = rings[R - 1]; fan(RR - 1, c.clone().addScaledVector(T[R - 1], r * 1.0), false); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function tube(b, pts, rad, color, o = {}, mx) {
  return b.add(tubeGeo(pts, rad, o), color, mx, o.bo);
}

// soft additive radial glow disc
function haloMesh(radius, hex, seg = 24) {
  const pos = [0, 0, 0], col = [], idx = [];
  _c.set(hex);
  col.push(_c.r, _c.g, _c.b, 0.7);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.push(Math.sin(a) * radius, Math.cos(a) * radius, 0);
    col.push(_c.r, _c.g, _c.b, 0);
    idx.push(0, 1 + i, 1 + ((i + 1) % seg));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const me = new THREE.Mesh(g, m);
  me.frustumCulled = false;
  me.userData.mat = 'neon';
  return me;
}

/* ------------------------------------------------------------ face kit
   Head = smooth sculpted ellipsoid (broad forms only). Fine forms (nose, lips, brows, ears, eyes) are
   separate primitives placed on the surface via headPoint(). Head-local space: origin = head center, face +Z. */
function headDef(o) {
  return Object.assign({ rx: 0.082, ry: 0.108, rz: 0.092, jaw: 0.4, chin: 0.07, brow: 0.07, cheek: 0.04, socket: 0.08, eyeFx: 0.42, eyeFy: 0.06, mouthFy: -0.56, smile: 1.4 }, o);
}
function headDisp(h, dx, dy, dz) {
  if (dz <= 0) return 0;
  const g = (cx, cy, sx, sy) => Math.exp(-(((dx - cx) / sx) ** 2 + ((dy - cy) / sy) ** 2));
  const w = sstep(0.0, 0.3, dz);
  let f = 0;
  f += h.brow * g(0, 0.3, 0.75, 0.1);
  f -= h.socket * (g(h.eyeFx, h.eyeFy + 0.04, 0.2, 0.15) + g(-h.eyeFx, h.eyeFy + 0.04, 0.2, 0.15));
  f += h.cheek * (g(0.5, -0.25, 0.22, 0.2) + g(-0.5, -0.25, 0.22, 0.2));
  f += h.chin * g(0, -0.86, 0.3, 0.18);
  f += 0.04 * g(0, -0.5, 0.35, 0.18); // lip mound
  return f * w * h.rz;
}
function headRaw(h, dx, dy, dz) {
  let x = h.rx * dx, y = h.ry * dy, z = h.rz * dz;
  const jt = dy < 0 ? h.jaw * sstep(0, 1, -dy) : 0;
  x *= 1 - jt * 0.42; z *= 1 - jt * 0.28;
  if (dy < 0) y *= 1 - 0.1 * sstep(0, -0.5, dy);
  if (dy < -0.6) y -= 0.004 * sstep(-0.6, -1, dy);
  if (dz < 0 && dy > -0.2) z *= 1.04;
  const f = headDisp(h, dx, dy, dz);
  if (f) {
    const nx = x / (h.rx * h.rx), ny = y / (h.ry * h.ry), nz = z / (h.rz * h.rz);
    const l = Math.hypot(nx, ny, nz) || 1;
    x += (nx / l) * f; y += (ny / l) * f; z += (nz / l) * f;
  }
  return [x, y, z];
}
// point on the face at direction components (fx,fy), pushed `off` along the normal; returns {p:[x,y,z], n:[x,y,z]}
function headPoint(h, fx, fy, off = 0) {
  const dz = Math.sqrt(Math.max(0, 1 - fx * fx - fy * fy));
  const p = headRaw(h, fx, fy, dz);
  const e = 0.01;
  const a = headRaw(h, fx + e, fy, Math.sqrt(Math.max(0, 1 - (fx + e) ** 2 - fy * fy)));
  const b = headRaw(h, fx, fy + e, Math.sqrt(Math.max(0, 1 - fx * fx - (fy + e) ** 2)));
  _v.set(a[0] - p[0], a[1] - p[1], a[2] - p[2]);
  _v2.set(b[0] - p[0], b[1] - p[1], b[2] - p[2]);
  const n = new THREE.Vector3().crossVectors(_v, _v2).normalize();
  if (n.z < 0) n.negate();
  return { p: [p[0] + n.x * off, p[1] + n.y * off, p[2] + n.z * off], n: [n.x, n.y, n.z] };
}
function headGeo(h, skin, blush, shade) {
  const N = 32, R = 20, k = 0.45;
  const pos = [], col = [], idx = [];
  const cs = new THREE.Color(skin), cb = new THREE.Color(blush), cd = new THREE.Color(shade), cc = new THREE.Color();
  const ring = (j) => j - 1;
  for (let j = 1; j < R; j++) {
    const ph = -Math.PI / 2 + (Math.PI * j) / R;
    const dy = Math.sin(ph), cr = Math.cos(ph);
    for (let i = 0; i < N; i++) {
      const u = (i / N) * Math.PI * 2;
      const th = u - k * Math.sin(u);
      const dx = Math.sin(th) * cr, dz = Math.cos(th) * cr;
      const p = headRaw(h, dx, dy, dz);
      pos.push(p[0], p[1], p[2]);
      const g = (cx, cy, sx, sy) => Math.exp(-(((dx - cx) / sx) ** 2 + ((dy - cy) / sy) ** 2));
      const front = sstep(0, 0.4, dz);
      cc.copy(cs);
      const bl = front * (g(0.52, -0.22, 0.25, 0.2) + g(-0.52, -0.22, 0.25, 0.2)) * (h.blushAmt ?? 0.4);
      cc.lerp(cb, clamp(bl, 0, 1));
      const sh = front * (g(h.eyeFx, h.eyeFy + 0.12, 0.24, 0.12) + g(-h.eyeFx, h.eyeFy + 0.12, 0.24, 0.12)) * 0.35 + (dy < -0.85 ? 0.15 : 0);
      cc.lerp(cd, clamp(sh, 0, 0.5));
      col.push(cc.r, cc.g, cc.b);
    }
  }
  const top = [0, h.ry, 0], bot = [0, -h.ry - 0.006, 0];
  const ti = pos.length / 3; pos.push(...top); col.push(cs.r, cs.g, cs.b);
  const bi = pos.length / 3; pos.push(...bot); col.push(cs.r, cs.g, cs.b);
  for (let j = 0; j < R - 2; j++) for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    const a = j * N + i, b = j * N + i2, c = (j + 1) * N + i, d = (j + 1) * N + i2;
    idx.push(a, b, c, b, d, c);
  }
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    idx.push(bi, i2, i);
    idx.push(ti, (R - 2) * N + i, (R - 2) * N + i2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// one pair of eyes. HB: static head bucket, LB: lid bucket (positions relative to pivot (0,ey,ez)).
// returns {ey, ez} the lid pivot in head-local space
function eyePair(HB, LB, h, c) {
  const r = c.r || 0.0175;
  const ep = headPoint(h, h.eyeFx, h.eyeFy, 0);
  const ex = ep.p[0], ey = ep.p[1], ez = ep.p[2] - r * (c.sink ?? 0.4);
  const sclera = c.sclera ?? 0xfbf6f0;
  const ir = c.irisW ?? 0.62;
  for (const s of [-1, 1]) {
    const cen = [s * ex, ey, ez];
    const tilt = (c.tilt || 0) * s * -1; // outer corner up when tilt>0
    const yaw = (c.yaw ?? 0) * s;
    const base = mat(cen, [0, yaw, tilt]);
    const L = (lp, sc) => new THREE.Matrix4().multiplyMatrices(base, mat(lp, [0, 0, 0], sc));
    const sx = c.sx || 1, sy = c.sy || 1;
    HB.add(capSph(12, 6, 1.75), sclera, L([0, 0, 0], [r * sx, r * sy, r * 0.95]));
    const zc = 0.82 * r;
    HB.add(capSph(14, 3, 1.57), c.irisDark, L([0, 0, zc], [ir * r * sx, ir * r * sy, 0.26 * r]));
    HB.add(capSph(12, 3, 1.57), c.iris, L([0, 0, zc + 0.03 * r], [ir * 0.78 * r * sx, ir * 0.78 * r * sy, 0.26 * r]));
    HB.add(capSph(8, 2, 1.57), c.iris2 || c.iris, L([0, -ir * 0.22 * r * sy, zc + 0.05 * r], [ir * 0.6 * r * sx, ir * 0.36 * r * sy, 0.26 * r]));
    HB.add(capSph(8, 2, 1.57), 0x0a0608, L([0, 0, zc + 0.07 * r], [(c.pupilW ?? 0.26) * r, (c.pupilH ?? 0.29) * r, 0.26 * r]));
    HB.add(ICO0, 0xffffff, L([-0.22 * r * sx, 0.24 * r * sy, zc + 0.31 * r], [0.15 * r, 0.16 * r, 0.1 * r]));
    HB.add(ICO0, 0xffffff, L([0.2 * r * sx, -0.26 * r * sy, zc + 0.27 * r], [0.07 * r, 0.07 * r, 0.05 * r]));
    // lid shell (rotates about X through the eye center) + lash line, relative to pivot (0,ey,ez)
    const lb = mat([s * ex, 0, 0], [0, yaw, tilt]);
    const rr = r * 1.1;
    const cap = new THREE.SphereGeometry(rr, 12, 5, 0, Math.PI * 2, 0, c.lidA ?? 1.0);
    cap.scale(sx, sy, 0.97);
    LB.add(cap, c.lid, lb, { vert: false });
    // lash line along the rim
    const A = c.lidA ?? 1.0;
    const rim = [];
    for (let i = 0; i <= 8; i++) {
      const ps = -1.38 + (i / 8) * 2.76;
      const rad = rr * Math.sin(A) * 1.01;
      rim.push([rad * Math.sin(ps) * sx, rr * Math.cos(A) * sy, rad * Math.cos(ps)]);
    }
    LB.add(tubeGeo(rim, (t) => r * (0.085 + 0.1 * Math.sin(Math.PI * t) ** 0.6), { sides: 4, sub: 1, capA: true, capB: true }), c.lash, lb);
    // lash flicks
    const nf = c.lashes ?? 5;
    for (let i = 0; i < nf; i++) {
      const ps = -1.1 + (i / (nf - 1)) * 2.2 + (c.wingSide ? 0 : 0);
      const rad = rr * Math.sin(A);
      const bp = [rad * Math.sin(ps) * sx, rr * Math.cos(A) * sy, rad * Math.cos(ps)];
      const out = [Math.sin(ps) * 0.5 + (ps * s > 0 ? 0 : 0), 0.85, Math.cos(ps) * 0.65];
      const ln = (c.lashLen || 0.55) * r * (0.75 + 0.5 * Math.abs(ps) / 1.1);
      const tp = [bp[0] + out[0] * ln * 0.8, bp[1] + out[1] * ln, bp[2] + out[2] * ln * 0.9];
      LB.add(new THREE.ConeGeometry(r * 0.07, 1, 3, 1), c.lash, new THREE.Matrix4().multiplyMatrices(lb, matAlong(bp, tp, 1, 1, true).m));
    }
    // wing flick at the outer corner
    const ow = [rr * Math.sin(A) * Math.sin(1.38) * sx * s, rr * Math.cos(A) * sy, rr * Math.sin(A) * Math.cos(1.38)];
    const ot = [ow[0] + s * (c.wing ?? 0.55) * r, ow[1] + 0.35 * r, ow[2] - 0.1 * r];
    LB.add(new THREE.ConeGeometry(r * 0.1, 1, 4, 1), c.lash, new THREE.Matrix4().multiplyMatrices(lb, matAlong(ow, ot, 1, 1, true).m));
  }
  return { ey, ez, ex, r };
}

// brows: arc above each eye; style {col, thick, arch, inner, outer, dy, slope}
function brows(HB, h, o) {
  for (const s of [-1, 1]) {
    const pts = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const fx = lerp(o.inner ?? 0.14, o.outer ?? 0.68, t);
      const fy = h.eyeFy + (o.dy ?? 0.26) + Math.sin(t * Math.PI) * (o.arch ?? 0.05) + (o.slope ?? 0) * t;
      const q = headPoint(h, fx * s, fy, o.off ?? 0.0025);
      pts.push(q.p);
    }
    HB.add(tubeGeo(pts, (t) => (o.thick ?? 0.0062) * (1 - 0.55 * t * t) * (t < 0.1 ? 0.8 : 1), { sides: o.sides ?? 5, sub: 1, capA: true, capB: true }), o.col);
  }
}
// nose, lips, ears + nostrils
function faceDetails(HB, h, o) {
  const skin = o.skin, skin2 = o.skin2 ?? skin;
  const ns = o.nose ?? 1;
  // nose
  const tip = headPoint(h, 0, o.noseFy ?? -0.27, 0.011 * ns);
  HB.add(SPH(8, 5), skin, mat(tip.p, [0, 0, 0], [0.0098 * ns, 0.0085 * ns, 0.0098 * ns]));
  const bridge = [];
  for (let i = 0; i < 4; i++) { const t = i / 3; bridge.push(headPoint(h, 0, lerp(0.07, (o.noseFy ?? -0.27) + 0.04, t), lerp(0.001, 0.0092 * ns, t * t)).p); }
  HB.add(tubeGeo(bridge, [0.0035 * ns, 0.0048 * ns, 0.0068 * ns, 0.0086 * ns], { sides: 6, capA: true, capB: true }), skin);
  for (const s of [-1, 1]) {
    const w = headPoint(h, s * 0.105, (o.noseFy ?? -0.27) + 0.018, 0.0045 * ns);
    HB.add(SPH(7, 5), skin, mat(w.p, [0, 0, 0], [0.0068 * ns, 0.0062 * ns, 0.0068 * ns]));
    const nn = headPoint(h, s * 0.055, (o.noseFy ?? -0.27) - 0.055, 0.0055 * ns);
    HB.add(SPH(6, 4), o.nostril ?? 0x6a2f24, mat(nn.p, [0.2, 0, 0], [0.0036 * ns, 0.0026 * ns, 0.003 * ns]));
  }
  // lips (ribbons following the smile curve)
  const my = (fx) => h.mouthFy + (o.smile ?? h.smile) * 0.55 * fx * fx;
  const lw = o.lipW ?? 0.22;
  const up = [], lo = [], ml = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6, fx = lerp(-lw, lw, t);
    const bow = -0.012 * Math.cos(t * Math.PI * 2 + Math.PI) * 0 + 0.016 * Math.exp(-((fx / 0.07) ** 2)) * 0;
    up.push(headPoint(h, fx, my(fx) + 0.024 + bow, 0.0026).p);
    lo.push(headPoint(h, fx * 0.88, my(fx * 0.88) - 0.026, 0.0032).p);
    ml.push(headPoint(h, fx * 1.04, my(fx * 1.04) - 0.002, 0.0007).p);
  }
  const lipC = o.lip, lipC2 = o.lip2 ?? o.lip;
  HB.add(tubeGeo(ml, [0.0012, 0.0016, 0.0017, 0.0017, 0.0017, 0.0016, 0.0012], { sides: 4, sub: 1, capA: true, capB: true }), o.mouthLine ?? 0x7a2f2f);
  HB.add(tubeGeo(up, (t) => (o.lipUp ?? 0.0056) * (0.5 + 0.5 * Math.sin(Math.PI * t) ** 0.7), { sides: 6, sub: 1, capA: true, capB: true }), lipC);
  HB.add(tubeGeo(lo, (t) => (o.lipLo ?? 0.0072) * (0.45 + 0.55 * Math.sin(Math.PI * t) ** 0.7), { sides: 6, sub: 1, capA: true, capB: true }), lipC2);
  // ears
  for (const s of [-1, 1]) {
    const ec = [s * h.rx * 0.985, -0.008, -0.004];
    HB.add(SPH(8, 6), skin, mat(ec, [0, 0, s * 0.12], [0.0075, 0.0225, 0.0175]));
    HB.add(SPH(6, 4), skin2, mat([ec[0] + s * 0.0035, ec[1] + 0.001, ec[2] + 0.0015], [0, 0, 0], [0.004, 0.015, 0.0105]));
    if (o.earring) HB.add(SPH(6, 5), o.earring, mat([ec[0] + s * 0.004, ec[1] - 0.025, ec[2] + 0.004], [0, 0, 0], [0.0045, 0.0045, 0.0045]));
  }
}

/* ------------------------------------------------------------ hands
   local frame: wrist at origin, fingers along -Y, palm faces +Z, thumb on +X (mirrored by s). */
function addHand(b, M, o) {
  const s = o.s || 1, sz = o.size || 1, skin = o.skin, sides = o.sides || 5;
  const curl = o.curl ?? 0.55;
  const W = (p) => [p[0] * s * sz, p[1] * sz, p[2] * sz];
  const mM = (m) => new THREE.Matrix4().multiplyMatrices(M, m);
  // palm
  const palm = rbox(0.076 * sz, 0.092 * sz, 0.03 * sz, 0.012 * sz);
  b.add(palm, o.palmColor || skin, mM(mat([0, -0.05 * sz, 0], [0, 0, 0], [1, 1, 1])));
  // thumb pad
  b.add(SPH(8, 6), skin, mM(mat([0.036 * s * sz, -0.04 * sz, 0.012 * sz], [0, 0, 0], [0.019 * sz, 0.03 * sz, 0.014 * sz])));
  const L = [0.072, 0.082, 0.075, 0.06];
  const X = [0.027, 0.009, -0.009, -0.027];
  const cv = [1.0, 1.1, 1.2, 1.25];
  for (let i = 0; i < 4; i++) {
    const rad = [0.0088, 0.0084, 0.0076, 0.0064].map((v) => v * sz * (i === 3 ? 0.9 : 1));
    const l = L[i] * sz, c = (o.fingerCurl ? o.fingerCurl[i] : curl * cv[i]);
    const a1 = 0.12 * c, a2 = a1 + 0.62 * c, a3 = a2 + 0.62 * c;
    const sp = (i - 1.5) * (o.spread ?? 0.06);
    const p0 = [X[i] * sz * s, -0.094 * sz, 0.0];
    const seg = [l * 0.42, l * 0.33, l * 0.25];
    const ang = [a1, a2, a3];
    const pts = [p0];
    let y = p0[1], z = p0[2], x = p0[0];
    for (let k = 0; k < 3; k++) {
      y -= Math.cos(ang[k]) * seg[k];
      z += Math.sin(ang[k]) * seg[k];
      x += Math.sin(sp) * seg[k] * s;
      pts.push([x, y, z]);
    }
    b.add(tubeGeo(pts, rad, { sides, raw: true, ref: [0, 0, 1], capB: true }), skin, M);
    if (o.nails) {
      const e = pts[3], d = pts[2];
      b.add(SPH(5, 4), o.nails, mM(mat([e[0], e[1] + 0.002 * sz, e[2] + 0.006 * sz], [0, 0, 0], [0.005 * sz, 0.007 * sz, 0.002 * sz])));
    }
  }
  // thumb
  const tc = o.thumbCurl ?? 0.4;
  const t0 = [0.034 * s * sz, -0.04 * sz, 0.012 * sz];
  const t1 = [0.062 * s * sz, -0.066 * sz, (0.026 + 0.01 * tc) * sz];
  const t2 = [0.068 * s * sz, -0.094 * sz, (0.04 + 0.025 * tc) * sz];
  const t3 = [0.062 * s * sz, -0.113 * sz, (0.05 + 0.04 * tc) * sz];
  b.add(tubeGeo([t0, t1, t2, t3], [0.0115 * sz, 0.0105 * sz, 0.0092 * sz, 0.0078 * sz], { sides, raw: true, ref: [0, 0, 1], capB: true }), skin, M);
}

/* ======================================================================
   shared: scalp cap, blink timer, basis
   ====================================================================== */
function scalpGeo(h, sc, front, side, back, off) {
  const N = 28, R = 8, pos = [], idx = [];
  for (let j = 0; j <= R; j++) {
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      const pm = side - (side - front) * Math.max(0, Math.cos(th)) + (back - side) * Math.max(0, -Math.cos(th));
      const ps = (j / R) * pm;
      const dx = Math.sin(ps) * Math.sin(th), dy = Math.cos(ps), dz = Math.sin(ps) * Math.cos(th);
      pos.push(h.rx * sc[0] * dx + off[0], h.ry * sc[1] * dy + off[1], h.rz * sc[2] * dz + off[2]);
    }
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N, a = j * N + i, b = j * N + i2, c = (j + 1) * N + i, d = (j + 1) * N + i2;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// blink state machine, allocation free. returns lid rotation (0 open .. 1 closed)
function makeBlinker(seed, lo = 3, hi = 6) {
  const r = rng(seed);
  const st = { next: 1.2 + r() * 2, t: -1, dbl: false };
  return (t) => {
    if (st.t < 0 && t >= st.next) st.t = 0;
    if (st.t >= 0) {
      const el = t - st.next;
      const d = 0.17;
      if (el >= d) {
        st.t = -1;
        if (!st.dbl && r() < 0.18) { st.dbl = true; st.next = t + 0.12; } else { st.dbl = false; st.next = t + lo + r() * (hi - lo); }
        return 0;
      }
      const f = el / d;
      return f < 0.4 ? sstep(0, 0.4, f) : 1 - sstep(0.4, 1, f);
    }
    return 0;
  };
}
// orthonormal basis matrix with +Y -> yAxis, +Z toward zHint
function basisM(yAxis, zHint, pos) {
  const y = new THREE.Vector3(...yAxis).normalize();
  const z = new THREE.Vector3(...zHint);
  z.sub(y.clone().multiplyScalar(z.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(pos[0], pos[1], pos[2]);
}


// shared hair builder: scalp cap + hanging ribbon clumps + flow clumps over the crown
function addHair(HR, h, cfg) {
  const hr = rng(cfg.seed || 7);
  const cA = new THREE.Color(cfg.cols[0]), cB = new THREE.Color(cfg.cols[1]), cC = new THREE.Color(cfg.cols[2]), cD = new THREE.Color(cfg.cols[3]), cT = new THREE.Color();
  const hairCol = (x, y, z, u, v) => {
    cT.copy(cA).lerp(cB, sstep(0.0, 0.35, v)).lerp(cC, sstep(0.5, 1.0, v));
    if (u > 0.08 && u < 0.34) cT.lerp(cD, 0.28 * sstep(0.1, 0.5, v));
    return cT.getHex();
  };
  const sc = cfg.scalp;
  HR.add(scalpGeo(h, [1.075, 1.05, 1.09], cfg.hairline ?? 0.98, 1.5, 2.0, [0, 0.0035, -0.007]), (x, y, z) => (z > 0.05 && y > 0.04 ? sc[0] : sc[1]), null, { flat: true });
  const lock = (psi, th, L, o = {}) => {
    const sx = Math.sin(psi) * Math.sin(th), sy = Math.cos(psi), sz = Math.sin(psi) * Math.cos(th);
    const root = [h.rx * 1.05 * sx, h.ry * 1.05 * sy + 0.0035, h.rz * 1.08 * sz - 0.007];
    const hx = Math.sin(th), hz = Math.cos(th) * (Math.cos(th) > 0 ? 0.4 : 1);
    const tx = Math.cos(th), tz = -Math.sin(th);
    const pts = [];
    const amp = o.amp ?? 0.016, waves = o.waves ?? 1.4, ph = hr() * 6.28;
    const out = o.out ?? 0.05;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const ov = 0.01 + out * Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.5);
      const w = amp * Math.sin(6.28 * waves * t + ph) * (0.2 + 0.8 * t);
      const w2 = amp * 0.7 * Math.cos(6.28 * waves * t + ph) * (0.2 + 0.8 * t);
      let x = root[0] + hx * (ov + w2) + tx * w, y = root[1] - L * Math.pow(t, 1.05), z = root[2] + hz * (ov + w2) + tz * w;
      if (t > 0.7) {
        const f = (t - 0.7) / 0.3, a = f * 6.28 * 1.1, cr = (o.curl ?? 0.026) * f;
        x += tx * Math.sin(a) * cr + hx * (1 - Math.cos(a)) * cr * 0.5;
        y += (1 - Math.cos(a)) * cr * 0.9;
        z += tz * Math.sin(a) * cr + hz * (1 - Math.cos(a)) * cr * 0.5;
      }
      pts.push([x, y, z]);
    }
    const r0 = (o.r ?? 0.02) * (0.85 + hr() * 0.3);
    HR.add(tubeGeo(pts, (t) => r0 * (1 - 0.86 * Math.pow(t, 1.2)) * (0.75 + 0.25 * Math.min(1, t * 5)), { sides: 4, sub: 2, ref: [0, 0, 1], en: 0.5, eb: cfg.eb ?? 1.9, capB: true }), hairCol, null, { vert: true });
  };
  for (let ring = 0; ring < cfg.spec.length; ring++) {
    const [psi, n, Lb, skip, ph0] = cfg.spec[ring];
    for (let i = 0; i < n; i++) {
      const th = ((i + ph0) / n) * 6.28;
      const ang = Math.atan2(Math.sin(th), Math.cos(th));
      if (Math.abs(ang) < skip) continue;
      const side = Math.abs(Math.sin(th));
      const L = Lb * (0.88 + hr() * 0.24) * (side > 0.92 && ring < 2 ? (cfg.sideShort ?? 0.7) : 1);
      lock(psi, th, L, { out: (cfg.out ?? 0.026) + ring * 0.012, amp: (cfg.amp ?? 0.014) + hr() * 0.006, waves: (cfg.waves ?? 1.0) + hr() * 0.6, r: cfg.r - ring * 0.003, curl: cfg.curl });
    }
  }
  for (let i = 0; i < (cfg.crown ?? 4); i++) lock(0.62, 3.14 + (i - ((cfg.crown ?? 4) - 1) / 2) * 0.85, 0.2, { out: 0.04, amp: 0.012, r: cfg.r - 0.004, waves: 1.0, curl: cfg.curl });
  const nf = cfg.flow ?? 7;
  for (let i = 0; i < nf; i++) {
    const thf = (i - (nf - 1) / 2) * (cfg.flowSpread ?? 0.3), pts = [];
    const ph = hr() * 6;
    for (let k = 0; k <= 7; k++) {
      const u = k / 7, sp = lerp(1.02 - Math.abs(i - (nf - 1) / 2) * 0.04, -1.35, u);
      const az = sp >= 0 ? thf : thf * 0.55 + Math.PI, pl = Math.abs(sp);
      const w = 0.011 * Math.sin(u * 9 + ph);
      const sx = Math.sin(pl) * Math.sin(az), sy = Math.cos(pl), sz = Math.sin(pl) * Math.cos(az);
      const R = 1.13 + 0.025 * Math.sin(u * 6 + ph);
      pts.push([h.rx * R * sx + w * Math.cos(az), h.ry * R * sy + 0.004, h.rz * 1.1 * R * sz - 0.007 + w * 0.2]);
    }
    HR.add(tubeGeo(pts, (t) => 0.019 * (1 - 0.65 * t * t) * (0.55 + 0.45 * Math.min(1, t * 6)), { sides: 4, sub: 2, ref: [0, 1, 0], en: 0.6, eb: 1.7, capA: true, capB: true }), hairCol, null, { vert: true });
  }
}

/* ======================================================================
   6. TINKER RED
   ====================================================================== */
const BURG = 0x7e1526, BURG2 = 0x5d0f1d, SKIN = 0xeab18d, SKIN2 = 0xd99a76, BRASS = 0xd19a3c, BRASS2 = 0xf2c660, BRASS3 = 0xa8741f, LEATH = 0x5b3320, LEATH2 = 0x7d4b2b, BOOT = 0x5e1822;

function buildTinker() {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const Mc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.03 });
  const Ms = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.0, emissive: 0x2a0e08, emissiveIntensity: 0.35 });
  const Mb = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.7, emissive: 0x3a2206, emissiveIntensity: 0.5 });

  const cb = new Bucket(101); // cloth + leather
  const bb = new Bucket(102); // brass (static)
  const pelvisM = about([0, 1.0, 0], [0, -0.03, 0.045], [0.014, 0, 0]);
  const chestM = about([0, 1.08, 0], [0, 0.05, -0.05], [-0.006, 0, 0]);

  /* legs */
  const legPts = {
    1: [[0.1, 0.97, 0.0], [0.104, 0.53, 0.012], [0.098, 0.4, 0.002]],
    '-1': [[-0.088, 0.96, 0.0], [-0.1, 0.53, 0.07], [-0.108, 0.4, 0.004]],
  };
  const legR = [0.098, 0.096, 0.086, 0.068, 0.058, 0.057, 0.055];
  for (const s of [-1, 1]) {
    const P = legPts[s];
    const ax = s > 0 ? 0.098 : -0.112, az = s > 0 ? -0.012 : -0.03;
    const yaw = s * 0.2 + (s < 0 ? -0.1 : 0);
    cb.xf = pelvisM;
    cb.add(tubeGeo(P, legR, { sides: 10, sub: 3, ref: [0, 0, 1], en: 1.0, eb: 0.96 }), BURG);
    cb.xf = null;
    // boot shaft + cuff
    cb.add(tubeGeo([[ax, 0.06, az + 0.002], [ax, 0.22, az + 0.01], [ax + s * 0.002, 0.43, az + 0.012]], [0.052, 0.058, 0.068], { sides: 10, ref: [0, 0, 1] }), BOOT);
    cb.add(tubeGeo([[ax, 0.405, az + 0.012], [ax, 0.45, az + 0.014]], [0.071, 0.073], { sides: 10, ref: [0, 0, 1] }), LEATH2);
    // foot (rotated toe-out about the ankle)
    const fm = about([ax, 0, az], [0, yaw, 0]);
    cb.xf = fm;
    cb.add(tubeGeo([[ax, 0.058, az - 0.06], [ax, 0.05, az + 0.06], [ax, 0.044, az + 0.16]], [0.046, 0.054, 0.034], { sides: 10, raw: false, sub: 3, ref: [0, 1, 0], en: 0.82, eb: 1.12, capA: true, capB: true }), BOOT);
    cb.add(rbox(0.108, 0.026, 0.25, 0.012), LEATH, mat([ax, 0.013, az + 0.045]));
    cb.add(rbox(0.07, 0.03, 0.06, 0.01), LEATH, mat([ax, 0.03, az - 0.06]));
    // laces
    for (let i = 0; i < 3; i++) cb.add(sbox(0.05, 0.006, 0.008), BRASS3, mat([ax, 0.092 + i * 0.012, az + 0.05 - i * 0.01], [-0.35, 0, 0]));
    cb.xf = null;
    bb.xf = fm;
    bb.add(dome(0.056, 1.0, 0.72, 1.2, 10), BRASS, mat([ax, 0.05, az + 0.13], [-0.15, 0, 0]));
    bb.xf = null;
    // brass: knee plate, thigh strap buckles, boot buckles
    bb.xf = pelvisM;
    bb.add(dome(0.07, 1.0, 1.1, 0.75, 10), BRASS, mat([P[1][0], P[1][1] + 0.0, P[1][2] + 0.058], [0.05, 0, 0]));
    bb.add(sbox(0.05, 0.016, 0.02), BRASS2, mat([P[1][0], P[1][1] - 0.075, P[1][2] + 0.055]));
    bb.xf = null;
    for (const y of [0.2, 0.32]) {
      cb.add(tubeGeo([[ax, y, az + 0.006], [ax, y + 0.03, az + 0.008]], [0.06, 0.06], { sides: 10, ref: [0, 0, 1] }), LEATH2);
      bb.add(sbox(0.03, 0.034, 0.012), BRASS2, mat([ax + 0.001, y + 0.015, az + 0.068]), null);
    }
    // thigh holster + brass tool
    cb.xf = pelvisM;
    cb.add(rbox(0.058, 0.2, 0.066, 0.016), LEATH2, mat([s * 0.178, 0.78, 0.012], [0, 0, s * 0.05]));
    cb.xf = null;
    bb.xf = pelvisM;
    bb.add(rbox(0.066, 0.036, 0.072, 0.012), BRASS, mat([s * 0.18, 0.7, 0.012], [0, 0, s * 0.05]));
    bb.add(sbox(0.04, 0.05, 0.042), BRASS2, mat([s * 0.182, 0.885, 0.012], [0, 0, s * 0.05]));
    bb.xf = null;
  }

  /* pelvis + torso */
  cb.xf = pelvisM;
  cb.add(loft([
    { y: 0.86, rx: 0.17, rz: 0.114 }, { y: 0.95, rx: 0.19, rz: 0.122 }, { y: 1.04, rx: 0.145, rz: 0.098 }, { y: 1.1, rx: 0.108, rz: 0.08 },
  ], 16, false, true), (x, y, z) => (Math.abs(x) < 0.008 && z > 0 ? BURG2 : BURG));
  cb.xf = chestM;
  const torso = loft([
    { y: 1.06, rx: 0.108, rz: 0.08 }, { y: 1.16, rx: 0.114, rz: 0.084 }, { y: 1.27, rx: 0.146, rz: 0.106 }, { y: 1.35, rx: 0.164, rz: 0.114 }, { y: 1.415, rx: 0.176, rz: 0.1 },
    { y: 1.46, rx: 0.14, rz: 0.08 }, { y: 1.49, rx: 0.062, rz: 0.05 }, { y: 1.51, rx: 0.045, rz: 0.04 },
  ], 18, true, false);
  cb.add(torso, (x, y, z, u, v) => (v > 0.74 ? SKIN : (Math.abs(x) < 0.01 && z > 0 && y < 1.3 ? BURG2 : BURG)), null, { });
  // harness straps
  const stp = (a, c, col, w = 0.034) => cb.add(rbox(w, Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), 0.012, 0.004), col, (() => {
    _v.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _q.setFromUnitVectors(UP, _v.normalize());
    return new THREE.Matrix4().compose(_p.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2), _q, _s.set(1, 1, 1));
  })());
  stp([-0.12, 1.45, 0.092], [0.095, 1.09, 0.1], LEATH);
  stp([0.12, 1.45, 0.092], [-0.095, 1.09, 0.1], LEATH2);
  for (const s of [-1, 1]) {
    stp([s * 0.095, 1.455, 0.075], [s * 0.115, 1.3, 0.108], LEATH, 0.03);
    stp([s * 0.1, 1.455, -0.06], [s * 0.15, 1.3, -0.09], LEATH, 0.03);
    cb.add(rbox(0.062, 0.058, 0.026, 0.01), BURG2, mat([s * 0.088, 1.16, 0.1]));
  }
  // belt
  cb.xf = pelvisM;
  cb.add(loft([{ y: 1.0, rx: 0.152, rz: 0.106 }, { y: 1.068, rx: 0.15, rz: 0.104 }], 16, false, false), LEATH);
  for (const s of [-1, 1]) {
    cb.add(rbox(0.07, 0.08, 0.05, 0.012), LEATH2, mat([s * 0.115, 0.995, 0.085], [0, s * 0.5, 0]));
    cb.add(rbox(0.06, 0.1, 0.05, 0.012), LEATH, mat([s * 0.145, 0.99, -0.05], [0, s * -0.4, 0]));
  }
  cb.xf = null;
  bb.xf = pelvisM;
  bb.add(sbox(0.075, 0.062, 0.022), BRASS2, mat([0, 1.034, 0.108]));
  bb.add(sbox(0.044, 0.038, 0.026), BRASS, mat([0, 1.034, 0.114]));
  for (const s of [-1, 1]) bb.add(sbox(0.074, 0.016, 0.054), BRASS, mat([s * 0.115, 1.034, 0.085], [0, s * 0.5, 0]));
  bb.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), BRASS2, mat([0.06, 0.97, 0.1], [Math.PI / 2, 0, 0]));
  bb.add(new THREE.CylinderGeometry(0.021, 0.021, 0.024, 10), 0x3b8f9a, mat([0.06, 0.97, 0.105], [Math.PI / 2, 0, 0]));
  bb.xf = chestM;
  bb.add(sbox(0.05, 0.05, 0.02), BRASS2, mat([0, 1.26, 0.118]));
  bb.add(sbox(0.032, 0.032, 0.016), BRASS, mat([0, 1.26, 0.128]));
  for (const s of [-1, 1]) {
    bb.add(sbox(0.036, 0.03, 0.016), BRASS2, mat([s * 0.115, 1.355, 0.112], [0.2, 0, 0]));
    bb.add(sbox(0.065, 0.014, 0.028), BRASS, mat([s * 0.088, 1.19, 0.113]));
  }
  bb.xf = null;
  cb.xf = null;
  const clothM = part(cb, Mc, 'cloth');
  const brassStatic = part(bb, Mb, 'brass');
  rig.add(clothM, brassStatic);

  /* head group (skin head + lids + hair) pivoted at the neck */
  const NP = [0, 1.52, 0.004], HC = [0, 1.655, 0.016];
  const shift = [HC[0] - NP[0], HC[1] - NP[1], HC[2] - NP[2]];
  const h = headDef({ rx: 0.085, ry: 0.101, rz: 0.092, jaw: 0.2, chin: 0.09, brow: 0.07, eyeFx: 0.42, eyeFy: 0.12, mouthFy: -0.5, smile: 0.5 });
  const HB = new Bucket(111), LB = new Bucket(112);
  HB.add(headGeo(h, SKIN, 0xf0907a, 0xc98a68), null);
  faceDetails(HB, h, { skin: SKIN, skin2: SKIN2, lip: 0xc8665a, lip2: 0xd4786a, nose: 1.0, noseFy: -0.2, smile: 0.5, earring: BRASS2 });
  const eye = eyePair(HB, LB, h, { r: 0.0195, irisDark: 0x2f6a4a, iris: 0x4f9a5e, iris2: 0x8fd08a, lid: SKIN, lash: 0x3a1a10, lidA: 1.0, lashes: 3, wing: 0.4, yaw: 0.08 });
  brows(HB, h, { col: 0x9a3a17, thick: 0.0068, inner: 0.16, outer: 0.7, dy: 0.2, arch: 0.045, slope: 0.01 });
  // neck
  HB.add(tubeGeo([[0, -0.1, -0.008], [0, -0.13, -0.004], [0, -0.16, 0.0]], [0.036, 0.035, 0.05], { sides: 10, ref: [0, 0, 1], en: 0.95, capA: false }), SKIN);
  // freckles
  const fr = rng(77);
  for (let i = 0; i < 22; i++) {
    const s = i % 2 ? 1 : -1;
    const fx = s * (0.12 + fr() * 0.52), fy = -0.34 + fr() * 0.3 - (Math.abs(fx) < 0.2 ? 0.0 : 0);
    const q = headPoint(h, fx, fy - 0.0, 0.0006);
    HB.add(new THREE.CircleGeometry(1, 5), 0x9a5538, basisM([q.n[0], q.n[1], q.n[2]], [0, 0, 1], q.p).multiply(mat([0, 0, 0], [Math.PI / 2, 0, fr() * 6], [0.0048 + fr() * 0.0022, 0.0048 + fr() * 0.0022, 1])));
  }
  // hair
  const HR = new Bucket(113);
  addHair(HR, h, { seed: 7, cols: [0x8a3216, 0xc9561f, 0xe98a3e, 0xffb066], scalp: [0xb84a1e, 0x9a3a17], spec: [[1.78, 9, 0.3, 0.9, 0.0], [1.46, 9, 0.27, 1.0, 0.5], [1.12, 6, 0.2, 0.7, 0.25]], r: 0.026, curl: 0.016, amp: 0.014, crown: 3, flow: 5 });
  /* assemble head group */
  const headG = new THREE.Group();
  headG.position.set(NP[0], NP[1], NP[2]);
  const headM = HB.mesh(Ms, 'skin', shift);
  const hairM = HR.mesh(Mc, 'cloth', shift);
  const lidG = new THREE.Group();
  lidG.name = 'lids';
  lidG.position.set(shift[0], eye.ey + shift[1], eye.ez + shift[2]);
  const lidM = LB.mesh(Ms, 'skin');
  lidG.add(lidM);
  headG.add(headM, hairM, lidG);
  rig.add(headG);

  /* arms */
  const orbLocal = [];
  const sk = new Bucket(141), br = new Bucket(151);
  for (const s of [-1, 1]) {
    const sh = [s * 0.186, 0, 0.0];
    const E = [s * 0.05, -0.262, -0.012];
    const f = new THREE.Vector3(s * 0.2, 0.36, 0.91).normalize();
    const W = [E[0] + f.x * 0.25, E[1] + f.y * 0.25, E[2] + f.z * 0.25];
    sk.xf = br.xf = new THREE.Matrix4().makeTranslation(sh[0], 0, 0);
    sk.add(tubeGeo([[0, 0.012, 0], E, W], [0.05, 0.047, 0.041, 0.039, 0.036, 0.03], { sides: 9, sub: 3, ref: [0, 0, 1] }), SKIN);
    sk.add(SPH(8, 6), SKIN, mat([0, 0, 0], [0, 0, 0], [0.056, 0.06, 0.056]));
    // leather bicep band + sleeve edge
    sk.add(tubeGeo([[s * 0.012, -0.095, 0], [s * 0.016, -0.13, -0.001]], [0.052, 0.053], { sides: 10, ref: [0, 0, 1] }), LEATH);
    // hand: fist gripping the gauntlet handle, below the wrist
    const hp = [W[0] - s * 0.002, W[1] - 0.07, W[2] + 0.0];
    const hM = basisM([s * 0.05, -0.55, 0.85].map((v, i) => (i === 1 ? v : v)), [-s * 0.25, 0.9, 0.3], hp);
    addHand(sk, hM, { skin: SKIN, s: -s, size: 1.0, curl: 0.95, thumbCurl: 0.9, sides: 4, palmColor: BURG });
    // fingerless glove band
    sk.add(tubeGeo([[W[0], W[1] - 0.045, W[2] - 0.005], [W[0], W[1] - 0.075, W[2] + 0.01]], [0.04, 0.042], { sides: 10, ref: [0, 0, 1] }), BURG);
    // gauntlet: cuff + ring + lens housing + struts
    const g0 = [E[0] + f.x * 0.06, E[1] + f.y * 0.06, E[2] + f.z * 0.06];
    br.add(tubeGeo([g0, W, [W[0] + f.x * 0.03, W[1] + f.y * 0.03, W[2] + f.z * 0.03]], [0.058, 0.066, 0.078, 0.082], { sides: 12, ref: [0, 1, 0], sub: 2 }), BRASS);
    for (const t of [0.5]) {
      const q = [lerp(g0[0], W[0], t), lerp(g0[1], W[1], t), lerp(g0[2], W[2], t)];
      br.add(new THREE.TorusGeometry(0.067 + t * 0.012, 0.0085, 4, 14), BRASS2, basisM([f.x, f.y, f.z], [0, 1, 0], q).multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0])));
    }
    const oc = [W[0] + f.x * 0.075, W[1] + f.y * 0.075 + 0.012, W[2] + f.z * 0.075];
    const fm = basisM([f.x, f.y, f.z], [0, 1, 0], oc).multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0]));
    br.add(new THREE.TorusGeometry(0.094, 0.015, 5, 20), BRASS2, fm);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.283 + 0.26;
      const loc = new THREE.Matrix4().multiplyMatrices(fm, mat([Math.cos(a) * 0.099, 0, Math.sin(a) * 0.099], [0, 0, 0], [1, 1, 1]));
      br.add(ICO0, BRASS2, new THREE.Matrix4().multiplyMatrices(loc, mat([0, 0, 0], [0, 0, 0], [0.011, 0.011, 0.011])));
    }
    // struts from cuff to ring (3 at the back of the lens)
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * 6.283 + 1.0;
      const bp = new THREE.Vector3(W[0] + f.x * 0.025, W[1] + f.y * 0.025, W[2] + f.z * 0.025);
      const m = fm.clone();
      const rp = new THREE.Vector3(Math.cos(a) * 0.088, -0.008, Math.sin(a) * 0.088).applyMatrix4(m);
      br.add(new THREE.CylinderGeometry(0.0055, 0.0055, 1, 4), BRASS3, matAlong([bp.x, bp.y, bp.z], [rp.x, rp.y, rp.z]).m);
    }
    // shoulder pauldron + elbow guard
    br.add(new THREE.SphereGeometry(0.075, 12, 5, 0, Math.PI * 2, 0, 1.35), BRASS, mat([s * 0.022, 0.012, 0], [0, 0, s * -0.55], [1.05, 0.78, 1.0]));
    br.add(dome(0.05, 1, 1, 0.7, 8), BRASS, mat([E[0], E[1], E[2] - 0.045], [Math.PI, 0, 0]));
    orbLocal.push([oc[0] + sh[0], oc[1], oc[2]]);
    sk.xf = br.xf = null;
  }
  const armG = new THREE.Group();
  armG.position.set(0, 1.44, 0);
  armG.add(sk.mesh(Ms, 'skin'), br.mesh(Mb, 'brass'));
  rig.add(armG);
  // glowing orbs: instanced cores + glass shells
  const coreG = new THREE.IcosahedronGeometry(0.056, 1);
  {
    const pp = coreG.attributes.position, cols = new Float32Array(pp.count * 3);
    for (let i = 0; i < pp.count; i += 3) {
      const cx = (pp.getX(i) + pp.getX(i + 1) + pp.getX(i + 2)) / 3, cy = (pp.getY(i) + pp.getY(i + 1) + pp.getY(i + 2)) / 3, cz = (pp.getZ(i) + pp.getZ(i + 1) + pp.getZ(i + 2)) / 3;
      const hh = ((Math.atan2(cz, cx) / 6.2832 + cy * 7 + 1) % 1 + 1) % 1;
      _c.setHSL(hh, 0.8, 0.62);
      for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = _c.r; cols[(i + k) * 3 + 1] = _c.g; cols[(i + k) * 3 + 2] = _c.b; }
    }
    coreG.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    coreG.computeVertexNormals();
  }
  const coreMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const coreMesh = new THREE.InstancedMesh(coreG, coreMat, 2);
  coreMesh.userData.mat = 'neon';
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xcdf2ff, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false, emissive: 0x16303a });
  const shellMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.078, 12, 8), shellMat, 2);
  shellMesh.userData.mat = 'glass';
  coreMesh.frustumCulled = shellMesh.frustumCulled = false;
  rig.add(coreMesh, shellMesh);

  let castT = 0;
  const CAST = 0.6;
  const blink = makeBlinker(3);
  const tq = new THREE.Quaternion(), te = new THREE.Euler(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), tm = new THREE.Matrix4(), om = new THREE.Matrix4();
  function update(dt, t) {
    castT = Math.max(0, castT - dt);
    const k = castT > 0 ? Math.sin(Math.PI * (1 - castT / CAST)) : 0;
    const br = Math.sin(t * 1.8);
    rig.scale.y = 1 + br * 0.004;
    rig.rotation.z = Math.sin(t * 0.35) * 0.006;
    headG.rotation.set(-0.02 + br * 0.006 - k * 0.1, 0.1 + Math.sin(t * 0.27) * 0.08, 0.035 + Math.sin(t * 0.31) * 0.01);
    hairM.rotation.x = Math.sin(t * 1.1) * 0.012;
    lidG.rotation.x = blink(t) * 1.25;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      if (i === 0) { armG.rotation.set(-k * 0.9 + Math.sin(t * 1.3) * 0.012, 0, 0); armG.updateMatrix(); }
      const spin = t * (1.4 + k * 3) * (i ? 1 : -1);
      const sc = 1 + k * 0.35 + Math.sin(t * 2.2 + i) * 0.03;
      const oc = orbLocal[i];
      te.set(t * 0.7, spin, 0);
      tq.setFromEuler(te);
      tm.compose(tp.set(oc[0], oc[1], oc[2]), tq, ts.set(sc, sc, sc));
      om.multiplyMatrices(armG.matrix, tm);
      coreMesh.setMatrixAt(i, om);
      te.set(0, -t * 0.3, 0);
      tq.setFromEuler(te);
      tm.compose(tp.set(oc[0], oc[1], oc[2]), tq, ts.set(sc, sc, sc));
      om.multiplyMatrices(armG.matrix, tm);
      shellMesh.setMatrixAt(i, om);
    }
    coreMesh.instanceMatrix.needsUpdate = shellMesh.instanceMatrix.needsUpdate = true;
    coreMat.color.setScalar(0.9 + k * 0.5 + Math.sin(t * 2.5) * 0.1);
    shellMat.opacity = 0.28 + k * 0.25;
  }
  update(0, 0);
  return { group, update, cast() { castT = CAST; }, gloveColor: 0xffb13b };
}

/* ======================================================================
   5. FOLD  "Origa" : origami fox spirit
   ====================================================================== */
const IVORY = 0xfffaf0, IVORY2 = 0xf1e9d8, IVORY3 = 0xe0d5bd, CHAR = 0x2b2b33, CHAR2 = 0x4a4a56, CORAL = 0xff7f66, PEACH = 0xffc2a0;

// folded-paper feather: crease down the middle, kink at mid-height, tip folded back. hangs down -Y, ridge toward +Z
const foldCache = new Map();
function foldGeo(w, h, d, tipOnly) {
  const key = [w, h, d, tipOnly].join(',');
  if (foldCache.has(key)) return foldCache.get(key);
  const TL = [-w / 2, 0, 0], TR = [w / 2, 0, 0], TC = [0, 0, d * 0.55];
  const ML = [-w * 0.48, -h * 0.5, 0], MR = [w * 0.48, -h * 0.5, 0], MC = [0, -h * 0.5, d];
  const TIP = [0, -h, d * 0.25];
  const T = tipOnly ? [[ML, TIP, MC], [MC, TIP, MR]] : [[TL, ML, TC], [TC, ML, MC], [TC, MC, MR], [TC, MR, TR]];
  const pos = [];
  for (const t of T) for (const v of t) pos.push(...v);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.userData.flat = true;
  g.computeVertexNormals();
  foldCache.set(key, g);
  return g;
}
function feather(b, m, w, h, d, c1, c2) {
  b.add(foldGeo(w, h, d, false), c1, m);
  b.add(foldGeo(w, h, d, true), c2 ?? c1, m);
}
function featherRing(b, o) {
  const { y, rx, rz, n, h, tilt, colorFn, phase = 0, d = 0.05, wmul = 1.9, tiltJit = 0.04, z0 = 0 } = o;
  const w = o.w || ((Math.PI * 2 * Math.sqrt((rx * rx + rz * rz) / 2)) / n) * wmul;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const jr = 1 + (b.r() - 0.5) * 0.06;
    const hh = h * (0.88 + b.r() * 0.24);
    const m = mat([Math.sin(a) * rx * jr, y + (b.r() - 0.5) * 0.015, Math.cos(a) * rz * jr + z0], [-(tilt + (b.r() - 0.5) * tiltJit * 2), a, (b.r() - 0.5) * 0.1]);
    const c = colorFn(a, i);
    feather(b, m, w, hh, d, c[0], c[1]);
  }
}
const _flat = (g) => { g.userData.flat = true; return g; };
function orientGeo(tris, fn) {
  const pos = [];
  for (const t of tris) {
    const [a, b, c] = t;
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const flip = fn(nx, ny, nz, cx, cy, cz);
    for (const v of (flip ? [a, c, b] : [a, b, c])) pos.push(...v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return _flat(g);
}
function earGeo(w, h, d) {
  const BL = [-w / 2, 0, 0], BR = [w / 2, 0, 0], T = [0.012, h, -d * 0.2], K0 = [0, 0, -d], K1 = [0.004, h * 0.5, -d * 0.85];
  const tris = [[BL, T, K1], [BL, K1, K0], [BR, T, K1], [BR, K1, K0]];
  return orientGeo(tris, (nx, ny, nz) => nz < 0);
}
function snoutGeo() {
  const BTL = [-0.034, 0.036, 0.086], BTR = [0.034, 0.036, 0.086], BBL = [-0.05, -0.044, 0.07], BBR = [0.05, -0.044, 0.07];
  const M = [0, 0.05, 0.14], N = [0, -0.008, 0.222], LM = [0, -0.056, 0.15];
  const tris = [[BTL, N, M], [BTR, M, N], [BTL, M, BTR], [BTL, BBL, N], [BTR, N, BBR], [BBL, LM, N], [BBR, N, LM], [BBL, BBR, LM]];
  return orientGeo(tris, (nx, ny, nz, cx, cy, cz) => nx * cx + ny * (cy - 0.0) + nz * (cz - 0.12) < 0);
}
function shardGeo(w, h, d, k = 0.35) {
  const V = [[0, 0, 0], [-w / 2, -h * k, 0], [w / 2, -h * k, 0], [0, -h, 0], [0, -h * k, d]];
  const T = [[0, 1, 4], [0, 4, 2], [1, 3, 4], [4, 3, 2]];
  const pos = [];
  for (const t of T) for (const i of t) pos.push(...V[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return _flat(g);
}
const shardCache = new Map();
function shard(w, h, d, k) {
  const key = [w, h, d, k].join(',');
  if (!shardCache.has(key)) shardCache.set(key, shardGeo(w, h, d, k));
  return shardCache.get(key);
}
// petal for the chest bloom: base at origin pointing outward at angle phi from up, cupped toward +Z
function petalM(pos, phi, pitch) {
  const A = new THREE.Matrix4().makeRotationZ(Math.PI - phi);
  const B = new THREE.Matrix4().makeRotationX(pitch);
  const m = A.multiply(B);
  m.setPosition(pos[0], pos[1], pos[2]);
  return m;
}

// chevron-banded plumage palette: ivory center column, charcoal V stripes, charcoal back, dipped tips
function plume(a, k, i, rowF) {
  const lat = Math.abs(Math.sin(a)), fr = Math.cos(a);
  const band = (((k * 1.0 + lat * 4.5) % 4) + 4) % 4;
  const tipI = rowF > 0.7 ? PEACH : IVORY3;
  if (fr < -0.25) return band < 1.6 ? [CHAR, CHAR2] : [CHAR2, CHAR];
  if (fr > 0.2 && lat < 0.26) return [i & 1 ? IVORY : IVORY2, rowF > 0.6 ? PEACH : IVORY3];
  if (band < 1.1) return [CHAR, CHAR2];
  return [i & 1 ? IVORY2 : IVORY, tipI];
}

function buildFold() {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const paper = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, emissive: 0x6a6558, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, emissive: 0xff7a55, emissiveIntensity: 0.8, side: THREE.DoubleSide });

  /* ---- static body: legs, hips, torso core, shingled chest, collar */
  const body = new Bucket(11);
  for (const s of [-1, 1]) {
    const ax = s * 0.095, az = s < 0 ? 0.0 : 0.02;
    body.add(tubeGeo([[s * 0.09, 0.98, 0], [s * 0.1, 0.55, 0.04], [ax, 0.16, az]], [0.055, 0.05, 0.036, 0.026], { sides: 5, sub: 3, ref: [0, 0, 1] }), (x, y) => (y > 0.5 ? CHAR : CHAR2), null, { flat: true });
    // paper paw: ivory instep + three folded claws
    body.add(foldGeo(0.1, 0.22, 0.05, false), IVORY, mat([ax, 0.1, az + 0.02], [Math.PI / 2 - 0.2, 0, 0], [1, 1, 1]));
    for (let i = -1; i <= 1; i++) {
      const tx = ax + i * 0.035;
      const cl = matAlong([tx, 0.04, az + 0.1], [tx + i * 0.012, 0.012, az + 0.27]).m;
      body.add(new THREE.ConeGeometry(0.022, 1, 3, 1), i === 0 ? CHAR : IVORY, cl, { flat: true });
    }
  }
  body.add(loft([
    { y: 0.92, rx: 0.15, rz: 0.1 }, { y: 1.08, rx: 0.12, rz: 0.085 }, { y: 1.3, rx: 0.145, rz: 0.1 }, { y: 1.48, rx: 0.15, rz: 0.095 }, { y: 1.56, rx: 0.06, rz: 0.055 },
  ], 6), (x, y) => (y > 1.2 ? CHAR2 : CHAR), null, { flat: true });
  body.add(tubeGeo([[0, 1.5, 0.005], [0, 1.58, 0.015]], [0.05, 0.04], { sides: 6, ref: [0, 0, 1] }), CHAR, null, { flat: true });
  // chest shingles: chevron plumage
  for (let k = 0; k < 9; k++) {
    featherRing(body, { y: 1.47 - k * 0.058, rx: 0.14 + k * 0.004, rz: 0.098 + k * 0.005, n: 11 + (k & 1) * 2, h: 0.17 + k * 0.01, tilt: 0.28 + k * 0.025, phase: (k & 1) * 0.3, colorFn: (a, i) => plume(a, k, i, k / 8 * 0.5) });
  }
  // collar ruff
  featherRing(body, { y: 1.55, rx: 0.2, rz: 0.15, n: 13, w: 0.15, h: 0.22, tilt: 0.75, colorFn: (a, i) => [i % 4 === 3 ? CHAR2 : IVORY, i % 4 === 3 ? IVORY : CHAR] });
  featherRing(body, { y: 1.6, rx: 0.13, rz: 0.1, n: 9, w: 0.12, h: 0.17, tilt: 0.55, phase: 0.3, colorFn: (a, i) => [i % 3 === 2 ? CHAR : IVORY2, i % 3 === 2 ? IVORY2 : PEACH] });
  const sk = body;
  for (let k = 0; k < 22; k++) {
    const f = k / 21;
    featherRing(sk, { y: 1.03 - f * 0.83, rx: 0.11 + f * 0.17, rz: 0.09 + f * 0.16, n: 11 + Math.round(f * 9), h: 0.24 + f * 0.2, tilt: 0.1 + f * 0.24, phase: (k & 1) * 0.28 + k * 0.1, colorFn: (a, i) => plume(a, k + 9, i, f) });
  }

  const bodyG = part(body, paper, 'cloth');
  rig.add(bodyG);

  /* ---- head group (fox) */
  const NP = [0, 1.56, 0.0], HC = [0, 1.71, 0.012];
  const shift = [HC[0] - NP[0], HC[1] - NP[1], HC[2] - NP[2]];
  const h = headDef({ rx: 0.082, ry: 0.088, rz: 0.1, brow: 0, cheek: 0, socket: 0, chin: 0, jaw: 0, eyeFx: 0.72, eyeFy: 0.15 });
  const HB = new Bucket(31), LB = new Bucket(32);
  HB.add(ICO1, IVORY, mat([0, 0, 0], [0.3, 0.2, 0], [0.083, 0.088, 0.1]), { flat: true, jitter: 0.03 });
  HB.add(ICO0, IVORY2, mat([0, -0.05, -0.02], [0, 0.3, 0], [0.07, 0.06, 0.07]), { flat: true });
  HB.add(snoutGeo(), (x, y, z) => (y > 0.03 ? IVORY : IVORY2), null, { flat: true, jitter: 0.03 });
  HB.add(new THREE.ConeGeometry(0.026, 0.04, 4, 1), CHAR, mat([0, -0.005, 0.232], [Math.PI / 2, 0, 0.78]), { flat: true });
  // cheeks, muzzle fluff, mouth crease
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) feather(HB, mat([s * 0.07, -0.01 - i * 0.026, 0.035 - i * 0.022], [-0.1 - i * 0.1, s * 0.1, s * (1.15 + i * 0.25)]), 0.07, 0.15 - i * 0.02, 0.03, i === 1 ? IVORY2 : IVORY, i === 1 ? CHAR2 : IVORY2);
    HB.add(tubeGeo([[s * 0.004, -0.04, 0.212], [s * 0.03, -0.05, 0.16], [s * 0.05, -0.045, 0.105], [s * 0.062, -0.03, 0.078]], [0.0028, 0.0026, 0.0024, 0.002], { sides: 3, sub: 1, ref: [0, 1, 0] }), CHAR, null, { flat: true });
    // ears: charcoal outer, ivory/coral inner
    const em = mat([s * 0.064, 0.062, -0.012], [-0.12, s * 0.15, s * -0.3]);
    HB.add(earGeo(0.118, 0.29, 0.04), CHAR, em, { flat: true });
    HB.add(earGeo(0.07, 0.2, 0.025), (x, y) => (y > 0.14 ? IVORY2 : PEACH), new THREE.Matrix4().multiplyMatrices(em, mat([0, 0.012, 0.022], [0, 0, 0])), { flat: true });
    // facial markings: charcoal teardrop under each eye
    feather(HB, mat([s * 0.062, -0.026, 0.066], [-0.2, 0, s * 0.3]), 0.02, 0.05, 0.01, CHAR2, CHAR);
  }
  // crest between the ears + brow diamond
  for (let i = 0; i < 5; i++) { const f = i / 4 - 0.5; feather(HB, mat([f * 0.09, 0.07 - Math.abs(f) * 0.02, -0.03], [2.0 - Math.abs(f) * 0.3, 0, f * 0.9]), 0.05, 0.11 - Math.abs(f) * 0.03, 0.02, i % 2 ? IVORY : CHAR, i % 2 ? CHAR : IVORY); }
  feather(HB, mat([0, 0.074, 0.062], [-0.55, 0, 0]), 0.05, 0.08, 0.016, CHAR, CORAL);
  const eye = eyePair(HB, LB, h, { r: 0.0275, sink: 0.3, tilt: 0.4, sx: 1.2, sy: 0.85, yaw: 0.12, sclera: 0xf6ead2, irisDark: 0xb83c18, iris: 0xff9440, iris2: 0xffd27a, pupilW: 0.2, pupilH: 0.5, irisW: 0.7, lid: IVORY2, lash: CHAR, lashes: 3, lashLen: 0.5, wing: 1.0, lidA: 0.95 });
  brows(HB, h, { col: CHAR, thick: 0.0075, sides: 3, inner: 0.22, outer: 0.78, dy: 0.2, arch: 0.02, slope: 0.1, off: 0.0015 });
  const headG = new THREE.Group();
  headG.position.set(NP[0], NP[1], NP[2]);
  const headM = HB.mesh(paper, 'cloth', shift);
  const lidG = new THREE.Group();
  lidG.name = 'lids';
  lidG.position.set(shift[0], eye.ey + shift[1], eye.ez + shift[2]);
  const lidM = LB.mesh(paper, 'cloth');
  lidG.add(lidM);
  headG.add(headM, lidG);
  rig.add(headG);

  /* ---- chest bloom (emissive coral paper-star) */
  const starB = new Bucket(41);
  const cc = [0, 1.33, 0.125];
  const layers = [[16, 0.23, 0.07, 0, -0.18, CORAL, 0xff9a78], [12, 0.17, 0.06, 0.26, -0.42, 0xff9a78, PEACH], [8, 0.11, 0.05, 0.4, -0.7, PEACH, 0xfff0dc]];
  for (const [n, len, wid, off, pitch, c1, c2] of layers) {
    for (let i = 0; i < n; i++) {
      const phi = ((i + off) / n) * Math.PI * 2;
      starB.add(foldGeo(wid, len, 0.03, false), c1, petalM([cc[0], cc[1], cc[2] + (1 - Math.abs(pitch)) * 0.0 + Math.abs(pitch) * 0.04], phi, pitch), { jitter: 0.04 });
      starB.add(foldGeo(wid, len, 0.03, true), c2, petalM([cc[0], cc[1], cc[2] + Math.abs(pitch) * 0.04], phi, pitch), { jitter: 0.04 });
    }
  }
  starB.add(new THREE.OctahedronGeometry(1, 0), 0xfff2e0, mat([cc[0], cc[1], cc[2] + 0.06], [0, 0.4, 0], [0.04, 0.055, 0.04]), { flat: true });
  const starM = part(starB, glowMat, 'neon');
  rig.add(starM);
  const halo = haloMesh(0.55, 0xff8a66);
  halo.position.set(0, 1.35, -0.09);
  rig.add(halo);

  /* ---- skirt (shingled gown; rustles) */
  /* ---- arms (shared pivot at shoulder height): charcoal limb, feather sleeves, pauldron fans, paper hands */
  const ak = new Bucket(61);
  for (const s of [-1, 1]) {
    const shx = s * 0.215;
    ak.xf = new THREE.Matrix4().makeTranslation(shx, 0, 0);
    const E = [s * 0.05, -0.28, 0.0], W = [s * 0.085, -0.53, 0.05];
    ak.add(tubeGeo([[0, 0, 0], E, W], [0.044, 0.04, 0.034, 0.03, 0.026], { sides: 5, sub: 3, ref: [0, 0, 1] }), (x, y, z, u, v) => (v > 0.7 ? CHAR2 : CHAR), null, { flat: true });
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const py = -0.03 - t * 0.42;
      feather(ak, mat([s * (0.058 + 0.02 * t), py, 0.0], [-0.1, 0, s * (0.5 - t * 0.2)]), 0.11 - t * 0.02, 0.2, 0.035, i % 2 ? CHAR2 : IVORY, i % 2 ? IVORY : CHAR);
      feather(ak, mat([s * 0.01, py + 0.015, -0.048], [0.18, 0, s * -0.2]), 0.1 - t * 0.02, 0.17, 0.03, i % 2 ? IVORY2 : CHAR2, i % 2 ? CHAR2 : IVORY2);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.34;
      feather(ak, mat([s * 0.02, 0.04, 0.0], [-0.3, a * s, s * (1.0 + (i - 2) * 0.16)]), 0.11, 0.22, 0.04, i % 2 ? IVORY : IVORY2, i % 2 ? CHAR2 : PEACH);
    }
    const hM = basisM([-s * 0.12, 1, -0.22], [-s * 1, 0.1, 0.25], W);
    addHand(ak, hM, { skin: IVORY, s: 1, size: 1.0, curl: 0.3, thumbCurl: 0.2, spread: 0.1, sides: 4, palmColor: IVORY2 });
    ak.xf = null;
  }
  const armG = new THREE.Group();
  armG.position.set(0, 1.47, 0);
  armG.add(ak.mesh(paper, 'cloth'));
  rig.add(armG);

  /* ---- tail fan: two layers of long creased blades with charcoal-dipped tips */
  const tb = new Bucket(71);
  tb.xf = new THREE.Matrix4().makeTranslation(0, 0.9, -0.16);
  const NB = 10;
  for (let L = 0; L < 2; L++) {
    const n = L === 0 ? NB : NB - 2;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1) - 0.5;
      const hh = (L === 0 ? 0.6 : 0.45) - Math.abs(f) * 0.18;
      const m = mat([0, 0, -L * 0.05], [-0.35, 0, Math.PI + f * (L === 0 ? 1.5 : 1.2)]);
      const alt = (i + L) % 3 === 1;
      feather(tb, m, 0.2, hh, 0.06, alt ? CHAR2 : (L ? IVORY : IVORY2), alt ? IVORY : (i % 2 ? CHAR : CHAR2));
    }
  }
  tb.xf = null;
  const tailG = part(tb, paper, 'cloth', [0, 0.9, -0.16]);
  rig.add(tailG);

  /* ---- cast props: paper cranes + hex shield (visible only while casting) */
  const craneGeo = (() => {
    const bb = new Bucket(5);
    bb.add(new THREE.OctahedronGeometry(1, 0), IVORY, mat([0, 0, 0], [0, 0, 0], [0.035, 0.03, 0.09]), { flat: true });
    for (const s of [-1, 1]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.02, 0.05, s * 0.2, 0.1, 0.03, s * 0.2, 0.1, -0.06, 0, 0.02, 0.05, s * 0.2, 0.1, -0.06, 0, 0.02, -0.06], 3));
      g.computeVertexNormals();
      bb.add(g, s > 0 ? PEACH : CORAL, null, { flat: true });
    }
    cone(bb, [0, 0.01, 0.07], [0, 0.1, 0.15], 0.012, IVORY2, 3, { flat: true });
    cone(bb, [0, 0.095, 0.145], [0, 0.1, 0.19], 0.008, CORAL, 3, { flat: true });
    cone(bb, [0, 0.01, -0.07], [0, 0.07, -0.16], 0.012, IVORY2, 3, { flat: true });
    return bb.geometry();
  })();
  const cb2 = new Bucket(81);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const g = craneGeo.clone();
    g.applyMatrix4(mat([Math.sin(a) * 0.75, 0.05 + Math.sin(i * 2.1) * 0.25, Math.cos(a) * 0.75], [0, a + Math.PI / 2, 0], [1.6, 1.6, 1.6]));
    cb2.geos.push(g);
  }
  const cranesM = cb2.mesh(paper, 'cloth');
  cranesM.position.set(0, 1.2, 0);
  cranesM.visible = false;
  rig.add(cranesM);
  const sb = new Bucket(91);
  {
    const rIn = 0.26, rOut = 0.52, c = [0, 0, 0.1];
    const ring = (r, n, off) => Array.from({ length: n }, (_, i) => [Math.sin(off + (i / n) * 6.2832) * r, Math.cos(off + (i / n) * 6.2832) * r, 0]);
    const inn = ring(rIn, 6, 0), out = ring(rOut, 6, 0.5236);
    const mk = (pts) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals(); return g; };
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      sb.add(mk([c, inn[i], inn[j]]), 0xffb99a, null, { flat: true, jitter: 0.12 });
      sb.add(mk([inn[i], out[i], inn[j]]), 0xff8a6a, null, { flat: true, jitter: 0.12 });
      sb.add(mk([inn[j], out[i], out[j]]), 0xff6f55, null, { flat: true, jitter: 0.12 });
    }
  }
  const shieldMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.6, emissive: 0xff6a4a, emissiveIntensity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  const shieldM = sb.mesh(shieldMat, 'neon');
  shieldM.position.set(0, 1.25, 0.6);
  shieldM.visible = false;
  rig.add(shieldM);

  let castT = 0;
  const CAST = 0.6;
  const blink = makeBlinker(5);
  function update(dt, t) {
    castT = Math.max(0, castT - dt);
    const k = castT > 0 ? Math.sin(Math.PI * (1 - castT / CAST)) : 0;
    const br = Math.sin(t * 1.7);
    rig.scale.y = 1 + br * 0.005;
    rig.position.y = br * 0.003;
    rig.rotation.z = Math.sin(t * 0.3) * 0.006;
    headG.rotation.set(-0.02 + br * 0.006 - k * 0.1, 0.14 + Math.sin(t * 0.24) * 0.09, -0.05 + Math.sin(t * 0.33) * 0.015);
    lidG.rotation.x = blink(t) * 1.25;
    glowMat.emissiveIntensity = 0.75 + br * 0.2 + k * 1.1;
    const hs = 1 + br * 0.05 + k * 0.5;
    halo.scale.set(hs, hs, 1);
    halo.material.opacity = 0.7 + br * 0.1 + k * 0.3;
    starM.scale.setScalar(1 + br * 0.012 + k * 0.1);
    bodyG.rotation.set(0, Math.sin(t * 0.7) * 0.012, 0);
    armG.rotation.set(-k * 1.35 + Math.sin(t * 1.5) * 0.012, 0, 0);
    tailG.rotation.set(0, Math.sin(t * 0.8) * 0.06, Math.sin(t * 1.1) * 0.05 + k * 0.12);
    cranesM.visible = shieldM.visible = k > 0.005;
    if (k > 0.005) {
      cranesM.rotation.y = t * 2.2;
      const sc = 0.3 + k * 0.6;
      cranesM.scale.set(sc, sc, sc);
      shieldM.scale.setScalar(0.25 + k * 0.5);
      shieldMat.opacity = 0.4 * k;
    }
  }
  update(0, 0);
  return { group, update, cast() { castT = CAST; }, gloveColor: 0xff8a6b };
}

/* ======================================================================
   7. STARLING
   ====================================================================== */
const PURPLE = 0x7b3fd8, PURPLE2 = 0x5a2bb0, PURPLE3 = 0x9a63f0, ORANGE = 0xff8a22, ORANGE2 = 0xffb03d, GOLD = 0xffcc3a, GOLD2 = 0xffe27a, GOLD3 = 0xc9951c;
const SKINS = 0xf5c6a2, SKINS2 = 0xe5a888;
const tri = (x) => Math.abs((((x % 1) + 1) % 1) * 2 - 1);
const harl = (u, v, K, L, a, b, off = 0) => (((Math.floor(u * K + v * L + off) + Math.floor(u * K - v * L + off)) & 1) ? a : b);

function starGeo(R, r, th) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r : R;
    pts.push([Math.sin(a) * rr, Math.cos(a) * rr]);
  }
  const pos = [];
  const f = [0, 0, th], bk = [0, 0, -th];
  for (let i = 0; i < 10; i++) {
    const j = (i + 1) % 10;
    const a = [...pts[i], 0], c = [...pts[j], 0];
    pos.push(...f, ...c, ...a);
    pos.push(...bk, ...a, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.userData.flat = true;
  g.computeVertexNormals();
  return g;
}

// finite-difference normals for a (cols+1)x(rows+1) grid, allocation free
function gridNormals(pos, nrm, cols, rows, vo = 0) {
  const W = cols + 1;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(cols, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(rows, j + 1);
      const a = (vo + j * W + i1) * 3, b = (vo + j * W + i0) * 3, c = (vo + j1 * W + i) * 3, d = (vo + j0 * W + i) * 3;
      const ux = pos[a] - pos[b], uy = pos[a + 1] - pos[b + 1], uz = pos[a + 2] - pos[b + 2];
      const vx = pos[c] - pos[d], vy = pos[c + 1] - pos[d + 1], vz = pos[c + 2] - pos[d + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      const o = (vo + j * W + i) * 3;
      nrm[o] = nx / l; nrm[o + 1] = ny / l; nrm[o + 2] = nz / l;
    }
  }
}

function buildStarling() {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const Mc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.0, emissive: 0x120820, emissiveIntensity: 0.6 });
  const Ms = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.0, emissive: 0x2a100a, emissiveIntensity: 0.3 });
  const Mg = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6, emissive: 0x7a5200, emissiveIntensity: 0.7 });
  const capeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x160a28 });

  const cb = new Bucket(201), gb = new Bucket(202);
  const pelvisM = about([0, 1.0, 0], [0, 0.03, -0.05], [-0.014, 0, 0]);
  const chestM = about([0, 1.1, 0], [0, -0.07, 0.055], [0.008, 0, 0]);

  /* legs + platform boots */
  const legP = {
    '-1': [[-0.082, 0.99, 0.0], [-0.088, 0.58, 0.012], [-0.092, 0.26, -0.008]],
    1: [[0.08, 0.98, 0.0], [0.095, 0.58, 0.075], [0.11, 0.26, -0.02]],
  };
  const legR = [0.079, 0.076, 0.065, 0.05, 0.045, 0.042, 0.034];
  for (const s of [-1, 1]) {
    const P = legP[s];
    const A = s < 0 ? PURPLE : ORANGE, B = s < 0 ? ORANGE : PURPLE;
    cb.xf = pelvisM;
    cb.add(tubeGeo(P, legR, { sides: 14, sub: 6, ref: [0, 0, 1] }), (x, y, z, u, v) => (v < 0.2 ? A : harl(u, v, 7, 2.6, A, B, 0.5)), null);
    cb.xf = null;
    const ax = P[2][0], az = P[2][2];
    const yaw = s * 0.22;
    const fm = about([ax, 0, az], [0, yaw, 0]);
    cb.xf = fm;
    const boot = s < 0 ? PURPLE2 : 0xd96a10;
    cb.add(tubeGeo([[ax, 0.12, az], [ax, 0.22, az + 0.002], [ax, 0.34, az + 0.004]], [0.044, 0.04, 0.036], { sides: 12, ref: [0, 0, 1] }), boot);
    cb.add(tubeGeo([[ax, 0.2, az - 0.05], [ax, 0.17, az + 0.03], [ax, 0.15, az + 0.1], [ax, 0.142, az + 0.15]], [0.034, 0.04, 0.042, 0.03], { sides: 10, sub: 2, ref: [0, 1, 0], en: 0.78, eb: 1.12, capA: true, capB: true }), boot);
    // platform slab + heel block
    cb.add(rbox(0.09, 0.088, 0.175, 0.022), (x, y) => (y > 0.07 ? GOLD : boot), mat([ax, 0.044, az + 0.09]));
    cb.add(rbox(0.06, 0.15, 0.06, 0.016), (x, y) => (y < 0.03 ? GOLD3 : boot), mat([ax, 0.075, az - 0.04]));
    cb.xf = null;
    gb.xf = fm;
    gb.add(new THREE.TorusGeometry(0.047, 0.0085, 5, 16), GOLD, mat([ax, 0.3, az + 0.004], [Math.PI / 2, 0, 0]));
    gb.add(new THREE.TorusGeometry(0.043, 0.006, 4, 14), GOLD2, mat([ax, 0.265, az + 0.003], [Math.PI / 2, 0, 0]));
    gb.add(ICO0, GOLD2, mat([ax, 0.3, az + 0.052], [0, 0, 0], [0.012, 0.012, 0.012]));
    gb.xf = null;
  }
  /* pelvis + torso */
  cb.xf = pelvisM;
  cb.add(loft([{ y: 0.9, rx: 0.15, rz: 0.1 }, { y: 0.98, rx: 0.165, rz: 0.106 }, { y: 1.05, rx: 0.125, rz: 0.086 }, { y: 1.1, rx: 0.098, rz: 0.07 }], 18, false, true),
    (x, y, z, u, v) => (y > 1.0 ? harl(u, (y - 1.0) / 0.2, 9, 2.0, GOLD, PURPLE, 0.25) : (x + 0.02 * tri(y * 11) > 0 ? ORANGE : PURPLE)), null);
  gb.xf = pelvisM;
  gb.add(loft([{ y: 1.095, rx: 0.1, rz: 0.072 }, { y: 1.135, rx: 0.099, rz: 0.071 }], 18, false, false), GOLD);
  gb.xf = null;
  cb.xf = chestM;
  cb.add(loft([
    { y: 1.1, rx: 0.098, rz: 0.07 }, { y: 1.2, rx: 0.118, rz: 0.086 }, { y: 1.3, rx: 0.138, rz: 0.1 }, { y: 1.38, rx: 0.15, rz: 0.098 }, { y: 1.43, rx: 0.152, rz: 0.082 },
    { y: 1.465, rx: 0.11, rz: 0.06 }, { y: 1.49, rx: 0.045, rz: 0.04 }, { y: 1.51, rx: 0.035, rz: 0.035 },
  ], 18, true, false), (x, y, z, u, v) => (v > 0.7 ? SKINS : (x + 0.022 * tri(y * 12 + 0.2) > 0 ? ORANGE : PURPLE)), null);
  // gold collar trim + chest gem
  gb.xf = chestM;
  gb.add(loft([{ y: 1.455, rx: 0.12, rz: 0.066 }, { y: 1.47, rx: 0.105, rz: 0.058 }], 18, false, false), GOLD);
  gb.add(new THREE.OctahedronGeometry(1, 0), GOLD2, mat([0, 1.3, 0.104], [0, 0, 0], [0.018, 0.026, 0.012]), { flat: true });
  gb.xf = null;
  cb.xf = null;
  const bodyG = part(cb, Mc, 'cloth');
  const goldG = part(gb, Mg, 'brass');
  rig.add(bodyG, goldG);

  /* head group */
  const NP = [0, 1.52, 0.004], HC = [0, 1.66, 0.016];
  const shift = [HC[0] - NP[0], HC[1] - NP[1], HC[2] - NP[2]];
  const h = headDef({ rx: 0.08, ry: 0.103, rz: 0.088, jaw: 0.34, chin: 0.075, brow: 0.05, cheek: 0.05, socket: 0.07, eyeFx: 0.43, eyeFy: 0.12, mouthFy: -0.5, smile: 0.9, blushAmt: 0.5 });
  const HB = new Bucket(211), LB = new Bucket(212);
  HB.add(headGeo(h, SKINS, 0xf59a86, 0xcf9478), null);
  faceDetails(HB, h, { skin: SKINS, skin2: SKINS2, lip: 0xe0607a, lip2: 0xe97088, nose: 0.85, noseFy: -0.2, smile: 0.9, lipW: 0.24, earring: GOLD, mouthLine: 0x9a2f4a, lipUp: 0.0052, lipLo: 0.0072 });
  const eye = eyePair(HB, LB, h, { r: 0.0215, irisDark: 0x2a2f9a, iris: 0x4f6ee8, iris2: 0x9fd4ff, lid: SKINS, lash: 0x2a1030, lidA: 0.92, lashes: 5, lashLen: 0.75, wing: 0.85, irisW: 0.64 });
  brows(HB, h, { col: 0xb4561a, thick: 0.0048, inner: 0.18, outer: 0.72, dy: 0.21, arch: 0.06, slope: 0.03 });
  HB.add(tubeGeo([[0, -0.1, -0.008], [0, -0.13, -0.004], [0, -0.16, 0.0]], [0.034, 0.034, 0.05], { sides: 10, ref: [0, 0, 1] }), SKINS);
  const HR = new Bucket(213);
  addHair(HR, h, { seed: 21, cols: [0xd9560f, 0xff7a1c, 0xffa83a, 0xffe08a], scalp: [0xff8a22, 0xe0660f], hairline: 0.92, spec: [[1.8, 10, 0.66, 0.8, 0.0], [1.48, 9, 0.58, 0.98, 0.5], [1.14, 4, 0.4, 0.75, 0.25]], r: 0.03, curl: 0.014, amp: 0.02, eb: 2.2, sideShort: 0.85, crown: 2, flow: 4, out: 0.03, waves: 0.8 });
  // gold hat: cap + band + star + orbit rings, seated on the crown
  const HT = new Bucket(214);
  const capG = new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, 1.3);
  HT.add(capG, (x, y, z) => (y > 0.1 ? GOLD2 : GOLD), mat([0, 0.038, -0.006], [0, 0, 0], [0.098, 0.088, 0.104]), { flat: true });
  HT.add(new THREE.TorusGeometry(0.093, 0.0075, 5, 18), GOLD3, mat([0, 0.0655, -0.006], [Math.PI / 2, 0, 0], [1.0, 1.1, 1.0]));
  const SC = [0.01, 0.33, -0.03], SR = 0.26;
  const starM = mat(SC, [-0.32, 0, 0.26]);
  HT.add(starGeo(SR, SR * 0.46, 0.05), (x, y, z) => (z > 0 ? GOLD2 : GOLD3), starM, { flat: true });
  HT.add(new THREE.OctahedronGeometry(1, 0), 0xfff3b0, new THREE.Matrix4().multiplyMatrices(starM, mat([0, 0, 0.045], [0, 0, 0], [0.05, 0.05, 0.03])), { flat: true });
  const orbit = [
    { R: 0.36, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.28, 0.0, 0.2)), pr: 0.072, sp: 0.55, col: 0xff6f3c },
    { R: 0.44, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.25, 0.0, -0.3)), pr: 0.06, sp: -0.4, col: 0x39c9d6 },
    { R: 0.29, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.1, 0.0, 0.45)), pr: 0.052, sp: 0.8, col: 0xff7ac8 },
  ];
  for (const o of orbit) HT.add(new THREE.TorusGeometry(o.R, 0.0042, 4, 40), GOLD2, new THREE.Matrix4().compose(_p.set(SC[0], SC[1], SC[2]), o.q, _s.set(1, 1, 1)));
  const headG = new THREE.Group();
  headG.position.set(NP[0], NP[1], NP[2]);
  const headM = HB.mesh(Ms, 'skin', shift);
  const hairM = HR.mesh(Mc, 'cloth', shift);
  const hatM = HT.mesh(Mg, 'brass', shift);
  const lidG = new THREE.Group();
  lidG.name = 'lids';
  lidG.position.set(shift[0], eye.ey + shift[1], eye.ez + shift[2]);
  const lidM = LB.mesh(Ms, 'skin');
  lidG.add(lidM);
  headG.add(headM, hairM, hatM, lidG);
  rig.add(headG);
  // planets (instanced, banded)
  const pg = new THREE.SphereGeometry(1, 10, 6);
  {
    const pp = pg.attributes.position, cols = new Float32Array(pp.count * 3);
    for (let i = 0; i < pp.count; i++) {
      const y = pp.getY(i);
      const band = Math.sin(y * 7.0) > 0.35 ? 0.72 : 1.0;
      const x = pp.getX(i), z = pp.getZ(i);
      const hl = 0.85 + 0.15 * clamp(x * 0.6 + y * 0.6 + z * 0.5, -1, 1);
      cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = band * hl;
    }
    pg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const planetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0x201008, emissiveIntensity: 0.6 });
  const planets = new THREE.InstancedMesh(pg, planetMat, 3);
  planets.userData.mat = 'clay';
  planets.frustumCulled = false;
  orbit.forEach((o, i) => planets.setColorAt(i, _c.set(o.col)));
  headG.add(planets);
  const planetBase = new THREE.Matrix4().makeTranslation(shift[0] + SC[0], shift[1] + SC[1], shift[2] + SC[2]);

  /* arms: shared group pivot (0,1.44,0) */
  const ak = new Bucket(221);
  for (const s of [-1, 1]) {
    const shx = s * 0.148;
    ak.xf = new THREE.Matrix4().makeTranslation(shx, 0, 0);
    const A = s > 0 ? ORANGE : PURPLE, B = s > 0 ? PURPLE : ORANGE;
    const E = s < 0 ? [-0.19, -0.2, -0.07] : [0.07, -0.255, -0.015];
    const W = s < 0 ? [-0.035, -0.42, 0.06] : [0.125, -0.5, 0.085];
    ak.add(tubeGeo([[0, 0.01, 0], E, W], [0.043, 0.041, 0.035, 0.033, 0.03, 0.025], { sides: 9, sub: 4, ref: [0, 0, 1] }), (x, y, z, u, v) => (v < 0.12 ? A : harl(u, v, 5, 3, A, B, 0.5)), null);
    ak.add(SPH(8, 6), A, mat([0, 0, 0], [0, 0, 0], [0.047, 0.05, 0.047]));
    // gold bangle + cuff
    const wd = new THREE.Vector3(W[0] - E[0], W[1] - E[1], W[2] - E[2]).normalize();
    const bp = [W[0] - wd.x * 0.02, W[1] - wd.y * 0.02, W[2] - wd.z * 0.02];
    ak.add(new THREE.TorusGeometry(0.036, 0.0085, 5, 14), GOLD, basisM([wd.x, wd.y, wd.z], [0, 0, 1], bp).multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0])));
    ak.add(new THREE.TorusGeometry(0.034, 0.005, 4, 14), GOLD2, basisM([wd.x, wd.y, wd.z], [0, 0, 1], [bp[0] - wd.x * 0.022, bp[1] - wd.y * 0.022, bp[2] - wd.z * 0.022]).multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0])));
    // hand
    if (s < 0) {
      // on the hip, fingers forward-down, thumb behind
      const hM = basisM([-0.35, 0.55, -0.8], [1, 0.1, -0.1], W);
      addHand(ak, hM, { skin: SKINS, s: 1, size: 0.96, curl: 0.3, thumbCurl: 0.2, spread: 0.05, nails: 0xff6a8a, sides: 4 });
    } else {
      const hM = basisM([-0.05, 1, -0.28], [-1, 0.1, 0.3], W);
      addHand(ak, hM, { skin: SKINS, s: 1, size: 0.96, curl: 0.22, thumbCurl: 0.1, spread: 0.1, nails: 0xff6a8a, sides: 4 });
    }
    ak.xf = null;
  }
  const armG = new THREE.Group();
  armG.position.set(0, 1.44, 0);
  armG.add(ak.mesh(Mc, 'cloth'));
  rig.add(armG);

  /* cape-skirt panels (dynamic; one mesh, two grids) */
  const COLS = 14, ROWS = 10, NV = (COLS + 1) * (ROWS + 1);
  const cpos = new Float32Array(NV * 6), cnrm = new Float32Array(NV * 6), ccol = new Float32Array(NV * 6), cidx = [];
  [-1, 1].forEach((s, pi) => {
    const vo = pi * NV;
    for (let j = 0; j <= ROWS; j++) {
      const v = j / ROWS;
      for (let i = 0; i <= COLS; i++) {
        const u = i / COLS;
        const phi = 0.55 + u * 2.35;
        const sp = Math.sin(phi);
        const r = 0.11 + v * (0.18 + 0.34 * Math.pow(sp, 1.3));
        const zig = j === ROWS ? 0.07 * tri(u * 7) : (j === ROWS - 1 ? 0.02 * tri(u * 7) : 0);
        const o = (vo + j * (COLS + 1) + i) * 3;
        cpos[o] = s * sp * r;
        cpos[o + 1] = 1.04 - v * 0.72 - 0.1 * v * (1 - sp) - zig;
        cpos[o + 2] = Math.cos(phi) * r * 0.85;
        const band = v > 0.82 + 0.1 * tri(u * 7) ? 1 : 0;
        const c = _c.set(band ? ORANGE : PURPLE).lerp(_cB.set(PURPLE2), (1 - band) * v * 0.7);
        if (band && j < ROWS) c.lerp(_cB.set(ORANGE2), 0.2);
        ccol[o] = c.r; ccol[o + 1] = c.g; ccol[o + 2] = c.b;
      }
    }
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const a = vo + j * (COLS + 1) + i, b = a + 1, c = a + COLS + 1, d = c + 1;
      if (s > 0) cidx.push(a, c, b, b, c, d); else cidx.push(a, b, c, b, d, c);
    }
  });
  const capeBase = cpos.slice();
  const capeGeo = new THREE.BufferGeometry();
  capeGeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3));
  capeGeo.setAttribute('normal', new THREE.BufferAttribute(cnrm, 3));
  capeGeo.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
  capeGeo.setIndex(cidx);
  gridNormals(cpos, cnrm, COLS, ROWS, 0); gridNormals(cpos, cnrm, COLS, ROWS, NV);
  const capeMesh = new THREE.Mesh(capeGeo, capeMat);
  capeMesh.frustumCulled = false;
  capeMesh.userData.mat = 'cloth';
  rig.add(capeMesh);

  /* starburst (cast) */
  const bbk = new Bucket(251);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const L = i % 2 ? 0.45 : 0.75;
    const g = new THREE.ConeGeometry(0.05, L, 4, 1);
    g.translate(0, L / 2 + 0.06, 0);
    bbk.add(g, i % 2 ? 0xffb52e : 0xffd86b, mat([0, 0, 0], [0, 0, -a]), { flat: true });
  }
  const burstMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const burstG = part(bbk, burstMat, 'neon', [0, 1.3, 0.35]);
  burstG.visible = false;
  rig.add(burstG);

  let castT = 0;
  const CAST = 0.6;
  const blink = makeBlinker(9);
  const orbA = [0.4, 2.1, 4.0];
  const tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), tm = new THREE.Matrix4(), om = new THREE.Matrix4();
  function update(dt, t) {
    castT = Math.max(0, castT - dt);
    const k = castT > 0 ? Math.sin(Math.PI * (1 - castT / CAST)) : 0;
    const br = Math.sin(t * 1.7);
    rig.position.y = br * 0.004;
    rig.rotation.z = Math.sin(t * 0.33) * 0.007;
    headG.rotation.set(-0.03 + br * 0.006 - k * 0.12, -0.12 + Math.sin(t * 0.25) * 0.08, -0.06 + Math.sin(t * 0.3) * 0.012);
    hairM.rotation.x = Math.sin(t * 1.0) * 0.01;
    hairM.rotation.z = Math.sin(t * 0.8 + 1) * 0.012;
    lidG.rotation.x = blink(t) * 1.25;
    armG.rotation.set(-k * 1.35 + Math.sin(t * 1.2) * 0.01, 0, 0);
    for (let i = 0; i < 3; i++) {
      const o = orbit[i];
      orbA[i] += dt * o.sp * (1 + k * 4);
      tp.set(Math.cos(orbA[i]) * o.R, Math.sin(orbA[i]) * o.R, 0).applyQuaternion(o.q);
      const sc = o.pr * (1 + k * 0.2);
      tm.compose(tp, tq.identity(), ts.set(sc, sc, sc));
      om.multiplyMatrices(planetBase, tm);
      planets.setMatrixAt(i, om);
    }
    planets.instanceMatrix.needsUpdate = true;
    Mg.emissiveIntensity = 0.7 + k * 1.2;
    for (let c = 0; c < 2; c++) {
      const s = c ? 1 : -1, vo = c * NV;
      for (let j = 0; j <= ROWS; j++) {
        const vv = j / ROWS, w = vv * vv;
        for (let i = 0; i <= COLS; i++) {
          const o = (vo + j * (COLS + 1) + i) * 3;
          cpos[o] = capeBase[o] + s * (Math.sin(t * 1.5 + vv * 3 + c + i * 0.35) * 0.028 + k * 0.05 * vv) * w;
          cpos[o + 1] = capeBase[o + 1] - k * 0.02 * vv;
          cpos[o + 2] = capeBase[o + 2] + Math.sin(t * 1.9 + vv * 4 + i * 0.5) * 0.024 * w;
        }
      }
      gridNormals(cpos, cnrm, COLS, ROWS, vo);
    }
    capeGeo.attributes.position.needsUpdate = true;
    capeGeo.attributes.normal.needsUpdate = true;
    burstG.visible = k > 0.005;
    if (k > 0.005) {
      const sc = 0.15 + k * 0.6;
      burstG.scale.set(sc, sc, sc);
      burstG.rotation.z = t * 1.0;
      burstMat.opacity = 0.85 * k;
    }
  }
  update(0, 0);
  return { group, update, cast() { castT = CAST; }, gloveColor: 0xffc83d };
}

export const HEROES_B = {
  fold: { name: 'Origa', tagline: 'Paper wings, folded fury: cranes and shields at your command.', build: buildFold },
  tinker: { name: 'Tinker Red', tagline: 'If you can dream it, she can build it, then blast it.', build: buildTinker },
  starling: { name: 'Starling', tagline: 'Starbursts and gravity, with a flourish.', build: buildStarling },
};
