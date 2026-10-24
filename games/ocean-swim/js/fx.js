import * as THREE from 'three';

// Soft round particle pool (one draw call per pool)
export class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.p = []; // {x,y,z,vx,vy,vz,life,max,size,r,g,b,grav,drag,grow}
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.al = new Float32Array(max); this.sz = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aS', new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute vec3 aCol; attribute float aA; attribute float aS; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = aCol; vA = aA; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aS * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = vA * smoothstep(0.5, ${additive ? '0.0' : '0.25'}, r); gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }
  emit(o) { if (this.p.length >= this.max) this.p.shift(); this.p.push({ grav: 0, drag: 1, grow: 0, ...o, life: 0 }); }
  clear() { this.p.length = 0; }
  update(dt) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; q.life += dt;
      if (q.life >= q.max) { P.splice(i, 1); continue; }
      const dr = Math.exp(-q.drag * dt);
      q.vx *= dr; q.vy = q.vy * dr - q.grav * dt; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.size += q.grow * dt;
    }
    for (let i = 0; i < P.length; i++) {
      const q = P[i], k = q.life / q.max;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.col[i * 3] = q.r; this.col[i * 3 + 1] = q.g; this.col[i * 3 + 2] = q.b;
      this.al[i] = (q.a ?? 1) * Math.min(1, k * 8) * (1 - k) * (1 - k);
      this.sz[i] = q.size;
    }
    this.geo.setDrawRange(0, P.length);
    for (const k of ['position', 'aCol', 'aA', 'aS']) this.geo.attributes[k].needsUpdate = true;
  }
}

// Wingtip ribbon trail: tapered strip of recent tip positions
export class Ribbon {
  constructor(scene, n = 46, color = '#9fd3f5') {
    this.n = n; this.pts = []; this.w = 0.32;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3); this.col = new Float32Array(n * 2 * 4);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const c = new THREE.Color(color);
    for (let i = 0; i < n * 2; i++) { this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; }
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  reset() { this.pts.length = 0; }
  push(p, up) {
    this.pts.unshift({ x: p.x, y: p.y, z: p.z, ux: up.x, uy: up.y, uz: up.z });
    if (this.pts.length > this.n) this.pts.pop();
  }
  update() {
    const P = this.pts, n = this.n;
    for (let i = 0; i < n; i++) {
      const q = P[Math.min(i, P.length - 1)];
      const k = i / (n - 1);
      const w = q ? this.w * (1 - k) : 0;
      const a = q && i < P.length ? 0.5 * (1 - k) * (1 - k) * Math.min(1, i / 3) : 0;
      const o = i * 6;
      if (q) {
        this.pos[o] = q.x + q.ux * w; this.pos[o + 1] = q.y + q.uy * w; this.pos[o + 2] = q.z + q.uz * w;
        this.pos[o + 3] = q.x - q.ux * w; this.pos[o + 4] = q.y - q.uy * w; this.pos[o + 5] = q.z - q.uz * w;
      }
      this.col[i * 8 + 3] = a; this.col[i * 8 + 7] = a;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}
