// Skyboard: the family co-op board game mode of CouchCape. LIFE OVER MONEY.
// A table appears in front of the seated player. 1-4 heroes (hot-seat humans + AI teammates) roll, hop
// around a 32-space ring and help a living mini-Aurelia shine while Lord Narrowmere silvers it over.
// Everything is pinch OR gaze-dwell. Desktop: click = pinch at gaze, R = roll.
import * as THREE from 'three';
import * as R from './rules.js';
import { DISTRICTS, TRACK, SPACE_INFO, BOARD_POWERS, HERO_LINES } from './content.js';
import { buildBoardArt, animateArt, setDistricts, setShards, setClock, clockPos, spacePos, buildDie, burst, districtAngle } from './art.js';
import { Panel, Button, fitText, rrect, drawIcon, FONT, INK } from './ui.js';
import { PopGame, MatchGame, IllusionGame } from './minigames.js';
import { BoardNet } from './boardnet.js';
import { SFX, initAudio } from '../audio.js';
import { POWERS } from '../powers.js';
import { heroName } from '../select.js';
import { bus as coreBus } from '../core.js';
import { say as storySay } from '../story.js';

export { BoardNet };
const SAVE_KEY = 'couchcape.board.v1';
const HEAD = new THREE.Vector3(0, 0.72, 0.62); // seated head in board-local space
const KIND_COLOR = { turn: '#ff4f8b', help: '#ff7fb8', kind: '#ff9a3c', fact: '#3fb6ef', power: '#f2b600', mini: '#8c7fd0', trial: '#7a5cff', reflect: '#7a5cff', intro: '#ff4f8b', over: '#3cc97a', lost: '#8c7fd0', outcome: '#3cc97a' };
const KIND_ICON = { turn: 'glim', help: 'help', kind: 'kind', fact: 'fact', power: 'power', mini: 'echo', trial: 'shard', reflect: 'shard', intro: 'heart', over: 'heart', lost: 'clock', outcome: 'glim' };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
const hex = n => '#' + n.toString(16).padStart(6, '0');
const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

export class BoardGame {
  constructor({ scene, camera, rig, gaze, hands, bus, settings, buildHero, heroIds, net } = {}) {
    this.scene = scene; this.camera = camera; this.rig = rig; this.gaze = gaze; this.hands = hands;
    this.bus = bus || coreBus; this.settings = settings || {}; this.buildHero = buildHero; this.heroIds = heroIds || Object.keys(POWERS);
    this.net = net || null; this.G = null; this.mode = 'off'; this.q = []; this.cur = null; this.time = 0; this.speed = 1;
    this.log = []; this.tokens = []; this._targets = []; this.btnOpts = []; this.ended = false;
    R.setHeroLabel(id => heroName(id));
    const A = this.A = buildBoardArt(); this.root = A.root; this.root.visible = false; scene.add(this.root);
    // die
    this.die = buildDie(); this.dieRest = new THREE.Vector3(0.3, 0.026, 0.43); this.die.position.copy(this.dieRest); this.root.add(this.die);
    const dh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    dh.userData = { gazeable: true, dwell: true, dwellTime: 0.9, board: { type: 'die' } }; this.die.add(dh); this.dieHit = dh;
    this.dieAnim = null;
    // panels beside the table
    this.card = new Panel(1024, 720, 0.6, 0.422, 990); this.card.mesh.position.set(0, 0.5, -0.4); this.root.add(this.card.mesh);
    this.btns = [0, 1, 2, 3].map(i => { const b = new Button(i); this.root.add(b.mesh); b.mesh.visible = false; return b; });
    this.status = new Panel(768, 1100, 0.34, 0.487, 989); this.status.mesh.position.set(-0.58, 0.36, -0.16); this.root.add(this.status.mesh);
    this.logP = new Panel(768, 860, 0.34, 0.381, 989); this.logP.mesh.position.set(0.58, 0.4, -0.16); this.root.add(this.logP.mesh);
    // mini-game stage
    this.stage = new THREE.Group(); this.stage.position.set(0, 0.42, -0.26); this.stage.scale.setScalar(1.25); this.root.add(this.stage);
    this.minis = { pop: new PopGame(this.stage, A), match: new MatchGame(this.stage, A), illusion: new IllusionGame(this.stage, A) };
    this.mini = null;
    for (const o of [this.card.mesh, this.status.mesh, this.logP.mesh, this.stage, ...this.btns.map(b => b.mesh)]) o.lookAt(this.root.localToWorld(_v.copy(HEAD))); // re-aimed in place()
    this.onKey = e => { if (this.mode === 'off') return; if (e.code === 'KeyR') { if (this.mode === 'await' && this.G.phase === 'turn') this.humanPick('roll'); } };
    this.vis = null;
  }

  // ---------------- public API ----------------
  static hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
  get gazeTargets() { return this._targets; }

