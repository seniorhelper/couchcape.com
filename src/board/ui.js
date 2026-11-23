// Skyboard diegetic UI: canvas-texture panels and buttons that sit beside the table (never head-locked).
// Panels redraw only when their content changes. All text is big and high-contrast; fog:false, depthTest:false.
import * as THREE from 'three';

export const FONT = 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
export const INK = '#10213a';

export function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
// Fit text into a box by shrinking the font until it fits.
export function fitText(g, text, x, y, w, h, size, weight = 600, color = INK, align = 'left', lh = 1.22) {
  let lines; let s = size;
  for (; s > 18; s -= 2) { g.font = `${weight} ${s}px ${FONT}`; lines = wrap(g, text, w); if (lines.length * s * lh <= h) break; }
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'top';
  const ax = align === 'center' ? x + w / 2 : x;
  lines.forEach((l, i) => g.fillText(l, ax, y + i * s * lh));
  return lines.length * s * lh;
}
export function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export class Panel {
  constructor(w, h, pw, ph, order = 990) {
    this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h; this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    this.mesh.renderOrder = order; this.key = '';
  }
  // draw(fn, key): skips the redraw (and texture upload) when key is unchanged
  draw(fn, key) { if (key !== undefined && key === this.key) return; this.key = key; this.g.clearRect(0, 0, this.cv.width, this.cv.height); fn(this.g, this.cv.width, this.cv.height); this.tex.needsUpdate = true; }
}

// A pinch / gaze-dwell button. userData.board routes activation back to the BoardGame.
export class Button extends Panel {
  constructor(i, pw = 0.30, ph = 0.0703, cw = 640, ch = 150) {
    super(cw, ch, pw, ph, 993);
    this.i = i; this.label = ''; this.color = '#ff4f8b'; this.hover = false; this.picked = false; this.enabled = true;
    this.mesh.userData = { gazeable: true, dwell: true, dwellTime: 1.1, board: { type: 'btn', i } };
  }
  set(label, color, enabled = true) { this.label = label; this.color = color || '#ff4f8b'; this.enabled = enabled; this.picked = false; this.redraw(); }
  redraw() {
    const { label, color, hover, picked, enabled } = this;
    this.draw((g, W, H) => {
      rrect(g, 6, 6, W - 12, H - 12, 34);
      g.fillStyle = picked ? color : hover ? '#fff6fb' : '#ffffff'; g.globalAlpha = enabled ? 1 : 0.55; g.fill();
      g.lineWidth = hover || picked ? 14 : 9; g.strokeStyle = color; g.stroke(); g.globalAlpha = 1;
      fitText(g, label, 30, H * 0.17, W - 60, H * 0.7, Math.round(H * 0.31), 800, picked ? '#ffffff' : INK, 'center', 1.1);
    }, [label, color, hover, picked, enabled].join('|'));
  }
  setHover(h) { if (h !== this.hover) { this.hover = h; this.redraw(); } }
}

// ---------- icons (shared by track decals, cards and status panel) ----------
export function drawIcon(g, kind, x, y, s, color = '#ffffff') {
  g.save(); g.translate(x, y); g.scale(s / 100, s / 100); g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  const heart = (cx, cy, r) => { g.beginPath(); g.moveTo(cx, cy + r * 0.9); g.bezierCurveTo(cx - r * 1.4, cy - r * 0.1, cx - r * 0.7, cy - r * 1.2, cx, cy - r * 0.45); g.bezierCurveTo(cx + r * 0.7, cy - r * 1.2, cx + r * 1.4, cy - r * 0.1, cx, cy + r * 0.9); g.fill(); };
  switch (kind) {
    case 'gate': g.beginPath(); g.moveTo(-30, 34); g.lineTo(-30, -6); g.arc(0, -6, 30, Math.PI, 0); g.lineTo(30, 34); g.stroke(); g.beginPath(); g.moveTo(-42, 36); g.lineTo(42, 36); g.stroke(); break;
    case 'help': heart(0, 0, 30); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-4, -18, 8, 30); g.fillRect(-15, -7, 30, 8); break;
    case 'kind': heart(-14, 4, 18); heart(16, -6, 16); break;
    case 'fact': g.beginPath(); g.arc(0, -10, 24, Math.PI * 0.8, Math.PI * 2.2); g.stroke(); g.fillRect(-11, 18, 22, 8); g.fillRect(-8, 30, 16, 6); break;
    case 'echo': g.beginPath(); g.arc(0, 0, 32, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(-11, -6, 6, 0, 7); g.arc(11, -6, 6, 0, 7); g.fill(); g.beginPath(); g.arc(0, 10, 12, 0.2, Math.PI - 0.2); g.stroke(); break;
    case 'power': g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 15 : 38; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); break;
    case 'portal': g.beginPath(); for (let i = 0; i < 60; i++) { const a = i * 0.32, r = 4 + i * 0.55; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); break;
    case 'shard': g.beginPath(); g.moveTo(0, -38); g.lineTo(22, -6); g.lineTo(8, 36); g.lineTo(-14, 30); g.lineTo(-22, -4); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -38); g.lineTo(2, 34); g.stroke(); break;
    case 'glim': g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 12 : 34; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); break;
    case 'heart': heart(0, 0, 30); break;
    case 'clock': g.beginPath(); g.arc(0, 0, 32, 0, 7); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -20); g.moveTo(0, 0); g.lineTo(14, 8); g.stroke(); break;
  }
  g.restore();
}
