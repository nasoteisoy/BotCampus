// One-draw-call point sprite particle system (soft round sprites).
import * as THREE from 'three';

export class Particles {
  constructor(scene, cap, additive, softness = 1.5) {
    this.cap = cap; this.head = 0;
    this.pos = new Float32Array(cap * 3); this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap);
    this.col = new Float32Array(cap * 3); this.a0 = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.grav = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos); this.geo.setAttribute('size', this.aSize); this.geo.setAttribute('pcolor', this.aCol);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSoft: { value: softness } },
      vertexShader: `attribute float size; attribute vec4 pcolor; uniform float uScale; varying vec4 vC;
        void main(){ vC=pcolor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec4 vC; uniform float uSoft;
        void main(){ float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0||vC.a<0.003) discard; gl_FragColor=vec4(vC.rgb, pow(1.0-d,uSoft)*vC.a); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 0, grav = 0) {
    if (this.thin && Math.random() > this.thin) return;  // low-end devices: thin out particles
    const i = this.head; this.head = (this.head + 1) % this.cap;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([r, g, b], i * 3);
    this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.drag[i] = drag; this.grav[i] = grav;
  }
  clear() { this.life.fill(0); }
  update(dt) {
    const P = this.aPos.array, S = this.aSize.array, C = this.aCol.array;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { S[i] = 0; C[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3, d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.05) { this.pos[k + 1] = 0.05; this.vel[k + 1] *= -0.3; }
      const t = 1 - Math.max(0, this.life[i]) / this.max[i];
      P[k] = this.pos[k]; P[k + 1] = this.pos[k + 1]; P[k + 2] = this.pos[k + 2];
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      C[i * 4] = this.col[k]; C[i * 4 + 1] = this.col[k + 1]; C[i * 4 + 2] = this.col[k + 2];
      C[i * 4 + 3] = this.a0[i] * Math.min(1, t * 10) * (1 - t);
    }
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aCol.needsUpdate = true;
  }
}