  start({ players, difficulty = 'medium', seed, resume = false, speed = 1, skipIntro = false } = {}) {
    this.stop(); initAudio();
    let G = null;
    if (resume) { try { const s = localStorage.getItem(SAVE_KEY); if (s) G = R.restore(s); } catch (e) { G = null; } }
    if (!G) {
      if (!players || !players.length) players = [{ heroId: this.heroIds[0], human: true }];
      players = players.slice(0, 4);
      if (players.length === 1) players.push({ heroId: this.heroIds.find(h => h !== players[0].heroId) || 'chrona', human: false }); // solo: an AI buddy joins
      G = R.newGame({ players, difficulty, seed: seed !== undefined ? seed : (Date.now() & 0x7fffffff) });
    }
    this.cfg = { players: G.players.map(p => ({ heroId: p.heroId, human: p.human })), difficulty: G.difficulty, speed };
    this.G = G; this.speed = speed; this.ended = false; this.log = []; this.q = []; this.cur = null; this.mini = null;
    this.vis = this.snapVis();
    this.place(); this.buildTokens(); this.root.visible = true;
    setClock(this.A, this.vis.clock, R.D(G).clockMax); this.syncVisuals(true);
    clockPos(this.vis.clock, R.D(G).clockMax, this.A.narrow.position);
    this.A.narrow.scale.setScalar(1); this.A.spire.position.y = 0.15; this.A.spire.scale.set(0.024, 0.09, 0.024); this.A.glassMat.color.set(0xdfe6ff); this.A.glassMat.emissive.set(0x6a5aa8);
    addEventListener('keydown', this.onKey);
    if (this.net && this.net.role === 'host') this.wireHost();
    if (this.net && this.net.role === 'guest') this.wireGuest();
    this.mode = 'idle';
    if (resume && G.turn > 0) { this.say('Odessa', 'Welcome back! Picking up right where we left off.'); }
    else if (!skipIntro) this.showIntro(); else this.say('Odessa', HERO_LINES.start);
    this.drawStatus(); this.drawLog();
    this.broadcast([]);
    return G;
  }
  // In-VR table setup: resume? -> how many heroes -> how many people (hot-seat) -> difficulty -> start().
  // opts: { heroId (seat 1 hero, e.g. the hero picked in the plaza), difficulty (preselect), speed }
  setup(opts = {}) {
    this.stop(); initAudio(); this.G = null; this.vis = null;
    for (const t of this.tokens) this.root.remove(t.grp); this.tokens = [];
    this.setupOpts = { heroId: opts.heroId || this.heroIds[0], speed: opts.speed || 1 }; this.setupSel = {};
    this.place(); this.root.visible = true; this.mode = 'setup'; addEventListener('keydown', this.onKey);
    this.setupStep(BoardGame.hasSave() ? 'resume' : 'count');
  }
  setupStep(step) {
    this.setupSel.step = step; const S = this.setupSel;
    const steps = {
      resume: ['Continue your last game?', 'Your table is just how you left it.', [{ id: 'resume', label: 'Continue' }, { id: 'new', label: 'New game' }]],
      count: ['How many heroes at the table?', 'Solo players get an AI teammate. Everyone wins or loses together.', [{ id: 1, label: 'Just me' }, { id: 2, label: '2 heroes' }, { id: 3, label: '3 heroes' }, { id: 4, label: '4 heroes' }]],
      humans: ['How many people are playing?', 'Hot-seat: pass the headset when it\'s your hero\'s turn. Empty seats get smart AI teammates.', Array.from({ length: S.count || 1 }, (_, i) => ({ id: i + 1, label: i === 0 ? '1 person + AI' : `${i + 1} people` }))],
      diff: ['How tough is Lord Narrowmere?', 'Easy is great for little heroes. Expert is... expert.', [{ id: 'easy', label: 'Easy' }, { id: 'medium', label: 'Medium' }, { id: 'hard', label: 'Hard' }, { id: 'expert', label: 'Expert' }]]
    }[step];
    this.drawCard({ kind: 'intro', title: steps[0], text: steps[1] }); this.showCard(); this.setButtons(steps[2], '#ff4f8b'); this.bus.emit('panelOpen');
  }
  setupPick(opt) {
    const S = this.setupSel; SFX.select();
    if (S.step === 'resume') { if (opt.id === 'resume') { this.start({ resume: true, speed: this.setupOpts.speed }); return; } BoardGame.clearSave(); return this.setupStep('count'); }
    if (S.step === 'count') { S.count = opt.id; return this.setupStep(S.count > 1 ? 'humans' : 'diff'); }
    if (S.step === 'humans') { S.humans = opt.id; return this.setupStep('diff'); }
    if (S.step === 'diff') {
      const first = this.setupOpts.heroId, others = this.heroIds.filter(h => h !== first), n = S.count || 1, humans = S.humans || 1;
      const players = Array.from({ length: n }, (_, i) => ({ heroId: i === 0 ? first : others[(i - 1) % others.length], human: i < humans }));
      this.start({ players, difficulty: opt.id, speed: this.setupOpts.speed });
    }
  }
  stop() {
    removeEventListener('keydown', this.onKey);
    this.mode = 'off'; this.q = []; this.cur = null; if (this.mini) { this.mini.end(); this.mini = null; }
    this.root.visible = false; this._targets.length = 0; this.hideButtons();
  }
  update(dt, t) {
    if (this.mode === 'off') return;
    dt = Math.min(dt, 0.1) * this.speed; this.time += dt; t = this.time;
    const G = this.G;
    animateArt(this.A, dt, t, G ? this.vis : null, G ? R.D(G) : null);
    if (this.mode === 'setup' || !G) { const hit = this.gaze && this.gaze.hit; this._targets.length = 0; for (const b of this.btns) if (b.mesh.visible) { b.setHover(b.mesh === hit); this._targets.push(b.mesh); } return; }
    // queue playback
    let guard = 0;
    while (this.q.length || this.cur) {
      if (!this.cur) { this.cur = this.q.shift(); this.cur.el = 0; if (this.cur.start) this.cur.start(); }
      const c = this.cur; c.el += guard === 0 ? dt : 0; const u = c.dur > 0 ? Math.min(1, c.el / c.dur) : 1;
      if (c.upd) c.upd(u);
      if (u >= 1) { if (c.end) c.end(); this.cur = null; if (++guard > 40) break; continue; }
      break;
    }
    if (!this.q.length && !this.cur && this.mode === 'idle') this.control();
    // AI pacing
    if (this.mode === 'ai') { this.aiT -= dt; if (this.aiT <= 0) this.aiStep(); }
    if (this.mode === 'mini' && this.mini) {
      const res = this.mini.update(dt);
      this._targets.length = 0; for (const m of this.mini.targets) this._targets.push(m);
      if (this.mini.setHover) this.mini.setHover(this.gaze && this.gaze.hit);
      if (res) { const ok = res.success; this.mini.end(); this.mini = null; this.mode = 'idle'; this.stats('mini', ok); this.apply('miniResult', ok); }
    }
    this.animTokens(dt, t);
    this.animDie(dt);
    // hover feedback on buttons
    const hit = this.gaze && this.gaze.hit;
    for (const b of this.btns) if (b.mesh.visible) b.setHover(b.mesh === hit);
    const dieOn = this.mode === 'await' && G && G.phase === 'turn';
    this.die.scale.setScalar(dieOn ? 1 + (hit === this.dieHit ? 0.12 : 0.04 * Math.sin(t * Math.PI)) : 1);
    if (this.mode === 'await' || this.mode === 'over' || this.mode === 'intro') { this._targets.length = 0; for (const b of this.btns) if (b.mesh.visible && b.enabled) this._targets.push(b.mesh); if (dieOn) this._targets.push(this.dieHit); }
    else if (this.mode !== 'mini') this._targets.length = 0;
    // Narrowmere drifts to his clock notch, bobbing gently
    const nm = this.A.narrow; clockPos(this.vis.clockShown, R.D(G).clockMax, _v); nm.position.lerp(_v, Math.min(1, dt * 3)); nm.position.y = 0.004 + Math.abs(Math.sin(t * 1.4)) * 0.004; nm.lookAt(0, nm.position.y, 0);
  }
  activate(obj) {
    const b = obj && obj.userData && obj.userData.board; if (!b || this.mode === 'off') return false;
    initAudio();
    if (b.type === 'die') { if (this.mode === 'await' && this.G.phase === 'turn') { this.humanPick('roll'); return true; } return false; }
    if (b.type === 'btn') {
      const opt = this.btnOpts[b.i]; if (!opt || !this.btns[b.i].mesh.visible) return false;
      if (this.mode === 'setup') { this.setupPick(opt); return true; }
      if (this.mode === 'intro') { this.hideButtons(); this.mode = 'idle'; SFX.select(); return true; }
      if (this.mode === 'over') { SFX.select(); if (opt.id === 'again') this.start({ ...this.cfg, skipIntro: true }); else { this.bus.emit('boardLeave', {}); this.stop(); } return true; }
      if (this.mode === 'await') { this.humanPick(opt.id, b.i); return true; }
      return false;
    }
    if (b.type === 'mini' && this.mode === 'mini' && this.mini && !this.mini.o.ai) return this.mini.activate(obj);
    return false;
  }

