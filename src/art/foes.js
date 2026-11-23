// CouchCape foes: Mirror Echoes (minions) and The Ever-Glass (final boss).
// 100% procedural. three r160 only. Faces +Z. Origin at feet / world origin.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------ helpers */
function hash(n) { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }

// tiny procedural lavender/teal studio environment so chrome has something to reflect
let _env = null;
function getEnv() {
  if (_env) return _env;
  const W = 64, H = 32, d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let r, g, b;
      if (v < 0.5) { const k = v / 0.5; r = 0.32 + 0.45 * k; g = 0.28 + 0.6 * k; b = 0.6 + 0.35 * k; }
      else { const k = (v - 0.5) / 0.5; r = 0.77 - 0.65 * k; g = 0.88 - 0.8 * k; b = 0.95 - 0.7 * k; }
      if (v > 0.5 && v < 0.62) { r *= 0.35; g *= 0.3; b *= 0.55; }           // dark horizon band for chrome contrast
      for (const c of [0.08, 0.36, 0.64, 0.9]) {                              // soft boxes
        const du = Math.abs(((u - c + 1.5) % 1) - 0.5);
        if (du < 0.045 && v > 0.12 && v < 0.5) { r += 0.55; g += 0.55; b += 0.55; }
      }
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, r * 255); d[i + 1] = Math.min(255, g * 255); d[i + 2] = Math.min(255, b * 255); d[i + 3] = 255;
    }
  }
  _env = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  _env.mapping = THREE.EquirectangularReflectionMapping;
  _env.colorSpace = THREE.SRGBColorSpace;
  _env.magFilter = _env.minFilter = THREE.LinearFilter;
  _env.needsUpdate = true;
  return _env;
}

const LAV = [0.74, 0.62, 1.0], TEAL = [0.36, 0.93, 0.95], SILV = [0.9, 0.92, 0.98];
const lin = v => Math.pow(v < 0 ? 0 : v > 1 ? 1 : v, 2.2);

function irid(col, x, y, z, nx, ny, nz, fs, f, sd, glass, mul) {
  const t = 0.5 + 0.5 * Math.sin(y * f + x * f * 0.35 + nx * 2.4 + nz * 1.3 + fs * 2.0 + sd);
  let r = LAV[0] + (TEAL[0] - LAV[0]) * t, g = LAV[1] + (TEAL[1] - LAV[1]) * t, b = LAV[2] + (TEAL[2] - LAV[2]) * t;
  const sm = glass ? 0.08 : 0.2;
  r += (SILV[0] - r) * sm; g += (SILV[1] - g) * sm; b += (SILV[2] - b) * sm;
  let lit = 0.62 + 0.25 * (ny * 0.5 + 0.5) + 0.1 * nz + (fs - 0.5) * 0.5;
  if (glass) lit += 0.12;
  lit *= mul;
  col.push(lin(r * lit), lin(g * lit), lin(b * lit));
}

// flat-shade + gradient vertex colors, drops degenerate triangles
function bake(g, o) {
  o = o || {};
  const p = g.attributes.position.array, tri = (p.length / 9) | 0;
  const pos = [], nor = [], col = [];
  const f = o.freq || 1.6, sd = o.seed || 0, glass = o.pal === 1, mul = o.mul === undefined ? 1 : o.mul;
  for (let i = 0; i < tri; i++) {
    const b = i * 9;
    const ax = p[b], ay = p[b + 1], az = p[b + 2], bx = p[b + 3], by = p[b + 4], bz = p[b + 5], cx = p[b + 6], cy = p[b + 7], cz = p[b + 8];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    const fs = hash(ax * 12.9 + ay * 78.2 + az * 37.7 + i * 0.173 + sd);
    for (let k = 0; k < 3; k++) {
      const x = p[b + k * 3], y = p[b + k * 3 + 1], z = p[b + k * 3 + 2];
      pos.push(x, y, z); nor.push(nx, ny, nz);
      irid(col, x, y, z, nx, ny, nz, fs, f, sd, glass, mul);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  if (g.attributes.normal) g.deleteAttribute('normal');
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
const u1 = v => (v === undefined ? 1 : v);

// euler placement: scale -> rotate -> translate
function mk(geo, x, y, z, rx, ry, rz, sx, sy, sz, o) {
  const g = prep(geo);
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
  sx = u1(sx); sy = sy === undefined ? sx : sy; sz = sz === undefined ? sx : sz;
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); g.applyMatrix4(_m);
  return bake(g, o);
}
// direction placement: scale -> spin about own axis -> point +Y along (dx,dy,dz) -> translate
function mkDir(geo, x, y, z, dx, dy, dz, sx, sy, sz, o, spin) {
  const g = prep(geo);
  sx = u1(sx); sy = sy === undefined ? sx : sy; sz = sz === undefined ? sx : sz;
  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  if (spin) g.rotateY(spin);
  _d.set(dx, dy, dz).normalize(); _q.setFromUnitVectors(UP, _d);
  _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1)); g.applyMatrix4(_m);
  return bake(g, o);
}
// tapered prism from a to b (r0 at a, r1 at b)
function seg(ax, ay, az, bx, by, bz, r0, r1, sides, o, sq, spin) {
  _d.set(bx - ax, by - ay, bz - az); const L = _d.length();
  const g = prep(new THREE.CylinderGeometry(r1, r0, L, sides, 1));
  if (sq) g.scale(sq, 1, 1);
  if (spin) g.rotateY(spin);
  _d.divideScalar(L); _q.setFromUnitVectors(UP, _d);
  _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(1, 1, 1)); g.applyMatrix4(_m);
  return bake(g, o);
}
// pointed crystal prism pointing +Y, base at origin
function crystal(r, h, sides, tip) {
  tip = tip || 0.3;
  const pts = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(r * 0.72, h * 0.07), new THREE.Vector2(r, h * 0.16),
    new THREE.Vector2(r, h * (1 - tip)), new THREE.Vector2(0.0001, h)];
  return new THREE.LatheGeometry(pts, sides || 5);
}
const lathe = (pts, sides) => new THREE.LatheGeometry(pts.map(a => new THREE.Vector2(a[0], a[1])), sides);
const ico = d => new THREE.IcosahedronGeometry(1, d || 0);
const merge = list => mergeGeometries(list, false);

