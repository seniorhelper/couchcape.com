// Echo Ambush mini-games: 10 seconds of real-time fun above the table.
//  pop      — look + pinch (or a quick 0.3 s gaze) to pop the cheeky Echoes before they slip away
//  match    — memory match: watch the cards, then find every pair
//  illusion — "which is longer / bigger?" optical illusions; the answer is revealed with guide lines
// Each game can be played by a human (activate) or an AI teammate (same code path, simulated picks).
import * as THREE from 'three';
import { Panel, Button, fitText, rrect, drawIcon, FONT, INK } from './ui.js';
import { burst } from './art.js';

const TIME = 10;
const _v = new THREE.Vector3();
const rr = (a, b) => a + Math.random() * (b - a);

function timerPanel() { const p = new Panel(1024, 210, 0.44, 0.09, 992); return p; }
function drawTimer(p, title, sub, left, prog, color) {
  const tl = Math.max(0, left);
  p.draw((g, W, H) => {
    rrect(g, 4, 4, W - 8, H - 8, 36); g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill(); g.lineWidth = 8; g.strokeStyle = color; g.stroke();
    g.fillStyle = INK; g.font = `800 52px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(title, 34, 22);
    g.font = `700 40px ${FONT}`; g.textAlign = 'right'; g.fillStyle = tl < 3 ? '#d9367a' : INK; g.fillText(tl.toFixed(0) + 's', W - 34, 26);
    g.textAlign = 'left'; g.font = `600 36px ${FONT}`; g.fillStyle = '#3a4a66'; g.fillText(sub, 34, 88);
    rrect(g, 34, 148, W - 68, 30, 15); g.fillStyle = '#e7e3f3'; g.fill();
    rrect(g, 34, 148, Math.max(30, (W - 68) * Math.min(1, tl / TIME)), 30, 15); g.fillStyle = color; g.fill();
    if (prog) { g.textAlign = 'right'; g.font = `800 40px ${FONT}`; g.fillStyle = INK; g.fillText(prog, W - 34, 88); }
  }, [title, sub, Math.ceil(tl * 2), prog].join('|'));
}

class Mini {
  constructor(stage, art) { this.stage = stage; this.art = art; this.group = new THREE.Group(); this.group.visible = false; stage.add(this.group); this.targets = []; this.timer = timerPanel(); this.timer.mesh.position.set(0, 0.235, 0); this.group.add(this.timer.mesh); }
  begin(o) { this.o = o; this.t = 0; this.done = null; this.reveal = 0; this.group.visible = true; }
  end() { this.group.visible = false; this.targets.length = 0; }
  sparkle(obj, color, n = 14) { obj.getWorldPosition(_v); this.art.root.worldToLocal(_v); burst(this.art, _v.x, _v.y, _v.z, color, n, 0.09); }
}

// ---------------- Echo Pop ----------------
function echoFaceTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#f4f6ff'); gr.addColorStop(0.5, '#b9bfdc'); gr.addColorStop(1, '#7d84ad'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, 30, 256, 6);
  // face on the front (u ~ 0.75 faces +z for SphereGeometry)
  const fx = 64; g.fillStyle = '#2a2550'; g.beginPath(); g.ellipse(fx - 14, 58, 7, 10, 0, 0, 7); g.ellipse(fx + 14, 58, 7, 10, 0, 0, 7); g.fill();
  g.strokeStyle = '#2a2550'; g.lineWidth = 5; g.beginPath(); g.moveTo(fx - 14, 82); g.quadraticCurveTo(fx + 4, 94, fx + 16, 78); g.stroke();
  g.fillStyle = '#ff9ac4'; g.globalAlpha = 0.6; g.beginPath(); g.arc(fx - 26, 74, 6, 0, 7); g.arc(fx + 26, 74, 6, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class PopGame extends Mini {
  constructor(stage, art) {
    super(stage, art);
    const face = echoFaceTex(), geo = new THREE.SphereGeometry(0.034, 18, 12), mat = new THREE.MeshStandardMaterial({ map: face, roughness: 0.25, metalness: 0.2, emissive: 0xffffff, emissiveMap: face, emissiveIntensity: 0.55 });
    const crown = new THREE.ConeGeometry(0.01, 0.024, 5); crown.translate(0, 0.04, 0);
    this.orbs = [];
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(geo, mat); const c = new THREE.Mesh(crown, mat); m.add(c);
      m.userData = { gazeable: true, dwell: true, dwellTime: 0.3, board: { type: 'mini', k } };
      m.visible = false; this.group.add(m); this.orbs.push({ m, alive: false, t: 0, life: 0, bx: 0, by: 0, bz: 0, ph: 0 });
    }
  }
  begin(o) { super.begin(o); this.popped = 0; this.spawnT = 0.2; this.aiT = rr(0.5, 0.9); for (const b of this.orbs) { b.alive = false; b.m.visible = false; } this.title = o.trial ? 'Ever-Glass Trial: Echo Pop' : 'Echo Pop!'; }
  spawn() {
    const b = this.orbs.find(x => !x.alive); if (!b) return;
    b.alive = true; b.t = 0; b.life = rr(1.7, 2.4) * (this.o.hard ? 0.85 : 1); b.bx = rr(-0.27, 0.27); b.by = rr(-0.07, 0.15); b.bz = rr(-0.04, 0.06); b.ph = rr(0, 6);
    b.m.visible = true; b.m.scale.setScalar(0.01); b.m.position.set(b.bx, b.by, b.bz);
  }
  activate(obj) { const b = this.orbs.find(x => x.m === obj); if (!b || !b.alive || this.done) return false; this.pop(b); return true; }
  pop(b) { b.alive = false; b.m.visible = false; this.popped++; this.sparkle(b.m, '#cfd6ff', 16); this.o.sfx && this.o.sfx('pop'); if (this.popped >= this.o.need) this.finish(true); }
  finish(ok) { if (this.done) return; this.done = { success: ok }; this.reveal = 1.1; for (const b of this.orbs) { if (b.alive && ok) this.sparkle(b.m, '#cfd6ff', 6); b.alive = false; b.m.visible = false; } }
  update(dt) {
    this.t += dt;
    if (this.done) { this.reveal -= dt; drawTimer(this.timer, this.done.success ? 'Popped them all!' : 'They got away!', this.done.success ? 'Nice reflexes.' : 'So close!', TIME - this.t, `${this.popped}/${this.o.need}`, this.done.success ? '#3cc97a' : '#9a8fd0'); return this.reveal <= 0 ? this.done : null; }
    if (this.t >= TIME) { this.finish(false); return null; }
    this.spawnT -= dt; const alive = this.orbs.filter(x => x.alive).length;
    if (this.spawnT <= 0 && alive < 4) { this.spawn(); this.spawnT = rr(0.42, 0.62); }
    this.targets.length = 0;
    for (const b of this.orbs) {
      if (!b.alive) continue; b.t += dt;
      const s = Math.min(1, b.t * 5) * Math.min(1, (b.life - b.t) * 4);
      b.m.scale.setScalar(Math.max(0.01, s)); b.m.position.set(b.bx + Math.sin(b.t * 1.7 + b.ph) * 0.02, b.by + Math.sin(b.t * 2.3 + b.ph) * 0.015, b.bz);
      b.m.rotation.y = Math.sin(b.t * 2 + b.ph) * 0.5;
      if (b.t >= b.life) { b.alive = false; b.m.visible = false; } else this.targets.push(b.m);
    }
    if (this.o.ai) { // AI teammate: reacts at a skill-based pace and sometimes misses
      this.aiT -= dt;
      if (this.aiT <= 0) { this.aiT = rr(0.55, 1.15) / this.o.skill * 0.75; const b = this.orbs.filter(x => x.alive && x.t > 0.25).sort((a, c) => (a.life - a.t) - (c.life - c.t))[0]; if (b && Math.random() < 0.55 + this.o.skill * 0.45) this.pop(b); }
    }
    drawTimer(this.timer, this.title, this.o.ai ? `${this.o.name} is popping Echoes...` : `Look at an Echo and pinch. Pop ${this.o.need}!`, TIME - this.t, `${this.popped}/${this.o.need}`, '#ff4f8b');
    return null;
  }
}

// ---------------- Mirror Match (memory) ----------------
const SYMBOLS = [['heart', '#ff4f8b'], ['shard', '#4fc3ff'], ['power', '#ffb000'], ['glim', '#9b7bff'], ['kind', '#ff8a3c'], ['fact', '#3cc97a']];
const texCache = {};
function cardTex(key, fn) { if (texCache[key]) return texCache[key]; const c = document.createElement('canvas'); c.width = 256; c.height = 320; fn(c.getContext('2d'), 256, 320); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (texCache[key] = t); }
const backTex = () => cardTex('back', (g, W, H) => { rrect(g, 6, 6, W - 12, H - 12, 28); g.fillStyle = '#5b4bb0'; g.fill(); g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.stroke(); g.globalAlpha = 0.25; for (let i = -H; i < W + H; i += 30) { g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); } g.globalAlpha = 1; drawIcon(g, 'echo', W / 2, H / 2, 120, '#ffffff'); });
const symTex = (k, matched) => cardTex('s' + k + (matched ? 'm' : ''), (g, W, H) => { rrect(g, 6, 6, W - 12, H - 12, 28); g.fillStyle = matched ? '#eafff1' : '#ffffff'; g.fill(); g.lineWidth = matched ? 16 : 10; g.strokeStyle = matched ? '#3cc97a' : SYMBOLS[k][1]; g.stroke(); drawIcon(g, SYMBOLS[k][0], W / 2, H / 2, 150, SYMBOLS[k][1]); });

export class MatchGame extends Mini {
  constructor(stage, art) {
    super(stage, art); this.cards = [];
    const geo = new THREE.PlaneGeometry(0.074, 0.0925);
    for (let k = 0; k < 8; k++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: backTex(), toneMapped: false, transparent: true, depthTest: false, side: THREE.DoubleSide }));
      m.renderOrder = 991; m.userData = { gazeable: true, dwell: true, dwellTime: 0.6, board: { type: 'mini', k } }; m.visible = false; this.group.add(m);
      this.cards.push({ m, sym: 0, up: false, matched: false, flip: 0, showFace: false });
    }
  }
  begin(o) {
    super.begin(o); const n = o.pairs; this.n = n * 2; this.matchedPairs = 0; this.preview = 2.2; this.sel = []; this.wait = 0; this.mem = new Map(); this.aiT = 1; this.aiQueue = [];
    const syms = []; for (let i = 0; i < n; i++) syms.push(i, i); for (let i = syms.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [syms[i], syms[j]] = [syms[j], syms[i]]; }
    const cols = n; this.cards.forEach((c, i) => {
      c.m.visible = i < this.n; if (i >= this.n) return;
      c.sym = syms[i]; c.matched = false; c.up = true; c.showFace = true; c.flip = 0; c.m.material.map = symTex(c.sym, false);
      const col = i % cols, row = Math.floor(i / cols); c.m.position.set((col - (cols - 1) / 2) * 0.088, 0.1 - row * 0.105, 0); c.m.scale.set(1, 1, 1);
      if (o.ai && Math.random() < o.skill * 0.85) this.mem.set(i, c.sym); // teammate memorizes some cards during the preview
    });
    this.title = o.trial ? 'Ever-Glass Trial: Mirror Match' : 'Mirror Match!'; this.t = -this.preview;
  }
  setUp(c, up) { if (c.up === up) return; c.up = up; c.flip = 0.2; }
  activate(obj) {
    if (this.done || this.t < 0 || this.wait > 0) return false;
    const i = this.cards.findIndex(c => c.m === obj); const c = this.cards[i]; if (!c || c.matched || c.up || this.sel.length >= 2) return false;
    this.setUp(c, true); this.sel.push(i); this.mem.set(i, c.sym); this.o.sfx && this.o.sfx('flip');
    if (this.sel.length === 2) this.wait = 0.55;
    return true;
  }
  resolvePair() {
    const [a, b] = this.sel, A = this.cards[a], B = this.cards[b]; this.sel = [];
    if (A.sym === B.sym) { A.matched = B.matched = true; A.m.material.map = B.m.material.map = symTex(A.sym, true); this.matchedPairs++; this.sparkle(A.m, SYMBOLS[A.sym][1], 10); this.sparkle(B.m, SYMBOLS[A.sym][1], 10); this.o.sfx && this.o.sfx('match');
      if (this.matchedPairs >= this.o.pairs) { this.done = { success: true }; this.reveal = 1.2; } }
    else { this.setUp(A, false); this.setUp(B, false); }
  }
  aiStep() {
    const open = this.cards.slice(0, this.n).map((c, i) => i).filter(i => !this.cards[i].matched && !this.cards[i].up);
    if (!open.length) return;
    if (this.sel.length === 0) {
      const seen = {}; for (const i of open) { const s = this.mem.get(i); if (s === undefined) continue; if (seen[s] !== undefined) { this.activate(this.cards[seen[s]].m); this.aiNext = i; return; } seen[s] = i; }
      const unknown = open.filter(i => !this.mem.has(i)); const pick = (unknown.length ? unknown : open)[Math.floor(Math.random() * (unknown.length || open.length))]; this.aiNext = null; this.activate(this.cards[pick].m);
    } else {
      const first = this.cards[this.sel[0]];
      let pick = this.aiNext;
      if (pick == null || !open.includes(pick)) { pick = open.find(i => this.mem.get(i) === first.sym); if (pick === undefined || Math.random() > 0.6 + this.o.skill * 0.4) { const unknown = open.filter(i => !this.mem.has(i)); const pool = unknown.length ? unknown : open; pick = pool[Math.floor(Math.random() * pool.length)]; } }
      this.activate(this.cards[pick].m);
    }
  }
  update(dt) {
    this.t += dt;
    for (const c of this.cards) { // flip animation: squash x to 0, swap face, unsquash
      if (c.flip > 0) { c.flip -= dt; const u = Math.max(0, c.flip) / 0.2; const sx = Math.abs(u * 2 - 1); c.m.scale.x = Math.max(0.02, sx); if (u < 0.5 && c.showFace !== c.up) { c.showFace = c.up; c.m.material.map = c.up ? symTex(c.sym, c.matched) : backTex(); } if (c.flip <= 0) c.m.scale.x = 1; }
    }
    if (this.done) { this.reveal -= dt; drawTimer(this.timer, this.done.success ? 'All pairs found!' : 'Out of time!', this.done.success ? 'Sharp memory.' : 'The mirrors shuffle away...', TIME - Math.max(0, this.t), `${this.matchedPairs}/${this.o.pairs}`, this.done.success ? '#3cc97a' : '#9a8fd0'); return this.reveal <= 0 ? this.done : null; }
    if (this.t < 0) { drawTimer(this.timer, this.title, 'Remember where everything is...', TIME, `${Math.ceil(-this.t)}`, '#4fc3ff'); this.targets.length = 0; return null; }
    if (this.t - dt < 0) for (let i = 0; i < this.n; i++) this.setUp(this.cards[i], false);
    if (this.t >= TIME) { this.done = { success: false }; this.reveal = 1.4; for (let i = 0; i < this.n; i++) { const c = this.cards[i]; c.matched = c.matched; this.setUp(c, true); } return null; }
    if (this.wait > 0) { this.wait -= dt; if (this.wait <= 0) this.resolvePair(); }
    this.targets.length = 0; for (let i = 0; i < this.n; i++) { const c = this.cards[i]; if (!c.matched && !c.up) this.targets.push(c.m); }
    if (this.o.ai && this.wait <= 0) { this.aiT -= dt; if (this.aiT <= 0) { this.aiT = rr(0.45, 0.8) / Math.max(0.4, this.o.skill); this.aiStep(); } }
    drawTimer(this.timer, this.title, this.o.ai ? `${this.o.name} is matching...` : 'Look at a card and pinch to flip it.', TIME - this.t, `${this.matchedPairs}/${this.o.pairs}`, '#ff4f8b');
    return null;
  }
}

// ---------------- Illusion Check ----------------
const ILLUSIONS = [
  { id: 'mullerlyer', q: 'Which line is longer?', draw(g, W, H, r, ctxA, guides) {
      const la = 380 * r.a, lb = 380 * r.b, ya = 250, yb = 470, cx = W / 2;
      g.lineWidth = 12; g.lineCap = 'round'; g.strokeStyle = '#10213a';
      const line = (y, L, out) => { g.globalAlpha = 1; g.beginPath(); g.moveTo(cx - L / 2, y); g.lineTo(cx + L / 2, y); g.stroke(); g.globalAlpha = ctxA; const f = 62, s = out ? 1 : -1; g.beginPath();
        g.moveTo(cx - L / 2, y); g.lineTo(cx - L / 2 - s * f * 0.75, y - f * 0.66); g.moveTo(cx - L / 2, y); g.lineTo(cx - L / 2 - s * f * 0.75, y + f * 0.66);
        g.moveTo(cx + L / 2, y); g.lineTo(cx + L / 2 + s * f * 0.75, y - f * 0.66); g.moveTo(cx + L / 2, y); g.lineTo(cx + L / 2 + s * f * 0.75, y + f * 0.66); g.stroke(); g.globalAlpha = 1; };
      line(ya, la, true); line(yb, lb, false);
      label(g, 'A', 120, ya); label(g, 'B', 120, yb);
      if (guides) { dashed(g, cx - la / 2, ya, cx - la / 2, yb + 40); dashed(g, cx + la / 2, ya, cx + la / 2, yb + 40); }
    } },
  { id: 'ebbinghaus', q: 'Which orange circle is bigger?', draw(g, W, H, r, ctxA, guides) {
      const ra = 46 * r.a, rb = 46 * r.b, A = [300, 370], B = [724, 370];
      g.globalAlpha = ctxA; g.fillStyle = '#9aa6c8';
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.arc(A[0] + Math.cos(a) * 150, A[1] + Math.sin(a) * 150, 62, 0, 7); g.fill(); }
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.arc(B[0] + Math.cos(a) * 80, B[1] + Math.sin(a) * 80, 18, 0, 7); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = '#ff8a3c'; g.beginPath(); g.arc(A[0], A[1], ra, 0, 7); g.fill(); g.beginPath(); g.arc(B[0], B[1], rb, 0, 7); g.fill();
      label(g, 'A', A[0], 150); label(g, 'B', B[0], 150);
      if (guides) { dashed(g, A[0] - 160, A[1] - ra, B[0] + 120, A[1] - ra); dashed(g, A[0] - 160, A[1] + ra, B[0] + 120, A[1] + ra); }
    } },
  { id: 'vh', q: 'Which line is longer: A (standing) or B (lying down)?', draw(g, W, H, r, ctxA, guides) {
      const lb = 360 * r.b, la = 360 * r.a, cx = W / 2, y = 560;
      g.lineWidth = 14; g.lineCap = 'round'; g.strokeStyle = '#10213a';
      g.beginPath(); g.moveTo(cx - lb / 2, y); g.lineTo(cx + lb / 2, y); g.stroke();
      g.strokeStyle = '#5b4bb0'; g.beginPath(); g.moveTo(cx, y); g.lineTo(cx, y - la); g.stroke();
      label(g, 'A', cx + 70, y - la / 2); label(g, 'B', cx - lb / 2 - 50, y);
      if (guides) { g.globalAlpha = 0.85; g.strokeStyle = '#5b4bb0'; g.lineWidth = 8; g.beginPath(); g.moveTo(cx - la / 2, y + 40); g.lineTo(cx + la / 2, y + 40); g.stroke(); g.globalAlpha = 1; dashed(g, cx - lb / 2, y, cx - lb / 2, y + 60); dashed(g, cx + lb / 2, y, cx + lb / 2, y + 60); }
    } },
  { id: 'ponzo', q: 'Which yellow bar is longer?', draw(g, W, H, r, ctxA, guides) {
      const cx = W / 2; g.globalAlpha = ctxA; g.strokeStyle = '#6b4a30'; g.lineWidth = 12;
      g.beginPath(); g.moveTo(cx - 300, 610); g.lineTo(cx - 40, 130); g.moveTo(cx + 300, 610); g.lineTo(cx + 40, 130); g.stroke();
      g.lineWidth = 7; for (let y = 600; y > 150; y -= 55) { const k = (610 - y) / 480, hw = 300 - 260 * k; g.beginPath(); g.moveTo(cx - hw, y); g.lineTo(cx + hw, y); g.stroke(); }
      g.globalAlpha = 1; const la = 170 * r.a, lb = 170 * r.b; g.fillStyle = '#ffc93c'; g.strokeStyle = '#10213a'; g.lineWidth = 4;
      g.fillRect(cx - la / 2, 235, la, 26); g.strokeRect(cx - la / 2, 235, la, 26); g.fillRect(cx - lb / 2, 500, lb, 26); g.strokeRect(cx - lb / 2, 500, lb, 26);
      label(g, 'A', cx + 200, 248); label(g, 'B', cx + 330, 513);
      if (guides) { dashed(g, cx - la / 2, 235, cx - la / 2, 540); dashed(g, cx + la / 2, 235, cx + la / 2, 540); }
    } },
  { id: 'jastrow', q: 'Which curved shape is bigger?', draw(g, W, H, r, ctxA, guides) {
      const arc = (cy, s, col) => { g.save(); g.translate(W / 2, cy); g.scale(s, s); g.beginPath(); g.arc(0, 330, 420, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42); g.arc(0, 330, 280, -Math.PI / 2 + 0.42, -Math.PI / 2 - 0.42, true); g.closePath(); g.fillStyle = col; g.fill(); g.restore(); };
      arc(150, r.a, '#4fc3ff'); arc(320, r.b, '#ff7fb8');
      label(g, 'A', 170, 190); label(g, 'B', 170, 360);
      if (guides) { g.globalAlpha = 0.5; arc(320, r.a, '#4fc3ff'); g.globalAlpha = 1; }
    } }
];
function label(g, t, x, y) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 34, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#10213a'; g.stroke(); g.fillStyle = '#10213a'; g.font = `800 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y + 2); }
function dashed(g, x1, y1, x2, y2) { g.save(); g.setLineDash([14, 12]); g.lineWidth = 5; g.strokeStyle = '#d9367a'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.restore(); }

export class IllusionGame extends Mini {
  constructor(stage, art) {
    super(stage, art);
    this.panel = new Panel(1024, 680, 0.46, 0.3055, 991); this.panel.mesh.position.set(0, 0.03, 0); this.group.add(this.panel.mesh);
    this.btns = [0, 1, 2].map(i => { const b = new Button(i, 0.145, 0.06, 480, 200); b.mesh.userData.board = { type: 'mini', k: i }; b.mesh.position.set((i - 1) * 0.155, -0.165, 0.005); this.group.add(b.mesh); return b; });
    this.idx = Math.floor(Math.random() * ILLUSIONS.length);
  }
  begin(o) {
    super.begin(o); this.ill = ILLUSIONS[this.idx++ % ILLUSIONS.length]; this.answer = null;
    const same = Math.random() < 0.6; // most are secretly equal; some really differ
    if (same) this.r = { a: 1, b: 1, correct: 2 }; else { const big = Math.random() < 0.5 ? 'a' : 'b'; this.r = { a: big === 'a' ? 1.2 : 1, b: big === 'b' ? 1.2 : 1, correct: big === 'a' ? 0 : 1 }; }
    this.btns[0].set('A', '#4fc3ff'); this.btns[1].set('B', '#ff7fb8'); this.btns[2].set(this.ill.id === 'vh' || this.ill.id === 'mullerlyer' || this.ill.id === 'ponzo' ? 'Same length' : 'Same size', '#3cc97a');
    this.aiT = rr(1.6, 3.2); this.drawIll(false); this.title = o.trial ? 'Ever-Glass Trial: Trick of the Eye' : 'Trick of the Eye!';
  }
  drawIll(reveal) {
    const ill = this.ill, r = this.r, ans = this.answer;
    this.panel.draw((g, W, H) => {
      rrect(g, 4, 4, W - 8, H - 8, 36); g.fillStyle = '#fffdf8'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#5b4bb0'; g.stroke();
      g.save(); g.beginPath(); g.rect(10, 10, W - 20, H - 20); g.clip(); ill.draw(g, W, H, r, reveal ? 0.18 : 1, reveal); g.restore();
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(10, 12, W - 20, 84);
      fitText(g, reveal ? verdict(r, ans, ill) : ill.q, 30, 22, W - 60, 70, 46, 800, reveal ? (ans === r.correct ? '#1f8a52' : '#d9367a') : INK, 'center');
    }, ill.id + (reveal ? 'r' + ans : '') + r.a + r.b);
  }
  activate(obj) { if (this.done || this.answer !== null) return false; const b = this.btns.find(x => x.mesh === obj); if (!b) return false; this.pick(b.i); return true; }
  pick(i) { this.answer = i; this.btns[i].picked = true; this.btns[i].redraw(); this.btns[this.r.correct].hover = true; this.btns[this.r.correct].redraw(); this.drawIll(true); this.done = { success: i === this.r.correct }; this.reveal = 3.0; this.o.sfx && this.o.sfx(i === this.r.correct ? 'match' : 'flip'); }
  update(dt) {
    this.t += dt;
    if (this.done) { this.reveal -= dt; drawTimer(this.timer, this.done.success ? 'Sharp eyes!' : 'Tricked you!', 'Your brain uses the surroundings to guess size.', TIME - this.t + this.reveal * 0, '', this.done.success ? '#3cc97a' : '#9a8fd0'); this.targets.length = 0; return this.reveal <= 0 ? this.done : null; }
    if (this.t >= TIME) { this.answer = -1; this.drawIll(true); this.done = { success: false }; this.reveal = 3.0; return null; }
    this.targets.length = 0; for (const b of this.btns) { this.targets.push(b.mesh); }
    if (this.o.ai) { this.aiT -= dt; if (this.aiT <= 0) { const ok = Math.random() < this.o.skill; this.pick(ok ? this.r.correct : (this.r.correct + 1 + Math.floor(Math.random() * 2)) % 3); } }
    drawTimer(this.timer, this.title, this.o.ai ? `${this.o.name} is studying it...` : 'Look at your answer and pinch.', TIME - this.t, '', '#ff4f8b');
    return null;
  }
  setHover(hit) { for (const b of this.btns) if (!this.done) b.setHover(b.mesh === hit); }
}
function verdict(r, ans, ill) {
  const sz = ill.id === 'ebbinghaus' || ill.id === 'jastrow' ? 'size' : 'length';
  const truth = r.correct === 2 ? `They're exactly the same ${sz}!` : `${r.correct === 0 ? 'A' : 'B'} really is bigger this time.`;
  return (ans === r.correct ? 'Correct! ' : ans === -1 ? 'Time! ' : 'Gotcha! ') + truth;
}
