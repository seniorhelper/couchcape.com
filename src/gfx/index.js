// CouchCape graphics engine entry point. See INTEGRATE.md for the exact main.js calls.
import * as THREE from 'three';
import { setupLighting, PRESETS } from './lighting.js';
import { realStarSky as _realStarSky } from './sky.js';
import { addContactShadow, ShadowArea } from './shadows.js';
import { applyMaterials as _apply, upgradeCity as _upgradeCity, rimify, managedMaterials, updateMaterials, asteroidGeometry, materialFor, RECIPES } from './materials.js';
import { getTextureSet, triplanar, textureCacheInfo } from './textures.js';

export { addContactShadow, rimify, asteroidGeometry, getTextureSet, triplanar, materialFor, RECIPES, PRESETS, textureCacheInfo };

let G = null; // engine state

// level sky name (LEVEL.sky) -> preset
export const SKY_TO_PRESET = { day: 'aurelia-day', dusk: 'dusk', 'real-stars': 'space', 'neon-night': 'neon', clay: 'clay-studio', paradox: 'paradox' };

export function initGfx({ scene, renderer, camera, preset = 'aurelia-day', quality = 'high' } = {}) {
  if (G) return G.api;
  const rig = setupLighting(scene, renderer, { preset });
  const shadow = new ShadowArea(renderer, rig.sun, { size: quality === 'low' ? 512 : 1024, extent: 6 });
  G = { scene, renderer, camera, rig, shadow, stars: null, quality, hud: null, stage: null };
  rig.onPreset((name, p) => {
    for (const m of managedMaterials()) m.envMapIntensity = (m.userData.envBase ?? 1) * p.env;
    syncStars(p);
  });
  setPreset(preset); // re-run now that listeners are attached (stars, env intensities)
  if (location.search.includes('fps')) G.hud = perfHud(renderer, camera);
  G.api = { setPreset, applyMaterials, upgradeCity, addContactShadow, realStarSky, rimify, setupHeroStage, setShadowQuality, setHeroStageVisible, update, rig, shadow, asteroidGeometry };
  return G.api;
}

function syncStars(p) {
  if (!G) return;
  const want = p.sky === 'stars' || p.stars;
  if (want && !G.stars) G.stars = _realStarSky(G.scene, { renderer: G.renderer, quality: G.quality === 'high' ? 'medium' : 'low', milkyWay: p.sky === 'stars' ? 1 : 0, gain: p.sky === 'stars' ? 1 : 0.55 });
  if (G.stars) { G.stars.setVisible(!!want); G.stars.setGain(p.sky === 'stars' ? 1 : 0.55); G.stars.setLimit(p.sky === 'stars' ? 8 : 4.5); }
}

/** Switch lighting + sky + env + fog + tone mapping. name = preset name or a LEVEL.sky value. */
export function setPreset(name) {
  if (!G) throw new Error('initGfx first');
  G.rig.setPreset(SKY_TO_PRESET[name] || name);
  // tone all non-gfx standard materials' env reflections to the preset too (one traversal per switch, not per frame)
  const k = PRESETS[G.rig.preset].env;
  G.scene.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !managedMaterials().has(o.material)) { if (o.material.userData.envBase === undefined) o.material.userData.envBase = o.material.envMapIntensity; o.material.envMapIntensity = o.material.userData.envBase * Math.min(1, k + 0.15); } });
  return G.rig.preset;
}
export function applyMaterials(root) { const r = _apply(root); if (G) { const k = PRESETS[G.rig.preset].env; for (const m of managedMaterials()) m.envMapIntensity = (m.userData.envBase ?? 1) * k; } return r; }
export function upgradeCity(cityRoot) { const n = _upgradeCity(cityRoot, G ? G.rig : null); if (G) { const k = PRESETS[G.rig.preset].env; for (const m of managedMaterials()) m.envMapIntensity = (m.userData.envBase ?? 1) * k; } return n; }
export function realStarSky(scene, opts = {}) { return _realStarSky(scene, { renderer: G ? G.renderer : null, ...opts }); }

/** Hero stage: contact shadows + rims + the one small shadow map (default ON here only). lineup = select.js Lineup. */
export function setupHeroStage(lineup, { cityRoot = null, shadows = true } = {}) {
  const casters = [], receivers = [];
  for (const it of lineup.items) {
    addContactShadow(it.hero.group, 0.5, { opacity: 0.5, y: 0.005 });
    rimify(it.hero.group, it.hero.gloveColor ?? 0xffffff, { strength: 0.35, power: 3.2 });
    casters.push(it.hero.group);
    it.slot.children.forEach((c) => { if (c.isMesh && c.geometry && c.geometry.type === 'CylinderGeometry' && !c.userData.gazeable) receivers.push(c); });
  }
  if (cityRoot) cityRoot.traverse((o) => { if (o.userData && o.userData.gfxPlaza) receivers.push(o); });
  G.stage = lineup;
  G.shadow.use({ follow: lineup.group, casters, receivers });
  G.shadow.setEnabled(shadows);
}
export function setHeroStageVisible(v) { if (G && G.stage) G.shadow.setEnabled(v && G.shadow.quality !== 'off'); }
export function setShadowQuality(q) { if (G) G.shadow.setQuality(q); } // 'auto' | 'low' (512) | 'off'

/** Per frame (allocation-free). */
export function update(dt, t) {
  if (!G) return;
  G.rig.update(dt, t);
  G.shadow.update(G.rig);
  updateMaterials(dt, t);
  if (G.hud) G.hud.update(dt);
}

// ------------------------------------------------------------------ perf HUD (?fps)
function perfHud(renderer, camera) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;font:12px ui-monospace,monospace;color:#0f8;background:#000a;padding:4px 7px;border-radius:4px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  // in-headset copy: tiny canvas panel hung below the view (debug only)
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, fog: false, toneMapped: false }));
  panel.position.set(0, -0.28, -0.7); panel.renderOrder = 999; panel.userData.matLocked = true; camera.add(panel);
  let acc = 0, frames = 0, worst = 0;
  return {
    update(dt) {
      acc += dt; frames++; worst = Math.max(worst, dt);
      if (acc < 0.5) return;
      const fps = frames / acc, i = renderer.info.render;
      const txt = `${fps.toFixed(0)} fps  worst ${(worst * 1000).toFixed(0)}ms\n${i.calls} calls  ${(i.triangles / 1000).toFixed(0)}k tris`;
      el.textContent = txt;
      g.clearRect(0, 0, 256, 64); g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(0, 0, 256, 64); g.fillStyle = fps >= 70 ? '#3f8' : fps >= 60 ? '#fd4' : '#f84';
      g.font = '20px monospace'; txt.split('\n').forEach((l, k) => g.fillText(l, 8, 26 + k * 26)); tex.needsUpdate = true;
      panel.visible = renderer.xr.isPresenting;
      acc = 0; frames = 0; worst = 0;
    },
  };
}
