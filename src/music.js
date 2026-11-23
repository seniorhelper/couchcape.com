// CouchCape original generative music + ambience. WebAudio only, no audio files, nothing sampled or copied.
// API: new Music(() => audioCtx|null); setTheme(name, instant?); setIntensity(0..1); setVolume(v);
//      duck(amount 0..1, secs); stop(); update(dt). Themes: aurelia board shatterbelt lumen mudlark paradox boss.
// Scheduler: setInterval(25 ms) + AudioContext clock, 120 ms lookahead; update(dt) also pumps (XR frame loop safe).
const MID = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function mkRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- tiny node helpers ----------
const FLOOR = 0.0001;
function envG(c, t, a, peak, d, out) { // exp attack+decay envelope gain -> out
  const g = c.createGain(), p = g.gain; p.setValueAtTime(FLOOR, t);
  p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); p.exponentialRampToValueAtTime(FLOOR, t + a + d);
  g.connect(out); return g;
}
function O(c, type, f, t, end, dest, vol, det) {
  const o = c.createOscillator(); o.type = type; o.frequency.value = f; if (det) o.detune.value = det;
  if (vol !== undefined && vol !== 1) { const g = c.createGain(); g.gain.value = vol; o.connect(g); g.connect(dest); } else o.connect(dest);
  o.start(t); o.stop(end); return o;
}
function LP(c, f, q, dest, type) { const b = c.createBiquadFilter(); b.type = type || 'lowpass'; b.frequency.value = f; b.Q.value = q || 0.5; b.connect(dest); return b; }
function NS(c, M, t, dur, dest) { const s = c.createBufferSource(); s.buffer = M.noise; s.loop = true; s.connect(dest); s.start(t, M.rng() * 1.5); s.stop(t + dur); return s; }
function vib(c, o, t, rate, cents, delay) { // gentle vibrato via detune
  const l = c.createOscillator(), g = c.createGain(); l.frequency.value = rate; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(cents, t + delay);
  l.connect(g); g.connect(o.detune); l.start(t); return l;
}

