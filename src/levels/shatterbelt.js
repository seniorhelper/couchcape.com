// LEVEL "Shatterbelt": deep-space asteroid belt beyond Aurelia, where the Ever-Glass mines mirror-ore.
// All geometry and textures are procedural. Craggy cratered rocks are original code in the spirit of
// the owner's own Attack of the AI rock look (displaced icosphere + craters + vertex colors).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- tiny deterministic helpers ---------- */
function mulberry(seed) {
  let t = seed >>> 0;
  return () => { t += 1831565813; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
function makeNoise(seed) {
  const rng = mulberry(seed), V = new Float32Array(256), P = new Uint8Array(512), perm = [];
  for (let i = 0; i < 256; i++) { V[i] = rng(); perm.push(i); }
  for (let i = 255; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const a = perm[i]; perm[i] = perm[j]; perm[j] = a; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const h = (i, j, k) => V[P[P[P[i & 255] + (j & 255)] + (k & 255)]];
  const f = t => t * t * (3 - 2 * t), L = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = f(x - xi), v = f(y - yi), w = f(z - zi);
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  };
}

/* ---------- craggy cratered rock ---------- */
function makeRock(seed, detail, elong, craterN, rough, warm) {
  const rng = mulberry(seed), n = makeNoise(seed * 7 + 1);
  const craters = [];
  for (let i = 0; i < craterN; i++) {
    const v = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    craters.push({ v, r: 0.16 + rng() * 0.4 * rng() + 0.06, d: 0.2 + rng() * 0.2 });
  }
  const disp = (x, y, z) => {
    let t = 1 + (n(x * 1.6 + 5, y * 1.6, z * 1.6) - 0.5) * 0.7 * rough * 2.2
      + (n(x * 4 + 9, y * 4, z * 4) - 0.5) * 0.28 * rough * 2.2
      + (n(x * 11, y * 11 + 3, z * 11) - 0.5) * 0.16 * rough * 2.2 + (n(x * 24, y * 24, z * 24 + 8) - 0.5) * 0.05 * rough * 2.2;
    const ridge = 1 - Math.abs(n(x * 3.2 + 40, y * 3.2, z * 3.2 + 7) * 2 - 1);   // crag ridges
    t += (ridge * ridge * ridge - 0.25) * 0.3 * rough * 2;
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i];
      const a = Math.acos(Math.min(1, x * c.v.x + y * c.v.y + z * c.v.z)) / c.r;
      if (a < 1.35) t += (a < 1 ? -c.d * (1 - a * a) : 0) + 0.35 * c.d * Math.exp(-(((a - 1.05) / 0.2) ** 2));
    }
    return t;
  };
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position, cnt = pos.count, T = new Float32Array(cnt), v = new THREE.Vector3();
  let lo = 9, hi = -9;
  for (let i = 0; i < cnt; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const t = disp(v.x, v.y, v.z); T[i] = t; if (t < lo) lo = t; if (t > hi) hi = t;
    pos.setXYZ(i, v.x * t * elong[0], v.y * t * elong[1], v.z * t * elong[2]);
  }
  g.computeVertexNormals();
  const col = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 0.3 + 0.9 * Math.pow((T[i] - lo) / (hi - lo + 1e-6), 1.1);
    const m = 0.85 + 0.3 * n(v.x * 3 + 20, v.y * 3, v.z * 3), s = n(v.x * 1.2, v.y * 1.2 + 50, v.z * 1.2);
    col[i * 3] = k * m * (0.3 + 0.07 * s + warm[0]); col[i * 3 + 1] = k * m * (0.27 + 0.04 * s + warm[1]); col[i * 3 + 2] = k * m * (0.245 - 0.04 * s + warm[2]);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  const inv = 1 / g.boundingSphere.radius;
  g.scale(inv, inv, inv); g.computeBoundingSphere();
  return { geo: g, disp, elong, inv };
}

