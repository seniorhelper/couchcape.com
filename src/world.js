// Starter world "Skyward Isles": gradient sky dome, instanced floating islands,
// instanced clouds, spark rings. ~8 draw calls total. Baked-style lighting.
import * as THREE from 'three';

function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildWorld(scene) {
  const R = rand(20261122);
  scene.background = new THREE.Color(0xbfe9ff);
  scene.fog = new THREE.Fog(0xcdeeff, 120, 420);

  // sky dome with sun glow
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { sun: { value: new THREE.Vector3(0.4, 0.35, -0.85).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform vec3 sun; varying vec3 vD;
      void main(){ float h=clamp(vD.y*.5+.5,0.,1.);
        vec3 top=vec3(.33,.62,.98), mid=vec3(.74,.9,1.), low=vec3(1.,.86,.93);
        vec3 c=mix(low,mid,smoothstep(.35,.55,h)); c=mix(c,top,smoothstep(.55,.95,h));
        float s=max(dot(vD,sun),0.); c+=vec3(1.,.9,.7)*(pow(s,350.)*1.2+pow(s,12.)*.18);
        gl_FragColor=vec4(c,1.);}`
  }));
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xdff4ff, 0x8a6a7a, 1.1));
  const sunL = new THREE.DirectionalLight(0xfff1d6, 1.6); sunL.position.set(40, 60, -80); scene.add(sunL);

  // floating islands: grass cap + rock underside, vertex-colored, instanced
  const cap = new THREE.CylinderGeometry(1, 0.92, 0.35, 9, 1);
  const rock = new THREE.ConeGeometry(0.92, 1.6, 9, 3); rock.rotateX(Math.PI); rock.translate(0, -0.97, 0);
  const pos = rock.attributes.position; // jitter rock for a hand-made look
  for (let i = 0; i < pos.count; i++) { if (pos.getY(i) < -0.2) { pos.setX(i, pos.getX(i) * (0.8 + R() * 0.4)); pos.setZ(i, pos.getZ(i) * (0.8 + R() * 0.4)); } }
  rock.computeVertexNormals();
  const N = 46;
  const grass = new THREE.InstancedMesh(cap, new THREE.MeshStandardMaterial({ color: 0x7fdc8a, roughness: 0.9, flatShading: true }), N);
  const under = new THREE.InstancedMesh(rock, new THREE.MeshStandardMaterial({ color: 0xb48a9c, roughness: 1, flatShading: true }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const islands = [];
  for (let i = 0; i < N; i++) {
    const a = R() * Math.PI * 2, r = 30 + R() * 330, sc = 4 + R() * 16;
    p.set(Math.cos(a) * r, 10 + R() * 90, Math.sin(a) * r);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, R() * 6.28); s.set(sc, sc * (0.7 + R() * 0.5), sc);
    m.compose(p, q, s); grass.setMatrixAt(i, m); under.setMatrixAt(i, m);
    islands.push({ p: p.clone(), r: sc });
  }
  scene.add(grass, under);

  // clouds: soft white puffs, instanced
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const clouds = new THREE.InstancedMesh(puff, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe6eefa, emissiveIntensity: 0.55, roughness: 1, flatShading: true }), 140);
  let ci = 0;
  for (let c = 0; c < 28; c++) {
    const cx = (R() - 0.5) * 700, cy = 40 + R() * 110, cz = (R() - 0.5) * 700;
    for (let k = 0; k < 5; k++) {
      const sc = 6 + R() * 9; p.set(cx + (R() - 0.5) * 22, cy + (R() - 0.5) * 5, cz + (R() - 0.5) * 12);
      s.set(sc * 1.4, sc * 0.75, sc); m.compose(p, q.identity(), s); clouds.setMatrixAt(ci++, m);
    }
  }
  scene.add(clouds);

  // sea far below
  const sea = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshStandardMaterial({ color: 0x5ec8e8, roughness: 0.35, metalness: 0.1 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -30; scene.add(sea);

  // spark rings (fly-through rewards) — instanced; collected rings scale to 0
  const RN = 24;
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(2.2, 0.22, 10, 40),
    new THREE.MeshStandardMaterial({ color: 0xffd84d, emissive: 0xffb300, emissiveIntensity: 0.6, roughness: 0.3 }), RN);
  const ringData = [];
  let ang = 0, rad = 40, h = 30;
  for (let i = 0; i < RN; i++) {
    ang += 0.32; rad += 3; h += Math.sin(i * 0.7) * 4;
    p.set(Math.cos(ang) * rad, h, Math.sin(ang) * rad - 20);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -ang); m.compose(p, q, s.set(1, 1, 1));
    rings.setMatrixAt(i, m); ringData.push({ p: p.clone(), q: q.clone(), got: false });
  }
  scene.add(rings);

  return {
    islands, rings, ringData,
    collectRing(i) { const d = ringData[i]; d.got = true; m.compose(d.p, d.q, s.set(0, 0, 0)); rings.setMatrixAt(i, m); rings.instanceMatrix.needsUpdate = true; },
    resetRings() { ringData.forEach((d, i) => { d.got = false; m.compose(d.p, d.q, s.set(1, 1, 1)); rings.setMatrixAt(i, m); }); rings.instanceMatrix.needsUpdate = true; }
  };
}
