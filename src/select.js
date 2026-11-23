// Hero lineup on the plaza stage. Look at a hero to spotlight them; pinch or hold your gaze to choose.
import * as THREE from 'three';
import { POWERS } from './powers.js';

export const HERO_ORDER = ['ribbon', 'chrona', 'prism', 'verdant', 'fold', 'tinker', 'starling'];
export const HERO_FALLBACK_NAMES = { ribbon: 'Rally', chrona: 'Chrona', prism: 'Prisma', verdant: 'Verdant', fold: 'Origa', tinker: 'Tinker Red', starling: 'Starling' };

export let HERO_DEFS = {};
export async function loadHeroes() {
  const mods = await Promise.allSettled([import('./art/heroes-a.js'), import('./art/heroes-b.js')]);
  for (const m of mods) if (m.status === 'fulfilled') Object.assign(HERO_DEFS, m.value.HEROES_A || {}, m.value.HEROES_B || {});
  else console.warn('hero art module failed', m.reason);
  return HERO_DEFS;
}
function fallbackHero(id) {
  const g = new THREE.Group(), c = POWERS[id].color;
  const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 12), mat); body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf1c7a0 })); head.position.y = 1.62;
  g.add(body, head);
  return { group: g, update() {}, cast() {}, gloveColor: c };
}
export function buildHero(id) {
  const d = HERO_DEFS[id];
  try { if (d) return d.build(); } catch (e) { console.warn('hero build failed', id, e); }
  return fallbackHero(id);
}
export function heroName(id) { return (HERO_DEFS[id] && HERO_DEFS[id].name) || HERO_FALLBACK_NAMES[id]; }

function plate(name, power) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.94)'; g.fillRect(0, 0, 512, 160);
  g.fillStyle = '#10213a'; g.font = '800 54px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(name, 256, 70);
  g.font = '600 32px Inter, system-ui, sans-serif'; g.fillStyle = '#d9367a'; g.fillText(power, 256, 122);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.39), new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false, toneMapped: false, depthTest: false }));
  return m;
}

export class Lineup {
  constructor(scene, center, facingTo) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.group.position.copy(center); this.group.lookAt(facingTo.x, center.y, facingTo.z); // +Z of group faces the player
    this.items = [];
    const padMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fe8ff, emissiveIntensity: 0.35, roughness: 0.3 });
    const padGeo = new THREE.CylinderGeometry(0.75, 0.85, 0.18, 40);
    HERO_ORDER.forEach((id, i) => {
      const n = HERO_ORDER.length, a = (i - (n - 1) / 2) * 0.27; // gentle arc, close enough to admire
      const slot = new THREE.Group();
      slot.position.set(Math.sin(a) * 6.5, 0, -Math.cos(a) * 6.5 + 6.5); slot.rotation.y = -a;
      const pad = new THREE.Mesh(padGeo, padMat); pad.position.y = 0.09; slot.add(pad);
      const hero = buildHero(id); hero.group.position.y = 0.18; slot.add(hero.group);
      const pl = plate(heroName(id), POWERS[id].name); pl.position.set(0, 2.85, 0); pl.renderOrder = 990; slot.add(pl);
      // gaze hit volume (cheap invisible capsule)
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1.3; hit.userData = { gazeable: true, dwell: true, dwellTime: 1.8, heroId: id }; slot.add(hit); // longer hold so browsing never auto-picks
      this.group.add(slot); this.items.push({ id, slot, hero, hit, plate: pl });
    });
    this.hover = null;
  }
  get hitTargets() { return this.items.map(i => i.hit); }
  setHover(id) {
    this.hover = id; // scale eased in update()
  }
  choose(id) { const it = this.items.find(x => x.id === id); if (it) it.hero.cast(); }
  update(dt, t) { for (const it of this.items) { it.hero.update(dt, t); const s = it.id === this.hover ? 1.08 : 1; it.slot.scale.x += (s - it.slot.scale.x) * Math.min(1, dt * 8); it.slot.scale.y = it.slot.scale.z = it.slot.scale.x; } }
  dispose() { this.scene.remove(this.group); }
}
