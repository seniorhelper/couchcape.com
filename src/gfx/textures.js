// CouchCape gfx: procedural PBR texture generator (all original, generated in code).
// getTextureSet(kind, {variant, size, colors, seed}) -> { map, normalMap, roughnessMap, mean, kind, variant }
//   map         : RGBA8 sRGB albedo (detail-level, mostly neutral so vertex/instance colors can tint it)
//   normalMap   : RGBA8 linear, RGB = tangent normal (OpenGL / +Y up), A = absolute roughness (used by triplanar)
//   roughnessMap: RGBA8 linear, G = absolute roughness (three.js convention; material.roughness acts as a multiplier)
// All: RepeatWrapping, mipmaps (trilinear), anisotropy 4, power-of-two <= 1024. Cached per kind|variant|size|colors|seed.
// triplanar(material, set, opts) patches a MeshStandard/Physical material via onBeforeCompile so big merged meshes
// without UVs get world- or object-space triplanar detail (6 texture fetches, no branching).
import * as THREE from 'three';

// ------------------------------------------------------------------ noise (all tileable)
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// smooth value noise with independent integer periods along x and y (tiles exactly over the texture)
function lattice(size, px, py, seed) {
  const r = mulberry(seed), L = new Float32Array(px * py);
  for (let i = 0; i < L.length; i++) L[i] = r();
  const out = new Float32Array(size * size);
  const x0 = new Int32Array(size), x1 = new Int32Array(size), fx = new Float32Array(size);
  for (let x = 0; x < size; x++) { const u = x * px / size, i = Math.floor(u), f = u - i; fx[x] = f * f * (3 - 2 * f); x0[x] = i % px; x1[x] = (i + 1) % px; }
  for (let y = 0; y < size; y++) {
    const v = y * py / size, j = Math.floor(v); let g = v - j; g = g * g * (3 - 2 * g);
    const r0 = (j % py) * px, r1 = ((j + 1) % py) * px, row = y * size;
    for (let x = 0; x < size; x++) {
      const a = L[r0 + x0[x]], b = L[r0 + x1[x]], c = L[r1 + x0[x]], d = L[r1 + x1[x]], f = fx[x];
      out[row + x] = a + (b - a) * f + (c - a) * g + (a - b - c + d) * f * g;
    }
  }
  return out;
}
// fractal sum; ridged=true gives sharp crests (craggy rock)
function fbm(size, period, oct, seed, { gain = 0.5, ridged = false, py = period } = {}) {
  const out = new Float32Array(size * size); let amp = 1, sum = 0;
  for (let o = 0; o < oct; o++) {
    const px = Math.min(size, period << o), pyy = Math.min(size, py << o);
    const n = lattice(size, px, pyy, seed + o * 1013);
    for (let i = 0; i < n.length; i++) { let v = n[i]; if (ridged) { v = 1 - Math.abs(v * 2 - 1); v *= v; } out[i] += v * amp; }
    sum += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}
// tileable Worley (cellular) noise: f1, f2 in cell units, id = nearest cell hash
function worley(size, cells, seed) {
  const r = mulberry(seed), P = new Float32Array(cells * cells * 2), H = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) { P[i * 2] = r(); P[i * 2 + 1] = r(); H[i] = r(); }
  const f1 = new Float32Array(size * size), f2 = new Float32Array(size * size), id = new Float32Array(size * size);
  const s = cells / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x * s, v = y * s, cx = Math.floor(u), cy = Math.floor(v);
    let d1 = 9, d2 = 9, best = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j, wx = ((gx % cells) + cells) % cells, wy = ((gy % cells) + cells) % cells, k = wy * cells + wx;
      const dx = gx + P[k * 2] - u, dy = gy + P[k * 2 + 1] - v, d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = H[k]; } else if (d < d2) d2 = d;
    }
    const o = y * size + x; f1[o] = d1; f2[o] = d2; id[o] = best;
  }
  return { f1, f2, id };
}
// bilinear wrap sample of a field at fractional pixel coords
function samp(F, size, x, y) {
  x = ((x % size) + size) % size; y = ((y % size) + size) % size;
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, x1 = (xi + 1) % size, y1 = (yi + 1) % size;
  const a = F[yi * size + xi], b = F[yi * size + x1], c = F[y1 * size + xi], d = F[y1 * size + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// ------------------------------------------------------------------ packing
function heightToNormal(h, size, strength, rough, out) {
  const n = out || new Uint8Array(size * size * 4);
  const k = strength * size / 256; // strength is resolution independent
  for (let y = 0; y < size; y++) {
    const up = ((y + 1) % size) * size, dn = ((y - 1 + size) % size) * size, row = y * size;
    for (let x = 0; x < size; x++) {
      const l = (x - 1 + size) % size, r = (x + 1) % size;
      const dx = (h[row + r] - h[row + l]) * k, dy = (h[up + x] - h[dn + x]) * k;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), o = (row + x) * 4;
      n[o] = (-dx * inv * 0.5 + 0.5) * 255; n[o + 1] = (-dy * inv * 0.5 + 0.5) * 255; n[o + 2] = (inv * 0.5 + 0.5) * 255;
      n[o + 3] = clamp(rough[row + x]) * 255;
    }
  }
  return n;
}
function dataTex(u8, size, srgb) {
  const t = new THREE.DataTexture(u8, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.flipY = false; t.needsUpdate = true;
  return t;
}
function srgbOf(h) { const c = new THREE.Color(h).convertLinearToSRGB(); return [c.r, c.g, c.b]; } // sRGB 0..1

// ------------------------------------------------------------------ kinds
// each returns { alb: Float32Array(N*3) sRGB 0..1, h: Float32Array(N) | null, nrm: Float32Array(N*3) | null, rough: Float32Array(N), nStr }
const GEN = {};

GEN.rock = (S, variant, seed) => {
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const base = fbm(S, 4, 6, seed), crag = fbm(S, 6, 5, seed + 7, { ridged: true }), fine = fbm(S, 64, 2, seed + 21);
  const lich = fbm(S, 8, 4, seed + 33), w = worley(S, variant === 'asteroid' ? 12 : variant === 'strata' ? 13 : 7, seed + 13);
  const strata = variant === 'strata', ast = variant === 'asteroid', lichAmt = variant === 'lichen' ? 1 : ast ? 0 : 0.45;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, b = base[i], c = crag[i], f = fine[i];
    const crack = 1 - smooth(0.0, ast ? 0.03 : 0.055, w.f2[i] - w.f1[i]);
    let hh, band = 0;
    if (strata) {
      // warped sedimentary layers with sharp ledges; 6 cycles per tile keeps it tileable
      const sv = y / S * 6 + (b - 0.5) * 1.6 + (samp(crag, S, x * 0.5, y) - 0.5) * 0.25;
      const fr = sv - Math.floor(sv); band = Math.floor(sv);
      const ledge = smooth(0.0, 0.08, fr) * (1 - smooth(0.82, 1.0, fr) * 0.6);
      hh = 0.35 * b + 0.25 * c + 0.35 * ledge - 0.1 * crack * smooth(0.45, 0.7, b) + 0.07 * f;
    } else if (ast) {
      const bowl = smooth(0.42, 0.0, w.f1[i]) * (w.id[i] > 0.55 ? 1 : 0);
      const rim = Math.exp(-(((w.f1[i] - 0.42) / 0.08) ** 2)) * (w.id[i] > 0.55 ? 1 : 0);
      hh = 0.45 * b + 0.2 * c - 0.45 * bowl + 0.2 * rim + 0.1 * f;
    } else hh = 0.42 * b + 0.42 * c - 0.32 * crack + 0.08 * f;
    h[i] = hh;
    // colour: cool grey / warm sand, darker crevices, per-band tint for strata
    let r = mix(0.46, 0.66, b), g = mix(0.44, 0.61, b), bl = mix(0.42, 0.55, b);
    const lift = 0.85 + 0.3 * c; r *= lift; g *= lift; bl *= lift;
    if (strata) { const t = ((band * 0.618) % 1 + 1) % 1; r *= 0.9 + 0.22 * t; g *= 0.9 + 0.15 * t; bl *= 0.92 + 0.06 * t; }
    if (ast) { r = mix(0.27, 0.42, b) * (0.85 + 0.3 * c); g = r * 0.96; bl = r * 0.92; }
    const cav = 1 - crack * (strata ? 0.18 * smooth(0.45, 0.7, b) : 0.55); r *= cav; g *= cav; bl *= cav;
    const sp = 0.92 + 0.16 * f; r *= sp; g *= sp; bl *= sp;
    // lichen grows on exposed crests
    const m = smooth(0.56, 0.68, lich[i]) * smooth(0.35, 0.6, hh) * lichAmt;
    if (m > 0) { const o = f > 0.55; r = mix(r, o ? 0.78 : 0.58, m * 0.85); g = mix(g, o ? 0.52 : 0.63, m * 0.85); bl = mix(bl, o ? 0.24 : 0.34, m * 0.85); }
    alb[i * 3] = r; alb[i * 3 + 1] = g; alb[i * 3 + 2] = bl;
    rough[i] = clamp(0.84 + 0.12 * crack + 0.06 * m - 0.06 * c);
  }
  return { alb, h, rough, nStr: ast ? 5 : 6 };
};

GEN.stone = (S, variant, seed) => { // polished limestone (default) | 'granite' | 'sandstone'
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const m1 = fbm(S, 4, 5, seed), m2 = fbm(S, 32, 3, seed + 5), w = worley(S, variant === 'granite' ? 96 : 48, seed + 9);
  for (let i = 0; i < N; i++) {
    let r, g, b, hh = 0.3 * m1[i] + 0.1 * m2[i], ro;
    const pit = variant === 'polished' ? 0 : smooth(0.18, 0.0, w.f1[i]) * (w.id[i] > 0.8 ? 1 : 0);
    if (variant === 'granite') {
      const sp = w.id[i]; const k = sp < 0.3 ? 0.35 : sp < 0.75 ? 0.75 : 0.95;
      r = k * (0.95 + 0.1 * m1[i]); g = k * 0.97; b = k * 0.98; ro = 0.28 + 0.1 * m2[i];
    } else if (variant === 'sandstone') {
      const band = 0.5 + 0.5 * Math.sin((i / S / S * 10 + m1[i] * 1.5) * Math.PI * 2);
      r = 0.86 + 0.08 * band; g = 0.76 + 0.06 * band; b = 0.62 + 0.04 * band; ro = 0.82; hh += 0.15 * m2[i];
    } else {
      const k = 0.9 + 0.12 * (m1[i] - 0.5) + 0.05 * (m2[i] - 0.5); r = k * 1.0; g = k * 0.985; b = k * 0.96; ro = 0.36 + 0.14 * m2[i];
    }
    hh -= pit * 0.25; const d = 1 - pit * 0.3;
    alb[i * 3] = r * d; alb[i * 3 + 1] = g * d; alb[i * 3 + 2] = b * d; h[i] = hh; rough[i] = clamp(ro + pit * 0.3);
  }
  return { alb, h, rough, nStr: 2.2 };
};

GEN.marble = (S, variant, seed) => { // 'white' | 'rose' | 'gold' | 'black'
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const t = fbm(S, 3, 6, seed), t2 = fbm(S, 6, 5, seed + 3), cl = fbm(S, 2, 4, seed + 9);
  const P = { white: [[0.94, 0.93, 0.91], [0.44, 0.45, 0.5]], rose: [[0.97, 0.88, 0.89], [0.66, 0.42, 0.52]], gold: [[0.95, 0.93, 0.89], [0.80, 0.60, 0.28]], black: [[0.10, 0.10, 0.11], [0.85, 0.83, 0.78]] }[variant] || null;
  const [bc, vc] = P || [[0.94, 0.93, 0.91], [0.44, 0.45, 0.5]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = x / S, v = y / S;
    const s1 = Math.sin(Math.PI * 2 * (u * 2 + v * 1) + t[i] * 7 + t2[i] * 2.5);
    const s2 = Math.sin(Math.PI * 2 * (u * 3 - v * 2) + t2[i] * 8);
    const vein = Math.pow(1 - Math.abs(s1), 14) + 0.55 * Math.pow(1 - Math.abs(s2), 34);
    const veinA = clamp(vein), cloud = (cl[i] - 0.5) * 0.12;
    for (let k = 0; k < 3; k++) alb[i * 3 + k] = clamp(mix(bc[k] + cloud * (k === 2 ? 0.6 : 1), vc[k], veinA * 0.85));
    h[i] = -veinA * 0.15 + t2[i] * 0.04; rough[i] = clamp(0.07 + 0.05 * cl[i] + veinA * 0.12);
  }
  return { alb, h, rough, nStr: 1.2 };
};

GEN.crystal = (S, variant, seed) => { // faceted cells: each cell gets its own tilted facet normal
  const N = S * S, alb = new Float32Array(N * 3), nrm = new Float32Array(N * 3), rough = new Float32Array(N);
  const w = worley(S, 6, seed), inc = fbm(S, 8, 4, seed + 4);
  for (let i = 0; i < N; i++) {
    const id = w.id[i], a = id * 6.2831, tilt = 0.18 + 0.3 * ((id * 7.31) % 1);
    let nx = Math.cos(a) * tilt, ny = Math.sin(a) * tilt; const nz = 1;
    const edge = 1 - smooth(0.0, 0.05, w.f2[i] - w.f1[i]);
    const il = 1 / Math.hypot(nx, ny, nz); nrm[i * 3] = nx * il; nrm[i * 3 + 1] = ny * il; nrm[i * 3 + 2] = nz * il;
    const k = 0.82 + 0.14 * id + 0.18 * edge - 0.1 * smooth(0.55, 0.75, inc[i]);
    alb[i * 3] = clamp(k * 0.97); alb[i * 3 + 1] = clamp(k * 0.98); alb[i * 3 + 2] = clamp(k);
    rough[i] = clamp(0.04 + 0.08 * edge + 0.06 * smooth(0.6, 0.8, inc[i]));
  }
  return { alb, nrm, rough };
};

function brushed(S, seed) { // anisotropic streaks along x (box blur of fine noise), like real brushed metal
  const n = lattice(S, S / 2, S / 2, seed), out = new Float32Array(S * S), low = fbm(S, 4, 3, seed + 2);
  for (let y = 0; y < S; y++) { const row = y * S; for (let x = 0; x < S; x++) { let s = 0; for (let k = -12; k <= 12; k += 2) s += n[row + ((x + k + S) % S)]; out[row + x] = s / 13 * 0.8 + low[row + x] * 0.2; } }
  return out;
}
GEN.metal = (S, variant, seed) => { // 'brushed' (default) | 'painted' | 'steel'
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const b = brushed(S, seed), sm = fbm(S, 4, 3, seed + 8);
  for (let i = 0; i < N; i++) {
    const k = variant === 'painted' ? 0.92 + 0.04 * (sm[i] - 0.5) : 0.86 + 0.12 * (b[i] - 0.5);
    alb[i * 3] = k; alb[i * 3 + 1] = k; alb[i * 3 + 2] = k * 1.01;
    h[i] = variant === 'painted' ? sm[i] * 0.3 : b[i];
    rough[i] = variant === 'painted' ? 0.42 + 0.1 * sm[i] : clamp(0.26 + 0.3 * (b[i] - 0.5) + 0.12 * smooth(0.55, 0.8, sm[i]));
  }
  return { alb, h, rough, nStr: variant === 'painted' ? 1 : 1.6 };
};

GEN.brass = (S, variant, seed) => { // brushed brass/bronze with tarnish patches and fine scratches
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const b = brushed(S, seed), tar = fbm(S, 4, 5, seed + 3), r = mulberry(seed + 11);
  const scr = new Float32Array(N);
  for (let s = 0; s < 260; s++) { // random scratches (wrapped)
    let x = r() * S, y = r() * S; const a = r() * 6.283, len = 10 + r() * S * 0.12, dx = Math.cos(a), dy = Math.sin(a);
    for (let t = 0; t < len; t++) { const xi = (Math.floor(x + dx * t) % S + S) % S, yi = (Math.floor(y + dy * t) % S + S) % S; scr[yi * S + xi] = 1; }
  }
  for (let i = 0; i < N; i++) {
    const t = smooth(0.52, 0.78, tar[i]) * (variant === 'clean' ? 0.2 : 1);
    const k = 0.9 + 0.1 * (b[i] - 0.5) + scr[i] * 0.08;
    alb[i * 3] = clamp(k * (1 - t * 0.45)); alb[i * 3 + 1] = clamp(k * (1 - t * 0.3)); alb[i * 3 + 2] = clamp(k * (1 - t * 0.42));
    h[i] = b[i] * 0.6 - scr[i] * 0.25 + t * 0.15; rough[i] = clamp(0.3 + 0.2 * (b[i] - 0.5) + t * 0.4 - scr[i] * 0.08);
  }
  return { alb, h, rough, nStr: 1.6 };
};

GEN.wood = (S, variant, seed) => { // 'planks' (default) | 'solid'
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const warp = fbm(S, 2, 4, seed, { py: 1 }), grain = fbm(S, 64, 2, seed + 5, { py: 4 }), knot = fbm(S, 4, 3, seed + 9);
  const planks = variant === 'solid' ? 1 : 4, rr = mulberry(seed + 2), offs = Array.from({ length: planks }, () => rr() * 10);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = x / S * planks, p = Math.floor(u), lu = u - p;
    const ring = lu * 2.2 + warp[i] * 1.6 + (knot[i] - 0.5) * 0.8 + offs[p];
    const rf = ring * 6 - Math.floor(ring * 6); const late = smooth(0.62, 0.92, rf) * (1 - smooth(0.92, 1.0, rf));
    const seam = planks > 1 ? 1 - smooth(0.0, 0.012, Math.min(lu, 1 - lu)) : 0;
    const g = grain[i] - 0.5, pt = (offs[p] % 1) * 0.12;
    let r = mix(0.78, 0.55, late) * (1 + g * 0.18 - pt), gg = mix(0.58, 0.37, late) * (1 + g * 0.18 - pt), b = mix(0.38, 0.21, late) * (1 + g * 0.2 - pt);
    const d = 1 - seam * 0.7; alb[i * 3] = r * d; alb[i * 3 + 1] = gg * d; alb[i * 3 + 2] = b * d;
    h[i] = late * 0.12 + g * 0.2 - seam * 0.6; rough[i] = clamp(0.6 + late * 0.1 + seam * 0.3);
  }
  return { alb, h, rough, nStr: 2.4 };
};

