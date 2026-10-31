// Fixed SpaceShip + BattleShip meshes for STAR CONQUESTS space battles.
// Copied builders live in ./spaceship3d.js + ./battleship3d.js (self-contained).
// unit.type 'spaceship' | 'battleship' maps to these presets — no editor, no loadouts.
import * as THREE from './vendor/three.module.min.js';
import { ShipLook, buildShip as buildSpaceMesh } from './spaceship3d.js';
import { buildShip as buildBattleMesh } from './battleship3d.js';

/** Fixed SpaceShip presets (visual variants for hangar craft / roster roles only). */
const SPACE_PRESETS = {
  scout:        { hull: 'scout', wings: 'stubs', engines: 'ion', guns: 'pulse', shield: 'medium', seats: '2' },
  fighter:      { hull: 'arrow', wings: 'delta', engines: 'twin', guns: 'twin', shield: 'medium', seats: '2' },
  interceptor:  { hull: 'arrow', wings: 'swept', engines: 'plasma', guns: 'twin', shield: 'light', seats: '2' },
  default:      { hull: 'scout', wings: 'delta', engines: 'twin', guns: 'pulse', shield: 'medium', seats: '2' },
};

/** Fixed BattleShip presets (visual variants only). */
const BATTLE_PRESETS = {
  corvette: { hull: 'corvette', armor: 'plated', shield: 'basic', guns: 'laser', hangar: 'bay', engine: 'ion' },
  cruiser:  { hull: 'cruiser', armor: 'plated', shield: 'deflector', guns: 'pulse', hangar: 'bay', engine: 'fusion' },
  // Long Army HQ silhouette: dreadnought hull (~6:1), plated (thin yellow trim only), bay (no carrier yellow slab), ion (no fusion/warp yellow)
  default:  { hull: 'dreadnought', armor: 'plated', shield: 'aegis', guns: 'pulse', hangar: 'bay', engine: 'ion' },
  dreadnought: { hull: 'dreadnought', armor: 'plated', shield: 'aegis', guns: 'rail', hangar: 'bay', engine: 'ion' },
};

function wrapShieldFlash(shMat) {
  if (!shMat) return null;
  if (!shMat.uniforms) shMat.uniforms = {};
  if (!shMat.uniforms.uFlash) shMat.uniforms.uFlash = { value: 0 };
  shMat.userData = shMat.userData || {};
  shMat.userData.flash = 0;
  return shMat;
}

function attachShieldApi(root, shieldObj) {
  let mesh = null;
  let shMat = null;
  if (!shieldObj) {
    root.userData.shield = null;
    root.userData.shMat = null;
    return;
  }
  if (shieldObj.isMesh) {
    mesh = shieldObj;
    shMat = wrapShieldFlash(shieldObj.material);
  } else {
    mesh = shieldObj;
    shieldObj.traverse((m) => {
      if (m.isMesh && m.material && m.material.uniforms) {
        shMat = wrapShieldFlash(m.material);
      }
    });
  }
  root.userData.shield = mesh;
  root.userData.shMat = shMat;
}