// ---------- instruments: (ctx, t, freq, dur, vel, out, M) ----------
const INST = {
  pad(c, t, f, d, v, out) { // warm detuned saw pad, low-passed
    const g = c.createGain(), p = g.gain, a = Math.min(1.1, d * 0.4), pk = v * 0.05;
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + a); p.setValueAtTime(pk, t + d); p.linearRampToValueAtTime(0, t + d + 1.4);
    g.connect(out); const lp = LP(c, Math.min(f * 2.6, 1300), 0.3, g), e = t + d + 1.45;
    O(c, 'sawtooth', f, t, e, lp, 1, -7); O(c, 'sawtooth', f, t, e, lp, 1, 7); O(c, 'sine', f * 0.5, t, e, lp, 0.6);
  },
  sine(c, t, f, d, v, out) { // slow soft sine (Shepard layer, drones)
    const g = c.createGain(), p = g.gain, a = Math.min(1.0, d * 0.35), pk = v * 0.075;
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + a); p.setValueAtTime(pk, t + d); p.linearRampToValueAtTime(0, t + d + 1.3);
    g.connect(out); O(c, 'sine', f, t, t + d + 1.35, g);
  },
  drone(c, t, f, d, v, out) {
    const g = c.createGain(), p = g.gain, pk = v * 0.09;
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + 2.2); p.setValueAtTime(pk, t + d); p.linearRampToValueAtTime(0, t + d + 2);
    g.connect(out); const e = t + d + 2.05; O(c, 'sine', f, t, e, g); O(c, 'triangle', f * 1.5, t, e, g, 0.25, 3);
  },
  bass(c, t, f, d, v, out) {
    const g = envG(c, t, 0.012, v * 0.2, d, out), lp = LP(c, 380, 0.4, g), e = t + d + 0.05;
    O(c, 'sine', f, t, e, lp); O(c, 'triangle', f, t, e, lp, 0.35);
  },
  pizz(c, t, f, d, v, out) {
    const g = envG(c, t, 0.005, v * 0.24, 0.22 + d * 0.15, out), lp = LP(c, 1400, 0.5, g), e = t + 0.5;
    O(c, 'triangle', f, t, e, lp); O(c, 'sine', f * 2, t, e, lp, 0.25);
  },
  pluck(c, t, f, d, v, out) { // harp-like
    const g = envG(c, t, 0.006, v * 0.15, d, out), e = t + d + 0.05;
    O(c, 'triangle', f, t, e, g); O(c, 'sine', f * 2, t, e, g, 0.28); O(c, 'sine', f * 3, t, e, g, 0.08);
  },
  gtr(c, t, f, d, v, out) { // soft acoustic pluck
    const g = envG(c, t, 0.006, v * 0.12, d * 0.9, out), lp = LP(c, 2200, 0.6, g), e = t + d + 0.05;
    lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    O(c, 'sawtooth', f, t, e, lp, 0.6); O(c, 'triangle', f, t, e, lp);
  },
  marimba(c, t, f, d, v, out) {
    const g = envG(c, t, 0.003, v * 0.2, 0.3, out), e = t + 0.45; O(c, 'sine', f, t, e, g);
    const h = envG(c, t, 0.002, v * 0.07, 0.07, out); O(c, 'sine', f * 4, t, t + 0.12, h);
  },
  mbox(c, t, f, d, v, out) { // music-box tines
    const g = envG(c, t, 0.004, v * 0.14, 1.1, out), e = t + 1.2;
    O(c, 'sine', f, t, e, g); O(c, 'sine', f * 3.01, t, e, g, 0.12); O(c, 'sine', f * 1.004, t, e, g, 0.4);
  },
  bell(c, t, f, d, v, out) { // shimmering inharmonic bell
    const e = t + d + 0.1, g = envG(c, t, 0.01, v * 0.1, d, out), g2 = envG(c, t, 0.01, v * 0.05, d * 0.6, out), g3 = envG(c, t, 0.01, v * 0.03, d * 0.3, out);
    O(c, 'sine', f, t, e, g); O(c, 'sine', f * 1.004, t, e, g, 0.55); O(c, 'sine', f * 2.76, t, e, g2); O(c, 'sine', f * 5.4, t, e, g3);
  },
  fl(c, t, f, d, v, out) { // woodwind-like sine/triangle with vibrato
    const g = c.createGain(), p = g.gain, pk = v * 0.09, a = 0.07, e = t + d + 0.2;
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + a); p.setValueAtTime(pk * 0.9, t + Math.max(a, d - 0.05)); p.linearRampToValueAtTime(0, t + d + 0.15);
    g.connect(out); const o1 = O(c, 'sine', f, t, e, g), o2 = O(c, 'triangle', f, t, e, g, 0.3);
    const l = vib(c, o1, t, 5.2, 7, 0.3); l.stop(e); const l2 = vib(c, o2, t, 5.2, 7, 0.3); l2.stop(e);
  },
  horn(c, t, f, d, v, out) { // heroic brass-ish, low-passed saws
    const g = c.createGain(), p = g.gain, pk = v * 0.07, a = 0.05, e = t + d + 0.3;
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + a); p.setValueAtTime(pk * 0.85, t + Math.max(a, d - 0.08)); p.linearRampToValueAtTime(0, t + d + 0.25);
    g.connect(out); const lp = LP(c, 700, 0.5, g); lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.18);
    O(c, 'sawtooth', f, t, e, lp, 1, -5); O(c, 'sawtooth', f, t, e, lp, 1, 6);
  },
  synth(c, t, f, d, v, out, M) { // warm synthwave pluck
    const g = envG(c, t, 0.008, v * 0.11, d, out), lp = LP(c, 700, 0.8, g), cut = M.cut || 1500;
    lp.frequency.setValueAtTime(cut * 1.7, t); lp.frequency.exponentialRampToValueAtTime(cut * 0.6, t + 0.2);
    const e = t + d + 0.05; O(c, 'sawtooth', f, t, e, lp, 0.5, -6); O(c, 'triangle', f, t, e, lp, 1, 6);
  },
  lead(c, t, f, d, v, out) {
    const g = c.createGain(), p = g.gain, pk = v * 0.07, a = 0.04, e = t + d + 0.35;
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + a); p.setValueAtTime(pk * 0.8, t + Math.max(a, d - 0.05)); p.linearRampToValueAtTime(0, t + d + 0.3);
    g.connect(out); const lp = LP(c, 1700, 0.6, g), o = O(c, 'triangle', f, t, e, lp); O(c, 'sawtooth', f, t, e, lp, 0.25, 4);
    const l = vib(c, o, t, 5.5, 9, 0.35); l.stop(e);
  },
  // ---- percussion (all soft, no clicks) ----
  kick(c, t, f, d, v, out) {
    const g = envG(c, t, 0.004, v * 0.34, 0.22, out), o = O(c, 'sine', 120, t, t + 0.3, g);
    o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
  },
  stomp(c, t, f, d, v, out) {
    const g = envG(c, t, 0.004, v * 0.28, 0.12, out), o = O(c, 'sine', 90, t, t + 0.2, g);
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.07);
  },
  timp(c, t, f, d, v, out, M) {
    const g = envG(c, t, 0.006, v * 0.3, 0.7, out), o = O(c, 'sine', 80, t, t + 0.85, g);
    o.frequency.setValueAtTime(92, t); o.frequency.exponentialRampToValueAtTime(64, t + 0.25);
    const h = envG(c, t, 0.004, v * 0.05, 0.06, out), lp = LP(c, 600, 0.5, h); NS(c, M, t, 0.12, lp);
  },
  tom(c, t, f, d, v, out) {
    const g = envG(c, t, 0.004, v * 0.22, 0.28, out), o = O(c, 'sine', f > 0 ? f : 150, t, t + 0.4, g);
    o.frequency.setValueAtTime((f > 0 ? f : 150) * 1.25, t); o.frequency.exponentialRampToValueAtTime(f > 0 ? f : 150, t + 0.08);
  },
  pulse(c, t, f, d, v, out) { // slow low swell-thump (shatterbelt/paradox heartbeat)
    const g = c.createGain(), p = g.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(v * 0.28, t + 0.05); p.exponentialRampToValueAtTime(FLOOR, t + 1.4);
    g.connect(out); O(c, 'sine', f, t, t + 1.5, g);
  },
  shaker(c, t, f, d, v, out, M) {
    const g = envG(c, t, 0.012, v * 0.05, 0.06, out), hp = LP(c, 6500, 0.8, g, 'bandpass'); NS(c, M, t, 0.12, hp);
  },
  snare(c, t, f, d, v, out, M) {
    const g = envG(c, t, 0.005, v * 0.08, 0.13, out), bp = LP(c, 1900, 0.7, g, 'bandpass'); NS(c, M, t, 0.2, bp);
    const h = envG(c, t, 0.004, v * 0.08, 0.1, out); O(c, 'triangle', 190, t, t + 0.18, h);
  },
  wood(c, t, f, d, v, out) {
    const g = envG(c, t, 0.003, v * 0.12, 0.07, out); O(c, 'sine', f, t, t + 0.12, g); O(c, 'sine', f * 1.5, t, t + 0.12, g, 0.3);
  },
  cym(c, t, f, d, v, out, M) { // soft cymbal swell
    const g = c.createGain(), p = g.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(v * 0.035, t + 0.6); p.exponentialRampToValueAtTime(FLOOR, t + 1.9);
    g.connect(out); const hp = LP(c, 5500, 0.6, g, 'highpass'); NS(c, M, t, 2, hp);
  }
};