GEN.clay = (S, variant, seed) => { // hand-made clay: thumb dents + fingerprint swirls + tiny pits
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const dent = fbm(S, 3, 4, seed), wob = fbm(S, 8, 3, seed + 4), pits = worley(S, 40, seed + 7);
  const r = mulberry(seed + 1), prints = [];
  for (let k = 0; k < 7; k++) prints.push({ x: r(), y: r(), a: r() * Math.PI, R: 0.1 + r() * 0.08 });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = x / S, v = y / S; let ridge = 0;
    for (const p of prints) {
      let dx = u - p.x, dy = v - p.y; dx -= Math.round(dx); dy -= Math.round(dy);
      const ca = Math.cos(p.a), sa = Math.sin(p.a), qx = ca * dx + sa * dy, qy = (-sa * dx + ca * dy) * 1.35;
      const d = Math.sqrt(qx * qx + qy * qy); if (d > p.R) continue;
      const m = smooth(p.R, p.R * 0.45, d);
      ridge = Math.max(ridge, m * (0.5 + 0.5 * Math.sin(d * 260 + wob[i] * 5)));
    }
    const pit = smooth(0.14, 0.0, pits.f1[i]) * (pits.id[i] > 0.85 ? 1 : 0);
    h[i] = dent[i] * 0.7 + ridge * 0.06 - pit * 0.2 + wob[i] * 0.05;
    const k = 0.93 + (dent[i] - 0.5) * 0.08 - ridge * 0.03 - pit * 0.1;
    alb[i * 3] = k; alb[i * 3 + 1] = k * 0.99; alb[i * 3 + 2] = k * 0.97;
    rough[i] = clamp(0.78 - smooth(0.55, 0.8, dent[i]) * 0.18 + pit * 0.15);
  }
  return { alb, h, rough, nStr: 3 };
};

