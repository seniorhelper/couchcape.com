// Hero powers. Aim with your eyes (with generous aim assist), pinch or dwell to cast.
// Every power seals foes safely — nobody is ever hurt.
import * as THREE from 'three';
import { SFX } from './audio.js';

// Tunable per-hero power table. Seven distinct play styles, one shared core loop.
export const POWERS = {
  ribbon:   { name: 'Ribbon Lash',   color: 0x4f7bff, speed: 70, homing: 6,  count: 1, splash: 0,  slow: 0,   cooldown: 0.35, hint: 'Fast homing ribbons — great for beginners.' },
  chrona:   { name: 'Time Bubble',   color: 0xf3d28a, speed: 40, homing: 3,  count: 1, splash: 7,  slow: 0.35,cooldown: 0.9,  hint: 'Bubbles slow every foe nearby, then seal them.' },
  prism:    { name: 'Prism Beam',    color: 0xd58cff, speed: 0,  homing: 0,  count: 1, splash: 0,  slow: 0,   cooldown: 0.55, hint: 'Instant beam — hits wherever you look.' },
  verdant:  { name: 'Vine Snare',    color: 0x8cff6a, speed: 45, homing: 12, count: 1, splash: 3,  slow: 0,   cooldown: 0.6,  hint: 'Vines chase foes and tangle neighbors.' },
  fold:     { name: 'Crane Swarm',   color: 0xffd2b8, speed: 38, homing: 9,  count: 3, splash: 0,  slow: 0,   cooldown: 0.8,  hint: 'Three paper cranes seek out three foes.' },
  tinker:   { name: 'Orb Cannon',    color: 0x7ff3ff, speed: 52, homing: 2,  count: 1, splash: 6,  slow: 0,   cooldown: 0.7,  hint: 'Big orbs that seal everything they splash.' },
  starling: { name: 'Gravity Star',  color: 0xffc64d, speed: 34, homing: 4,  count: 1, splash: 9,  slow: 0,   cooldown: 1.0,  hint: 'Stars pull foes together, then seal the bunch.', pull: true }
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _to = new THREE.Vector3();

export class Powers {
  constructor(scene) {
    this.scene = scene; this.heroId = 'ribbon'; this.cd = 0;
    this.targets = [];          // filled by the game: objects with {pos:Vector3, alive:boolean, radius, hit(power)}
    // projectile pool (one material per hero color, swapped on hero change)
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
    const g = new THREE.IcosahedronGeometry(0.18, 1), tg = new THREE.ConeGeometry(0.14, 1.1, 8); tg.rotateX(-Math.PI / 2); tg.translate(0, 0, 0.6);
    this.shots = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(g, this.mat); const t = new THREE.Mesh(tg, this.trailMat); m.add(t);
      m.visible = false; m.userData = { v: new THREE.Vector3(), life: 0, target: null }; scene.add(m); this.shots.push(m);
    }
    // beam (Prism) — a stretched cylinder shown briefly
    const bg = new THREE.CylinderGeometry(0.06, 0.06, 1, 8, 1, true); bg.rotateX(Math.PI / 2); bg.translate(0, 0, -0.5);
    this.beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xd58cff, transparent: true, opacity: 0.8, depthWrite: false }));
    this.beam.visible = false; this.beamT = 0; scene.add(this.beam);
    this.setHero('ribbon');
  }
  setHero(id) { this.heroId = id; const p = POWERS[id]; this.mat.color.setHex(p.color); this.trailMat.color.setHex(p.color); this.beam.material.color.setHex(p.color); }
  get power() { return POWERS[this.heroId]; }

  // Aim assist: best live target inside a ~9° cone around the gaze, weighted by angle then distance.
  assist(origin, dir, coneCos = 0.988) {
    let best = null, bestScore = -1;
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i]; if (!t.alive) continue;
      _to.subVectors(t.pos, origin); const d = _to.length(); if (d > 160) continue;
      const c = _to.dot(dir) / d; if (c < coneCos) continue;
      const s = c * 10 - d * 0.002; if (s > bestScore) { bestScore = s; best = t; }
    }
    return best;
  }

  cast(origin, dir) {
    if (this.cd > 0) return false;
    const p = this.power; this.cd = p.cooldown;
    const primary = this.assist(origin, dir);
    if (p.speed === 0) { // instant beam
      const end = primary ? primary.pos : _w.copy(origin).addScaledVector(dir, 90);
      this.beam.position.copy(origin); this.beam.lookAt(end); this.beam.scale.set(1, 1, origin.distanceTo(end)); this.beam.visible = true; this.beamT = 0.18;
      if (primary) this.impact(primary.pos, primary);
      SFX.bolt(); return true;
    }
    // multi-shot heroes pick extra targets from a wider cone
    const picks = [primary];
    if (p.count > 1) { const wide = this.targets.filter(t => t.alive && t !== primary).sort((a, b) => a.pos.distanceToSquared(origin) - b.pos.distanceToSquared(origin)); for (let k = 0; picks.length < p.count && k < wide.length; k++) picks.push(wide[k]); }
    for (let k = 0; k < p.count; k++) {
      const s = this.shots.find(x => !x.visible); if (!s) break;
      s.position.copy(origin); s.userData.life = 3; s.userData.target = picks[k] || null;
      s.userData.v.copy(dir).multiplyScalar(p.speed);
      if (k > 0) s.userData.v.applyAxisAngle(THREE.Object3D.DEFAULT_UP, (k % 2 ? 1 : -1) * 0.25);
      s.visible = true;
    }
    SFX.bolt(); return true;
  }

  impact(at, direct) {
    const p = this.power;
    if (direct && direct.alive) direct.hit(p);
    if (p.splash > 0) {
      for (const t of this.targets) {
        if (!t.alive || t === direct) continue;
        const d = t.pos.distanceTo(at);
        if (d < p.splash) { if (p.slow) t.slowT = 4; else t.hit(p); }
      }
    }
  }

  update(dt) {
    if (this.cd > 0) this.cd -= dt;
    if (this.beamT > 0) { this.beamT -= dt; if (this.beamT <= 0) this.beam.visible = false; }
    const p = this.power;
    for (const s of this.shots) {
      if (!s.visible) continue;
      const u = s.userData; u.life -= dt;
      if (u.target && u.target.alive && p.homing > 0) { // steer toward target
        _v.subVectors(u.target.pos, s.position).normalize().multiplyScalar(u.v.length());
        u.v.lerp(_v, Math.min(1, p.homing * dt));
      }
      s.position.addScaledVector(u.v, dt);
      _w.copy(s.position).add(u.v); s.lookAt(_w);
      // hit test against live targets
      for (const t of this.targets) {
        if (!t.alive) continue;
        const r = t.radius + 0.4;
        if (t.pos.distanceToSquared(s.position) < r * r) { this.impact(s.position, t); s.visible = false; break; }
      }
      if (u.life <= 0) { if (p.splash) this.impact(s.position, null); s.visible = false; }
    }
  }
}
