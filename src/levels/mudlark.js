// Mudlark Hollow: a handmade claymation canyon at golden hour.
// Original, fully procedural. No lights, no shadows, no per-frame allocation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const sin = Math.sin, cos = Math.cos;

/* ---------- small math helpers ---------- */
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
const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const noise3 = (x, y, z) =>
  (sin(x * 1.3 + sin(y * 1.7)) + sin(y * 1.1 + sin(z * 1.9)) + sin(z * 1.5 + sin(x * 2.1))) / 3;

/* ---------- world shape (local coordinates) ---------- */
const rx = (z) => 9 * sin(z * 0.04);                 // river centerline x
const RIVER_END = -125;
const ARENA = { x: 0, z: -150 };
const LEFT_WALL = 36, RIGHT_WALL = 47;
function riverDist(x, z) {
  if (z >= RIVER_END) return Math.abs(x - rx(z));
  return Math.hypot(x - rx(RIVER_END), z - RIVER_END);
}
function gh(x, z) {
  let y = 0.55 * sin(x * 0.07 + z * 0.05) + 0.35 * sin(x * 0.13 - z * 0.11 + 1.3) + 0.2 * sin(z * 0.21 + x * 0.09);
  y -= 2.0 * sstep(5.4, 2.0, riverDist(x, z));
  const ax = Math.abs(x);
  y += x < 0 ? sstep(LEFT_WALL, LEFT_WALL + 4, ax) * 24 : sstep(RIGHT_WALL, RIGHT_WALL + 9, ax) * 24;
  y += sstep(66, 78, z) * 24 + sstep(-170, -182, z) * 24;
  const da = Math.hypot(x - ARENA.x, z - ARENA.z);
  const k = sstep(24, 15, da);
  y = y * (1 - k) + 0.2 * k;
  if (y > 3) y += 0.8 * sin(x * 0.3) * sin(z * 0.27);
  return y;
}

