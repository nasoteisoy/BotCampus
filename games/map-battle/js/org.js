// Order of battle for Battle of Kerovo r3: Army > Corps > Division > Regiment > Battalion.
// Every node is a commander with an optional order and a plan for its children. Leaves
// (battalions, squadrons, batteries) are the units the sim moves and fights with.
// Source part: none in parts-library has a command tree; written new for map-battle r3.
import { START } from './map.js';

export const LEVELS = ['army', 'corps', 'div', 'reg', 'bn'];
export const LEVEL_NAME = { army: 'Army', corps: 'Corps', div: 'Division', reg: 'Regiment', bn: 'Battalion' };
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** Per corps: three infantry divisions, one cavalry division, one artillery division. */
const CORPS_DIVS = [
  { kind: 'inf', regs: 2, bns: 2, l: -100, f: 0 },
  { kind: 'inf', regs: 2, bns: 2, l: 0, f: 0 },
  { kind: 'inf', regs: 2, bns: 2, l: 100, f: 0 },
  { kind: 'cav', regs: 1, bns: 2, l: 178, f: -34 },
  { kind: 'art', regs: 1, bns: 2, l: 0, f: -52 },
];
const REG_GAP = { inf: 50, cav: 34, art: 60 };
const BN_GAP = { inf: 24, cav: 17, art: 30 };

function node(state, id, level, side, kind, parent, label, extra = {}) {
  const n = { id, level, side, kind, parent: parent ? parent.id : null, children: [], label, order: null, override: false, plan: [], replanAt: 0, underFire: 0, ...extra };
  state.nodes.set(id, n);
  if (parent) parent.children.push(id);
  return n;
}

/** Builds the tree and the leaf units. Positions are laid out in each corps' start frame. */
export function buildArmies(state, makeUnit) {
  state.nodes = new Map();
  state.armies = {};
  state.corps = [];
  for (const side of ['b', 'g']) {
    const army = node(state, `${side}A`, 'army', side, 'mixed', null, 'Army', { portrait: 1 });
    state.armies[side] = army;
    START[side].forEach((spot, ci) => {
      const cid = `${side}${ci}`;
      // corps keep the r1/r2 fields (index, goal, lastOrder) the HUD and QA probes read
      const corps = node(state, cid, 'corps', side, 'mixed', army, ROMAN[ci], { index: ci, goal: ci, lastOrder: null, portrait: ci + 3 });
      state.corps.push(corps);
      const fx = Math.cos(spot.face), fy = Math.sin(spot.face);
      const lx = -fy, ly = fx;
      const at = (l, f) => ({ x: spot.x + lx * l + fx * f, y: spot.y + ly * l + fy * f });
      CORPS_DIVS.forEach((d, di) => {
        const div = node(state, `${cid}d${di}`, 'div', side, d.kind, corps, String(di + 1), { portrait: 10 + ci * 10 + di });
        for (let r = 0; r < d.regs; r++) {
          const rl = d.l + (r - (d.regs - 1) / 2) * REG_GAP[d.kind];
          const reg = node(state, `${div.id}r${r}`, 'reg', side, d.kind, div, String(r + 1), { portrait: 60 + ci * 20 + di * 3 + r });
          for (let b = 0; b < d.bns; b++) {
            const bl = rl + (b - (d.bns - 1) / 2) * BN_GAP[d.kind];
            const bn = node(state, `${reg.id}n${b}`, 'bn', side, d.kind, reg, String(b + 1));
            const p = at(bl, d.f);
            makeUnit({ id: bn.id, side, kind: d.kind, corps: cid, div: div.id, reg: reg.id, x: p.x, y: p.y, ang: spot.face });
          }
        }
      });
    });
  }
}

export const nodeOf = (state, id) => state.nodes.get(id);
export const parentOf = (state, n) => (n.parent ? state.nodes.get(n.parent) : null);
export function ancestors(state, n) {
  const out = [];
  for (let k = n; k; k = parentOf(state, k)) out.unshift(k);
  return out;
}
/** Leaf units under a node (a leaf node maps to its own unit). */
export function leavesOf(state, n) {
  if (n.level === 'bn') { const u = state.unitById.get(n.id); return u ? [u] : []; }
  const out = [];
  for (const c of n.children) out.push(...leavesOf(state, state.nodes.get(c)));
  return out;
}