/** SpaceShip: nose +Z. role = scout|fighter|interceptor (visual only). */
export function buildSpaceShip(role, colorHex, secondary = '#ffe14d') {
  const parts = SPACE_PRESETS[role] || SPACE_PRESETS.default;
  const look = new ShipLook();
  look.setColors(colorHex || '#2f80ed', secondary);
  const built = buildSpaceMesh(parts, look);
  const root = built.root;
  const pri = new THREE.Color(colorHex || '#2f80ed');
  root.traverse((m) => {
    if (m.isMesh && m.material && m.material.isMeshStandardMaterial && m.material.emissive) {
      if (m.material === look.prim) {
        m.material.emissive.copy(pri).multiplyScalar(0.45);
        m.material.emissiveIntensity = 0.8;
      }
    }
  });
  const scale = role === 'interceptor' ? 2.35 : role === 'scout' ? 2.5 : 2.6;
  root.scale.setScalar(scale);
  attachShieldApi(root, built.shield);
  // Thin shield: hide bubble at rest; flashShield still shimmers on hit
  if (root.userData.shield) {
    root.userData.shield.visible = false;
    root.userData.shieldRestHidden = true;
  }
  if (root.userData.shMat) {
    root.userData.shMat.userData.baseOp = 0.02;
    if (root.userData.shMat.uniforms && root.userData.shMat.uniforms.uOp) {
      root.userData.shMat.uniforms.uOp.value = 0.02;
    } else if (root.userData.shMat.opacity != null) {
      root.userData.shMat.transparent = true;
      root.userData.shMat.opacity = 0.02;
    }
  }
  root.userData.kind = 'spaceship';
  root.userData.flames = built.flames || [];
  root.userData.muzzles = built.muzzles || [];
  root.userData.look = look;
  // Team wings: hull color + thin trim edge (not solid olive/yellow sheets)
  {
    const side = (String(colorHex || '').toLowerCase().includes('e74') || String(colorHex || '').toLowerCase().includes('c039') || String(colorHex || '').toLowerCase().includes('ff4'))
      ? 'defender' : 'attacker';
    // Heuristic from common team hexes; callers pass attacker blue / defender red
    const isDef = (() => {
      try {
        const c = new THREE.Color(colorHex || '#2f80ed');
        return c.r > c.b + 0.15; // red-leaning = defender
      } catch (_) { return false; }
    })();
    const hullHex = isDef ? '#6a4a4e' : '#4a5a7a';
    const trimHex = isDef ? '#ff4d4d' : '#ffe14d';
    const hullMat = new THREE.MeshStandardMaterial({
      color: hullHex, roughness: 0.55, metalness: 0.35, flatShading: true,
      emissive: new THREE.Color(hullHex).multiplyScalar(0.25), emissiveIntensity: 0.5,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: trimHex, roughness: 0.4, metalness: 0.2, flatShading: true,
      emissive: new THREE.Color(trimHex).multiplyScalar(0.4), emissiveIntensity: 0.7,
    });
    root.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      const n = (m.name || m.geometry?.type || '').toLowerCase();
      // Wing meshes from spaceship3d use cached names w-stubs/w-delta/w-swept/w-broad
      const geoKey = m.geometry.userData && m.geometry.userData._scKey;
      const isWing = (typeof m.geometry.parameters === 'object' && false)
        || (m.material === look.sec)
        || (m.parent === root && m.position.x !== 0 && Math.abs(m.position.x) > 0.3
            && m.geometry.type === 'ExtrudeGeometry');
      // Prefer material identity: wings were built with look.sec
      if (m.material !== look.sec && m.material !== look.prim) {
        // Also catch ExtrudeGeometry wings that share look.sec by reference
        if (!(m.geometry.type === 'ExtrudeGeometry' && Math.abs(m.position.x) > 0.2)) return;
      }
      if (m.material === look.sec || m.geometry.type === 'ExtrudeGeometry') {
        if (Math.abs(m.position.x) < 0.15 && m.geometry.type !== 'ExtrudeGeometry') return;
        m.material = hullMat;
        m.material.flatShading = true;
        // Ensure thickness reads: if Y extent tiny, scale up toward ~0.12
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        const sy = Math.abs(bb.max.y - bb.min.y) || 0.01;
        const chord = Math.max(Math.abs(bb.max.x - bb.min.x), Math.abs(bb.max.z - bb.min.z), 0.5);
        const ratio = sy / chord;
        if (ratio < 0.08) {
          const target = 0.11;
          m.scale.y *= (target / Math.max(ratio, 0.02));
        }
        // Thin trim edge along leading/outer tip
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, Math.max(0.1, sy * m.scale.y * 0.9), Math.max(0.35, chord * 0.55)),
          trimMat,
        );
        edge.position.set(m.position.x > 0 ? 0.02 : -0.02, 0, 0.05);
        m.add(edge);
      }
    });
  }
  return root;
}