/* ---------- canvas textures ---------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
let _giantTex, _ringTex, _dotTex, _trailTex, _glowTex;
function giantTexture() {
  return _giantTex || (_giantTex = canvasTex(1024, 512, (g, w, h) => {
    const n = makeNoise(77), rng = mulberry(5);
    const stops = [[236, 214, 170], [214, 160, 112], [176, 108, 76], [240, 226, 196], [150, 128, 120], [226, 190, 140], [120, 150, 160], [238, 220, 184]];
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lat = y / h;
      const warp = (n(x * 0.012, lat * 6, 3) - 0.5) * 0.09 + (n(x * 0.04, lat * 22, 9) - 0.5) * 0.02;
      const b = Math.max(0, Math.min(0.999, lat + warp)) * 15; const i0 = Math.floor(b) % stops.length, i1 = (i0 + 1) % stops.length, f = b - Math.floor(b);
      const s0 = stops[(i0 * 3 + 1) % stops.length], s1 = stops[(i1 * 3 + 1) % stops.length], gr = 0.9 + 0.2 * n(x * 0.03, lat * 40, 1);
      const o = (y * w + x) * 4;
      img.data[o] = (s0[0] + (s1[0] - s0[0]) * f) * gr; img.data[o + 1] = (s0[1] + (s1[1] - s0[1]) * f) * gr; img.data[o + 2] = (s0[2] + (s1[2] - s0[2]) * f) * gr; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.5; g.fillStyle = '#b4573b'; g.beginPath(); g.ellipse(w * 0.62, h * 0.62, 70, 30, 0, 0, 7); g.fill();
    g.globalAlpha = 0.35; g.fillStyle = '#f2d9b0'; g.beginPath(); g.ellipse(w * 0.62, h * 0.62, 38, 15, 0, 0, 7); g.fill(); g.globalAlpha = 1;
  }));
}
function ringTexture() {
  return _ringTex || (_ringTex = canvasTex(512, 8, (g, w, h) => {
    const rng = mulberry(31);
    for (let x = 0; x < w; x++) {
      const u = x / w; let a = 0.55 + 0.4 * Math.sin(u * 61) * Math.sin(u * 17 + 1) + (rng() - 0.5) * 0.25;
      if (u > 0.43 && u < 0.5) a *= 0.06;            // division gap
      if (u < 0.06) a *= u / 0.06; if (u > 0.94) a *= (1 - u) / 0.06;
      a = Math.max(0, Math.min(1, a));
      const tone = 190 + 50 * Math.sin(u * 23); g.fillStyle = `rgba(${tone | 0},${(tone * 0.9) | 0},${(tone * 0.75) | 0},${a})`; g.fillRect(x, 0, 1, h);
    }
  }));
}
function dotTexture() {
  return _dotTex || (_dotTex = canvasTex(32, 32, (g, w, h) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }));
}
function glowTexture() {
  return _glowTex || (_glowTex = canvasTex(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(235,250,255,1)'); r.addColorStop(0.18, 'rgba(170,225,255,0.55)'); r.addColorStop(1, 'rgba(120,190,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }));
}
function trailTexture() {
  return _trailTex || (_trailTex = canvasTex(256, 64, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = x / w, v = (y / h - 0.5) * 2, prof = Math.exp(-v * v * (3 + s * 5)), a = Math.pow(1 - s, 1.6) * prof;
      const o = (y * w + x) * 4; img.data[o] = 190 + 60 * (1 - s); img.data[o + 1] = 230 + 20 * (1 - s); img.data[o + 2] = 255; img.data[o + 3] = a * 235;
    }
    g.putImageData(img, 0, 0);
  }));
}

/* ---------- geometry builders ---------- */
function paint(geo, r, g, b) {
  const c = geo.attributes.position.count, a = new Float32Array(c * 3);
  for (let i = 0; i < c; i++) { a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); return g;
}
function shardGeo() {
  const body = new THREE.CylinderGeometry(0.5, 0.5, 0.7, 6); body.translate(0, 0.35, 0);
  const tip = new THREE.CylinderGeometry(0.02, 0.5, 0.3, 6); tip.translate(0, 0.85, 0);
  const parts = [body, tip].map(p => {
    const g = prep(p), c = g.attributes.position.count, a = new Float32Array(c * 3);
    for (let i = 0; i < c; i++) { const y = g.attributes.position.getY(i), k = 0.55 + 0.45 * y; a[i * 3] = k; a[i * 3 + 1] = k; a[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
  });
  return mergeGeometries(parts);
}

/* ---------- the level ---------- */
export const LEVEL = {
  id: 'shatterbelt',
  name: 'Shatterbelt',
  sub: 'Where the Ever-Glass mines mirror-ore',
  color: '#8fd3ff',
  sky: 'real-stars',

  build(scene, offset) {
    const root = new THREE.Group(); root.name = 'shatterbelt'; root.position.copy(offset); scene.add(root);
    const W = (x, y, z) => new THREE.Vector3(x, y, z).add(offset);
    const rng = mulberry(20260611);
    const R = (a, b) => a + (b - a) * rng();

    // flight corridor centerline (local)
    const path = (z, o) => { o.set(50 * Math.sin(z / 260), 10 * Math.sin(z / 180), z); return o; };
    const pathPts = []; { for (let z = 330; z >= -760; z -= 20) pathPts.push(path(z, new THREE.Vector3())); }

    const RIG = new THREE.Vector3(-28, 10, -660);                 // rig ring center
    const BOSS = new THREE.Vector3(-28, 10, -590);                // The Foreman's arena
    const tmp = new THREE.Vector3();
    const P = z => path(z, new THREE.Vector3());

    const raidL = [P(-130).add(new THREE.Vector3(0, 8, 0)), P(-330).add(new THREE.Vector3(0, -6, 0)), P(-480).add(new THREE.Vector3(0, 10, 0))];
    const rescueL = [P(10).add(new THREE.Vector3(62, 24, 0)), P(-235).add(new THREE.Vector3(-64, -22, 0)), P(-440).add(new THREE.Vector3(66, 26, 0))];
    const ARCH = new THREE.Vector3(-250, 35, -250);
    const secretL = [ARCH.clone(), new THREE.Vector3(322, -48, -392), RIG.clone().add(new THREE.Vector3(0, -42, -62))];
    // keep-clear spheres: [center, radius]
    const clear = [];
    raidL.forEach(c => clear.push([c, 95])); rescueL.forEach(c => clear.push([c, 55]));
    secretL.forEach(c => clear.push([c, 48])); clear.push([BOSS, 110], [RIG, 150]);
    const cleared = (p, r, corridor) => {
      for (let i = 0; i < clear.length; i++) if (p.distanceTo(clear[i][0]) < clear[i][1] + r) return false;
      for (let i = 0; i < pathPts.length; i++) if (p.distanceTo(pathPts[i]) < corridor + r) return false;
      return true;
    };

    /* ----- shared materials ----- */
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, color: 0xc4bcb2 });
    const crystalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.85, flatShading: true, emissive: 0x5aa0d8, emissiveIntensity: 0.7 });
    const metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.7, flatShading: true, side: THREE.DoubleSide });
    const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.3, color: 0xcfeaff, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
    const neonMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffd9a0, emissive: 0xffa94a, emissiveIntensity: 1.0, roughness: 0.6 });
    const tag = (m, t) => { m.userData.mat = t; return m; };

    /* ----- big rocks (4 instanced variants) ----- */
    const variants = [
      makeRock(11, 14, [1, 0.82, 0.9], 18, 0.26, [0, 0, 0]),
      makeRock(23, 14, [1.25, 0.8, 0.85], 14, 0.3, [0.02, 0, -0.01]),
      makeRock(37, 14, [1, 0.95, 1.05], 10, 0.22, [-0.01, 0, 0.02]),
      makeRock(41, 14, [1.5, 0.72, 0.8], 8, 0.3, [0.01, 0.005, 0]),
    ];
    const rocks = [];     // {p,q,s:Vector3,v,r}
    const addRock = (x, y, z, r, v) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R(0, 6.28), R(0, 6.28), R(0, 6.28)));
      rocks.push({ p: new THREE.Vector3(x, y, z), q, s: new THREE.Vector3(r, r * R(0.85, 1.08), r * R(0.88, 1.06)), v: v == null ? rocks.length % 4 : v, r });
    };
    // hero rocks: framing the arrival vista, and one big "behind" rock for secret 2
    addRock(-185, 25, 125, 78, 1); addRock(205, -30, -15, 85, 0); addRock(255, -60, -380, 85, 3); addRock(-235, -95, -80, 62, 2);
    addRock(150, 95, -250, 58, 0); addRock(-150, -70, -440, 66, 1);
    for (let tries = 0; tries < 5000 && rocks.length < 24; tries++) {
      const r = R(32, 100); tmp.set(R(-540, 540), R(-240, 240), R(330, -800));
      if (!cleared(tmp, r * 1.45, 62)) continue;
      let ok = true; for (const o of rocks) if (tmp.distanceTo(o.p) < (r + o.r) * 1.35 + 15) { ok = false; break; }
      if (ok) addRock(tmp.x, tmp.y, tmp.z, r);
    }
    const bigMeshes = variants.map((v, i) => {
      const list = rocks.filter(r => r.v === i);
      const m = new THREE.InstancedMesh(v.geo, tag(rockMat, 'rock'), Math.max(1, list.length));
      m.userData.mat = 'rock'; m.count = list.length;
      const M = new THREE.Matrix4();
      list.forEach((r, k) => { M.compose(r.p, r.q, r.s); m.setMatrixAt(k, M); });
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.computeBoundingBox(); m.frustumCulled = true;
      root.add(m); return m;
    });

    /* ----- arch rock with a hole (secret 1) ----- */
    {
      const t = new THREE.TorusGeometry(40, 15, 36, 64); t.deleteAttribute('normal'); t.deleteAttribute('uv');
      const g = mergeVertices(t, 1e-4), pos = g.attributes.position, n = makeNoise(909), v = new THREE.Vector3(), c = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const d = (n(v.x * 0.07, v.y * 0.07, v.z * 0.07) - 0.5) * 22 + (n(v.x * 0.22 + 4, v.y * 0.22, v.z * 0.22) - 0.5) * 7 + (n(v.x * 0.6, v.y * 0.6 + 3, v.z * 0.6) - 0.5) * 2;
        const ang = Math.atan2(v.y, v.x), rr = Math.hypot(v.x, v.y) - 40, nn = new THREE.Vector3(Math.cos(ang) * rr, Math.sin(ang) * rr, v.z).normalize();
        v.addScaledVector(nn, d); pos.setXYZ(i, v.x, v.y, v.z);
        const k = 0.55 + 0.6 * (n(v.x * 0.09 + 11, v.y * 0.09, v.z * 0.09));
        c[i * 3] = k * 0.32; c[i * 3 + 1] = k * 0.285; c[i * 3 + 2] = k * 0.25;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); g.computeBoundingSphere();
      const arch = new THREE.Mesh(g, rockMat); arch.userData.mat = 'rock';
      arch.position.copy(ARCH); arch.rotation.set(0.15, 0.5, 0.4); arch.scale.set(1.5, 1.5, 1.2); root.add(arch);
    }

    /* ----- mirror-ore veins: shards fanned along arcs on rock surfaces ----- */
    const shardG = shardGeo(), SHARD_MAX = 360;
    const crystals = new THREE.InstancedMesh(shardG, tag(crystalMat, 'crystal'), SHARD_MAX); crystals.userData.mat = 'crystal';
    let shardN = 0;
    const palette = [0xbfeaff, 0xe8f6ff, 0xcdbdff, 0xa5f2e4].map(c => new THREE.Color(c));
    const up = new THREE.Vector3(0, 1, 0), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pp = new THREE.Vector3(), N = new THREE.Vector3();
    const addShard = (host, p, nrm, len) => {
      if (shardN >= SHARD_MAX) return;
      N.copy(nrm).add(Pp.set(R(-0.35, 0.35), R(-0.35, 0.35), R(-0.35, 0.35))).normalize();
      Q.setFromUnitVectors(up, N); S.set(len * R(0.14, 0.24), len, len * R(0.14, 0.24));
      M4.compose(p, Q, S); host.setMatrixAt(shardN, M4); host.setColorAt(shardN, palette[(rng() * 4) | 0]); shardN++;
    };
    rocks.forEach((rk, idx) => {
      const sites = idx < 6 ? 3 : 2, v = variants[rk.v];
      for (let s = 0; s < sites; s++) {
        const d0 = new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize();
        const tan = new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)).cross(d0).normalize();
        const cnt = 5 + ((rng() * 3) | 0);
        for (let k = 0; k < cnt; k++) {
          const d = d0.clone().addScaledVector(tan, (k - cnt / 2) * 0.1).normalize();
          const t = v.disp(d.x, d.y, d.z) * v.inv;
          const lp = new THREE.Vector3(d.x * v.elong[0], d.y * v.elong[1], d.z * v.elong[2]).multiplyScalar(t).multiply(rk.s).applyQuaternion(rk.q).add(rk.p);
          const nrm = d.clone().applyQuaternion(rk.q);
          addShard(crystals, lp.addScaledVector(nrm, -rk.r * 0.01), nrm, rk.r * R(0.12, 0.26));
        }
      }
    });
    // glowing mirror-ore clusters marking each secret and rescue (soft beacon, not strobing)
    [...secretL, ...rescueL].forEach((c, i) => {
      const sec = i < 3;
      for (let k = 0; k < (sec ? 7 : 4); k++) {
        const a = k / 7 * 6.283, rad = sec ? 9 : 6;
        tmp.set(Math.cos(a) * rad, R(-3, 3), Math.sin(a) * rad);
        const nrm = new THREE.Vector3(Math.cos(a), R(-0.5, 0.5), Math.sin(a)).normalize();
        addShard(crystals, tmp.clone().add(c).add(new THREE.Vector3(0, -sec ? 6 : 3, 0)), nrm, R(3, sec ? 9 : 6));
      }
    });
    crystals.count = shardN; crystals.instanceMatrix.needsUpdate = true; crystals.instanceColor.needsUpdate = true;
    crystals.computeBoundingSphere(); root.add(crystals);

    /* ----- tumbling debris (instanced) ----- */
    const debGeos = [makeRock(71, 3, [1, 0.8, 0.9], 4, 0.45, [0.01, 0, 0]), makeRock(83, 3, [1.4, 0.7, 0.8], 3, 0.5, [0, 0, 0.01])];
    const DEB = 46, debris = [];
    const debMeshes = debGeos.map((dg, gi) => {
      const m = new THREE.InstancedMesh(dg.geo, rockMat, DEB); m.userData.mat = 'rock'; debris.push([]);
      for (let i = 0; i < DEB; i++) {
        let p = new THREE.Vector3(), tries = 0, sc = R(2.5, 11);
        do { p.set(R(-420, 420), R(-190, 190), R(300, -740)); tries++; } while (!cleared(p, sc + 6, 34) && tries < 40);
        debris[gi].push({ p, ax: new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize(), sp: R(0.03, 0.22) * (rng() < 0.5 ? -1 : 1), a0: R(0, 6.28), s: sc });
      }
      m.frustumCulled = true; root.add(m); return m;
    });
    const dQ = new THREE.Quaternion(), dS = new THREE.Vector3(), dM = new THREE.Matrix4();
    const tumble = t => {
      for (let g = 0; g < 2; g++) {
        const arr = debris[g], m = debMeshes[g];
        for (let i = 0; i < DEB; i++) {
          const d = arr[i]; dQ.setFromAxisAngle(d.ax, d.a0 + d.sp * t); dS.set(d.s, d.s, d.s); dM.compose(d.p, dQ, dS); m.setMatrixAt(i, dM);
        }
        m.instanceMatrix.needsUpdate = true;
      }
    };
    tumble(0);
    debMeshes.forEach(m => { m.computeBoundingSphere(); m.boundingSphere.radius += 14; });

    /* ----- far belt backdrop (low-poly instanced) ----- */
    {
      const fg = makeRock(97, 1, [1.2, 0.8, 1], 2, 0.5, [0, 0, 0]);
      const FAR = 200, m = new THREE.InstancedMesh(fg.geo, rockMat, FAR); m.userData.mat = 'rock';
      const giantC = new THREE.Vector3(260, 200, -700), M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      for (let i = 0, k = 0; k < FAR && i < 4000; i++) {
        p.set(R(-1000, 1000), R(-330, 330), R(-300, -1050));
        if (p.distanceTo(giantC) < 420 || p.distanceTo(RIG) < 200) continue;
        let near = false; for (let j = 0; j < pathPts.length; j += 2) if (p.distanceTo(pathPts[j]) < 120) { near = true; break; }
        if (near) continue;
        const sc = R(7, 34); q.setFromEuler(new THREE.Euler(R(0, 6), R(0, 6), R(0, 6))); s.set(sc, sc * R(0.7, 1), sc * R(0.7, 1));
        M.compose(p, q, s); m.setMatrixAt(k++, M);
      }
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); root.add(m);
    }

    /* ----- ringed gas giant on the horizon ----- */
    const GIANT = new THREE.Vector3(260, 200, -700), GR = 240;
    const sun = new THREE.Vector3(-0.55, 0.35, 0.76).normalize();
    {
      const sg = new THREE.SphereGeometry(GR, 56, 36), pos = sg.attributes.position, col = new Float32Array(pos.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).normalize(); const d = v.dot(sun), k = 0.07 + 0.93 * Math.pow(THREE.MathUtils.smoothstep(d, -0.28, 0.75), 0.85);
        col[i * 3] = k; col[i * 3 + 1] = k * 0.98; col[i * 3 + 2] = k * 1.02;
      }
      sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const gm = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: giantTexture(), vertexColors: true, fog: false }));
      gm.position.copy(GIANT); gm.rotation.set(0.1, 0.4, 0.2); root.add(gm);   // unlit backdrop: intentionally untagged
      const inner = GR * 1.3, outer = GR * 1.78, rg = new THREE.RingGeometry(inner, outer, 128, 6), rp = rg.attributes.position, ru = rg.attributes.uv, rc = new Float32Array(rp.count * 3);
      // ring lies in a tilted plane; normal n; shadow of the planet falls on the far side from the sun
      const nrm = new THREE.Vector3(0.22, 0.88, 0.42).normalize(), qr = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
      for (let i = 0; i < rp.count; i++) {
        v.fromBufferAttribute(rp, i); const r = Math.hypot(v.x, v.y); ru.setXY(i, (r - inner) / (outer - inner), 0.5);
        const w = v.clone().applyQuaternion(qr), along = w.dot(sun), perp = Math.sqrt(Math.max(0, w.lengthSq() - along * along));
        const sh = along < 0 ? THREE.MathUtils.smoothstep(perp, GR * 0.96, GR * 1.04) : 1, k = 0.12 + 0.88 * sh;
        rc[i * 3] = k; rc[i * 3 + 1] = k; rc[i * 3 + 2] = k;
      }
      rg.setAttribute('color', new THREE.BufferAttribute(rc, 3));
      const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: ringTexture(), vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      ring.position.copy(GIANT); ring.quaternion.copy(qr); ring.renderOrder = 2; root.add(ring);
    }

    /* ----- comet with a long ion trail ----- */
    const comet = new THREE.Group(); comet.position.set(-430, 215, -540); root.add(comet);
    {
      const dir = new THREE.Vector3(0.55, -0.3, -0.78).normalize(), L = 420;
      comet.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      const pa = new THREE.PlaneGeometry(L, 46), pb = new THREE.PlaneGeometry(L, 46); pa.translate(L / 2, 0, 0); pb.translate(L / 2, 0, 0); pb.rotateX(Math.PI / 2);
      const tr = new THREE.Mesh(mergeGeometries([pa, pb]), new THREE.MeshBasicMaterial({ map: trailTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      tr.renderOrder = 3; comet.add(tr);
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), new THREE.MeshBasicMaterial({ color: 0xeaf6ff, fog: false })); comet.add(head);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.scale.set(70, 70, 1); sp.renderOrder = 3; comet.add(sp);
    }

    /* ----- dust motes ----- */
    const dust = (() => {
      const N = 1400, a = new Float32Array(N * 3), p = new THREE.Vector3();
      for (let i = 0; i < N; i++) { path(R(300, -720), p); a[i * 3] = p.x + R(-170, 170); a[i * 3 + 1] = p.y + R(-120, 120); a[i * 3 + 2] = p.z; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.computeBoundingSphere(); g.boundingSphere.radius += 12;
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTexture(), size: 1.8, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false, color: 0xdfeaff, fog: false }));
      root.add(pts); return pts;
    })();

    /* ----- derelict glass mining rig ----- */
    const rig = new THREE.Group(); rig.position.copy(RIG); root.add(rig);
    const spin = new THREE.Group(); rig.add(spin);
    const L_ = { st: [], sp: [], gl: [], dome: [], ne: [] };
    const mtx = new THREE.Matrix4(), eul = new THREE.Euler(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(1, 1, 1);
    const put = (list, geo, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const g = prep(geo); paint(g, c[0], c[1], c[2]); mtx.compose(new THREE.Vector3(x, y, z), qq.setFromEuler(eul.set(rx, ry, rz)), ss); g.applyMatrix4(mtx); list.push(g);
    };
    const TEAL = [0.30, 0.40, 0.43], RUST = [0.42, 0.27, 0.19], BRASS = [0.62, 0.5, 0.26], DARK = [0.16, 0.18, 0.2], GL = [0.8, 0.95, 1];
    // static spine, tanks, dish, habitat band
    put(L_.st, new THREE.CylinderGeometry(9, 11, 250, 12, 1), TEAL, 0, 0, -60, Math.PI / 2, 0, 0);
    for (let i = 0; i < 5; i++) put(L_.st, new THREE.TorusGeometry(10.5, 1.8, 6, 16), RUST, 0, 0, -150 + i * 36);
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; put(L_.st, new THREE.CylinderGeometry(6, 6, 46, 10), DARK, Math.cos(a) * 22, Math.sin(a) * 22, -140, Math.PI / 2, 0, 0); put(L_.st, new THREE.SphereGeometry(6, 10, 6), DARK, Math.cos(a) * 22, Math.sin(a) * 22, -117); }
    put(L_.st, new THREE.SphereGeometry(34, 22, 7, 0, 6.2832, 0, 1.0), BRASS, 0, 0, -178, -Math.PI / 2, 0, 0);
    put(L_.st, new THREE.CylinderGeometry(1.2, 1.2, 40, 6), DARK, 0, 0, -165, Math.PI / 2, 0, 0);
    put(L_.st, new THREE.TorusGeometry(19, 1.8, 8, 28), BRASS, 0, 0, -90);
    put(L_.dome, new THREE.SphereGeometry(18, 22, 14), GL, 0, 0, -90);
    // spinning gantry: ring, inner ring, spokes, drill arms with bits
    put(L_.sp, new THREE.TorusGeometry(85, 5.5, 10, 72), TEAL);
    put(L_.sp, new THREE.TorusGeometry(60, 2.5, 8, 56), RUST, 0, 0, -10);
    for (const a of [0.52, 1.57, 2.62, 3.67, 5.76]) put(L_.sp, new THREE.BoxGeometry(3.4, 82, 3.4), DARK, Math.cos(a) * 46, Math.sin(a) * 46, 0, 0, 0, a - Math.PI / 2);
    const bitSites = [];
    for (const a of [0.785, 2.356, 3.927, 5.498]) {
      const x = Math.cos(a) * 85, y = Math.sin(a) * 85;
      put(L_.sp, new THREE.CylinderGeometry(3.4, 4, 78, 8), TEAL, x, y, 39, Math.PI / 2, 0, 0);
      put(L_.sp, new THREE.CylinderGeometry(6, 6, 10, 8), BRASS, x, y, 6, Math.PI / 2, 0, 0);
      put(L_.sp, new THREE.ConeGeometry(10, 28, 10), RUST, x, y, 92, Math.PI / 2, 0, 0);
      for (let i = 0; i < 3; i++) put(L_.sp, new THREE.TorusGeometry(8.8 - i * 2.4, 1.1, 5, 12), BRASS, x, y, 82 + i * 7);
      bitSites.push([x, y]);
    }
    // broken honeycomb of mirror sails (many panels missing)
    { const a = 13.5;
      for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
        const x = a * 1.7321 * (q + r / 2) * 1.05, y = a * 1.5 * r * 1.05; if (Math.hypot(x, y) > 76 || (q === 0 && r === 0) || rng() < 0.5) continue;
        put(L_.gl, new THREE.CylinderGeometry(a, a, 0.7, 6), GL, x, y, -4, Math.PI / 2, 0, 0);
      }
    }
    // dim running lights on the ring (derelict: few still lit)
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.2832 + 0.2; put(L_.ne, new THREE.BoxGeometry(3, 3, 2), [1, 0.85, 0.6], Math.cos(a) * 85, Math.sin(a) * 85, 5.5, 0, 0, a); }
    const meshOf = (list, mat, tg, host) => {
      const m = new THREE.Mesh(mergeGeometries(list), mat); m.userData.mat = tg; m.frustumCulled = true; m.geometry.computeBoundingSphere(); host.add(m); return m;
    };
    meshOf(L_.st, metalMat, 'metal', rig); meshOf(L_.sp, metalMat, 'metal', spin);
    meshOf(L_.gl, glassMat, 'glass', spin); meshOf(L_.dome, glassMat, 'glass', rig); meshOf(L_.ne, neonMat, 'neon', spin);
    // ore clinging to the drill bits
    const rigOre = new THREE.InstancedMesh(shardG, crystalMat, 28); rigOre.userData.mat = 'crystal';
    { let k = 0; bitSites.forEach(([x, y]) => { for (let i = 0; i < 7; i++) {
        const a = i / 7 * 6.28, nrm = new THREE.Vector3(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.5).normalize(), p = new THREE.Vector3(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 90 + R(-8, 8));
        Q.setFromUnitVectors(up, nrm); const l = R(5, 11); S.set(l * 0.2, l, l * 0.2); M4.compose(p, Q, S); rigOre.setMatrixAt(k, M4); rigOre.setColorAt(k, palette[(rng() * 4) | 0]); k++; } });
      rigOre.computeBoundingSphere(); spin.add(rigOre);
    }
    rig.rotation.set(0, 0.0, 0);

    /* ----- update ----- */
    let frame = 0;
    const update = (dt, t) => {
      frame++;
      if ((frame & 1) === 0) tumble(t);                 // half-rate tumble, cheap
      spin.rotation.z = t * 0.03;
      comet.position.x = -430 + Math.sin(t * 0.02) * 12;
      dust.position.z = Math.sin(t * 0.05) * 6; dust.position.x = Math.cos(t * 0.04) * 4;
      crystalMat.emissiveIntensity = 0.7 + 0.2 * Math.sin(t * 1.7);   // < 0.3 Hz glimmer
    };

    return {
      root, update,
      arrival: { pos: W(0, 30, 260), look: W(75, 40, -420) },
      raids: [
        { center: raidL[0].clone().add(offset), foes: 4, name: 'Glintswarm Gate' },
        { center: raidL[1].clone().add(offset), foes: 6, name: 'Orebreaker Shoal' },
        { center: raidL[2].clone().add(offset), foes: 7, name: 'Slagfall Drift' },
      ],
      rescues: rescueL.map(v => v.clone().add(offset)),
      secrets: secretL.map(v => v.clone().add(offset)),
      facts: [
        'The asteroid belt between Mars and Jupiter holds millions of rocks, yet all of them together weigh far less than our Moon.',
        'Ceres, the biggest object in the asteroid belt, is a dwarf planet about 940 kilometers across.',
        "Saturn's rings are made mostly of water ice, in pieces from dust grains to house-sized boulders.",
      ],
      lesson: 'The mine sold the sparkle and lost the wonder: nothing we dig up is worth more than the life we leave behind.',
      miniBoss: { center: BOSS.clone().add(offset), name: 'The Foreman', look: 'A hulking Echo of cracked mirror-glass with a spinning drill-bit fist, a cold headlamp eye and ore-dust smoking from its shoulders.' },
      _debug: { rocks: rocks.map(r => ({ p: r.p.clone(), r: r.r })), pathPts, clear, shards: shardN },
    };
  },
};
