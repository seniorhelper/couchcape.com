// Wayfinder: the hand-sign travel system.
// Raise an open hand and look at your palm (~0.5 s) → a map of destinations opens,
// locked in the world in front of you. Look at one and pinch (or just hold your gaze)
// → a gentle fade-hop takes you there. No vection, no nausea.
import * as THREE from 'three';
import { bus } from './core.js';
import { SFX } from './audio.js';

function tileTexture(title, sub, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = color; g.fillRect(0, 0, 512, 22); g.fillRect(0, 234, 512, 22);
  g.strokeStyle = '#10213a'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 246);
  g.fillStyle = '#10213a'; g.font = '800 54px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(title, 256, 125);
  g.font = '600 30px Inter, system-ui, sans-serif'; g.fillStyle = '#3b4b66'; g.fillText(sub, 256, 180);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const _p = new THREE.Vector3(), _f = new THREE.Vector3();

export class Wayfinder {
  constructor(scene, camera, rig) {
    this.scene = scene; this.camera = camera; this.rig = rig;
    this.panel = new THREE.Group(); this.panel.visible = false; scene.add(this.panel);
    this.buttons = []; this.open = false; this.openT = 0; this.busy = false;
    // fade veil for travel hops
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xbfe2ff, transparent: true, opacity: 0, depthTest: false }));
    this.veil.position.z = -0.2; this.veil.renderOrder = 1000; this.veil.visible = false; camera.add(this.veil);
  }
  setDestinations(list) { // [{id,name,sub,pos,look,color,locked}]
    for (const b of this.buttons) this.panel.remove(b);
    this.buttons = [];
    const cols = 3;
    list.forEach((d, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: tileTexture(d.name, d.locked ? 'Locked' : d.sub, d.color), transparent: !!d.locked, opacity: d.locked ? 0.45 : 1, depthTest: false, fog: false, toneMapped: false }));
      m.renderOrder = 996;
      const r = Math.floor(i / cols), c = i % cols, rows = Math.ceil(list.length / cols);
      m.position.set((c - (Math.min(cols, list.length) - 1) / 2) * 0.47, ((rows - 1) / 2 - r) * 0.3, 0);
      m.userData = { gazeable: true, dwell: !d.locked, dest: d, wayButton: true };
      this.panel.add(m); this.buttons.push(m);
    });
  }
  // Second row: menu actions (Settings, Recenter, Board game, Players, Exit…)
  setActions(list) { // [{action, label, color}]
    for (const b of (this.actions || [])) this.panel.remove(b);
    this.actions = [];
    const rows = Math.ceil(this.buttons.length / 3);
    list.forEach((a, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.11), new THREE.MeshBasicMaterial({ map: tileTexture(a.label, '', a.color), depthTest: false, fog: false, toneMapped: false }));
      m.renderOrder = 996;
      m.position.set((i - (list.length - 1) / 2) * 0.3, -(rows / 2) * 0.3 - 0.08, 0);
      m.userData = { gazeable: true, dwell: true, action: a.action, wayButton: false };
      this.panel.add(m); this.actions.push(m);
    });
  }
  get gazeTargets() { return this.actions ? this.buttons.concat(this.actions) : this.buttons; }
  show() {
    if (this.busy) return;
    // spawn in front of your gaze, then lock in the world (studio practice: never wrist-locked)
    this.camera.getWorldPosition(_p); this.camera.getWorldDirection(_f); _f.y = Math.max(-0.2, Math.min(0.2, _f.y)); _f.normalize();
    this.panel.position.copy(_p).addScaledVector(_f, 1.25);
    this.panel.lookAt(_p);
    this.panel.visible = true; this.open = true; this.openT = 0; SFX.select();
    bus.emit('wayfinderOpen'); bus.emit('panelOpen');
  }
  hide() { this.panel.visible = false; this.open = false; }
  toggle() { if (this.open) this.hide(); else this.show(); }
  go(dest) {
    if (this.busy || dest.locked) return;
    this.hide(); this.busy = true; SFX.select();
    this.hop = { t: 0, dest, moved: false }; this.veil.visible = true;
  }
  update(dt) {
    if (this.open) { this.openT += dt; if (this.openT > 12) this.hide(); }
    const h = this.hop; if (!h) return;            // driven by the XR frame loop (window rAF pauses in VR)
    h.t += dt; const m = this.veil.material, d = h.dest;
    if (h.t < 0.3) m.opacity = h.t / 0.3;          // soft sky-blue fade — no black-out, no flash
    else if (!h.moved) {
      m.opacity = 1; h.moved = true;
      this.rig.position.copy(d.pos);
      if (d.look) { this.rig.lookAt(d.look.x, this.rig.position.y, d.look.z); this.rig.rotateY(Math.PI); }
      bus.emit('arrived', d);
    } else if (h.t < 0.7) m.opacity = 1 - (h.t - 0.4) / 0.3;
    else { m.opacity = 0; this.veil.visible = false; this.busy = false; this.hop = null; }
  }
}
