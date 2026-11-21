// Flame pool: the shared Particles part (unchanged) plus a colour, size and fade curve over each flame particle's life
// (white-yellow core, orange middle, red tips) and a floor so flame licks along the ground instead of sinking;
// `hit` holds this frame's mean ground-touch point of flame particles (n = how many touched).
import * as THREE from 'three';
import { Particles } from './particles.js';

const RAMP = [[0, 1, 0.97, 0.8], [0.18, 1, 0.85, 0.3], [0.5, 1, 0.42, 0.05], [1, 1, 0.16, 0.04]];
const FLOOR = 0.02;
const OCC = 0.6;    // how much the coolest (red) flame covers the scene behind it; the core covers nothing

function ramp(t, out, k) {
  let i = 1; while (i < RAMP.length - 1 && RAMP[i][0] < t) i++;
  const a = RAMP[i - 1], b = RAMP[i], u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
  out[k] = a[1] + (b[1] - a[1]) * u; out[k + 1] = a[2] + (b[2] - a[2]) * u; out[k + 2] = a[3] + (b[3] - a[3]) * u;
}

export class FlamePool extends Particles {
  constructor(scene, cap) {
    super(scene, cap, true, 1.6);
    this.ramped = new Uint8Array(cap); this.points.renderOrder = 4; this.hit = { x: 0, z: 0, n: 0 };
    // premultiplied additive: the hot core adds light (occlusion 0); older, cooler parts cover a little of what is
    // behind them so orange and red still read on bright grass. Depth test on, depth write off.
    this.aOcc = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('occ', this.aOcc);
    this.mat.dispose();
    this.mat = this.points.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSoft: { value: 1.6 } },
      vertexShader: `attribute float size; attribute vec4 pcolor; attribute float occ; uniform float uScale; varying vec4 vC; varying float vO;
        void main(){ vC=pcolor; vO=occ; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec4 vC; varying float vO; uniform float uSoft;
        void main(){ float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0||vC.a<0.003) discard; float m=pow(1.0-d,uSoft)*vC.a; gl_FragColor=vec4(vC.rgb*m, m*vO); }`,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
  }
  /** spawn one particle; ramped ones take the flame colours over their life, others keep (r, g, b) */
  emit(ramped, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav) {
    const i = this.head; this.spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav); this.ramped[i] = ramped ? 1 : 0;
  }
  update(dt) {
    super.update(dt);
    const P = this.aPos.array, S = this.aSize.array, C = this.aCol.array, O = this.aOcc.array, H = this.hit; H.x = H.z = H.n = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      if (this.pos[k + 1] < FLOOR) { this.pos[k + 1] = P[k + 1] = FLOOR; this.vel[k + 1] = Math.abs(this.vel[k + 1]) * 0.15; this.vel[k] *= 1.08; this.vel[k + 2] *= 1.08; if (this.ramped[i]) { H.x += this.pos[k]; H.z += this.pos[k + 2]; H.n++; } }
      if (this.ramped[i]) {
        // flame body: grows fast then holds its size, stays bright longer and fades at the tip
        const t = 1 - this.life[i] / this.max[i];
        ramp(t, C, i * 4); O[i] = OCC * Math.min(1, Math.max(0, (t - 0.2) / 0.6));
        S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
        C[i * 4 + 3] = this.a0[i] * Math.min(1, t * 12) * (1 - t * t);
      } else O[i] = 0;
    }
    this.aOcc.needsUpdate = true;
  }
  /** particles alive right now (QA and tuning) */
  get alive() { let n = 0; for (let i = 0; i < this.cap; i++) if (this.life[i] > 0) n++; return n; }
}
