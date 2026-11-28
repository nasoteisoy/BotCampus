// Juice: one-draw-call particles, floating money popups, screen shake and hit-stop.
import * as THREE from 'three';

export function createParticles(scene, max = 700) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), maxLife = new Float32Array(max), grav = new Float32Array(max), baseSize = new Float32Array(max);
  const target = new Array(max).fill(null);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: 400 } },
    vertexShader: 'attribute float size; varying vec3 vColor; uniform float scale; void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; varying vec3 vColor; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor, t.a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
  let head = 0;
  const tmp = new THREE.Color();
  const api = {
    spawn(x, y, z, vx, vy, vz, color, sz = 0.2, lifeS = 0.8, gravity = 0, tgt = null) {
      const i = head; head = (head + 1) % max;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      tmp.set(color); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      baseSize[i] = sz; size[i] = sz; life[i] = lifeS; maxLife[i] = lifeS; grav[i] = gravity; target[i] = tgt;
    },
    burst(x, y, z, color, n = 20, speed = 3, sz = 0.2, lifeS = 0.7, gravity = 4) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, s = speed * (0.4 + Math.random() * 0.8);
        api.spawn(x, y, z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + speed * 0.3, Math.sin(a) * Math.cos(b) * s, color, sz * (0.6 + Math.random() * 0.8), lifeS * (0.6 + Math.random() * 0.6), gravity);
      }
    },
    // a particle that flies into a moving target (the vacuum nozzle)
    stream(x, y, z, tgt, color, sz = 0.16) { api.spawn(x, y, z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, color, sz, 0.45, 0, tgt); },
    update(dt) {
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) { size[i] = 0; continue; }
        life[i] -= dt;
        const t = target[i];
        if (t) {
          const k = Math.min(1, dt * (6 + (1 - life[i] / maxLife[i]) * 20));
          pos[i * 3] += (t.x - pos[i * 3]) * k + vel[i * 3] * dt; pos[i * 3 + 1] += (t.y - pos[i * 3 + 1]) * k + vel[i * 3 + 1] * dt; pos[i * 3 + 2] += (t.z - pos[i * 3 + 2]) * k + vel[i * 3 + 2] * dt;
          if (Math.hypot(t.x - pos[i * 3], t.y - pos[i * 3 + 1], t.z - pos[i * 3 + 2]) < 0.12) life[i] = 0;
        } else {
          vel[i * 3 + 1] -= grav[i] * dt;
          pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          vel[i * 3] *= 0.97; vel[i * 3 + 2] *= 0.97;
          if (pos[i * 3 + 1] < 0.02 && grav[i] > 0) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.3; }
        }
        size[i] = baseSize[i] * Math.min(1, life[i] / maxLife[i] * 2.5);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.size.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
    setScale(h) { mat.uniforms.scale.value = h * 0.6; },
    clear() { life.fill(0); },
  };
  return api;
}

// floating text above a world point ("+$120", "-$30", "Need 2!")
export function createPopups(layer, camera) {
  const list = [];
  const v = new THREE.Vector3();
  return {
    add(text, x, y, z, cls = '', dur = 1.2) {
      const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text; layer.appendChild(el);
      list.push({ el, x, y, z, t: 0, dur });
    },
    update(dt, w, h) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.t += dt;
        if (p.t > p.dur) { p.el.remove(); list.splice(i, 1); continue; }
        v.set(p.x, p.y + p.t * 0.8, p.z).project(camera);
        if (v.z > 1) { p.el.style.opacity = 0; continue; }
        const k = p.t / p.dur;
        p.el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
        p.el.style.transform = `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) scale(${k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.2})`;
      }
    },
    clear() { list.forEach((p) => p.el.remove()); list.length = 0; },
  };
}

// trauma-based camera shake plus short hit-stop
export function createShake() {
  let trauma = 0, stop = 0, t = 0;
  return {
    add(a) { trauma = Math.min(1, trauma + a); },
    hitStop(sec) { stop = Math.max(stop, sec); },
    // returns time scale for visuals (0 during hit-stop) and the shake offsets
    update(dt, enabled) {
      t += dt;
      const scale = stop > 0 ? 0.05 : 1; stop = Math.max(0, stop - dt);
      trauma = Math.max(0, trauma - dt * 1.6);
      const s = enabled ? trauma * trauma : 0;
      return { scale, x: s * 0.12 * Math.sin(t * 47.3), y: s * 0.1 * Math.sin(t * 39.7 + 1.3), roll: s * 0.05 * Math.sin(t * 31.1 + 2.1) };
    },
  };
}