/* ---------- textures (generated, shared, cached) ---------- */
let _thumb = null, _swirl = null;
function thumbTexture() {
  if (_thumb) return _thumb;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#dedede'; g.fillRect(0, 0, S, S);
  const r = rng(77);
  const dimple = (x, y, rad) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const px = x + ox, py = y + oy;
      if (px < -rad || py < -rad || px > S + rad || py > S + rad) continue;
      const gr = g.createRadialGradient(px - rad * 0.25, py - rad * 0.25, rad * 0.1, px, py, rad);
      gr.addColorStop(0, 'rgba(140,140,140,0.32)'); gr.addColorStop(0.7, 'rgba(170,170,170,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, rad, 0, TAU); g.fill();
      // bright lip on the lower-right edge
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 2.2; g.beginPath(); g.arc(px, py, rad * 0.92, 0.2, 1.5); g.stroke();
    }
  };
  for (let i = 0; i < 60; i++) dimple(r() * S, r() * S, 16 + r() * 26);
  // fingerprint ridges
  g.lineWidth = 1.4;
  for (let i = 0; i < 9; i++) {
    const x = r() * S, y = r() * S, base = 8 + r() * 10, rot = r() * TAU;
    for (let k = 0; k < 6; k++) {
      g.strokeStyle = 'rgba(90,90,90,' + (0.13 - k * 0.015) + ')';
      g.beginPath(); g.ellipse(x, y, base + k * 3.4, (base + k * 3.4) * 0.75, rot, 0.4, 4.9); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _thumb = t; return t;
}
function swirlTexture() {
  if (_swirl) return _swirl;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#b9b9b9'; g.fillRect(0, 0, S, S);
  const r = rng(5);
  for (let i = 0; i < 38; i++) {
    const y = r() * S, x = r() * S, w = 30 + r() * 70, a = 0.12 + r() * 0.2;
    g.strokeStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(60,60,60,${a})`;
    g.lineWidth = 3 + r() * 5; g.lineCap = 'round';
    for (const ox of [-S, 0, S]) { g.beginPath(); g.moveTo(x + ox, y); g.bezierCurveTo(x + ox + w * 0.3, y - 14, x + ox + w * 0.7, y + 14, x + ox + w, y); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _swirl = t; return t;
}

/* ---------- geometry helpers ---------- */
const _c = new THREE.Color();
function paint(geo, hex, jitter = 0, fn = null) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  const p = geo.attributes.position;
  _c.set(hex);
  for (let i = 0; i < n; i++) {
    let r = _c.r, g = _c.g, b = _c.b;
    if (fn) { const o = fn(p.getX(i), p.getY(i), p.getZ(i), i); if (o) { r = o.r; g = o.g; b = o.b; } }
    const j = jitter ? 1 + jitter * noise3(p.getX(i) * 3.1, p.getY(i) * 3.1, p.getZ(i) * 3.1) : 1;
    a[i * 3] = r * j; a[i * 3 + 1] = g * j; a[i * 3 + 2] = b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function wobble(geo, amp, freq, seed = 0) {
  const p = geo.attributes.position, nr = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = amp * noise3(x * freq + seed, y * freq + seed * 0.7, z * freq - seed);
    p.setXYZ(i, x + nr.getX(i) * d, y + nr.getY(i) * d, z + nr.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}
function seamFix(geo, cols, rows) { // average normals across the wrap seam (cols+1 verts per row)
  const n = geo.attributes.normal;
  for (let r = 0; r < rows; r++) {
    const a = r * (cols + 1), b = a + cols;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
}
function seamFixLathe(geo, seg, P) { // lathe layout: ring i (0..seg) has P points
  const n = geo.attributes.normal;
  for (let j = 0; j < P; j++) {
    const a = j, b = seg * P + j;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
}
function uvScale(geo, su, sv) {
  const u = geo.attributes.uv;
  for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * su, u.getY(i) * sv);
  return geo;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function xf(geo, x, y, z, rx_ = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx_, ry, rz); _q.setFromEuler(_e);
  _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m); return geo;
}
function worldUV(geo, k) { // planar uvs for terrain
  const p = geo.attributes.position, u = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) * k, p.getZ(i) * k);
}
function bake(geos) { return mergeGeometries(geos, false); }

/* ---------- palettes ---------- */
const STRATA = [0xd9894e, 0xc2623a, 0xeab67a, 0xa9503a, 0xf0c58c, 0xb86f45, 0xdca36a];
const MESA_COL = [0xd98a52, 0xc4663f, 0xe9b57a, 0xb8603f, 0xefc48a];

/* ---------- terrain ---------- */
function buildTerrain() {
  const x0 = -80, x1 = 80, z0 = -190, z1 = 85, dx = 1.6, dz = 1.8;
  const nx = Math.round((x1 - x0) / dx), nz = Math.round((z1 - z0) / dz);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2);
  const col = new Float32Array((nx + 1) * (nz + 1) * 3);
  const idx = new Uint32Array(nx * nz * 6);
  const c = new THREE.Color(), c2 = new THREE.Color();
  let i = 0;
  for (let j = 0; j <= nz; j++) for (let k = 0; k <= nx; k++, i++) {
    const x = x0 + k * dx, z = z0 + j * dz, y = gh(x, z);
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    if (y > 1.2) { uv[i * 2] = (Math.abs(x) > 34 ? z : x) * 0.11; uv[i * 2 + 1] = y * 0.11; } else { uv[i * 2] = x * 0.16; uv[i * 2 + 1] = z * 0.16; }
    // color
    const n = noise3(x * 0.11, 0.3, z * 0.11), n2 = noise3(x * 0.5, 1.1, z * 0.5);
    if (y > 1.6) {
      const band = Math.floor(y * 0.62 + 1.6 * n + 40);
      c.set(STRATA[band % STRATA.length]);
      if (x < 0 && y > 3) c.lerp(c2.set(0xf2d9aa), 0.35 + 0.2 * sin(y * 0.9)); // pale fossil bed
    } else if (y < -0.35) {
      c.set(0x8a4430).lerp(c2.set(0x5e2e24), sstep(-0.4, -1.8, y));
    } else {
      c.set(0xe2ae70);
      c.lerp(c2.set(0x9fae54), sstep(-0.1, 0.4, n) * 0.85);
      c.lerp(c2.set(0xc87c4c), sstep(0.3, 0.7, n2) * 0.3);
      c.lerp(c2.set(0xa3593d), sstep(0.2, -0.2, y) * 0.5);
    }
    const da = Math.hypot(x - ARENA.x, z - ARENA.z);
    if (da < 10.5) c.lerp(c2.set(0x5a3a2c), sstep(10.5, 6, da));
    else if (da < 13 && da > 10.4) c.lerp(c2.set(0xf0d9a8), 0.25);
    const jig = 1 + 0.07 * n2;
    col[i * 3] = c.r * jig; col[i * 3 + 1] = c.g * jig; col[i * 3 + 2] = c.b * jig;
  }
  let t = 0;
  for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
    const a = j * (nx + 1) + k, b = a + 1, d = a + nx + 1, e = d + 1;
    idx[t++] = a; idx[t++] = d; idx[t++] = b; idx[t++] = b; idx[t++] = d; idx[t++] = e;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

/* ---------- mesas ---------- */
function mesaGeo(R, H, seed, seg = 28, colors = MESA_COL, mossTop = false) {
  const pts = [], base = -3.2, body = H * 0.82, n = 9;
  pts.push(new THREE.Vector2(R * 1.3, base));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector2(R * (1.12 - 0.14 * t + 0.07 * sin(t * TAU * 2.5 + seed)), lerp(0, body, t)));
  }
  for (let j = 1; j <= 5; j++) {
    const a = (j / 5) * Math.PI / 2;
    pts.push(new THREE.Vector2(Math.max(R * 0.97 * cos(a), j === 5 ? 0 : 0.01), body + sin(a) * H * 0.18));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  const p = g.attributes.position, nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = R * 0.11 * noise3(x * 0.35 + seed, y * 0.3, z * 0.35 - seed) + R * 0.03 * sin(y * 2.1 + x);
    const ny = nr.getY(i);
    p.setXYZ(i, x + nr.getX(i) * d, y + ny * d * 0.4, z + nr.getZ(i) * d);
  }
  g.computeVertexNormals();
  seamFixLathe(g, seg, pts.length);
  uvScale(g, TAU * R / 5.5, (H + 3.2) / 5.5);
  const c = new THREE.Color(), c2 = new THREE.Color();
  paint(g, 0xffffff, 0.05, (x, y, z) => {
    const band = Math.floor((y + 3.2) / (H * 0.2 + 1.2) + 0.7 * noise3(x * 0.2, y * 0.5, z * 0.2) + seed * 3) % colors.length;
    c.set(colors[(band + colors.length) % colors.length]);
    if (y > body * 0.97) c.lerp(c2.set(mossTop ? 0x9fae54 : 0xf6d9a0), 0.55);
    return c;
  });
  return g;
}

/* ---------- trees, mushrooms, tufts, cottages ---------- */
function trunkGeo() {
  const g = new THREE.CylinderGeometry(0.17, 0.34, 3.4, 7, 6, true);
  g.translate(0, 1.7, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + 0.28 * sin(y * 1.2) + 0.05 * sin(y * 5));
    p.setZ(i, p.getZ(i) + 0.14 * sin(y * 0.9 + 1));
  }
  g.computeVertexNormals();
  paint(g, 0x8a5430, 0.2);
  return g;
}
function canopyGeo() {
  const parts = [];
  const blobs = [[0.15, 4.0, 0, 1.45], [-0.95, 3.5, 0.5, 1.05], [0.9, 3.3, -0.45, 1.1], [0.1, 4.9, 0.2, 0.85]];
  blobs.forEach((b, i) => {
    const s = new THREE.SphereGeometry(1, 10, 8);
    wobble(s, 0.18, 1.6, i * 1.7); seamFix(s, 10, 9);
    xf(s, b[0], b[1], b[2], 0, i, 0, b[3], b[3] * 0.88, b[3]);
    paint(s, 0xffffff, 0.12, (x, y) => { const v = 0.78 + 0.22 * sstep(2.6, 5.6, y); return { r: v, g: v, b: v }; });
    parts.push(s);
  });
  return bake(parts);
}
function mushroomGeo() {
  const stem = new THREE.CylinderGeometry(0.13, 0.2, 0.75, 8, 3);
  stem.translate(0, 0.37, 0);
  wobble(stem, 0.04, 4, 2);
  paint(stem, 0xf3e3c3, 0.04);
  const cap = new THREE.SphereGeometry(0.58, 14, 7, 0, TAU, 0, Math.PI * 0.55);
  xf(cap, 0, 0.62, 0, 0, 0, 0, 1, 0.68, 1);
  wobble(cap, 0.04, 3, 4);
  paint(cap, 0xe8744a, 0.05);
  const parts = [stem, cap];
  const dots = [[0.0, 1.0, 0.0], [0.3, 0.85, 0.2], [-0.28, 0.85, 0.22], [0.1, 0.8, -0.38], [-0.12, 0.84, 0.36]];
  dots.forEach((d) => {
    const s = new THREE.SphereGeometry(0.09, 6, 4);
    const l = Math.hypot(d[0], d[2]);
    const yy = 0.62 + Math.sqrt(Math.max(0, 1 - (l / 0.58) * (l / 0.58))) * 0.58 * 0.68 - 0.03;
    xf(s, d[0] * 0.95, yy, d[2] * 0.95, 0, 0, 0, 1, 0.5, 1);
    paint(s, 0xfff2d8);
    parts.push(s);
  });
  return bake(parts);
}
function tuftGeo() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.ConeGeometry(0.07, 0.55 + i * 0.12, 5, 1);
    c.translate(0, 0.3, 0);
    xf(c, (i - 1) * 0.09, 0, 0, 0, 0, (i - 1) * 0.35);
    paint(c, 0xffffff, 0, (x, y) => { const v = 0.65 + 0.5 * y; return { r: v, g: v, b: v }; });
    parts.push(c);
  }
  return bake(parts);
}
function cottageGeo() {
  const parts = [];
  const body = new THREE.SphereGeometry(1, 16, 10);
  wobble(body, 0.08, 2, 3);
  xf(body, 0, 1.0, 0, 0, 0, 0, 1.55, 1.15, 1.55);
  paint(body, 0xffffff, 0.06, (x, y) => { const v = 0.82 + 0.18 * sstep(0, 2, y); return { r: v, g: v * 0.97, b: v * 0.92 }; });
  parts.push(body);
  const roof = new THREE.ConeGeometry(1.95, 1.5, 16, 3);
  wobble(roof, 0.12, 2.2, 6);
  xf(roof, 0, 2.2, 0);
  paint(roof, 0xb5532e, 0.1, (x, y) => { const v = 0.8 + 0.2 * sin(y * 7 + x * 2); _c.set(0xb5532e); return { r: _c.r * v, g: _c.g * v, b: _c.b * v }; });
  parts.push(roof);
  const chim = new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8, 1);
  wobble(chim, 0.03, 4, 1);
  xf(chim, 0.8, 2.6, -0.3);
  paint(chim, 0xa9503a, 0.1);
  parts.push(chim);
  const door = new THREE.SphereGeometry(1, 12, 8);
  xf(door, 0, 0.72, 1.47, 0, 0, 0, 0.5, 0.72, 0.14);
  paint(door, 0x6b3b22, 0.1);
  parts.push(door);
  const knob = new THREE.SphereGeometry(0.06, 6, 4);
  xf(knob, 0.24, 0.72, 1.62);
  paint(knob, 0xf3c14e);
  parts.push(knob);
  for (const sx of [-0.95, 0.95]) {
    const win = new THREE.SphereGeometry(1, 10, 6);
    xf(win, sx, 1.2, 1.17 - Math.abs(sx) * 0.18, 0, sx * 0.4, 0, 0.3, 0.3, 0.1);
    paint(win, 0xffe3a0);
    parts.push(win);
    const ring = new THREE.TorusGeometry(0.31, 0.06, 5, 12);
    xf(ring, sx, 1.2, 1.2 - Math.abs(sx) * 0.18, 0, sx * 0.4, 0);
    paint(ring, 0x6b3b22);
    parts.push(ring);
  }
  const step = new THREE.SphereGeometry(1, 10, 6);
  xf(step, 0, 0.05, 1.9, 0, 0, 0, 0.6, 0.14, 0.4);
  paint(step, 0xcaa77a);
  parts.push(step);
  return bake(parts);
}
function snailGeo() {
  const body = new THREE.SphereGeometry(0.5, 12, 8);
  xf(body, 0.05, 0.2, 0, 0, 0, 0, 1.25, 0.5, 0.6);
  paint(body, 0xe9b18c, 0.05);
  const shell = new THREE.SphereGeometry(0.42, 14, 10);
  xf(shell, -0.12, 0.55, 0);
  wobble(shell, 0.03, 4, 2);
  paint(shell, 0xffffff, 0, (x, y, z) => {
    const yy = y - 0.55, th = Math.atan2(yy, z), rr = Math.hypot(yy, z);
    const f = (th / TAU + rr * 2.6 + 4) % 1;
    _c.set(f < 0.5 ? 0xd1553a : 0xf0b25c); return _c;
  });
  const parts = [body, shell];
  for (const s of [-1, 1]) {
    const st = new THREE.CylinderGeometry(0.03, 0.045, 0.35, 5, 1);
    xf(st, 0.62, 0.52, s * 0.14, s * 0.2, 0, -0.2);
    paint(st, 0xe9b18c);
    parts.push(st);
    const eye = new THREE.SphereGeometry(0.055, 6, 4);
    xf(eye, 0.65, 0.7, s * 0.17);
    paint(eye, 0x2a1a14);
    parts.push(eye);
  }
  return bake(parts);
}
function birdGeo() {
  const parts = [];
  const body = new THREE.SphereGeometry(0.4, 12, 9);
  xf(body, 0, 0.42, 0, 0, 0, 0, 1, 0.92, 1.25);
  paint(body, 0xf6f1e8, 0.03, (x, y, z) => { const v = y < 0.35 ? 1.08 : 0.95; _c.setRGB(v, v, v); return _c; });
  parts.push(body);
  const head = new THREE.SphereGeometry(0.26, 10, 8);
  xf(head, 0, 0.82, 0.42);
  paint(head, 0xffffff, 0.02);
  parts.push(head);
  const beak = new THREE.ConeGeometry(0.09, 0.28, 6, 1);
  xf(beak, 0, 0.8, 0.72, Math.PI / 2);
  paint(beak, 0xf2a03a);
  parts.push(beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.045, 6, 4);
    xf(eye, s * 0.14, 0.88, 0.6);
    paint(eye, 0x201410);
    parts.push(eye);
    const wing = new THREE.SphereGeometry(0.3, 8, 6);
    xf(wing, s * 0.37, 0.48, -0.02, 0.1, 0, s * 0.25, 0.35, 0.8, 1.1);
    paint(wing, 0xe9dcc4);
    parts.push(wing);
  }
  const tail = new THREE.ConeGeometry(0.2, 0.55, 5, 1);
  xf(tail, 0, 0.5, -0.65, -Math.PI / 2 - 0.35);
  paint(tail, 0xd9c7a6);
  parts.push(tail);
  for (const s of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.03, 0.03, 0.22, 4, 1);
    xf(leg, s * 0.12, 0.11, 0.05);
    paint(leg, 0xf2a03a);
    parts.push(leg);
  }
  return bake(parts);
}

/* ---------- fossils ---------- */
function ammoniteGeo(R, turns, sq) {
  const N = Math.floor(70 * turns), S = 10, tmax = turns * TAU, k = 0.15;
  const pos = [], col = [], idx = [];
  const bone = new THREE.Color(0xf4e6c8), dark = new THREE.Color(0xc9ac7c), cc = new THREE.Color();
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * tmax, r = R * 0.82 * Math.exp(-k * (tmax - th));
    let t = r * 0.4; if (i > N - 6) t *= 0.45 + (N - i) * 0.09; if (i < 6) t *= 0.4 + i * 0.1;
    const rib = Math.max(0, cos(th * 8.5));
    const tt = t * (1 + 0.12 * rib);
    const cxp = r * cos(th), cyp = r * sin(th);
    for (let j = 0; j < S; j++) {
      const ph = (j / S) * TAU;
      const rad = tt * cos(ph), zz = tt * sin(ph) * sq;
      pos.push(cxp + cos(th) * rad, cyp + sin(th) * rad, zz);
      cc.copy(bone).lerp(dark, 0.55 * (1 - rib) * (0.5 + 0.5 * cos(ph)) + 0.12);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) {
    const a = i * S + j, b = i * S + (j + 1) % S, c = a + S, d = b + S;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function fernGeo(L) {
  const parts = [];
  const P = (s) => [sin(s * 0.9) * L * 0.28, s * L];
  const pts = [];
  for (let i = 0; i <= 12; i++) { const p = P(i / 12); pts.push(new THREE.Vector3(p[0], p[1], 0)); }
  const stem = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, L * 0.022, 5, false);
  paint(stem, 0xd9c394);
  parts.push(stem);
  const n = 15;
  for (let i = 1; i < n; i++) {
    const s = i / n, p = P(s), p2 = P(s + 0.02);
    const tx = p2[0] - p[0], ty = p2[1] - p[1], tl = Math.hypot(tx, ty), Tx = tx / tl, Ty = ty / tl;
    for (const side of [-1, 1]) {
      const len = L * (0.03 + 0.2 * Math.pow(1 - s, 0.8)) + 0.1;
      const ang = 0.95 * side, dxl = Tx * cos(0.9) * 1 + side * (-Ty) * sin(0.9), dyl = Ty * cos(0.9) + side * Tx * sin(0.9);
      const l = new THREE.SphereGeometry(1, 6, 4);
      const rot = Math.atan2(dyl, dxl);
      xf(l, p[0] + dxl * len * 0.5, p[1] + dyl * len * 0.5, 0, 0, 0, rot, len * 0.5, len * 0.13, len * 0.08);
      paint(l, 0xeedcb4, 0, (x, y, z, ii) => { _c.set(ii % 2 ? 0xeedcb4 : 0xd2b88a); return _c; });
      parts.push(l);
    }
  }
  return bake(parts);
}
function trilobiteGeo(S) {
  const parts = [];
  const head = new THREE.SphereGeometry(1, 12, 8, 0, TAU, 0, Math.PI / 2);
  xf(head, 0, 0, 0.8 * S, Math.PI / 2, 0, 0, 0.95 * S, 0.5 * S, 0.5 * S); // dome facing out
  paint(head, 0xe4cf9f, 0.04);
  head.rotateX(0);
  const h2 = new THREE.SphereGeometry(1, 12, 6);
  xf(h2, 0, 0.55 * S, 0, 0, 0, 0, 0.95 * S, 0.55 * S, 0.3 * S); // simple shield in xy plane
  paint(h2, 0xe4cf9f, 0.04);
  parts.push(h2);
  for (let i = 0; i < 9; i++) {
    const w = 0.85 * (1 - i * 0.065) * S;
    const seg = new THREE.SphereGeometry(1, 10, 5);
    xf(seg, 0, (0.55 - 0.1 - i * 0.2) * S, 0, 0, 0, 0, w, 0.16 * S, 0.28 * S);
    paint(seg, 0xffffff, 0, () => { _c.set(i % 2 ? 0xe4cf9f : 0xcdb283); return _c; });
    parts.push(seg);
  }
  const tail = new THREE.SphereGeometry(1, 10, 6);
  xf(tail, 0, -1.55 * S, 0, 0, 0, 0, 0.5 * S, 0.3 * S, 0.22 * S);
  paint(tail, 0xe4cf9f);
  parts.push(tail);
  for (const s of [-1, 1]) {
    const ant = new THREE.CylinderGeometry(0.02 * S, 0.03 * S, 0.7 * S, 4, 1);
    xf(ant, s * 0.4 * S, 1.0 * S, 0, 0, 0, s * -0.35);
    paint(ant, 0xcdb283);
    parts.push(ant);
  }
  return bake(parts);
}

/* ---------- rope bridge ---------- */
function bridgeGeos(a, b, sag, planks, out) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const at = (t, off, up) => new THREE.Vector3().copy(a).addScaledVector(dir, t * len).addScaledVector(side, off).setY(lerp(a.y, b.y, t) - sag * 4 * t * (1 - t) + up);
  const r = rng(Math.floor(len * 13));
  for (let i = 0; i <= planks; i++) {
    const t = i / planks, p = at(t, 0, 0);
    const bx = new THREE.BoxGeometry(0.5, 0.12, 1.9);
    bx.translate(0, 0, 0);
    const yaw = Math.atan2(side.x, side.z) + (r() - 0.5) * 0.06;
    const slope = Math.atan2(b.y - a.y - sag * 4 * (1 - 2 * t), len);
    xf(bx, p.x, p.y, p.z, 0, yaw, 0);
    paint(bx, 0xffffff, 0, () => { _c.set(0xa9703d).multiplyScalar(0.8 + r() * 0.4); return _c; });
    // round the box edges visually via slight normal-ish tilt
    out.push(bx);
  }
  for (const s of [-0.85, 0.85]) {
    const pts = [];
    for (let i = 0; i <= 14; i++) pts.push(at(i / 14, s, 0.95));
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.055, 5, false);
    paint(tube, 0xd6b97e);
    out.push(tube);
    for (const t of [0, 1]) {
      const post = new THREE.CylinderGeometry(0.1, 0.13, 1.5, 7, 1);
      const p = at(t, s, 0.2);
      xf(post, p.x, p.y, p.z);
      paint(post, 0x7d4a29, 0.1);
      out.push(post);
    }
    for (let i = 2; i < 13; i += 2) { // hangers
      const p = at(i / 14, s, 0.95), q = at(i / 14, s, 0.05);
      const hg = new THREE.CylinderGeometry(0.025, 0.025, p.y - q.y, 4, 1);
      xf(hg, p.x, (p.y + q.y) / 2, p.z);
      paint(hg, 0xd6b97e);
      out.push(hg);
    }
  }
}

/* ---------- level ---------- */
function placeBasis(geo, P, n) {
  const z = n.clone().normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(P);
  geo.applyMatrix4(m);
  return geo;
}
function wallPoint(z, y) { // point on the left cliff face at height y, plus normal
  let a = -22, b = -62;
  for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (gh(m, z) < y) a = m; else b = m; }
  const x = (a + b) / 2, e = 0.4;
  const n = new THREE.Vector3(-(gh(x + e, z) - gh(x - e, z)) / (2 * e), 1, -(gh(x, z + e) - gh(x, z - e)) / (2 * e)).normalize();
  return { p: new THREE.Vector3(x, gh(x, z), z), n };
}

export const LEVEL = {
  id: 'mudlark',
  name: 'Mudlark Hollow',
  sub: 'A canyon sculpted by hand',
  color: '#e9944f',
  sky: 'dusk',
  build(scene, offset) {
    const root = new THREE.Group();
    root.name = 'mudlark';
    root.position.copy(offset);
    scene.add(root);
    const W = (x, y, z) => new THREE.Vector3(x, y, z).add(offset);

    /* materials */
    const clayMat = new THREE.MeshStandardMaterial({ map: thumbTexture(), vertexColors: true, roughness: 0.72, metalness: 0 });
    const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    const fossilMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    const waterMat = new THREE.MeshStandardMaterial({ map: swirlTexture(), color: 0xf0985a, side: THREE.DoubleSide, roughness: 0.1, metalness: 0.08, emissive: 0x7a3414, emissiveIntensity: 0.9 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffd48a, emissive: 0xffb25a, emissiveIntensity: 0.7, roughness: 0.6 });

    const add = (geo, mat, tag, name) => {
      const m = new THREE.Mesh(geo, mat);
      m.userData.mat = tag; m.name = name; m.frustumCulled = true;
      root.add(m); return m;
    };

    /* terrain */
    add(buildTerrain(), clayMat, 'clay', 'ground');

    /* mesas */
    const mesas = [
      // [x, z, R, H, seed, mossTop]
      [-28, 50, 7, 9, 1, true], [-30, 30, 8, 12, 2], [-26, 12, 6, 8, 3, true], [-28, -10, 6, 9, 4],
      [30, 55, 7, 9, 5], [34, 30, 9, 14, 6], [29, 5, 6, 8, 7, true], [33, -20, 8, 12, 8],
      [27, -42, 6, 9, 9], [30, -62, 7, 10, 10, true], [-20, -70, 7, 7.5, 11, true], [20, -70, 7, 7.5, 12, true],
      [32, -88, 7, 11, 13], [14, -98, 6, 7, 14, true], [-24, -110, 6, 8, 15], [30, -118, 8, 12, 16],
      [-30, -128, 8, 11, 17], [-26, -150, 6, 9, 18], [26, -150, 6, 9, 19],
    ];
    const mesaTop = {};
    const mg = [];
    mesas.forEach((m) => {
      const y0 = gh(m[0], m[1]);
      const g = mesaGeo(m[2], m[3], m[4], 28, MESA_COL, !!m[5]);
      g.translate(m[0], y0, m[1]);
      mg.push(g);
      mesaTop[m[4]] = y0 + m[3];
    });
    // far backdrop mesas (cheap, big)
    const rb = rng(31);
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1, z = 70 - i * 24 + rb() * 10, x = side * (95 + rb() * 40);
      const R = 14 + rb() * 10, H = 34 + rb() * 18;
      const g = mesaGeo(R, H, 40 + i, 20, [0xc4663f, 0xd98a52, 0xb8603f, 0xe9b57a]);
      g.translate(x, -4, z); mg.push(g);
    }
    // arena standing stones + insult pile
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2, x = ARENA.x + cos(a) * 17, z = ARENA.z + sin(a) * 17;
      const g = mesaGeo(1.7 + (i % 3) * 0.3, 5 + (i % 4), 60 + i, 14, [0xe9b57a, 0xd98a52, 0xefc48a], false);
      g.translate(x, gh(x, z), z); mg.push(g);
    }
    for (let i = 0; i < 9; i++) { // pile of sulky lumps at the arena edge
      const s = new THREE.SphereGeometry(1, 8, 6);
      wobble(s, 0.18, 2, i);
      const a = i * 0.9, rr = 0.5 + (i % 3) * 0.5;
      xf(s, 10.5 + cos(a) * rr, 0.2 + (i % 3) * 0.3, -150 + sin(a) * rr - 4, 0, 0, 0, 0.6 + (i % 4) * 0.2, 0.45, 0.6 + (i % 3) * 0.2);
      paint(s, 0x4a3026, 0.15); uvScale(s, 0.4, 0.4);
      mg.push(s);
    }
    add(bake(mg), clayMat, 'clay', 'mesas');

    /* fossils embedded in the left cliff */
    const fg = [];
    const embed = (geo, z, y, push = 0.35) => {
      const w = wallPoint(z, y);
      geo.rotateY(0);
      placeBasis(geo, w.p.clone().addScaledVector(w.n, push), w.n);
      fg.push(geo);
    };
    embed(ammoniteGeo(8.2, 3.3, 0.7).translate(0, 0, 0), -70, 11);
    embed(ammoniteGeo(5, 3.0, 0.7), -46, 6.5);
    embed(ammoniteGeo(3.4, 2.8, 0.7), -92, 6);
    embed(fernGeo(8).translate(0, -4, 0), -56, 12);
    embed(fernGeo(6.5).translate(0, -3, 0), -84, 12.5);
    embed(trilobiteGeo(1.6), -36, 4.2, 0.2);
    embed(trilobiteGeo(1.1), -100, 3.4, 0.2);
    // dotted shell fragments
    const rf = rng(12);
    for (let i = 0; i < 10; i++) {
      const g = ammoniteGeo(0.9 + rf() * 0.7, 2.4, 0.8);
      embed(g, -30 - rf() * 74, 2.5 + rf() * 9, 0.15);
    }
    add(bake(fg), fossilMat, 'stone', 'fossils');

    /* river + pond */
    {
      const pos = [], uv = [], idx = [];
      const zs = []; for (let z = 78; z >= RIVER_END; z -= 3) zs.push(z);
      let acc = 0;
      zs.forEach((z, i) => {
        const w = 4.2, x = rx(z);
        if (i) acc += 3;
        pos.push(x - w, -0.42, z, x + w, -0.42, z);
        uv.push(0, acc / 7, 1.3, acc / 7);
      });
      for (let i = 0; i < zs.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      // pond fan
      const base = pos.length / 3, cx = rx(RIVER_END), cz = RIVER_END;
      pos.push(cx, -0.42, cz); uv.push(0.65, acc / 7);
      const ring = 16;
      for (let i = 0; i <= ring; i++) {
        const a = Math.PI + (i / ring) * Math.PI; // the half toward -z
        pos.push(cx + cos(a) * 4.2, -0.42, cz + sin(a) * 4.2);
        uv.push(0.65 + cos(a) * 0.65, acc / 7 + sin(a) * 0.6);
      }
      for (let i = 0; i < ring; i++) idx.push(base, base + 1 + i, base + 2 + i);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      // make sure normals face up
      const nn = g.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
      add(g, waterMat, 'water', 'river');
    }

    /* bridges (wood) */
    const wood = [];
    {
      const z1 = 10, z2 = -40;
      bridgeGeos(new THREE.Vector3(rx(z1) - 8, gh(rx(z1) - 8, z1) + 0.9, z1), new THREE.Vector3(rx(z1) + 8, gh(rx(z1) + 8, z1) + 0.9, z1), 0.7, 28, wood);
      bridgeGeos(new THREE.Vector3(rx(z2) - 8, gh(rx(z2) - 8, z2) + 0.9, z2), new THREE.Vector3(rx(z2) + 8, gh(rx(z2) + 8, z2) + 0.9, z2), 0.7, 28, wood);
      const ta = mesaTop[11], tb = mesaTop[12];
      bridgeGeos(new THREE.Vector3(-14.2, ta + 0.35, -70), new THREE.Vector3(14.2, tb + 0.35, -70), 1.6, 52, wood);
    }
    add(bake(wood), woodMat, 'wood', 'bridges');

    /* placement bookkeeping */
    const raids = [
      { x: 16, z: 14, foes: 5, name: 'Bridge Burrow Ambush' },
      { x: -18, z: -62, foes: 6, name: 'Fossil Wall Skirmish' },
      { x: -6, z: -108, foes: 7, name: 'Mushroom Meadow Stand' },
    ];
    const cottages = [[-18, 42], [-8, 46], [-4, 34], [-24, 29], [-14, 24], [22, 34], [26, 21], [-3, -28]];
    const arrival = { x: -2, z: 56 };
    const reserved = [[arrival.x, arrival.z, 7], [ARENA.x, ARENA.z, 23]];
    raids.forEach((r) => reserved.push([r.x, r.z, 10]));
    cottages.forEach((c) => reserved.push([c[0], c[1], 3.6]));
    [[rx(10), 10], [rx(-40), -40]].forEach((b) => reserved.push([b[0], b[1], 8.5]));
    mesas.forEach((m) => reserved.push([m[0], m[1], m[2] * 1.25 + 1]));
    const free = (x, z, pad = 0) => {
      if (riverDist(x, z) < 5.5 + pad) return false;
      for (const r of reserved) if (Math.hypot(x - r[0], z - r[1]) < r[2] + pad) return false;
      return true;
    };
    const R = rng(2026);
    const scatter = (count, xr, zr, pad, tries = 4000) => {
      const out = []; let t = 0;
      while (out.length < count && t++ < tries) {
        const x = (R() * 2 - 1) * xr, z = lerp(zr[0], zr[1], R());
        if (Math.abs(x) > 34 && x < 0 || Math.abs(x) > 44) continue;
        if (free(x, z, pad)) out.push([x, z]);
      }
      return out;
    };

    const dummy = new THREE.Matrix4(), qq = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    const col = new THREE.Color();
    const yawQ = (a) => qq.set(0, sin(a / 2), 0, cos(a / 2));
    const makeInst = (geo, mat, tag, name, list, fn) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.userData.mat = tag; im.name = name; im.frustumCulled = true;
      list.forEach((it, i) => {
        const o = fn(it, i);
        dummy.compose(pv.set(o.x, o.y, o.z), yawQ(o.yaw || 0), sv.set(o.sx, o.sy ?? o.sx, o.sz ?? o.sx));
        im.setMatrixAt(i, dummy);
        im.setColorAt(i, o.color ? col.set(o.color) : col.setRGB(1, 1, 1));
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      root.add(im); return im;
    };

    /* trees */
    const treeSpots = scatter(58, 40, [76, -118], 1.2);
    const leafCols = [0x8f9c3f, 0xb3a43c, 0xd08a3a, 0x7b9a4a, 0xc9733a, 0x9aa84e];
    const rt = rng(3);
    const trees = treeSpots.map((p) => ({ p, s: 0.8 + rt() * 0.8, yaw: rt() * TAU, c: leafCols[Math.floor(rt() * leafCols.length)] }));
    makeInst(trunkGeo(), woodMat, 'wood', 'trunks', trees, (t) => ({ x: t.p[0], y: gh(t.p[0], t.p[1]) - 0.15, z: t.p[1], yaw: t.yaw, sx: t.s }));
    makeInst(canopyGeo(), leafMat, 'foliage', 'canopies', trees, (t) => ({ x: t.p[0], y: gh(t.p[0], t.p[1]) - 0.15, z: t.p[1], yaw: t.yaw, sx: t.s, color: t.c }));

    /* mushrooms (meadow thickest around raid 3) */
    const rm = rng(9);
    const mushSpots = scatter(34, 40, [70, -125], 0.6);
    const meadow = [];
    for (let i = 0; i < 26; i++) { const a = rm() * TAU, d = 5 + rm() * 15, x = -6 + cos(a) * d, z = -108 + sin(a) * d; if (riverDist(x, z) > 5 && Math.hypot(x + 6, z + 108) > 4.5) meadow.push([x, z]); }
    const ringC = [-39.5, -78];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; meadow.push([ringC[0] + cos(a) * 1.6, ringC[1] + sin(a) * 1.6]); }
    const mAll = mushSpots.concat(meadow).map((p) => ({ p, s: 0.7 + rm() * rm() * 2.2, yaw: rm() * TAU, c: [0xffffff, 0xffe6cf, 0xfff0b8, 0xffd2c4][Math.floor(rm() * 4)] }));
    makeInst(mushroomGeo(), clayMat, 'clay', 'mushrooms', mAll, (t) => ({ x: t.p[0], y: gh(t.p[0], t.p[1]) - 0.05, z: t.p[1], yaw: t.yaw, sx: t.s, color: t.c }));

    /* grass tufts */
    const rtf = rng(14);
    const tufts = [];
    for (let i = 0; i < 260; i++) {
      const x = (rtf() * 2 - 1) * 40, z = lerp(78, -130, rtf());
      if (x < -34 || riverDist(x, z) < 4.2 || Math.hypot(x - ARENA.x, z - ARENA.z) < 13) continue;
      const y = gh(x, z); if (y > 1.8 || y < -0.3) continue;
      tufts.push({ x, z, s: 0.8 + rtf() * 1.2, yaw: rtf() * TAU, c: [0xb9bf5a, 0xd6b45a, 0x93a94b][Math.floor(rtf() * 3)] });
    }
    makeInst(tuftGeo(), leafMat, 'foliage', 'tufts', tufts, (t) => ({ x: t.x, y: gh(t.x, t.z), z: t.z, yaw: t.yaw, sx: t.s, color: t.c }));

    /* cottages (face the river-ish) */
    const cc = [0xfff1dc, 0xf6d9c4, 0xe6efd4, 0xf4e3a8, 0xdfe9ef, 0xf5d0c0];
    makeInst(cottageGeo(), clayMat, 'clay', 'cottages', cottages, (c, i) => ({
      x: c[0], y: gh(c[0], c[1]) - 0.1, z: c[1], yaw: Math.atan2(rx(c[1]) - c[0], 8) * 0.6 + (i % 2 ? 0.3 : -0.2), sx: 1.15 + (i % 3) * 0.12, color: cc[i % cc.length],
    }));

    /* critters */
    const rc = rng(21);
    const snails = [];
    for (let i = 0; i < 14; i++) {
      let x, z, t = 0;
      do { x = (rc() * 2 - 1) * 34; z = lerp(70, -120, rc()); t++; } while ((riverDist(x, z) < 6.5 || x < -33 || Math.hypot(x - ARENA.x, z - ARENA.z) < 20 || gh(x, z) > 1.6) && t < 200);
      snails.push({ cx: x, cz: z, ph: rc() * 10, rad: 0.8 + rc() * 1.2, s: 0.8 + rc() * 0.7 });
    }
    const birds = [];
    const perches = [[11, 0], [12, 0], [5, 0], [7, 0], [-4, 0], [-3, 0]];
    for (let i = 0; i < 14; i++) {
      let x, z, y;
      if (i < 5) { const m = mesas[[1, 5, 10, 11, 7][i]]; const a = rc() * TAU; x = m[0] + cos(a) * m[2] * 0.45; z = m[1] + sin(a) * m[2] * 0.45; y = mesaTop[m[4]] - 0.05; }
      else { let t = 0; do { x = (rc() * 2 - 1) * 33; z = lerp(70, -120, rc()); t++; } while ((riverDist(x, z) < 6 || gh(x, z) > 1.6 || Math.hypot(x - ARENA.x, z - ARENA.z) < 20) && t < 200); y = gh(x, z); }
      birds.push({ x, z, y, ph: rc() * 10, yaw: rc() * TAU, perch: i < 5, s: 0.9 + rc() * 0.5, c: [0xffffff, 0xd9eef2, 0xffe3b0, 0xf5c6c0, 0xcfe6c0][i % 5] });
    }
    const snailMesh = makeInst(snailGeo(), clayMat, 'clay', 'snails', snails, (s) => ({ x: s.cx, y: gh(s.cx, s.cz), z: s.cz, sx: s.s }));
    const birdMesh = makeInst(birdGeo(), clayMat, 'clay', 'birds', birds, (b) => ({ x: b.x, y: b.y, z: b.z, sx: b.s, color: b.c }));
    // pad bounds for animated movers
    for (const im of [snailMesh, birdMesh]) { im.boundingSphere.radius += 4; }

    /* secrets, rescues, raids, boss */
    const secretsL = [
      [43.5, -20],
      [rx(-40) - 5.4, -41.5],
      [ringC[0], ringC[1]],
    ];
    const secrets = secretsL.map((s) => W(s[0], gh(s[0], s[1]) + 0.9, s[1]));
    const glow = [];
    secretsL.forEach((s, i) => {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + i, gg = new THREE.SphereGeometry(0.1, 6, 4);
        const x = s[0] + cos(a) * 0.75, z = s[1] + sin(a) * 0.75;
        xf(gg, x, gh(x, z) + 0.12, z, 0, 0, 0, 1, 0.7, 1);
        paint(gg, 0xffffff); uvScale(gg, 1, 1);
        glow.push(gg);
      }
    });
    const glowMesh = add(bake(glow), glowMat, 'neon', 'secret-glints');

    const rescues = [
      W(-24, gh(-24, 29) + 1.5, 29),
      W(-20, mesaTop[11] + 1.5, -70),
      W(4, gh(4, -118) + 1.5, -118),
    ];
    const raidOut = raids.map((r) => ({ center: W(r.x, gh(r.x, r.z), r.z), foes: r.foes, name: r.name }));
    const arrivalPos = W(arrival.x, gh(arrival.x, arrival.z) + 1.35, arrival.z);
    const arrivalLook = W(3, gh(3, 20) + 2.2, 20);

    /* animation (stepped to 12 fps for a stop-motion feel) */
    const pQ = new THREE.Quaternion(), pM = new THREE.Matrix4(), pP = new THREE.Vector3(), pS = new THREE.Vector3();
    let lastStep = -1;
    const waterMap = waterMat.map;
    function update(dt, t) {
      const st = Math.floor(t * 12);
      glowMat.emissiveIntensity = 0.65 + 0.3 * sin(t * Math.PI); // 0.5 Hz
      if (st === lastStep) return;
      lastStep = st;
      const ts = st / 12;
      waterMap.offset.y = -ts * 0.06; waterMap.offset.x = 0.04 * sin(ts * 0.5);
      for (let i = 0; i < snails.length; i++) {
        const s = snails[i], a = ts * 0.1 + s.ph, sq = sin(ts * 2.4 + s.ph);
        const x = s.cx + cos(a) * s.rad, z = s.cz + sin(a) * s.rad;
        const h = -a - Math.PI / 2; pQ.set(0, sin(h / 2), 0, cos(h / 2));
        pM.compose(pP.set(x, gh(x, z) + 0.02, z), pQ, pS.set(s.s * (1 + 0.14 * sq), s.s * (1 - 0.12 * sq), s.s * (1 - 0.06 * sq)));
        snailMesh.setMatrixAt(i, pM);
      }
      snailMesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i], p = (ts * 0.45 + b.ph) % 1;
        let hop = 0, sy = 1, sxz = 1;
        if (p < 0.2) { const u = p / 0.2; hop = sin(u * Math.PI) * 0.35; sy = 1 + 0.18 * sin(u * Math.PI); sxz = 1 - 0.1 * sin(u * Math.PI); }
        else if (p < 0.3) { const u = (p - 0.2) / 0.1; sy = 1 - 0.2 * sin(u * Math.PI); sxz = 1 + 0.12 * sin(u * Math.PI); }
        else sy = 1 + 0.03 * sin(ts * 3 + b.ph);
        const yaw = b.yaw + sin(Math.floor(ts * 0.5 + b.ph) * 12.9) * 1.1;
        pQ.set(0, sin(yaw / 2), 0, cos(yaw / 2));
        pM.compose(pP.set(b.x, b.y + hop, b.z), pQ, pS.set(b.s * sxz, b.s * sy, b.s * sxz));
        birdMesh.setMatrixAt(i, pM);
      }
      birdMesh.instanceMatrix.needsUpdate = true;
    }
    update(0, 0);

    return {
      root, update, arrival: { pos: arrivalPos, look: arrivalLook },
      raids: raidOut, rescues, secrets,
      facts: [
        'Fossils form when buried remains are slowly replaced or filled by minerals, usually inside sedimentary rock; ammonites, spiral-shelled relatives of squid and octopus, died out about 66 million years ago.',
        'Erosion carves canyons: moving water and the grit it carries wear rock away a little at a time, and the Colorado River needed millions of years to cut the Grand Canyon.',
        'In the rock cycle, rock is never used up: sediment is pressed into sedimentary rock, heat and pressure turn rock metamorphic, melting makes igneous rock, and weathering grinds it back into sediment.',
      ],
      lesson: 'Every dent and thumbprint is part of how you get your shape, so make your mistakes and keep shaping.',
      miniBoss: {
        center: W(ARENA.x, gh(ARENA.x, ARENA.z), ARENA.z),
        name: 'Grudge Golem',
        look: 'A hunched, sulking mud golem of dark wet clay with a drooping lip and heavy brow; every insult it collects sticks to it as another lump, so it grows bigger and lumpier.',
      },
    };
  },
};
