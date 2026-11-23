// CouchCape v0.3 — seated, controller-free hero adventure for Meta Quest 3.
// Aurelia (hub city + Ever-Glass) · Seam worlds (levels with zones, secrets, mini-bosses) · Skyboard (co-op board game)
import * as THREE from 'three';
import { bus, settings, saveSettings } from './core.js';
import { Heart } from './health.js';
import { Hands } from './hands.js';
import { Flight } from './flight.js';
import { Gaze } from './gaze.js';
import { HUD } from './hud.js';
import { Net } from './net.js';
import { initAudio, SFX, getCtx } from './audio.js';
import { Music } from './music.js';
import { Powers, POWERS } from './powers.js';
import { Raids, loadFoeArt, getFoeArt } from './enemies.js';
import { Boss, loadBossArt } from './boss.js';
import { Wayfinder } from './travel.js';
import { Lineup, loadHeroes, buildHero, heroName, HERO_ORDER } from './select.js';
import { DISTRICTS, LINES, say, setVoice, Glimmerlings, ChoicePanel } from './story.js';
import { Menus } from './menu.js';
import { loadLevels, WorldRun, MiniBoss, LEVEL_IDS, loadMiniBossArt } from './worlds.js';

// ---------- renderer (Quest-tuned) ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
renderer.xr.setFramebufferScaleFactor(1.0);
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 2400);
const rig = new THREE.Group(); scene.add(rig);
const seat = new THREE.Group(); rig.add(seat); seat.add(camera); // seat = adjustable eye height (Settings → Seat height)
seat.position.y = settings.heightOffset || 0;
// default lighting (replaced by the graphics engine's presets when available)
const hemi = new THREE.HemisphereLight(0xfff3fb, 0x8f7fb0, 0.85); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe8cc, 1.45); sun.position.set(-150, 95, -300); scene.add(sun);

// ---------- systems ----------
const heart = new Heart();
const hands = new Hands(renderer, seat);
const flight = new Flight(rig, camera);
const gaze = new Gaze(camera, scene);
const hud = new HUD(camera, seat);
const net = new Net(scene);
const powers = new Powers(scene);
const raids = new Raids(scene, heart);
const boss = new Boss(scene, heart, raids);
const way = new Wayfinder(scene, camera, rig);
const glims = new Glimmerlings(scene);
const choice = new ChoicePanel(scene, camera);
const menus = new Menus(scene, camera, rig, net);
let miniBoss = null;
const musicLast = { t: null, i: -1 };
const music = new Music(getCtx); music.setVolume(settings.musicVol ?? 0.7);
function musicTheme() { if (state === 'board') return 'board'; if (boss.active || (miniBoss && miniBoss.active)) return 'boss'; return activeWorld === 'aurelia' ? 'aurelia' : activeWorld; }

let city = null, lineup = null, state = 'boot', heroId = null, desk = false, paused = false;
let gfx = null, BoardMod = null, board = null;
let LEVELS = {}, levelBuilt = {}, run = null, activeWorld = 'aurelia', page = 'aurelia';
const cleared = new Set(); let beacon = new THREE.Vector3();
const DEST = {};
const kind = []; // kind acts this session — shown in the family recap at the end

