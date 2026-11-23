// World manager: Aurelia + the Seam worlds (levels). Only the active world is visible.
// Inside a world: encounter zones → glowing Seam Beacons (look + pinch to hop on) → mini-boss.
// Hidden Heart Pieces reward exploration (4 pieces = a new heart container).
import * as THREE from 'three';
import { bus, settings, DIFF } from './core.js';
import { SFX } from './audio.js';

export const LEVEL_IDS = ['shatterbelt', 'lumen', 'mudlark', 'paradox'];
export const MINIBOSS_KIND = { shatterbelt: 'foreman', lumen: 'duchess', mudlark: 'golem', paradox: 'distorter' };
let MB = null; export async function loadMiniBossArt() { try { MB = (await import('./art/minibosses.js')).MINIBOSSES; } catch (e) { console.warn('miniboss art missing', e); } }

export async function loadLevels() {
  const out = {};
  const mods = await Promise.allSettled(LEVEL_IDS.map(id => import(`./levels/${id}.js`)));
  mods.forEach((m, i) => { if (m.status === 'fulfilled' && m.value.LEVEL) out[LEVEL_IDS[i]] = m.value.LEVEL; else console.warn('level not available:', LEVEL_IDS[i], m.reason || ''); });
  return out;
}

// ---------- Seam Beacon: diegetic "next zone" portal you look at and pinch ----------
export function makeBeacon(color = 0x7cf4ff) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 12, 48), new THREE.MeshBasicMaterial({ color }));
  const veil = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  g.add(ring, veil);
  g.userData = { gazeable: true, dwell: true, beacon: true };
  g.update = (t) => { ring.rotation.z = t * 0.6; veil.material.opacity = 0.18 + Math.sin(t * 2.4) * 0.05; }; // slow, soft pulse
  return g;
}

// ---------- Heart Pieces (secrets) ----------
const pieceGeo = (() => {
  const s = new THREE.Shape(); s.moveTo(0, 0.25); s.bezierCurveTo(0, 0.5, -0.5, 0.5, -0.5, 0.15); s.bezierCurveTo(-0.5, -0.2, 0, -0.35, 0, -0.55); s.bezierCurveTo(0, -0.35, 0.5, -0.2, 0.5, 0.15); s.bezierCurveTo(0.5, 0.5, 0, 0.5, 0, 0.25);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3 }); g.center(); return g;
})();
const pieceMat = new THREE.MeshStandardMaterial({ color: 0xff6fa5, emissive: 0xff3d7f, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.1 });

// ---------- Mini-boss: a giant Echo with 2 weak points and telegraphed volleys ----------
export class MiniBoss {
  constructor(scene, heart, raids, buildEcho) { this.scene = scene; this.heart = heart; this.raids = raids; this.buildEcho = buildEcho; this.active = false; this.targets = []; }
  start(center, name, kind) {
    this.g = new THREE.Group(); this.g.position.copy(center);
    const need = { easy: 3, medium: 4, hard: 6, expert: 8 }[settings.difficulty];
    let cores;
    if (MB && kind && MB[kind]) { // bespoke mini-boss model (Foreman, Static Duchess, Grudge Golem, The Distorter)
      const art = MB[kind](); this.art = art; this.g.add(art.group); cores = art.weakPoints;
    } else {                      // fallback: a giant Echo with two added cores
      const art = this.buildEcho ? this.buildEcho(1) : null; this.art = art;
      if (art) { art.group.scale.setScalar(4.2); this.g.add(art.group); }
      const coreMat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xb58cff, emissiveIntensity: 1.1 });
      cores = [[0, 6.2, 1.6], [0, 9.4, 0.6]].map(p => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), coreMat()); m.position.set(...p); this.g.add(m); return m; });
    }
    const self = this;
    this.targets = cores.map((m, i) => ({ i, obj: m, pos: new THREE.Vector3(), alive: true, radius: 1.4, hp: need,
      hit() { if (!this.alive) return; this.hp--; SFX.freeze(); self.heart.addSparks(3);
        if (this.hp <= 0) { this.alive = false; m.scale.multiplyScalar(0.7); if (m.material && m.material.emissiveIntensity !== undefined) m.material.emissiveIntensity = 0.1; bus.emit('toast', 'Core sealed!'); if (self.targets.every(t => !t.alive)) self.win(); } } }));
    this.scene.add(this.g); this.active = true; this.t = 0; this.fire = 3; this.name = name;
    bus.emit('toast', `${name} appears! Seal both glowing cores.`);
  }
  win() { this.active = false; if (this.art) this.art.setState('sealed'); SFX.container(); bus.emit('miniBossWon', this.name); }
  update(dt, time, head) {
    if (!this.g) return;
    if (this.art) this.art.update(dt, time);
    for (const t of this.targets) t.obj.getWorldPosition(t.pos);
    if (!this.active) { this.g.position.y += dt * 1.5; return; }
    this.t += dt; this.g.lookAt(head.x, this.g.position.y, head.z);
    this.fire -= dt;
    if (this.fire < 1.2 && this.art && !this.tell) { this.art.setState('attack'); this.tell = true; } // 1.2 s telegraph
    if (this.fire <= 0) {
      this.tell = false; if (this.art) this.art.setState('idle');
      const n = settings.difficulty === 'easy' ? 2 : settings.difficulty === 'expert' ? 5 : 3;
      for (let k = 0; k < n; k++) { const p = this.g.position.clone(); p.y += 6 + k; p.x += (k - (n - 1) / 2) * 2.5; this.raids.lob(p, head); }
      this.fire = DIFF[settings.difficulty].enemyFireEvery + 1.5;
    }
  }
  stop() { if (this.g) this.scene.remove(this.g); this.g = null; this.active = false; this.targets = []; }
}