function chromeMat(emissive, ei, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({
    vertexColors: true, metalness: 0.85, roughness: 0.22, envMap: getEnv(), envMapIntensity: 1.0,
    emissive: new THREE.Color(emissive), emissiveIntensity: ei,
  }, extra || {}));
}
function iceMaterial(opacity) {
  return new THREE.MeshStandardMaterial({
    color: 0xb9e8ff, metalness: 0.0, roughness: 0.08, flatShading: true, transparent: true, opacity,
    emissive: new THREE.Color(0x3a90c0), emissiveIntensity: 0.4, envMap: getEnv(), envMapIntensity: 1.2, depthWrite: false,
  });
}

/* ------------------------------------------------------------------ ECHO */
export function buildEcho(variant) {
  variant = (((variant | 0) % 3) + 3) % 3;
  const V = [{ bw: 0.85, sc: 1.0, hs: 1.0 }, { bw: 1.45, sc: 1.05, hs: 1.05 }, { bw: 0.8, sc: 0.56, hs: 1.45 }][variant];
  const bw = V.bw, hs = V.hs;
  const O = { freq: 3.2, seed: variant * 1.7 };
  const OG = { freq: 3.0, seed: variant * 1.7 + 0.8, pal: 1 };
  const body = [], shards = [], glass = [];

  // torso tapers to a point (no legs)
  body.push(mk(lathe([[0.001, 0.42], [0.06, 0.6], [0.14, 0.92], [0.2, 1.18], [0.27, 1.4], [0.31, 1.58], [0.25, 1.7], [0.11, 1.76]], 8),
    0, 0, 0, 0, Math.PI / 8, 0, bw, 1, bw * 0.72, O));
  glass.push(mk(new THREE.OctahedronGeometry(1, 0), 0, 1.38, 0.14 + 0.06 * bw, 0, 0, 0, 0.12 + 0.03 * bw, 0.2, 0.07, OG)); // chest mirror plate
  body.push(seg(0, 1.7, 0, 0, 1.84, 0, 0.1, 0.07, 6, O)); // neck

  // shoulders + arms
  const shX = 0.31 * bw + 0.07;
  const arm = (s, ex, ey, ez, wx, wy, wz, th) => {
    body.push(mk(ico(0), s * shX, 1.6, 0, 0, 0, 0, 0.15 * th + 0.03, 0.12, 0.15 * th, O));          // pauldron
    body.push(mkDir(crystal(0.06 * th, 0.36, 5), s * (shX + 0.03), 1.62, 0, s * 0.8, 1, 0, 1, 1, 1, O));
    body.push(seg(s * shX, 1.56, 0, s * ex, ey, ez, 0.075 * th, 0.058 * th, 6, O));
    body.push(mk(ico(0), s * ex, ey, ez, 0, 0, 0, 0.075 * th, 0.075 * th, 0.075 * th, O));          // elbow
    body.push(seg(s * ex, ey, ez, s * wx, wy, wz, 0.058 * th, 0.07 * th, 6, O));
  };
  if (variant === 0) {
    arm(1, 0.5, 1.22, 0.12, 0.44, 1.08, 0.46, 1);
    arm(-1, 0.52, 1.25, 0.08, 0.46, 1.02, 0.36, 1);
    // blade-arm: long mirror shard from right wrist, with chrome guard
    glass.push(mkDir(crystal(0.085, 1.15, 4, 0.22), 0.44, 1.08, 0.46, 0.03, 0.02, 1, 0.34, 1, 1, OG));
    body.push(mk(ico(0), 0.44, 1.08, 0.48, 0, 0, 0, 0.1, 0.1, 0.09, O));
    for (let i = 0; i < 3; i++) body.push(mkDir(crystal(0.022, 0.2, 4), 0.44, 1.08, 0.46, 0.25 * (i - 1) - 0.4, 0.5, 0.6, 1, 1, 1, O)); // guard fins
    for (let i = 0; i < 3; i++) body.push(mkDir(crystal(0.02, 0.17, 4), -0.46, 1.02, 0.36, -0.5 + 0.5 * i, -0.8, 0.4, 1, 1, 1, O)); // left claw fingers
  } else if (variant === 1) {
    arm(1, 0.82, 1.18, 0.15, 0.74, 0.98, 0.42, 1.55);
    arm(-1, 0.84, 1.2, 0.22, 0.62, 1.22, 0.56, 1.55);
    body.push(mk(ico(0), 0.74, 0.96, 0.44, 0, 0, 0, 0.14, 0.13, 0.14, O));                            // fist
    for (let i = 0; i < 3; i++) body.push(mkDir(crystal(0.03, 0.18, 4), 0.74 + (i - 1) * 0.07, 0.98, 0.55, 0, 0.3, 1, 1, 1, 1, O));
    // big mirror disc held in front of the left side
    const dc = [-0.6, 1.28, 0.72];
    glass.push(mk(lathe([[0.67, 0.066], [0.46, 0.082], [0.24, 0.1], [0.001, 0.115]], 12), dc[0], dc[1], dc[2], Math.PI / 2, 0, 0, 1, 1, 1, OG));
    body.push(mk(lathe([[0.001, 0.0], [0.67, 0.0], [0.79, 0.04], [0.74, 0.11], [0.62, 0.075]], 12), dc[0], dc[1], dc[2], Math.PI / 2, 0, 0, 1, 1, 1, O));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      body.push(mkDir(crystal(0.045, i % 2 ? 0.2 : 0.34, 4), dc[0] + Math.cos(a) * 0.78, dc[1] + Math.sin(a) * 0.78, dc[2] + 0.05, Math.cos(a), Math.sin(a), 0.1, 1, 1, 1, O));
    }
    body.push(seg(-0.62, 1.22, 0.56, dc[0], dc[1], dc[2] - 0.02, 0.07, 0.09, 6, O)); // grip strut
  } else {
    arm(1, 0.36, 1.3, 0.12, 0.34, 1.22, 0.3, 0.75);
    arm(-1, 0.36, 1.3, 0.12, 0.34, 1.22, 0.3, 0.75);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) body.push(mkDir(crystal(0.02, 0.2, 4), s * 0.34, 1.22, 0.3, s * (0.3 + 0.35 * i) - 0.2 * s, -0.5, 0.7, 1, 1, 1, O)); // claws
    // mirror wings on the back
    for (const s of [-1, 1]) {
      body.push(mkDir(crystal(0.07, 0.95, 4, 0.25), s * 0.18, 1.45, -0.14, s * 1.0, 0.7, -0.45, 0.35, 1, 1, O));
      body.push(mkDir(crystal(0.06, 0.72, 4, 0.25), s * 0.16, 1.35, -0.14, s * 1.2, -0.1, -0.55, 0.35, 1, 1, O));
    }
  }
  // dorsal shards
  for (let i = 0; i < 3; i++) body.push(mkDir(crystal(0.04, 0.3 - i * 0.05, 4), 0, 1.5 - i * 0.2, -0.14 * bw - 0.06, 0, 0.5, -1, 1, 1, 1, O));

  // head
  const hy = 1.88 + 0.03 * hs;
  body.push(mk(ico(1), 0, hy, 0, 0, 0, 0, 0.165 * hs, 0.215 * hs, 0.165 * hs, O));
  glass.push(mk(new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, 0.95), 0, hy - 0.005 * hs, 0.108 * hs, Math.PI / 2, 0, 0, 0.152 * hs, 0.075 * hs, 0.2 * hs, OG)); // smug mirror face
  // smirk
  const faceZ = (x, y) => {
    const u = x / (0.152 * hs), vv = y / (0.2 * hs), q = Math.max(0.04, 1 - u * u - vv * vv);
    return 0.108 * hs + 0.075 * hs * Math.sqrt(q) + 0.004;
  };
  const sp = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x = (-0.075 + 0.17 * t) * hs;
    const y = (-0.052 - 0.045 * Math.sin(t * Math.PI) + 0.045 * t * t) * hs;
    sp.push(new THREE.Vector3(x, hy + y, faceZ(x, y)));
  }
  const smirkGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 14, 0.0085 * (hs > 1.2 ? 1.0 : 1), 4, false);

  // crown + collar + drifting shards (one rotating mesh around the vertical axis)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU, tl = 0.5;
    shards.push(mkDir(crystal(0.032 * hs, i % 2 ? 0.2 * hs : 0.32 * hs, 4), Math.sin(a) * 0.1 * hs, hy + 0.17 * hs, Math.cos(a) * 0.1 * hs,
      Math.sin(a) * Math.sin(tl), Math.cos(tl), Math.cos(a) * Math.sin(tl), 1, 1, 1, O));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    shards.push(mkDir(crystal(0.03, 0.17, 4), Math.sin(a) * 0.17, 1.74, Math.cos(a) * 0.15, Math.sin(a) * 1.2, 0.5, Math.cos(a) * 1.2, 1, 1, 1, O));
  }
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4, r = 0.07 + 0.017 * i, h = 0.26 - 0.014 * i, by = 0.56 - i * 0.03;
    shards.push(mkDir(crystal(0.028 + 0.004 * (i % 3), h, 4), Math.cos(a) * r, by, Math.sin(a) * r, Math.cos(a) * 0.25, -1, Math.sin(a) * 0.25, 1, 1, 1, O));
  }

  const bodyMat = chromeMat(0x2a2060, 0.5);
  const glassMat = new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0.95, roughness: 0.06, envMap: getEnv(), envMapIntensity: 1.35,
    emissive: new THREE.Color(0x5cc8ff), emissiveIntensity: 0.12,
  });
  const smirkMat = new THREE.MeshStandardMaterial({ color: 0x0a2a2a, emissive: new THREE.Color(0x7dfff0), emissiveIntensity: 1.8, roughness: 0.4, metalness: 0 });
  const iceMat = iceMaterial(0.0);

  const bodyMesh = new THREE.Mesh(merge(body), bodyMat);
  const shardMesh = new THREE.Mesh(merge(shards), bodyMat);
  const glassMesh = new THREE.Mesh(merge(glass), glassMat);
  const smirkMesh = new THREE.Mesh(smirkGeo, smirkMat);

  // prebuilt ice block (hidden until sealed)
  const iw = [0.7, 1.05, 0.5][variant], ih = [2.45, 2.5, 1.4][variant];
  const iceParts = [prep(lathe([[0.001, -0.02], [0.52 * iw, 0.06 * ih], [0.74 * iw, 0.3 * ih], [0.7 * iw, 0.76 * ih], [0.5 * iw, 0.96 * ih], [0.001, 1.04 * ih]], 6))];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    const g = prep(crystal(0.1 * iw * 1.6, ih * (0.2 + 0.1 * (i % 2)), 4, 0.4));
    g.rotateZ(-0.9); g.rotateY(a); g.translate(Math.sin(a) * 0.62 * iw, 0.02, Math.cos(a) * 0.62 * iw);
    iceParts.push(g);
  }
  const iceGeo = merge(iceParts); iceGeo.computeVertexNormals();
  const ice = new THREE.Mesh(iceGeo, iceMat);
  ice.visible = false; ice.renderOrder = 2;

  const group = new THREE.Group(); group.name = 'MirrorEcho' + variant;
  const root = new THREE.Group(); root.scale.setScalar(V.sc);
  const hover = new THREE.Group(); hover.position.y = 0.06;
  hover.add(bodyMesh, shardMesh, glassMesh, smirkMesh);
  root.add(hover, ice); group.add(root);
  const radius = [0.62, 0.95, 0.4][variant];

  let state = 'idle', atk = 0, seal = 0, clk = 0;
  const off = variant * 1.9;
  function setState(s) {
    state = s;
    ice.visible = s === 'sealed' || seal > 0.02;
  }
  function update(dt, t) {
    const k = 1 - Math.exp(-dt * 6);
    atk += ((state === 'attack' ? 1 : 0) - atk) * k;
    seal += ((state === 'sealed' ? 1 : 0) - seal) * k;
    if (seal < 0.02 && state !== 'sealed') ice.visible = false; else ice.visible = true;
    clk += dt * (1 - seal);
    hover.position.y = 0.07 + Math.sin(clk * 1.7 + off) * 0.045;
    hover.rotation.z = Math.sin(clk * 0.9 + off) * 0.035;
    hover.rotation.x = -0.16 * atk + Math.sin(clk * 1.3 + off) * 0.015;
    shardMesh.rotation.y = clk * 0.4;
    const pulse = 0.5 - 0.5 * Math.cos(clk * TAU * 0.8);   // 0.8 Hz max
    smirkMat.emissiveIntensity = 1.8 + atk * pulse * 2.4 - seal * 1.5;
    glassMat.emissiveIntensity = 0.12 + atk * (0.15 + 0.7 * pulse) - seal * 0.08;
    bodyMat.color.setRGB(1 - 0.22 * seal, 1 - 0.04 * seal, 1);
    iceMat.opacity = 0.46 * seal;
  }
  update(0, 0);
  return { group, update, setState, radius };
}

