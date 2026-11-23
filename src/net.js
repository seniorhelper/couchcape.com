// Multiplayer layer — transport-agnostic so we can swap in a real server later
// (WebRTC / LiveKit / Colyseus) without touching game code.
// Today: BroadcastChannel adapter (multiple tabs on one machine) for testing.
// Built in from v1: mute, block, report (required by Meta for multiplayer).
import * as THREE from 'three';
import { bus } from './core.js';
const _e = new THREE.Euler();

class LocalAdapter {
  constructor(room, onMsg) { this.ch = ('BroadcastChannel' in window) ? new BroadcastChannel('couchcape:' + room) : null; if (this.ch) this.ch.onmessage = e => onMsg(e.data); }
  send(msg) { if (this.ch) this.ch.postMessage(msg); }
  close() { if (this.ch) this.ch.close(); }
}

export class Net {
  constructor(scene) {
    this.scene = scene; this.id = Math.random().toString(36).slice(2, 10);
    this.peers = new Map(); this.blocked = new Set(); this.muted = new Set();
    this.sendT = 0; this.adapter = null;
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xffd84d, emissive: 0x7a5a00, emissiveIntensity: 0.4, roughness: 0.4 });
    this.headGeo = new THREE.SphereGeometry(0.16, 16, 12);
    this.out = { t: 'state', id: this.id, p: [0, 0, 0], q: [0, 0, 0, 1], name: 'Hero' };
  }
  join(room = 'lobby') { this.adapter = new LocalAdapter(room, m => this.onMsg(m)); this.adapter.send({ t: 'hello', id: this.id }); }
  onMsg(m) {
    if (!m || m.id === this.id || this.blocked.has(m.id)) return;
    if (m.t === 'state') {
      let p = this.peers.get(m.id);
      if (!p) { p = { mesh: new THREE.Group(), target: new THREE.Vector3(), tq: new THREE.Quaternion(), seen: 0, hero: null, h: null }; this.scene.add(p.mesh); this.peers.set(m.id, p); bus.emit('peerJoin', m.id); bus.emit('toast', 'A friend joined!'); }
      if (m.h && m.h !== p.h && this.avatar) { // show the friend as their chosen hero
        if (p.hero) p.mesh.remove(p.hero.group);
        p.hero = this.avatar(m.h); p.hero.group.position.y = -1.6; p.hero.group.rotation.y = Math.PI; p.mesh.add(p.hero.group); p.h = m.h;
      } else if (!p.hero && !p.head) { p.head = new THREE.Mesh(this.headGeo, this.headMat); p.mesh.add(p.head); }
      if (p.hero && p.head) { p.mesh.remove(p.head); p.head = null; }
      p.target.fromArray(m.p); p.tq.fromArray(m.q); p.seen = performance.now(); p.name = m.name;
    } else if (m.t === 'bye') this.drop(m.id);
  }
  drop(id) { const p = this.peers.get(id); if (p) { this.scene.remove(p.mesh); this.peers.delete(id); bus.emit('peerLeave', id); } }
  // moderation
  mute(id) { this.muted.add(id); }
  block(id) { this.blocked.add(id); this.drop(id); }
  report(id, reason) {
    // Placeholder until the server exists: queue locally. Server endpoint + review flow is required before launch.
    try { const q = JSON.parse(localStorage.getItem('couchcape.reports') || '[]'); q.push({ id, reason, at: Date.now() }); localStorage.setItem('couchcape.reports', JSON.stringify(q)); } catch (e) {}
    this.block(id); bus.emit('toast', 'Report sent. Player blocked.');
  }
  update(dt, headWorldPos, headWorldQuat) {
    if (!this.adapter) return;
    this.sendT -= dt;
    if (this.sendT <= 0) { // 15 Hz state, reusing one message object
      this.sendT = 1 / 15;
      headWorldPos.toArray(this.out.p); headWorldQuat.toArray(this.out.q);
      this.adapter.send(this.out);
    }
    const now = performance.now();
    for (const [id, p] of this.peers) {
      if (now - p.seen > 5000) { this.drop(id); continue; }
      p.mesh.position.lerp(p.target, Math.min(1, dt * 10));
      if (p.hero) { // body stays upright: only follow the friend's heading
        _e.setFromQuaternion(p.tq, 'YXZ'); p.mesh.rotation.y += (_e.y - p.mesh.rotation.y) * Math.min(1, dt * 8); p.hero.update(dt, now / 1000);
      } else p.mesh.quaternion.slerp(p.tq, Math.min(1, dt * 10));
    }
  }
  leave() { if (this.adapter) { this.adapter.send({ t: 'bye', id: this.id }); this.adapter.close(); } }
}
