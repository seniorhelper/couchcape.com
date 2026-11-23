// Story layer: guide lines (with optional spoken narration), district missions,
// verified real-world facts, rescue "Glimmerlings" (kindness = Heart Shards),
// and the reflection choice before the final seal. Lessons are breadcrumbs, never lectures.
import * as THREE from 'three';
import { bus } from './core.js';
import { SFX } from './audio.js';

export const GUIDE = 'Odessa';

// Facts are kept to well-established, widely verified statements.
export const DISTRICTS = {
  bloom:     { name: 'Bloom Gardens',    sub: 'Blossom terraces', color: '#ff7fb8', foes: 4,
               fact: 'Fun fact: a honeybee can visit 50 to 100 flowers on a single trip out of the hive.',
               rescue: 'Thank you! I was too scared to ask for help.', lesson: 'Helping without being asked — that is real strength.' },
  clockwork: { name: 'Clockwork Spires', sub: 'Turning towers',   color: '#d9a650', foes: 5,
               fact: 'Fun fact: sunlight takes about 8 minutes and 20 seconds to travel from the Sun to Earth.',
               rescue: 'You came back for me? Nobody ever comes back.', lesson: 'Patience beats showing off. Every time.' },
  prism:     { name: 'Prism Falls',      sub: 'Crystal cliffs',   color: '#9b7bff', foes: 5,
               fact: 'Fun fact: a rainbow forms when sunlight bends and reflects inside raindrops, splitting into colors.',
               rescue: 'The Echoes said I wasn\'t worth saving. They were wrong.', lesson: 'Echoes lie. Honest friends tell you the truth kindly.' },
  skyharbor: { name: 'Skyharbor',        sub: 'Airship docks',    color: '#4fc3ff', foes: 6,
               fact: 'Fun fact: bar-tailed godwits can fly more than 11,000 kilometers nonstop across the Pacific Ocean.',
               rescue: 'You shared your light with me. I\'ll pass it on.', lesson: 'Generous heroes make more heroes. A full heart beats a full wallet.' }
};

const RESCUE_LINES = ['You noticed me! Most people walk right past.', 'I thought I wasn\'t worth the trip. Thank you.', 'I\'ll pay it forward — promise!', 'You didn\'t even ask for anything in return.'];
export const LINES = {
  welcome: 'Welcome to Aurelia. Something is wrong with the mirrors — every reflection has turned cruel, telling people they\'re not enough. Pick a hero, and let\'s fix it together.',
  picked: hero => `${hero}! Good choice. Reach a hand out in front of you to fly. Look where you want to go.`,
  wayfinder: 'To travel anywhere, raise an open hand and look at your palm. Then look at a place and pinch — or just hold your gaze.',
  firstRaid: 'Mirror Echoes! Look at one and pinch to use your power. When one glows, it\'s about to throw — tilt your head to dodge.',
  bossUnlocked: 'You\'ve cleared enough of the city. The Silvered Ring is open. The Ever-Glass is waiting.',
  reflection: 'The Ever-Glass is showing you your own reflection. Be honest. What do you see?',
  win: 'You did it. Not by being the strongest or the richest — by being honest with yourself. You were always enough. Aurelia is free.',
  seams: 'The Seams are open — doorways to other worlds the Ever-Glass has touched. Raise your palm and choose Other Worlds.',
  worldDone: name => `${name} is restored! Every world you heal makes Aurelia shine brighter.`,
  taunt: t => `Echo: "${t}"`
};

// ---------- spoken narration (free, on-device, optional) ----------
let voiceOn = true;
export function setVoice(on) { voiceOn = on; if (!on && 'speechSynthesis' in window) speechSynthesis.cancel(); }
export function say(text, who = GUIDE, secs = 0) {
  bus.emit('say', { who, text, secs: secs || Math.min(9, 2.5 + text.length * 0.055) });
  if (voiceOn && who === GUIDE && 'speechSynthesis' in window) {
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; u.pitch = 1.05; speechSynthesis.speak(u); } catch (e) {}
  }
}

