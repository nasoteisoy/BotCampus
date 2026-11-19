// Captain + bridge officers, built from the Chumi-approved HQ trooper (parts library: hq-troopers).
// Same rigid-part rig and geometry as Army HQ (parts on bones, no vertex deforming); restyled for the bridge:
// open-face helmet, light duty suit in each department's colour, shared toon material, and a datapad instead of a rifle.
import * as THREE from 'three';
import { TeamLook } from './hq/trooper.js';
import { RigTemplate, Rig } from './hq/demo-rig.js';
import { poseTrooper } from './hq/api.js';
import { trooperSt, nationFor, paintState } from './hq/looks.js';
import { RAMP } from './space-world.js';

const _tpl = new Map();
function template(kind) {
  if (!_tpl.has(kind)) {
    const st = { ...trooperSt('officer'), helm: 3, expl: 0, gadget: 0, banner: 0, side: 0, award: 0, extra: kind === 'captain' ? 1 : 0 };
    _tpl.set(kind, new RigTemplate('trooper', st));
  }
  return _tpl.get(kind);
}

// one toon look per colour pair (primary = department / captain colour, secondary = trim)
function lookFor(p, s, skin, suitHex) {
  const L = new TeamLook();
  L.paint(paintState({ ...nationFor(p, 'attacker'), p, s, suit: 4, sym: 0, vis: 0, glow: 1 }, { skin }));
  // bright duty suit: repaint the atlas suit swatch (D) in the person's own colour
  L.ctx.fillStyle = suitHex; L.ctx.fillRect(64 + 16 * 3, 0, 16, L.canvas.height); L.tex.needsUpdate = true;
  L.team = new THREE.MeshToonMaterial({ map: L.tex, gradientMap: RAMP });
  L.visor = new THREE.MeshToonMaterial({ color: L.visor.color, emissive: L.visor.emissive, emissiveIntensity: L.visor.emissiveIntensity, gradientMap: RAMP });
  return L;
}

// a small glowing datapad held in the right hand (rigid prop on the hand mark)
function datapad(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.22), new THREE.MeshToonMaterial({ color: 0xe8eef8, gradientMap: RAMP }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.18), new THREE.MeshBasicMaterial({ color }));
  screen.rotation.x = -Math.PI / 2; screen.position.y = 0.012;
  g.add(body, screen); g.rotation.set(-0.5, 0, 0); g.position.set(0, 0.03, 0.06);
  return g;
}

/** kind: 'captain' | 'officer'. Returns { root, rig, kind, state, t }. */
export function makeCrew(kind, color, trim = '#ffffff', skin = 1, suit = color) {
  const rig = new Rig(template(kind), lookFor(color, trim, skin, suit));
  rig.attach(datapad(kind === 'captain' ? 0xffd23f : new THREE.Color(color).getHex()), 'handR');
  const c = { root: rig.root, rig, kind, state: 'idle', t: 0 };
  return c;
}

/** Pose for this frame: 'idle' or 'run' (walk cycle). The rifle meshes of the HQ rig stay hidden. */
export function poseCrew(c, state, dt) {
  if (c.state !== state) { c.state = state; c.t = 0; }
  c.t += dt;
  poseTrooper(c, state, c.t, dt);
  for (const m of c.rig.meshes) if (m.name.startsWith('arms:')) m.visible = false;
}