// ---------- songs ----------
const mel = (bars) => bars; // readability: [step, midi, lenSteps]
const SONGS = {};
function song(name, o) { o.sd = 60 / o.bpm / 4; o.name = name; SONGS[name] = o; }

// AURELIA: airy hopeful C major, harp arps + warm bass + flute melody
{
  const CH = [
    { r: 36, pad: [55, 60, 64], arp: [60, 64, 67, 72, 76] }, { r: 31, pad: [55, 59, 62], arp: [59, 62, 67, 71, 74] },
    { r: 33, pad: [57, 60, 64], arp: [57, 64, 69, 72, 76] }, { r: 40, pad: [55, 59, 64], arp: [59, 64, 67, 71, 76] },
    { r: 41, pad: [57, 60, 65], arp: [60, 65, 69, 72, 77] }, { r: 36, pad: [55, 60, 64], arp: [60, 64, 67, 72, 76] },
    { r: 38, pad: [57, 60, 65], arp: [57, 62, 65, 69, 72] }, { r: 31, pad: [55, 59, 62], arp: [59, 62, 67, 71, 74] }];
  const MEL = [
    [[0, 76, 4], [4, 79, 2], [6, 81, 2], [8, 79, 4], [12, 76, 4]], [[0, 74, 4], [4, 79, 4], [8, 81, 2], [10, 79, 2], [12, 74, 4]],
    [[0, 76, 4], [4, 81, 4], [8, 79, 2], [10, 76, 2], [12, 72, 4]], [[0, 71, 4], [4, 76, 4], [8, 79, 4], [12, 76, 2], [14, 74, 2]],
    [[0, 77, 4], [4, 81, 4], [8, 77, 2], [10, 76, 2], [12, 77, 4]], [[0, 76, 4], [4, 79, 2], [6, 76, 2], [8, 72, 8]],
    [[0, 74, 4], [4, 77, 4], [8, 81, 4], [12, 84, 4]], [[0, 83, 4], [4, 79, 4], [8, 74, 4], [12, 71, 4]]];
  const ARP = [0, 1, 2, 3, 4, 3, 2, 1];
  song('aurelia', {
    bpm: 84, spb: 16, bars: 8, wet: 0.5, amb: [{ f: 520, q: 0.5, g: 0.05, fm: [[0.07, 220]], am: [[0.11, 0.5]] }, { f: 2600, q: 0.7, g: 0.012, am: [[0.05, 0.6]] }],
    tick(M, S, t, g, bar, sib, loop, I) {
      const sd = this.sd, c = CH[bar];
      if (sib === 0) { for (const p of c.pad) M.n(S, 'pad', t, p, sd * 16, 0.8, 'c', 2); M.n(S, 'bass', t, c.r, sd * 7, 0.8); }
      if (sib === 8) M.n(S, 'bass', t, c.r + 7, sd * 6, 0.5);
      if (sib % 2 === 0) M.n(S, 'pluck', t, c.arp[ARP[(g >> 1) % 8] % c.arp.length], sd * 8, sib === 0 ? 0.75 : 0.45, 'c', 2);
      if (loop % 3 !== 2) for (const n of MEL[bar]) if (n[0] === sib) { M.n(S, 'fl', t, n[1], n[2] * sd, 0.55); M.n(S, 'pluck', t, n[1], sd * 8, 0.5); }
      if (I > 0.08) {
        if (sib === 0 || sib === 8) M.n(S, 'timp', t, 0, 0.8, 0.8, 'x');
        if (I > 0.45 && (sib === 4 || sib === 12)) M.n(S, 'tom', t, 0, 0.3, 0.45, 'x');
        if (I > 0.3 && sib % 2 === 0) M.n(S, 'shaker', t, 0, 0.1, 0.5, 'x', 2);
        if (sib % 2 === 0 && sib > 0) M.n(S, 'bass', t, c.r + 12, sd * 1.6, 0.4, 'x', 2);
      }
    }
  });
}

