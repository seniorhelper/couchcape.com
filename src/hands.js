// Controller-free hands: stylized light-glove rendering + robust gestures.
// Gestures: pinch (with hysteresis), palm-forward "thrust", fist.
import * as THREE from 'three';
import { bus } from './core.js';

const JOINTS = ['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip',
 'index-finger-metacarpal','index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip',
 'middle-finger-metacarpal','middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip',
 'ring-finger-metacarpal','ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip',
 'pinky-finger-metacarpal','pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip'];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);

export class Hands {
  constructor(renderer, parent) {
    this.hands = [renderer.xr.getHand(0), renderer.xr.getHand(1)];
    this.state = [this.blank(), this.blank()];
    const geo = new THREE.SphereGeometry(1, 10, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x7cf4ff, emissive: 0x2aa8c4, emissiveIntensity: 0.9, roughness: 0.35 });
    this.mesh = new THREE.InstancedMesh(geo, mat, 50);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    parent.add(this.mesh);
    // glove "bones": a soft tube between each pair of joints so hands read as gloves, not dots
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), mat, 60);
    this.bones.frustumCulled = false; this.bones.count = 0; parent.add(this.bones);
    this.hands.forEach((h, i) => {
      parent.add(h);
      h.addEventListener('connected', e => { this.state[i].handed = e.data.handedness; this.state[i].tracked = true; });
      h.addEventListener('disconnected', () => { this.state[i].tracked = false; });
    });
  }
  blank() { return { tracked: false, handed: '', pinch: false, thrust: 0, fist: false, palmN: new THREE.Vector3(), tip: new THREE.Vector3() }; }
  joint(i, name) { const j = this.hands[i].joints[name]; return j && j.visible !== false ? j : null; }

  update(headPos, headFwd, dt = 1 / 72) {
    let n = 0, nb = 0;
    for (let i = 0; i < 2; i++) {
      const st = this.state[i], h = this.hands[i];
      if (!st.tracked || !h.joints || !h.joints['wrist']) { st.pinch = false; st.thrust = 0; st.squeeze = 0; st.fistT = 0; continue; }
      // render joints
      for (let k = 0; k < JOINTS.length; k++) {
        const j = h.joints[JOINTS[k]]; if (!j) continue;
        const r = (k % 5 === 4 ? 0.0075 : 0.0095);
        _s.set(r, r, r); _m.compose(j.position, _q.identity(), _s);
        this.mesh.setMatrixAt(n++, _m);
        if (k > 0) { // bone from the previous joint in this finger (finger roots connect to the wrist)
          const pj = h.joints[JOINTS[(k - 1) % 5 === 0 ? 0 : k - 1]]; if (!pj) continue;
          _a.subVectors(j.position, pj.position); const len = _a.length(); if (len < 1e-4) continue;
          _q.setFromUnitVectors(_UP, _a.multiplyScalar(1 / len)); _b.addVectors(j.position, pj.position).multiplyScalar(0.5);
          const br = (k - 1) % 5 === 0 ? 0.0105 : 0.008; _s.set(br, len, br); _m.compose(_b, _q, _s); this.bones.setMatrixAt(nb++, _m);
        }
      }
      const thumb = h.joints['thumb-tip'], index = h.joints['index-finger-tip'];
      const wrist = h.joints['wrist'], idxM = h.joints['index-finger-metacarpal'], pnkM = h.joints['pinky-finger-metacarpal'], midT = h.joints['middle-finger-tip'];
      if (!thumb || !index || !wrist || !idxM || !pnkM || !midT) continue;
      // pinch with hysteresis (2cm on / 3.2cm off)
      const d = thumb.position.distanceTo(index.position);
      const extNow = midT.position.distanceTo(wrist.position);
      const was = st.pinch; st.pinch = was ? d < 0.032 : (d < 0.02 && extNow > 0.1); // a closed fist is never a pinch
      if (st.pinch && !was) bus.emit('pinch', { hand: st.handed, i });
      if (!st.pinch && was) bus.emit('pinchEnd', { hand: st.handed, i });
      st.tip.copy(index.position);
      // palm normal (sign by handedness)
      _a.subVectors(idxM.position, wrist.position); _b.subVectors(pnkM.position, wrist.position);
      st.palmN.crossVectors(_a, _b).normalize(); if (st.handed === 'left') st.palmN.negate();
      // extended fingers? fist = middle tip close to wrist
      const ext = midT.position.distanceTo(wrist.position);
      st.fist = ext < 0.09;
      // thrust: the classic flying pose — open hand reached out in front of you.
      // Measured as wrist reach along the gaze direction; works seated, no palm-sign ambiguity.
      _c.subVectors(wrist.position, headPos);
      const reach = _c.dot(headFwd);
      st.thrust = (!st.fist && ext > 0.13 && reach > 0.30) ? Math.min(1, (reach - 0.30) / 0.18) : 0;
      // ARMREST SIGNS — hand resting low (lap / armrest), no reaching needed:
      //   squeeze a fist = fly · both fists = boost · open hand = slow down · thumb+middle = map · thumb+ring = change view
      st.rest = wrist.position.y < headPos.y - 0.26 && reach < 0.30;
      st.fistT = st.fist && st.rest ? (st.fistT || 0) + dt : 0;
      st.squeeze = st.fistT > 0.22 ? 1 : 0;
      const ringT = h.joints['ring-finger-tip'];
      const dM = thumb.position.distanceTo(midT.position), dR = ringT ? thumb.position.distanceTo(ringT.position) : 1;
      const pm = !st.fist && !st.pinch && (st.pm ? dM < 0.032 : dM < 0.018 && d > 0.03);
      const pr = !st.fist && !st.pinch && !pm && (st.pr ? dR < 0.032 : dR < 0.018 && dM > 0.03);
      if (pm && !st.pm) bus.emit('pinchMid', { i }); if (pr && !st.pr) bus.emit('pinchRing', { i });
      st.pm = pm; st.pr = pr;
      // Wayfinder sign: open hand raised close in front of your face (look at your palm), held ~0.5 s.
      const lateral = Math.sqrt(Math.max(0, _c.lengthSq() - reach * reach));
      const look = !st.fist && !st.pinch && ext > 0.13 && reach > 0.08 && reach < 0.29 && lateral < 0.22 && wrist.position.y > headPos.y - 0.32;
      st.lookT = look ? (st.lookT || 0) + dt : 0;
      if (st.lookT > 0.5 && !st.lookFired) { st.lookFired = true; bus.emit('palmLook', { i, hand: st.handed }); }
      if (!look) st.lookFired = false;
      // WAVE: open hand at shoulder height or above, swinging side to side (3 direction changes within ~1.2 s)
      const up = !st.fist && ext > 0.13 && wrist.position.y > headPos.y - 0.15;
      const vx = wrist.position.x - (st.lastX === undefined ? wrist.position.x : st.lastX); st.lastX = wrist.position.x;
      st.waveT = (st.waveT || 0) + dt;
      if (up && Math.abs(vx) > 0.004) { const sg = Math.sign(vx); if (st.lastSign && sg !== st.lastSign) { st.flips = (st.flips || 0) + 1; st.waveT = 0; } st.lastSign = sg; }
      if (st.waveT > 1.2 || !up) { st.flips = 0; }
      if (st.flips >= 3) { st.flips = 0; bus.emit('wave', { i }); }
    }
    // CAPE SPREAD: both hands raised above your head and spread wide (held ~0.4 s) → cape unfurls (toggle glide)
    const L = this.hands[0].joints && this.hands[0].joints['wrist'], R = this.hands[1].joints && this.hands[1].joints['wrist'];
    const spread = this.state[0].tracked && this.state[1].tracked && L && R && L.position.y > headPos.y + 0.05 && R.position.y > headPos.y + 0.05 && L.position.distanceTo(R.position) > 0.75;
    this.capeT = spread ? (this.capeT || 0) + dt : 0;
    if (this.capeT > 0.4 && !this.capeFired) { this.capeFired = true; bus.emit('capeSpread'); }
    if (!spread) this.capeFired = false;
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
    this.bones.count = nb; this.bones.instanceMatrix.needsUpdate = true;
  }
  thrust() { return Math.max(this.state[0].thrust, this.state[1].thrust, this.state[0].squeeze || 0, this.state[1].squeeze || 0); }
  boost() { return !!(this.state[0].squeeze && this.state[1].squeeze); }
  anyTracked() { return this.state[0].tracked || this.state[1].tracked; }
}