  // ---------------- placement + tokens ----------------
  place() {
    const head = new THREE.Vector3(), f = new THREE.Vector3();
    if (this.camera) { this.camera.getWorldPosition(head); this.camera.getWorldDirection(f); } else f.set(0, 0, -1);
    f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    this.root.position.copy(head).addScaledVector(f, HEAD.z).add(new THREE.Vector3(0, -HEAD.y, 0));
    this.root.rotation.set(0, Math.atan2(-f.x, -f.z), 0); this.root.updateMatrixWorld(true);
    this.root.localToWorld(_w.copy(HEAD));
    for (const o of [this.card.mesh, this.status.mesh, this.logP.mesh, this.stage, ...this.btns.map(b => b.mesh)]) o.lookAt(_w);
  }
  buildTokens() {
    for (const t of this.tokens) this.root.remove(t.grp);
    this.tokens = [];
    const baseGeo = this._baseGeo || (this._baseGeo = new THREE.CylinderGeometry(0.019, 0.022, 0.008, 24));
    this.G.players.forEach((p, i) => {
      const grp = new THREE.Group();
      const col = (POWERS[p.heroId] || POWERS.ribbon).color;
      const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.4 })); base.position.y = 0.004; grp.add(base);
      let hero = null;
      try { hero = this.buildHero ? this.buildHero(p.heroId) : null; } catch (e) { hero = null; }
      if (hero && hero.group) {
        const box = new THREE.Box3().setFromObject(hero.group), h = Math.max(0.5, Math.min(box.max.y - box.min.y, 2.4));
        hero.group.scale.setScalar(0.11 / h); hero.group.position.y = 0.008; grp.add(hero.group);
      }
      this.root.add(grp);
      const tk = { grp, hero, base, space: p.pos, hop: null, slot: i, color: hex(col) };
      this.placeToken(tk, p.pos, true); this.tokens.push(tk);
    });
  }
  slotOffset(i, space, out) {
    const a = (space / TRACK.length) * Math.PI * 2, n = this.G.players.length;
    // up to 4 heroes share a tile in a little diamond: along the track and across it
    const OFF = n <= 1 ? [[0, 0]] : n === 2 ? [[-0.017, 0], [0.017, 0]] : n === 3 ? [[-0.018, 0.01], [0.018, 0.01], [0, -0.016]] : [[-0.019, 0.011], [0.019, 0.011], [-0.019, -0.013], [0.019, -0.013]];
    const [t, r] = OFF[i] || [0, 0];
    return out.set(Math.cos(a) * t + Math.sin(a) * r, 0, -Math.sin(a) * t + Math.cos(a) * r);
  }
  placeToken(tk, space, snap) {
    spacePos(space, _v); this.slotOffset(tk.slot, space, _w); _v.add(_w);
    tk.space = space; if (snap) tk.grp.position.copy(_v);
    tk.target = tk.target || new THREE.Vector3(); tk.target.copy(_v);
  }
  animTokens(dt, t) {
    const G = this.G;
    this.tokens.forEach((tk, i) => {
      if (tk.hop) {
        const h = tk.hop; h.el += dt; const u = Math.min(1, h.el / h.dur);
        tk.grp.position.lerpVectors(h.from, h.to, u); tk.grp.position.y = h.from.y + Math.sin(u * Math.PI) * h.height;
        const sq = u > 0.85 ? 1 - Math.sin((u - 0.85) / 0.15 * Math.PI) * 0.22 : 1 + Math.sin(u * Math.PI) * 0.08;
        tk.grp.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        if (u >= 1) { tk.hop = null; tk.grp.scale.set(1, 1, 1); }
      } else if (!tk.sinking) tk.grp.position.lerp(tk.target, Math.min(1, dt * 8));
      // face direction of travel (tangent of the ring), turn to the player while idle
      const a = tk.space / TRACK.length * Math.PI * 2, face = tk.hop ? Math.atan2(Math.cos(a), -Math.sin(a)) : Math.atan2(HEAD.x - tk.grp.position.x, HEAD.z - tk.grp.position.z);
      let df = face - tk.grp.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); tk.grp.rotation.y += df * Math.min(1, dt * 8);
      if (tk.hero && tk.hero.update) tk.hero.update(dt, t);
    });
    // highlight ring under the current player's token
    if (G && G.players[G.cur]) { const tk = this.tokens[G.cur]; if (tk) { spacePos(tk.space, _w); this.A.highlight.position.set(_w.x, 0.0135, _w.z); this.A.highlight.material.color.set(tk.color); } }
  }
  animDie(dt) {
    const d = this.dieAnim; if (!d) return;
    d.el += dt; const u = Math.min(1, d.el / d.dur);
    if (u < 0.75) { const k = u / 0.75; this.die.position.set(this.dieRest.x - 0.06 * Math.sin(k * Math.PI), this.dieRest.y + Math.sin(k * Math.PI) * 0.12, this.dieRest.z - 0.05 * Math.sin(k * Math.PI)); this.die.rotation.x += dt * 14 * (1 - k * 0.6); this.die.rotation.z += dt * 11 * (1 - k * 0.6); d.q0.copy(this.die.quaternion); }
    else { const k = (u - 0.75) / 0.25; this.die.position.copy(this.dieRest); this.die.quaternion.slerpQuaternions(d.q0, d.q1, ease(k)); }
    if (u >= 1) { this.dieAnim = null; this.die.quaternion.copy(d.q1); }
  }

  // ---------------- state <-> visuals ----------------
  snapVis() { const G = this.G; return { light: G.light.slice(), restored: G.restored.slice(), beacon: G.beacon.slice(), shards: G.shards, clock: G.clock, clockShown: G.clock, heart: G.heart, glim: G.players.map(p => p.glim) }; }
  syncVisuals() { const V = this.vis; setDistricts(this.A, V, R.RESTORED); setShards(this.A, V.shards, R.D(this.G).shards); setClock(this.A, V.clock, R.D(this.G).clockMax); }

  // All rules mutations go through here (network + save aware).
  apply(fn, arg) {
    if (!this.G || this.G.over) return;
    if (this.net && this.net.role === 'guest') { this.net.sendAction(fn, arg); this.mode = 'wait'; return; }
    const ev = R[fn](this.G, arg) || [];
    this.play(ev); this.broadcast(ev);
    if (this.G.phase === 'turn' && !this.G.over) this.save();
    if (this.G.over) BoardGame.clearSave();
  }
  broadcast(ev) { if (this.net && this.net.role === 'host') this.net.broadcast(this.G, ev); }
  save() { try { localStorage.setItem(SAVE_KEY, R.snapshot(this.G)); } catch (e) { /* storage blocked: ignore */ } }

  isAI(p) { return !p.human || p.owner === 'remote'; } // an unclaimed remote seat plays as AI until a friend joins
  isLocalHuman(p) { if (!p || !p.human) return false; if (!this.net) return true; return this.net.role === 'guest' ? p.owner === this.net.id : !p.owner; }
  actingPlayer() { const G = this.G; return G.phase === 'trial' && G.showdown ? G.players[G.showdown.player] : G.players[G.cur]; }

  // Decide what happens once all animations have played.
  control() {
    const G = this.G; if (!G) return;
    if (G.over) { if (!this.ended) this.finish(); return; }
    const p = this.actingPlayer(), local = this.isLocalHuman(p), drivesAI = this.isAI(p) && (!this.net || this.net.role === 'host');
    const remote = !this.isAI(p) && !local;
    if (G.phase === 'turn' || G.phase === 'decide') {
      this.showPending(G.pending, p, local);
      if (local) this.mode = 'await';
      else if (drivesAI) { this.mode = 'ai'; this.aiT = G.phase === 'turn' ? 1.1 : 2.4; }
      else this.mode = 'wait';
      if (remote) this.say('Odessa', `Waiting for ${heroName(p.heroId)}'s player...`, true);
      return;
    }
    if (G.phase === 'mini' || G.phase === 'trial') {
      if (!local && !drivesAI) { this.showPending(G.pending, p, false, true); this.mode = 'wait'; return; }
      const P = G.pending; this.showPending(P, p, local, true);
      this.q.push({ dur: 1.7, end: () => this.startMini(P, p, !local) });
      return;
    }
    if (G.phase === 'done') { if (!this.net || this.net.role !== 'guest') this.apply('endTurn'); else this.mode = 'wait'; return; }
  }
  startMini(P, p, ai) {
    if (this.G.phase !== 'mini' && this.G.phase !== 'trial') return;
    this.hideCard(); const Dd = R.D(this.G);
    const m = this.minis[P.game]; this.mini = m;
    m.begin({ ai, skill: Dd.aiSkill, need: Dd.popNeed, pairs: Dd.pairs, hard: this.G.difficulty === 'hard' || this.G.difficulty === 'expert', trial: P.kind === 'trial', name: heroName(p.heroId), sfx: k => this.sfx(k) });
    this.mode = 'mini';
    if (!ai) this.bus.emit('panelOpen');
  }
  aiStep() {
    const G = this.G; const id = R.aiAct(G); if (id == null) { this.mode = 'idle'; return; }
    const i = G.pending.options.findIndex(o => o.id === id);
    if (i >= 0 && this.btns[i].mesh.visible) { this.btns[i].picked = true; this.btns[i].redraw(); }
    this.mode = 'idle';
    this.q.push({ dur: 0.55, end: () => this.apply(G.phase === 'turn' ? 'act' : 'choose', id) });
  }
  humanPick(id, i) {
    const G = this.G; if (this.mode !== 'await') return;
    if (i !== undefined && this.btns[i]) { this.btns[i].picked = true; this.btns[i].redraw(); }
    SFX.select(); this.mode = 'idle';
    this.apply(G.phase === 'turn' ? 'act' : 'choose', id);
  }

  // ---------------- event playback ----------------
  play(ev) {
    const V = this.vis, G = this.G, Dd = R.D(G);
    for (const e of ev) {
      switch (e.type) {
        case 'die': this.q.push({ dur: 1.0, start: () => { this.hideButtons(); this.hideCard(); this.dieAnim = { el: 0, dur: 0.95, q0: new THREE.Quaternion(), q1: this.die.userData.faceQuat(e.value).premultiply(_q2.setFromAxisAngle(_up, Math.random() * 6.28)) }; SFX.spark(); }, end: () => this.say(heroName(G.players[G.cur].heroId), `Rolled a ${e.value}!`, true) }); break;
        case 'move': { const tk = this.tokens[e.p]; for (const s of e.path) this.q.push({ dur: 0.27, start: () => { const from = tk.grp.position.clone(); this.placeToken(tk, s); tk.hop = { from, to: tk.target.clone(), el: 0, dur: 0.26, height: 0.035 }; }, end: () => SFX.select() }); this.q.push({ dur: 0.25 }); break; }
        case 'portal': { const tk = this.tokens[e.p]; this.q.push({ dur: 0.35, start: () => { tk.sinking = true; burst(this.A, tk.grp.position.x, 0.02, tk.grp.position.z, '#a57bff', 18, 0.08); SFX.freeze(); }, upd: u => tk.grp.scale.setScalar(Math.max(0.01, 1 - u)) });
          this.q.push({ dur: 0.35, start: () => { this.placeToken(tk, e.to, true); burst(this.A, tk.grp.position.x, 0.02, tk.grp.position.z, '#a57bff', 18, 0.08); }, upd: u => tk.grp.scale.setScalar(Math.max(0.01, u)), end: () => { tk.sinking = false; tk.grp.scale.set(1, 1, 1); } }); break; }
        case 'pull': { const tk = this.tokens[e.p]; this.q.push({ dur: 0.5, start: () => { const from = tk.grp.position.clone(); this.placeToken(tk, e.to); tk.hop = { from, to: tk.target.clone(), el: 0, dur: 0.48, height: 0.08 }; } }); break; }
        case 'glim': this.q.push({ dur: 0.12, start: () => { V.glim[e.p] = e.total; const tk = this.tokens[e.p]; if (e.n > 0) burst(this.A, tk.grp.position.x, 0.08, tk.grp.position.z, '#ffe27a', 8, 0.06); this.drawStatus(); } }); break;
        case 'heart': this.q.push({ dur: 0.15, start: () => { V.heart = e.total; if (e.n > 0) burst(this.A, 0, 0.2, 0, '#ff7fb8', 10, 0.08); this.drawStatus(); } }); break;
        case 'gift': this.q.push({ dur: 0.6, start: () => { const a = this.tokens[e.from].grp.position, b = this.tokens[e.to].grp.position; burst(this.A, a.x, 0.06, a.z, '#ffe27a', 10, 0.05); burst(this.A, b.x, 0.06, b.z, '#ffe27a', 14, 0.07); SFX.spark(); this.say('Odessa', `${heroName(G.players[e.from].heroId)} gifted 2 Glimmers to ${heroName(G.players[e.to].heroId)}. That's the spirit!`, true); } }); break;
        case 'light': this.q.push({ dur: 0.6, start: () => { V.light[e.d] = e.to; this.syncVisuals(); const a = districtAngle(e.d); const up = e.to > e.from;
            burst(this.A, Math.sin(a) * 0.205, 0.09, Math.cos(a) * 0.205, up ? DISTRICTS[e.d].color : '#c9cde0', up ? 22 : 12, up ? 0.12 : 0.05); if (up) SFX.spark(); else SFX.hurt(); this.drawStatus(); } }); break;
        case 'restored': this.q.push({ dur: 0.9, start: () => { V.restored[e.d] = true; const a = districtAngle(e.d); burst(this.A, Math.sin(a) * 0.205, 0.2, Math.cos(a) * 0.205, '#fff2a8', 30, 0.15); SFX.container(); this.drawStatus(); } }); break;
        case 'silvered': this.q.push({ dur: 0.7, start: () => { SFX.ko(); this.drawStatus(); } }); break;
        case 'ripple': this.q.push({ dur: 0.35, start: () => { for (let d = 0; d < 6; d++) { const a = districtAngle(d); burst(this.A, Math.sin(a) * 0.12, 0.06, Math.cos(a) * 0.12, '#ff9ac4', 4, 0.05); } } }); break;
        case 'shard': this.q.push({ dur: 0.55, start: () => { V.shards = e.total; this.syncVisuals(); burst(this.A, 0, 0.12, 0, '#8ff6ff', 20, 0.1); SFX.container(); this.drawStatus(); } }); break;
        case 'clock': this.q.push({ dur: 0.75, start: () => { V.clock = e.to; setClock(this.A, V.clock, Dd.clockMax); if (e.to > e.from) SFX.freeze(); this.drawStatus(); }, upd: u => { V.clockShown = e.from + (e.to - e.from) * ease(u); } }); break;
        case 'villain': this.q.push({ dur: 0.5, start: () => { this.A.narrow.scale.setScalar(1.25); }, upd: u => this.A.narrow.scale.setScalar(1.25 - 0.25 * u) }); break;
        case 'beacon': case 'blocked': this.q.push({ dur: 0.45, start: () => { V.beacon[e.d] = e.n; const a = districtAngle(e.d); burst(this.A, Math.sin(a) * 0.25, 0.06, Math.cos(a) * 0.25, '#7ff3ff', 14, 0.07); SFX.freeze(); } }); break;
        case 'power': this.q.push({ dur: 0.9, start: () => { const tk = this.tokens[G.cur]; if (tk.hero && tk.hero.cast) try { tk.hero.cast(); } catch (er) { /* art optional */ } burst(this.A, tk.grp.position.x, 0.1, tk.grp.position.z, tk.color, 26, 0.12); SFX.container(); } }); break;
        case 'say': this.q.push({ dur: e.who === 'Narrowmere' ? 1.0 : 0.5, start: () => this.say(e.who, e.text) }); break;
        case 'chose': break;
        case 'outcome': this.q.push({ dur: 2.6, start: () => { this.hideButtons(); this.drawCard({ kind: e.ok === false ? 'lost' : 'outcome', title: e.ok === undefined ? 'What happened' : e.ok ? 'Nice!' : 'Oh no...', text: e.text }); this.showCard(); } }); break;
        case 'next': this.q.push({ dur: 0.3, start: () => { const p = G.players[e.p]; this.say('Odessa', `${heroName(p.heroId)}'s turn${p.human ? '' : ' (AI teammate)'}.`, true); this.drawStatus(); } }); break;
        case 'showdown': this.q.push({ dur: 1.6, start: () => { this.say('Odessa', HERO_LINES.showdown); SFX.container(); }, upd: u => { this.A.spire.position.y = 0.15 + 0.12 * ease(u); this.A.spire.scale.set(0.024 + 0.012 * u, 0.09 + 0.03 * u, 0.024 + 0.012 * u); this.A.glassMat.emissiveIntensity = 0.35 + 0.5 * u; } }); break;
        case 'showdownFail': this.q.push({ dur: 1.0, upd: u => { this.A.spire.position.y = 0.27 - 0.12 * ease(u); } }); break;
        case 'retry': case 'retryReflect': this.q.push({ dur: 0.4 }); break;
        case 'over': this.q.push({ dur: 0.1 }); break;
      }
    }
    this.q.push({ dur: 0.05, start: () => { this.vis = this.snapVis(); this.syncVisuals(); this.drawStatus(); } });
  }

  finish() {
    const G = this.G, won = G.over.won; this.ended = true; this.mode = 'over';
    this.hideCard();
    if (won) { this.A.glassMat.color.set(0xfff1b0); this.A.glassMat.emissive.set(0xffb84d); this.A.glassMat.emissiveIntensity = 0.8; this.A.narrow.scale.setScalar(0.0001); for (let d = 0; d < 6; d++) { const a = districtAngle(d); burst(this.A, Math.sin(a) * 0.2, 0.15, Math.cos(a) * 0.2, DISTRICTS[d].color, 14, 0.14); } SFX.container(); }
    else { this.A.narrow.scale.setScalar(1.6); SFX.ko(); }
    const s = G.stats;
    this.drawCard({ kind: won ? 'over' : 'lost', title: won ? 'Aurelia shines!' : 'The glass wins this round', text: (won ? HERO_LINES.win : HERO_LINES.lose.replace('The glass wins this round. ', '')) + `\n\nHelps: ${s.helps}   Gifts: ${s.gifts}   Heart: ${G.heart}   Turns: ${G.turn}` });
    this.showCard(); this.setButtons([{ id: 'again', label: 'Play again' }, { id: 'leave', label: 'Leave the table' }], won ? '#3cc97a' : '#8c7fd0');
    this.say('Odessa', won ? HERO_LINES.win : HERO_LINES.lose);
    this.bus.emit('boardEnd', { won, turns: G.turn, stats: { ...s, heart: G.heart }, difficulty: G.difficulty });
    BoardGame.clearSave();
  }
  showIntro() {
    const human = this.G.players.some(p => this.isLocalHuman(p));
    this.drawCard({ kind: 'intro', title: 'Welcome to Skyboard!', text: 'We win TOGETHER. Give Glimmers to light up the six districts, gather Ever-Glass Shards, then seal the glass before Lord Narrowmere silvers everything. You can\'t buy the win. You can only help.' });
    this.showCard(); this.say('Odessa', HERO_LINES.start);
    if (human) { this.setButtons([{ id: 'go', label: 'Let\'s play!' }], '#ff4f8b'); this.mode = 'intro'; this.bus.emit('panelOpen'); }
    else this.q.push({ dur: 3.5, end: () => this.hideCard() });
  }

  // ---------------- UI drawing ----------------
  showPending(P, p, local, isMini) {
    if (!P) return;
    const G = this.G, kind = P.kind === 'turn' ? 'turn' : P.kind;
    let text = P.text;
    if (P.kind === 'turn') text = local ? (G.players.filter(q => q.human).length > 1 ? `${heroName(p.heroId)}'s player: pinch the die (or look at it) to roll. Or gift Glimmers first!` : 'Pinch the die (or look at it) to roll. Or gift Glimmers first!') : `${heroName(p.heroId)} (AI teammate) is taking a turn...`;
    const sub = local ? 'Look at a choice and hold, or pinch.' : p.human ? `Waiting for ${heroName(p.heroId)}'s player` : `${heroName(p.heroId)} is deciding...`;
    this.drawCard({ kind, title: P.title, text, sub: isMini ? (local ? 'Get ready... 10 seconds!' : `${heroName(p.heroId)} takes this one!`) : sub, hero: p.heroId });
    this.showCard();
    if (isMini) { this.hideButtons(); return; }
    this.setButtons(P.options, KIND_COLOR[kind] || '#ff4f8b', !local);
    if (local) this.bus.emit('panelOpen');
  }
  setButtons(opts, color, disabled = false) {
    this.btnOpts = (opts || []).slice(0, 4); const n = this.btnOpts.length;
    const pos = n === 1 ? [[0, 0.255]] : n === 2 ? [[-0.16, 0.255], [0.16, 0.255]] : n === 3 ? [[-0.16, 0.255], [0.16, 0.255], [0, 0.175]] : [[-0.16, 0.255], [0.16, 0.255], [-0.16, 0.175], [0.16, 0.175]];
    this.btns.forEach((b, i) => {
      const o = this.btnOpts[i]; b.mesh.visible = !!o; if (!o) return;
      b.mesh.position.set(pos[i][0], pos[i][1], -0.36 + (pos[i][1] < 0.2 ? 0.02 : 0)); this.root.localToWorld(_w.copy(HEAD)); b.mesh.lookAt(_w);
      b.set(o.label, color, !disabled);
    });
  }
  hideButtons() { this.btns.forEach(b => { b.mesh.visible = false; }); this.btnOpts = []; }
  showCard() { this.card.mesh.visible = true; }
  hideCard() { this.card.mesh.visible = false; }
  drawCard({ kind, title, text, sub, hero }) {
    const col = KIND_COLOR[kind] || '#ff4f8b';
    this.card.draw((g, W, H) => {
      g.shadowColor = 'rgba(16,33,58,0.25)'; g.shadowBlur = 24; rrect(g, 16, 16, W - 32, H - 32, 44); g.fillStyle = '#ffffff'; g.fill(); g.shadowBlur = 0;
      g.save(); rrect(g, 16, 16, W - 32, H - 32, 44); g.clip(); g.fillStyle = col; g.fillRect(16, 16, W - 32, 140); g.restore();
      g.lineWidth = 8; g.strokeStyle = col; rrect(g, 16, 16, W - 32, H - 32, 44); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(100, 86, 52, 0, 7); g.fill(); drawIcon(g, KIND_ICON[kind] || 'glim', 100, 86, 64, '#ffffff');
      if (hero && POWERS[hero]) { g.fillStyle = hex(POWERS[hero].color); g.beginPath(); g.arc(W - 90, 86, 34, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke(); }
      fitText(g, title, 172, 46, W - 172 - (hero ? 150 : 60), 84, 60, 800, '#ffffff');
      const parts = String(text).split('\n\n');
      let y = 186; parts.forEach((ptxt, i) => { y += fitText(g, ptxt, 60, y, W - 120, i === 0 ? (parts.length > 1 ? 280 : 400) : 120, i === 0 ? 50 : 40, i === 0 ? 600 : 700, i === 0 ? INK : '#5b4bb0') + 18; });
      if (sub) fitText(g, sub, 60, H - 92, W - 120, 56, 36, 600, '#6a7690', 'center');
    }, [kind, title, text, sub, hero].join('|'));
  }
  drawStatus() {
    const G = this.G, V = this.vis, Dd = R.D(G); if (!G || !V) return;
    const key = JSON.stringify([V.glim, V.heart, V.shards, V.clock, V.light, V.restored, V.beacon, G.cur, G.turn, G.over]);
    this.status.draw((g, W, H) => {
      rrect(g, 8, 8, W - 16, H - 16, 40); g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#ff4f8b'; g.stroke();
      g.fillStyle = INK; g.font = `900 56px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('SKYBOARD', W / 2, 30);
      g.font = `600 30px ${FONT}`; g.fillStyle = '#6a7690'; g.fillText(`${G.difficulty[0].toUpperCase() + G.difficulty.slice(1)}  ·  Turn ${G.turn + 1}`, W / 2, 94);
      let y = 146; g.textAlign = 'left';
      G.players.forEach((p, i) => {
        const on = i === G.cur && !G.over;
        if (on) { rrect(g, 24, y - 6, W - 48, 70, 20); g.fillStyle = '#fff0f6'; g.fill(); }
        g.fillStyle = hex((POWERS[p.heroId] || POWERS.ribbon).color); g.beginPath(); g.arc(62, y + 29, 22, 0, 7); g.fill();
        g.fillStyle = INK; g.font = `${on ? 800 : 700} 40px ${FONT}`; const nm = heroName(p.heroId); g.fillText(nm, 100, y + 6); const nw = g.measureText(nm).width;
        g.font = `700 26px ${FONT}`; g.fillStyle = on ? '#d9367a' : '#6a7690'; g.fillText(this.isLocalHuman(p) ? 'YOU' : this.isAI(p) ? 'AI' : 'FRIEND', 100 + nw + 14, y + 18);
        drawIcon(g, 'glim', W - 150, y + 29, 38, '#e0a800'); g.fillStyle = INK; g.font = `800 42px ${FONT}`; g.fillText(String(V.glim[i]), W - 120, y + 6);
        y += 80;
      });
      y += 6; g.fillStyle = '#e7e3f3'; g.fillRect(30, y, W - 60, 4); y += 22;
      const row = (icon, color, label, val, frac) => { rrect(g, 24, y - 4, W - 48, 78, 18); g.fillStyle = '#f6f4fb'; g.fill(); drawIcon(g, icon, 62, y + 26, 44, color); g.fillStyle = INK; g.font = `700 36px ${FONT}`; g.fillText(label, 100, y + 6); const lw = g.measureText(label).width; g.font = `900 38px ${FONT}`; g.fillStyle = color; g.fillText(val, 100 + lw + 18, y + 5);
        if (frac !== undefined) { rrect(g, 100, y + 52, W - 140, 14, 7); g.fillStyle = '#ece8f6'; g.fill(); rrect(g, 100, y + 52, Math.max(14, (W - 140) * Math.min(1, frac)), 14, 7); g.fillStyle = color; g.fill(); } y += 84; };
      row('heart', '#ff4f8b', 'Team Heart', String(V.heart), (G.rippleAcc % R.RIPPLE_EVERY) / R.RIPPLE_EVERY);
      row('shard', '#3fb6ef', 'Shards', `${V.shards} / ${Dd.shards}`, V.shards / Dd.shards);
      row('clock', '#8c7fd0', 'Narrowmere', `${V.clock} / ${Dd.clockMax}`, V.clock / Dd.clockMax);
      y += 4; g.fillStyle = '#e7e3f3'; g.fillRect(30, y, W - 60, 4); y += 20;
      DISTRICTS.forEach((d, i) => {
        const L = V.light[i], sil = L <= 0;
        if (i % 2 === 0) { rrect(g, 24, y - 4, W - 48, 50, 14); g.fillStyle = '#f6f4fb'; g.fill(); }
        g.fillStyle = sil ? '#9aa0b8' : INK; g.font = `700 32px ${FONT}`; g.fillText(d.name + (sil ? ' (silvered)' : ''), 40, y + 4);
        for (let k = 0; k < R.RESTORED; k++) { g.fillStyle = k < L ? d.color : '#dcd9e6'; g.beginPath(); g.arc(W - 170 + k * 36, y + 22, 13, 0, 7); g.fill(); }
        if (V.restored[i]) { g.fillStyle = '#1f8a52'; g.font = `900 34px ${FONT}`; g.fillText('✓', W - 36 - 10, y + 3); }
        else if (V.beacon[i] > 0) drawIcon(g, 'power', W - 30, y + 22, 26, '#3fb6ef');
        y += 50;
      });
    }, key);
  }
  drawLog() {
    this.logP.draw((g, W, H) => {
      rrect(g, 8, 8, W - 16, H - 16, 40); g.fillStyle = 'rgba(255,255,255,0.93)'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#4fc3ff'; g.stroke();
      g.fillStyle = INK; g.font = `900 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('Story so far', W / 2, 28);
      let y = 100; const lines = this.log.slice(-6);
      for (let i = lines.length - 1; i >= 0 && y < H - 60; i--) {
        const l = lines[i], c = l.who === 'Narrowmere' ? '#7a5cff' : l.who === 'Odessa' ? '#d9367a' : '#1f6fa8';
        g.globalAlpha = i === lines.length - 1 ? 1 : 0.75; g.fillStyle = c; g.font = `800 30px ${FONT}`; g.textAlign = 'left'; g.fillText(l.who, 36, y); y += 38;
        y += fitText(g, l.text, 36, y, W - 72, Math.min(210, H - 40 - y), 34, 600, INK) + 18; g.globalAlpha = 1;
      }
    }, this.log.length + (this.log.length ? this.log[this.log.length - 1].text : ''));
  }
  say(who, text, quiet) {
    this.log.push({ who, text }); if (this.log.length > 30) this.log.shift(); this.drawLog();
    if (quiet) return;
    if (this.bus === coreBus) { try { storySay(text, who); } catch (e) { /* speech optional */ } }
    else this.bus.emit('say', { who, text, secs: Math.min(9, 2.5 + text.length * 0.055) });
  }
  sfx(k) { if (k === 'pop') SFX.spark(); else if (k === 'match') SFX.container(); else SFX.select(); }
  stats() { /* reserved hook for analytics */ }

  // ---------------- networking (host-authoritative) ----------------
  wireHost() {
    const n = this.net;
    n.onJoin = (id, hero) => { const seat = this.G.players.find(p => p.human && p.owner === 'remote') || this.G.players.find(p => !p.human && p.slot !== 0); if (!seat) return; seat.human = true; seat.owner = id; this.say('Odessa', `A friend joined as ${heroName(seat.heroId)}!`, true); this.drawStatus(); this.broadcast([]); };
    n.onLeave = id => { for (const p of this.G.players) if (p.owner === id) { p.owner = null; p.human = false; } this.drawStatus(); this.broadcast([]); if (this.mode === 'wait') this.mode = 'idle'; };
    n.onAction = m => { const p = this.actingPlayer(); if (!p || p.owner !== m.id) return; if (!['act', 'choose', 'miniResult'].includes(m.fn)) return; this.mode = 'idle'; this.hideButtons(); this.apply(m.fn, m.arg); };
  }
  wireGuest() {
    this.net.onState = m => {
      let G; try { G = JSON.parse(m.snap); } catch (e) { return; }
      const rebuild = !this.G || this.G.players.length !== G.players.length || G.players.some((p, i) => p.heroId !== this.G.players[i].heroId);
      this.G = G; if (rebuild) { this.vis = this.snapVis(); this.buildTokens(); this.syncVisuals(); }
      if (this.mini && this.G.phase !== 'mini' && this.G.phase !== 'trial') { this.mini.end(); this.mini = null; }
      this.play(m.ev || []); if (this.mode === 'wait' || this.mode === 'await' || this.mode === 'ai') this.mode = 'idle';
    };
  }
}