// BOARD: playful bouncy tabletop tune, marimba + pizzicato
{
  const R = [48, 45, 50, 43, 48, 45, 41, 43];
  const T = [[64, 67, 72], [64, 69, 72], [65, 69, 74], [62, 67, 71], [64, 67, 72], [64, 69, 72], [65, 69, 72], [62, 67, 71]];
  const MEL = [
    [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 76, 2], [8, 72, 2], [10, 67, 2], [12, 72, 4]], [[0, 76, 2], [2, 81, 2], [4, 76, 2], [6, 72, 2], [8, 69, 2], [10, 72, 2], [12, 76, 4]],
    [[0, 74, 2], [2, 77, 2], [4, 81, 2], [6, 77, 2], [8, 74, 2], [10, 69, 2], [12, 74, 4]], [[0, 74, 2], [2, 71, 2], [4, 74, 2], [6, 79, 2], [8, 77, 2], [10, 74, 2], [12, 71, 4]],
    [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 76, 2], [8, 72, 2], [10, 67, 2], [12, 76, 2], [14, 79, 2]], [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 72, 2], [8, 76, 4], [12, 72, 4]],
    [[0, 77, 2], [2, 76, 2], [4, 72, 2], [6, 76, 2], [8, 77, 4], [12, 81, 4]], [[0, 79, 2], [2, 77, 2], [4, 74, 2], [6, 71, 2], [8, 72, 6]]];
  song('board', {
    trim: 1.8, bpm: 116, spb: 16, bars: 8, swing: 0.1, wet: 0.28, amb: [{ f: 260, q: 0.4, g: 0.02, t: 'lowpass' }],
    tick(M, S, t, g, bar, sib, loop, I) {
      const sd = this.sd, r = R[bar], tn = T[bar];
      if (sib === 0 || sib === 8) M.n(S, 'pizz', t, r, sd * 3, 0.9);
      if (sib === 4 || sib === 12) M.n(S, 'pizz', t, r + 7, sd * 3, 0.6);
      if (sib === 14) M.n(S, 'pizz', t, r + 12, sd * 2, 0.35, 'c', 2);
      if (sib % 4 === 2) M.n(S, 'marimba', t, tn[(sib >> 2) % 3], sd * 2, 0.32, 'c', 2);
      if (!(loop % 4 === 3 && bar > 5)) for (const n of MEL[bar]) if (n[0] === sib) M.n(S, 'marimba', t, n[1], n[2] * sd, 0.75);
      if (I > 0.08) {
        if (sib === 0 || sib === 8) M.n(S, 'kick', t, 0, 0.2, 0.6, 'x');
        if (sib === 4 || sib === 12) M.n(S, 'snare', t, 0, 0.15, 0.55, 'x');
        if (sib % 2 === 1 && I > 0.3) M.n(S, 'shaker', t, 0, 0.1, 0.45, 'x', 2);
        if (sib % 4 === 2) M.n(S, 'wood', t, ((sib >> 2) & 1) ? 1318 : 988, 0.1, 0.5, 'x', 2);
      }
    }
  });
}

// SHATTERBELT: vast spacey drones, shimmering bells, slow pulses
{
  const CH = [{ r: 38, pad: [50, 57, 60, 64] }, { r: 34, pad: [46, 53, 57, 64] }, { r: 41, pad: [53, 57, 60, 67] }, { r: 36, pad: [48, 55, 62, 69] }];
  const PENT = [74, 77, 79, 81, 84, 86, 89], SH = [74, 77, 81, 84, 86, 81, 77, 84];
  song('shatterbelt', {
    bpm: 56, spb: 16, bars: 8, wet: 0.75,
    amb: [{ hum: [55, 55.4, 110.3], g: 0.03, am: [[0.04, 0.4]] }, { f: 1500, q: 0.8, g: 0.014, am: [[0.06, 0.7]], fm: [[0.03, 600]] }],
    tick(M, S, t, g, bar, sib, loop, I) {
      const sd = this.sd, c = CH[(bar >> 1) & 3];
      if (sib === 0 && (bar & 1) === 0) { for (const p of c.pad) M.n(S, 'pad', t, p, sd * 31, 0.65, 'c', 2); M.n(S, 'drone', t, c.r, sd * 30, 0.9); }
      if (sib === 0 || sib === 8) M.n(S, 'pulse', t, 33, 1, I > 0.1 ? 0.55 : 0.4);
      if (sib % 2 === 0 && S.rng() < 0.13) M.n(S, 'bell', t, PENT[(S.rng() * PENT.length) | 0] + (S.rng() < 0.3 ? 12 : 0), 3.6, 0.45, 'c', 2);
      if (I > 0.08) {
        if (sib === 4 || sib === 12) M.n(S, 'pulse', t, 36, 1, 0.45, 'x');
        if (sib % 2 === 0 && I > 0.3) M.n(S, 'bell', t, SH[(g >> 1) % 8] + (bar & 1 ? 0 : 12), 1.6, 0.28, 'x', 2);
        if (I > 0.55 && (sib === 2 || sib === 10)) M.n(S, 'tom', t, 70, 0.4, 0.55, 'x');
        if (I > 0.5 && sib === 0) M.n(S, 'cym', t, 0, 2, 0.6, 'x', 2);
      }
    }
  });
}

// LUMEN: warm synthwave-ish bioluminescent arps
{
  const CH = [{ r: 38, pad: [57, 62, 65, 69] }, { r: 34, pad: [58, 62, 65, 70] }, { r: 41, pad: [57, 60, 65, 69] }, { r: 36, pad: [55, 60, 64, 67] },
    { r: 38, pad: [57, 62, 65, 69] }, { r: 34, pad: [58, 62, 65, 70] }, { r: 43, pad: [58, 62, 67, 70] }, { r: 36, pad: [55, 60, 64, 67] }];
  const MEL = [[[0, 81, 6], [6, 79, 2], [8, 77, 4], [12, 74, 4]], [[0, 74, 4], [4, 77, 4], [8, 82, 4], [12, 81, 4]], [[0, 84, 6], [6, 81, 2], [8, 77, 8]], [[0, 79, 4], [4, 76, 4], [8, 79, 4], [12, 84, 4]],
    [[0, 86, 6], [6, 84, 2], [8, 81, 4], [12, 77, 4]], [[0, 82, 4], [4, 81, 4], [8, 77, 4], [12, 74, 4]], [[0, 82, 6], [6, 79, 2], [8, 74, 8]], [[0, 76, 4], [4, 79, 4], [8, 84, 8]]];
  const SP = [84, 86, 89, 91, 93], AR = [0, 1, 2, 3, 4, 3, 2, 1];
  song('lumen', {
    bpm: 98, spb: 16, bars: 8, wet: 0.5, amb: [{ f: 950, q: 0.8, g: 0.03, t: 'bandpass', fm: [[0.31, 260], [0.17, 160]], am: [[2.1, 0.25]] }, { hum: [82.4, 82.8], g: 0.018 }],
    tick(M, S, t, g, bar, sib, loop, I) {
      const sd = this.sd, c = CH[bar]; M.cut = 1100 + 1500 * I;
      if (sib === 0) for (const p of c.pad) M.n(S, 'pad', t, p, sd * 16, 0.75, 'c', 2);
      if (sib === 0 || sib === 10) M.n(S, 'bass', t, c.r, sd * 5, 0.85);
      const dense = I > 0.5;
      if (dense || sib % 2 === 0) { const k = AR[(dense ? g : g >> 1) % 8]; M.n(S, 'synth', t, c.pad[k % 4] + 12 * (k >> 2), sd * 3, sib % 4 === 0 ? 0.8 : 0.55, 'c', 2); }
      for (const n of MEL[bar]) if (n[0] === sib) M.n(S, 'lead', t, n[1], n[2] * sd, 0.7);
      if (sib % 4 === 2 && S.rng() < 0.12) M.n(S, 'bell', t, SP[(S.rng() * 5) | 0], 2.2, 0.3, 'c', 2);
      if (I > 0.08) {
        if (sib % 4 === 0) M.n(S, 'kick', t, 0, 0.2, 0.5, 'x');
        if (sib === 4 || sib === 12) M.n(S, 'snare', t, 0, 0.15, 0.45, 'x');
        if (sib % 4 === 2 && I > 0.3) M.n(S, 'shaker', t, 0, 0.1, 0.5, 'x', 2);
        if (sib % 2 === 0 && I > 0.25) M.n(S, 'bass', t, c.r + (sib % 4 === 2 ? 12 : 0), sd * 1.6, 0.45, 'x', 2);
      }
    }
  });
}

