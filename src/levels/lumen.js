// LEVEL "Lumen Grid": an original bioluminescent light-architecture dimension.
// All procedural. One merged "light line" mesh (towers, bridges, plaza, arena) with a cheap
// shader that slowly assembles/disassembles tower tops; a mirrored copy fakes glossy reflections.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CY = [0.12, 0.8, 0.9], VI = [0.55, 0.34, 0.9], LI = [0.5, 0.85, 0.22], GO = [0.9, 0.68, 0.28];
const PAL = [[CY, VI], [VI, CY], [LI, CY], [GO, VI], [CY, LI], [VI, GO]];

function rngMaker(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- geometry accumulator for glowing tubes (attributes: color, aRev, aPh) ----------
class Acc {
  constructor() { this.p = []; this.c = []; this.r = []; this.h = []; this.i = []; this.n = 0; }
  tube(pts, rad, radial, col, rev, ph, closed) {
    const n = pts.length, m = radial, base = this.n;
    let Nx = 0, Ny = 0, Nz = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[closed ? (i + n - 1) % n : Math.max(i - 1, 0)], b = pts[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      if (i === 0) { // initial normal
        let rx = 0, ry = 1, rz = 0; if (Math.abs(ty) > 0.9) { rx = 1; ry = 0; }
        Nx = ty * rz - tz * ry; Ny = tz * rx - tx * rz; Nz = tx * ry - ty * rx;
      }
      const d = Nx * tx + Ny * ty + Nz * tz; Nx -= tx * d; Ny -= ty * d; Nz -= tz * d;
      const nl = Math.hypot(Nx, Ny, Nz) || 1; Nx /= nl; Ny /= nl; Nz /= nl;
      const Bx = ty * Nz - tz * Ny, By = tz * Nx - tx * Nz, Bz = tx * Ny - ty * Nx;
      const rr = typeof rad === 'function' ? rad(i) : rad;
      const rv = typeof rev === 'function' ? rev(i) : rev;
      for (let j = 0; j < m; j++) {
        const an = j / m * 6.2831853, cs = Math.cos(an) * rr, sn = Math.sin(an) * rr;
        this.p.push(pts[i][0] + Nx * cs + Bx * sn, pts[i][1] + Ny * cs + By * sn, pts[i][2] + Nz * cs + Bz * sn);
        this.c.push(col[0], col[1], col[2]); this.r.push(rv); this.h.push(ph);
      }
    }
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const i0 = base + i * m, i1 = base + ((i + 1) % n) * m;
      for (let j = 0; j < m; j++) {
        const j1 = (j + 1) % m;
        this.i.push(i0 + j, i1 + j, i1 + j1, i0 + j, i1 + j1, i0 + j1);
      }
    }
    this.n += n * m;
  }
  strip(L, R, col, rev, ph) { // flat ribbon between two polylines
    const base = this.n, n = L.length;
    for (let i = 0; i < n; i++) for (const q of [L[i], R[i]]) { this.p.push(q[0], q[1], q[2]); this.c.push(col[0], col[1], col[2]); this.r.push(rev); this.h.push(ph); }
    for (let i = 0; i < n - 1; i++) { const a = base + i * 2; this.i.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    this.n += n * 2;
  }
  gem(c, s, col, rev = -1, ph = 0) { // small octahedron
    const b = this.n, v = [[s, 0, 0], [-s, 0, 0], [0, s * 1.5, 0], [0, -s * 1.5, 0], [0, 0, s], [0, 0, -s]];
    for (const q of v) { this.p.push(c[0] + q[0], c[1] + q[1], c[2] + q[2]); this.c.push(col[0], col[1], col[2]); this.r.push(rev); this.h.push(ph); }
    this.i.push(b + 2, b + 0, b + 4, b + 2, b + 4, b + 1, b + 2, b + 1, b + 5, b + 2, b + 5, b + 0, b + 3, b + 4, b + 0, b + 3, b + 1, b + 4, b + 3, b + 5, b + 1, b + 3, b + 0, b + 5);
    this.n += 6;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aRev', new THREE.Float32BufferAttribute(this.r, 1));
    g.setAttribute('aPh', new THREE.Float32BufferAttribute(this.h, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

function ringPts(cx, cy, cz, r, n, plane = 'xz', rot = 0) {
  const o = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.2831853 + rot, c = Math.cos(a) * r, s = Math.sin(a) * r;
    o.push(plane === 'xz' ? [cx + c, cy, cz + s] : plane === 'xy' ? [cx + c, cy + s, cz] : [cx, cy + c, cz + s]);
  }
  return o;
}

// ---------- textures (code-generated, cached) ----------
let _tex = null;
function textures() {
  if (_tex) return _tex;
  const rnd = rngMaker(77);
  // ground: dark glass with faint bioluminescent veins (tileable)
  const W = 1024, cv = document.createElement('canvas'); cv.width = cv.height = W;
  const g = cv.getContext('2d');
  g.fillStyle = '#04070f'; g.fillRect(0, 0, W, W);
  const grd = g.createRadialGradient(W / 2, W / 2, 20, W / 2, W / 2, W * 0.7); grd.addColorStop(0, 'rgba(20,40,70,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, W, W);
  const cols = ['#2fe0ff', '#9a6bff', '#9be83c', '#ffc65a'];
  g.lineCap = 'round';
  for (let k = 0; k < 46; k++) {
    let x = rnd() * W, y = rnd() * W, a = rnd() * 6.28; const col = cols[k % 4], w = 0.8 + rnd() * 1.6;
    const pts = [[x, y]]; const len = 10 + (rnd() * 26 | 0);
    for (let s = 0; s < len; s++) { a += (rnd() - 0.5) * 0.8; x += Math.cos(a) * 22; y += Math.sin(a) * 22; pts.push([x, y]); }
    for (const ox of [-W, 0, W]) for (const oy of [-W, 0, W]) {
      g.globalAlpha = 0.5; g.strokeStyle = col; g.lineWidth = w + 3; g.shadowColor = col; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(pts[0][0] + ox, pts[0][1] + oy); for (const q of pts) g.lineTo(q[0] + ox, q[1] + oy); g.stroke();
      g.globalAlpha = 0.9; g.shadowBlur = 0; g.lineWidth = w * 0.6; g.strokeStyle = '#fff';
      g.beginPath(); g.moveTo(pts[0][0] + ox, pts[0][1] + oy); for (const q of pts) g.lineTo(q[0] + ox, q[1] + oy); g.stroke();
    }
  }
  g.globalAlpha = 1; g.shadowBlur = 0;
  const ground = new THREE.CanvasTexture(cv); ground.wrapS = ground.wrapT = THREE.RepeatWrapping; ground.repeat.set(7, 7); ground.anisotropy = 4; ground.colorSpace = THREE.SRGBColorSpace;
  // river: streaks of light packets
  const rc = document.createElement('canvas'); rc.width = 512; rc.height = 64; const r = rc.getContext('2d');
  r.fillStyle = '#000'; r.fillRect(0, 0, 512, 64);
  const vg = r.createLinearGradient(0, 0, 0, 64); vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(0.5, 'rgba(255,255,255,0.22)'); vg.addColorStop(1, 'rgba(255,255,255,0)');
  r.fillStyle = vg; r.fillRect(0, 0, 512, 64);
  for (let k = 0; k < 22; k++) {
    const x = rnd() * 512, y = 10 + rnd() * 44, l = 30 + rnd() * 120, h = 2 + rnd() * 5;
    for (const ox of [-512, 0]) {
      const lg = r.createLinearGradient(x + ox, 0, x + ox + l, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.8, 'rgba(255,255,255,0.75)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      r.fillStyle = lg; r.fillRect(x + ox, y - h / 2, l, h);
    }
  }
  const river = new THREE.CanvasTexture(rc); river.wrapS = river.wrapT = THREE.RepeatWrapping; river.wrapT = THREE.ClampToEdgeWrapping; river.colorSpace = THREE.SRGBColorSpace;
  // soft glow disc
  const gc = document.createElement('canvas'); gc.width = gc.height = 128; const q = gc.getContext('2d');
  const rg = q.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.35, 'rgba(255,255,255,0.32)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  q.fillStyle = rg; q.fillRect(0, 0, 128, 128);
  const glow = new THREE.CanvasTexture(gc); glow.colorSpace = THREE.SRGBColorSpace;
  _tex = { ground, river, glow };
  return _tex;
}

export const LEVEL = {
  id: 'lumen', name: 'Lumen Grid', sub: 'A dimension drawn in living light', color: '#37e8ff', sky: 'neon-night',
  build(scene, offset) {
    const V = (x, y, z) => new THREE.Vector3(offset.x + x, offset.y + y, offset.z + z);
    const rnd = rngMaker(20261122);
    const T = textures();
    const root = new THREE.Group(); root.position.copy(offset); root.name = 'lumen-root';
    const UT = { value: 0 };

    // ---------- fixed layout (local coords) ----------
    const raidsL = [[-70, 14, -60, 5, 'Mirror Crossing'], [85, 28, -130, 6, 'Spire Garden'], [-20, 46, -215, 7, 'Aurora Span']];
    const rescL = [[-40, 3, -30], [62, 5, -92], [-100, 6, -172]];
    const secL = [[140, 38, -40], [-126, 3, -104], [30, 128, -262]];
    const ARENA = [0, 26, -330];
    const sculpts = [[-55, 40, -20], [60, 34, -45], [-112, 54, -140], [112, 60, -196], [0, 72, -150], [-44, 92, -272]];

    // river curves
    const riverCurves = [
      [[0, -340], [-30, -250], [40, -170], [-20, -80], [10, 0], [0, 110]],
      [[-190, -270], [-125, -175], [-72, -92], [-20, -20], [-14, 60], [-10, 110]],
      [[210, -230], [135, -140], [72, -62], [26, 10], [12, 80], [8, 110]]
    ].map(a => new THREE.CatmullRomCurve3(a.map(p => new THREE.Vector3(p[0], 0.15, p[1]))));
    const riverSamples = [];
    for (const c of riverCurves) for (let i = 0; i <= 80; i++) { const p = c.getPoint(i / 80); riverSamples.push(p.x, p.z); }

    // ---------- tower placement ----------
    const keep = [[0, 70, 45]];
    raidsL.forEach(r => keep.push([r[0], r[2], 40]));
    rescL.forEach(r => keep.push([r[0], r[2], 14]));
    secL.forEach(r => keep.push([r[0], r[2], 22]));
    sculpts.forEach(r => keep.push([r[0], r[2], 30]));
    keep.push([ARENA[0], ARENA[2], 66]);
    const towers = [];
    const okSpot = (x, z, minD) => {
      for (const k of keep) if (Math.hypot(x - k[0], z - k[1]) < k[2]) return false;
      for (let i = 0; i < riverSamples.length; i += 2) if (Math.hypot(x - riverSamples[i], z - riverSamples[i + 1]) < 17) return false;
      for (const t of towers) if (Math.hypot(x - t.x, z - t.z) < minD) return false;
      return true;
    };
    // stage towers around the arena (leaning inward like a canopy)
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * 6.283 + 0.2, x = ARENA[0] + Math.cos(a) * 88, z = ARENA[2] + Math.sin(a) * 88;
      towers.push({ x, z, H: 135 + rnd() * 40, r: 7 + rnd() * 2, dx: -Math.cos(a), dz: -Math.sin(a), bend: 22 + rnd() * 10 });
    }
    for (let tries = 0; tries < 4000 && towers.length < 32; tries++) {
      const x = -270 + rnd() * 540, z = -290 + rnd() * 330;
      if (!okSpot(x, z, 40)) continue;
      const a = rnd() * 6.283;
      towers.push({ x, z, H: 70 + rnd() * 105, r: 4.5 + rnd() * 4.5, dx: Math.cos(a), dz: Math.sin(a), bend: 6 + rnd() * 26 });
    }

    const lines = new Acc();
    const shellP = [], shellI = [];
    towers.forEach((t, ti) => {
      const pal = PAL[ti % PAL.length], ph = rnd() * 6.283, twist = (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 1.6);
      const C = u => [t.x + t.dx * t.bend * u * u, u * t.H, t.z + t.dz * t.bend * u * u];
      const R = u => t.r * (1 - 0.78 * Math.pow(u, 0.85)) * (1 + 0.16 * Math.sin(u * 8 + ph)) + t.r * 0.6 * Math.exp(-u * 9);
      t.C = C; t.R = R; t.ph = ph;
      // glass shell
      const rings = 15, rad = 12, b0 = shellP.length / 3;
      for (let k = 0; k <= rings; k++) {
        const u = k / rings, c = C(u), rr = R(u);
        for (let j = 0; j < rad; j++) { const a = j / rad * 6.283 + twist * u; shellP.push(c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr); }
      }
      for (let k = 0; k < rings; k++) for (let j = 0; j < rad; j++) {
        const a = b0 + k * rad + j, b = b0 + k * rad + (j + 1) % rad, c2 = a + rad, d = b + rad;
        shellI.push(a, c2, b, b, c2, d);
      }
      const rbr = 0.16 + t.H * 0.0012;
      // ribs
      const nr = 6;
      for (let k = 0; k < nr; k++) {
        const a0 = k / nr * 6.283, pts = [];
        for (let s = 0; s <= 16; s++) { const u = s / 16, c = C(u), rr = R(u) + 0.1, a = a0 + twist * u; pts.push([c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr]); }
        lines.tube(pts, rbr, 4, pal[k % 2], i => i / 16, ph, false);
      }
      // rings
      for (const u of [0.05, 0.19, 0.34, 0.5, 0.67, 0.85]) {
        const c = C(u), rr = R(u) + 0.15, pts = [];
        for (let s = 0; s < 20; s++) { const a = s / 20 * 6.283; pts.push([c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr]); }
        lines.tube(pts, rbr * 1.3, 4, pal[(u * 10 | 0) % 2], u, ph, true);
      }
      // tendrils: curling organic offshoots
      for (let k = 0; k < 2; k++) {
        const u0 = 0.3 + rnd() * 0.35, c = C(u0), a = rnd() * 6.283, rr = R(u0), pts = [], len = 8 + rnd() * 8;
        for (let s = 0; s <= 14; s++) {
          const f = s / 14, ang = a + f * 1.2, out = rr + f * len * 0.8 + Math.sin(f * 5) * 1.2, curl = Math.sin(f * 3.1) * len * 0.35;
          pts.push([c[0] + Math.cos(ang) * out, c[1] + f * len * 0.6 + curl, c[2] + Math.sin(ang) * out]);
        }
        lines.tube(pts, rbr * 0.8, 4, pal[1], u0 + 0.02, ph, false);
        lines.gem(pts[14], 0.55 + t.H * 0.002, GO, u0 + 0.03, ph);
      }
      // spire
      const top = C(1), pts = []; for (let s = 0; s <= 6; s++) pts.push([top[0], top[1] + s / 6 * t.H * 0.14, top[2]]);
      lines.tube(pts, rbr * 0.9, 4, GO, 1.0, ph, false);
    });

    // bridges between nearby towers
    const used = new Set(); let nb = 0;
    for (let a = 0; a < towers.length && nb < 14; a++) {
      let best = -1, bd = 1e9;
      for (let b = 0; b < towers.length; b++) { if (a === b) continue; const d = Math.hypot(towers[a].x - towers[b].x, towers[a].z - towers[b].z); if (d > 50 && d < 120 && d < bd && !used.has(b + ':' + a)) { bd = d; best = b; } }
      if (best < 0) continue; used.add(a + ':' + best); nb++;
      const A = towers[a], B = towers[best], ua = 0.2 + rnd() * 0.15, ub = 0.2 + rnd() * 0.15;
      const ca = A.C(ua), cb = B.C(ub);
      let dx = cb[0] - ca[0], dz = cb[2] - ca[2]; const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
      const p0 = [ca[0] + dx * A.R(ua), ca[1], ca[2] + dz * A.R(ua)], p1 = [cb[0] - dx * B.R(ub), cb[1], cb[2] - dz * B.R(ub)];
      const lift = 6 + dl * 0.1, L = [], Rr = [], mid = [], hw = 2.2, pxn = -dz, pzn = dx;
      for (let s = 0; s <= 24; s++) {
        const f = s / 24, y = p0[1] + (p1[1] - p0[1]) * f + Math.sin(f * 3.1416) * lift, x = p0[0] + (p1[0] - p0[0]) * f, z = p0[2] + (p1[2] - p0[2]) * f;
        L.push([x + pxn * hw, y, z + pzn * hw]); Rr.push([x - pxn * hw, y, z - pzn * hw]); mid.push([x, y, z]);
      }
      const rev = Math.min(ua, ub) - 0.02, col = PAL[a % PAL.length];
      lines.tube(L, 0.2, 4, col[0], rev, A.ph, false); lines.tube(Rr, 0.2, 4, col[0], rev, A.ph, false);
      lines.strip(L, Rr, [0.05, 0.16, 0.2], rev, A.ph);
      lines.tube(mid.map(p => [p[0], p[1] - 0.2, p[2]]), 0.1, 4, GO, rev, A.ph, false);
      for (let s = 3; s < 24; s += 3) lines.tube([L[s], [L[s][0], L[s][1] - 4, L[s][2]]], 0.08, 4, VI, rev, A.ph, false);
    }

    // plaza + arena static line work (rev = -1 => always on)
    const plazaC = [0, 0.14, 0];
    for (const r of [12, 20, 30]) lines.tube(ringPts(plazaC[0], plazaC[1], plazaC[2], r, 56), 0.22, 4, r === 20 ? GO : CY, -1, 0, true);
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * 6.283, pts = [];
      for (let s = 0; s <= 10; s++) { const f = s / 10, rr = 12 + f * 18, aa = a + Math.sin(f * 3.1416) * 0.18; pts.push([Math.cos(aa) * rr, 0.14, Math.sin(aa) * rr]); }
      lines.tube(pts, 0.14, 4, k % 2 ? VI : LI, -1, 0, false);
    }
    // arena dais rings + crown
    for (const r of [8, 16, 24, 33]) lines.tube(ringPts(ARENA[0], 13.2, ARENA[2], r, 64), 0.28, 4, r === 33 ? GO : r === 16 ? VI : CY, -1, 0, true);
    for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283; lines.tube([[ARENA[0] + Math.cos(a) * 8, 13.2, ARENA[2] + Math.sin(a) * 8], [ARENA[0] + Math.cos(a) * 33, 13.2, ARENA[2] + Math.sin(a) * 33]], 0.12, 4, k % 2 ? CY : VI, -1, 0, false); }
    {
      const cz = ARENA[2] - 30, base = []; // throne crown arch behind the Duchess
      for (let s = 0; s <= 40; s++) { const a = s / 40 * 3.1416, spike = (s % 5 === 0) ? 9 : 0; base.push([Math.cos(a) * 24, 14 + Math.sin(a) * 30 + spike, cz]); }
      lines.tube(base, 0.4, 4, GO, -1, 0, false);
      lines.tube(base.map(p => [p[0] * 0.8, p[1] * 0.8 + 3, p[2]]), 0.22, 4, VI, -1, 0, false);
      for (let s = 0; s <= 40; s += 5) lines.gem(base[s], 1.1, GO);
    }
    // hidden Heart Piece lures: faint gold gems framed by small arcs
    secL.forEach((s, i) => {
      lines.gem([s[0], s[1], s[2]], 0.5, [0.5, 0.38, 0.14]);
      lines.tube(ringPts(s[0], s[1], s[2], i === 1 ? 9 : 6, 28, i === 1 ? 'yz' : 'xy', 0), 0.14, 4, i === 2 ? CY : [0.3, 0.55, 0.6], -1, 0, true);
    });
    // low gate arch near secret B and light nodes by rescues
    { const s = secL[1], pts = []; for (let k = 0; k <= 16; k++) { const a = k / 16 * 3.1416; pts.push([s[0] + Math.cos(a) * 9, Math.sin(a) * 9, s[2] - 6]); } lines.tube(pts, 0.25, 4, LI, -1, 0, false); }
    rescL.forEach((s, i) => { lines.tube(ringPts(s[0], 0.2, s[2], 3, 24), 0.12, 4, GO, -1, 0, true); lines.gem([s[0], s[1] + 1.2, s[2]], 0.3, GO); });

    const lineGeo = lines.geometry();
    const mkLineMat = (gain, fade) => {
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      m.onBeforeCompile = sh => {
        sh.uniforms.uT = UT; sh.uniforms.uGain = { value: gain }; sh.uniforms.uFade = { value: fade };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRev; attribute float aPh; varying float vRev; varying float vPh; varying float vY;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRev=aRev; vPh=aPh; vY=position.y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT; uniform float uGain; uniform float uFade; varying float vRev; varying float vPh; varying float vY;')
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float r_ = 0.8 + 0.4*sin(uT*0.1 + vPh);
          float sh_ = 1.0 - smoothstep(r_-0.14, r_, vRev);
          float gw_ = sh_*(1.0-sh_)*4.0;
          float fl_ = vRev < 0.0 ? 1.0 : (0.78 + 0.22*sin(vRev*34.0 - uT*2.2));
          float g_ = uGain*exp(-uFade*max(vY,0.0));
          gl_FragColor.rgb = (gl_FragColor.rgb*sh_*fl_ + vec3(1.0,0.78,0.4)*gw_*0.3*step(-0.5,vRev)) * g_;`);
      };
      m.customProgramCacheKey = () => 'lumen-lines';
      return m;
    };
    const linesMesh = new THREE.Mesh(lineGeo, mkLineMat(1, 0)); linesMesh.name = 'lumen-lines'; linesMesh.renderOrder = 3;
    linesMesh.userData.mat = 'neon'; linesMesh.userData.matLocked = true;
    const mirrorMesh = new THREE.Mesh(lineGeo, mkLineMat(0.3, 0.01)); mirrorMesh.scale.y = -1; mirrorMesh.name = 'lumen-reflection'; mirrorMesh.renderOrder = 3;
    mirrorMesh.userData.mat = 'neon'; mirrorMesh.userData.matLocked = true;
    root.add(linesMesh, mirrorMesh);

    // glass tower shells
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(shellP, 3));
    shellGeo.setIndex(new THREE.Uint16BufferAttribute(shellI, 1));
    shellGeo.computeVertexNormals(); shellGeo.computeBoundingSphere();
    const glass = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ color: 0x0a1424, emissive: 0x06182a, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.FrontSide }));
    glass.name = 'lumen-glass'; glass.userData.mat = 'glass'; glass.renderOrder = 2; root.add(glass);

    // ---------- ground ----------
    const gmat = new THREE.MeshStandardMaterial({ map: T.ground, emissive: 0xffffff, emissiveMap: T.ground, emissiveIntensity: 0.75, roughness: 0.1, metalness: 0.55, transparent: true, opacity: 0.88, depthWrite: false });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(700, 48), gmat); ground.rotation.x = -Math.PI / 2; ground.renderOrder = 1; ground.name = 'lumen-ground'; ground.userData.mat = 'glass';
    root.add(ground);

    // glow pools (fake bounce light / glossy reflection) under towers, sculptures, arena
    {
      const P = [], C = [], U = [], I = []; let n = 0;
      const quad = (x, z, s, col, a = 1) => {
        P.push(x - s, 0.1, z - s, x + s, 0.1, z - s, x + s, 0.1, z + s, x - s, 0.1, z + s);
        for (let k = 0; k < 4; k++) C.push(col[0] * a, col[1] * a, col[2] * a);
        U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(n, n + 2, n + 1, n, n + 3, n + 2); n += 4;
      };
      towers.forEach((t, i) => quad(t.x, t.z, t.r * 4.5, PAL[i % PAL.length][0], 0.6));
      sculpts.forEach((s, i) => quad(s[0], s[2], 26, PAL[(i + 2) % PAL.length][1], 0.4));
      raidsL.forEach((s, i) => quad(s[0], s[2], 30, PAL[i][0], 0.3));
      quad(ARENA[0], ARENA[2], 60, VI, 0.6); quad(0, 0, 50, CY, 0.4);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: T.glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.renderOrder = 2; m.name = 'lumen-pools'; root.add(m);
    }

    // ---------- rivers of flowing light ----------
    {
      const P = [], C = [], U = [], I = []; let n = 0;
      riverCurves.forEach((cv, ri) => {
        const N = 120, w = 4.5 + ri * 1.2, len = cv.getLength(); const cA = ri === 1 ? VI : CY, cB = ri === 2 ? GO : LI;
        for (let i = 0; i <= N; i++) {
          const f = i / N, p = cv.getPoint(f), tg = cv.getTangent(f), ww = w * (0.8 + 0.4 * Math.sin(f * 9 + ri));
          const nx = -tg.z, nz = tg.x, col = [cA[0] + (cB[0] - cA[0]) * f, cA[1] + (cB[1] - cA[1]) * f, cA[2] + (cB[2] - cA[2]) * f];
          P.push(p.x + nx * ww, 0.16, p.z + nz * ww, p.x - nx * ww, 0.16, p.z - nz * ww);
          C.push(col[0], col[1], col[2], col[0], col[1], col[2]);
          U.push(f * len / 26 + ri * 0.37, 0, f * len / 26 + ri * 0.37, 1);
          if (i < N) { const a = n + i * 2; I.push(a, a + 1, a + 3, a, a + 3, a + 2); }
        }
        n += (N + 1) * 2;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeBoundingSphere();
      var riverMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: T.river, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      riverMesh.renderOrder = 2; riverMesh.name = 'lumen-rivers'; riverMesh.userData.mat = 'neon'; root.add(riverMesh);
    }

    // ---------- giant floating sculptures (edge tubes + joints) ----------
    const sculptMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const edgeTubes = (acc, geo, rad, col, nodeScale) => {
      const e = new THREE.EdgesGeometry(geo, 1).getAttribute('position'); const seen = new Set();
      for (let i = 0; i < e.count; i += 2) {
        const a = [e.getX(i), e.getY(i), e.getZ(i)], b = [e.getX(i + 1), e.getY(i + 1), e.getZ(i + 1)];
        acc.tube([a, b], rad, 4, col, -1, 0, false);
        for (const p of [a, b]) { const k = p.map(v => Math.round(v * 20)).join(','); if (!seen.has(k)) { seen.add(k); acc.gem(p, rad * nodeScale, col); } }
      }
    };
    const sculptDefs = [];
    const S = (idx, speed, build) => { const a = new Acc(); build(a); const m = new THREE.Mesh(a.geometry(), sculptMat); m.position.set(sculpts[idx][0], sculpts[idx][1], sculpts[idx][2]); m.name = 'lumen-sculpture-' + idx; m.userData.mat = 'neon'; m.renderOrder = 3; root.add(m); sculptDefs.push({ m, speed, y0: sculpts[idx][1], k: idx }); };
    S(0, 0.05, a => { edgeTubes(a, new THREE.IcosahedronGeometry(13, 0), 0.3, CY, 2.6); edgeTubes(a, new THREE.IcosahedronGeometry(7, 0), 0.22, GO, 2.4); a.gem([0, 0, 0], 1.3, [0.7, 0.9, 0.9]); });
    S(1, -0.07, a => { edgeTubes(a, new THREE.OctahedronGeometry(11, 0), 0.3, VI, 2.6); edgeTubes(a, new THREE.OctahedronGeometry(6, 0), 0.22, LI, 2.4); edgeTubes(a, new THREE.BoxGeometry(5, 5, 5), 0.18, GO, 2.4); });
    S(2, 0.04, a => {
      const pts = []; for (let i = 0; i <= 160; i++) { const t = i / 160 * 6.2832, r = 2 + Math.cos(3 * t); pts.push([r * Math.cos(2 * t) * 4, r * Math.sin(2 * t) * 4, -Math.sin(3 * t) * 4 * 1.6]); }
      a.tube(pts, 0.55, 5, CY, -1, 0, true); a.tube(pts.map(p => [p[0] * 0.96, p[1] * 0.96 + 0.3, p[2] * 0.96]), 0.22, 4, GO, -1, 0, true);
    });
    S(3, 0.06, a => {
      a.tube(ringPts(0, 0, 0, 15, 64, 'xz'), 0.35, 4, CY, -1, 0, true); a.tube(ringPts(0, 0, 0, 12, 64, 'xy', 0.4), 0.3, 4, VI, -1, 0, true);
      a.tube(ringPts(0, 0, 0, 9, 56, 'yz', 1.1), 0.26, 4, GO, -1, 0, true); a.gem([0, 0, 0], 2.2, LI);
    });
    S(4, -0.05, a => { edgeTubes(a, new THREE.DodecahedronGeometry(15, 0), 0.32, GO, 2.6); edgeTubes(a, new THREE.IcosahedronGeometry(8, 0), 0.22, VI, 2.4); a.gem([0, 0, 0], 1.4, CY); });
    S(5, 0.045, a => {
      edgeTubes(a, new THREE.BoxGeometry(18, 18, 18), 0.3, CY, 2.6); edgeTubes(a, new THREE.BoxGeometry(9, 9, 9), 0.22, LI, 2.4);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) a.tube([[sx * 9, sy * 9, sz * 9], [sx * 4.5, sy * 4.5, sz * 4.5]], 0.14, 4, VI, -1, 0, false);
    });

    // "likes": orbiting star outlines around the Static Duchess arena
    let likeRing;
    {
      const a = new Acc();
      for (let k = 0; k < 14; k++) {
        const th = k / 14 * 6.2832, cx = Math.cos(th) * 26, cz = Math.sin(th) * 26, cy = Math.sin(k * 1.7) * 3, tx = -Math.sin(th), tz = Math.cos(th), pts = [];
        for (let s = 0; s < 10; s++) { const ang = s / 10 * 6.2832 + 1.5708, r = s % 2 ? 1.0 : 2.4; pts.push([cx + tx * Math.cos(ang) * r, cy + Math.sin(ang) * r, cz + tz * Math.cos(ang) * r]); }
        a.tube(pts, 0.12, 4, k % 2 ? GO : CY, -1, 0, true);
        a.gem([cx, cy, cz], 0.3, k % 2 ? GO : CY);
      }
      likeRing = new THREE.Mesh(a.geometry(), sculptMat); likeRing.position.set(ARENA[0], ARENA[1] + 2, ARENA[2]); likeRing.renderOrder = 3; likeRing.name = 'lumen-likes'; likeRing.userData.mat = 'neon'; root.add(likeRing);
    }
    // arena dais: dark metal disc
    {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(36, 39, 1.8, 48), new THREE.MeshStandardMaterial({ color: 0x151a24, emissive: 0x050a14, roughness: 0.3, metalness: 0.85 }));
      d.position.set(ARENA[0], 12.3, ARENA[2]); d.name = 'lumen-dais'; d.userData.mat = 'metal'; root.add(d);
    }

    // ---------- aurora ribbons ----------
    const COLS = 64, aur = [];
    {
      const defs = [{ z: -90, y: 120, h: 80, c0: LI, c1: CY, c2: VI }, { z: -210, y: 150, h: 95, c0: CY, c1: VI, c2: GO }, { z: -320, y: 130, h: 85, c0: GO, c1: LI, c2: CY }];
      defs.forEach((d, k) => {
        const pos = new Float32Array(COLS * 3 * 3), col = new Float32Array(COLS * 3 * 4), base = new Float32Array(COLS * 3 * 3), idx = [];
        for (let i = 0; i < COLS; i++) {
          const env = Math.pow(Math.sin(i / (COLS - 1) * 3.1416), 0.7);
          for (let r = 0; r < 3; r++) {
            const o = (i * 3 + r), c = r === 0 ? d.c0 : r === 1 ? d.c1 : d.c2, al = (r === 1 ? 0.3 : 0.0) * env;
            base[o * 3] = -280 + i * (560 / (COLS - 1)); base[o * 3 + 1] = d.y + r * d.h * 0.5; base[o * 3 + 2] = d.z + Math.sin(i * 0.09 + k * 2) * 45;
            col[o * 4] = c[0]; col[o * 4 + 1] = c[1]; col[o * 4 + 2] = c[2]; col[o * 4 + 3] = al;
          }
          if (i < COLS - 1) for (let r = 0; r < 2; r++) { const a = i * 3 + r, b = (i + 1) * 3 + r; idx.push(a, b, a + 1, b, b + 1, a + 1); }
        }
        pos.set(base);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(idx);
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, d.y + d.h / 2, d.z), 340);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        m.renderOrder = 1; m.name = 'lumen-aurora-' + k; m.userData.mat = 'neon'; root.add(m); aur.push({ m, pos, base, k });
      });
    }

    // ---------- neon stick-figure citizens (instanced, vertex-shader idle bob) ----------
    let cit;
    {
      const parts = [], q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dv = new THREE.Vector3(), mp = new THREE.Vector3();
      const limb = (x0, y0, z0, x1, y1, z1, w) => {
        dv.set(x1 - x0, y1 - y0, z1 - z0); const l = dv.length(); const g = new THREE.BoxGeometry(w, l, w); q.setFromUnitVectors(up, dv.normalize());
        g.applyQuaternion(q); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); const n = g.toNonIndexed(); n.deleteAttribute('normal'); n.deleteAttribute('uv'); parts.push(n);
      };
      limb(0, 0.95, 0, 0, 1.6, 0, 0.1); limb(0, 1.5, 0, -0.42, 1.0, 0.05, 0.08); limb(0, 1.5, 0, 0.42, 1.0, 0.05, 0.08);
      limb(0, 0.95, 0, -0.2, 0, 0, 0.09); limb(0, 0.95, 0, 0.2, 0, 0, 0.09);
      const h = new THREE.IcosahedronGeometry(0.17, 0); h.translate(0, 1.82, 0); h.deleteAttribute('normal'); h.deleteAttribute('uv'); parts.push(h);
      const geo = mergeGeometries(parts);
      const mat = new THREE.MeshBasicMaterial({ fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      mat.onBeforeCompile = sh => {
        sh.uniforms.uT = UT;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph_ = instanceMatrix[3].x*0.37 + instanceMatrix[3].z*0.53;
        transformed.y += sin(uT*1.2 + ph_)*0.05;
        transformed.x += sin(uT*0.8 + ph_)*0.04*position.y;
        if (position.y > 1.05 && abs(position.x) > 0.1) transformed.y += sin(uT*1.6 + ph_ + position.x*5.0)*0.07;`);
      };
      mat.customProgramCacheKey = () => 'lumen-cit';
      const spots = [];
      const ring = (cx, cz, r0, r1, n, face) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.283, r = r0 + rnd() * (r1 - r0); const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; spots.push([x, z, face ? Math.atan2(cx - x, cz - z) : rnd() * 6.283]); } };
      ring(0, 0, 8, 34, 90, false);
      rescL.forEach(s => ring(s[0], s[2], 3, 14, 10, false));
      ring(ARENA[0], ARENA[2], 40, 52, 36, true); // fans gazing up at the Duchess
      for (let i = 0; i < 70; i++) { const c = riverCurves[i % 3], f = rnd(), p = c.getPoint(f), tg = c.getTangent(f), side = rnd() < 0.5 ? 1 : -1, off = 9 + rnd() * 4; spots.push([p.x - tg.z * off * side, p.z + tg.x * off * side, rnd() * 6.283]); }
      cit = new THREE.InstancedMesh(geo, mat, spots.length); cit.name = 'lumen-citizens'; cit.userData.mat = 'neon';
      const o = new THREE.Object3D(), pc = [CY, VI, LI, GO], tc = new THREE.Color();
      spots.forEach((s, i) => { o.position.set(s[0], 0.1, s[1]); o.rotation.set(0, s[2], 0); const sc = 1.1 + rnd() * 0.4; o.scale.set(sc, sc, sc); o.updateMatrix(); cit.setMatrixAt(i, o.matrix); const c = pc[i % 4]; tc.setRGB(c[0], c[1], c[2]); cit.setColorAt(i, tc); });
      cit.instanceMatrix.needsUpdate = true; cit.instanceColor.needsUpdate = true;
      cit.computeBoundingSphere(); cit.renderOrder = 3; root.add(cit);
    }

    scene.add(root);

    const tex = T.river;
    const update = (dt, t) => {
      UT.value = t;
      tex.offset.x = -(t * 0.07) % 1;
      for (let i = 0; i < sculptDefs.length; i++) { const s = sculptDefs[i]; s.m.rotation.y = t * s.speed; s.m.rotation.x = Math.sin(t * 0.05 + s.k) * 0.25; s.m.position.y = s.y0 + Math.sin(t * 0.3 + s.k) * 1.6; }
      likeRing.rotation.y = t * 0.12;
      for (let a = 0; a < aur.length; a++) {
        const A = aur[a], p = A.pos, b = A.base;
        for (let i = 0; i < COLS; i++) {
          const sx = Math.sin(t * 0.07 + i * 0.11 + A.k) * 10, sz = Math.sin(t * 0.06 + i * 0.15 + A.k * 2) * 12;
          for (let r = 0; r < 3; r++) { const o = (i * 3 + r) * 3; p[o] = b[o] + sx * r; p[o + 1] = b[o + 1] + Math.sin(t * 0.05 + i * 0.2 + A.k) * 6 * r; p[o + 2] = b[o + 2] + sz * (0.4 + r * 0.3); }
        }
        A.m.geometry.attributes.position.needsUpdate = true;
      }
    };

    return {
      root, update,
      arrival: { pos: V(0, 10, 78), look: V(0, 26, -80) },
      raids: raidsL.map(r => ({ center: V(r[0], r[1], r[2]), foes: r[3], name: r[4] })),
      rescues: rescL.map(r => V(r[0], r[1], r[2])),
      secrets: secL.map(r => V(r[0], r[1], r[2])),
      facts: [
        'A lightning bolt heats the air around it to roughly 30,000 degrees Celsius, several times hotter than the surface of the Sun.',
        'Light travels about 300,000 kilometers every second, fast enough to circle the Earth about seven times in a single second.',
        'Auroras glow when charged particles from the Sun hit gases high in Earth\'s atmosphere; oxygen makes green light and nitrogen can make blue or purple.'
      ],
      lesson: 'Likes count attention, not you. Your worth was never a number on a screen.',
      miniBoss: { center: V(ARENA[0], ARENA[1], ARENA[2]), name: 'Static Duchess', look: 'A crackling neon-outline queen of living static with a crown of floating star-likes, hungry for every glance.' }
    };
  }
};