// ---------- Glimmerlings: tiny lost citizens to rescue ----------
export class Glimmerlings {
  constructor(scene) {
    this.scene = scene; this.list = [];
    this.geo = new THREE.SphereGeometry(0.45, 20, 14);
    this.eyeGeo = new THREE.SphereGeometry(0.07, 8, 6);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x10213a });
    this.haloGeo = new THREE.TorusGeometry(0.75, 0.05, 8, 32);
  }
  spawn(id, pos, color) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(color), emissiveIntensity: 0.9, roughness: 0.4 });
    const g = new THREE.Group(); const body = new THREE.Mesh(this.geo, mat); g.add(body);
    const e1 = new THREE.Mesh(this.eyeGeo, this.eyeMat), e2 = e1.clone(); e1.position.set(-0.15, 0.08, 0.4); e2.position.set(0.15, 0.08, 0.4); g.add(e1, e2);
    const halo = new THREE.Mesh(this.haloGeo, new THREE.MeshBasicMaterial({ color })); halo.rotation.x = Math.PI / 2; halo.position.y = 0.7; g.add(halo);
    g.position.copy(pos); g.userData = { gazeable: true, dwell: true, glimmer: true, id, saved: false, base: pos.clone(), t: Math.random() * 6 };
    this.scene.add(g); this.list.push(g); return g;
  }
  rescue(g) {
    if (g.userData.saved) return false;
    g.userData.saved = true; SFX.container();
    const d = DISTRICTS[g.userData.id];
    if (d) { say(d.rescue, 'Glimmerling', 4); setTimeout(() => say(d.lesson), 4200); }
    else say(RESCUE_LINES[(Math.random() * RESCUE_LINES.length) | 0], 'Glimmerling', 4);
    bus.emit('rescued', g.userData.id); return true;
  }
  update(dt, head) {
    for (const g of this.list) {
      const u = g.userData; u.t += dt;
      if (u.saved) { g.position.y += dt * 3; g.scale.multiplyScalar(1 - dt * 0.4); if (g.scale.x < 0.05 && g.parent) this.scene.remove(g); continue; }
      const hop = u.hop > 0 ? Math.sin((1.2 - u.hop) / 1.2 * Math.PI) * 1.2 : 0; if (u.hop > 0) u.hop -= dt;
      g.position.set(u.base.x, u.base.y + Math.sin(u.t * 1.6) * 0.4 + hop, u.base.z);
      g.lookAt(head.x, g.position.y, head.z); if (u.hop > 0) g.rotateY((1.2 - u.hop) * Math.PI * 1.67);
    }
  }
  // Hand-hello: nearby Glimmerlings do a happy spin-hop when you wave at them
  waveBack(head) { let n = 0; for (const g of this.list) { if (g.userData.saved) continue; if (g.position.distanceToSquared(head) < 40 * 40) { g.userData.hop = 1.2; n++; } } return n; }
  get targets() { return this.list.filter(g => !g.userData.saved); }
}

// ---------- Choice panel (reflection moment) ----------
export class ChoicePanel {
  constructor(scene, camera) { this.scene = scene; this.camera = camera; this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group); this.buttons = []; }
  show(options, cb) { // [{label, value, color}], cb(value)
    this.cb = cb || null;
    for (const b of this.buttons) this.group.remove(b); this.buttons = [];
    options.forEach((o, i) => {
      const c = document.createElement('canvas'); c.width = 768; c.height = 192; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 768, 192); g.strokeStyle = o.color; g.lineWidth = 14; g.strokeRect(7, 7, 754, 178);
      g.fillStyle = '#10213a'; g.font = '700 46px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(o.label, 384, 112);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.16), new THREE.MeshBasicMaterial({ map: t, depthTest: false, fog: false, toneMapped: false })); m.renderOrder = 996;
      m.position.set(0, (options.length - 1) * 0.14 - i * 0.28, 0); // gap at gaze center m.userData = { gazeable: true, dwell: true, choice: o.value };
      this.group.add(m); this.buttons.push(m);
    });
    const p = new THREE.Vector3(), f = new THREE.Vector3();
    this.camera.getWorldPosition(p); this.camera.getWorldDirection(f); f.y = 0; f.normalize();
    this.group.position.copy(p).addScaledVector(f, 1.2); this.group.position.y += 0.12; // above the subtitle panel this.group.lookAt(p);
    this.group.visible = true; bus.emit('panelOpen');
  }
  hide() { this.group.visible = false; }
}
