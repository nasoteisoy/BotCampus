// Hangar launches use Dev B's SpaceShip Editor (games/spaceship-custom/) when it is deployed next to this editor:
//   - the player's saved army.spaceships[] (their real models + stats), else Dev B's default base ship.
//   - if spaceship-custom is not there, this returns null and the demo launches its own small craft.
// To avoid a 404 in the console, we only import Dev B's modules when we know they exist:
//   the save already has spaceships (only that editor writes them) OR the hub's games/items.json lists spaceship-custom.
import * as THREE from 'three';

let kitP = null;
async function listedInHub() {
  try {
    const r = await fetch('../items.json', { cache: 'no-cache' }); if (!r.ok) return false;
    const j = await r.json(), items = Array.isArray(j) ? j : j.items || [];
    return items.some((x) => x && (x.id === 'spaceship-custom' || String(x.url || '').includes('spaceship-custom')));
  } catch (e) { return false; }
}
function loadKit(hasSaved) {
  if (!kitP) kitP = (async () => {
    if (!hasSaved && !(await listedInHub())) return null;
    try {
      const [m3d, st] = await Promise.all([import('../../spaceship-custom/js/ship3d.js?v=1'), import('../../spaceship-custom/js/ship-stats.js?v=1')]);
      if (typeof m3d.buildShip !== 'function' || typeof m3d.ShipLook !== 'function' || typeof st.spaceshipStats !== 'function') return null;
      return { m3d, st };
    } catch (e) { return null; }
  })();
  return kitP;
}
// spaceshipsFor(rawArmy, playerId, colors) → null | { source: 'saved' | 'default', ships: [{ name, parts, stats }], make(i) → THREE.Object3D (nose +Z, ~1.1 long) }
export async function spaceshipsFor(army, playerId, colors = {}) {
  const raw = (army && Array.isArray(army.spaceships) ? army.spaceships : []).filter((s) => s && typeof s === 'object' && s.playerId === playerId);
  const kit = await loadKit(raw.length > 0); if (!kit) return null;
  const { m3d, st } = kit;
  let ships = raw.map((s) => { try { return st.cleanShip(s, playerId); } catch (e) { return null; } }).filter(Boolean), source = 'saved';
  if (!ships.length) { const parts = { ...(st.BASE_PARTS || {}) }; ships = [{ name: 'SpaceShip', parts, stats: st.spaceshipStats(parts) }]; source = 'default'; }
  const look = new m3d.ShipLook(); if (look.setColors) look.setColors(colors.primary || '#2f80ed', colors.secondary || '#ffe14d');
  const cache = new Map();
  function make(i) {
    const s = ships[i % ships.length];
    if (!cache.has(s)) { const b = m3d.buildShip(s.parts, look); if (b.shield) b.shield.visible = false; const L = (b.size && b.size.len) || 2.5; b.root.scale.setScalar(1.1 / (L + 0.6)); cache.set(s, b.root); }
    const w = new THREE.Group(); w.add(cache.get(s).clone()); w.userData.devB = true; w.userData.ship = s; return w;
  }
  return { source, ships: ships.map((s) => ({ name: s.name, parts: s.parts, stats: s.stats })), make };
}
