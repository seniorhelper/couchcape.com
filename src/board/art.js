// Skyboard art: the table, the 32-space ring track, and the living mini-Aurelia in the middle.
// Everything procedural. Static parts are merged per material; repeats are instanced.
// Districts brighten with light and silver over when Lord Narrowmere spreads (one shared shader program).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DISTRICTS, TRACK, SPACE_INFO } from './content.js';
import { drawIcon } from './ui.js';

export const TRACK_R = 0.45, TILE_R = 0.034, TABLE_R = 0.585, CLOCK_R = 0.538, ISLAND_R = 0.33;
export const spaceAngle = i => i / TRACK.length * Math.PI * 2;
export function spacePos(i, out = new THREE.Vector3()) { const a = spaceAngle(i); return out.set(Math.sin(a) * TRACK_R, 0.014, Math.cos(a) * TRACK_R); }
export const districtAngle = d => (d + 0.5) / DISTRICTS.length * Math.PI * 2;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

// ---------- geometry builder: colored parts merged into one geometry ----------
class Parts {
  constructor() { this.list = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const g = geo.index ? geo.clone() : geo.clone();
    g.deleteAttribute('uv'); if (g.attributes.uv1) g.deleteAttribute('uv1');
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); g.applyMatrix4(_m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3); _c.set(color);
    // gentle baked gradient: darker at the bottom of each part, for a painted, lit look
    g.computeBoundingBox(); const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, pos = g.attributes.position;
    for (let i = 0; i < n; i++) { const t = y1 > y0 ? (pos.getY(i) - y0) / (y1 - y0) : 1, k = 0.78 + 0.22 * t; col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push(g.index ? g : g); return this;
  }
  merge() { const idx = this.list.filter(g => g.index), non = this.list.filter(g => !g.index); const all = idx.concat(non.map(g => { g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i)); return g; })); const m = mergeGeometries(all, false); m.computeBoundingSphere(); return m; }
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 14),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  sph: new THREE.SphereGeometry(1, 12, 9),
  oct: new THREE.OctahedronGeometry(1, 0),
  ico: new THREE.IcosahedronGeometry(1, 0),
  tor: new THREE.TorusGeometry(1, 0.22, 6, 18)
};

// District material: vertex colors + uniforms for light level and silvering (shared program).
function districtMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, emissive: new THREE.Color(color), emissiveIntensity: 0 });
  m.userData.u = { uSilver: { value: 0 }, uLit: { value: 0.6 } };
  m.onBeforeCompile = sh => {
    sh.uniforms.uSilver = m.userData.u.uSilver; sh.uniforms.uLit = m.userData.u.uLit;
    sh.fragmentShader = 'uniform float uSilver; uniform float uLit;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb *= 0.55 + 0.45 * uLit;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.50 + lum * 0.45) * vec3(0.86, 0.9, 1.0), uSilver);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.22, uSilver);');
  };
  m.customProgramCacheKey = () => 'skyboard-district';
  return m;
}

