// The Ever-Glass — final boss. Three phases, four weak points, all attacks in front of you,
// every attack telegraphed 1.5–2 s with sound + visuals (studio rule), no flashes.
// Signature mechanic — VANITY GLARE: when its face-mirror charges, LOOK AWAY.
// Staring into the glare costs a heart; looking away (self-reflection, not staring at others) is the counter.
import * as THREE from 'three';
import { bus, settings, DIFF } from './core.js';
import { SFX } from './audio.js';

let art = null;
export async function loadBossArt() { try { art = await import('./art/foes.js'); } catch (e) { /* fallback below */ } }

function fallbackBoss() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0xe6e2ff, metalness: 0.9, roughness: 0.12, emissive: 0x2a1f55, emissiveIntensity: 0.4 });
  const torso = new THREE.Mesh(new THREE.OctahedronGeometry(6, 1), glass); torso.position.y = 16; torso.scale.set(1, 1.5, 0.7);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), glass); head.position.y = 27;
  g.add(torso, head);
  const wpPos = [[-7, 21, 2], [7, 21, 2], [0, 16, 4.5], [0, 31, 0]], weakPoints = [];
  const coreMat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xb58cff, emissiveIntensity: 1.2 });
  wpPos.forEach(p => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 14), coreMat()); m.position.set(...p); g.add(m); weakPoints.push(m); });
  return { group: g, weakPoints, update() {}, setPhase() {}, sealWeakPoint(i) { weakPoints[i].material.emissiveIntensity = 0.1; weakPoints[i].material.color.set(0x9fdfff); }, setSealedAll() { glass.color.set(0xbff0ff); glass.emissiveIntensity = 0.1; } };
}

const _w = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();
const PHASE_WEAK = { 1: [0, 1], 2: [2], 3: [3] };

export class Boss {
  constructor(scene, heart, raids) {
    this.scene = scene; this.heart = heart; this.raids = raids; this.active = false;
    this.targets = [];
    // glare telegraph ring (grows while charging)
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 48), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.visible = false; scene.add(this.ring);
  }
  start(center) {
    this.b = art && art.buildEverGlass ? art.buildEverGlass() : fallbackBoss();
    this.b.group.position.set(center.x, center.y - 10, center.z - 6); this.b.group.scale.setScalar(1.45); // colossal
    this.b.group.lookAt(center.x, this.b.group.position.y, center.z); // faces the player side
    this.scene.add(this.b.group);
    this.center = center.clone(); this.active = true; this.phase = 0; this.t = 0;
    this.need = { easy: 2, medium: 3, hard: 4, expert: 5 }[settings.difficulty];
    this.targets = this.b.weakPoints.map((wp, i) => {
      const self = this;
      return { i, obj: wp, pos: new THREE.Vector3(), alive: false, radius: 1.8, hp: 0, sealed: false,
        hit() { if (!this.alive) return; this.hp--; SFX.freeze(); self.heart.addSparks(5); bus.emit('bossHit', this);
          if (this.hp <= 0) { this.alive = false; this.sealed = true; self.b.sealWeakPoint(this.i); bus.emit('toast', 'Weak point sealed!'); self.checkPhase(); } } };
    });
    this.setPhase(1);
  }
  setPhase(n) {
    this.phase = n; this.b.setPhase(n);
    for (const i of PHASE_WEAK[n]) { const t = this.targets[i]; t.alive = true; t.hp = this.need; }
    this.attackT = 4; this.glare = 0;
    const names = { 1: 'The Ever-Glass rises! Seal its shoulder cores.', 2: 'It shatters into neon! Seal the chest core.', 3: 'Molten glass! Seal the crown.' };
    bus.emit('toast', names[n]); bus.emit('bossPhase', n);
    if (n > 1) this.raids.spawn('boss', this.center, n === 2 ? 3 : 4); // helpers join each phase
  }
  checkPhase() {
    if (PHASE_WEAK[this.phase].every(i => this.targets[i].sealed)) {
      if (this.phase < 3) this.setPhase(this.phase + 1);
      else if (!this.reflected) bus.emit('bossReflection');   // story beat before the final seal
      else this.win();
    }
  }
  reflectionChosen(humble) {
    this.reflected = humble;
    if (humble) { this.win(); }
    else { const t = this.targets[3]; t.sealed = false; t.alive = true; t.hp = 1; bus.emit('toast', 'The glass grows stronger… look again.'); }
  }
  win() {
    this.b.setSealedAll(); this.active = false; this.raids.clear(); this.ring.visible = false;
    SFX.container(); bus.emit('bossWon');
  }
  update(dt, time, headPos, headDir) {
    if (!this.b) return;
    this.b.update(dt, time);
    if (!this.active) return;
    for (const t of this.targets) t.obj.getWorldPosition(t.pos);
    const d = DIFF[settings.difficulty];
    this.attackT -= dt;
    // face mirror location (between head weak point and torso)
    this.b.group.localToWorld(_f.set(0, 26, 4));
    if (this.glare > 0) {                       // VANITY GLARE charging
      this.glare -= dt;
      const k = 1 - this.glare / 2.0;
      this.ring.visible = true; this.ring.position.copy(_f); this.ring.lookAt(headPos);
      this.ring.scale.setScalar(1 + k * 1.5); this.ring.material.opacity = 0.25 + k * 0.5;
      if (this.glare <= 0) {
        this.ring.visible = false;
        _d.subVectors(_f, headPos).normalize();
        const staring = _d.dot(headDir) > 0.9;   // within ~25° = looking at it
        if (staring) { this.heart.damage(d.enemyDmg); SFX.hurt(); bus.emit('toast', 'Dazzled by the glare! Look away next time.'); }
        else bus.emit('toast', 'You looked away — the glare can\'t reach you.');
        this.attackT = 3.5;
      }
    } else if (this.attackT <= 0) {
      if (Math.random() < 0.45) { this.glare = 2.0; SFX.ko(); bus.emit('toast', 'VANITY GLARE! Look away!'); }
      else { // shard volley: slow, dodgeable, all in front
        for (let k = 0; k < (settings.difficulty === 'easy' ? 2 : 4); k++) {
          this.b.group.localToWorld(_w.set((k - 1.5) * 5, 18 + k * 2, 3)); this.raids.lob(_w, headPos);
        }
        this.attackT = d.enemyFireEvery + 2;
      }
    }
  }
  stop() { if (this.b) this.scene.remove(this.b.group); this.b = null; this.active = false; this.ring.visible = false; }
}
