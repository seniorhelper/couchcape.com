// CouchCape gfx: shadows.
//  addContactShadow(obj, radius, {opacity, y}) - soft blob/contact decal under a character or prop (1 draw, shared texture+material)
//  ShadowArea - ONE optional small-area directional shadow map (1024, tight ortho frustum that follows a target, texel-snapped
//  so it doesn't shimmer). Only meshes you flag cast/receive. Default ON only for the hero stage.
import * as THREE from 'three';

const ORIGIN = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
let blobTex = null, blobGeo = null;
const blobMats = new Map();
function blobTexture() {
  if (blobTex) return blobTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // tight dark core (contact) + wide soft falloff (ambient occlusion)
  gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.22, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  blobTex = new THREE.CanvasTexture(c); blobTex.generateMipmaps = true; blobTex.minFilter = THREE.LinearMipmapLinearFilter; blobTex.anisotropy = 4;
  return blobTex;
}
export function addContactShadow(obj, radius = 0.5, { opacity = 0.55, y = 0.01, color = 0x1a1030 } = {}) {
  if (!blobGeo) { blobGeo = new THREE.PlaneGeometry(2, 2); blobGeo.rotateX(-Math.PI / 2); }
  const key = `${opacity}|${color}`;
  if (!blobMats.has(key)) blobMats.set(key, new THREE.MeshBasicMaterial({ map: blobTexture(), color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true, toneMapped: false }));
  const m = new THREE.Mesh(blobGeo, blobMats.get(key));
  m.scale.setScalar(radius); m.position.y = y; m.renderOrder = 1; m.name = 'contact-shadow'; m.userData.matLocked = true;
  obj.add(m);
  return m;
}

export class ShadowArea {
  constructor(renderer, sun, { size = 1024, extent = 6, depth = 60 } = {}) {
    this.renderer = renderer; this.sun = sun; this.extent = extent; this.size = size;
    this.target = null; this.casters = []; this.receivers = []; this.enabled = false; this.quality = 'auto';
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = true;
    const s = sun.shadow; s.mapSize.set(size, size); s.bias = -0.0004; s.normalBias = 0.025; s.radius = 1;
    const cam = s.camera; cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent; cam.near = 1; cam.far = depth + 120; cam.updateProjectionMatrix();
    sun.castShadow = false;
    // refresh the map every `every` frames (2 = 36 Hz at 72 Hz): idle animation still reads, pass cost halves
    this.every = 2; this._f = 0; s.autoUpdate = false;
    this._p = new THREE.Vector3(); this._ls = new THREE.Matrix4(); this._li = new THREE.Matrix4(); this._v = new THREE.Vector3();
  }
  // follow: an Object3D (player rig or hero stage group); casters/receivers: Object3D roots to flag
  // minRadius: skip tiny parts (buttons, gems, straps) - they cost a draw each and are invisible in a 1024 map
  use({ follow, casters = [], receivers = [], minRadius = 0.14 }) {
    this.target = follow;
    for (const c of casters) c.traverse((o) => {
      if (!o.isMesh || o.name === 'contact-shadow' || !o.geometry || (o.material && o.material.transparent)) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const s = o.getWorldScale(this._v); const r = o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z);
      if (r < minRadius) return;
      o.castShadow = true; this.casters.push(o);
    });
    for (const r of receivers) r.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; this.receivers.push(o); } });
    return this;
  }
  setEnabled(on) {
    on = on && this.quality !== 'off';
    if (on === this.enabled) return; this.enabled = on;
    this.sun.castShadow = on; // one-time program variant switch; warm both with renderer.compile at boot (see INTEGRATE.md)
  }
  setQuality(q) { this.quality = q; if (q === 'off') this.setEnabled(false); if (q === 'low') { this.sun.shadow.mapSize.set(512, 512); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } } }
  // call every frame (cheap): centre the frustum on the target, snapped to whole shadow texels along the light axes
  update(rig) {
    if (!this.enabled || !this.target) return;
    if (++this._f >= this.every) { this._f = 0; this.sun.shadow.needsUpdate = true; }
    this.target.getWorldPosition(this._p);
    const d = rig.sunDir; const texel = (this.extent * 2) / this.sun.shadow.mapSize.x;
    this._ls.lookAt(ORIGIN, this._v.copy(d).negate(), UP); // light-space basis
    this._li.copy(this._ls).invert();
    const p = this._p.applyMatrix4(this._li); p.x = Math.round(p.x / texel) * texel; p.y = Math.round(p.y / texel) * texel; p.applyMatrix4(this._ls);
    rig.pivot.copy(p); rig.placeSun();
  }
}
