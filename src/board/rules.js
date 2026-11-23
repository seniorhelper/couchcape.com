// Skyboard rules engine: pure, deterministic (seeded RNG stored in state), JSON-serializable state.
// No three.js here, so the same code runs the 3D game, network snapshots, saves and node balance sims.
//
// Flow per turn:  phase 'turn' (roll / gift)  -> roll()  -> resolve() -> pending decision or mini-game
//                 -> choose() / miniResult()  -> endTurn() (villain clock, win/loss, next player)
// Every mutating call returns an array of events for the presentation layer to animate.
import { DISTRICTS, TRACK, PORTALS, sectorOf, KINDNESS, FACTS, BOARD_POWERS, NARROWMERE_LINES } from './content.js';

export const DIFFS = {
  easy:   { start: [2, 2, 2, 2, 1, 2], tickEvery: 4, clockMax: 18, extraSilver: 0.0,  shards: 3, aiSkill: 0.85, trialsNeed: 1, silverLimit: 4, popNeed: 4, pairs: 3, startGlim: 4 },
  medium: { start: [2, 1, 2, 1, 2, 1], tickEvery: 4, clockMax: 17, extraSilver: 0.12, shards: 4, aiSkill: 0.75, trialsNeed: 2, silverLimit: 3, popNeed: 5, pairs: 3, startGlim: 3 },
  hard:   { start: [1, 2, 1, 1, 2, 1], tickEvery: 4, clockMax: 17, extraSilver: 0.35, shards: 5, aiSkill: 0.7,  trialsNeed: 2, silverLimit: 3, popNeed: 6, pairs: 4, startGlim: 3 },
  expert: { start: [1, 1, 2, 1, 1, 2], tickEvery: 4, clockMax: 17, extraSilver: 0.45, shards: 6, aiSkill: 0.65, trialsNeed: 3, silverLimit: 3, popNeed: 7, pairs: 4, startGlim: 2 }
};
export const RESTORED = 4, HELP_COST = 2, RIPPLE_EVERY = 4, RETRY_COST = 3;
export const MINI_GAMES = ['pop', 'match', 'illusion'];