// MUDLARK: cozy folk waltz (3/4), plucks + woodwind, stop-motion jitter
{
  const CH = [[55, 59, 62, 67], [55, 60, 64, 67], [55, 59, 62, 67], [57, 62, 66, 69], [55, 59, 62, 67], [55, 59, 64, 67], [55, 60, 64, 67], [57, 62, 66, 69]];
  const R = [43, 48, 43, 50, 43, 40, 48, 50], PG = [79, 81, 83, 86, 88, 91];
  const MEL = [[[0, 74, 4], [4, 71, 2], [6, 74, 2], [8, 79, 4]], [[0, 76, 4], [4, 72, 4], [8, 76, 4]], [[0, 74, 4], [4, 71, 2], [6, 67, 2], [8, 71, 4]], [[0, 78, 4], [4, 74, 4], [8, 69, 4]],
    [[0, 71, 4], [4, 74, 2], [6, 79, 2], [8, 79, 4]], [[0, 76, 4], [4, 74, 2], [6, 71, 2], [8, 76, 4]], [[0, 72, 4], [4, 76, 4], [8, 79, 4]], [[0, 78, 4], [4, 74, 4], [8, 69, 4]]];
  song('mudlark', {
    trim: 1.5, bpm: 108, spb: 12, bars: 8, jit: 0.014, wet: 0.32, amb: [{ f: 700, q: 5, g: 0.03, fm: [[5, 300], [7.3, 220], [0.4, 150]], am: [[3.3, 0.4]] }, { f: 380, q: 0.5, g: 0.02, fm: [[0.06, 120]], am: [[0.09, 0.5]] }],
    tick(M, S, t, g, bar, sib, loop, I) {
      const sd = this.sd, ch = CH[bar];
      if (sib === 0) M.n(S, 'gtr', t, R[bar], sd * 8, 0.9);
      if (sib === 4 || sib === 8) for (let i = 0; i < 4; i++) M.n(S, 'gtr', t + i * 0.022, ch[i], sd * 7, 0.4 - i * 0.04, 'c', 2);
      for (const n of MEL[bar]) if (n[0] === sib) M.n(S, 'fl', t, n[1], n[2] * sd * 0.96, 0.62);
      if (sib % 2 === 0 && S.rng() < 0.07) M.n(S, 'marimba', t, PG[(S.rng() * 6) | 0], sd * 2, 0.3, 'c', 2);
      if (I > 0.08) {
        if (sib === 0) M.n(S, 'stomp', t, 0, 0.1, 0.55, 'x');
        if (sib === 4 || sib === 8) M.n(S, 'wood', t, 880, 0.1, 0.5, 'x', 2);
        if (sib % 2 === 0 && I > 0.3) M.n(S, 'shaker', t, 0, 0.1, 0.5, 'x', 2);
        if (I > 0.45 && sib === 6) M.n(S, 'gtr', t, R[bar] + 12, sd * 3, 0.5, 'x', 2);
      }
    }
  });
}