// ---------- district builders (local frame: +Z points outward from the island centre) ----------
function tree(P, x, z, s, leaf) { P.add(G.cyl, '#8a5a3c', x, 0.012 * s, z, 0, 0, 0, 0.0035 * s, 0.024 * s, 0.0035 * s); P.add(G.sph, leaf, x, 0.03 * s, z, 0, 0, 0, 0.014 * s); P.add(G.sph, leaf, x + 0.006 * s, 0.038 * s, z - 0.004 * s, 0, 0, 0, 0.01 * s); }
const BUILD = {
  bloom(P) {
    P.add(G.cyl, '#7fcf6a', 0, 0.006, 0, 0, 0, 0, 0.075, 0.012, 0.075); P.add(G.cyl, '#ffb3d1', 0, 0.0125, 0, 0, 0, 0, 0.076, 0.002, 0.076);
    P.add(G.cyl, '#8fe07a', -0.01, 0.018, -0.01, 0, 0, 0, 0.05, 0.012, 0.05); P.add(G.cyl, '#ffc4dc', -0.01, 0.0245, -0.01, 0, 0, 0, 0.051, 0.002, 0.051);
    P.add(G.cyl, '#9be886', -0.016, 0.03, -0.016, 0, 0, 0, 0.028, 0.012, 0.028);
    // gazebo on top
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P.add(G.cyl, '#fff6ee', -0.016 + Math.cos(a) * 0.014, 0.046, -0.016 + Math.sin(a) * 0.014, 0, 0, 0, 0.0016, 0.022, 0.0016); }
    P.add(G.cone, '#ff7fb8', -0.016, 0.064, -0.016, 0, 0, 0, 0.022, 0.016, 0.022);
    const pinks = ['#ff8fc4', '#ffa6d2', '#ff79b6', '#ffc0de'];
    [[0.05, 0.03], [-0.05, 0.035], [0.035, -0.05], [-0.055, -0.03], [0.06, -0.01], [0.01, 0.06], [-0.03, 0.055]].forEach(([x, z], i) => tree(P, x, z, i < 3 ? 1.1 : 0.85, pinks[i % 4]));
  },
  clockwork(P) {
    const towers = [[0, 0, 0.13, 0.016], [-0.04, 0.03, 0.09, 0.012], [0.042, 0.025, 0.1, 0.013], [0.01, -0.045, 0.075, 0.011]];
    P.add(G.cyl, '#cdb78f', 0, 0.005, 0, 0, 0, 0, 0.075, 0.01, 0.075);
    for (const [x, z, h, r] of towers) {
      P.add(G.cyl6, '#e9dcc0', x, h / 2, z, 0, 0, 0, r, h, r); P.add(G.cyl6, '#b88a3c', x, h * 0.62, z, 0, 0, 0, r * 1.12, 0.004, r * 1.12);
      P.add(G.cone, '#3e6aa8', x, h + r * 1.2, z, 0, 0, 0, r * 1.25, r * 2.6, r * 1.25); P.add(G.sph, '#ffd77a', x, h + r * 2.6, z, 0, 0, 0, 0.003);
      P.add(G.cyl, '#fff2c8', x, h * 0.8, z + r * 0.9, Math.PI / 2, 0, 0, r * 0.55, 0.002, r * 0.55);
    }
  },
  prism(P) {
    P.add(G.cyl6, '#a99be0', 0, 0.03, -0.03, 0, 0.3, 0, 0.055, 0.06, 0.03); P.add(G.cyl6, '#c7bdf2', 0, 0.061, -0.03, 0, 0.3, 0, 0.056, 0.004, 0.031);
    P.add(G.cyl, '#5fb7ff', 0, 0.004, 0.025, 0, 0, 0, 0.05, 0.006, 0.035);
    const crys = ['#c9a7ff', '#a98bff', '#e2ccff', '#9b7bff'];
    [[-0.045, 0.08, -0.03, 0.03], [-0.03, 0.09, -0.045, 0.04], [0.04, 0.085, -0.035, 0.035], [0.055, 0.04, 0.0, 0.03], [-0.06, 0.03, 0.01, 0.028], [0.025, 0.095, -0.05, 0.026], [0.06, 0.012, 0.04, 0.022]]
      .forEach(([x, y, z, h], i) => P.add(G.oct, crys[i % 4], x, y * 0.8 + h * 0.4, z, 0.1 * i, i, 0.15, h * 0.32, h * 1.1, h * 0.32));
  },
  skyharbor(P) {
    P.add(G.cyl, '#d9cdb5', 0, 0.006, 0, 0, 0, 0, 0.07, 0.012, 0.07);
    P.add(G.box, '#9a6b47', 0, 0.03, 0.035, 0, 0, 0, 0.11, 0.004, 0.03); // dock deck
    for (let i = -2; i <= 2; i++) P.add(G.cyl, '#7a5238', i * 0.025, 0.016, 0.048, 0, 0, 0, 0.0025, 0.028, 0.0025);
    P.add(G.cyl, '#f4f0e6', -0.02, 0.05, -0.02, 0, 0, 0, 0.012, 0.1, 0.012); P.add(G.cyl, '#4fc3ff', -0.02, 0.1, -0.02, 0, 0, 0, 0.014, 0.012, 0.014); P.add(G.cone, '#ff6b6b', -0.02, 0.114, -0.02, 0, 0, 0, 0.016, 0.018, 0.016);
    P.add(G.cyl, '#e8e2d2', 0.035, 0.04, -0.025, 0, 0, 0, 0.003, 0.08, 0.003); P.add(G.box, '#4fc3ff', 0.035, 0.07, -0.025, 0, 0, 0, 0.03, 0.004, 0.004);
    P.add(G.box, '#ffffff', 0.04, 0.012, 0.005, 0, 0.3, 0, 0.03, 0.02, 0.022); P.add(G.cone4, '#4f86c9', 0.04, 0.03, 0.005, 0, 0.3 + Math.PI / 4, 0, 0.024, 0.016, 0.024);
  },
  lantern(P) {
    P.add(G.cyl, '#d9b58f', 0, 0.005, 0, 0, 0, 0, 0.075, 0.01, 0.075);
    const roofs = ['#ff9a3c', '#ff6f6f', '#ffd24d', '#ff9a3c', '#ff7fb8'];
    [[-0.04, 0.02], [0.0, 0.045], [0.04, 0.02], [-0.025, -0.03], [0.03, -0.035]].forEach(([x, z], i) => {
      P.add(G.box, '#fff1dc', x, 0.02, z, 0, i, 0, 0.026, 0.02, 0.022); P.add(G.cone4, roofs[i], x, 0.038, z, 0, i + Math.PI / 4, 0, 0.024, 0.018, 0.024);
    });
    P.add(G.cyl, '#7a5238', 0, 0.04, 0, 0, 0, 0, 0.0025, 0.07, 0.0025);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P.add(G.sph, i % 2 ? '#ffd27a' : '#ffb04d', Math.cos(a) * 0.028, 0.062 - (i % 2) * 0.006, Math.sin(a) * 0.028, 0, 0, 0, 0.0055); P.add(G.cyl, '#5a3a28', Math.cos(a) * 0.014, 0.072, Math.sin(a) * 0.014, 0, -a, Math.PI / 2 - 0.25, 0.0008, 0.03, 0.0008); }
  },
  hearth(P) {
    P.add(G.cyl, '#6fbf5a', 0, 0.005, 0, 0, 0, 0, 0.075, 0.01, 0.075);
    [[-0.035, 0.025, 0.4], [0.03, 0.035, -0.3], [0.04, -0.03, 0.9], [-0.03, -0.035, -0.6]].forEach(([x, z, r], i) => {
      P.add(G.box, '#f3e2c4', x, 0.022, z, 0, r, 0, 0.03, 0.024, 0.024);
      P.add(G.cone4, ['#b6533a', '#c8693c', '#9c4a3a', '#d07a3a'][i], x, 0.044, z, 0, r + Math.PI / 4, 0, 0.026, 0.02, 0.026);
      P.add(G.box, '#8f8a86', x + 0.008, 0.05, z, 0, r, 0, 0.005, 0.014, 0.005);
      P.add(G.box, '#ffd98a', x, 0.02, z + 0.0125, 0, r, 0, 0.007, 0.008, 0.002);
    });
    P.add(G.cyl, '#7a4a30', 0, 0.035, 0, 0, 0, 0, 0.007, 0.07, 0.007);
    P.add(G.sph, '#3fa34d', 0, 0.08, 0, 0, 0, 0, 0.032, 0.026, 0.032); P.add(G.sph, '#58c460', 0.012, 0.095, 0.006, 0, 0, 0, 0.022); P.add(G.sph, '#4cb556', -0.014, 0.09, -0.008, 0, 0, 0, 0.02);
  }
};

