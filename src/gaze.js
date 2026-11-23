// Gaze targeting + dwell-select. Lets players with no hand movement play fully:
// look at a target and hold your gaze to select it. Pinch selects instantly.
import * as THREE from 'three';
import { bus } from './core.js';
// Any new panel arms dwell only after a short pause, so nothing gets chosen just by appearing under your gaze.

const _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class Gaze {
  constructor(camera, scene) {
    this.camera = camera; this.ray = new THREE.Raycaster(); this.ray.far = 120;
    this.targets = []; this.hit = null; this.dwell = 0; this.block = 0; this.dwellTime = 1.1; this.frame = 0;
    const ring = new THREE.RingGeometry(0.012, 0.018, 24);
    this.reticle = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
    this.fill = new THREE.Mesh(new THREE.CircleGeometry(0.011, 24), new THREE.MeshBasicMaterial({ color: 0x7cf4ff, depthTest: false }));
    this.reticle.renderOrder = this.fill.renderOrder = 997;
    this.reticle.add(this.fill);
    camera.add(this.reticle); this.reticle.position.set(0, 0, -1);
    bus.on('panelOpen', () => { this.block = 1.0; this.hit = null; });
  }
  origin(out) { return this.camera.getWorldPosition(out); }
  dir(out) { return this.camera.getWorldDirection(out); }
  update(dt) {
    // raycast every other frame (cheap), dwell runs every frame
    if ((this.frame++ & 1) === 0) {
      this.origin(_o); this.dir(_d); this.ray.set(_o, _d);
      const hits = this.ray.intersectObjects(this.targets, true);
      let h = null;
      for (let i = 0; i < hits.length; i++) { let o = hits[i].object; while (o && !o.userData.gazeable) o = o.parent; if (o) { h = o; break; } }
      if (h !== this.hit) { this.hit = h; this.dwell = 0; }
    }
    if (this.block > 0) { this.block -= dt; this.dwell = 0; this.fill.scale.setScalar(0.001); return; }
    if (this.hit && this.hit.userData.dwell) {
      this.dwell += dt;
      const need = this.hit.userData.dwellTime || this.dwellTime;
      const t = Math.max(0.001, Math.min(1, this.dwell / need));
      this.fill.scale.setScalar(t); // grows to fill the ring — zero allocations
      if (this.dwell >= need) { bus.emit('select', this.hit); this.dwell = -1.5; }
    } else this.fill.scale.setScalar(0.001);
  }
}
