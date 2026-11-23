// Mirror Echo raids. Echoes hover, taunt, and lob slow "doubt orbs" you can dodge
// with a head tilt. Sealing an Echo encases it in crystal and lifts it away — never harmed.
import * as THREE from 'three';
import { bus, settings, DIFF } from './core.js';
import { SFX } from './audio.js';

let foeArt = null;
export function getFoeArt() { return foeArt; }
export async function loadFoeArt() { try { foeArt = await import('./art/foes.js'); } catch (e) { console.warn('foes art missing, using fallback', e); } return foeArt; }

function fallbackEcho() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e4ff, metalness: 0.85, roughness: 0.15, emissive: 0x30225a, emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.0, 4, 10), mat); body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), mat); head.position.y = 2.0;
  const block = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 1.6), new THREE.MeshStandardMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.5, roughness: 0.05 }));
  block.position.y = 1.2; block.visible = false; g.add(body, head, block);
  return { group: g, update() {}, setState(s) { block.visible = s === 'sealed'; }, radius: 1.1 };
}

const TAUNTS = ['Look at them, not you!', 'You\'re not special.', 'Everyone\'s watching you fail.', 'Who do you think you are?'];
const _d = new THREE.Vector3();

export class Raids {
  constructor(scene, heart) {
    this.scene = scene; this.heart = heart; this.list = [];
    this.orbs = [];
    const og = new THREE.IcosahedronGeometry(0.26, 1), om = new THREE.MeshStandardMaterial({ color: 0xc9b6ff, emissive: 0x5a3fb0, emissiveIntensity: 0.8, roughness: 0.2 });
    for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(og, om); m.visible = false; m.userData = { v: new THREE.Vector3(), life: 0 }; scene.add(m); this.orbs.push(m); }
    this.active = null;
  }
  // Spawn a raid of n Echoes around a center point, facing the player.
  spawn(districtId, center, n) {
    this.clear();
    for (let i = 0; i < n; i++) {
      const variant = i % 3 === 2 ? 2 : i % 2;
      const art = foeArt ? foeArt.buildEcho(variant) : fallbackEcho();
      const a = (i / n) * Math.PI * 2;
      const home = new THREE.Vector3(center.x + Math.cos(a) * 14, center.y + 2 + (i % 3) * 3, center.z + Math.sin(a) * 14);
      art.group.position.copy(home); this.scene.add(art.group);
      const self = this;
      const t = {
        art, home, pos: art.group.position, alive: true, radius: art.radius || 1.1, slowT: 0, t: Math.random() * 9,
        fire: 3 + i * 0.7, sealedT: 0,
        hit() { if (!this.alive) return; this.alive = false; art.setState('sealed'); SFX.freeze(); self.heart.addSparks(10); bus.emit('sealed', this); }
      };
      this.list.push(t);
    }
    this.active = districtId;
  }
  clear() { for (const t of this.list) this.scene.remove(t.art.group); this.list.length = 0; this.active = null; }
  get alive() { let n = 0; for (const t of this.list) if (t.alive) n++; return n; }

  update(dt, time, head) {
    const d = DIFF[settings.difficulty];
    for (const t of this.list) {
      t.art.update(dt, time);
      if (t.alive) {
        const sp = t.slowT > 0 ? 0.3 : 1; if (t.slowT > 0) t.slowT -= dt;
        t.t += dt * sp;
        t.pos.set(t.home.x + Math.sin(t.t * 0.6) * 4, t.home.y + Math.sin(t.t * 1.1) * 1.5, t.home.z + Math.cos(t.t * 0.45) * 3);
        t.art.group.lookAt(head.x, t.pos.y, head.z);
        t.fire -= dt * sp;
        if (t.fire < 0.6 && t.fire + dt * sp >= 0.6) t.art.setState('attack'); // wind-up tell before every shot
        if (t.fire <= 0) {
          t.fire = d.enemyFireEvery * (0.8 + Math.random() * 0.6); t.art.setState('idle');
          if (t.pos.distanceToSquared(head) < 75 * 75) this.lob(t.pos, head);
          if (Math.random() < 0.25) bus.emit('taunt', TAUNTS[(Math.random() * TAUNTS.length) | 0]);
        }
      } else {
        t.sealedT += dt; t.art.group.position.y += dt * 2; t.art.group.rotation.y += dt * 0.5;
        if (t.sealedT > 4 && t.art.group.parent) this.scene.remove(t.art.group);
      }
    }
    for (const o of this.orbs) {
      if (!o.visible) continue;
      o.position.addScaledVector(o.userData.v, dt); o.userData.life -= dt; o.rotation.y += dt * 3;
      if (o.userData.life <= 0) { o.visible = false; continue; }
      if (o.position.distanceToSquared(head) < 0.5 * 0.5) { o.visible = false; this.heart.damage(d.enemyDmg); SFX.hurt(); }
    }
    if (this.active && this.list.length && this.alive === 0) { const id = this.active; this.active = null; bus.emit('raidClear', id); }
  }
  lob(from, head) {
    const o = this.orbs.find(x => !x.visible); if (!o) return;
    o.position.copy(from); o.position.y += 1.5;
    _d.subVectors(head, o.position).normalize();
    o.userData.v.copy(_d).multiplyScalar(8.5); o.userData.life = 9; o.visible = true;
  }
  hideOrbs() { for (const o of this.orbs) o.visible = false; }
}
