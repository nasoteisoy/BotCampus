// Unit-type badges: a tiny icon floating above every visible squad, vehicle and plane (the HUD icons from icons.js).
// All badges are ONE instanced quad mesh (one draw call) sampling a canvas atlas with a cell per type × team, drawn as
// screen-aligned billboards of constant pixel size. Toggle with V (saved in localStorage); on by default.
import * as THREE from 'three';
import { ICON } from './icons.js';
import { TEAM } from './models.js';

const KEY = 'frontline.badges.v1';
const CELL = 64, COLS = 8, MAX = 512;

export function createBadges(scene, camera, types) {
  const rows = Math.ceil(types.length * 2 / COLS);
  const cv = document.createElement('canvas'); cv.width = COLS * CELL; cv.height = rows * CELL;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
  const index = {};
  types.forEach((t, i) => ['blue', 'red'].forEach((team, j) => {
    const n = i * 2 + j, col = n % COLS, row = Math.floor(n / COLS), x = col * CELL, y = row * CELL;
    index[t + team] = [col, rows - 1 - row];                        // texture v runs bottom-up
    const css = TEAM[team].css;
    g.fillStyle = 'rgba(12,16,22,.80)'; g.strokeStyle = css; g.lineWidth = 5;
    g.beginPath(); if (g.roundRect) g.roundRect(x + 4, y + 8, CELL - 8, CELL - 16, 12); else g.rect(x + 4, y + 8, CELL - 8, CELL - 16); g.fill(); g.stroke();
    const img = new Image();
    img.onload = () => { g.drawImage(img, x + 8, y + 13, CELL - 16, (CELL - 16) * 32 / 40); tex.needsUpdate = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 32" width="96" height="77">${(ICON[t] || '').replaceAll('currentColor', css)}</svg>`);
  }));
  const geo = new THREE.PlaneGeometry(1, .75);
  const cell = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2); cell.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('cell', cell);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, px: { value: .01 }, cellUV: { value: new THREE.Vector2(1 / COLS, 1 / rows) }, opacity: { value: .95 } },
    vertexShader: `attribute vec2 cell; uniform float px; uniform vec2 cellUV; varying vec2 vUv;
      void main() {
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * px * -mv.z;                         // constant size on screen
        gl_Position = projectionMatrix * mv;
        vUv = (cell + uv) * cellUV;
      }`,
    fragmentShader: `uniform sampler2D map; uniform float opacity; varying vec2 vUv;
      void main() { vec4 c = texture2D(map, vUv); if (c.a < .04) discard; gl_FragColor = vec4(c.rgb, c.a * opacity);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: false,
  });
  const im = new THREE.InstancedMesh(geo, mat, MAX); im.name = 'unit-badges'; im.frustumCulled = false; im.renderOrder = 20; im.count = 0;
  scene.add(im);
  let on = true; try { on = localStorage.getItem(KEY) !== '0'; } catch { /* ignore */ }
  const m = new THREE.Matrix4();
  return {
    get on() { return on; },
    set(v) { on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } if (!on) im.count = 0; },
    // list: [{ x, y, z, type, team }]
    update(list, sizePx) {
      if (!on) { im.count = 0; return; }
      mat.uniforms.px.value = sizePx * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / innerHeight;
      let n = 0;
      for (const b of list) {
        if (n >= MAX) break;
        const c = index[b.type + b.team]; if (!c) continue;
        im.setMatrixAt(n, m.makeTranslation(b.x, b.y, b.z)); cell.setXY(n, c[0], c[1]); n++;
      }
      im.count = n; im.instanceMatrix.needsUpdate = true; cell.needsUpdate = true;
    },
    count: () => im.count,
  };
}