// ---------- canvas helpers ----------
function canvasTex(w, h, fn, repeat) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t; }

export function buildBoardArt() {
  const root = new THREE.Group(); root.name = 'skyboard';
  const A = { root, districts: [], anim: [] };

  // ----- table: wood top + brass rim + clock rail (merged per material) -----
  const wood = new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W / 2); gr.addColorStop(0, '#c98d5c'); gr.addColorStop(1, '#8e5a37'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.16; for (let r = 12; r < W / 2; r += 9 + (r % 7)) { g.strokeStyle = r % 2 ? '#5a3520' : '#e8b58a'; g.lineWidth = 2 + (r % 3); g.beginPath(); g.arc(W / 2 + Math.sin(r) * 3, H / 2 + Math.cos(r) * 3, r, 0, 7); g.stroke(); }
  }), roughness: 0.55, metalness: 0.0 });
  const topGeo = new THREE.CylinderGeometry(TABLE_R, TABLE_R - 0.01, 0.03, 64); topGeo.translate(0, -0.015, 0);
  const top = new THREE.Mesh(topGeo, wood); top.userData.mat = 'wood'; root.add(top);
  const brass = new THREE.MeshStandardMaterial({ color: 0xe2b860, roughness: 0.35, metalness: 0.75, emissive: 0x3a2400, emissiveIntensity: 0.25 });
  const rimG = new THREE.TorusGeometry(TABLE_R, 0.011, 8, 72); rimG.rotateX(Math.PI / 2);
  const railG = new THREE.TorusGeometry(CLOCK_R, 0.004, 6, 72, Math.PI * 0.75); railG.rotateX(Math.PI / 2); railG.rotateY(Math.PI * 0.875); railG.translate(0, 0.004, 0);
  const leg = new THREE.CylinderGeometry(0.06, 0.12, 0.6, 16); leg.translate(0, -0.33, 0);
  const rim = new THREE.Mesh(mergeGeometries([rimG, railG].map(g => { g.deleteAttribute('uv'); return g; })), brass); rim.userData.mat = 'brass'; root.add(rim);
  const legM = new THREE.Mesh(leg, wood); root.add(legM);

  // ----- track: road ring + instanced tiles + icon decal -----
  const roadG = new THREE.RingGeometry(TRACK_R - 0.045, TRACK_R + 0.045, 96, 1); roadG.rotateX(-Math.PI / 2); roadG.translate(0, 0.0015, 0);
  const road = new THREE.Mesh(roadG, new THREE.MeshStandardMaterial({ color: 0xf4ead8, roughness: 0.8 })); road.userData.mat = 'stone'; root.add(road);
  const tileG = new THREE.CylinderGeometry(TILE_R, TILE_R * 1.08, 0.012, 24); tileG.translate(0, 0.006, 0);
  const tiles = new THREE.InstancedMesh(tileG, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }), TRACK.length);
  TRACK.forEach((t, i) => { spacePos(i, _p); _p.y = 0; _m.makeTranslation(_p.x, 0, _p.z); tiles.setMatrixAt(i, _m); tiles.setColorAt(i, _c.set(SPACE_INFO[t].color)); });
  tiles.userData.mat = 'clay'; root.add(tiles); A.tiles = tiles;
  const IR = TRACK_R + 0.05, decalTex = canvasTex(1024, 1024, (g, W) => {
    TRACK.forEach((t, i) => { const a = spaceAngle(i), x = Math.sin(a) * TRACK_R, z = Math.cos(a) * TRACK_R; const cx = (x / IR + 1) / 2 * W, cy = (z / IR + 1) / 2 * W;
      g.globalAlpha = 0.25; drawIcon(g, SPACE_INFO[t].icon, cx + 2, cy + 3, 46, '#3a2440'); g.globalAlpha = 1; drawIcon(g, SPACE_INFO[t].icon, cx, cy, 46, '#ffffff'); });
  });
  const decalG = new THREE.RingGeometry(TRACK_R - 0.045, IR, 96, 1); decalG.rotateX(-Math.PI / 2); decalG.translate(0, 0.0125, 0);
  root.add(new THREE.Mesh(decalG, new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, toneMapped: false })));

  // ----- water moat + island -----
  const waterTex = canvasTex(256, 256, (g, W) => { g.fillStyle = '#5fc8ff'; g.fillRect(0, 0, W, W); g.globalAlpha = 0.35; g.strokeStyle = '#ffffff'; g.lineWidth = 3; for (let i = 0; i < 14; i++) { g.beginPath(); const y = (i * 37) % W; g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y - 10, W * 0.6, y + 10, W, y); g.stroke(); } }, true);
  waterTex.repeat.set(4, 4);
  const waterG = new THREE.RingGeometry(ISLAND_R - 0.01, TRACK_R - 0.05, 72, 1); waterG.rotateX(-Math.PI / 2); waterG.translate(0, 0.004, 0);
  const water = new THREE.Mesh(waterG, new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.15, metalness: 0.1, emissive: 0x1b6fa0, emissiveIntensity: 0.25 })); water.userData.mat = 'water'; root.add(water); A.waterTex = waterTex;
  const I = new Parts();
  I.add(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R * 0.9, 0.024, 48), '#8ad46e', 0, 0.012, 0);
  I.add(new THREE.CylinderGeometry(ISLAND_R * 0.9, ISLAND_R * 0.55, 0.03, 48), '#9c7a5c', 0, -0.0, 0);
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2 + 0.1, r = ISLAND_R * (0.97 + (i % 3) * 0.01); I.add(G.ico, i % 2 ? '#a7a39b' : '#c1bcb2', Math.sin(a) * r, 0.014, Math.cos(a) * r, i, i * 2, 0, 0.012 + (i % 4) * 0.003); }
  // central plaza and paths to each district
  I.add(new THREE.CylinderGeometry(0.075, 0.08, 0.008, 32), '#f2e6d0', 0, 0.027, 0);
  for (let d = 0; d < 6; d++) { const a = districtAngle(d); I.add(G.box, '#efe0c4', Math.sin(a) * 0.12, 0.0245, Math.cos(a) * 0.12, 0, a, 0, 0.018, 0.002, 0.1); }
  I.add(G.cyl, '#d8c9ef', 0, 0.04, 0, 0, 0, 0, 0.04, 0.02, 0.04); I.add(G.cyl, '#b9a7e0', 0, 0.052, 0, 0, 0, 0, 0.03, 0.006, 0.03);
  const islandMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const island = new THREE.Mesh(I.merge(), islandMat); island.userData.mat = 'grass'; root.add(island);

  // ----- six districts -----
  for (let d = 0; d < DISTRICTS.length; d++) {
    const P = new Parts(); BUILD[DISTRICTS[d].id](P);
    const mat = districtMaterial(DISTRICTS[d].color);
    const mesh = new THREE.Mesh(P.merge(), mat);
    const grp = new THREE.Group(); const a = districtAngle(d); grp.position.set(Math.sin(a) * 0.205, 0.024, Math.cos(a) * 0.205); grp.rotation.y = a;
    grp.add(mesh); root.add(grp);
    A.districts.push({ grp, mat, mesh, lit: 0.6, silver: 0, tLit: 0.6, tSilver: 0 });
  }
  // moving bits of the living world
  { // clockwork gear
    const gp = new Parts(); gp.add(G.tor, '#e2b860', 0, 0, 0, 0, 0, 0, 0.02, 0.02, 0.02); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; gp.add(G.box, '#d9a650', Math.cos(a) * 0.025, Math.sin(a) * 0.025, 0, 0, 0, a, 0.008, 0.006, 0.004); }
    const gear = new THREE.Mesh(gp.merge(), A.districts[1].mat); gear.position.set(0, 0.085, 0.022); A.districts[1].grp.add(gear); A.gear = gear;
  }
  { // Prism Falls waterfall
    const fallTex = canvasTex(64, 256, (g, W, H) => { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#9fe6ff'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#9fe6ff'); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalAlpha = 0.5; g.fillStyle = '#5fb7ff'; for (let i = 0; i < 16; i++) g.fillRect((i * 13) % W, (i * 41) % H, 4, 40); }, true);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.07), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.9, toneMapped: false }));
    fall.position.set(0, 0.04, -0.004); A.districts[2].grp.add(fall); A.fallTex = fallTex; A.fall = fall;
  }
  { // Skyharbor airships (instanced)
    const ap = new Parts(); ap.add(G.sph, '#ffffff', 0, 0, 0, 0, 0, 0, 0.012, 0.009, 0.022); ap.add(G.box, '#ff6b6b', 0, -0.009, 0, 0, 0, 0, 0.004, 0.004, 0.009); ap.add(G.box, '#4fc3ff', 0, 0, -0.022, 0, 0, 0, 0.001, 0.008, 0.006);
    const ships = new THREE.InstancedMesh(ap.merge(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 3); ships.frustumCulled = false; root.add(ships); A.ships = ships;
  }
  { // clouds
    const cp = new Parts(); cp.add(G.sph, '#ffffff', 0, 0, 0, 0, 0, 0, 0.02, 0.012, 0.016); cp.add(G.sph, '#ffffff', 0.016, -0.002, 0.004, 0, 0, 0, 0.014, 0.009, 0.012); cp.add(G.sph, '#f4f8ff', -0.016, -0.003, -0.002, 0, 0, 0, 0.013, 0.008, 0.011);
    const clouds = new THREE.InstancedMesh(cp.merge(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25, transparent: true, opacity: 0.92 }), 5); clouds.frustumCulled = false; root.add(clouds); A.clouds = clouds;
  }

  // ----- light pips (4 per district), restored halos, beacons -----
  const pipMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  A.pips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0075, 10, 8), pipMat, DISTRICTS.length * 4);
  for (let d = 0; d < 6; d++) for (let k = 0; k < 4; k++) { const a = districtAngle(d) + (k - 1.5) * 0.11, r = 0.3; _m.makeTranslation(Math.sin(a) * r, 0.05, Math.cos(a) * r); A.pips.setMatrixAt(d * 4 + k, _m); A.pips.setColorAt(d * 4 + k, _c.set('#4a4f63')); }
  root.add(A.pips);
  A.halos = new THREE.InstancedMesh(new THREE.TorusGeometry(0.03, 0.0025, 6, 32), new THREE.MeshBasicMaterial({ color: 0xfff2a8, toneMapped: false }), 6); A.halos.frustumCulled = false; root.add(A.halos);
  A.beacons = new THREE.InstancedMesh(new THREE.ConeGeometry(0.008, 0.03, 6), new THREE.MeshStandardMaterial({ color: 0x7ff3ff, emissive: 0x2ab8d0, emissiveIntensity: 0.9 }), 6); A.beacons.frustumCulled = false; root.add(A.beacons);

  // ----- the Ever-Glass spire + shard sockets -----
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ff, roughness: 0.12, metalness: 0.55, emissive: 0x6a5aa8, emissiveIntensity: 0.35, flatShading: true });
  const spire = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), glassMat); spire.scale.set(0.024, 0.09, 0.024); spire.position.set(0, 0.15, 0); spire.userData.mat = 'glass'; root.add(spire); A.spire = spire; A.glassMat = glassMat;
  A.shardSlots = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.009, 0), new THREE.MeshStandardMaterial({ roughness: 0.2, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.25 }), 6); A.shardSlots.frustumCulled = false; root.add(A.shardSlots);

  // ----- Narrowmere's clock: notches along the far rail + the little mirror lord -----
  A.notches = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.006, 0.02), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }), 20); root.add(A.notches);
  const N = new Parts();
  N.add(G.cone, '#c7cbe0', 0, 0.028, 0, 0, 0, 0, 0.018, 0.056, 0.018); N.add(G.cone, '#8e86b8', 0, 0.018, 0, 0, 0, 0, 0.02, 0.012, 0.02);
  N.add(G.sph, '#e6e9f5', 0, 0.064, 0, 0, 0, 0, 0.011); N.add(G.cyl, '#b0b8e0', 0, 0.065, 0.009, Math.PI / 2, 0, 0, 0.009, 0.002, 0.011);
  for (let k = 0; k < 5; k++) N.add(G.cone, '#d8d0ff', (k - 2) * 0.004, 0.08, 0, 0, 0, (k - 2) * 0.25, 0.0022, 0.012, 0.0022);
  N.add(G.box, '#9aa0c8', 0.016, 0.04, 0, 0, 0, 0.5, 0.004, 0.024, 0.004); N.add(G.cyl, '#eef1ff', 0.024, 0.055, 0, Math.PI / 2, 0, 0, 0.008, 0.002, 0.008);
  A.narrow = new THREE.Mesh(N.merge(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.5, emissive: 0x3b3466, emissiveIntensity: 0.4 }));
  root.add(A.narrow);

  // ----- highlight ring (current player's space) -----
  const hl = new THREE.Mesh(new THREE.RingGeometry(TILE_R * 1.1, TILE_R * 1.35, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  hl.rotation.x = -Math.PI / 2; root.add(hl); A.highlight = hl;

  // ----- sparkles (pooled Points) -----
  const SP = 96, spPos = new Float32Array(SP * 3), spCol = new Float32Array(SP * 3);
  const spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3)); spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
  const dotTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.012, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sparks.frustumCulled = false; root.add(sparks);
  A.sp = { pos: spPos, col: spCol, vel: new Float32Array(SP * 3), life: new Float32Array(SP), n: SP, geo: spGeo, next: 0 };
  for (let i = 0; i < SP; i++) spPos[i * 3 + 1] = -10;
  return A;
}

