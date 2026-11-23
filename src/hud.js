// Heart HUD: world-space panel that lazily follows your view (never head-locked).
// Redraws its canvas only when values change.
import * as THREE from 'three';
import { bus } from './core.js';

const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.3);
  g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  g.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  g.closePath();
}

export class HUD {
  constructor(camera, rig) {
    this.camera = camera; this.rig = rig;
    this.cv = document.createElement('canvas'); this.cv.width = 1024; this.cv.height = 192;
    this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, fog: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.135), mat);
    this.mesh.renderOrder = 998;
    rig.add(this.mesh);
    this.yaw = 0; this.toast = ''; this.toastT = 0;
    // dialog / subtitles panel (guide lines, taunts) — below eye line, readable size
    this.dc = document.createElement('canvas'); this.dc.width = 1024; this.dc.height = 220;
    this.dg = this.dc.getContext('2d');
    this.dtex = new THREE.CanvasTexture(this.dc); this.dtex.colorSpace = THREE.SRGBColorSpace;
    this.dlg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.193), new THREE.MeshBasicMaterial({ map: this.dtex, transparent: true, depthTest: false, fog: false, toneMapped: false }));
    this.dlg.renderOrder = 998; this.dlg.visible = false; rig.add(this.dlg); this.dlgT = 0;
    bus.on('say', ({ who, text, secs }) => this.sayDraw(who, text, secs));
    bus.on('hud', h => this.draw(h));
    bus.on('toast', t => { this.toast = t; this.toastT = 2.5; if (this.last) this.draw(this.last); });
  }
  draw(h) {
    this.last = h;
    const g = this.g; g.clearRect(0, 0, 1024, 192);
    g.fillStyle = 'rgba(16,33,58,0.55)'; g.fillRect(0, 0, 1024, 120);
    for (let i = 0; i < h.containers; i++) {
      const x = 48 + i * 70, y = 22, s = 66;
      heartPath(g, x, y, s); g.fillStyle = '#3a2440'; g.fill();
      const fill = THREE.MathUtils.clamp(h.hp - i, 0, 1);
      if (fill > 0) {
        g.save(); heartPath(g, x, y, s); g.clip();
        g.fillStyle = '#ff4f8b'; g.fillRect(x - s * 0.5, y, s * fill, s); g.restore();
      }
      heartPath(g, x, y, s); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
    }
    g.fillStyle = '#fff'; g.font = '700 44px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText('✦ ' + h.sparks, 640, 60);
    g.fillText('↻ ' + Math.max(0, h.comebacks), 860, 60);
    if (this.toast) {
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(140, 132, 744, 56);
      g.fillStyle = '#10213a'; g.font = '700 34px Inter, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(this.toast, 512, 161); g.textAlign = 'left';
    }
    this.tex.needsUpdate = true;
  }
  sayDraw(who, text, secs) {
    const g = this.dg; g.clearRect(0, 0, 1024, 220);
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(0, 0, 1024, 220);
    g.fillStyle = who === 'Echo' || text.startsWith('Echo:') ? '#8a5cff' : '#ff4f8b'; g.fillRect(0, 0, 14, 220);
    g.fillStyle = '#10213a'; g.font = '800 34px Inter, system-ui, sans-serif'; g.fillText(who, 34, 48);
    g.font = '500 32px Inter, system-ui, sans-serif';
    // word wrap
    const words = text.split(' '); let line = '', y = 98;
    for (const w of words) { const test = line + w + ' '; if (g.measureText(test).width > 950 && line) { g.fillText(line, 34, y); line = w + ' '; y += 40; } else line = test; }
    g.fillText(line, 34, y);
    this.dtex.needsUpdate = true; this.dlg.visible = true; this.dlgT = secs;
  }
  update(dt) {
    if (this.dlgT > 0) { this.dlgT -= dt; if (this.dlgT <= 0) this.dlg.visible = false; }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) { this.toast = ''; if (this.last) this.draw(this.last); } }
    // lazy follow: only re-center when you look more than ~35° away
    _e.setFromQuaternion(this.camera.quaternion);
    let d = _e.y - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 0.6) this.yaw += d * Math.min(1, dt * 3);
    _f.set(Math.sin(this.yaw) * -1, 0, -Math.cos(this.yaw));
    _p.copy(this.camera.position).addScaledVector(_f, 1.4); _p.y += 0.42;
    this.mesh.position.lerp(_p, Math.min(1, dt * 8));
    this.mesh.lookAt(this.camera.position.x, this.mesh.position.y - 0.25, this.camera.position.z);
    if (this.dlg.visible) {
      _p.copy(this.camera.position).addScaledVector(_f, 1.3); _p.y -= 0.38;
      this.dlg.position.lerp(_p, Math.min(1, dt * 8));
      this.dlg.lookAt(this.camera.position.x, this.dlg.position.y + 0.3, this.camera.position.z);
    }
  }
}
