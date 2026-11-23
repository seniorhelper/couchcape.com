// In-world menus (Horizon Store requirements): Settings, Players (mute / block / report), Pause, Exit.
// Big gaze/pinch targets, world-locked in front of you, never head-locked, readable at arm's length.
import * as THREE from 'three';
import { bus, settings, saveSettings } from './core.js';
import { SFX } from './audio.js';

function card(w, h, draw) {
  const c = document.createElement('canvas'); c.width = Math.round(w * 1000); c.height = Math.round(h * 1000);
  const g = c.getContext('2d'); draw(g, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, fog: false, toneMapped: false }));
  m.renderOrder = 997; return m;
}
function button(label, value, accent) {
  return card(0.5, 0.09, (g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = accent; g.fillRect(0, 0, 16, H);
    g.strokeStyle = '#10213a'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = '#10213a'; g.font = '700 40px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText(label, 36, H / 2);
    if (value !== undefined) { g.textAlign = 'right'; g.fillStyle = '#d9367a'; g.fillText(value, W - 28, H / 2); }
  });
}

const COMFORTS = ['comfortable', 'moderate', 'intense'], DIFFS = ['easy', 'medium', 'hard', 'expert'];

export class Menus {
  constructor(scene, camera, rig, net) {
    this.scene = scene; this.camera = camera; this.rig = rig; this.net = net;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.items = []; this.mode = null;
  }
  get gazeTargets() { return this.group.visible ? this.items : []; }
  place() {
    const p = new THREE.Vector3(), f = new THREE.Vector3();
    this.camera.getWorldPosition(p); this.camera.getWorldDirection(f); f.y = 0; f.normalize();
    this.group.position.copy(p).addScaledVector(f, 1.1); this.group.lookAt(p);
  }
  clear() { for (const i of this.items) { this.group.remove(i); i.material.map.dispose(); i.material.dispose(); i.geometry.dispose(); } this.items = []; if (this.title) { this.group.remove(this.title); this.title = null; } }
  header(text) {
    this.title = card(0.5, 0.08, (g, W, H) => { g.fillStyle = '#10213a'; g.fillRect(0, 0, W, H); g.fillStyle = '#7cf4ff'; g.font = '800 44px Inter, system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(text, 24, H / 2); });
    this.title.position.y = 0.06 * (this.rows + 1); this.group.add(this.title);
  }
  layout(rows) { // rows: [{label, value, accent, act}]
    this.rows = rows.length;
    rows.forEach((r, i) => {
      const b = button(r.label, r.value, r.accent || '#7cf4ff');
      b.position.y = 0.06 * (rows.length - 1) - i * 0.105 + 0.02;
      b.userData = { gazeable: true, dwell: true, menuAct: r.act };
      this.group.add(b); this.items.push(b);
    });
  }
  open(mode) {
    this.clear(); this.mode = mode;
    if (mode === 'settings') {
      const s = settings;
      this.layout([
        { label: 'Spoken guide', value: s.voice !== false ? 'ON' : 'OFF', act: () => { s.voice = s.voice === false; bus.emit('setVoice', s.voice); } },
        { label: 'Music', value: (((s.musicVol ?? 0.7) * 10) | 0) + '/10', act: () => { let v = Math.round(((s.musicVol ?? 0.7) + 0.2) * 10) / 10; if (v > 1.01) v = 0; s.musicVol = v; bus.emit('musicVol', v); } },
        { label: 'Comfort', value: s.comfort, act: () => { s.comfort = COMFORTS[(COMFORTS.indexOf(s.comfort) + 1) % 3]; } },
        { label: 'Difficulty', value: s.difficulty, act: () => { s.difficulty = DIFFS[(DIFFS.indexOf(s.difficulty) + 1) % 4]; bus.emit('toast', 'Applies to the next encounter'); } },
        { label: 'Hands-free mode', value: s.handsFree ? 'ON' : 'OFF', act: () => { s.handsFree = !s.handsFree; } },
        { label: 'Reduce effects', value: s.reduceEffects ? 'ON' : 'OFF', act: () => { s.reduceEffects = !s.reduceEffects; } },
        { label: 'Lighter scenery', value: s.perfMode ? 'ON' : 'OFF', act: () => { s.perfMode = !s.perfMode; bus.emit('perfMode', s.perfMode); } },
        { label: 'Seat height', value: (s.heightOffset || 0) >= 0 ? `+${((s.heightOffset || 0) * 100) | 0} cm` : `${((s.heightOffset || 0) * 100) | 0} cm`, act: () => { const v = (s.heightOffset || 0) + 0.1; s.heightOffset = v > 0.31 ? -0.3 : Math.round(v * 10) / 10; bus.emit('heightOffset', s.heightOffset); } },
        { label: 'Done', accent: '#ffd84d', act: () => this.close() }
      ]);
      this.header('Settings');
    } else if (mode === 'players') {
      const rows = [];
      for (const [id, p] of this.net.peers) {
        const name = (p.name || 'Hero') + ' · ' + id.slice(0, 4);
        rows.push({ label: name + (this.net.muted.has(id) ? ' (muted)' : ''), accent: '#9b7bff', act: () => { this.net.muted.has(id) ? this.net.muted.delete(id) : this.net.mute(id); } });
        rows.push({ label: '   Block', accent: '#ffb347', act: () => { this.net.block(id); bus.emit('toast', 'Player blocked'); } });
        rows.push({ label: '   Report', accent: '#ff7fb8', act: () => { this.net.report(id, 'in-game report'); } });
      }
      if (!rows.length) rows.push({ label: 'No other players here yet', act: () => {} });
      rows.push({ label: 'Done', accent: '#ffd84d', act: () => this.close() });
      this.layout(rows.slice(0, 10)); this.header('Players');
    } else if (mode === 'pause') {
      this.layout([
        { label: 'Resume', accent: '#8cff6a', act: () => this.close() },
        { label: 'Settings', act: () => { this.open('settings'); } },
        { label: 'Recenter view', act: () => { bus.emit('recenter'); this.close(); } },
        { label: 'Exit game', accent: '#ff7fb8', act: () => bus.emit('exitGame') }
      ]);
      this.header('Paused');
    }
    this.place(); this.group.visible = true; bus.emit('panelOpen'); bus.emit('menuOpen', mode);
  }
  activate(hit) {
    const act = hit && hit.userData.menuAct; if (!act) return false;
    SFX.select(); act(); saveSettings();
    if (this.group.visible && this.mode !== 'pause' && this.mode) { const m = this.mode; this.open(m); } // refresh values
    return true;
  }
  close() { this.group.visible = false; this.mode = null; bus.emit('menuClose'); }
}
