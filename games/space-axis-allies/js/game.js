/* Game state, turn phases, combat, movement legality */

import {
  FACTIONS, TURN_ORDER, UNITS, ZONES, SYSTEMS,
  buildAdjacency, startingUnits, VICTORY, RANGE_PER_MOVE, ENGAGE_RADIUS, START_FLEET_POS,
} from './data.js';

// Same convention as map3d uvToSphere (THREE.SphereGeometry UVs)
function uvDir(u, v) {
  const th = u * Math.PI * 2, ph = v * Math.PI;
  return [-Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = a => Math.hypot(a[0], a[1], a[2]);

export const PHASES = [
  'purchase',
  'combatMove',
  'combat',
  'nonCombatMove',
  'mobilize',
  'collect',
];

function cloneUnits(u) {
  return JSON.parse(JSON.stringify(u));
}

function emptyStack() {
  return {};
}

export class Game {
  constructor() {
    this.zones = JSON.parse(JSON.stringify(ZONES));
    this.units = startingUnits(); // loc -> fac -> type -> count
    this.ipc = {};
    for (const f of TURN_ORDER) this.ipc[f] = FACTIONS[f].startIPC;
    this.round = 1;
    this.turnIndex = 0;
    this.phaseIndex = 0;
    this.purchased = []; // {type, count} waiting to mobilize
    this.pendingCombats = []; // {loc, attackersFac}
    this.combatState = null;
    this.selectedLoc = null;
    this.selectedUnits = {}; // type -> count for move
    this.moveOrigins = {}; // track where combat-moved units came from (simplified)
    this.log = [];
    this.adj = buildAdjacency();
    this.winner = null;
    this.stratBombs = []; // {from, to, bombers}
    // Free-space fleets: loc id -> [x,y,z]
    this.freePos = {};
    for (const id of Object.keys(this.units)) if (START_FLEET_POS[id]) this.freePos[id] = [...START_FLEET_POS[id]];
    this._fsSeq = 0;
    this._listeners = [];
  }

  onChange(fn) { this._listeners.push(fn); }
  emit() { for (const fn of this._listeners) fn(this); }

  get currentFaction() { return TURN_ORDER[this.turnIndex]; }
  get currentPhase() { return PHASES[this.phaseIndex]; }
  get faction() { return FACTIONS[this.currentFaction]; }

  addLog(msg) {
    this.log.unshift({ t: Date.now(), msg, fac: this.currentFaction, phase: this.currentPhase });
    if (this.log.length > 80) this.log.length = 80;
  }

  isDeep(id) { return this.isFree(id); }
  isFree(id) { return !!(this.freePos && this.freePos[id]); }

  /** World position of a location: zone hover point above its body, or a free-space fleet position. */
  locPos(id) {
    if (this.isFree(id)) return this.freePos[id];
    const z = this.zones[id];
    if (!z) return null;
    const sys = SYSTEMS[z.system];
    const d = uvDir(z.uv[0], z.uv[1]);
    const r = sys.radius + (z.terrain === 'sea' ? 0.5 : 0.1);
    return [sys.pos[0] + d[0] * r, sys.pos[1] + d[1] * r, sys.pos[2] + d[2] * r];
  }

  /** Movement-sphere radius for a selection (slowest ship/air unit). */
  moveRadius(take) {
    let m = 99;
    for (const [t, n] of Object.entries(take)) if (n > 0 && UNITS[t].kind !== 'ground') m = Math.min(m, UNITS[t].move);
    return m === 99 ? 0 : m * RANGE_PER_MOVE;
  }

  /** Push a point out of any body it sits in. */
  clampOutsideBodies(p) {
    p = [...p];
    for (const s of Object.values(SYSTEMS)) {
      const d = sub(p, s.pos), L = len(d), min = s.radius + 0.8;
      if (L < min) { const k = L < 1e-6 ? 1 : min / L; p = L < 1e-6 ? [s.pos[0], s.pos[1] + min, s.pos[2]] : [s.pos[0] + d[0] * k, s.pos[1] + d[1] * k, s.pos[2] + d[2] * k]; }
    }
    return p;
  }

  /** Name of a body the straight path a→b passes through (excluding the endpoints' own bodies), or null. */
  pathBlocker(a, b, skip = []) {
    const ab = sub(b, a), L = len(ab);
    if (L < 1e-6) return null;
    const dir = ab.map(v => v / L);
    for (const [id, s] of Object.entries(SYSTEMS)) {
      if (skip.includes(id)) continue;
      const oc = sub(s.pos, a);
      const t = Math.max(0, Math.min(L, oc[0] * dir[0] + oc[1] * dir[1] + oc[2] * dir[2]));
      const c = [a[0] + dir[0] * t, a[1] + dir[1] * t, a[2] + dir[2] * t];
      if (len(sub(s.pos, c)) < s.radius * 0.98) return s.name;
    }
    return null;
  }

  _sysOf(id) { return this.zones[id]?.system || null; }

  /** Resolve a free-space point: snap to a nearby fleet / sea zone, or create a new free-space loc. */
  _resolveSpacePoint(p, fac, combatMove, from) {
    let best = null, bd = ENGAGE_RADIUS;
    for (const loc of Object.keys(this.units)) {
      if (loc === from || !this.isSeaZone(loc)) continue;
      const lp = this.locPos(loc); if (!lp) continue;
      const d = len(sub(lp, p));
      const hasEnemy = this.enemiesAt(loc, fac).length > 0;
      if (d < bd && (hasEnemy || !combatMove)) { bd = d; best = loc; }
    }
    if (best) return best;
    const id = `fs_${this._fsSeq + 1}_${fac}`;
    return { newId: id, pos: p };
  }
  isZone(id) { return !!this.zones[id]; }
  isSeaZone(id) {
    const z = this.zones[id];
    return (z && z.terrain === 'sea') || this.isDeep(id);
  }
  isLandZone(id) {
    const z = this.zones[id];
    return !!(z && z.terrain !== 'sea');
  }

  locationName(id) {
    if (this.zones[id]) return this.zones[id].name;
    if (this.isFree(id)) return 'Open space';
    return id;
  }

  getStack(loc, fac) {
    return (this.units[loc] && this.units[loc][fac]) || {};
  }

  totalAt(loc, fac) {
    const s = this.getStack(loc, fac);
    return Object.values(s).reduce((a, b) => a + b, 0);
  }

  allFactionsAt(loc) {
    return Object.keys(this.units[loc] || {});
  }

  enemiesAt(loc, fac) {
    const side = FACTIONS[fac].side;
    return this.allFactionsAt(loc).filter(f => FACTIONS[f].side !== side && this.totalAt(loc, f) > 0);
  }

  alliesAt(loc, fac) {
    const side = FACTIONS[fac].side;
    return this.allFactionsAt(loc).filter(f => f !== fac && FACTIONS[f].side === side && this.totalAt(loc, f) > 0);
  }

  /** Income from held zones (moons collect separately — already separate zones). */
  computeIncome(fac) {
    let sum = 0;
    for (const z of Object.values(this.zones)) {
      if (z.terrain === 'sea') continue;
      if (z.owner === fac) sum += z.ipc || 0;
    }
    return sum;
  }

  victoryCities() {
    let allies = 0, axis = 0;
    const list = { allies: [], axis: [] };
    for (const z of Object.values(this.zones)) {
      if (!z.vc || z.terrain === 'sea' || !z.owner) continue;
      const side = FACTIONS[z.owner].side;
      if (side === 'allies') { allies++; list.allies.push(z.vc); }
      else { axis++; list.axis.push(z.vc); }
    }
    return { allies, axis, list };
  }

  checkVictory() {
    // Official: after US (Terran) turn completes a full round
    const vc = this.victoryCities();
    if (vc.axis >= VICTORY.axisWinAt) {
      this.winner = 'axis';
      this.addLog(`VICTORY — Axis holds ${vc.axis} victory cities (need ${VICTORY.axisWinAt}).`);
      return true;
    }
    if (vc.allies >= VICTORY.alliesWinAt) {
      this.winner = 'allies';
      this.addLog(`VICTORY — Allies hold ${vc.allies} victory cities (need ${VICTORY.alliesWinAt}).`);
      return true;
    }
    return false;
  }

  // —— Purchase ——
  canPurchase(type) {
    const u = UNITS[type];
    if (!u) return false;
    return this.ipc[this.currentFaction] >= u.cost;
  }

  purchase(type, count = 1) {
    if (this.currentPhase !== 'purchase') return false;
    const u = UNITS[type];
    const cost = u.cost * count;
    if (this.ipc[this.currentFaction] < cost) return false;
    this.ipc[this.currentFaction] -= cost;
    const existing = this.purchased.find(p => p.type === type);
    if (existing) existing.count += count;
    else this.purchased.push({ type, count });
    this.addLog(`Purchased ${count}× ${u.name} (−${cost} IPC).`);
    this.emit();
    return true;
  }

  // —— Movement helpers ——
  neighbors(loc) {
    return this.adj[loc] || [];
  }

  /** BFS up to maxMove steps. Ships/air use deep+zone graph; ground only zones (and bridges). */
  /**
   * BFS up to maxMove steps over adjacency.
   * Ground: land only; movement stops on entering a zone with enemy units or enemy-held territory,
   * except tanks may blitz THROUGH empty enemy territory during combat move.
   */
  reachable(from, maxMove, kind, fac, opts = {}) {
    const dist = { [from]: 0 };
    const q = [from];
    const side = fac ? FACTIONS[fac].side : null;
    while (q.length) {
      const cur = q.shift();
      if (dist[cur] >= maxMove) continue;
      for (const n of this.neighbors(cur)) {
        if (dist[n] !== undefined) continue;
        if (kind === 'ground' && !this.isLandZone(n)) continue;
        if (kind === 'ship' && !this.isSeaZone(n)) continue;
        dist[n] = dist[cur] + 1;
        if (kind === 'ground' && fac) {
          const z = this.zones[n];
          const hostile = z && z.owner && FACTIONS[z.owner].side !== side;
          const enemyUnits = this.enemiesAt(n, fac).length > 0;
          if (enemyUnits) continue;                       // stop: battle here
          if (hostile && !(opts.combat && opts.blitz)) continue; // stop unless blitzing tanks
        }
        q.push(n);
      }
    }
    delete dist[from];
    return dist;
  }

  removeUnits(loc, fac, take) {
    if (!this.units[loc] || !this.units[loc][fac]) return false;
    const stack = this.units[loc][fac];
    for (const [t, n] of Object.entries(take)) {
      if ((stack[t] || 0) < n) return false;
    }
    for (const [t, n] of Object.entries(take)) {
      stack[t] -= n;
      if (stack[t] <= 0) delete stack[t];
    }
    if (Object.keys(stack).length === 0) delete this.units[loc][fac];
    if (Object.keys(this.units[loc] || {}).length === 0) { delete this.units[loc]; if (this.isFree(loc)) delete this.freePos[loc]; }
    return true;
  }

  addUnits(loc, fac, add) {
    if (!this.units[loc]) this.units[loc] = {};
    if (!this.units[loc][fac]) this.units[loc][fac] = {};
    const stack = this.units[loc][fac];
    for (const [t, n] of Object.entries(add)) {
      if (n > 0) stack[t] = (stack[t] || 0) + n;
    }
  }

  moveUnits(from, to, fac, take) {
    if (!this.removeUnits(from, fac, take)) return false;
    this.addUnits(to, fac, take);
    return true;
  }

  /**
   * Combat move: move into enemy territory / contested deep space.
   * Non-combat: only friendly / empty / own orbital.
   */
  tryMove(from, to, take, combatMove, dryRun = false) {
    const fac = this.currentFaction;
    const phase = this.currentPhase;
    if (combatMove && phase !== 'combatMove') return { ok: false, err: 'Not combat-move phase' };
    if (!combatMove && phase !== 'nonCombatMove') return { ok: false, err: 'Not non-combat phase' };

    // Determine slowest move among selected
    let maxNeed = 1;
    let kind = 'ground';
    for (const [t, n] of Object.entries(take)) {
      if (n <= 0) continue;
      const u = UNITS[t];
      if (!u) return { ok: false, err: 'Unknown unit' };
      if (u.move < maxNeed || maxNeed === 1) { /* track min move */ }
      if (u.kind === 'ship') kind = 'ship';
      else if (u.kind === 'air' && kind !== 'ship') kind = 'air';
    }
    let minMove = 99;
    for (const [t, n] of Object.entries(take)) {
      if (n <= 0) continue;
      minMove = Math.min(minMove, UNITS[t].move);
      if (UNITS[t].kind === 'ship') kind = 'ship';
      else if (UNITS[t].kind === 'air' && kind === 'ground') kind = 'air';
    }
    const kinds = new Set();
    for (const [t, n] of Object.entries(take)) if (n > 0) kinds.add(UNITS[t].kind);
    const movingShip = kinds.has('ship'), movingGround = kinds.has('ground'), movingAir = kinds.has('air');
    let newFree = null;

    if (movingShip || (movingAir && !movingGround)) {
      // Free 3D movement inside the range sphere
      if (movingGround) {
        const cap = (take.transport || 0) * 2;
        const g = Object.entries(take).reduce((a, [t, n]) => a + (UNITS[t].kind === 'ground' ? n : 0), 0);
        if (g > cap) return { ok: false, err: 'Not enough transports for the ground units' };
      }
      const a = this.locPos(from);
      if (!a) return { ok: false, err: 'Unknown origin' };
      let b;
      if (Array.isArray(to)) {
        b = this.clampOutsideBodies(to);
        const r = this._resolveSpacePoint(b, fac, combatMove, from);
        if (typeof r === 'string') { to = r; b = this.locPos(r); }
        else { newFree = r; to = r.newId; }
      } else {
        b = this.locPos(to);
        if (!b) return { ok: false, err: 'Unknown destination' };
      }
      if (movingShip && this.isLandZone(to)) return { ok: false, err: 'Ships move in open space or SEA zones only (not land)' };
      const radius = this.moveRadius(take);
      if (len(sub(b, a)) > radius + 1e-6) return { ok: false, err: `Out of range (${len(sub(b, a)).toFixed(1)} > ${radius.toFixed(1)})` };
      const blk = this.pathBlocker(a, b, [this._sysOf(from), this._sysOf(to)].filter(Boolean));
      if (blk) return { ok: false, err: `Path blocked by ${blk}` };
      if (newFree) {
        // Non-combat may not end next to enemies; combat move into empty space is not an attack
        const near = Object.keys(this.units).some(l => this.isSeaZone(l) && this.enemiesAt(l, fac).length && len(sub(this.locPos(l), b)) < ENGAGE_RADIUS);
        if (!combatMove && near) return { ok: false, err: 'Enemy fleet within engagement range — use combat move' };
        if (combatMove) return { ok: false, err: 'Combat move must end on an enemy fleet / zone' };
      }
    } else {
      if (movingAir && movingGround) return { ok: false, err: 'Move ground and air separately' };
      let reach;
      // Load: ground from land onto own transport in a sea zone of the same body
      if (this.isLandZone(from) && this.isSeaZone(to) && !this.isFree(to)) {
        if (this._sysOf(from) !== this._sysOf(to)) return { ok: false, err: 'Load only onto transports orbiting the same body' };
        if (!(this.getStack(to, fac).transport > 0)) return { ok: false, err: 'No own transport in that sea zone' };
        reach = { [to]: 1 };
      } else if (this.isSeaZone(from) && this.isLandZone(to)) {
        // Amphibious unload: only from a sea zone adjacent to the land (never from open space)
        if (this.isFree(from) || !this.neighbors(from).includes(to)) return { ok: false, err: 'Unload only from a sea zone adjacent to the land' };
        reach = { [to]: 1 };
      } else if (!this.isLandZone(to)) {
        return { ok: false, err: 'Ground units stay on land zones' };
      } else {
        const blitz = Object.entries(take).every(([t, n]) => n <= 0 || t === 'tank');
        reach = this.reachable(from, minMove, 'ground', fac, { combat: combatMove, blitz });
      }
      if (reach[to] === undefined) return { ok: false, err: 'Out of range / illegal path' };
    }

    const enemies = this.enemiesAt(to, fac);
    const zone = this.zones[to];

    if (combatMove) {
      // Must be attacking something OR amphibious unload into enemy zone OR strat bomb
      const hasEnemy = enemies.length > 0;
      const enemyTerritory = zone && zone.terrain !== 'sea' && zone.owner && FACTIONS[zone.owner].side !== FACTIONS[fac].side;
      if (!hasEnemy && !enemyTerritory) {
        return { ok: false, err: 'Combat move must enter enemy unit or enemy-held zone' };
      }
    } else {
      // Non-combat: cannot enter enemy units or enemy territory (except air overflight end friendly)
      if (enemies.length > 0) return { ok: false, err: 'Enemy present — use combat move' };
      if (zone && zone.terrain !== 'sea' && zone.owner && FACTIONS[zone.owner].side !== FACTIONS[fac].side && kind === 'ground') {
        return { ok: false, err: 'Cannot non-combat into enemy zone' };
      }
    }

    const have = this.getStack(from, fac);
    for (const [t, n] of Object.entries(take)) if (n > 0 && (have[t] || 0) < n) return { ok: false, err: 'Insufficient units' };
    if (dryRun) {
      const zt = this.zones[to];
      const attack = enemies.length > 0 || !!(zt && zt.terrain !== 'sea' && zt.owner && FACTIONS[zt.owner].side !== FACTIONS[fac].side);
      return { ok: true, dry: true, to, attack };
    }
    const fromName = this.locationName(from);
    if (!this.removeUnits(from, fac, take)) return { ok: false, err: 'Insufficient units' };
    if (newFree) { this.freePos[newFree.newId] = newFree.pos; this._fsSeq++; }
    this.addUnits(to, fac, take);

    const label = Object.entries(take).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${UNITS[t].abbrev}`).join(', ');
    this.addLog(`Moved ${label}: ${fromName} → ${this.locationName(to)}`);

    if (combatMove) {
      const stillEnemy = this.enemiesAt(to, fac).length > 0 ||
        (this.zones[to] && FACTIONS[this.zones[to].owner].side !== FACTIONS[fac].side &&
          Object.entries(take).some(([t, n]) => n > 0 && UNITS[t].kind === 'ground'));
      if (this.enemiesAt(to, fac).length > 0) {
        if (!this.pendingCombats.find(c => c.loc === to)) {
          this.pendingCombats.push({ loc: to, attackersFac: fac });
        }
      }
      // Amphibious / ground conquest combat if enemy ground or just empty enemy territory with our ground
      if (zone && zone.terrain !== 'sea' && zone.owner && FACTIONS[zone.owner].side !== FACTIONS[fac].side) {
        const ourGround = Object.entries(this.getStack(to, fac)).some(([t, n]) => n > 0 && UNITS[t].kind === 'ground');
        if (ourGround && !this.pendingCombats.find(c => c.loc === to)) {
          this.pendingCombats.push({ loc: to, attackersFac: fac });
        }
      }
    }

    this.emit();
    return { ok: true, to };
  }

  /**
   * Every legal destination for a selection, via the same rules as tryMove (dry run).
   * Returns { locId: { type: 'move'|'attack'|'unload', dist } }.
   */
  legalTargets(from, take, combatMove) {
    const out = {};
    const a = this.locPos(from);
    const cands = new Set([...Object.keys(this.zones), ...Object.keys(this.freePos)]);
    cands.delete(from);
    const groundOnly = Object.fromEntries(Object.entries(take).filter(([t, n]) => n > 0 && UNITS[t].kind === 'ground'));
    const hasGround = Object.keys(groundOnly).length > 0;
    const hasShip = Object.entries(take).some(([t, n]) => n > 0 && UNITS[t].kind === 'ship');
    for (const id of cands) {
      const b = this.locPos(id);
      const dist = a && b ? len(sub(b, a)) : null;
      const r = this.tryMove(from, id, take, combatMove, true);
      if (r.ok) { out[id] = { type: r.attack ? 'attack' : 'move', dist }; continue; }
      // Transport stacks: ground can also unload into adjacent land
      if (hasShip && hasGround && this.isSeaZone(from) && this.isLandZone(id)) {
        const u = this.tryMove(from, id, groundOnly, combatMove, true);
        if (u.ok) out[id] = { type: 'unload', attack: u.attack, dist };
      } else if (!hasShip && hasGround && this.isSeaZone(from) && this.isLandZone(id) && out[id] === undefined) {
        // (ground already aboard, selected alone) — tryMove result above covers it; mark as unload
      }
    }
    if (!hasShip && hasGround && this.isSeaZone(from)) for (const v of Object.values(out)) v.type = 'unload';
    return out;
  }

  /** Load ground onto transport at same loc (zone orbital / deep). */
  loadTroops(loc, groundTake) {
    const fac = this.currentFaction;
    const stack = this.getStack(loc, fac);
    const trn = stack.transport || 0;
    if (trn < 1) return { ok: false, err: 'No transport here' };
    let cap = trn * 2;
    // Count already "loaded" — we use a simple cargo map
    if (!this.cargo) this.cargo = {};
    const key = loc + '|' + fac;
    const used = this.cargo[key] || 0;
    const loading = Object.values(groundTake).reduce((a, b) => a + b, 0);
    if (used + loading > cap) return { ok: false, err: 'Transport capacity exceeded' };
    // Cargo stays co-located; capacity tracked
    this.cargo[key] = used + loading;
    this.addLog(`Loaded ${loading} ground onto transport(s) at ${this.locationName(loc)}`);
    this.emit();
    return { ok: true };
  }

  // —— Combat ——
  roll(n) { return Math.floor(Math.random() * n) + 1; }

  startCombat(loc) {
    const fac = this.currentFaction;
    const enemies = this.enemiesAt(loc, fac);
    const zone = this.zones[loc];
    const defenderFac = enemies[0] || (zone && zone.terrain !== 'sea' && zone.owner && FACTIONS[zone.owner].side !== FACTIONS[fac].side ? zone.owner : null);

    // Build attacker / defender unit lists (individual hit points)
    const makeList = (f, isAttacker) => {
      const list = [];
      const stack = this.getStack(loc, f);
      for (const [t, n] of Object.entries(stack)) {
        const u = UNITS[t];
        if (!u) continue;
        // AA doesn't fire in normal combat rounds as attacker
        for (let i = 0; i < n; i++) {
          list.push({
            type: t, fac: f,
            hits: u.hits || 1, maxHits: u.hits || 1,
            attack: u.attack, defense: u.defense,
            kind: u.kind, stealth: !!u.stealth, antiSub: !!u.antiSub,
            supportInf: !!u.supportInf, aaFire: u.aaFire || 0,
          });
        }
      }
      return list;
    };

    let attackers = makeList(fac, true);
    // Friendly allied units in same space also attack? Official: only active power attacks.
    let defenders = [];
    for (const e of enemies) defenders = defenders.concat(makeList(e, false));

    // Empty enemy territory — auto-conquer if we have ground
    if (defenders.length === 0 && zone && zone.terrain !== 'sea' && zone.owner && FACTIONS[zone.owner].side !== FACTIONS[fac].side) {
      const hasGround = attackers.some(u => u.kind === 'ground');
      if (hasGround) {
        const prev = zone.owner;
        zone.owner = fac;
        this.addLog(`Captured ${zone.name} from ${FACTIONS[prev].name} (undefended).`);
        this.pendingCombats = this.pendingCombats.filter(c => c.loc !== loc);
        this.emit();
        return null;
      }
    }

    if (attackers.length === 0 || defenders.length === 0) {
      this.pendingCombats = this.pendingCombats.filter(c => c.loc !== loc);
      return null;
    }

    // Bombardment: friendly ships in adjacent SEA zones fire once before amphibious land combat
    const bombarding = [];
    const amphib = attackers.some(u => u.kind === 'ground') && (
      defenders.some(u => u.kind === 'ground') || (zone && FACTIONS[zone.owner].side !== FACTIONS[fac].side)
    );
    if (amphib && zone && zone.terrain !== 'sea') {
      for (const n of this.neighbors(loc)) {
        if (!this.isSeaZone(n)) continue;
        const stack = this.getStack(n, fac);
        for (const [t, cnt] of Object.entries(stack)) {
          if (cnt > 0 && UNITS[t].bombard) {
            for (let i = 0; i < cnt; i++) {
              bombarding.push({ type: t, fac, attack: UNITS[t].attack, kind: 'ship' });
            }
          }
        }
      }
    }
    // Also include any ships somehow co-located (shouldn't be on land)
    for (const u of attackers) {
      if (UNITS[u.type].bombard && u.kind === 'ship') bombarding.push(u);
    }

    this.combatState = {
      loc,
      attackersFac: fac,
      defendersFac: defenderFac,
      attackers,
      defenders,
      round: 0,
      log: [],
      bombardDone: false,
      canBombard: amphib && bombarding.length > 0,
      bombarding,
      submergeOffered: false,
      done: false,
    };
    this.emit();
    return this.combatState;
  }

  /** Apply artillery +1 to one paired infantry attack. */
  attackValue(unit, allies) {
    let atk = unit.attack;
    if (unit.type === 'infantry') {
      const art = allies.find(a => a.type === 'artillery' && !a._usedSupport);
      if (art) { atk = Math.min(3, atk + 1); art._usedSupport = true; }
    }
    return atk;
  }

  combatFire(side) {
    const cs = this.combatState;
    if (!cs || cs.done) return;
    const isAtk = side === 'attack';
    const firers = isAtk ? cs.attackers : cs.defenders;
    const targets = isAtk ? cs.defenders : cs.attackers;

    // Reset support flags
    for (const u of firers) u._usedSupport = false;

    const hasDestroyer = targets.some(u => u.antiSub) || firers.some(u => u.antiSub);
    // Opponent destroyer cancels sub stealth
    const enemyHasDes = (isAtk ? cs.defenders : cs.attackers).some(u => u.antiSub);

    let hits = 0;
    const rolls = [];

    // Surprise strike: subs fire first in opening if no enemy destroyer
    // Simplified into normal fire with note

    for (const u of firers) {
      if (u.kind === 'ground' && u.aaFire && isAtk) continue; // AA no attack
      if (u.type === 'aa') continue;
      if (u.type === 'transport') continue;

      // Sub stealth: if attacking and enemy has destroyer, normal; subs can still fire
      let val = isAtk ? this.attackValue(u, firers) : u.defense;
      if (val <= 0) continue;
      const r = this.roll(6);
      const hit = r <= val;
      rolls.push({ type: u.type, r, val, hit });
      if (hit) hits++;
    }

    cs.log.push({ side, rolls, hits, round: cs.round });
    cs.pendingHits = { side: isAtk ? 'defend' : 'attack', hits };
    cs.awaitingCasualties = hits > 0;
    if (hits === 0) {
      // auto continue
      cs.awaitingCasualties = false;
    }
    this.emit();
    return { hits, rolls };
  }

  assignCasualties(side, removals) {
    // removals: array of indices into attackers or defenders
    const cs = this.combatState;
    if (!cs) return;
    const list = side === 'attack' ? cs.attackers : cs.defenders;
    // Sort removals descending
    const idx = [...removals].sort((a, b) => b - a);
    let assigned = 0;
    for (const i of idx) {
      const u = list[i];
      if (!u) continue;
      u.hits--;
      assigned++;
      if (u.hits <= 0) list.splice(i, 1);
    }
    // If not enough assigned and hits remain, auto-assign from cheapest
    const needed = (cs.pendingHits && cs.pendingHits.side === side) ? cs.pendingHits.hits : assigned;
    // Clear pending
    cs.pendingHits = null;
    cs.awaitingCasualties = false;
    this.emit();
  }

  autoCasualties(side, hitCount) {
    const cs = this.combatState;
    const list = side === 'attack' ? cs.attackers : cs.defenders;
    // Prefer: damaged BB first absorb, then infantry, etc.
    const order = ['infantry', 'artillery', 'aa', 'submarine', 'fighter', 'destroyer', 'bomber', 'tank', 'transport', 'cruiser', 'carrier', 'battleship'];
    let left = hitCount;
    while (left > 0 && list.length) {
      // Absorb on damaged multi-hit
      const dmg = list.find(u => u.hits < u.maxHits);
      if (dmg) { dmg.hits--; left--; if (dmg.hits <= 0) list.splice(list.indexOf(dmg), 1); continue; }
      // Pick by priority
      let pick = -1;
      for (const t of order) {
        pick = list.findIndex(u => u.type === t);
        if (pick >= 0) break;
      }
      if (pick < 0) pick = 0;
      const u = list[pick];
      u.hits--;
      left--;
      if (u.hits <= 0) list.splice(pick, 1);
    }
    cs.pendingHits = null;
    cs.awaitingCasualties = false;
    this.emit();
  }

  bombardRound() {
    const cs = this.combatState;
    if (!cs || cs.bombardDone || !cs.canBombard) return;
    const ships = (cs.bombarding && cs.bombarding.length) ? cs.bombarding : cs.attackers.filter(u => UNITS[u.type]?.bombard);
    let hits = 0;
    const rolls = [];
    for (const u of ships) {
      const val = u.attack;
      const r = this.roll(6);
      const hit = r <= val;
      rolls.push({ type: u.type, r, val, hit });
      if (hit) hits++;
    }
    cs.log.push({ side: 'bombard', rolls, hits, round: 0 });
    cs.bombardDone = true;
    if (hits > 0) this.autoCasualties('defend', hits);
    this.addLog(`Bombardment at ${this.locationName(cs.loc)}: ${hits} hit(s).`);
    this.emit();
  }

  combatRound() {
    const cs = this.combatState;
    if (!cs || cs.done) return;

    if (cs.canBombard && !cs.bombardDone) this.bombardRound();

    cs.round++;
    // Clear support
    for (const u of cs.attackers) u._usedSupport = false;

    // AA fire vs air on first round of combat (opening)
    if (cs.round === 1) {
      const aa = cs.defenders.filter(u => u.type === 'aa');
      const air = cs.attackers.filter(u => u.kind === 'air');
      let aaHits = 0;
      for (let i = 0; i < Math.min(aa.length, air.length); i++) {
        const r = this.roll(6);
        if (r <= 2) aaHits++; // AA fires at 2 vs air per spec
      }
      if (aaHits > 0) {
        cs.log.push({ side: 'aa', rolls: [], hits: aaHits, round: cs.round });
        // Remove air first
        let left = aaHits;
        for (let i = cs.attackers.length - 1; i >= 0 && left > 0; i--) {
          if (cs.attackers[i].kind === 'air') { cs.attackers.splice(i, 1); left--; }
        }
      }
    }

    // Surprise subs (attackers) if no destroyer on defense
    const defHasDes = cs.defenders.some(u => u.antiSub);
    const atkSubs = cs.attackers.filter(u => u.type === 'submarine');
    if (!defHasDes && atkSubs.length && cs.round === 1) {
      let sh = 0;
      for (const s of atkSubs) {
        const r = this.roll(6);
        if (r <= s.attack) sh++;
      }
      if (sh) {
        cs.log.push({ side: 'surprise', rolls: [], hits: sh, round: cs.round });
        this.autoCasualties('defend', sh);
      }
    }

    // Attack fire
    let atkHits = 0;
    const atkRolls = [];
    for (const u of cs.attackers) {
      if (u.type === 'aa' || u.type === 'transport') continue;
      // Subs already did surprise — still fire normally after if destroyer present; if surprise, they also fire in general combat per 1942 after
      let val = this.attackValue(u, cs.attackers);
      if (val <= 0) continue;
      const r = this.roll(6);
      const hit = r <= val;
      atkRolls.push({ type: u.type, r, val, hit });
      if (hit) atkHits++;
    }
    cs.log.push({ side: 'attack', rolls: atkRolls, hits: atkHits, round: cs.round });
    if (atkHits) this.autoCasualties('defend', atkHits);

    // Defense fire
    let defHits = 0;
    const defRolls = [];
    for (const u of cs.defenders) {
      if (u.type === 'aa' || u.type === 'transport') continue;
      const val = u.defense;
      if (val <= 0) continue;
      const r = this.roll(6);
      const hit = r <= val;
      defRolls.push({ type: u.type, r, val, hit });
      if (hit) defHits++;
    }
    cs.log.push({ side: 'defend', rolls: defRolls, hits: defHits, round: cs.round });
    if (defHits) this.autoCasualties('attack', defHits);

    this.addLog(`Combat round ${cs.round} at ${this.locationName(cs.loc)}: Atk ${atkHits} hit(s), Def ${defHits} hit(s).`);

    // Submerge option for losing subs
    this._checkCombatEnd();
    this.emit();
  }

  submergeSubs(side) {
    const cs = this.combatState;
    if (!cs) return;
    const list = side === 'attack' ? cs.attackers : cs.defenders;
    const enemy = side === 'attack' ? cs.defenders : cs.attackers;
    if (enemy.some(u => u.antiSub)) {
      this.addLog('Cannot submerge — enemy destroyer present.');
      return;
    }
    // Remove subs from combat (they survive, stay in loc)
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].type === 'submarine') list.splice(i, 1);
    }
    this.addLog('Submarines submerged and escaped combat.');
    this._checkCombatEnd();
    this.emit();
  }

  _checkCombatEnd() {
    const cs = this.combatState;
    if (!cs) return;
    if (cs.attackers.length === 0 || cs.defenders.length === 0) {
      this.resolveCombatEnd();
    }
  }

  retreat() {
    const cs = this.combatState;
    if (!cs) return;
    // Attackers retreat — put survivors back... simplified: stay but end combat without conquest
    this.addLog(`Attacker retreated from ${this.locationName(cs.loc)}.`);
    this._writeBackCombat(false);
    cs.done = true;
    this.combatState = null;
    if (this.isFree(cs.loc) && !Object.keys(this.units[cs.loc] || {}).some(f => this.totalAt(cs.loc, f) > 0)) {
      delete this.units[cs.loc]; delete this.freePos[cs.loc];
    }
    this.pendingCombats = this.pendingCombats.filter(c => c.loc !== cs.loc);
    this.emit();
  }

  resolveCombatEnd() {
    const cs = this.combatState;
    if (!cs) return;
    const atkWins = cs.defenders.length === 0 && cs.attackers.length > 0;
    const defWins = cs.attackers.length === 0;
    this._writeBackCombat(atkWins);

    if (atkWins) {
      const zone = this.zones[cs.loc];
      if (zone && zone.terrain !== 'sea' && zone.owner && FACTIONS[zone.owner].side !== FACTIONS[cs.attackersFac].side) {
        const hasGround = cs.attackers.some(u => u.kind === 'ground');
        if (hasGround) {
          const prev = zone.owner;
          zone.owner = cs.attackersFac;
          this.addLog(`Captured ${zone.name} (${zone.vc ? 'VC: ' + zone.vc + ' — ' : ''}was ${FACTIONS[prev].name}).`);
        }
      }
      this.addLog(`Combat won by attacker at ${this.locationName(cs.loc)}.`);
    } else if (defWins) {
      this.addLog(`Combat won by defender at ${this.locationName(cs.loc)}.`);
    } else {
      this.addLog(`Combat wiped both sides at ${this.locationName(cs.loc)}.`);
    }

    cs.done = true;
    this.combatState = null;
    if (this.isFree(cs.loc) && !Object.keys(this.units[cs.loc] || {}).some(f => this.totalAt(cs.loc, f) > 0)) {
      delete this.units[cs.loc]; delete this.freePos[cs.loc];
    }
    this.pendingCombats = this.pendingCombats.filter(c => c.loc !== cs.loc);
    this.emit();
  }

  _writeBackCombat(atkWins) {
    const cs = this.combatState;
    const loc = cs.loc;
    // Always clear both sides' factions at this loc (even if one list is empty)
    const facs = new Set([cs.attackersFac, cs.defendersFac].filter(Boolean));
    for (const u of cs.attackers) facs.add(u.fac);
    for (const u of cs.defenders) facs.add(u.fac);
    if (this.units[loc]) {
      for (const f of [...facs]) delete this.units[loc][f];
    }
    const addFrom = (list) => {
      for (const u of list) {
        // damaged BB still present
        this.addUnits(loc, u.fac, { [u.type]: 1 });
      }
    };
    addFrom(cs.attackers);
    addFrom(cs.defenders);
  }

  // Strategic bombing
  strategicBomb(from, to, bomberCount) {
    const fac = this.currentFaction;
    if (this.currentPhase !== 'combatMove' && this.currentPhase !== 'combat') return { ok: false, err: 'Wrong phase' };
    const zone = this.zones[to];
    if (!zone || !zone.factory) return { ok: false, err: 'No factory/production to bomb' };
    if (!zone.owner || zone.terrain === 'sea') return { ok: false, err: 'Invalid SBR target' };
    if (FACTIONS[zone.owner].side === FACTIONS[fac].side) return { ok: false, err: 'Friendly target' };
    const stack = this.getStack(from, fac);
    if ((stack.bomber || 0) < bomberCount) return { ok: false, err: 'Not enough bombers' };

    // Move bombers to target for SBR then resolve
    this.removeUnits(from, fac, { bomber: bomberCount });
    this.addUnits(to, fac, { bomber: bomberCount });

    // AA fire
    const def = this.getStack(to, zone.owner);
    const aa = def.aa || 0;
    let survived = bomberCount;
    let aaKills = 0;
    for (let i = 0; i < Math.min(aa, bomberCount); i++) {
      if (this.roll(6) <= 2) { aaKills++; survived--; }
    }
    if (aaKills) this.removeUnits(to, fac, { bomber: aaKills });

    // Each surviving bomber rolls 1d6 damage to IPC
    let dmg = 0;
    for (let i = 0; i < survived; i++) dmg += this.roll(6);
    const victim = zone.owner;
    const paid = Math.min(dmg, this.ipc[victim]);
    this.ipc[victim] -= paid;
    this.addLog(`Strategic bombing ${zone.name}: ${survived} bomber(s) deal ${paid} IPC damage (${aaKills} lost to AA).`);
    this.emit();
    return { ok: true, dmg: paid, aaKills };
  }

  // —— Mobilize ——
  mobilize(loc, placements) {
    // placements: {type: count}
    if (this.currentPhase !== 'mobilize') return { ok: false, err: 'Wrong phase' };
    const fac = this.currentFaction;
    const zone = this.zones[loc];
    if (!zone || zone.owner !== fac) return { ok: false, err: 'Must mobilize in owned zone' };
    // Factories can place; planets can build AA and fighters per spec — allow place on any owned zone with factory for most; AA/fighters on any owned planet zone
    for (const [t, n] of Object.entries(placements)) {
      if (n <= 0) continue;
      const pud = this.purchased.find(p => p.type === t);
      if (!pud || pud.count < n) return { ok: false, err: `Not purchased enough ${t}` };
      const u = UNITS[t];
      if (zone.factory) {
        // ok
      } else if ((t === 'aa' || t === 'fighter') && SYSTEMS[zone.system] && SYSTEMS[zone.system].kind === 'planet') {
        // Spec: Planets can build AA and fighters
      } else if (u.kind === 'ship' && zone.factory) {
        // ships at factory coastal — we allow at factory zone orbital
      } else {
        return { ok: false, err: `${u.name} needs a factory (or planet for AA/fighter)` };
      }
    }
    for (const [t, n] of Object.entries(placements)) {
      if (n <= 0) continue;
      const pud = this.purchased.find(p => p.type === t);
      pud.count -= n;
      this.addUnits(loc, fac, { [t]: n });
    }
    this.purchased = this.purchased.filter(p => p.count > 0);
    this.addLog(`Mobilized at ${zone.name}.`);
    this.emit();
    return { ok: true };
  }

  // —— Phase machine ——
  nextPhase() {
    if (this.winner) return;

    const phase = this.currentPhase;

    if (phase === 'combatMove') {
      // auto-start listing combats
    }
    if (phase === 'combat') {
      if (this.pendingCombats.length > 0 || this.combatState) {
        this.addLog('Resolve all combats before ending combat phase.');
        this.emit();
        return false;
      }
    }
    if (phase === 'mobilize') {
      // leftover purchases are lost? Official: must place or keep — we keep unplaced as lost IPC units for simplicity warn
      if (this.purchased.length) {
        this.addLog('Warning: unplaced units remain — place them or they stay in pool for next try (place now).');
      }
    }
    if (phase === 'collect') {
      const income = this.computeIncome(this.currentFaction);
      this.ipc[this.currentFaction] += income;
      this.addLog(`${this.faction.name} collects ${income} IPC (treasury ${this.ipc[this.currentFaction]}).`);
      // End turn
      this.purchased = [];
      this.pendingCombats = [];
      this.cargo = {};
      this.turnIndex++;
      if (this.turnIndex >= TURN_ORDER.length) {
        this.turnIndex = 0;
        // Victory check after Terran (US) — i.e. end of round
        this.checkVictory();
        this.round++;
        this.addLog(`—— Round ${this.round} begins ——`);
      }
      this.phaseIndex = 0;
      this.addLog(`${this.faction.name}'s turn — Purchase phase.`);
      this.emit();
      return true;
    }

    this.phaseIndex++;
    this.addLog(`Phase: ${this.currentPhase}`);
    // Entering collect auto? No — user clicks collect via end phase
    this.emit();
    return true;
  }

  /** Skip to end of turn helper for playtest */
  autoCollectAndEnd() {
    while (this.currentPhase !== 'collect' && !this.winner) {
      if (this.currentPhase === 'combat' && this.pendingCombats.length) {
        for (const c of [...this.pendingCombats]) {
          this.startCombat(c.loc);
          let guard = 0;
          while (this.combatState && !this.combatState.done && guard++ < 20) {
            this.combatRound();
          }
        }
      }
      if (!this.nextPhase()) break;
    }
    if (this.currentPhase === 'collect') this.nextPhase();
  }

  unitCountSummary(loc) {
    const rows = [];
    for (const fac of Object.keys(this.units[loc] || {})) {
      const stack = this.units[loc][fac];
      const parts = Object.entries(stack).filter(([, n]) => n > 0).map(([t, n]) => `${n}${UNITS[t].abbrev}`);
      if (parts.length) rows.push({ fac, parts: parts.join(' '), total: this.totalAt(loc, fac) });
    }
    return rows;
  }
}