// PARADOX: dreamy music box over a subtle Shepard-style ever-rising bed, 3-against-4 arps
{
  const CH = [{ r: 45, pad: [57, 60, 64], arp: [81, 84, 88, 83] }, { r: 41, pad: [53, 57, 60], arp: [77, 81, 84, 88] }, { r: 36, pad: [52, 55, 59], arp: [79, 83, 88, 84] }, { r: 40, pad: [55, 59, 62], arp: [79, 83, 86, 88] }];
  const MEL = [[[0, 81, 4], [4, 84, 4], [8, 88, 4], [12, 84, 4]], [[0, 84, 4], [4, 81, 4], [8, 77, 4], [12, 81, 4]], [[0, 88, 4], [4, 84, 4], [8, 88, 2], [10, 84, 2], [12, 79, 4]], [[0, 83, 4], [4, 81, 2], [6, 83, 2], [8, 84, 8]]];
  const SEQ = [0, 1, 2, 3, 2, 1];
  song('paradox', {
    trim: 0.85, bpm: 72, spb: 16, bars: 4, wet: 0.65, amb: [{ hum: [110, 110.6], g: 0.016, am: [[0.08, 0.5]] }, { f: 1800, q: 0.6, g: 0.01, am: [[0.05, 0.6]] }],
    tick(M, S, t, g, bar, sib, loop, I) {
      const sd = this.sd, c = CH[bar];
      if (sib === 0) {
        const pc = (((g / 16) | 0) * 2) % 12;
        for (let k = 0; k < 5; k++) { const m = 30 + pc + 12 * k, z = (m - 66) / 15, w = Math.exp(-z * z / 2); if (w > 0.08) M.n(S, 'sine', t, m, sd * 16, w * (1 + 0.5 * I), 'c', 2); }
        for (const p of c.pad) M.n(S, 'pad', t, p, sd * 16, 0.55, 'c', 2);
        M.n(S, 'bass', t, c.r, sd * 10, 0.7);
      }
      if (g % 3 === 0) M.n(S, 'mbox', t, c.arp[SEQ[((g / 3) | 0) % 6]], 1.2, 0.5, 'c', 2);
      if (loop % 2 === 1 ? true : bar !== 3 || sib < 8) for (const n of MEL[bar]) if (n[0] === sib) M.n(S, 'mbox', t, n[1] + (loop % 2 ? 12 : 0), n[2] * sd, 0.85);
      if (I > 0.08) {
        if (sib === 0 || sib === 8) M.n(S, 'pulse', t, 40, 1, 0.55, 'x');
        if (sib === 2 || sib === 10) M.n(S, 'pulse', t, 44, 1, 0.3, 'x');
        if (I > 0.4 && sib % 4 === 2) M.n(S, 'wood', t, 1175, 0.1, 0.4, 'x', 2);
        if (I > 0.5 && g % 3 === 1) M.n(S, 'mbox', t, c.arp[SEQ[((g / 3) | 0) % 6]] + 12, 1, 0.3, 'x', 2);
      }
    }
  });
}

// BOSS: heroic, driving, family-friendly; intensity adds percussion
{
  const CH = [{ r: 45, pad: [57, 60, 64] }, { r: 41, pad: [53, 57, 60] }, { r: 48, pad: [55, 60, 64] }, { r: 43, pad: [55, 59, 62] },
    { r: 45, pad: [57, 60, 64] }, { r: 41, pad: [53, 57, 60] }, { r: 43, pad: [55, 59, 62] }, { r: 45, pad: [57, 60, 64] }];
  const MEL = [[[0, 76, 4], [4, 81, 6], [10, 79, 2], [12, 76, 4]], [[0, 77, 4], [4, 84, 6], [10, 83, 2], [12, 81, 4]], [[0, 84, 4], [4, 88, 6], [10, 86, 2], [12, 84, 4]], [[0, 83, 6], [6, 86, 4], [10, 83, 2], [12, 79, 4]],
    [[0, 76, 4], [4, 81, 6], [10, 84, 2], [12, 88, 4]], [[0, 89, 6], [6, 88, 2], [8, 84, 4], [12, 81, 4]], [[0, 86, 4], [4, 83, 4], [8, 79, 4], [12, 83, 4]], [[0, 81, 14]]];
  song('boss', {
    bpm: 124, spb: 16, bars: 8, wet: 0.35, amb: [{ f: 220, q: 0.6, g: 0.05, fm: [[0.1, 90]], am: [[0.13, 0.4]] }, { hum: [55, 55.3], g: 0.025 }],
    tick(M, S, t, g, bar, sib, loop, I) {
      const sd = this.sd, c = CH[bar];
      if (sib === 0) { for (const p of c.pad) M.n(S, 'pad', t, p, sd * 16, 0.85, 'c', 2); M.n(S, 'bass', t, c.r, sd * 7, 0.95); }
      if (sib === 8) M.n(S, 'bass', t, c.r + 7, sd * 6, 0.6);
      for (const n of MEL[bar]) if (n[0] === sib) { M.n(S, 'horn', t, n[1], n[2] * sd * 0.95, 0.75); M.n(S, 'pluck', t, n[1] + 12, sd * 4, 0.3, 'c', 2); }
      if (I > 0.08) {
        if (sib === 0 || sib === 8) { M.n(S, 'timp', t, 0, 0.8, 0.85, 'x'); M.n(S, 'kick', t, 0, 0.2, 0.55, 'x'); }
        if (sib === 4 || sib === 12) M.n(S, 'snare', t, 0, 0.15, 0.6, 'x');
        if (sib % 2 === 0) M.n(S, 'pluck', t, c.pad[(sib >> 1) % 3] + 12, sd * 2.5, 0.4, 'x', 2);
        if (sib % 2 === 0 && sib > 0) M.n(S, 'bass', t, c.r + (sib % 4 === 2 ? 12 : 0), sd * 1.6, 0.5, 'x', 2);
        if (I > 0.3 && sib % 2 === 1) M.n(S, 'shaker', t, 0, 0.1, 0.5, 'x', 2);
        if (I > 0.55 && (sib === 6 || sib === 14)) M.n(S, 'kick', t, 0, 0.2, 0.45, 'x', 2);
        if (I > 0.5 && (bar & 3) === 3 && sib >= 12) M.n(S, 'tom', t, 110 - (sib - 12) * 8, 0.2, 0.55, 'x', 2);
        if (I > 0.7 && sib === 0 && (bar & 1) === 0) M.n(S, 'cym', t, 0, 2, 0.7, 'x', 2);
      }
    }
  });
}

export const THEMES = Object.keys(SONGS);