// ---------- per-frame world animation (allocation-free) ----------
export function animateArt(A, dt, t, G, Dd) {
  A.waterTex.offset.x = (t * 0.01) % 1; A.fallTex.offset.y = (t * 0.9) % 1;
  if (A.gear) A.gear.rotation.z = t * 0.6 * (A.districts[1].lit);
  for (let i = 0; i < 3; i++) { const a = t * 0.18 + i * 2.1, r = 0.27 + i * 0.012; _p.set(Math.sin(a) * r, 0.13 + Math.sin(t * 0.7 + i) * 0.01 + i * 0.012, Math.cos(a) * r); _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a + Math.PI / 2); _m.compose(_p, _q, _s.set(1, 1, 1)); A.ships.setMatrixAt(i, _m); }
  A.ships.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < 5; i++) { const a = -t * 0.04 + i * 1.26, r = 0.16 + (i % 3) * 0.06; _p.set(Math.sin(a) * r, 0.2 + (i % 2) * 0.03, Math.cos(a) * r); _m.compose(_p, _q.identity(), _s.setScalar(0.9 + (i % 3) * 0.25)); A.clouds.setMatrixAt(i, _m); }
  A.clouds.instanceMatrix.needsUpdate = true;
  // eased district light / silver
  for (const d of A.districts) {
    d.lit += (d.tLit - d.lit) * Math.min(1, dt * 2.5); d.silver += (d.tSilver - d.silver) * Math.min(1, dt * 2);
    d.mat.userData.u.uLit.value = d.lit; d.mat.userData.u.uSilver.value = d.silver; d.mat.emissiveIntensity = d.lit > 0.95 ? 0.12 + 0.05 * Math.sin(t * 2.2) : 0.06 * d.lit;
  }
  // halos over restored districts, beacons over protected ones
  for (let d = 0; d < 6; d++) {
    const a = districtAngle(d), on = G && G.restored[d];
    _p.set(Math.sin(a) * 0.205, 0.2 + Math.sin(t * 1.3 + d) * 0.006, Math.cos(a) * 0.205); _q.setFromEuler(_e.set(Math.PI / 2 + 0.2 * Math.sin(t + d), 0, t * 0.5)); _m.compose(_p, _q, _s.setScalar(on ? 1 : 0.0001)); A.halos.setMatrixAt(d, _m);
    const b = G && G.beacon[d] > 0; _p.set(Math.sin(a) * 0.25, 0.05 + Math.sin(t * 2 + d) * 0.004, Math.cos(a) * 0.25); _m.compose(_p, _q.identity(), _s.setScalar(b ? 1 : 0.0001)); A.beacons.setMatrixAt(d, _m);
  }
  A.halos.instanceMatrix.needsUpdate = true; A.beacons.instanceMatrix.needsUpdate = true;
  // shard sockets around the spire
  const need = Dd ? Dd.shards : 4;
  for (let k = 0; k < 6; k++) { const a = k / need * Math.PI * 2 + t * 0.3, on = k < need; _p.set(Math.sin(a) * 0.05, 0.085 + Math.sin(t * 1.5 + k) * 0.004, Math.cos(a) * 0.05); _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t + k); _m.compose(_p, _q, _s.setScalar(on ? 1 : 0.0001)); A.shardSlots.setMatrixAt(k, _m); }
  A.shardSlots.instanceMatrix.needsUpdate = true;
  A.spire.rotation.y = t * 0.25;
  A.highlight.material.opacity = 0.55 + 0.35 * Math.sin(t * Math.PI * 1.6) * 0.5 + 0.2; // ~0.8 Hz, soft
  // sparkles
  const S = A.sp; let any = false;
  for (let i = 0; i < S.n; i++) {
    if (S.life[i] <= 0) continue; any = true; S.life[i] -= dt; const j = i * 3;
    S.vel[j + 1] -= dt * 0.05; S.pos[j] += S.vel[j] * dt; S.pos[j + 1] += S.vel[j + 1] * dt; S.pos[j + 2] += S.vel[j + 2] * dt;
    if (S.life[i] <= 0) S.pos[j + 1] = -10;
    const f = Math.max(0, Math.min(1, S.life[i])); S.col[j] = S.r[i] * f; S.col[j + 1] = S.g[i] * f; S.col[j + 2] = S.b[i] * f;
  }
  if (any || S.dirty) { S.geo.attributes.position.needsUpdate = true; S.geo.attributes.color.needsUpdate = true; S.dirty = any; }
}
export function burst(A, x, y, z, color, n = 16, spread = 0.12) {
  const S = A.sp; if (!S.r) { S.r = new Float32Array(S.n); S.g = new Float32Array(S.n); S.b = new Float32Array(S.n); }
  _c.set(color);
  for (let k = 0; k < n; k++) {
    const i = S.next; S.next = (S.next + 1) % S.n; const j = i * 3;
    S.pos[j] = x; S.pos[j + 1] = y; S.pos[j + 2] = z;
    const a = Math.random() * Math.PI * 2, u = Math.random();
    S.vel[j] = Math.cos(a) * spread * (0.3 + u); S.vel[j + 1] = spread * (0.6 + Math.random()); S.vel[j + 2] = Math.sin(a) * spread * (0.3 + u);
    S.life[i] = 0.8 + Math.random() * 0.6; S.r[i] = _c.r; S.g[i] = _c.g; S.b[i] = _c.b;
  }
  S.dirty = true;
}