// ---------- progress (local only) ----------
const PKEY = 'couchcape.progress.v1';
const progress = (() => { try { return Object.assign({ districts: [], worlds: [], pieces: [], bossWon: false }, JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch (e) { return { districts: [], worlds: [], pieces: [], bossWon: false }; } })();
function saveProgress() { progress.districts = [...cleared]; try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch (e) {} }
bus.on('saveProgress', saveProgress);
progress.districts.forEach(d => cleared.add(d));

async function boot() {
  const [, , , cityMod, levels, , gfxMod, boardMod] = await Promise.all([
    loadHeroes(), loadFoeArt(), loadBossArt(),
    import('./art/city.js').catch(e => { console.warn('city art missing', e); return null; }),
    loadLevels(), loadMiniBossArt(),
    import('./gfx/index.js').catch(() => null),
    import('./board/index.js').catch(() => null)
  ]);
  LEVELS = levels; BoardMod = boardMod;
  miniBoss = new MiniBoss(scene, heart, raids, getFoeArt() && getFoeArt().buildEcho);
  if (gfxMod && gfxMod.initGfx) { try { gfx = gfxMod; await gfx.initGfx({ scene, renderer, camera, hemi, sun }); } catch (e) { console.warn('gfx init failed', e); gfx = null; } }
  if (cityMod && cityMod.buildCity) city = cityMod.buildCity(scene);
  else { const { buildWorld } = await import('./world.js'); buildWorld(scene); city = fallbackCity(); }
  if (gfx && gfx.upgradeCity && city.root) { try { gfx.upgradeCity(city.root); } catch (e) { console.warn('upgradeCity failed', e); } }
  // Aurelia destinations
  const spawn = city.spawn.clone();
  DEST.plaza = { id: 'plaza', name: 'Hero Plaza', sub: 'Change hero', color: '#ffd84d', pos: spawn.clone(), look: new THREE.Vector3(spawn.x, spawn.y, spawn.z - 20), world: 'aurelia' };
  for (const d of city.districts) {
    const meta = DISTRICTS[d.id] || { name: d.name, sub: '', color: '#7cf4ff' };
    const out = new THREE.Vector3(d.pos.x - spawn.x, 0, d.pos.z - spawn.z).normalize();
    const raid = d.pos.clone().addScaledVector(out, 26); raid.y = d.pos.y - 2;
    DEST[d.id] = { id: d.id, name: meta.name, sub: meta.sub, color: meta.color, pos: d.pos.clone(), look: raid.clone(), raid, world: 'aurelia' };
  }
  const ba = city.bossArena;
  DEST.boss = { id: 'boss', name: 'Silvered Ring', sub: 'Final battle', color: '#b58cff', pos: new THREE.Vector3(ba.center.x, ba.center.y + 6, ba.center.z + ba.radius * 0.7), look: ba.center.clone(), locked: true, world: 'aurelia' };
  // Seam worlds (built lazily on first visit, placed far apart)
  LEVEL_IDS.forEach((id, i) => {
    const L = LEVELS[id]; if (!L) return;
    DEST['world:' + id] = { id: 'world:' + id, name: L.name, sub: L.sub || 'Seam world', color: L.color || '#7cf4ff', world: id, offset: new THREE.Vector3(3000 * (i + 1), 0, 0), pos: null, look: null };
  });
  refreshDestinations();
  lineup = new Lineup(scene, new THREE.Vector3(spawn.x, spawn.y - 1.2, spawn.z - 6.5), spawn);
  if (gfx && gfx.addContactShadow) lineup.items.forEach(it => { try { gfx.addContactShadow(it.hero.group, 0.55); if (gfx.rimify) gfx.rimify(it.hero.group); } catch (e) {} });
  rig.position.copy(spawn); beacon.copy(spawn);
  if (qTier) applyQuality();
  setActiveWorld('aurelia');
  state = 'title';
  document.getElementById('enterXR').dataset.ready = '1'; checkXR();
}
function fallbackCity() {
  return {
    update() {}, spawn: new THREE.Vector3(0, 34, 40), bossArena: { center: new THREE.Vector3(0, 70, -320), radius: 60 }, root: null,
    districts: [
      { id: 'bloom', name: 'Bloom Gardens', pos: new THREE.Vector3(120, 30, -60) }, { id: 'clockwork', name: 'Clockwork Spires', pos: new THREE.Vector3(-140, 45, -50) },
      { id: 'prism', name: 'Prism Falls', pos: new THREE.Vector3(60, 35, -190) }, { id: 'skyharbor', name: 'Skyharbor', pos: new THREE.Vector3(-60, 65, -170) }]
  };
}

// ---------- worlds ----------
function ensureLevel(id) {
  if (levelBuilt[id]) return levelBuilt[id];
  const L = LEVELS[id], d = DEST['world:' + id];
  const built = L.build(scene, d.offset.clone());
  if (gfx && gfx.applyMaterials && built.root) { try { gfx.applyMaterials(built.root); } catch (e) { console.warn('applyMaterials failed', id, e); } }
  if (qTier && built.root) thin(built.root);
  d.pos = built.arrival.pos.clone(); d.look = built.arrival.look.clone();
  levelBuilt[id] = built; return built;
}
function setActiveWorld(id) {
  activeWorld = id;
  if (city && city.root) city.root.visible = id === 'aurelia';
  for (const k in levelBuilt) if (levelBuilt[k].root) levelBuilt[k].root.visible = k === id;
  if (gfx && gfx.setPreset) {
    const sky = id === 'aurelia' ? 'aurelia-day' : (LEVELS[id] && LEVELS[id].sky) || 'dusk';
    const map = { 'real-stars': 'space', 'neon-night': 'neon', 'dusk': id === 'paradox' ? 'paradox' : (id === 'mudlark' ? 'clay-studio' : 'dusk'), 'day': 'aurelia-day', 'aurelia-day': 'aurelia-day' };
    try { gfx.setPreset(map[sky] || sky, { world: id }); } catch (e) {}
  }
}
function refreshDestinations() {
  DEST.boss.locked = cleared.size < 3;
  let list;
  if (page === 'aurelia') {
    list = ['plaza', 'bloom', 'clockwork', 'prism', 'skyharbor', 'boss'].filter(k => DEST[k]).map(k => { const d = DEST[k]; return { ...d, sub: k !== 'boss' && k !== 'plaza' && cleared.has(k) ? 'Cleared ✓' : d.sub }; });
  } else {
    list = LEVEL_IDS.map(id => DEST['world:' + id]).filter(Boolean).map(d => ({ ...d, sub: progress.worlds.includes(d.world) ? 'Restored ✓' : d.sub }));
    if (!list.length) list = [{ id: 'none', name: 'Coming soon', sub: 'Seams sealed', color: '#cccccc', locked: true }];
  }
  way.setDestinations(list);
  const acts = [
    { action: 'page', label: page === 'aurelia' ? 'Other Worlds' : 'Aurelia', color: '#9b7bff' },
    { action: 'board', label: 'Board Game', color: '#ffd84d' },
    { action: 'settings', label: 'Settings', color: '#7cf4ff' },
    { action: 'players', label: 'Players', color: '#ff7fb8' },
    { action: 'pause', label: 'Pause', color: '#8cff6a' }
  ];
  way.setActions(acts);
}
function hop(dest) {
  if (dest.world && dest.world !== 'aurelia' && !dest.keepWorld) { ensureLevel(dest.world); dest = DEST['world:' + dest.world]; }
  way.go(dest);
}

// ---------- activation: pinch / click / dwell all route here ----------
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _lf = new THREE.Vector3();
function headPos() { camera.getWorldPosition(_hp); return _hp.clone(); }
function activate(fromHand) {
  initAudio();
  const h = gaze.hit;
  if (h && h.userData.menuAct) { menus.activate(h); return; }
  if (h && h.userData.action) { doAction(h.userData.action); return; }
  if (h && h.userData.wayButton) { if (!h.userData.dest.locked) hop(h.userData.dest); else bus.emit('toast', 'Clear 3 districts to unlock'); return; }
  if (h && h.userData.choice !== undefined) { const cb = choice.cb; choice.hide(); if (cb) { cb(h.userData.choice); return; } boss.reflectionChosen(h.userData.choice === 'humble'); if (h.userData.choice === 'humble') kind.push('Told the truth to your own reflection'); else say('That\'s the glass talking. Look again — honestly.'); return; }
  if (h && h.userData.heroId && state === 'select') { pickHero(h.userData.heroId); return; }
  if (h && h.userData.glimmer) { if (glims.rescue(h)) heart.addShard(); return; }
  if (h && h.userData.beacon && run) { run.useBeacon(); return; }
  if (h && h.userData.plaque) { say(`${h.userData.plaqueTitle ? h.userData.plaqueTitle + ': ' : ''}${h.userData.plaque}`, 'How your brain got tricked', 9); h.userData.dwellTime = 99; setTimeout(() => { h.userData.dwellTime = 1.6; }, 12000); return; }
  if (h && h.userData.piece && run) { const m = run.pieces.find(p => p === h); if (m) run.collectPiece(m); return; }
  if (state === 'board' && board) { if (board.activate(h)) return; return; }
  if (state !== 'play') return;
  if (fromHand !== undefined && hands.hands[fromHand].joints['index-finger-tip']) hands.hands[fromHand].joints['index-finger-tip'].getWorldPosition(_o);
  else { camera.getWorldPosition(_o); _o.y -= 0.15; }
  gaze.dir(_d); powers.cast(_o, _d);
}
function doAction(a) {
  SFX.select();
  if (a === 'page') { page = page === 'aurelia' ? 'seams' : 'aurelia'; refreshDestinations(); way.show(); return; }
  way.hide();
  if (a === 'settings') menus.open('settings');
  else if (a === 'players') menus.open('players');
  else if (a === 'pause') menus.open('pause');
  else if (a === 'board') startBoard();
}
bus.on('pinch', ({ i }) => { if (!way.open || gaze.hit) activate(i); });
bus.on('select', () => activate());
bus.on('palmLook', () => { if (state === 'play' || state === 'board' || state === 'won') way.toggle(); });

function pickHero(id) {
  heroId = id; powers.setHero(id); lineup.choose(id); SFX.container();
  const glove = POWERS[id].color;
  hands.mesh.material.color.setHex(glove); hands.mesh.material.emissive.setHex(glove);
  say(LINES.picked(heroName(id)));
  state = 'play'; net.out.h = id;
  setTimeout(() => say(LINES.wayfinder), 6500);
  if (Object.keys(LEVELS).length) setTimeout(() => say(LINES.seams), 16000);
  refreshDestinations();
}

// ---------- board game ----------
function startBoard() {
  if (!BoardMod || !BoardMod.BoardGame) { bus.emit('toast', 'Board game unavailable in this build'); return; }
  if (!heroId) { bus.emit('toast', 'Pick a hero first'); return; }
  raids.clear(); boss.stop(); miniBoss.stop();
  if (!board) board = new BoardMod.BoardGame({ scene, camera, rig, seat, gaze, hands, bus, settings, buildHero, heroIds: HERO_ORDER, say });
  state = 'board'; flight.speed = 0;
  if (lineup && lineup.group) lineup.group.visible = false;
  board.setup({ heroId });
}
bus.on('boardLeave', () => stopBoard());
bus.on('boardEnd', ({ won }) => { if (won) heart.addShard(); say(won ? 'What a team! Aurelia shines because you all gave.' : 'The glass won this round. Want a rematch? Open your palm and pick Board Game.'); });
function stopBoard() { if (board) board.stop(); state = 'play'; }

// ---------- story / mission events ----------
bus.on('arrived', d => {
  beacon.copy(d.pos);
  if (d.keepWorld && run) { run.arrivedAtZone(); return; }
  if (state === 'board') stopBoard();
  if (d.world && d.world !== 'aurelia') {
    setActiveWorld(d.world); raids.clear(); boss.stop(); miniBoss.stop();
    if (run) run.dispose();
    const built = ensureLevel(d.world);
    run = new WorldRun(scene, { id: d.world, name: LEVELS[d.world].name, color: LEVELS[d.world].color }, built, { raids, glims, heart, say, miniBoss, progress, headPos, hop });
    say(`Welcome to ${LEVELS[d.world].name}.`);
    setTimeout(() => { if (run && activeWorld === d.world) run.startZone(); }, 2500);
    if (state === 'select') state = 'play';
    return;
  }
  if (activeWorld !== 'aurelia') { setActiveWorld('aurelia'); if (run) { run.dispose(); run = null; } miniBoss.stop(); }
  if (d.id === 'plaza') { state = 'select'; raids.clear(); boss.stop(); say('Want to try a different hero? Look at one and pinch.'); return; }
  if (state === 'select') state = 'play';
  if (d.id === 'boss') { raids.clear(); boss.start(city.bossArena.center); say('There it is. The Ever-Glass. Every reflection it stole made it bigger.'); return; }
  boss.stop();
  const meta = DISTRICTS[d.id];
  if (meta && !cleared.has(d.id)) {
    raids.spawn(d.id, DEST[d.id].raid, meta.foes);
    if (!glims.list.some(g => g.userData.id === d.id)) glims.spawn(d.id, d.pos.clone().lerp(DEST[d.id].raid, 0.35).add(new THREE.Vector3(5, -1.5, 0)), meta.color);
    say(cleared.size === 0 ? LINES.firstRaid : `${meta.name} is under attack! Seal every Echo.`);
  } else if (meta) say(`${meta.name} is safe. Nice work.`);
});
bus.on('raidClear', id => {
  if (id === 'boss') return;
  if (run && run.onRaidClear(id)) return;
  if (!DISTRICTS[id]) return;
  cleared.add(id); heart.addShard(); SFX.container(); saveProgress();
  const meta = DISTRICTS[id]; say(`${meta.name} is free! ${meta.fact}`, 'Odessa', 9);
  // LIFE OVER MONEY: a gleaming treasure vs. a stranger who needs help — the world remembers
  setTimeout(() => {
    if (state !== 'play' || choice.group.visible) return;
    say('Look — a chest of glimmering treasure… and someone over there who lost their way home. You only have time for one.', 'Odessa', 7);
    choice.show([{ label: 'Grab the treasure (+50 ✦)', value: 'money', color: '#ffd84d' }, { label: 'Help them get home', value: 'heart', color: '#ff4f8b' }], v => {
      if (v === 'money') { heart.addSparks(50); progress.money = (progress.money || 0) + 1; say('Shiny! …They\'ll find their own way, probably.', 'Odessa', 4); }
      else { heart.addShard(); heart.heal(1); kind.push(`Helped a stranger home in ${meta.name}`); progress.heart = (progress.heart || 0) + 1; say('They\'re home safe. You can\'t buy that feeling — and look: a Heart Shard.', 'Odessa', 6); }
      saveProgress();
    });
  }, 9800);
  refreshDestinations();
  if (cleared.size === 3) setTimeout(() => { if (!boss.active && state === 'play') say(LINES.bossUnlocked); }, 9500);
});
bus.on('miniBossWon', name => { say(`${name} is sealed!`); if (run) { setTimeout(() => run && run.finish(), 2500); } });
bus.on('worldCleared', id => { if (!progress.worlds.includes(id)) progress.worlds.push(id); heart.addShard(); saveProgress(); refreshDestinations(); setTimeout(() => say(LINES.worldDone(LEVELS[id].name)), 7500); });
bus.on('taunt', t => say(LINES.taunt(t), 'Echo', 3));
bus.on('rescued', id => kind.push('Rescued a lost Glimmerling'));
bus.on('wave', () => { if (glims.waveBack(headPos()) > 0) { SFX.spark(); bus.emit('toast', 'They waved back! 👋'); } });
bus.on('capeSpread', () => { if (state !== 'play') return; flight.cruise = !flight.cruise; SFX.container(); bus.emit('toast', flight.cruise ? 'Cape spread — gliding! (spread again to land)' : 'Cape folded'); });
bus.on('bossReflection', () => {
  say(LINES.reflection);
  choice.show([{ label: 'I\'m better than everyone', value: 'ego', color: '#c9a7ff' }, { label: 'I\'m still learning — and that\'s okay', value: 'humble', color: '#ff4f8b' }]);
});
bus.on('bossWon', () => { progress.bossWon = true; saveProgress(); say(LINES.win, 'Odessa', 9);
  setTimeout(() => say(kind.length ? `Your kind acts today: ${kind.slice(-5).join(' · ')}. That\'s the real power.` : 'Next time, look for someone to help along the way. That\'s the real power.', 'Odessa', 10), 9500); state = 'won'; bus.emit('toast', 'AURELIA IS FREE!'); setTimeout(() => { state = 'play'; }, 12000); });
bus.on('knockout', left => { SFX.ko(); bus.emit('toast', left >= 0 ? 'Wobbled! Back to the Beacon…' : 'Starting fresh!'); });
bus.on('respawn', () => { rig.position.copy(beacon); flight.speed = 0; raids.hideOrbs(); });
bus.on('newContainer', () => { SFX.container(); bus.emit('toast', 'New heart container!'); });
bus.on('extraComeback', () => bus.emit('toast', 'Second Wind earned!'));
bus.on('sealed', () => bus.emit('toast', 'Sealed! +10 ✦'));
// settings / menu events
bus.on('setVoice', on => setVoice(on));
bus.on('say', ({ who, secs }) => { if (who === 'Odessa' || who === 'Glimmerling' || who === 'How your brain got tricked') music.duck(0.55, Math.min(secs, 8)); });
bus.on('musicVol', v => music.setVolume(v));
bus.on('heightOffset', v => { seat.position.y = v; });
bus.on('perfMode', on => { if (on && qTier === 0) { qTier = 1; applyQuality(); } });
bus.on('recenter', () => { _e.setFromQuaternion(camera.quaternion, 'YXZ'); flight.yawBias = _e.y; bus.emit('toast', 'View recentered'); });
bus.on('exitGame', () => { menus.close(); const s = renderer.xr.getSession(); if (s) s.end(); else { $('intro').hidden = false; state = 'title'; } });
const _e = new THREE.Euler();

// ---------- desktop testing controls ----------
const keys = {}; let yaw = 0, pitch = 0;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!desk) return;
  if (e.code === 'KeyT') way.toggle();
  if (e.code === 'Space') activate();
  if (e.code === 'KeyR') { if (state === 'board') { if (board && board.rollKey) board.rollKey(); } else bus.emit('recenter'); }
  if (e.code === 'KeyC') flight.cruise = !flight.cruise;
  if (e.code === 'KeyB') startBoard();
  if (e.code === 'Escape') menus.open('pause');
  if (/^Digit[1-7]$/.test(e.code) && state === 'select') pickHero(HERO_ORDER[+e.code.slice(5) - 1]);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousemove', e => { if (document.pointerLockElement !== renderer.domElement) return; yaw -= e.movementX * 0.0025; pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0025, -1.2, 1.2); camera.rotation.set(pitch, yaw, 0, 'YXZ'); });
renderer.domElement.addEventListener('click', () => { if (!desk) return; if (document.pointerLockElement !== renderer.domElement) { renderer.domElement.requestPointerLock?.(); } activate(); });

// ---------- intro / session start ----------
const $ = id => document.getElementById(id);
$('optReduce').checked = settings.reduceEffects; $('optComfort').value = settings.comfort; $('optDiff').value = settings.difficulty;
if ($('optVoice')) $('optVoice').checked = settings.voice !== false;
if ($('optHandsFree')) $('optHandsFree').checked = !!settings.handsFree;
if ($('optPerf')) $('optPerf').checked = !!settings.perfMode;
function applyOpts() {
  settings.reduceEffects = $('optReduce').checked; settings.comfort = $('optComfort').value; settings.difficulty = $('optDiff').value;
  if ($('optVoice')) settings.voice = $('optVoice').checked; if ($('optHandsFree')) settings.handsFree = $('optHandsFree').checked;
  if ($('optPerf')) { settings.perfMode = $('optPerf').checked; if (settings.perfMode && qTier === 0) { qTier = 1; applyQuality(); } }
  setVoice(settings.voice !== false); saveSettings(); heart.reset(true);
}
function begin() { applyOpts(); initAudio(); $('intro').hidden = true; state = 'select'; bus.emit('panelOpen'); say(LINES.welcome);
  if (!navigator.onLine) setTimeout(() => bus.emit('toast', 'Offline: solo play works, multiplayer needs internet'), 4000); }
const xrBtn = $('enterXR');
function checkXR() {
  if (!xrBtn.dataset.ready) return;
  if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then(ok => { xrBtn.disabled = !ok; xrBtn.textContent = ok ? 'Enter VR' : 'VR not available here'; });
  else xrBtn.textContent = 'VR not available here';
}
xrBtn.onclick = async () => {
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local', 'hand-tracking', 'layers'] });
  await renderer.xr.setSession(session);
  // Focus loss (system menu, guardian, etc.): stop input + simulation, keep rendering; show Pause on return.
  session.addEventListener('visibilitychange', () => { const was = paused; paused = session.visibilityState !== 'visible'; if (was && !paused && state !== 'title') menus.open('pause'); });
  session.addEventListener('end', () => { $('intro').hidden = false; state = 'title'; menus.close(); });
  const ref = renderer.xr.getReferenceSpace(); if (ref && ref.addEventListener) ref.addEventListener('reset', () => { flight.yawBias = 0; }); // system recenter
  begin(); net.join('aurelia');
};
$('enterDesk').onclick = () => { desk = true; $('deskHelp').hidden = false; begin(); net.join('aurelia'); };
$('enterDesk').disabled = true; $('enterDesk').textContent = 'Loading Aurelia…';
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
addEventListener('pagehide', () => net.leave());
document.addEventListener('visibilitychange', () => { if (document.hidden && state !== 'title' && !renderer.xr.isPresenting) menus.open('pause'); });

net.avatar = id => buildHero(HERO_ORDER.includes(id) ? id : 'ribbon');

// ---------- auto quality guard ----------
let qTier = settings.perfMode ? 1 : 0, qAcc = 0, qN = 0, qCool = 6;
function thin(root) { const keep = [1, 0.6, 0.35][qTier]; root.traverse(o => { if (o.isInstancedMesh) { if (o.userData.fullCount === undefined) o.userData.fullCount = o.count; o.count = Math.max(1, Math.floor(o.userData.fullCount * keep)); } }); }
function applyQuality() { if (city && city.root) thin(city.root); for (const k in levelBuilt) if (levelBuilt[k].root) thin(levelBuilt[k].root); if (gfx && gfx.setQuality) try { gfx.setQuality(qTier); } catch (e) {} }
function qualityGuard(dt) {
  if (!renderer.xr.isPresenting || qTier >= 2) return;
  qAcc += dt; qN++; qCool -= dt;
  if (qAcc >= 2) { const avg = qAcc / qN; qAcc = 0; qN = 0; if (avg > 1 / 66 && qCool <= 0) { qTier++; qCool = 6; applyQuality(); console.info('quality tier', qTier); } }
}

// ---------- loop ----------
const clock = new THREE.Clock(); let time = 0, autoT = 0, restT = 0;
const gazeList = [], powerList = [];
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); time += dt;
  if (city && activeWorld === 'aurelia') city.update(dt, time);
  if (lineup) { lineup.group.visible = (state === 'select' || state === 'title' || state === 'boot') && activeWorld === 'aurelia'; if (lineup.group.visible) lineup.update(dt, time); }
  qualityGuard(dt);
  if (state !== 'title' && state !== 'boot') { const th = musicTheme(); if (th !== musicLast.t) { musicLast.t = th; music.setTheme(th); } const mi = boss.active || (miniBoss && miniBoss.active) ? 1 : raids.alive > 0 ? 0.75 : 0.15; if (mi !== musicLast.i) { musicLast.i = mi; music.setIntensity(mi); } music.update(dt); }
  if (state !== 'title' && state !== 'boot') { restT += dt; if (restT > 1800) { restT = 0; say('You\'ve been playing for 30 minutes. Great time to stretch, blink and grab some water — your progress is saved.', 'Odessa', 8); } }
  if (gfx && gfx.update) gfx.update(dt, time, camera);
  if (state === 'boot' || state === 'title') { renderer.render(scene, camera); return; }
  if (!paused && !menus.group.visible) {
    _lf.set(0, 0, -1).applyQuaternion(camera.quaternion);
    hands.update(camera.position, _lf, dt);
    const flying = (state === 'play' || state === 'won') && !way.open;
    flight.input = flying ? Math.max(hands.thrust(), keys.KeyW ? 1 : 0) : 0;
    if (keys.KeyS) flight.input = 0;
    flight.update(dt);
    camera.getWorldPosition(_hp); camera.getWorldQuaternion(_hq); camera.getWorldDirection(_d);
    powerList.length = 0;
    for (const t of raids.list) powerList.push(t);
    if (boss.active) for (const t of boss.targets) powerList.push(t);
    if (miniBoss && miniBoss.active) for (const t of miniBoss.targets) powerList.push(t);
    powers.targets = powerList;
    powers.update(dt);
    if (state === 'play' && (settings.handsFree || (!desk && !hands.anyTracked()))) {
      const t = powers.assist(_hp, _d); autoT = t ? autoT + dt : 0;
      if (autoT > 0.9) { autoT = 0; _o.copy(_hp); _o.y -= 0.15; powers.cast(_o, _d); }
    }
    raids.update(dt, time, _hp);
    boss.update(dt, time, _hp, _d);
    if (miniBoss) miniBoss.update(dt, time, _hp);
    if (run) run.update(dt, time, _hp);
    if (state === 'board' && board) board.update(dt, time);
    glims.update(dt, _hp);
    heart.update(dt);
    net.update(dt, _hp, _hq);
  } else { hands.update(camera.position, _lf.set(0, 0, -1).applyQuaternion(camera.quaternion), dt); }
  // gaze targets: UI first, then world interactables
  gazeList.length = 0;
  if (menus.group.visible) for (const m of menus.gazeTargets) gazeList.push(m);
  else {
    if (way.open) for (const m of way.gazeTargets) gazeList.push(m);
    if (choice.group.visible) for (const m of choice.buttons) gazeList.push(m);
    if (state === 'select' && lineup) for (const m of lineup.hitTargets) gazeList.push(m);
    if (state === 'play') { for (const m of glims.targets) gazeList.push(m); if (run) for (const m of run.gazeTargets) gazeList.push(m); }
    if (state === 'board' && board) for (const m of board.gazeTargets) gazeList.push(m);
  }
  gaze.targets = gazeList;
  gaze.update(dt);
  if (lineup) lineup.setHover(state === 'select' && gaze.hit && gaze.hit.userData.heroId ? gaze.hit.userData.heroId : null);
  way.update(dt);
  hud.update(dt);
  renderer.render(scene, camera);
});

// QA hooks (only with ?qa) — automated tests drive the full game loop.
if (location.search.includes('qa')) {
  window.__cc = { way, DEST, raids, boss, powers, heart, glims, choice, cleared, pickHero, activate, rig, camera, gaze, menus, hop, doAction, progress, startBoard,
    get run() { return run; }, get miniBoss() { return miniBoss; }, get board() { return board; }, get state() { return state; }, get LEVELS() { return LEVELS; } };
  window.__ccInfo = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures });
}

// offline app shell (PWA / Horizon Store packaging)
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});

boot().then(() => { $('enterDesk').disabled = false; $('enterDesk').textContent = 'Play on this screen';
    // Horizon Store PWA: launch straight into VR (Meta guidance: gate on getDigitalGoodsService)
    if ('getDigitalGoodsService' in window && navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then(ok => { if (ok) xrBtn.click(); }).catch(() => {}); })
  .catch(e => { console.error('boot failed', e); $('enterDesk').textContent = 'Load error — refresh'; });