function canvasKind(S, seed, draw) {
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const r = mulberry(seed); draw(g, r, (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); });
  return g.getImageData(0, 0, S, S).data;
}
GEN.grass = (S, variant, seed) => {
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const d = canvasKind(S, seed, (g, r, wrap) => {
    g.fillStyle = '#2f5a24'; g.fillRect(0, 0, S, S); g.lineCap = 'round';
    for (let k = 0; k < 2600 * (S / 512) ** 2; k++) {
      const x = r() * S, y = r() * S, len = S * (0.03 + r() * 0.05), a = -Math.PI / 2 + (r() - 0.5) * 0.9, bend = (r() - 0.5) * len * 0.6;
      const l = 0.3 + r() * 0.7, hue = 80 + r() * 35;
      g.strokeStyle = `hsl(${hue},${45 + r() * 25}%,${18 + l * 32}%)`; g.lineWidth = 1 + r() * 2.2 * S / 512;
      wrap((ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + bend, y + oy + Math.sin(a) * len * 0.5, x + ox + Math.cos(a) * len + bend, y + oy + Math.sin(a) * len); g.stroke(); });
    }
  });
  for (let i = 0; i < N; i++) { const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255; const lum = (r + g * 2 + b) / 4; alb[i * 3] = r * 1.25; alb[i * 3 + 1] = g * 1.25; alb[i * 3 + 2] = b * 1.25; h[i] = lum; rough[i] = 0.88 - lum * 0.15; }
  return { alb, h, rough, nStr: 3 };
};
GEN.foliage = (S, variant, seed) => { // overlapping leaves with midribs
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const d = canvasKind(S, seed, (g, r, wrap) => {
    g.fillStyle = '#1d3d1c'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 900 * (S / 512) ** 2; k++) {
      const x = r() * S, y = r() * S, L = S * (0.035 + r() * 0.035), W = L * (0.38 + r() * 0.2), a = r() * 6.283, l = 0.35 + r() * 0.65;
      const hue = 85 + r() * 40;
      wrap((ox, oy) => {
        g.save(); g.translate(x + ox, y + oy); g.rotate(a);
        const gr = g.createLinearGradient(0, -W, 0, W); gr.addColorStop(0, `hsl(${hue},55%,${14 + l * 22}%)`); gr.addColorStop(0.5, `hsl(${hue},50%,${22 + l * 34}%)`); gr.addColorStop(1, `hsl(${hue},55%,${14 + l * 22}%)`);
        g.fillStyle = gr; g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -W * 1.4, L, 0); g.quadraticCurveTo(0, W * 1.4, -L, 0); g.fill();
        g.strokeStyle = `hsla(${hue},40%,${40 + l * 30}%,0.55)`; g.lineWidth = Math.max(1, W * 0.08); g.beginPath(); g.moveTo(-L * 0.9, 0); g.lineTo(L * 0.9, 0); g.stroke();
        g.restore();
      });
    }
  });
  for (let i = 0; i < N; i++) { const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255; const lum = (r + g * 2 + b) / 4; alb[i * 3] = r * 1.3; alb[i * 3 + 1] = g * 1.3; alb[i * 3 + 2] = b * 1.3; h[i] = lum; rough[i] = 0.62 - lum * 0.2; }
  return { alb, h, rough, nStr: 3.5 };
};