// ---------- World runtime for one Seam world ----------
export class WorldRun {
  constructor(scene, def, built, ctx) {
    this.scene = scene; this.def = def; this.w = built; this.ctx = ctx; // ctx: {raids, glims, heart, say, miniBoss}
    this.zone = 0; this.beacon = null; this.pieces = []; this.done = false;
    // secrets
    (built.secrets || []).forEach((p, i) => {
      const key = `${def.id}:${i}`; if (ctx.progress.pieces.includes(key)) return;
      const m = new THREE.Mesh(pieceGeo, pieceMat); m.position.copy(p); m.userData = { gazeable: true, dwell: true, piece: key }; scene.add(m); this.pieces.push(m);
    });
    // illusion plaques: look at an illusion to learn how your brain got tricked
    this.plaques = (built.plaques || []).filter(m => m && m.userData && m.userData.plaque);
    for (const m of this.plaques) { m.userData.gazeable = true; m.userData.dwell = true; m.userData.dwellTime = 1.6; }
    // hover pad: a soft glowing disc under your seat at the arrival point (seated reference, comfort)
    if (built.arrival) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.12, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(def.color || '#7cf4ff'), emissiveIntensity: 0.35, roughness: 0.3, transparent: true, opacity: 0.85 }));
      pad.position.copy(built.arrival.pos); pad.position.y -= 1.3; scene.add(pad); this.pad = pad;
    }
    // rescues
    (built.rescues || []).forEach((p, i) => ctx.glims.spawn(`${def.id}-${i}`, p, def.color || '#7cf4ff'));
  }
  startZone() {
    const z = this.w.raids[this.zone];
    if (!z) return this.startMiniBoss();
    // keep the fight within reach (aim assist ~160 m; comfortable ~45 m): pull far zone centers toward the player
    let c = z.center; const head = this.ctx.headPos(), dist = head.distanceTo(c);
    if (dist > 55) c = head.clone().lerp(c, 45 / dist);
    this.ctx.raids.spawn(`${this.def.id}#${this.zone}`, c, z.foes || 5);
    this.ctx.say(`${z.name || 'Echoes'} ahead. Seal them all!`);
  }
  onRaidClear(id) {
    if (!id || !id.startsWith(this.def.id + '#')) return false;
    const fact = (this.w.facts || [])[this.zone]; if (fact) this.ctx.say(fact, 'Odessa', 8);
    this.zone++;
    const next = this.w.raids[this.zone] ? this.w.raids[this.zone].center : (this.w.miniBoss && this.w.miniBoss.center);
    if (next) this.placeBeacon(next);
    return true;
  }
  placeBeacon(target) {
    if (this.beacon) this.scene.remove(this.beacon);
    const head = this.ctx.headPos();
    const b = makeBeacon(new THREE.Color(this.def.color || '#7cf4ff').getHex());
    const dir = new THREE.Vector3().subVectors(target, head).setY(0).normalize();
    b.position.copy(head).addScaledVector(dir, 7); b.lookAt(head);
    b.userData.target = target.clone(); this.scene.add(b); this.beacon = b;
    bus.emit('toast', 'A Seam Beacon opened — look at it and pinch to hop.');
  }
  useBeacon() {
    if (!this.beacon) return; // already used (double pinch / dwell race)
    const t = this.beacon.userData.target; this.scene.remove(this.beacon); this.beacon = null;
    const view = t.clone(); view.y += 4; const from = this.ctx.headPos(); const back = new THREE.Vector3().subVectors(from, t).setY(0).normalize();
    view.addScaledVector(back, 26);
    this.ctx.hop({ pos: view, look: t, id: this.def.id, keepWorld: true });
  }
  arrivedAtZone() { if (this.w.raids[this.zone]) this.startZone(); else if (!this.done) this.startMiniBoss(); }
  startMiniBoss() {
    const mb = this.w.miniBoss; if (!mb) { this.finish(); return; }
    this.ctx.miniBoss.start(mb.center, mb.name || 'Mini-boss', MINIBOSS_KIND[this.def.id]);
    this.ctx.say(`${mb.name}! ${this.w.lesson ? '' : ''}Seal its cores.`);
  }
  finish() { this.done = true; this.ctx.say(this.w.lesson || 'World restored!', 'Odessa', 7); bus.emit('worldCleared', this.def.id); }
  collectPiece(m) {
    this.scene.remove(m); this.pieces.splice(this.pieces.indexOf(m), 1);
    this.ctx.progress.pieces.push(m.userData.piece); this.ctx.heart.addShard(); SFX.container(); bus.emit('toast', 'Heart Piece found!'); bus.emit('saveProgress');
  }
  update(dt, t, head) {
    if (this.w.update) this.w.update(dt, t);
    if (this.beacon) this.beacon.update(t);
    for (const m of this.pieces) { m.rotation.y += dt * 1.2; if (m.position.distanceToSquared(head) < 9) { this.collectPiece(m); break; } }
  }
  get gazeTargets() { const a = this.pieces.concat(this.plaques); if (this.beacon) a.push(this.beacon); return a; }
  dispose() { if (this.pad) this.scene.remove(this.pad); if (this.beacon) this.scene.remove(this.beacon); for (const m of this.pieces) this.scene.remove(m); this.pieces = []; }
}
