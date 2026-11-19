// Bright toon space (adapted from Space Carrier world.js): gradient sky dome, star field, soft nebula glows, two restyled CC0 planets.
import * as THREE from 'three';

export function toonRamp() {
  const d = new Uint8Array([110, 185, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}
export const RAMP = toonRamp();
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: RAMP, ...extra });

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function glowTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)')); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildWorld(scene, planets) {
  scene.background = new THREE.Color(0x24357f);
  // sky dome: bright indigo overhead to blue-violet at the horizon, with a warm glow toward the sun
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x1d2b78) }, mid: { value: new THREE.Color(0x4a4fc4) }, bot: { value: new THREE.Color(0x2a7fd0) },
      sunDir: { value: new THREE.Vector3(-0.5, 0.45, -0.7).normalize() }, sunCol: { value: new THREE.Color(0xffb36b) } },
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vd;
      void main(){ float h = vd.y; vec3 c = h > 0. ? mix(mid, top, smoothstep(0., .7, h)) : mix(mid, bot, smoothstep(0., .6, -h));
        float s = max(dot(vd, sunDir), 0.); c += sunCol * (pow(s, 6.) * .45 + pow(s, 60.) * .8); gl_FragColor = vec4(c, 1.); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3400, 32, 16), skyMat); sky.renderOrder = -2; sky.frustumCulled = false; scene.add(sky);

  // stars: one Points draw call, sized in screen pixels
  const r = rng(11), N = 1600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const tint = [new THREE.Color(0xffffff), new THREE.Color(0xbfe0ff), new THREE.Color(0xfff0b8)];
  for (let i = 0; i < N; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 3000;
    pos.set([Math.cos(a) * s * R, u * R, Math.sin(a) * s * R], i * 3);
    tint[i % 3].toArray(col, i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
  stars.renderOrder = -1; stars.frustumCulled = false; scene.add(stars);

  // nebula glows (additive sprites far away)
  const neb = [[0xff6fd8, -1800, 500, -2200, 1700], [0x55e0ff, 2100, -300, -1200, 1500], [0xffa64d, -900, -700, 2300, 1300], [0x8a7dff, 1500, 900, 1800, 1600]];
  for (const [c, x, y, z, s] of neb) {
    const m = new THREE.SpriteMaterial({ map: glowTex(), color: c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.setScalar(s); sp.renderOrder = -1; scene.add(sp);
  }
  // sun glow
  const sunSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,240,200,1)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunSp.position.set(-0.5, 0.45, -0.7).normalize().multiplyScalar(3000); sunSp.scale.setScalar(700); scene.add(sunSp);

  scene.add(new THREE.HemisphereLight(0xe6f0ff, 0x6a64c8, 1.55));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.3);
  sun.position.set(-500, 450, -700); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x7fd6ff, 0.9); rim.position.set(600, -200, 500); scene.add(rim);

  // planets (restyled CC0 Quaternius models, loaded by models.js)
  if (planets) {
    const ringP = planets.ring; ringP.scale.setScalar(300); ringP.position.set(-1700, 520, -2300); ringP.rotation.set(0.35, 0.4, 0.25); scene.add(ringP);
    const blueP = planets.blue; blueP.scale.setScalar(200); blueP.position.set(2300, -600, 1300); scene.add(blueP);
  }
  return {
    sun,
    update(dt, t) { if (planets) { planets.ring.rotation.y += dt * 0.01; planets.blue.rotation.y += dt * 0.015; } },
  };
}