// ---------- RNG (mulberry32; state lives in G.rng so saves/network stay deterministic) ----------
function rand(G) { let t = (G.rng = (G.rng + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
export const rnd = rand;
function shuffle(G, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(G) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const range = n => Array.from({ length: n }, (_, i) => i);

export function newGame({ players, difficulty = 'medium', seed = (Date.now() & 0x7fffffff) }) {
  const D = DIFFS[difficulty] || DIFFS.medium;
  const G = {
    v: 1, seed, rng: seed | 0, difficulty: DIFFS[difficulty] ? difficulty : 'medium',
    players: players.map((p, i) => ({ heroId: p.heroId, human: !!p.human, owner: p.owner || null, pos: 0, glim: D.startGlim, slot: i })),
    cur: 0, turn: 0, light: D.start.slice(), restored: DISTRICTS.map(() => false), beacon: DISTRICTS.map(() => 0),
    heart: 0, rippleAcc: 0, shards: 0, clock: 0, tickAcc: 0, ambush: 0, gifted: false,
    kindDeck: [], factDeck: [], phase: 'turn', pending: null, over: null, showdown: null, stats: { helps: 0, gifts: 0, kind: 0, facts: 0, minis: 0, miniWins: 0 }
  };
  G.kindDeck = shuffle(G, range(KINDNESS.length)); G.factDeck = shuffle(G, range(FACTS.length));
  for (let d = 0; d < DISTRICTS.length; d++) if (G.light[d] >= RESTORED) G.restored[d] = true;
  G.pending = turnDecision(G);
  return G;
}
export const D = G => DIFFS[G.difficulty];
export const curPlayer = G => G.players[G.cur];
export const silveredCount = G => G.light.filter(l => l <= 0).length;
export const restoredCount = G => G.restored.filter(Boolean).length;

function dimmest(G, exclude = -1) {
  let best = -1, bl = 99;
  for (let d = 0; d < G.light.length; d++) { if (G.restored[d] || d === exclude) continue; if (G.light[d] < bl) { bl = G.light[d]; best = d; } }
  return best;
}
function districtIndex(id) { return DISTRICTS.findIndex(d => d.id === id); }

// ---------- effects ----------
function addLight(G, d, n, ev, why) {
  if (d < 0 || G.restored[d]) return 0;
  const from = G.light[d]; G.light[d] = Math.min(RESTORED, from + n);
  ev.push({ type: 'light', d, from, to: G.light[d], why });
  if (G.light[d] >= RESTORED) { G.restored[d] = true; ev.push({ type: 'restored', d }); ev.push({ type: 'say', who: 'Odessa', text: `${DISTRICTS[d].name} is fully restored! It shines on its own now.` }); }
  return G.light[d] - from;
}
function addHeart(G, n, ev) {
  if (n <= 0) return; G.heart += n; G.rippleAcc += n; ev.push({ type: 'heart', n, total: G.heart });
  while (G.rippleAcc >= RIPPLE_EVERY) {
    G.rippleAcc -= RIPPLE_EVERY; const d = dimmest(G);
    ev.push({ type: 'ripple', d });
    if (d >= 0) { ev.push({ type: 'say', who: 'Odessa', text: `Kindness ripples outward! ${DISTRICTS[d].name} brightens all by itself.` }); addLight(G, d, 1, ev, 'ripple'); }
  }
}
function addGlim(G, p, n, ev) { const before = G.players[p].glim; G.players[p].glim = Math.max(0, Math.min(12, before + n)); if (G.players[p].glim !== before) ev.push({ type: 'glim', p, n: G.players[p].glim - before, total: G.players[p].glim }); }
function addShard(G, ev) {
  if (G.shards < D(G).shards) { G.shards++; ev.push({ type: 'shard', total: G.shards }); }
  else { addHeart(G, 1, ev); ev.push({ type: 'say', who: 'Odessa', text: 'We already have every Shard we need. This one turns into Heart!' }); }
}
function moveClock(G, n, ev) {
  const from = G.clock; G.clock = Math.max(0, G.clock + n);
  if (G.clock !== from) ev.push({ type: 'clock', from, to: G.clock });
}
function applyFx(G, fx, ev) {
  const p = G.cur, me = G.players[p];
  if (fx.glim) addGlim(G, p, fx.glim, ev);
  if (fx.giveAll) for (const q of G.players) if (q !== me) { const n = Math.min(fx.giveAll, me.glim); if (n > 0) { addGlim(G, p, -n, ev); addGlim(G, q.slot, n, ev); } }
  if (fx.heart) addHeart(G, fx.heart, ev);
  if (fx.light) { const t = fx.light.target; const d = t === 'dimmest' ? dimmest(G) : t === 'sector' ? sectorOf(me.pos) : districtIndex(t); addLight(G, G.restored[d] ? dimmest(G) : d, fx.light.n, ev, 'card'); }
  if (fx.shard) addShard(G, ev);
  if (fx.clock) moveClock(G, fx.clock, ev);
}

// ---------- decisions ----------
function giftTarget(G) {
  const me = curPlayer(G); let best = null;
  for (const q of G.players) if (q !== me && (!best || q.glim < best.glim)) best = q;
  return best;
}
function turnDecision(G) {
  const me = curPlayer(G), opts = [{ id: 'roll', label: 'Roll the die' }];
  const t = giftTarget(G);
  if (!G.gifted && t && me.glim >= 2) opts.push({ id: 'gift', label: `Gift 2 ✦ to ${heroLabel(t.heroId)}`, to: t.slot });
  return { kind: 'turn', title: `${heroLabel(me.heroId)}'s turn`, text: me.human ? 'Pinch the die (or look at it) to roll.' : 'Teammate is thinking...', options: opts };
}
export let heroLabel = id => id; // presentation layer injects real names
export function setHeroLabel(fn) { heroLabel = fn; }

export function act(G, id, extra) { // turn-phase actions: 'roll' | 'gift'
  if (G.over || G.phase !== 'turn') return [];
  if (id === 'gift') {
    const ev = [], me = curPlayer(G), opt = G.pending.options.find(o => o.id === 'gift'); if (!opt || me.glim < 2) return ev;
    addGlim(G, G.cur, -2, ev); addGlim(G, opt.to, 2, ev); G.gifted = true; G.stats.gifts++;
    ev.push({ type: 'gift', from: G.cur, to: opt.to });
    addHeart(G, 1, ev);
    G.pending = turnDecision(G); return ev;
  }
  return roll(G, extra);
}

export function roll(G, forced) {
  const ev = [], me = curPlayer(G);
  const die = forced || 1 + Math.floor(rand(G) * 6);
  ev.push({ type: 'die', value: die });
  const path = [];
  for (let s = 0; s < die; s++) {
    me.pos = (me.pos + 1) % TRACK.length; path.push(me.pos);
    if (me.pos === 0 && s < die - 1) { ev.push({ type: 'move', p: G.cur, path: path.splice(0) }); addGlim(G, G.cur, 2, ev); ev.push({ type: 'say', who: 'Odessa', text: 'Passing the Welcome Gate. Deep breath. +2 Glimmers.' }); }
  }
  if (path.length) ev.push({ type: 'move', p: G.cur, path });
  G.phase = 'resolve'; G.pending = null;
  return ev.concat(resolve(G));
}

function resolve(G) {
  const ev = [], me = curPlayer(G), type = TRACK[me.pos], sec = sectorOf(me.pos), name = heroLabel(me.heroId);
  if (type === 'S') {
    const to = PORTALS[me.pos]; me.pos = to; ev.push({ type: 'portal', p: G.cur, to });
    ev.push({ type: 'say', who: 'Odessa', text: 'A Seam Portal! Shortcut across Aurelia. You found a Glimmer in the seam.' });
    addGlim(G, G.cur, 1, ev); G.phase = 'done'; return ev;
  }
  if (type === 'G') { addGlim(G, G.cur, 2, ev); ev.push({ type: 'say', who: 'Odessa', text: 'Home at the Welcome Gate. Rest up: +2 Glimmers.' }); G.phase = 'done'; return ev; }
  if (type === 'X') { ev.push({ type: 'say', who: 'Odessa', text: 'A Shard of the Ever-Glass! We need these to seal it.' }); addShard(G, ev); G.phase = 'done'; return ev; }
  if (type === 'H') {
    const opts = [], dim = dimmest(G);
    const tgt = !G.restored[sec] ? sec : dim;
    if (tgt >= 0 && me.glim >= HELP_COST) opts.push({ id: 'help', d: tgt, n: 1, label: `Help ${DISTRICTS[tgt].name} (-2 ✦, +1 light)` });
    if (dim >= 0 && dim !== tgt && me.glim >= HELP_COST) opts.push({ id: 'help', d: dim, n: 1, label: `Help ${DISTRICTS[dim].name} (-2 ✦, +1 light)` });
    if (tgt >= 0 && me.glim >= HELP_COST * 2 && G.light[tgt] <= RESTORED - 2) opts.push({ id: 'help', d: tgt, n: 2, label: `Big help: ${DISTRICTS[tgt].name} (-4 ✦, +2)` });
    opts.push({ id: 'cheer', label: 'Cheer the neighbors on (+1 Heart)' });
    opts.forEach((o, i) => { if (o.id === 'help') o.id = 'help' + i; });
    G.phase = 'decide';
    G.pending = { kind: 'help', title: 'Help Space', text: dim < 0 ? 'Every district shines! Cheer everyone on.' : `Give your Glimmers to brighten a district. Nobody owns it. Everybody gets to live there.`, options: opts.slice(0, 4) };
    return ev;
  }
  if (type === 'K') {
    if (!G.kindDeck.length) G.kindDeck = shuffle(G, range(KINDNESS.length));
    const ci = G.kindDeck.shift(), c = KINDNESS[ci];
    G.phase = 'decide'; G.pending = { kind: 'kind', card: ci, title: c.title, text: c.text, options: c.options.map((o, i) => ({ id: 'k' + i, i, label: o.label })) };
    return ev;
  }
  if (type === 'F') {
    if (!G.factDeck.length) G.factDeck = shuffle(G, range(FACTS.length));
    const fi = G.factDeck.shift(), f = FACTS[fi];
    G.phase = 'decide'; G.pending = { kind: 'fact', card: fi, title: 'Fact Card', text: f.q, options: f.a.map((a, i) => ({ id: 'f' + i, i, label: a })) };
    return ev;
  }
  if (type === 'A') {
    const game = MINI_GAMES[G.ambush % MINI_GAMES.length]; G.ambush++;
    G.phase = 'mini'; G.pending = { kind: 'mini', game, d: sec, title: 'Echo Ambush!', text: `Echoes are swarming ${DISTRICTS[sec].name}! 10 seconds. Go!` };
    ev.push({ type: 'say', who: 'Odessa', text: `Echo Ambush in ${DISTRICTS[sec].name}!` });
    return ev;
  }
  if (type === 'P') {
    const pw = BOARD_POWERS[me.heroId] || BOARD_POWERS.ribbon;
    G.phase = 'decide'; G.pending = { kind: 'power', title: `${name}: ${pw.name}`, text: pw.text, options: [{ id: 'power', label: `Use ${pw.name}!` }] };
    return ev;
  }
  G.phase = 'done'; return ev;
}

export function choose(G, optId) {
  if (G.phase !== 'decide' || !G.pending) return [];
  const P = G.pending, ev = [], me = curPlayer(G), o = P.options.find(x => x.id === optId) || P.options[0];
  ev.push({ type: 'chose', kind: P.kind, id: o.id, label: o.label });
  if (P.kind === 'help') {
    if (o.id.startsWith('help')) { addGlim(G, G.cur, -HELP_COST * o.n, ev); addLight(G, o.d, o.n, ev, 'help'); G.stats.helps++; ev.push({ type: 'say', who: 'Odessa', text: `${heroLabel(me.heroId)} lit up ${DISTRICTS[o.d].name}!` }); }
    else addHeart(G, 1, ev);
  } else if (P.kind === 'kind') {
    const c = KINDNESS[P.card].options[o.i]; applyFx(G, c.fx, ev); G.stats.kind++;
    ev.push({ type: 'outcome', text: c.out });
  } else if (P.kind === 'fact') {
    const f = FACTS[P.card], ok = o.i === f.c; G.stats.facts++;
    ev.push({ type: 'outcome', ok, text: (ok ? 'Correct! ' : 'Not quite. ') + f.why });
    if (ok) { addGlim(G, G.cur, 2, ev); addHeart(G, 1, ev); } else addGlim(G, G.cur, 1, ev);
  } else if (P.kind === 'power') usePower(G, me, ev);
  else if (P.kind === 'reflect') return reflect(G, o, ev);
  G.pending = null; G.phase = 'done';
  return ev;
}

function usePower(G, me, ev) {
  const id = me.heroId, sec = sectorOf(me.pos);
  ev.push({ type: 'power', hero: id });
  if (id === 'ribbon') { for (const q of G.players) if (q !== me) addGlim(G, q.slot, 2, ev); addHeart(G, 1, ev); }
  else if (id === 'chrona') { moveClock(G, -1, ev); G.tickAcc = 0; }
  else if (id === 'prism') { const a = dimmest(G); addLight(G, a, 1, ev, 'power'); const b = dimmest(G, a); addLight(G, b, 1, ev, 'power'); }
  else if (id === 'verdant') addLight(G, dimmest(G), 2, ev, 'power');
  else if (id === 'fold') { addLight(G, G.restored[sec] ? dimmest(G) : sec, 1, ev, 'power'); addGlim(G, G.cur, 1, ev); }
  else if (id === 'tinker') { const d = dimmest(G); if (d >= 0) { G.beacon[d] += 2; ev.push({ type: 'beacon', d, n: G.beacon[d] }); } addGlim(G, G.cur, 1, ev); }
  else if (id === 'starling') {
    for (const q of G.players) { if (q === me) continue; const fwd = (me.pos - q.pos + 32) % 32, back = (q.pos - me.pos + 32) % 32; if (Math.min(fwd, back) <= 4 && q.pos !== me.pos) { q.pos = me.pos; ev.push({ type: 'pull', p: q.slot, to: me.pos }); addHeart(G, 1, ev); } }
    addShard(G, ev);
  }
}

export function miniResult(G, success) {
  if (G.phase === 'trial') return trialResult(G, success);
  if (G.phase !== 'mini') return [];
  const P = G.pending, ev = []; G.stats.minis++;
  if (success) { G.stats.miniWins++; ev.push({ type: 'outcome', ok: true, text: 'Echoes sealed! The Shard they were hiding is ours.' }); addShard(G, ev); addGlim(G, G.cur, 1, ev); }
  else { ev.push({ type: 'outcome', ok: false, text: 'The Echoes slipped away... ' + (G.restored[P.d] ? 'but the district holds strong.' : `${DISTRICTS[P.d].name} dims a little.`) }); if (!G.restored[P.d]) dimDistrict(G, P.d, ev); }
  G.pending = null; G.phase = 'done'; return ev;
}

function dimDistrict(G, d, ev) {
  if (G.beacon[d] > 0) { G.beacon[d]--; ev.push({ type: 'blocked', d, n: G.beacon[d] }); ev.push({ type: 'say', who: 'Odessa', text: `The Beacon on ${DISTRICTS[d].name} held off the glass!` }); return; }
  if (G.light[d] <= 0) return;
  const from = G.light[d]; G.light[d]--; ev.push({ type: 'light', d, from, to: G.light[d], why: 'villain' });
  if (G.light[d] === 0) { ev.push({ type: 'silvered', d }); ev.push({ type: 'say', who: 'Narrowmere', text: `${DISTRICTS[d].name} is MINE. So shiny. So quiet.` }); moveClock(G, 1, ev); }
}

// ---------- end of turn: villain clock, win / loss, next player ----------
export function endTurn(G) {
  if (G.over) return [];
  const ev = [], Dd = D(G);
  if (G.phase !== 'done' && G.phase !== 'turn') return ev;
  G.turn++; G.tickAcc++;
  if (G.tickAcc >= Dd.tickEvery) {
    G.tickAcc = 0; moveClock(G, 1, ev);
    ev.push({ type: 'villain' });
    ev.push({ type: 'say', who: 'Narrowmere', text: NARROWMERE_LINES[Math.floor(rand(G) * NARROWMERE_LINES.length)] });
    const open = range(DISTRICTS.length).filter(d => !G.restored[d] && G.light[d] > 0);
    if (open.length) { const d = open[Math.floor(rand(G) * open.length)]; dimDistrict(G, d, ev); }
    if (rand(G) < Dd.extraSilver) { const o2 = range(DISTRICTS.length).filter(d => !G.restored[d] && G.light[d] > 0); if (o2.length) dimDistrict(G, o2[Math.floor(rand(G) * o2.length)], ev); }
  }
  if (G.clock >= Dd.clockMax || silveredCount(G) >= Dd.silverLimit) { G.over = { won: false }; G.phase = 'over'; ev.push({ type: 'over', won: false }); return ev; }
  if (restoredCount(G) === DISTRICTS.length && G.shards >= Dd.shards) { startShowdown(G, ev); return ev; }
  G.cur = (G.cur + 1) % G.players.length; G.gifted = false; G.phase = 'turn'; G.pending = turnDecision(G);
  ev.push({ type: 'next', p: G.cur });
  return ev;
}

// ---------- final showdown: three trials at the Ever-Glass, Heart buys retries, Glimmers buy nothing ----------
function startShowdown(G, ev) {
  G.phase = 'trial'; G.showdown = { trial: 0, wins: 0, fails: 0, player: G.cur };
  ev.push({ type: 'showdown' });
  ev.push({ type: 'say', who: 'Odessa', text: 'Every district shines! The Ever-Glass rises. Three trials. Glimmers can\'t help here: only Heart can.' });
  G.pending = trialPending(G);
}
function trialPending(G) {
  const S = G.showdown, game = MINI_GAMES[S.trial % 3];
  return { kind: 'trial', game, d: -1, title: `Ever-Glass Trial ${S.trial + 1} of 3`, text: `${heroLabel(G.players[S.player].heroId)} steps up. Win ${D(G).trialsNeed} of 3 trials.` };
}
function trialResult(G, ok) {
  const ev = [], S = G.showdown, need = D(G).trialsNeed;
  if (ok) { S.wins++; ev.push({ type: 'outcome', ok: true, text: 'The glass cracks! A reflection is set free.' }); }
  else if (G.heart >= RETRY_COST) { G.heart -= RETRY_COST; ev.push({ type: 'heart', n: -RETRY_COST, total: G.heart }); ev.push({ type: 'outcome', ok: false, text: 'The team lifts you up! Spend 3 Heart: try that trial again.' }); ev.push({ type: 'retry' }); G.pending = trialPending(G); return ev; }
  else { S.fails++; ev.push({ type: 'outcome', ok: false, text: 'The glass holds... for now.' }); }
  S.trial++; S.player = (S.player + 1) % G.players.length;
  if (S.wins >= need) {
    G.phase = 'decide';
    G.pending = { kind: 'reflect', title: 'The Last Reflection', text: 'The Ever-Glass shows your team\'s reflection one last time. What do you see?',
      options: [{ id: 'alone', label: 'I did this all by myself' }, { id: 'together', label: 'We did this together' }] };
    return ev;
  }
  if (S.trial - S.wins > 3 - need) { // cannot reach the target any more: gentle setback, back to the board
    moveClock(G, 2, ev);
    const rs = range(DISTRICTS.length).filter(d => G.restored[d]); const d = rs[Math.floor(rand(G) * rs.length)];
    G.restored[d] = false; const from = G.light[d]; G.light[d] = RESTORED - 1; ev.push({ type: 'light', d, from, to: G.light[d], why: 'villain' });
    G.shards = Math.max(0, G.shards - 1); ev.push({ type: 'shard', total: G.shards });
    ev.push({ type: 'say', who: 'Narrowmere', text: 'Ha! Back you go. The glass grows stronger.' });
    ev.push({ type: 'showdownFail' });
    G.showdown = null; G.phase = 'done';
    if (G.clock >= D(G).clockMax) { G.over = { won: false }; G.phase = 'over'; ev.push({ type: 'over', won: false }); }
    return ev;
  }
  G.pending = trialPending(G); return ev;
}
function reflect(G, o, ev) {
  if (o.id === 'alone') { ev.push({ type: 'say', who: 'Odessa', text: 'That\'s the glass talking. Look again: who helped you get here?' }); ev.push({ type: 'retryReflect' }); return ev; }
  G.over = { won: true }; G.phase = 'over'; G.pending = null;
  ev.push({ type: 'over', won: true });
  return ev;
}

// ---------- AI teammates ----------
export function aiAct(G) { // returns the option id for the current pending decision
  const P = G.pending, me = curPlayer(G);
  if (!P) return null;
  if (P.kind === 'turn') { const g = P.options.find(o => o.id === 'gift'); const t = g && G.players[g.to]; return g && me.glim >= 5 && t.glim <= 1 ? 'gift' : 'roll'; }
  if (P.kind === 'help') {
    const helps = P.options.filter(o => o.id.startsWith('help')); if (!helps.length) return 'cheer';
    const big = helps.find(o => o.n === 2); if (big && G.light[big.d] <= 1) return big.id;
    helps.sort((a, b) => G.light[a.d] - G.light[b.d]); // dimmest first
    return helps[0].id;
  }
  if (P.kind === 'kind') {
    const c = KINDNESS[P.card]; let best = 0, bs = -1e9;
    c.options.forEach((o, i) => { const s = scoreFx(G, o.fx); if (s > bs) { bs = s; best = i; } });
    return 'k' + best;
  }
  if (P.kind === 'fact') { const f = FACTS[P.card]; const ok = rand(G) < D(G).aiSkill; return 'f' + (ok ? f.c : (f.c + 1) % f.a.length); }
  if (P.kind === 'power') return 'power';
  if (P.kind === 'reflect') return 'together';
  return P.options && P.options[0] && P.options[0].id;
}
function scoreFx(G, fx) {
  const me = curPlayer(G), urgency = G.clock / D(G).clockMax;
  let s = 0;
  if (fx.heart) s += fx.heart * 1.3;
  if (fx.glim) s += fx.glim * (me.glim < 2 ? 0.8 : 0.45);
  if (fx.glim < 0 && me.glim + fx.glim < 0) s -= 2;
  if (fx.light) s += fx.light.n * 2.2;
  if (fx.giveAll) s += fx.giveAll * (G.players.length - 1) * 0.5;
  if (fx.clock) s -= fx.clock * (2.5 + urgency * 3);
  return s;
}
export function aiMiniSuccess(G) { return rand(G) < D(G).aiSkill; }

// Serialization helpers (state is plain JSON already).
export const snapshot = G => JSON.stringify(G);
export const restore = s => JSON.parse(s);