/** BattleShip: Army HQ look — blue-grey hull + yellow trim; team color = engine/glow accent only.
 *  Built nose +X; caller faces it. role = corvette|cruiser|default|dreadnought. */
export function buildBattleShip(role, colorHex, secondary = '#ffd23f', opts = {}) {
  const parts = BATTLE_PRESETS[role] || BATTLE_PRESETS.default;
  // Team-distinct Army HQ palettes: attacker blue-grey + yellow, defender red-grey + red
  const side = opts.side || 'attacker';
  const HULL = opts.hull || (side === 'defender' ? '#6a4a4e' : '#4a5a7a');
  const TRIM = opts.trim || secondary || (side === 'defender' ? '#ff4d4d' : '#ffd23f');
  const colors = { primary: HULL, secondary: TRIM };
  const mesh = buildBattleMesh(parts, colors, { shield: 'demo' });
  const team = new THREE.Color(colorHex || (side === 'defender' ? '#e74c3c' : '#2f80ed'));
  const hullC = new THREE.Color(HULL);
  const trimC = new THREE.Color(TRIM);
  mesh.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    const mat = m.material;
    if (mat.isMeshStandardMaterial && mat.color) {
      const c = mat.color;
      // Anything that was built with secondary (warm) — keep if thin stripe, else hull
      const isWarm = (c.r > 0.55 && c.g > 0.25 && c.b < 0.5) || (c.r > 0.7 && c.g < 0.45);
      if (isWarm && m.geometry) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
        const maxE = Math.max(sx, sy, sz);
        const minE = Math.min(sx, sy, sz);
        const skinny = minE < 0.22 || (maxE / Math.max(minE, 1e-3) > 6);
        if (skinny) mat.color.copy(trimC);
        else mat.color.copy(hullC);
      } else if (mat.color.getHex && Math.abs(mat.color.getHex() - hullC.getHex()) > 0x101010) {
        // Force primary hull panels to team hull
        const hex = mat.color.getHex();
        if (hex === 0x4a5a7a || hex === 0x6b7c8d || hex === 0x6a4a4e) mat.color.copy(hullC);
      }
    }
    // Engine glow cones: full team color
    if (mat.isMeshBasicMaterial && mat.color) {
      if (m.geometry && /Cone|Sphere/.test(m.geometry.type || '')) {
        mat.color.copy(team);
      }
    }
  });
  // Explicit thin Army HQ stripe lines along hull sides + deck edges (bright, readable)
  {
    const Lu = mesh.userData.L || 5.6, Wu = mesh.userData.W || 1.6, Hu = mesh.userData.H || 0.95;
    const trimMat = new THREE.MeshBasicMaterial({ color: trimC, depthWrite: true });
    for (const sgn of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(Lu * 0.78, 0.07, 0.06), trimMat);
      rail.position.set(-Lu * 0.04, Hu * 0.24, sgn * (Wu * 0.55));
      mesh.add(rail);
      const rail2 = new THREE.Mesh(new THREE.BoxGeometry(Lu * 0.7, 0.055, 0.05), trimMat);
      rail2.position.set(-Lu * 0.04, -Hu * 0.18, sgn * (Wu * 0.55));
      mesh.add(rail2);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(Lu * 0.74, 0.055, 0.05), trimMat);
      deck.position.set(-Lu * 0.04, Hu * 0.52, sgn * (Wu * 0.5));
      mesh.add(deck);
    }
    const spine = new THREE.Mesh(new THREE.BoxGeometry(Lu * 0.76, 0.06, Wu * 1.02), trimMat);
    spine.position.set(-Lu * 0.05, Hu * 0.2, 0);
    mesh.add(spine);
    const keel = new THREE.Mesh(new THREE.BoxGeometry(Lu * 0.7, 0.05, Wu * 0.9), trimMat);
    keel.position.set(-Lu * 0.05, -Hu * 0.28, 0);
    mesh.add(keel);
  }
  // Slightly tighter scale so both capitals fit a closer arena
  const baseScale = (role === 'corvette') ? 5.6 : (role === 'cruiser') ? 7.0 : 8.0;
  mesh.scale.set(baseScale * 1.1, baseScale * 0.84, baseScale * 0.78);
  mesh.rotation.y = 0;
  const ud = mesh.userData || {};
  attachShieldApi(mesh, ud.shield);
  const PURPLE_SHIELD = 0xb88cff;
  if (mesh.userData.shMat && mesh.userData.shMat.uniforms) {
    const u = mesh.userData.shMat.uniforms;
    if (u.uC) u.uC.value.setHex(PURPLE_SHIELD);
    if (u.uColor) u.uColor.value.setHex(PURPLE_SHIELD);
    // Soft fresnel ellipsoid — low rest opacity; fadeCapitalShields handles cam-inside
    if (u.uOp) { u.uOp.value = 0.05; mesh.userData.shMat.userData.baseOp = 0.05; }
    if (mesh.userData.shMat.opacity != null) mesh.userData.shMat.opacity = 0.08;
  }
  // Ellipsoid scale: slightly elongated along hull length (already set in builder); ensure DoubleSide off so inside fades
  if (mesh.userData.shield) {
    mesh.userData.shield.material.side = THREE.FrontSide;
  }
  // Soft elongated ellipsoid (not round ball)
  if (mesh.userData.shield) {
    const sh = mesh.userData.shield;
    sh.scale.x *= 1.05;
    sh.scale.y *= 0.92;
    sh.scale.z *= 0.95;
  }
  mesh.userData.kind = 'battleship';
  mesh.userData.flames = ud.engines || [];
  mesh.userData.turrets = ud.turrets || [];
  mesh.userData.hangar = ud.hangar || null;
  mesh.userData.L = ud.L; mesh.userData.W = ud.W; mesh.userData.H = ud.H;
  mesh.userData.teamColor = colorHex || '#2f80ed';
  return mesh;
}