// ---------- ambience ----------
function buildAmb(c, M, spec, dest) {
  const nodes = [], out = c.createGain(); out.gain.value = 1; out.connect(dest);
  for (const a of spec) {
    if (a.hum) {
      const g = c.createGain(); g.gain.value = a.g; g.connect(out);
      for (const f of a.hum) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const og = c.createGain(); og.gain.value = 1 / a.hum.length; o.connect(og); og.connect(g); o.start(); nodes.push(o); }
      if (a.am) for (const [r, d] of a.am) { const l = c.createOscillator(); l.frequency.value = r; const lg = c.createGain(); lg.gain.value = a.g * d * 0.5; l.connect(lg); lg.connect(g.gain); l.start(); nodes.push(l); }
      continue;
    }
    const src = c.createBufferSource(); src.buffer = M.brown; src.loop = true; src.playbackRate.value = 0.9 + M.rng() * 0.2;
    const f = c.createBiquadFilter(); f.type = a.t || 'bandpass'; f.frequency.value = a.f; f.Q.value = a.q || 0.6;
    const g = c.createGain(); g.gain.value = a.g; src.connect(f); f.connect(g); g.connect(out); src.start(0, M.rng() * 3); nodes.push(src);
    if (a.fm) for (const [r, d] of a.fm) { const l = c.createOscillator(); l.frequency.value = r; const lg = c.createGain(); lg.gain.value = d; l.connect(lg); lg.connect(f.frequency); l.start(); nodes.push(l); }
    if (a.am) for (const [r, d] of a.am) { const l = c.createOscillator(); l.frequency.value = r; const lg = c.createGain(); lg.gain.value = a.g * d * 0.5; l.connect(lg); lg.connect(g.gain); l.start(); nodes.push(l); }
  }
  return { nodes, out };
}

