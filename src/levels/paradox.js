// Level: Paradox Gardens (sky 'dusk'). Original geometry built from published perception principles.
// Local frame: seat (arrival eye) at V = (0, 1.2, 0), forward = -z. The game places root at `offset`.
// Most illusions use ONE trick: move a point along its line of sight from the seat and scale it by the same factor.
// From the seat nothing changes on screen; from anywhere else the cheat shows. (See research/illusions.md.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const D2R = Math.PI / 180;
const EYE = 1.2;
const FLOOR = -32; // courtyard floor (local y)
const V = new THREE.Vector3(0, EYE, 0);

// ------------------------------------------------------------------ helpers
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UBOX = new THREE.BoxGeometry(1, 1, 1);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) * (x - cx)) / (2 * sx * sx) + ((y - cy) * (y - cy)) / (2 * sy * sy)));
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pol = (azDeg, f, y) => new THREE.Vector3(f * Math.sin(azDeg * D2R), y, -f * Math.cos(azDeg * D2R));
// move p along its sight line from the seat, scaled by s (screen image unchanged)
const warpS = (p, s, out) => out.set(V.x + s * (p.x - V.x), V.y + s * (p.y - V.y), V.z + s * (p.z - V.z));

// Accumulates boxes / cylinders / quads (vertex colored) into ONE merged geometry
class Acc {
  constructor() { this.parts = []; this.qp = []; this.qc = []; this.qu = []; }
  geo(g, color, matrix) {
    const x = g.index ? g.toNonIndexed() : g.clone();
    if (matrix) x.applyMatrix4(matrix);
    for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') x.deleteAttribute(k);
    const n = x.attributes.position.count;
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const col = new Float32Array(n * 3); _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    x.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(x); return this;
  }
  box(cx, cy, cz, sx, sy, sz, color, ry = 0, rx = 0, rz = 0) {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(cx, cy, cz); _s.set(sx, sy, sz); _m.compose(_p, _q, _s);
    return this.geo(UBOX, color, _m);
  }
  cyl(cx, cy, cz, rt, rb, h, seg, color) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(cx, cy, cz); this.geo(g, color); g.dispose(); return this; }
  // quad a,b,c,d; if `inside` is given the outward side faces away from that point
  quad(a, b, c, d, color, inside, uv) {
    let pts = [a, b, c, d], uvs = uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (inside) {
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (n.dot(new THREE.Vector3().subVectors(a, inside)) < 0) { pts = [a, d, c, b]; uvs = [uvs[0], uvs[3], uvs[2], uvs[1]]; }
    }
    _c.set(color);
    for (const i of [0, 1, 2, 0, 2, 3]) { const P = pts[i], U = uvs[i]; this.qp.push(P.x, P.y, P.z); this.qc.push(_c.r, _c.g, _c.b); this.qu.push(U[0], U[1]); }
    return this;
  }
  // hexahedron from 8 corners (bottom ring 0-3, top ring 4-7)
  solid(k, color) {
    const cen = new THREE.Vector3(); k.forEach(v => cen.add(v)); cen.multiplyScalar(1 / 8);
    this.quad(k[0], k[1], k[2], k[3], color, cen); this.quad(k[4], k[5], k[6], k[7], color, cen);
    this.quad(k[0], k[1], k[5], k[4], color, cen); this.quad(k[1], k[2], k[6], k[5], color, cen);
    this.quad(k[2], k[3], k[7], k[6], color, cen); this.quad(k[3], k[0], k[4], k[7], color, cen);
    return this;
  }
  build() {
    if (this.qp.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.qp, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.qc, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.qu, 2));
      g.computeVertexNormals(); this.parts.push(g);
    }
    const out = mergeGeometries(this.parts, false);
    this.parts.forEach(p => p.dispose()); out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
  }
}
function mergeG(list) {
  const a = list.map(g => { const x = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') x.deleteAttribute(k); return x; });
  return mergeGeometries(a, false);
}
function ctex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const lin2srgb = L => 255 * (L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055);

// ------------------------------------------------------------------ textures (generated once, shared)
function makeWaterTex() {
  const r = rng(11);
  return ctex(128, 256, (g, w, h) => {
    g.fillStyle = '#46bccf'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x = r() * w, y = r() * h, l = 40 + r() * 90; g.strokeStyle = `rgba(255,255,255,${0.18 + r() * 0.28})`; g.lineWidth = 2 + r() * 3;
      for (const o of [-h, 0, h]) { g.beginPath(); g.moveTo(x, y + o); g.lineTo(x, y + o + l); g.stroke(); }
    }
    for (let i = 0; i < 18; i++) { const x = r() * w, y = r() * h; g.fillStyle = 'rgba(30,110,150,0.25)'; for (const o of [-h, 0, h]) g.fillRect(x, y + o, 3, 60); }
  }, true);
}
function makeGroundTex() {
  return ctex(512, 512, (g, w, h) => {
    g.fillStyle = '#356a5c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,235,205,0.22)'; g.lineWidth = 4;
    for (let i = 0; i < 3; i++) { const s = 400 - i * 120; g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.strokeRect(-s / 2, -s / 2, s, s); g.restore(); }
    g.fillStyle = 'rgba(255,210,235,0.16)'; g.beginPath(); g.arc(w / 2, h / 2, 34, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h);
  }, true);
}
// Anamorphic mural: painted in a vertical "picture plane" at distance D from the seat (alpha cut outside the object)
const MU = { D: 60, W: 34, H: 17 }, MKK = MU.H / 10.5;
function makeMuralTex() {
  const PW = 1024, PH = 448;
  return ctex(PW, PH, (g) => {
    const X = u => (u * MKK + MU.W / 2) / MU.W * PW, Y = v => PH * (1 - (v - FLOOR) / 10.5); // v in world metres at the picture plane
    g.clearRect(0, 0, PW, PH);
    const gnd = FLOOR;
    // contact shadow (an ellipse lying on the ground)
    g.fillStyle = 'rgba(20,10,50,0.45)'; g.beginPath(); g.ellipse(X(0.8), Y(gnd + 0.35), X(5) - X(0), (Y(gnd) - Y(gnd + 0.7)), 0, 0, 7); g.fill();
    // obelisk: 3 shaded faces + pyramid cap
    const hw = 2.0, top = gnd + 7.2, tip = gnd + 9.4;
    const face = (pts, c1, c2) => { const gr = g.createLinearGradient(0, Y(gnd), 0, Y(tip)); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.stroke(); };
    face([[-hw, gnd + .2], [-0.2, gnd], [-0.2, top - .4], [-hw, top]], '#6a3fc0', '#b490ff');
    face([[-0.2, gnd], [hw, gnd + .2], [hw, top], [-0.2, top - .4]], '#3fb6c9', '#a8f2ee');
    face([[-hw, top], [-0.2, top - .4], [0.9, tip], [-0.5, tip - .4]], '#ffd7a0', '#fff0c8');
    face([[-0.2, top - .4], [hw, top], [0.9, tip]], '#f58fb4', '#ffd0e0');
    // orbit ring (ellipse) with front and back halves
    g.lineWidth = 9; g.strokeStyle = '#ffd26a'; g.beginPath(); g.ellipse(X(0), Y(gnd + 4.4), X(5.4) - X(0), (Y(gnd + 3.7) - Y(gnd + 5.1)), 0, 0, Math.PI); g.stroke();
    // floating gems
    const gem = (u, v, r, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(X(u), Y(v + r)); g.lineTo(X(u + r * .7), Y(v)); g.lineTo(X(u), Y(v - r)); g.lineTo(X(u - r * .7), Y(v)); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); };
    gem(-6.2, gnd + 5.8, 0.9, '#7cf0d8'); gem(6.5, gnd + 3.2, 0.7, '#ff9ec2'); gem(4.2, gnd + 8.0, 0.55, '#ffe08a'); gem(-4.5, gnd + 8.6, 0.5, '#b3a0ff');
    // lettering stripe on the ground: "LOOK FROM THE SEAT"
    g.fillStyle = '#fff7e0'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.fillText('STAND IN THE SEAT', X(0), Y(gnd + 0.05) - 8);
    // front half of ring over the obelisk
    g.strokeStyle = '#ffe9a8'; g.lineWidth = 9; g.beginPath(); g.ellipse(X(0), Y(gnd + 4.4), X(5.4) - X(0), (Y(gnd + 3.7) - Y(gnd + 5.1)), 0, Math.PI, Math.PI * 2, true); g.stroke();
  });
}
// Adelson-style checker shadow (linear luminances: light*0.5 == dark). Returns texture + marked cells.
const CK = { Ld: 0.18, Ll: 0.36, N: 8, size: 512 };
function makeCheckerTex() {
  const N = CK.N, S = CK.size, cell = S / N, img = new ImageData(S, S);
  // shadow capsule from cylinder base (cell 1.5,1.5) toward lower right, in pixels
  const p0 = [1.55 * cell, 1.55 * cell], p1 = [5.3 * cell, 5.4 * cell], rad = 0.62 * cell, pen = 0.55 * cell;
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l2 = dx * dx + dy * dy;
  const sh = (x, y) => { let t = clamp(((x - p0[0]) * dx + (y - p0[1]) * dy) / l2, 0, 1); const px = p0[0] + t * dx, py = p0[1] + t * dy; const d = Math.hypot(x - px, y - py); return 1 - smooth(rad, rad + pen, d); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = Math.floor(x / cell), r = Math.floor(y / cell), light = (c + r) % 2 === 0;
    let L = light ? CK.Ll : CK.Ld; L *= 1 - 0.5 * sh(x, y);
    const v = lin2srgb(L), i = (y * S + x) * 4; img.data[i] = v * 0.98; img.data[i + 1] = v; img.data[i + 2] = v * 1.02; img.data[i + 3] = 255;
  }
  // choose A (dark, fully lit) and B (light, fully in shadow), near each other
  let A = null, B = null, best = 1e9;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const light = (c + r) % 2 === 0, cx = (c + .5) * cell, cy = (r + .5) * cell, f = sh(cx, cy);
    if (!light && f < 0.01) for (let r2 = 0; r2 < N; r2++) for (let c2 = 0; c2 < N; c2++) {
      const l2b = (c2 + r2) % 2 === 0, f2 = sh((c2 + .5) * cell, (r2 + .5) * cell);
      if (l2b && f2 > 0.99 && Math.hypot(c2 - 1.5, r2 - 1.5) > 3.2) { const d = Math.hypot(c - c2, r - r2); if (d < best && d > 1.5) { best = d; A = [c, r]; B = [c2, r2]; } }
    }
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); g.putImageData(img, 0, 0);
  g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.fillStyle = 'rgba(255,255,255,0.95)'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  [[A, 'A'], [B, 'B']].forEach(([cb, ch]) => { const x = (cb[0] + .5) * cell, y = (cb[1] + .5) * cell; g.beginPath(); g.arc(x, y, cell * .32, 0, 7); g.stroke(); g.fillText(ch, x, y + 3); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, A, B, cell: 1 / N };
}
function makeMirrorTex() {
  return ctex(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#bfe6ff'); gr.addColorStop(0.5, '#fff1fb'); gr.addColorStop(1, '#a9c7ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // receding nested arches (regress)
    for (let i = 0; i < 9; i++) {
      const s = Math.pow(0.72, i), aw = w * 0.86 * s, ah = h * 0.92 * s, cx = w / 2, cy = h * 0.5 + (1 - s) * h * 0.04;
      g.strokeStyle = `rgba(${90 + i * 12},${60 + i * 8},${150 + i * 8},${0.95 - i * 0.07})`; g.lineWidth = Math.max(2, 14 * s);
      g.beginPath(); g.moveTo(cx - aw / 2, cy + ah / 2); g.lineTo(cx - aw / 2, cy - ah / 2 + aw / 2); g.arc(cx, cy - ah / 2 + aw / 2, aw / 2, Math.PI, 0); g.lineTo(cx + aw / 2, cy + ah / 2); g.stroke();
      g.fillStyle = `rgba(255,255,255,${0.10 - i * 0.008})`; g.fillRect(cx - aw / 2, cy + ah / 2 - 8 * s, aw, 8 * s);
    }
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * .38, 0); g.lineTo(0, h * .5); g.fill();
  });
}
function makeAmesTex(kind) {
  return ctex(512, 512, (g, w, h) => {
    if (kind === 'floor') {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#7a57c9' : '#f6e8d0'; g.fillRect(x * 128, y * 128, 128, 128); }
    } else {
      g.fillStyle = '#f2c7d4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d9a2b8'; g.fillRect(0, h * .72, w, h * .28);
      g.fillStyle = '#8fd6e0'; g.strokeStyle = '#fff'; g.lineWidth = 8;
      for (let i = 0; i < 2; i++) { const x = 60 + i * 230; g.fillRect(x, 70, 160, 260); g.strokeRect(x, 70, 160, 260); g.beginPath(); g.moveTo(x + 80, 70); g.lineTo(x + 80, 330); g.moveTo(x, 200); g.lineTo(x + 160, 200); g.stroke(); }
    }
  }, true);
}
function makeDistortTex() {
  return ctex(768, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d9e8ff'); gr.addColorStop(1, '#b7a7ee'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const fig = (cx, sx, sy) => { // a crude hero silhouette with different proportions per panel
      g.save(); g.translate(cx, h * 0.96); g.scale(sx, sy); g.fillStyle = '#3b2a78';
      g.beginPath(); g.ellipse(0, -330, 38, 46, 0, 0, 7); g.fill(); // head
      g.beginPath(); g.moveTo(-60, -280); g.lineTo(60, -280); g.lineTo(46, -120); g.lineTo(-46, -120); g.fill(); // torso
      g.fillRect(-44, -122, 36, 120); g.fillRect(8, -122, 36, 120); // legs
      g.fillStyle = '#ff7aa8'; g.beginPath(); g.moveTo(-58, -270); g.lineTo(-120, -90); g.lineTo(-30, -150); g.fill(); // cape
      g.restore();
    };
    fig(128, 0.55, 1.45); fig(384, 1.9, 0.55); fig(640, 1.0, 1.0);
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 6; g.beginPath(); g.moveTo(256, 0); g.lineTo(256, h); g.moveTo(512, 0); g.lineTo(512, h); g.stroke();
  });
}