export function flashShield(mesh, amount = 1) {
  if (!mesh || !mesh.userData || !mesh.userData.shMat) return;
  const m = mesh.userData.shMat;
  m.userData.flash = Math.min(1, (m.userData.flash || 0) + amount);
  if (mesh.userData.shieldRestHidden && mesh.userData.shield) mesh.userData.shield.visible = true;
  if (m.uniforms) {
    if (m.uniforms.uFlash) m.uniforms.uFlash.value = m.userData.flash;
    if (m.uniforms.uOp) m.uniforms.uOp.value = Math.min(0.45, (m.userData.baseOp || 0.08) + m.userData.flash * 0.35);
  } else if (m.opacity != null) {
    m.transparent = true;
    m.opacity = Math.min(0.4, (m.userData.baseOp || 0.02) + m.userData.flash * 0.35);
  }
}

export function tickShield(mesh, dt) {
  if (!mesh || !mesh.userData || !mesh.userData.shMat) return;
  const m = mesh.userData.shMat;
  m.userData.flash = Math.max(0, (m.userData.flash || 0) - dt * 2.5);
  if (m.uniforms) {
    if (m.uniforms.uFlash) m.uniforms.uFlash.value = m.userData.flash;
    if (m.uniforms.uOp) {
      const base = m.userData.baseOp != null ? m.userData.baseOp : (m.userData.base || 0.08);
      m.uniforms.uOp.value = base + m.userData.flash * 0.35;
    }
  } else if (m.opacity != null) {
    const base = m.userData.baseOp != null ? m.userData.baseOp : 0.02;
    m.opacity = base + m.userData.flash * 0.35;
  }
  if (mesh.userData.shieldRestHidden && mesh.userData.shield && m.userData.flash <= 0.02) {
    mesh.userData.shield.visible = false;
  }
}

export function setShieldVisible(mesh, on) {
  if (!mesh || !mesh.userData || !mesh.userData.shield) return;
  // Fighters: bubble only on hit flash (shieldRestHidden)
  if (mesh.userData.shieldRestHidden && on) return;
  mesh.userData.shield.visible = !!on;
}

export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((m) => {
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const x of mats) if (x && x.dispose) x.dispose();
    }
  });
}