// ---------- Music ----------
const BASE = 0.8; // overall headroom trim
export class Music {
  constructor(getCtx) {
    this.get = getCtx; this.ctx = null; this.vol = 0.8; this.inten = 0; this.tIn = 0; this.states = []; this.pending = null;
    this.rng = mkRng(0xC0C4CAFE); this.vs = new Float64Array(512); this.ve = new Float64Array(512); this.vn = 0;
    this.stats = { peakVoices: 0, dropped: 0 }; this.cut = 1500; this._timer = 0; this._look = 0.12; this._lastPump = 0; this.stopped = false; this.offline = false; this._lastApply = 0;
  }
  get output() { return this._comp || null; }
  _ensure() {
    if (this.ctx) return true;
    let c = null; try { c = this.get && this.get(); } catch (e) { c = null; }
    if (!c) return false;
    this.ctx = c; this.offline = typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext;
    const sr = c.sampleRate, rng = mkRng(12345);
    this.noise = c.createBuffer(1, sr * 2, sr); const nd = this.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = rng() * 2 - 1;
    this.brown = c.createBuffer(1, sr * 4, sr); const bd = this.brown.getChannelData(0); let y = 0, y2 = 0;
    for (let i = 0; i < bd.length; i++) { y += (rng() * 2 - 1 - y) * 0.2; y2 += (y - y2) * 0.35; bd[i] = y2 * 2.2; }
    const len = (sr * 2.4) | 0, ir = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let l = 0; for (let i = 0; i < len; i++) { const k = i / len, e = Math.pow(1 - k, 3.4), a = 0.45 - 0.38 * Math.min(1, k * 2.2); l += ((rng() * 2 - 1) * e - l) * a; d[i] = l * (i < 600 ? i / 600 : 1); } }
    this._sum = c.createGain(); this._verbIn = c.createGain(); this._verbIn.gain.value = 1;
    const conv = c.createConvolver(); conv.buffer = ir; const vo = c.createGain(); vo.gain.value = 0.55;
    this._verbIn.connect(conv); conv.connect(vo); vo.connect(this._sum);
    this._duck = c.createGain(); this._master = c.createGain(); this._master.gain.value = this.vol * BASE;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.01; comp.release.value = 0.3;
    this._comp = comp; this._sum.connect(this._duck); this._duck.connect(this._master); this._master.connect(comp); comp.connect(c.destination);
    return true;
  }
  setVolume(v) { this.vol = Math.max(0, Math.min(1.5, v)); if (this._master) this._master.gain.setTargetAtTime(this.vol * BASE, this.ctx.currentTime, 0.1); }
  setIntensity(v, instant) {
    this.tIn = clamp01(v); if (instant || this.offline) this.inten = this.tIn; this._applyInt(!!(instant || this.offline));
  }
  _applyInt(now) {
    if (!this.ctx) return; const t = this.ctx.currentTime, I = this.tIn, tc = 0.6;
    for (const S of this.states) {
      const cg = 1 - 0.2 * I, xg = smooth(0.04, 0.85, I), ag = 1 - 0.55 * I;
      if (now) { S.calm.gain.value = cg; S.comb.gain.value = xg; S.ambBus.gain.value = ag; }
      else { S.calm.gain.setTargetAtTime(cg, t, tc); S.comb.gain.setTargetAtTime(xg, t, tc); S.ambBus.gain.setTargetAtTime(ag, t, tc); }
    }
  }
  duck(amount, secs) {
    if (!this._ensure()) return; const g = this._duck.gain, t = this.ctx.currentTime, lvl = 1 - clamp01(amount == null ? 0.6 : amount);
    g.cancelScheduledValues(t); g.setTargetAtTime(lvl, t, 0.08); g.setTargetAtTime(1, t + Math.max(0.1, secs == null ? 2 : secs), 0.45);
  }
  setTheme(name, instant) {
    const song = SONGS[name]; if (!song) return;
    if (!this._ensure()) { this.pending = name; return; }
    this.pending = null; const c = this.ctx, t = c.currentTime;
    if (!this.offline && c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) { /* needs gesture */ } }
    if (this.stopped) { this.stopped = false; this._master.gain.cancelScheduledValues(t); this._master.gain.setTargetAtTime(this.vol * BASE, t, 0.1); }
    const cur = this._cur(); if (cur && cur.song === song) return;
    if (cur) { cur.active = false; cur.g.gain.cancelScheduledValues(t); cur.g.gain.setTargetAtTime(0, t, instant ? 0.05 : 0.5); cur.killAt = t + (instant ? 0.4 : 2.6); }
    while (this.states.length >= 2) this._kill(this.states.shift(), true); // never more than one fading + one active
    const S = { song, name, active: true, killAt: 0, next: t + 0.1, g: c.createGain(), calm: c.createGain(), comb: c.createGain(), ambBus: c.createGain(), send: c.createGain(), rng: mkRng(song.name.length * 7919 + 17), i: 0, amb: null };
    const tr = song.trim || 1; S.g.gain.value = 0; if (instant || this.offline) S.g.gain.value = tr; else S.g.gain.setTargetAtTime(tr, t, 0.5);
    S.calm.connect(S.g); S.comb.connect(S.g); S.ambBus.connect(S.g); S.g.connect(this._sum); S.g.connect(S.send); S.send.gain.value = song.wet; S.send.connect(this._verbIn);
    S.amb = buildAmb(c, this, song.amb, S.ambBus); this.states.push(S); this._applyInt(true);
    if (!this.offline && !this._timer) this._timer = setInterval(() => this._pump(), 25);
  }
  _cur() { for (let i = this.states.length - 1; i >= 0; i--) if (this.states[i].active) return this.states[i]; return null; }
  _kill(S, quick) {
    try { S.g.gain.cancelScheduledValues(0); S.g.gain.value = 0; S.g.disconnect(); S.send.disconnect(); S.calm.disconnect(); S.comb.disconnect(); S.ambBus.disconnect(); } catch (e) { /* ignore */ }
    if (S.amb) for (const n of S.amb.nodes) { try { n.stop(); } catch (e) { /* ignore */ } try { n.disconnect(); } catch (e) { /* ignore */ } }
    S.amb = null; S.dead = true;
  }
  stop() {
    if (!this.ctx) { this.pending = null; return; } const t = this.ctx.currentTime; this.stopped = true;
    this._master.gain.cancelScheduledValues(t); this._master.gain.setTargetAtTime(0, t, 0.2);
    for (const S of this.states) { S.active = false; S.killAt = t + 1.2; }
  }
  update(dt) {
    if (this.pending && this._ensure()) this.setTheme(this.pending);
    if (!this.ctx) return; this._pump();
    this._lastApply += dt || 0; if (this._lastApply > 0.1 && Math.abs(this.tIn - this.inten) > 0.005) { this._lastApply = 0; this._applyInt(false); }
  }
  _voice(t, d, prio) {
    const s = this.vs, e = this.ve; let c = 0;
    for (let i = 0; i < this.vn;) { if (e[i] < t - 0.05) { this.vn--; s[i] = s[this.vn]; e[i] = e[this.vn]; continue; } if (s[i] <= t + 1e-4) c++; i++; }
    if (c >= (prio > 1 ? 18 : 24) || this.vn >= 500) { this.stats.dropped++; return false; }
    s[this.vn] = t; e[this.vn] = t + d; this.vn++; if (c + 1 > this.stats.peakVoices) this.stats.peakVoices = c + 1; return true;
  }
  n(S, inst, t, midi, dur, vel, layer, prio) {
    const jit = S.song.jit || 0, rn = this.rng;
    t += (rn() - 0.5) * (0.012 + jit * 2); if (t < this.ctx.currentTime) t = this.ctx.currentTime;
    if (!this._voice(t, dur + (inst === 'pad' || inst === 'sine' ? 1.4 : inst === 'drone' ? 2 : 0.2)-(inst === 'pad' || inst === 'sine' || inst === 'drone' ? 0 : dur * 0.3), prio || 1)) return;
    INST[inst](this.ctx, t, inst === 'tom' || inst === 'wood' ? midi : MID(midi), dur, vel * (0.9 + rn() * 0.2), layer === 'x' ? S.comb : S.calm, this);
  }
  _pump(look) {
    const c = this.ctx; if (!c) return;
    const now = c.currentTime;
    if (!this.offline && c.state !== 'running') return;
    const dtp = Math.max(0, Math.min(0.5, now - this._lastPump)); this._lastPump = now;
    if (this.inten !== this.tIn) this.inten += (this.tIn - this.inten) * (1 - Math.exp(-dtp / 0.6));
    const until = now + (look || this._look);
    for (let k = this.states.length - 1; k >= 0; k--) {
      const S = this.states[k];
      if (!S.active) { if (S.killAt && now > S.killAt) { this._kill(S); this.states.splice(k, 1); } continue; }
      const sd = S.song.sd, spb = S.song.spb, bars = S.song.bars;
      if (S.next < now - 0.2) { const miss = Math.ceil((now - S.next) / sd); S.i += miss; S.next += miss * sd; } // stall: resync on-grid
      while (S.next < until) {
        const g = S.i, sib = g % spb, bar = ((g / spb) | 0) % bars, loop = (g / (spb * bars)) | 0;
        let t = S.next; if (S.song.swing && (sib & 1)) t += S.song.swing * sd;
        S.song.tick(this, S, t, g, bar, sib, loop, this.inten); S.i++; S.next += sd;
      }
    }
  }
  renderAhead(seconds) { this._pump(seconds); } // offline use: schedule everything up to `seconds`
}