// District visuals from game state.
export function setDistricts(A, G, RESTORED) {
  for (let d = 0; d < 6; d++) {
    const L = G.light[d], D = A.districts[d];
    D.tLit = Math.max(0.15, L / RESTORED); D.tSilver = L <= 0 ? 1 : L === 1 ? 0.35 : 0;
    for (let k = 0; k < 4; k++) A.pips.setColorAt(d * 4 + k, _c.set(k < L ? DISTRICTS[d].color : '#4a4f63'));
  }
  A.pips.instanceColor.needsUpdate = true;
}
export function setShards(A, have, need) {
  for (let k = 0; k < 6; k++) A.shardSlots.setColorAt(k, _c.set(k < have ? '#8ff6ff' : '#4b4f6e'));
  A.shardSlots.instanceColor.needsUpdate = true;
}
// Clock notches spread along the far rail; returns the world-local position for a clock value.
export function clockPos(v, max, out = new THREE.Vector3()) { const a = Math.PI * 0.625 + Math.PI * 0.75 * (v / max); return out.set(Math.sin(a) * CLOCK_R, 0.004, Math.cos(a) * CLOCK_R); }
export function setClock(A, clock, max) {
  for (let k = 0; k < 20; k++) {
    if (k > max) { _m.makeScale(0.0001, 0.0001, 0.0001); A.notches.setMatrixAt(k, _m); continue; }
    clockPos(k, max, _p); const a = Math.atan2(_p.x, _p.z); _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a); _m.compose(_p, _q, _s.set(1, k === max ? 2.2 : 1, 1)); A.notches.setMatrixAt(k, _m);
    A.notches.setColorAt(k, _c.set(k === max ? '#5a4a8a' : k < clock ? '#c9c4ff' : '#6b4a30'));
  }
  A.notches.instanceMatrix.needsUpdate = true; if (A.notches.instanceColor) A.notches.instanceColor.needsUpdate = true;
}