// ------------------------------------------------------------------ build
export const LEVEL = {
  id: 'paradox',
  name: 'Paradox Gardens',
  sub: 'A palace garden where nothing is quite what it looks like',
  color: '#c8a2ff',
  sky: 'dusk',
  build(scene, offset) {
    const root = new THREE.Group(); root.position.copy(offset); scene.add(root);
    const W = v => v.clone().add(offset); // local -> world
    const plaques = [], updaters = [];
    const stairsCenter = pol(-38, 28, 0), aqCenter = pol(40, 31, 0);
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

    // shared materials
    const matStone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.04 });
    const matMarble = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 });
    const matGold = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6 });
    const matNeon = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.6, vertexColors: true });
    const waterTex = makeWaterTex(); waterTex.repeat.set(1, 1);
    const matWater = new THREE.MeshStandardMaterial({ map: waterTex, emissiveMap: waterTex, emissive: 0x3a9fb4, emissiveIntensity: 0.55, roughness: 0.25, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    const groundTex = makeGroundTex(); groundTex.repeat.set(26, 26);
    const matGround = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 });

    function mesh(geo, mat, tag, plaque, title) {
      const m = new THREE.Mesh(geo, mat); if (tag) m.userData.mat = tag;
      if (plaque) { m.userData.plaque = plaque; m.userData.plaqueTitle = title || ''; plaques.push(m); }
      m.frustumCulled = true; root.add(m); return m;
    }

    // ---------------- courtyard ground, palace backdrop, trees, hedges, lanterns
    { const g = new THREE.PlaneGeometry(420, 420); g.rotateX(-Math.PI / 2); const m = mesh(g, matGround, null); m.position.set(0, FLOOR, -70); }
    {
      const a = new Acc();
      // palace backdrop: towers + domes + long wall at f ~ 190
      const rr = rng(5);
      for (let i = -9; i <= 9; i++) {
        const h = 14 + rr() * 22, w = 7 + rr() * 5, x = i * 17 + (rr() - .5) * 6, z = -190 - rr() * 14;
        a.box(x, FLOOR + h / 2, z, w, h, w, i % 2 ? '#efdfe6' : '#f4e9d6');
        a.cyl(x, FLOOR + h + 3, z, 0.2, w * 0.62, 6, 12, '#7f66c8'); a.cyl(x, FLOOR + h + 7, z, 0.05, 0.25, 4, 6, '#f2c14e');
        a.box(x, FLOOR + h * 0.6, z + w / 2 + 0.05, w * 0.3, h * 0.25, 0.2, '#6b8fd0');
      }
      a.box(0, FLOOR + 9, -178, 330, 18, 4, '#e9d6df');
      mesh(a.build(), matMarble, 'marble');
    }
    { // central support column under the dais + dais itself + causeway to the mirror hall
      const a = new Acc();
      a.cyl(0, (FLOOR + -0.5) / 2, 0, 1.3, 1.9, -0.5 - FLOOR, 16, '#d9c7e0');
      a.cyl(0, -0.25, 0, 1.3, 1.15, 0.5, 40, '#efe3d0'); a.cyl(0, -0.01, 0, 1.0, 1.0, 0.04, 40, '#b69bd9');
      for (const an of [-1.25, -0.42, 0.42, 1.25]) { a.cyl(Math.sin(an) * 1.2, 0.22, Math.cos(an) * 1.2, 0.05, 0.05, 0.44, 6, '#f2c14e'); }
      a.box(0, -0.25, 3.3, 2.0, 0.5, 4.0, '#efe3d0');
      mesh(a.build(), matMarble, 'marble');
    }
    { // trees + hedges (instanced)
      const r = rng(77); const n = 70, cone = new THREE.ConeGeometry(2.2, 6, 7); cone.translate(0, 4.5, 0);
      const crown = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), n);
      const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 2.0, 6); trunkG.translate(0, 1.0, 0);
      const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.9 }), n);
      const cols = ['#4aa37a', '#5cc39a', '#3c8d6e', '#8bd6a8', '#c98fc4']; let k = 0;
      while (k < n) {
        const x = (r() - .5) * 280, z = -30 - r() * 135; if (!(x < -48 || x > 78 || z < -130)) continue; // keep the illusion fields clear
        const sc = 0.8 + r() * 1.4; _p.set(x, FLOOR, z); _q.setFromAxisAngle(_s.set(0, 1, 0), r() * 6); _s.set(sc, sc * (0.9 + r() * .5), sc); _m.compose(_p, _q, _s);
        crown.setMatrixAt(k, _m); trunk.setMatrixAt(k, _m); crown.setColorAt(k, _c.set(cols[(r() * cols.length) | 0])); k++;
      }
      crown.instanceMatrix.needsUpdate = true; crown.instanceColor.needsUpdate = true; trunk.instanceMatrix.needsUpdate = true;
      crown.userData.mat = 'foliage'; trunk.userData.mat = 'wood'; crown.frustumCulled = trunk.frustumCulled = true; root.add(crown, trunk);
    }
    { // lanterns (neon) scattered low over the garden + the sky rings
      const r = rng(3), n = 90, g = new THREE.IcosahedronGeometry(0.45, 1);
      const L = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.1 }), n);
      const cs = ['#ffd9a0', '#ffb3d1', '#aeeaff', '#d4c2ff'];
      for (let i = 0; i < n; i++) { _p.set((r() - .5) * 240, FLOOR + 2 + r() * 14, -20 - r() * 150); _q.identity(); _s.setScalar(0.6 + r() * 0.9); _m.compose(_p, _q, _s); L.setMatrixAt(i, _m); L.setColorAt(i, _c.set(cs[i % 4])); L.instanceMatrix.needsUpdate = true; }
      L.instanceColor.needsUpdate = true; L.userData.mat = 'neon'; L.frustumCulled = true; root.add(L);
    }

    // ================================================================ 1. PENROSE-STYLE LOOPING STAIRCASE
    // Descending square ring. The 4th flight ends on a landing pushed along the seat's sight line (farther and bigger)
    // so it lands exactly on top of the first landing in the picture. Real height drop = 4h, real gap = metres.
    const STAIR_Y0 = -14, STAIR_H = 1.8, STAIR_SIDE = 12, STAIR_W = 3.2;
    const stairK = 1 + 4 * STAIR_H / (EYE - STAIR_Y0);
    const stairC = []; { const o = [[-1, 1], [1, 1], [1, -1], [-1, -1]]; for (let i = 0; i < 4; i++) stairC.push(new THREE.Vector3(stairsCenter.x + o[i][0] * STAIR_SIDE / 2, STAIR_Y0 - i * STAIR_H, stairsCenter.z + o[i][1] * STAIR_SIDE / 2)); }
    const stairEnd = warpS(new THREE.Vector3(stairC[0].x, STAIR_Y0, stairC[0].z), stairK, new THREE.Vector3()); // = C0' (y = Y0 - 4h)
    const lampPos = [];
    {
      const a = new Acc(), N = 7;
      const cols = ['#f4e9d8', '#e8d3c0'];
      for (let i = 0; i < 4; i++) {
        const A = stairC[i], B = i < 3 ? stairC[i + 1] : stairEnd, sA = 1, sB = i < 3 ? 1 : stairK;
        const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz), px = dz / len, pz = -dx / len;
        for (let j = 1; j <= N; j++) {
          const t = j / N, tm = (j - 0.5) / N, cx = A.x + dx * tm, cz = A.z + dz * tm, top = A.y + (B.y - A.y) * t, s = sA + (sB - sA) * tm;
          const w = STAIR_W * s, th = 1.0 * s;
          a.box(cx, top - th / 2, cz, w, th, len / N * 1.02, cols[j % 2], ry);
          for (const sg of [-1, 1]) { const o = sg * (w / 2 - 0.16 * s); a.box(cx + px * o, top + 0.32 * s, cz + pz * o, 0.32 * s, 0.64 * s, len / N * 1.02, j % 2 ? '#c7a8dc' : '#d6bde6', ry); }
        }
      }
      // landings with corner posts
      const lands = [stairC[0], stairC[1], stairC[2], stairC[3], stairEnd];
      lands.forEach((P, i) => {
        const s = i === 4 ? stairK : 1, w = STAIR_W * s; a.box(P.x, P.y - 0.35 * s, P.z, w * 1.15, 0.7 * s, w * 1.15, '#f0e0b8');
        for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { a.box(P.x + ox * w * .52, P.y + 0.7 * s, P.z + oz * w * .52, 0.3 * s, 1.4 * s, 0.3 * s, '#c7a8dc'); lampPos.push([P.x + ox * w * .52, P.y + 1.55 * s, P.z + oz * w * .52, 0.2 * s]); }
      });
      // central spire (grounded centre of the ring) + floating base blocks
      a.cyl(stairsCenter.x, (FLOOR + STAIR_Y0 - 3) / 2 - 0.5, stairsCenter.z, 0.5, 1.1, STAIR_Y0 - 3 - FLOOR, 8, '#d6bde6');
      a.cyl(stairsCenter.x, STAIR_Y0 - 1.6 - 2 * STAIR_H, stairsCenter.z, 0.1, 0.9, 3.4, 8, '#f0e0b8');
      const m = mesh(a.build(), matStone, 'stone',
        'Penrose-style stairs: every flight is a normal staircase, yet the loop only closes from this seat. The last flight is farther away and bigger, so it lines up with the first. Your brain checks the parts, not the whole.', 'The Endless Stairs');
    }
    // ================================================================ 2. IMPOSSIBLE AQUEDUCT (water flows down, looks like it climbs back up)
    const AQ_Y0 = -12, AQ_H = 2.0, AQ_SIDE = 13, AQ_W = 3.0;
    const aqK = 1 + 4 * AQ_H / (EYE - AQ_Y0);
    const aqC = []; { const o = [[-1, 1], [1, 1], [1, -1], [-1, -1]]; for (let i = 0; i < 4; i++) aqC.push(new THREE.Vector3(aqCenter.x + o[i][0] * AQ_SIDE / 2, AQ_Y0 - i * AQ_H, aqCenter.z + o[i][1] * AQ_SIDE / 2)); }
    const aqEnd = warpS(new THREE.Vector3(aqC[0].x, AQ_Y0, aqC[0].z), aqK, new THREE.Vector3());
    {
      const a = new Acc(), wa = new Acc(); let dist = 0;
      const prof = [[-1.3, 0], [1.3, 0], [1.3, 1.1], [1.0, 1.1], [1.0, 0.35], [-1.0, 0.35], [-1.0, 1.1], [-1.3, 1.1]]; // u (x w/2.2), v
      const sec = (P, perpx, perpz, s) => prof.map(([u, v]) => new THREE.Vector3(P.x + perpx * u * (AQ_W / 2) * s, P.y + v * 1.4 * s - 0.5 * s, P.z + perpz * u * (AQ_W / 2) * s));
      for (let i = 0; i < 4; i++) {
        const A = aqC[i], B = i < 3 ? new THREE.Vector3(aqC[i + 1].x, A.y, aqC[i + 1].z) : aqEnd; // legs 0-2 level; leg 3 slopes to the aligned end
        const sB = i < 3 ? 1 : aqK, dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz), px = dz / len, pz = -dx / len;
        const SA = sec(A, px, pz, 1), SB = sec(B, px, pz, sB);
        for (let k = 0; k < SA.length; k++) { const k2 = (k + 1) % SA.length; a.quad(SA[k], SA[k2], SB[k2], SB[k], '#e9dcc8', null); }
        // two-sided: duplicate with swapped winding so open channel walls render from both sides
        for (let k = 0; k < SA.length; k++) { const k2 = (k + 1) % SA.length; a.quad(SA[k], SB[k], SB[k2], SA[k2], '#d9c8b4', null); }
        // end blocks + arches support
        const surf = (P, s) => { const c = P.clone(); c.y += 0.55 * s - 0.35 * s + 0.0; return c; };
        // water surface ribbon
        const wl = [[-1, 0], [1, 0]].map(([u]) => ({ A: new THREE.Vector3(A.x + px * u * AQ_W / 2, A.y + 0.55, A.z + pz * u * AQ_W / 2), B: new THREE.Vector3(B.x + px * u * AQ_W / 2 * sB, B.y + 0.55 * sB, B.z + pz * u * AQ_W / 2 * sB) }));
        wa.quad(wl[0].A, wl[1].A, wl[1].B, wl[0].B, '#ffffff', null, [[0, dist / 3], [1, dist / 3], [1, (dist + len) / 3], [0, (dist + len) / 3]]);
        dist += len;
        // cascade at the end of levels 0-2 (a falling sheet down to the next level)
        if (i < 3) {
          const E = new THREE.Vector3(B.x + dx / len * 0.15, B.y, B.z + dz / len * 0.15), D = new THREE.Vector3(E.x, aqC[i + 1].y + 0.55, E.z);
          const t1 = new THREE.Vector3(E.x + px * AQ_W / 2 * 0.95, B.y + 0.55, E.z + pz * AQ_W / 2 * 0.95), t2 = new THREE.Vector3(E.x - px * AQ_W / 2 * 0.95, B.y + 0.55, E.z - pz * AQ_W / 2 * 0.95);
          const b1 = new THREE.Vector3(t1.x, D.y, t1.z), b2 = new THREE.Vector3(t2.x, D.y, t2.z);
          wa.quad(t1, t2, b2, b1, '#ffffff', null, [[0, 1], [1, 1], [1, 0], [0, 0]]);
          // corner basin / pier
          a.box(B.x + dx / len * 0.9, (aqC[i + 1].y) - 0.3, B.z + dz / len * 0.9, AQ_W * 1.9, 0.6, AQ_W * 1.9, '#e9dcc8');
          a.cyl(B.x + dx / len * 0.9, (FLOOR + aqC[i + 1].y - 0.6) / 2, B.z + dz / len * 0.9, 0.55, 0.9, aqC[i + 1].y - 0.6 - FLOOR, 8, '#d9c8d8');
        }
      }
      a.box(aqC[0].x, AQ_Y0 - 0.3, aqC[0].z, AQ_W * 1.9, 0.6, AQ_W * 1.9, '#e9dcc8');
      a.box(aqEnd.x, aqEnd.y - 0.3 * aqK, aqEnd.z, AQ_W * 1.9 * aqK, 0.6 * aqK, AQ_W * 1.9 * aqK, '#e9dcc8');
      mesh(a.build(), matStone, 'stone',
        'Impossible aqueduct: the water only ever falls, yet it seems to climb back to the top. The last channel is farther and larger, so from here it matches the first one.', 'The Uphill Water');
      const wm = mesh(wa.build(), matWater, null); wm.renderOrder = 2;
      updaters.push((dt) => { waterTex.offset.y -= dt * 0.22; if (waterTex.offset.y < -64) waterTex.offset.y += 64; });
    }
    // ================================================================ 3. AMES-STYLE ROOM
    const AMES = { az: 78, win: 14, lam: 0.085, hw: 3, hh: 2 };
    const amesF = new THREE.Vector3(Math.sin(AMES.az * D2R), 0, -Math.cos(AMES.az * D2R)), amesR = new THREE.Vector3(Math.cos(AMES.az * D2R), 0, Math.sin(AMES.az * D2R));
    const amesPt = (x, y, f, out) => { const g = 1 / (1 - AMES.lam * (x + AMES.hw)); return out.set(V.x + amesR.x * x * g + amesF.x * f * g, V.y + y * g, V.z + amesR.z * x * g + amesF.z * f * g); };
    {
      const fz = AMES.win, bk = 21, hw = AMES.hw, hh = AMES.hh;
      const grid = (fn, nu, nv, u0, u1, v0, v1, uvScale) => { // fn(u,v)->ideal [x,y,f]; returns indexed geo
        const pos = [], uv = [], idx = [];
        for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
          const u = u0 + (u1 - u0) * i / nu, v = v0 + (v1 - v0) * j / nv, p = fn(u, v); amesPt(p[0], p[1], p[2], tmpA); pos.push(tmpA.x, tmpA.y, tmpA.z); uv.push(p[3] * uvScale[0], p[4] * uvScale[1]);
        }
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i; idx.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
      };
      const flo = grid((u, v) => [u, -hh, v, u, v], 6, 6, -hw, hw, fz, bk, [0.28, 0.28]);
      const cei = grid((u, v) => [u, hh, v, u, v], 6, 6, -hw, hw, fz, bk, [0.28, 0.28]);
      const back = grid((u, v) => [u, v, bk, u, v], 6, 6, -hw, hw, -hh, hh, [0.17, 0.25]);
      const lw = grid((u, v) => [-hw, u, v, v, u], 6, 6, -hh, hh, fz, bk, [0.17, 0.25]);
      const rw = grid((u, v) => [hw, u, v, v, u], 6, 6, -hh, hh, fz, bk, [0.17, 0.25]);
      const wt = makeAmesTex('wall'), ft = makeAmesTex('floor');
      const roomMat = new THREE.MeshStandardMaterial({ map: wt, emissiveMap: wt, emissive: 0xaaaaaa, emissiveIntensity: 0.45, roughness: 0.8, side: THREE.DoubleSide });
      const floorMat = new THREE.MeshStandardMaterial({ map: ft, emissiveMap: ft, emissive: 0xaaaaaa, emissiveIntensity: 0.5, roughness: 0.6, side: THREE.DoubleSide });
      mesh(mergeG([back, lw, rw]), roomMat, null, 'Ames room (Adelbert Ames Jr., 1940): the right side of this room is farther away and larger. From the seat it looks square, so your brain shrinks the far Glimmerling instead of the room.', 'The Growing Room');
      mesh(mergeG([flo, cei]), floorMat, null);
      // the regular "peephole" wall, placed at the ideal window plane
      const a = new Acc(), fw = fz;
      const wc = new THREE.Vector3(V.x + amesF.x * fw, V.y, V.z + amesF.z * fw), ry = Math.atan2(amesR.z, amesR.x) * -1; // box local x along R
      const rot = -Math.atan2(amesR.z, amesR.x);
      const bigW = 3, bigH = 3;
      const put = (cx, cy, sx, sy, col) => { const o = new THREE.Vector3().copy(wc).addScaledVector(amesR, cx); a.box(o.x, V.y + cy, o.z, sx, sy, 0.8, col, rot); };
      put(-(hw + bigW / 2), 0, bigW, bigH, '#7a62c8'); put(hw + bigW / 2, 0, bigW, bigH, '#7a62c8');
      put(0, hh + bigH / 2, 2 * hw, bigH, '#7a62c8'); put(0, -hh - bigH / 2, 2 * hw, bigH, '#7a62c8');
      // gold frame
      const fr = (cx, cy, sx, sy) => { const o = new THREE.Vector3().copy(wc).addScaledVector(amesR, cx).addScaledVector(amesF, -0.5); a.box(o.x, V.y + cy, o.z, sx, sy, 0.3, '#f2c14e', rot); };
      fr(-hw - 0.2, 0, 0.4, 2 * hh + 0.8); fr(hw + 0.2, 0, 0.4, 2 * hh + 0.8); fr(0, hh + 0.2, 2 * hw + 0.8, 0.4); fr(0, -hh - 0.2, 2 * hw + 0.8, 0.4);
      mesh(a.build(), matStone, 'stone', null);
      // Glimmerling twins (fixed real size). One waits in the near corner, one paces the back wall.
      const gg = []; const body = new THREE.SphereGeometry(0.5, 14, 10); body.scale(1, 1.15, 0.95); body.translate(0, 0.62, 0);
      const ear = (sx) => { const g = new THREE.ConeGeometry(0.17, 0.5, 6); g.translate(0, 0.25, 0); g.rotateZ(-sx * 0.5); g.translate(sx * 0.3, 1.1, 0); return g; };
      const eye = (sx) => { const g = new THREE.SphereGeometry(0.1, 8, 6); g.translate(sx * 0.17, 0.75, 0.43); return g; };
      const gl = new Acc(); gl.geo(body, '#7ff2dc'); gl.geo(ear(-1), '#ff9ec2'); gl.geo(ear(1), '#ff9ec2'); gl.geo(eye(-1), '#2b2258'); gl.geo(eye(1), '#2b2258');
      const glowG = new THREE.SphereGeometry(0.16, 8, 6); glowG.translate(0, 0.35, 0.44); gl.geo(glowG, '#fff4b0');
      const glG = gl.build();
      const matGlim = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x2a8a80, emissiveIntensity: 0.7, roughness: 0.5 });
      const twinA = new THREE.Mesh(glG, matGlim), twinB = new THREE.Mesh(glG, matGlim); twinA.userData.mat = twinB.userData.mat = 'neon';
      const GS = 2.0; twinA.scale.setScalar(GS); twinB.scale.setScalar(GS); twinA.frustumCulled = twinB.frustumCulled = true; root.add(twinA, twinB);
      amesPt(-2.3, -hh, bk - 0.9, tmpA); twinA.position.copy(tmpA);
      const faceY = (m) => { m.rotation.set(0, Math.atan2(V.x - m.position.x, V.z - m.position.z), 0); };
      faceY(twinA);
      updaters.push((dt, t) => { const x = -2.3 + 4.6 * (0.5 + 0.5 * Math.sin(t * 0.3 - 1.57)); amesPt(x, -hh, bk - 0.9, tmpA); twinB.position.copy(tmpA); faceY(twinB); });
    }
    // ================================================================ 4. FORCED-PERSPECTIVE GIANT CHESS
    const chessAz = -10;
    {
      const F = new THREE.Vector3(Math.sin(chessAz * D2R), 0, -Math.cos(chessAz * D2R)), R = new THREE.Vector3(Math.cos(chessAz * D2R), 0, Math.sin(chessAz * D2R));
      const IY = -2.2, CS = 0.6, F0 = 9;                          // ideal tabletop height
      const sOf = f => 2.2 + (f - F0) * (2.0 / (8 * CS));     // growth along the sight line: rank 0 -> x2.2, rank 8 -> x4.2
      const ideal = (b, y, f, out) => { const s = sOf(f); return out.set(V.x + s * (R.x * b + F.x * f), V.y + s * (y - V.y), V.z + s * (R.z * b + F.z * f)); };
      const a = new Acc();
      for (let rk = 0; rk < 8; rk++) for (let c = 0; c < 8; c++) {
        const f0 = F0 + rk * CS, f1 = f0 + CS, b0 = (c - 4) * CS, b1 = b0 + CS, col = (rk + c) % 2 ? '#3a2a6e' : '#f3e7d4', th = 0.2;
        const K = []; for (const y of [IY - th, IY]) for (const [b, f] of [[b0, f0], [b1, f0], [b1, f1], [b0, f1]]) K.push(ideal(b, y, f, new THREE.Vector3()));
        a.solid(K, col);
      }
      for (const b of [-4.06 * CS, 4.06 * CS]) { const K = []; for (const y of [IY - 0.25, IY + 0.02]) for (const [bb, ff] of [[b - 0.07, F0], [b + 0.07, F0], [b + 0.07, F0 + 8 * CS], [b - 0.07, F0 + 8 * CS]]) K.push(ideal(bb, y, ff, new THREE.Vector3())); a.solid(K, '#f2c14e'); }
      const bm = mesh(a.build(), matMarble, 'marble',
        'Forced perspective: these chess pieces get bigger the farther away they stand, so they all look the same size. Your brain guesses size from distance, and we fooled the distance.', 'The Giant Chess Set');
      // pieces
      const prof = (pts, sc) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0] * sc, p[1] * sc)), 14);
      const base = [[0, 0], [.34, 0], [.36, .06], [.3, .12], [.2, .18]];
      const pawn = mergeG([prof([...base, [.15, .34], [.2, .4], [.13, .44], [.2, .52], [.2, .62], [.11, .7], [0, .72]], 1.6)]);
      const rookL = prof([...base, [.2, .5], [.28, .56], [.34, .62], [.34, .98], [.26, .98], [.26, .9], [0, .9]], 1.6);
      const merl = []; for (let i = 0; i < 4; i++) { const g = new THREE.BoxGeometry(0.16, 0.18, 0.16); const an = i * Math.PI / 2 + Math.PI / 4; g.translate(Math.sin(an) * .3, 1.07, Math.cos(an) * .3); merl.push(g); }
      merl.forEach(g => g.scale(1.6, 1.6, 1.6)); const rook = mergeG([rookL, ...merl]);
      const bishL = prof([...base, [.14, .4], [.24, .5], [.3, .66], [.24, .92], [.1, 1.06], [.07, 1.1], [0, 1.12]], 1.6); const bish = mergeG([bishL]);
      const queenL = prof([...base, [.14, .46], [.24, .6], [.3, .8], [.22, .98], [.3, 1.08], [.2, 1.12], [0, 1.12]], 1.6); const qs = []; for (let i = 0; i < 6; i++) { const g = new THREE.ConeGeometry(0.07, 0.24, 5); const an = i / 6 * Math.PI * 2; g.translate(Math.sin(an) * .22, 1.24, Math.cos(an) * .22); g.scale(1.6, 1.6, 1.6); qs.push(g); } const sph = new THREE.SphereGeometry(0.1 * 1.6, 8, 6); sph.translate(0, 1.95, 0); const queen = mergeG([queenL, ...qs, sph]);
      const kingL = prof([...base, [.14, .46], [.26, .6], [.32, .86], [.22, 1.0], [.12, 1.08], [0, 1.1]], 1.6); const c1 = new THREE.BoxGeometry(0.1, 0.42, 0.1); c1.translate(0, 1.18 * 1.6 + 0.1, 0); const c2 = new THREE.BoxGeometry(0.3, 0.1, 0.1); c2.translate(0, 1.2 * 1.6 + 0.1, 0); const king = mergeG([kingL, c1, c2]);
      const palette = ['#f6ead6', '#4a3590'];
      // (type, rank, col, side) lists
      const types = [{ g: pawn, list: [] }, { g: rook, list: [] }, { g: bish, list: [] }, { g: queen, list: [] }, { g: king, list: [] }];
      const order = [1, 2, 2, 3, 4, 2, 2, 1]; // type index per file on the back rank (knights replaced by bishops)
      for (let c = 0; c < 8; c++) { for (const [rk, side] of [[0, 0], [7, 1]]) types[order[c]].list.push([rk, c, side]); for (const [rk, side] of [[1, 0], [6, 1]]) types[0].list.push([rk, c, side]); }
      const tmp = new THREE.Vector3();
      types.forEach((T, ti) => {
        const im = new THREE.InstancedMesh(T.g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 }), T.list.length);
        T.list.forEach(([rk, c, side], i) => {
          const f = F0 + (rk + 0.5) * CS, s = sOf(f); ideal((c - 3.5) * CS, IY, f, tmp);
          _q.setFromAxisAngle(_s.set(0, 1, 0), 0); _s.setScalar(s * CS); _m.compose(tmp, _q, _s); im.setMatrixAt(i, _m); im.setColorAt(i, _c.set(palette[side]));
        });
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.userData.mat = 'marble';
        im.userData.plaque = bm.userData.plaque; im.userData.plaqueTitle = bm.userData.plaqueTitle; plaques.push(im); im.frustumCulled = true; root.add(im);
      });
    }
    // ================================================================ 5. ANAMORPHIC COURTYARD MURAL
    const muralAz = 14;
    {
      const F = new THREE.Vector3(Math.sin(muralAz * D2R), 0, -Math.cos(muralAz * D2R)), R = new THREE.Vector3(Math.cos(muralAz * D2R), 0, Math.sin(muralAz * D2R));
      const H = EYE - FLOOR, rows = 56, cols = 40, pos = [], uv = [], idx = [], v0 = FLOOR, v1 = FLOOR + MU.H;
      for (let j = 0; j <= rows; j++) {
        const v = v0 + (v1 - v0) * j / rows, a = H * MU.D / (EYE - v); // forward distance on the floor whose sight line hits (u, v) on the picture plane
        for (let i = 0; i <= cols; i++) {
          const u = -MU.W / 2 + MU.W * i / cols, b = u * a / MU.D;
          pos.push(V.x + F.x * a + R.x * b, FLOOR + 0.04, V.z + F.z * a + R.z * b); uv.push(i / cols, j / rows);
        }
      }
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i; idx.push(a, a + 1, a + cols + 2, a, a + cols + 2, a + cols + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const tx = makeMuralTex();
      const mat = new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 0.6, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide });
      mesh(g, mat, null, 'Anamorphic floor art (like Julian Beever\'s street drawings): this picture is stretched so it stands upright from exactly one spot, the seat. From anywhere else it is just a smear on the floor.', 'The Standing Painting');
    }
    // ================================================================ 6. VASE OR TWO FACES (figure/ground)
    const vaseAz = -96, vaseP = pol(vaseAz, 14, -0.2);
    {
      const prof = [[.5, 1], [.46, .92], [.4, .86], [.42, .82], [.38, .78], [.22, .72], [.30, .68], [.36, .66], [.30, .62], [.36, .58], [.30, .55], [.36, .50], [.30, .44], [.40, .36], [.46, .28], [.55, .18], [.66, .08], [.72, 0]];
      const sh = new THREE.Shape(); sh.moveTo(prof[0][0], prof[0][1]); for (let i = 1; i < prof.length; i++) sh.lineTo(prof[i][0], prof[i][1]); sh.lineTo(1.25, 0); sh.lineTo(1.25, 1);
      const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }); eg.translate(0, 0, -0.1);
      const sh2 = new THREE.Shape(); sh2.moveTo(-prof[0][0], prof[0][1]); for (let i = 1; i < prof.length; i++) sh2.lineTo(-prof[i][0], prof[i][1]); sh2.lineTo(-1.25, 0); sh2.lineTo(-1.25, 1);
      const eg2 = new THREE.ExtrudeGeometry(sh2, { depth: 0.2, bevelEnabled: false }); eg2.translate(0, 0, -0.1);
      const faces = mergeG([eg, eg2]); faces.scale(3.4, 3.4, 3.4);
      const grp = new THREE.Group(); grp.position.copy(vaseP); root.add(grp);
      const fm = new THREE.Mesh(faces, new THREE.MeshStandardMaterial({ color: 0x2b2258, roughness: 0.6 })); fm.userData.mat = 'clay'; fm.userData.plaque = 'Rubin-style vase or two faces: your brain can see a vase or two profiles, never both at once. Figure and background keep swapping.'; fm.userData.plaqueTitle = 'Vase or Faces?'; plaques.push(fm); fm.frustumCulled = true; grp.add(fm);
      const bk = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.8), new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false })); bk.position.set(0, 1.7, -0.25); bk.frustumCulled = true; grp.add(bk);
      const a = new Acc(); a.cyl(0, -0.9, 0, 1.6, 1.9, 1.6, 8, '#efe3d0'); a.box(0, 1.75, -0.32, 4.8, 4.0, 0.12, '#f2c14e'); { const top = -1.7, bot = FLOOR - vaseP.y; a.cyl(0, (top + bot) / 2, 0, 0.5, 0.9, top - bot, 8, '#d6bde6'); }
      const pm = new THREE.Mesh(a.build(), matMarble); pm.userData.mat = 'marble'; pm.frustumCulled = true; grp.add(pm);
      grp.lookAt(V.x, grp.position.y, V.z);
    }
    // ================================================================ 7. SHADOW-CHECKER TABLE
    const ckAz = -62, ckP = pol(ckAz, 23, 3.6);
    let ckMarks;
    {
      const ck = makeCheckerTex(); ckMarks = ck;
      const grp = new THREE.Group(); grp.position.copy(ckP); root.add(grp);
      const n = new THREE.Vector3().subVectors(V, ckP).normalize(); n.y = n.y * 0.6 + 0.45; n.normalize();
      grp.lookAt(ckP.x + n.x, ckP.y + n.y, ckP.z + n.z);
      const SZ = 7;
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(SZ, SZ), new THREE.MeshBasicMaterial({ map: ck.tex, toneMapped: false }));
      bd.userData.mat = 'checker'; bd.userData.plaque = 'Edward Adelson\'s checker-shadow (1995): squares A and B are exactly the same shade of grey. Your brain subtracts the shadow, so B looks lighter. Watch the bar prove it.'; bd.userData.plaqueTitle = 'Same Grey?'; plaques.push(bd); bd.frustumCulled = true; grp.add(bd);
      const a = new Acc(); a.box(0, 0, -0.18, SZ + 0.5, SZ + 0.5, 0.3, '#f2c14e');
      const cy = new THREE.CylinderGeometry(0.42, 0.42, 1.5, 16); cy.rotateX(Math.PI / 2); cy.translate((1.55 / CK.N - 0.5) * SZ, (0.5 - 1.55 / CK.N) * SZ, 0.75); a.geo(cy, '#9a97a6');
      const pm = new THREE.Mesh(a.build(), matMarble); pm.userData.mat = 'marble'; pm.frustumCulled = true; grp.add(pm);
      { const p2 = new Acc(); const top = ckP.y - SZ / 2 - 0.5; p2.cyl(ckP.x, (top + FLOOR) / 2, ckP.z, 0.35, 0.7, top - FLOOR, 8, '#d6bde6'); mesh(p2.build(), matMarble, 'marble'); }
      // proof bar in exactly the same grey as A and B
      const cell = SZ / CK.N, Apos = new THREE.Vector3((ck.A[0] + .5) * cell - SZ / 2, SZ / 2 - (ck.A[1] + .5) * cell, 0.04), Bpos = new THREE.Vector3((ck.B[0] + .5) * cell - SZ / 2, SZ / 2 - (ck.B[1] + .5) * cell, 0.04);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(CK.Ld, CK.Ld, CK.Ld, THREE.LinearSRGBColorSpace), toneMapped: false }));
      const dir = new THREE.Vector3().subVectors(Bpos, Apos), len = dir.length(); bar.rotation.z = Math.atan2(dir.y, dir.x); bar.frustumCulled = true; bar.visible = false; grp.add(bar);
      updaters.push((dt, t) => {
        const p = (t % 26);
        let k = p < 3 ? smooth(0, 3, p) : p < 10 ? 1 : p < 13 ? 1 - smooth(10, 13, p) : 0;
        if (k <= 0.001) { bar.visible = false; return; }
        bar.visible = true; bar.scale.x = len * k; bar.position.set(Apos.x + dir.x * k / 2, Apos.y + dir.y * k / 2, 0.04);
      });
    }
    // ================================================================ 8. MIRROR HALL (behind the seat)
    const hallZ0 = 5.5, hallL = 26, hallW = 8;
    {
      const mt = makeMirrorTex(); mt.wrapS = mt.wrapT = THREE.RepeatWrapping; mt.repeat.set(1, 1);
      const mt2 = mt.clone(); mt2.needsUpdate = true; mt2.repeat.set(5, 1);
      const mm = new THREE.MeshStandardMaterial({ map: mt, emissiveMap: mt, emissive: 0x8a8ac0, emissiveIntensity: 0.45, roughness: 0.12, metalness: 0.5 });
      const ms = new THREE.MeshStandardMaterial({ map: mt2, emissiveMap: mt2, emissive: 0x8a8ac0, emissiveIntensity: 0.45, roughness: 0.12, metalness: 0.5 });
      const long = new THREE.PlaneGeometry(hallL, 5.6); const g1 = long.clone(); g1.rotateY(Math.PI / 2); g1.translate(-hallW / 2 + 0.05, 3.1, hallZ0 + hallL / 2); const g2 = long.clone(); g2.rotateY(-Math.PI / 2); g2.translate(hallW / 2 - 0.05, 3.1, hallZ0 + hallL / 2);
      const side = mergeG([g1, g2]); // uv.x runs along the hall (0..1 -> 5 repeats via mt2)
      mesh(side, ms, 'mirror', 'Hall of mirrors: reflections repeat the same view again and again, and your brain reads that as a corridor that never ends. (These panels are painted, not real reflections.)', 'The Endless Hall');
      const endG = new THREE.PlaneGeometry(hallW - 0.2, 5.6); endG.rotateY(Math.PI); endG.translate(0, 3.1, hallZ0 + hallL - 0.05);
      mesh(endG, mm, 'mirror');
      const a = new Acc();
      a.box(0, -0.25, hallZ0 + hallL / 2, hallW + 1.4, 0.5, hallL, '#efe3d0');
      for (const z of [hallZ0 + 5, hallZ0 + 20]) a.cyl(0, (FLOOR - 0.5) / 2, z, 1.4, 2.2, -0.5 - FLOOR, 10, '#d6bde6');
      for (const sg of [-1, 1]) { a.box(sg * (hallW / 2 + 0.35), 3.2, hallZ0 + hallL / 2, 0.7, 6.4, hallL, '#d6bde6'); }
      for (let i = 0; i < 7; i++) { const z = hallZ0 + 1.5 + i * 3.8; for (const sg of [-1, 1]) a.cyl(sg * (hallW / 2 - 0.1), 3.0, z, 0.22, 0.26, 6.0, 8, '#f2c14e'); }
      // checker marble floor strips
      for (let i = 0; i < 13; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) a.box(-hallW / 2 + 1 + j * 2, 0.012, hallZ0 + 1 + i * 2, 2, 0.02, 2, '#b69bd9');
      // barrel vault roof
      const mm1 = new THREE.Mesh(a.build(), matMarble); mm1.userData.mat = 'marble'; mm1.frustumCulled = true; root.add(mm1);
      const vg = new THREE.CylinderGeometry(hallW / 2 + 0.7, hallW / 2 + 0.7, hallL, 24, 1, true, Math.PI / 2, Math.PI); vg.rotateX(Math.PI / 2); vg.translate(0, 6.2, hallZ0 + hallL / 2);
      const vm = new THREE.Mesh(vg, new THREE.MeshStandardMaterial({ color: 0xe8d6f0, roughness: 0.6, side: THREE.DoubleSide })); vm.userData.mat = 'stone'; vm.frustumCulled = true; root.add(vm);
      // arch ribs (instanced, gold)
      const rib = new THREE.TorusGeometry(hallW / 2 + 0.7, 0.14, 6, 18, Math.PI); rib.translate(0, 6.2, 0);
      const rm = new THREE.InstancedMesh(rib, new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.6, roughness: 0.35 }), 7);
      for (let i = 0; i < 7; i++) { _p.set(0, 0, hallZ0 + 1.5 + i * 3.8); _q.identity(); _s.set(1, 1, 1); _m.compose(_p, _q, _s); rm.setMatrixAt(i, _m); }
      rm.userData.mat = 'brass'; rm.frustumCulled = true; root.add(rm);
    }
    // ================================================================ 9. HOLLOW MASK (slowly sways; the face seems to follow you)
    const maskP = pol(-4, 118, 12);
    let maskGroup;
    {
      const nr = 22, na = 56, S = 11, pos = [], col = [], idx = [], ER = 1.35;
      const F = (x, y) => {
        const r2 = x * x + (y / ER) * (y / ER);
        let f = 0.55 * Math.max(0, 1 - r2);
        f += 0.42 * gauss(x, y, 0, -0.02, 0.12, 0.42) + 0.2 * gauss(x, y, 0, -0.4, 0.2, 0.11);
        for (const sx of [-1, 1]) { f += 0.12 * gauss(x, y, sx * 0.38, 0.45, 0.28, 0.07) - 0.17 * gauss(x, y, sx * 0.38, 0.28, 0.17, 0.1) + 0.12 * gauss(x, y, sx * 0.5, -0.3, 0.2, 0.25); }
        f += 0.13 * gauss(x, y, 0, -0.62, 0.3, 0.07) - 0.05 * gauss(x, y, 0, -0.72, 0.25, 0.025) + 0.15 * gauss(x, y, 0, -1.0, 0.28, 0.18);
        return f;
      };
      const base = new THREE.Color('#f3e6d8'), lip = new THREE.Color('#e48aa0'), eyeC = new THREE.Color('#6a4a9a'), gold = new THREE.Color('#f2c14e');
      for (let j = 0; j <= nr; j++) for (let i = 0; i <= na; i++) {
        const rr = j / nr * 1.12, an = i / na * Math.PI * 2, x = rr * Math.cos(an), y = rr * Math.sin(an) * ER, rc = Math.min(rr, 1);
        const z = -F(rc * Math.cos(an), rc * Math.sin(an) * ER) * S * 0.9;
        pos.push(x * S, y * S, z);
        const c = base.clone(); c.lerp(lip, clamp(gauss(x, y, 0, -0.64, 0.3, 0.09) * 1.2, 0, 1)); for (const sx of [-1, 1]) c.lerp(eyeC, clamp(gauss(x, y, sx * 0.38, 0.3, 0.16, 0.07) * 1.1, 0, 1)); if (rr > 0.96) c.lerp(gold, clamp((rr - 0.96) / 0.08, 0, 1));
        col.push(c.r, c.g, c.b);
      }
      for (let j = 0; j < nr; j++) for (let i = 0; i < na; i++) { const a = j * (na + 1) + i, b = a + 1, c = a + na + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
      maskGroup = new THREE.Group(); maskGroup.position.copy(maskP); root.add(maskGroup);
      const mk = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
      mk.userData.mat = 'clay'; mk.userData.plaque = 'Hollow-face illusion (Richard Gregory): this mask is a dish pressed inward, but your brain expects faces to bulge out, so the face seems to turn and follow you.'; mk.userData.plaqueTitle = 'The Hollow Mask'; plaques.push(mk); mk.frustumCulled = true; maskGroup.add(mk);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(S * 1.35, 0.35, 8, 56), new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.4 })); ring.userData.mat = 'brass'; ring.position.z = -S * 0.55; ring.frustumCulled = true; maskGroup.add(ring);
      maskGroup.lookAt(V.x, maskGroup.position.y, V.z); const baseRy = maskGroup.rotation.y; maskGroup.userData.baseRy = baseRy;
      updaters.push((dt, t) => { maskGroup.rotation.y = baseRy + 0.7 * Math.sin(t * 0.5); });
    }
    // ================================================================ 10. THE DISTORTER ARENA (mini boss)
    const arenaC = pol(150, 62, -10);
    const distort = [];
    {
      const g = new THREE.Group(); g.position.copy(arenaC); root.add(g);
      const a = new Acc(); a.cyl(0, -0.4, 0, 14, 13, 0.8, 40, '#efe3d0'); a.cyl(0, 0.02, 0, 9, 9, 0.08, 40, '#b69bd9'); a.cyl(0, 0.04, 0, 4, 4, 0.08, 40, '#f2c14e'); { const bot = FLOOR - arenaC.y; a.cyl(0, (bot - 0.8) / 2, 0, 3, 6, -0.8 - bot, 10, '#d6bde6'); }
      for (let i = 0; i < 6; i++) { const an = (i + .5) / 6 * Math.PI * 2; a.cyl(Math.sin(an) * 13.4, 5.2, Math.cos(an) * 13.4, 0.45, 0.55, 10.4, 8, '#f2c14e'); }
      const am = new THREE.Mesh(a.build(), matMarble); am.userData.mat = 'marble'; am.frustumCulled = true; g.add(am);
      const dt = makeDistortTex(); const dm = new THREE.MeshStandardMaterial({ map: dt, emissiveMap: dt, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.4, side: THREE.DoubleSide });
      for (let k = 0; k < 3; k++) {
        const parts = [];
        for (const side of [0, 1]) {
          const idx = k + side * 3, an = idx / 6 * Math.PI * 2 + 0.52 - 0.0, wd = 7.4, ht = 9.2;
          const pg = new THREE.PlaneGeometry(wd, ht, 8, 12); const p = pg.attributes.position, u = pg.attributes.uv;
          for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setX(i, x + Math.sin(y * 0.9 + k) * 0.25 * (k === 2 ? 1 : 0.3)); p.setZ(i, Math.sin(x * 0.7 + y * 0.4) * 0.35); u.setX(i, (k + u.getX(i)) / 3); }
          pg.translate(0, ht / 2 + 0.2, 0); pg.rotateY(Math.PI + an); const t = new THREE.Matrix4().makeTranslation(Math.sin(an) * 12.2, 0, Math.cos(an) * 12.2); pg.applyMatrix4(t);
          // face centre: rotate so the panel faces the arena centre
          parts.push(pg);
        }
        const mg = mergeG(parts); const pm = new THREE.Mesh(mg, dm); pm.userData.mat = 'mirror'; pm.userData.plaque = 'Fun-house mirrors stretch and squash a reflection. The mirror changes the picture, never the person.'; pm.userData.plaqueTitle = 'Warped Mirrors'; pm.frustumCulled = true; g.add(pm); plaques.push(pm); distort.push(pm);
      }
      updaters.push((dt2, t) => { for (let k = 0; k < 3; k++) distort[k].scale.y = 1 + 0.07 * Math.sin(t * 0.55 + k * 2.1); });
    }
    // ---------------- lamps on stairs (neon instanced)
    {
      const n = lampPos.length, im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0 }), n);
      lampPos.forEach((l, i) => { _p.set(l[0], l[1], l[2]); _q.identity(); _s.setScalar(l[3]); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); im.setColorAt(i, _c.set('#ffe6a8')); });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.userData.mat = 'neon'; im.frustumCulled = true; root.add(im);
    }
    // slow floating gold rings around the mask (<= 0.05 Hz)
    const rings = [];
    for (let i = 0; i < 2; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(17 + i * 5, 0.22, 6, 64), new THREE.MeshStandardMaterial({ color: i ? 0xff9ec2 : 0x7cf0d8, emissive: i ? 0xff9ec2 : 0x7cf0d8, emissiveIntensity: 0.55, roughness: 0.5 })); r.userData.mat = 'neon'; r.position.copy(maskP); r.rotation.x = 1.2 + i * 0.4; r.frustumCulled = true; root.add(r); rings.push(r); }
    updaters.push((dt, t) => { rings[0].rotation.z = t * 0.05; rings[1].rotation.z = -t * 0.04; });

    // ------------------------------------------------------------------ level API
    const look = W(pol(0, 60, -9));
    const stairLand = W(stairEnd.clone().add(new THREE.Vector3(0, 1.6 * stairK, 0)));
    return {
      root,
      update(dt, t) { for (let i = 0; i < updaters.length; i++) updaters[i](dt, t); },
      arrival: { pos: W(V), look },
      raids: [
        { center: W(pol(-26, 66, -7)), foes: 5, name: 'The Ill-Fit Court' },
        { center: W(pol(34, 80, -6)), foes: 6, name: 'Parallax Patrol' }
      ],
      rescues: [W(pol(-80, 12, 1.5)), W(pol(52, 40, -6))],
      secrets: [stairLand, W(new THREE.Vector3(-3.1, 1.2, hallZ0 + hallL - 1.6)), W(maskP.clone().add(new THREE.Vector3(0, -4.2, 0)).lerp(V, 0.06))],
      facts: [
        'The Ames room, patented by Adelbert Ames Jr. in 1940, makes a person look huge or tiny because your brain assumes the room is a normal rectangle.',
        'In Edward Adelson\'s 1995 checker-shadow illusion, squares A and B are exactly the same shade of grey; the shadow fools your brain.',
        'In the hollow-face illusion, studied by Richard Gregory, a mask pressed inward still looks like a bulging face, because the brain strongly expects faces to bulge out.'
      ],
      lesson: 'How you see yourself is a viewpoint, not the whole truth: change the angle and you may find you are bigger than you thought.',
      miniBoss: { center: W(arenaC.clone().add(new THREE.Vector3(0, 2.2, 0))), name: 'The Distorter', look: 'A fun-house-mirror Echo whose arms, head and legs stretch and squash as it moves' },
      plaques // meshes with userData.plaque for gaze 'How your brain got tricked' cards
    };
  }
};
