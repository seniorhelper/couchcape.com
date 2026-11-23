// Seated flight: reach out to fly, look to steer. Built for recliners and beds.
// Comfort: capped acceleration, look-angle steering (rate ∝ head offset),
// pitch clamp, and a speed/turn-driven tunnel vignette.
import * as THREE from 'three';
import { settings, COMFORT } from './core.js';

const _fwd = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class Flight {
  constructor(rig, camera) {
    this.rig = rig; this.camera = camera;
    this.vel = new THREE.Vector3(); this.speed = 0; this.turnVel = 0;
    this.input = 0; // 0..1 thrust from hands / keys / voice / dwell-cruise
    this.cruise = false; // accessibility: toggle steady flight without holding a pose
    this.yawBias = 0;    // recenter: your chair's 'forward' (fixes non-swivel chairs that face off-origin)
    this.vignette = this.makeVignette(); camera.add(this.vignette);
    this.bounds = 400; this.cx = 0; this.cz = 0;   // bounds circle center (moves with the active world)
  }
  makeVignette() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uAmt: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform float uAmt; varying vec2 vUv; void main(){ float r=distance(vUv,vec2(.5))*2.0; float inner=mix(1.2,.45,uAmt); float a=smoothstep(inner,inner+.35,r)*uAmt; gl_FragColor=vec4(0.02,0.04,0.08,a);}'
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat);
    m.position.z = -0.25; m.renderOrder = 999; m.frustumCulled = false;
    return m;
  }
  update(dt) {
    const c = COMFORT[settings.comfort];
    const want = Math.max(this.input, this.cruise ? 0.6 : 0) * c.maxSpeed;
    const a = want > this.speed ? c.accel : c.accel * 1.4; // ease in, settle out
    this.speed += Math.sign(want - this.speed) * Math.min(Math.abs(want - this.speed), a * dt);

    // head orientation relative to the rig
    _e.setFromQuaternion(this.camera.quaternion);
    let yawOff = _e.y - this.yawBias; yawOff = Math.atan2(Math.sin(yawOff), Math.cos(yawOff)); const pitch = THREE.MathUtils.clamp(_e.x, -0.6, 0.6);
    // look-to-steer: only while moving, with a dead zone so small glances don't turn you
    const dead = 0.35, moving = this.speed > 0.5;
    const target = moving && Math.abs(yawOff) > dead ? (yawOff - Math.sign(yawOff) * dead) * c.turnRate : 0;
    this.turnVel += (target - this.turnVel) * Math.min(1, dt * 3);
    this.rig.rotation.y += this.turnVel * dt;

    // direction: rig forward + head pitch (fly where you look, vertically)
    _fwd.set(0, Math.sin(pitch), -Math.cos(pitch)).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.rig.rotation.y);
    this.vel.copy(_fwd).multiplyScalar(this.speed);
    this.rig.position.addScaledVector(this.vel, dt);
    // soft world bounds + ground clearance
    const p = this.rig.position;
    p.y = THREE.MathUtils.clamp(p.y, this.minY ?? 2, 160);
    const dx = p.x - this.cx, dz = p.z - this.cz, r = Math.hypot(dx, dz); if (r > this.bounds) { p.x = this.cx + dx * this.bounds / r; p.z = this.cz + dz * this.bounds / r; }

    // vignette from speed + turning, scaled by comfort setting
    const motion = Math.min(1, this.speed / c.maxSpeed * 0.6 + Math.abs(this.turnVel) * 0.9);
    const u = this.vignette.material.uniforms.uAmt;
    u.value += (motion * c.vignette - u.value) * Math.min(1, dt * 4);
    this.vignette.visible = u.value > 0.01;
  }
}