// ---------- the die: rounded-ish cube with an atlas of pip faces (1 draw) ----------
export function buildDie() {
  const tex = canvasTex(768, 512, (g) => {
    const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
    for (let v = 1; v <= 6; v++) { const cx = ((v - 1) % 3) * 256 + 128, cy = Math.floor((v - 1) / 3) * 256 + 128;
      g.fillStyle = '#ffffff'; g.fillRect(cx - 128, cy - 128, 256, 256); g.fillStyle = '#ffe1ef'; g.fillRect(cx - 128, cy - 128, 256, 14); g.fillRect(cx - 128, cy + 114, 256, 14); g.fillRect(cx - 128, cy - 128, 14, 256); g.fillRect(cx + 114, cy - 128, 14, 256);
      g.fillStyle = v === 1 ? '#ff4f8b' : '#10213a'; for (const [px, py] of pips[v]) { g.beginPath(); g.arc(cx + px * 62, cy + py * 62, v === 1 ? 40 : 27, 0, 7); g.fill(); } }
  });
  const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05, 2, 2, 2);
  // round the corners a touch by pushing vertices toward a sphere
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const len = v.length(); v.lerp(v.clone().setLength(0.025 * 1.25), 0.18 * (len > 0.03 ? 1 : 0)); pos.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  // face order +x,-x,+y,-y,+z,-z gets values 3,4,1,6,2,5 (opposites sum to 7)
  const FACE_VAL = [3, 4, 1, 6, 2, 5], uv = geo.attributes.uv, per = uv.count / 6;
  for (let f = 0; f < 6; f++) { const val = FACE_VAL[f], ox = ((val - 1) % 3) / 3, oy = 1 - (Math.floor((val - 1) / 3) + 1) / 2;
    for (let k = f * per; k < (f + 1) * per; k++) uv.setXY(k, ox + uv.getX(k) / 3, oy + uv.getY(k) / 2); }
  geo.clearGroups();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }));
  const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a));
  mesh.userData.faceQuat = val => { const f = FACE_VAL.indexOf(val); return new THREE.Quaternion().setFromUnitVectors(NORMALS[f], new THREE.Vector3(0, 1, 0)); };
  return mesh;
}