GEN.fabric = (S, variant, seed) => { // over-under weave + fuzz (port of the Attack of the AI weave idea, re-written)
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const fz = fbm(S, 64, 2, seed), sl = fbm(S, 8, 3, seed + 2), cell = S / 64;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, cx = Math.floor(x / cell), cy = Math.floor(y / cell), fx = (x % cell) / cell, fy = (y % cell) / cell;
    const warpOn = ((cx + cy) & 1) === 0;
    const prof = Math.sin(Math.PI * (warpOn ? fy : fx)) ** 0.6, thread = 0.5 + 0.5 * Math.sin((warpOn ? x : y) * 2.2) * 0.4;
    h[i] = prof * (warpOn ? 1 : 0.85) + (thread - 0.5) * 0.08 + (fz[i] - 0.5) * 0.1;
    const k = 0.78 + prof * 0.18 * (warpOn ? 1 : 0.8) + (sl[i] - 0.5) * 0.06;
    alb[i * 3] = k; alb[i * 3 + 1] = k; alb[i * 3 + 2] = k * 1.01; rough[i] = 0.9 - prof * 0.06;
  }
  return { alb, h, rough, nStr: 2.5 };
};

// crisp two-tone op-art; 4x4 supersampled edges + mipmaps fade to an even grey far away (no moire)
GEN.checker = (S, variant, seed, colors) => { // 'checker' | 'stripes' | 'wave' | 'cafe' | 'diamond'
  const N = S * S, alb = new Float32Array(N * 3), rough = new Float32Array(N), h = new Float32Array(N);
  const A = srgbOf(colors?.[0] ?? '#141414'), B = srgbOf(colors?.[1] ?? '#f2f2f2'), M = srgbOf(colors?.[2] ?? '#8a8a8a');
  const n = 8, TAU = Math.PI * 2;
  const f = (u, v) => { // returns 0 (A), 1 (B) or 2 (mortar)
    switch (variant) {
      case 'stripes': return Math.floor(u * n * 2) & 1;
      case 'wave': { const uu = u + 0.045 * Math.sin(TAU * v * 2), vv = v + 0.045 * Math.sin(TAU * u * 2); return (Math.floor(uu * n) + Math.floor(vv * n)) & 1; }
      case 'diamond': return (Math.floor((u + v) * n) + Math.floor((u - v + 1) * n)) & 1;
      case 'cafe': { const row = Math.floor(v * n), fv = v * n - row; if (fv < 0.06) return 2; const sh = (row % 4 === 1 || row % 4 === 3) ? 0.25 * (row % 4 === 1 ? 1 : 3) : 0; return Math.floor(u * n / 2 * 2 + sh * 2) & 1; }
      default: return (Math.floor(u * n) + Math.floor(v * n)) & 1;
    }
  };
  const ss = 4, inv = 1 / (S * ss);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let a = 0, b = 0, m = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) { const k = f((x * ss + i + 0.5) * inv, (y * ss + j + 0.5) * inv); if (k === 0) a++; else if (k === 1) b++; else m++; }
    const t = ss * ss, o = (y * S + x) * 3;
    for (let c = 0; c < 3; c++) alb[o + c] = (A[c] * a + B[c] * b + M[c] * m) / t;
    rough[y * S + x] = 0.45;
  }
  return { alb, h, rough, nStr: 0 };
};