/* ------------------------------------------------------------------ EVER-GLASS */
export function buildEverGlass() {
  const O = { freq: 0.34, seed: 0.3 };
  const OG = { freq: 0.3, seed: 1.1, pal: 1, mul: 1.05 };

  /* ---- torso (cathedral) : built in absolute coordinates, pivot y=7 ---- */
  const T = [];
  T.push(mk(lathe([[1.2, 7.0], [2.4, 9], [3.2, 11.5], [3.9, 14], [4.9, 16.2], [5.6, 17.6], [4.2, 19.0], [2.2, 19.9]], 10), 0, 0, 0, 0, 0.31, 0, 1, 1, 0.62, O));
  const archShape = (w, hs, ap) => {
    const hw = w / 2, s = new THREE.Shape();
    s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, hs);
    s.quadraticCurveTo(hw * 0.92, hs + ap * 0.72, 0, hs + ap);
    s.quadraticCurveTo(-hw * 0.92, hs + ap * 0.72, -hw, hs);
    s.lineTo(-hw, 0);
    return s;
  };
  const archHole = (w, hs, ap, y0) => {
    const hw = w / 2, p = new THREE.Path();
    p.moveTo(-hw, y0); p.lineTo(-hw, y0 + hs);
    p.quadraticCurveTo(-hw * 0.92, y0 + hs + ap * 0.72, 0, y0 + hs + ap);
    p.quadraticCurveTo(hw * 0.92, y0 + hs + ap * 0.72, hw, y0 + hs);
    p.lineTo(hw, y0); p.lineTo(-hw, y0);
    return p;
  };
  const facade = archShape(8.6, 7.2, 3.3);
  facade.holes.push(archHole(5.4, 4.8, 2.5, 1.7));
  const ex = { depth: 0.7, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 1, curveSegments: 5 };
  T.push(mk(new THREE.ExtrudeGeometry(facade, ex), 0, 8.6, 2.1, 0, 0, 0, 1, 1, 1, OG));
  // tracery: mullions across the window
  for (const x of [-1.35, 1.35]) T.push(mkDir(crystal(0.16, 5.2, 4, 0.12), x, 10.5, 2.3, 0, 1, 0, 1, 1, 0.8, O));
  // rose window around the chest core
  T.push(mk(new THREE.TorusGeometry(1.8, 0.2, 5, 12), 0, 13.9, 2.6, 0, 0, 0, 1, 1, 1, OG));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    T.push(mkDir(crystal(0.14, 1.0, 4), Math.cos(a) * 1.9, 13.9 + Math.sin(a) * 1.9, 2.6, Math.cos(a), Math.sin(a), 0.15, 1, 1, 0.7, O));
  }
  // flying buttresses
  for (const s of [-1, 1]) {
    T.push(seg(s * 6.0, 17.2, 0.4, s * 3.8, 8.2, 1.0, 0.6, 0.32, 4, O, 1.2));
    T.push(seg(s * 6.6, 16.4, -1.6, s * 3.4, 8.0, -1.2, 0.6, 0.3, 4, O, 1.2));
    T.push(seg(s * 6.2, 15.8, 1.6, s * 4.4, 10.2, 2.0, 0.35, 0.22, 4, O));
  }
  // spires around the neck + along the shoulder line
  for (const s of [-1, 1]) {
    T.push(mkDir(crystal(0.85, 7.0, 4, 0.22), s * 2.7, 18.8, -0.5, s * 0.1, 1, -0.05, 1, 1, 1, O));
    T.push(mkDir(crystal(0.55, 4.6, 4, 0.22), s * 4.0, 18.5, 0.2, s * 0.22, 1, 0, 1, 1, 1, O));
    // shoulders
    T.push(mk(ico(1), s * 7.7, 17.3, 0, 0, 0, 0, 2.9, 1.5, 2.5, O));
    T.push(mk(ico(1), s * 8.4, 18.5, 0.2, 0, 0, -s * 0.3, 2.3, 0.9, 2.0, O));
    for (let i = 0; i < 5; i++) {
      T.push(mkDir(crystal(0.42, 2.2 + 1.0 * Math.sin(i * 1.3 + 0.5) + 1.0, 5), s * (6.2 + 0.95 * i), 18.3 + 0.1 * i, -0.2, s * (0.1 + 0.2 * i), 1, 0.08 * (i - 2), 1, 1, 1, O));
    }
    // pauldron front plate
    T.push(mk(ico(0), s * 7.6, 17.4, 2.0, 0, 0, 0, 1.6, 1.2, 0.5, OG));
  }
  // back fan of tall glass plates
  for (let i = -3; i <= 3; i++) {
    T.push(mkDir(crystal(1.05, 8.5 - Math.abs(i) * 1.1, 4, 0.2), i * 1.9, 13.0, -2.7, i * 0.13, 1, -0.22, 1, 1, 0.3, OG, i));
  }
  const torsoGeo = merge(T); torsoGeo.translate(0, -7, 0);

  /* ---- head (pivot at y=22) ---- */
  const H = [];
  H.push(mk(lathe([[0.001, -2.7], [0.9, -2.1], [1.7, -0.9], [2.0, 0.5], [1.7, 1.8], [0.9, 2.6], [0.001, 2.9]], 8), 0, 0, 0, 0, 0.39, 0, 1, 1, 0.88, O));
  H.push(mk(new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, 1.0), 0, 0.1, 1.2, Math.PI / 2, 0, 0, 1.35, 0.8, 2.2, OG)); // featureless mirror face
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    H.push(mkDir(crystal(0.35, 2.3 - 0.4 * (i % 2), 5), Math.sin(a) * 0.9, 2.4, Math.cos(a) * 0.7 - 0.2, Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3 - 0.1, 1, 1, 1, O));
  }
  for (const s of [-1, 1]) {
    H.push(mkDir(crystal(0.3, 2.1, 4), s * 1.6, -1.2, 0.3, s * 0.7, -1, 0.3, 1, 1, 1, O));
    H.push(mkDir(crystal(0.22, 1.5, 4), s * 1.9, 0.2, -0.2, s * 1.0, -0.3, -0.1, 1, 1, 1, O));
  }
  for (let i = 0; i < 6; i++) { // cradle holding the crown core
    const a = (i / 6) * TAU + 0.3;
    H.push(mkDir(crystal(0.12, 1.5, 4), Math.sin(a) * 0.85, 3.0, Math.cos(a) * 0.85 + 0.2, Math.sin(a) * 0.35, 1, Math.cos(a) * 0.35, 1, 1, 1, O));
  }
  const headGeo = merge(H);
  const faceZ = (x, y) => { const u = x / 1.35, v = (y - 0.1) / 2.2, q = Math.max(0.04, 1 - u * u - v * v); return 1.2 + 0.8 * Math.sqrt(q) + 0.04; };
  const sp = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, x = -1.0 + 2.5 * t, y = -0.85 - 0.5 * Math.sin(t * Math.PI) + 0.5 * t * t;
    sp.push(new THREE.Vector3(x, y, faceZ(x, y)));
  }
  const smirkGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 20, 0.075, 4, false);

  /* ---- arms (pivot at shoulder) ---- */
  const armGeo = s => {
    const A = [];
    const E = [s * 2.3, -7.2, 1.6], W = [s * 3.0, -12.2, 3.4];
    const chain = (p0, p1, r0, r1, n, seed) => {
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = t0 + 0.8 / n;
        const j = (hash(seed + i) - 0.5) * 0.3;
        A.push(seg(p0[0] + (p1[0] - p0[0]) * t0 + j, p0[1] + (p1[1] - p0[1]) * t0, p0[2] + (p1[2] - p0[2]) * t0 - j,
          p0[0] + (p1[0] - p0[0]) * t1 + j, p0[1] + (p1[1] - p0[1]) * t1, p0[2] + (p1[2] - p0[2]) * t1 - j,
          r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, 6, i % 2 ? OG : O, 0.8, hash(seed * 3 + i) * TAU));
      }
    };
    chain([0, -0.5, 0], E, 1.35, 0.95, 5, 11 + s);
    A.push(mk(ico(1), E[0], E[1], E[2], 0, 0, 0, 1.3, 1.3, 1.15, O));
    for (let i = 0; i < 4; i++) A.push(mkDir(crystal(0.3, 1.7, 4), E[0] + s * 0.3, E[1] + 0.2 * i - 0.2, E[2] - 0.4, s * 0.9, 0.2 * (i - 1.5), -0.5, 1, 1, 1, O));
    chain(E, W, 0.95, 1.3, 5, 23 + s);
    A.push(mk(ico(1), W[0] + s * 0.1, W[1] - 0.8, W[2] + 0.3, 0, 0, 0, 1.5, 1.05, 1.15, O)); // palm
    for (let i = 0; i < 5; i++) {
      const f = (i - 2) / 2;
      A.push(mkDir(crystal(0.25, 3.3 - 0.35 * Math.abs(f) * 2, 5), W[0] + s * f * 1.0 + s * 0.1, W[1] - 1.3, W[2] + 0.5 + 0.05 * f, s * f * 0.28, -1, 0.35 + 0.1 * Math.abs(f), 1, 1, 1, O));
    }
    A.push(mkDir(crystal(0.22, 2.3, 4), W[0] - s * 1.2, W[1] - 0.8, W[2] + 0.7, -s * 0.9, -0.6, 0.5, 1, 1, 1, O)); // thumb
    return merge(A);
  };

  /* ---- halo, orbit shards, pedestal ---- */
  const HL = [];
  const HR = 4.5;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU, len = i % 2 ? 0.8 : 1.3;
    HL.push(mkDir(crystal(0.42, len * 1.5, 4), Math.cos(a) * HR, Math.sin(a) * HR, 0, Math.cos(a), Math.sin(a), 0, 1, 1, 0.6, i % 3 ? O : OG, i));
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.1;
    HL.push(mkDir(crystal(0.4, 1.7, 4), Math.cos(a) * 3.5, Math.sin(a) * 3.5, 0, -Math.sin(a), Math.cos(a), 0, 1, 1, 0.5, OG, i * 0.7));
  }
  HL.push(mk(new THREE.TorusGeometry(4.3, 0.2, 4, 48), 0, 0, 0, 0, 0, 0, 1, 1, 1, OG));
  const haloGeo = merge(HL);

  const orbit = (n, r0, r1, y0, y1, seed, big) => {
    const L = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + hash(seed + i) * 0.4, r = r0 + (r1 - r0) * hash(seed + i * 1.7);
      const y = y0 + (y1 - y0) * ((i * 0.618) % 1);
      const hh = hash(seed + i * 3.1), len = big * (0.9 + 2.2 * hh);
      const plate = i % 3 === 0;
      L.push(mkDir(crystal(0.3 + 0.22 * hh + (plate ? 0.3 : 0), len, plate ? 6 : 4), Math.cos(a) * r, y, Math.sin(a) * r,
        -Math.sin(a), 0.35 * (hash(seed + i * 9) - 0.5), Math.cos(a), 1, 1, plate ? 0.28 : 1, i % 2 ? O : OG, i));
    }
    return merge(L);
  };
  const orbitAGeo = orbit(44, 13, 17, 4, 25, 5, 1.25);
  const orbitBGeo = orbit(30, 6.5, 9.5, 19.5, 27.5, 41, 1.0);

  const D = [];
  D.push(mkDir(crystal(1.7, 7.3, 6, 0.28), 0, 7.4, 0, 0, -1, 0, 1, 1, 1, O));
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996, r = 1.7 + 2.6 * ((i * 0.37) % 1), by = 7.0 - r * 0.5, len = Math.min(by - 0.2, 3.4 + 2.3 * hash(i + 7));
    D.push(mkDir(crystal(0.34 + 0.2 * hash(i), len, 4), Math.cos(a) * r, by, Math.sin(a) * r, Math.cos(a) * 0.22, -1, Math.sin(a) * 0.22, 1, 1, 1, i % 2 ? O : OG));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, r = 3.4 + 0.9 * hash(i + 2);
    D.push(mk(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 6), Math.cos(a) * r, 7.6 + 1.1 * hash(i + 9), Math.sin(a) * r, 0.5 * Math.cos(a), a, 0.5 * Math.sin(a), 1, 1, 1, OG));
  }
  const driftGeo = merge(D);

  /* ---- materials ---- */
  const mainMat = chromeMat(0x332a5c, 0.6, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const lineMat = new THREE.LineBasicMaterial({ color: 0x33ffee, transparent: true, opacity: 0, depthWrite: false });
  const smirkMat = new THREE.MeshStandardMaterial({ color: 0x102a2a, emissive: new THREE.Color(0x9dfff2), emissiveIntensity: 2.0, roughness: 0.4 });
  const iceMat = iceMaterial(0.55);
  const monMat = iceMaterial(0.0);

  /* ---- scene graph ---- */
  const group = new THREE.Group(); group.name = 'EverGlass';
  const upper = new THREE.Group(); group.add(upper);

  const torso = new THREE.Mesh(torsoGeo, mainMat); torso.position.y = 7; upper.add(torso);
  const head = new THREE.Group(); head.position.y = 22; head.scale.setScalar(1.2); upper.add(head);
  const headMesh = new THREE.Mesh(headGeo, mainMat); head.add(headMesh);
  head.add(new THREE.Mesh(smirkGeo, smirkMat));
  const armL = new THREE.Mesh(armGeo(-1), mainMat), armR = new THREE.Mesh(armGeo(1), mainMat);
  armL.position.set(-8.2, 17.0, 0.6); armR.position.set(8.2, 17.0, 0.6); upper.add(armL, armR);
  const halo = new THREE.Mesh(haloGeo, mainMat); halo.position.set(0, 22.3, -2.5); upper.add(halo);
  const orbA = new THREE.Mesh(orbitAGeo, mainMat), orbB = new THREE.Mesh(orbitBGeo, mainMat), drift = new THREE.Mesh(driftGeo, mainMat);
  group.add(orbA, orbB, drift);

  const edgeOf = (mesh, ang) => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, ang), lineMat); mesh.add(l); return l; };
  const edges = [edgeOf(torso, 30), edgeOf(headMesh, 28), edgeOf(armL, 30), edgeOf(armR, 30)];

  // gold cracks (phase 3)
  const cp = [];
  const crack = (x, y, z0, n, seed, face) => {
    let px = x, py = y;
    for (let i = 0; i < n; i++) {
      const a = (hash(seed + i * 1.3) - 0.5) * 2.2 - Math.PI / 2 + (hash(seed) - 0.5) * 2;
      const nx = px + Math.cos(a) * (face ? 0.35 : 0.8), ny = py + Math.sin(a) * (face ? 0.35 : 0.8);
      cp.push(px, py, face ? faceZ(px, py) + 0.04 : z0, nx, ny, face ? faceZ(nx, ny) + 0.04 : z0);
      px = nx; py = ny;
    }
  };
  const crackGeoT = [], crackGeoH = [];
  void crackGeoT; void crackGeoH;
  const torsoCracks = []; const headCracks = [];
  { // torso frame sides (world coords, parent = upper)
    for (let i = 0; i < 6; i++) { cp.length = 0; const s = i % 2 ? 1 : -1; crack(s * (3.4 + 0.5 * hash(i)), 17.5 - i * 1.0, 3.12, 6, i * 7 + 1, false); torsoCracks.push(...cp); }
    for (let i = 0; i < 5; i++) { cp.length = 0; crack(-0.9 + i * 0.5, 0.9 - (i % 2) * 0.3, 0, 5, i * 5 + 40, true); headCracks.push(...cp); }
  }
  const crackMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false });
  const cgT = new THREE.BufferGeometry(); cgT.setAttribute('position', new THREE.Float32BufferAttribute(torsoCracks, 3));
  const cgH = new THREE.BufferGeometry(); cgH.setAttribute('position', new THREE.Float32BufferAttribute(headCracks, 3));
  const crackT = new THREE.LineSegments(cgT, crackMat); upper.add(crackT);
  const crackH = new THREE.LineSegments(cgH, crackMat); head.add(crackH);

  // weak-point cores
  const mkCore = (x, y, z, r, parent, name) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({
      color: 0xd6f4ff, emissive: new THREE.Color(0x66e8ff), emissiveIntensity: 1.8, roughness: 0.15, metalness: 0.3, envMap: getEnv(), envMapIntensity: 1.0,
    }));
    m.scale.set(1, 1.25, 1); m.position.set(x, y, z); m.name = name;
    const sg = [prep(new THREE.IcosahedronGeometry(r * 1.6, 0))];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, g = prep(crystal(r * 0.3, r * 1.4, 4, 0.4));
      g.rotateZ(Math.PI / 2 - 0.35 + 0.1 * (i % 2)); g.rotateY(a); g.translate(Math.sin(a) * r * 1.3, 0, Math.cos(a) * r * 1.3);
      sg.push(g);
    }
    const sgeo = merge(sg); sgeo.computeVertexNormals();
    const shell = new THREE.Mesh(sgeo, iceMat); shell.visible = false; shell.renderOrder = 2; m.add(shell);
    m.userData = { shell, sealT: 0, sealing: false };
    parent.add(m);
    return m;
  };
  const cores = [
    mkCore(-7.7, 17.7, 3.0, 0.85, upper, 'shoulderL'),
    mkCore(7.7, 17.7, 3.0, 0.85, upper, 'shoulderR'),
    mkCore(0, 13.9, 3.0, 1.1, upper, 'chest'),
    mkCore(0, 3.7, 0.3, 0.75, head, 'crown'),
  ];

  // monument shell
  const mon = new THREE.Mesh((() => {
    const l = [prep(lathe([[0.001, -0.3], [5, 0.8], [11, 5], [15.2, 10], [15.6, 15.5], [12, 21], [8.8, 25], [6, 28.8], [0.001, 30.5]], 12))];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, g = prep(crystal(0.9, 5 + 3 * hash(i), 5, 0.35));
      g.rotateZ(-0.55); g.rotateY(a); g.translate(Math.sin(a) * 15.5, 0, Math.cos(a) * 15.5); l.push(g);
    }
    const g = merge(l); g.computeVertexNormals(); return g;
  })(), monMat);
  mon.visible = false; mon.renderOrder = 3; group.add(mon);

  /* ---- state ---- */
  const PH = {
    1: { col: [1, 1, 1], em: [0.2, 0.16, 0.36], ei: 0.6, lc: [0.6, 0.8, 1.0], la: 0.0, ca: 0, hs: 0.12, sm: [0.6, 1, 0.95] },
    2: { col: [0.26, 0.32, 0.58], em: [0.04, 0.18, 0.34], ei: 0.9, lc: [0.2, 1.0, 0.95], la: 0.95, ca: 0, hs: 0.18, sm: [0.3, 1, 1] },
    3: { col: [0.85, 0.5, 0.1], em: [0.9, 0.4, 0.03], ei: 0.7, lc: [1.0, 0.93, 0.55], la: 1.0, ca: 1.0, hs: 0.24, sm: [1, 0.8, 0.3] },
  };
  const SEALED = { col: [0.72, 0.92, 1.0], em: [0.12, 0.36, 0.55], ei: 0.55, lc: [0.7, 0.95, 1.0], la: 0.3, ca: 0, hs: 0, sm: [0.6, 0.9, 1] };
  const cur = { col: [1, 1, 1], em: [0.2, 0.16, 0.36], ei: 0.6, lc: [0.6, 0.8, 1.0], la: 0, ca: 0, hs: 0.12, sm: [0.6, 1, 0.95] };
  let phase = 1, sealedAll = false, tsc = 1, clk = 0, monA = 0;
  const approach = (a, b, k) => a + (b - a) * k;

  function setPhase(n) { phase = n === 2 ? 2 : n === 3 ? 3 : 1; }
  function sealWeakPoint(i) { const c = cores[i]; if (c && !c.userData.sealing) { c.userData.sealing = true; c.userData.shell.visible = true; c.userData.shell.scale.setScalar(0.01); } }
  function setSealedAll() { sealedAll = true; for (let i = 0; i < 4; i++) sealWeakPoint(i); mon.visible = true; }

  function update(dt, t) {
    const tg = sealedAll ? SEALED : PH[phase];
    const k = 1 - Math.exp(-dt * 2.2);
    for (let i = 0; i < 3; i++) { cur.col[i] = approach(cur.col[i], tg.col[i], k); cur.em[i] = approach(cur.em[i], tg.em[i], k); cur.lc[i] = approach(cur.lc[i], tg.lc[i], k); cur.sm[i] = approach(cur.sm[i], tg.sm[i], k); }
    cur.ei = approach(cur.ei, tg.ei, k); cur.la = approach(cur.la, tg.la, k); cur.ca = approach(cur.ca, tg.ca, k); cur.hs = approach(cur.hs, tg.hs, k);
    mainMat.color.setRGB(cur.col[0], cur.col[1], cur.col[2]);
    mainMat.emissive.setRGB(cur.em[0], cur.em[1], cur.em[2]); mainMat.emissiveIntensity = cur.ei;
    lineMat.color.setRGB(cur.lc[0], cur.lc[1], cur.lc[2]); lineMat.opacity = cur.la;
    crackMat.opacity = cur.ca;
    const lv = cur.la > 0.02; for (let i = 0; i < 4; i++) edges[i].visible = lv;
    crackT.visible = crackH.visible = cur.ca > 0.02;
    smirkMat.emissive.setRGB(cur.sm[0], cur.sm[1], cur.sm[2]);
    smirkMat.emissiveIntensity = sealedAll ? 0.2 : 2.0;

    tsc = approach(tsc, sealedAll ? 0 : 1, 1 - Math.exp(-dt * 1.2));
    clk += dt * tsc;
    const br = Math.sin(clk * 0.7);
    torso.scale.set(1 + br * 0.012, 1 + br * 0.02, 1 + br * 0.012);
    upper.position.y = Math.sin(clk * 0.45) * 0.15;
    upper.rotation.y = Math.sin(clk * 0.2) * 0.02;
    head.position.y = 22 + Math.sin(clk * 0.8 + 1) * 0.12;
    head.rotation.y = Math.sin(clk * 0.3) * 0.05;
    armL.rotation.set(Math.sin(clk * 0.55) * 0.025, 0, Math.sin(clk * 0.5 + 0.5) * 0.03);
    armR.rotation.set(Math.sin(clk * 0.55 + 1.5) * 0.025, 0, -Math.sin(clk * 0.5 + 2) * 0.03);
    halo.rotation.z += dt * cur.hs * tsc;
    orbA.rotation.y += dt * 0.07 * tsc;
    orbB.rotation.y -= dt * 0.11 * tsc;
    drift.rotation.y += dt * 0.05 * tsc;

    for (let i = 0; i < 4; i++) {
      const c = cores[i], u = c.userData, m = c.material;
      if (u.sealing) {
        u.sealT = Math.min(1, u.sealT + dt / 1.4);
        const e = 1 - Math.pow(1 - u.sealT, 3);
        u.shell.scale.setScalar(Math.max(0.01, e));
        m.emissiveIntensity = 1.8 + (0.15 - 1.8) * e;
        m.emissive.setRGB(0.4 + (0.18 - 0.4) * e, 0.91 + (0.4 - 0.91) * e, 1.0 + (0.6 - 1.0) * e);
      } else {
        m.emissiveIntensity = 1.8 + 0.4 * Math.sin(clk * TAU * 0.4 + i);
      }
    }
    monA = approach(monA, sealedAll ? 0.3 : 0, 1 - Math.exp(-dt * 0.9));
    monMat.opacity = monA;
  }
  update(0, 0);
  return { group, update, weakPoints: cores, setPhase, sealWeakPoint, setSealedAll };
}