GEN.mirror = (S, variant, seed) => { // near-perfect mirror with faint smudges (reflection comes from the env map)
  const N = S * S, alb = new Float32Array(N * 3), h = new Float32Array(N), rough = new Float32Array(N);
  const sm = fbm(S, 4, 5, seed), ri = fbm(S, 2, 2, seed + 3);
  for (let i = 0; i < N; i++) { alb[i * 3] = alb[i * 3 + 1] = alb[i * 3 + 2] = 0.96; h[i] = ri[i] * 0.15; rough[i] = clamp(0.025 + 0.09 * smooth(0.55, 0.85, sm[i])); }
  return { alb, h, rough, nStr: 0.6 };
};

const DEFAULT_SIZE = { rock: 1024, checker: 1024, marble: 1024 };
export const TEXTURE_KINDS = Object.keys(GEN);
const CACHE = new Map();

export function getTextureSet(kind, { variant = 'default', size, colors, seed = 1337 } = {}) {
  if (!GEN[kind]) throw new Error('unknown texture kind ' + kind);
  const S = Math.min(1024, size || DEFAULT_SIZE[kind] || 512);
  const key = `${kind}|${variant}|${S}|${colors ? colors.join(',') : ''}|${seed}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const t0 = performance.now();
  const g = GEN[kind](S, variant, seed, colors);
  const N = S * S, a8 = new Uint8Array(N * 4); let lum = 0;
  for (let i = 0; i < N; i++) {
    const r = clamp(g.alb[i * 3]), gg = clamp(g.alb[i * 3 + 1]), b = clamp(g.alb[i * 3 + 2]);
    a8[i * 4] = r * 255; a8[i * 4 + 1] = gg * 255; a8[i * 4 + 2] = b * 255; a8[i * 4 + 3] = 255;
    lum += 0.2126 * (r ** 2.2) + 0.7152 * (gg ** 2.2) + 0.0722 * (b ** 2.2); // linear mean (for gain)
  }
  let n8;
  if (g.nrm) { n8 = new Uint8Array(N * 4); for (let i = 0; i < N; i++) { n8[i * 4] = (g.nrm[i * 3] * 0.5 + 0.5) * 255; n8[i * 4 + 1] = (g.nrm[i * 3 + 1] * 0.5 + 0.5) * 255; n8[i * 4 + 2] = (g.nrm[i * 3 + 2] * 0.5 + 0.5) * 255; n8[i * 4 + 3] = clamp(g.rough[i]) * 255; } }
  else n8 = heightToNormal(g.h, S, g.nStr || 0, g.rough);
  const r8 = new Uint8Array(N * 4); for (let i = 0; i < N; i++) { const v = clamp(g.rough[i]) * 255; r8[i * 4] = v; r8[i * 4 + 1] = v; r8[i * 4 + 2] = 0; r8[i * 4 + 3] = 255; }
  const set = { kind, variant, size: S, map: dataTex(a8, S, true), normalMap: dataTex(n8, S, false), roughnessMap: dataTex(r8, S, false), mean: lum / N, ms: performance.now() - t0 };
  CACHE.set(key, set);
  return set;
}
export function textureCacheInfo() { return [...CACHE.values()].map((s) => ({ kind: s.kind, variant: s.variant, size: s.size, ms: Math.round(s.ms) })); }

// ------------------------------------------------------------------ triplanar (onBeforeCompile)
// opts: scale (repeats per metre), sharp (blend exponent), space 'world'|'object', normalStr, albAmt (0..1 detail mix),
//       albGain (multiplier on detail albedo; use 1/set.mean to keep the original average colour), fade (metres where detail fades)
export function triplanar(mat, set, { scale = 0.25, sharp = 4, space = 'world', normalStr = 1, albAmt = 1, albGain = 1, fade = 160 } = {}) {
  const U = {
    tpAlb: { value: set.map }, tpNrm: { value: set.normalMap }, tpScale: { value: scale }, tpSharp: { value: sharp },
    tpNS: { value: normalStr }, tpAA: { value: albAmt }, tpAG: { value: albGain }, tpFade: { value: fade },
  };
  mat.userData.tp = U;
  const obj = space === 'object';
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => `tp${obj ? 'o' : 'w'}|${prevKey}`;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vTpP;${obj ? '\nvarying vec3 vTpM0, vTpM1, vTpM2;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
${obj ? `vTpP = transformed; mat4 tpMV = modelViewMatrix;
#ifdef USE_INSTANCING
  tpMV = modelViewMatrix * instanceMatrix;
#endif
vTpM0 = normalize(tpMV[0].xyz); vTpM1 = normalize(tpMV[1].xyz); vTpM2 = normalize(tpMV[2].xyz);` : `vec4 tpWp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  tpWp = instanceMatrix * tpWp;
#endif
vTpP = (modelMatrix * tpWp).xyz;`}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTpP;${obj ? '\nvarying vec3 vTpM0, vTpM1, vTpM2;' : ''}
uniform sampler2D tpAlb, tpNrm; uniform float tpScale, tpSharp, tpNS, tpAA, tpAG, tpFade;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  ${obj ? 'vec3 tpN = normalize(vec3(dot(normal, vTpM0), dot(normal, vTpM1), dot(normal, vTpM2)));' : 'vec3 tpN = inverseTransformDirection(normal, viewMatrix);'}
  vec3 tpW = pow(abs(tpN), vec3(tpSharp)); tpW /= (tpW.x + tpW.y + tpW.z);
  vec3 tpS = step(0.0, tpN) * 2.0 - 1.0;
  vec3 tpp = vTpP * tpScale;
  vec2 uX = vec2(tpp.z * tpS.x, tpp.y), uY = vec2(tpp.x * tpS.y, tpp.z) + 0.37, uZ = vec2(-tpp.x * tpS.z, tpp.y) + 0.71;
  vec4 nX = texture2D(tpNrm, uX), nY = texture2D(tpNrm, uY), nZ = texture2D(tpNrm, uZ);
  float tpK = tpNS * (1.0 - smoothstep(tpFade * 0.35, tpFade, length(vViewPosition)));
  vec3 tX = nX.xyz * 2.0 - 1.0, tY = nY.xyz * 2.0 - 1.0, tZ = nZ.xyz * 2.0 - 1.0;
  tX.xy *= tpK; tY.xy *= tpK; tZ.xy *= tpK;
  tX.x *= tpS.x; tY.x *= tpS.y; tZ.x *= -tpS.z;
  tX = vec3(tX.xy + tpN.zy, abs(tX.z) * tpN.x);
  tY = vec3(tY.xy + tpN.xz, abs(tY.z) * tpN.y);
  tZ = vec3(tZ.xy + tpN.xy, abs(tZ.z) * tpN.z);
  vec3 tpNew = normalize(tX.zyx * tpW.x + tY.xzy * tpW.y + tZ.xyz * tpW.z);
  ${obj ? 'normal = normalize(vTpM0 * tpNew.x + vTpM1 * tpNew.y + vTpM2 * tpNew.z);' : 'normal = normalize((viewMatrix * vec4(tpNew, 0.0)).xyz);'}
  vec3 tpA = texture2D(tpAlb, uX).rgb * tpW.x + texture2D(tpAlb, uY).rgb * tpW.y + texture2D(tpAlb, uZ).rgb * tpW.z;
  diffuseColor.rgb *= mix(vec3(1.0), tpA * tpAG, tpAA);
  roughnessFactor = clamp(roughnessFactor * (nX.a * tpW.x + nY.a * tpW.y + nZ.a * tpW.z), 0.03, 1.0);
}`);
  };
  mat.needsUpdate = true;
  return mat;
}
