// Game state: ownership, garrisons, turns, AI, win/lose.
import { PLANETS, HOME_PLAYER, CAPTURE_BONUS, neighbors, areLinked, planetById } from './galaxy.js';
import { makeUnit, resetUid, peekUid, filterForBattle, byType, SPACE_TYPES, GROUND_TYPES } from './shop.js';
import { writeSave, loadSave } from './save.js';

export const PLAYER = 'player';
export const ENEMY = 'enemy';
export const COLORS = { player: '#3aa0ff', enemy: '#e04848' };

function emptyGarrisons() {
  const g = {};
  for (const p of PLANETS) g[p.id] = [];
  return g;
}

function emptyOwner() {
  const o = {};
  for (const p of PLANETS) o[p.id] = ENEMY;
  o[HOME_PLAYER] = PLAYER;
  return o;
}

export function newGame() {
  resetUid(0);
  const owners = emptyOwner();
  const garrisons = emptyGarrisons();

  garrisons[HOME_PLAYER] = [
    makeUnit('rifle', 'Rifle 1'),
    makeUnit('rifle', 'Rifle 2'),
    makeUnit('recon', 'Recon 1'),
    makeUnit('spaceship', 'SpaceShip 1'),
  ];

  const far = new Set(['nexus', 'glacier', 'cinder', 'granite']);
  let ei = 0;
  for (const p of PLANETS) {
    if (p.id === HOME_PLAYER) continue;
    ei += 1;
    const units = [
      makeUnit('rifle', `E-Rifle ${ei}a`),
      makeUnit('rifle', `E-Rifle ${ei}b`),
    ];
    if (far.has(p.id)) {
      units.push(makeUnit('heavy', `E-Heavy ${ei}`), makeUnit('spaceship', `E-Ship ${ei}`));
    } else if (p.size >= 2) {
      units.push(makeUnit('recon', `E-Recon ${ei}`));
      if (ei % 2 === 0) units.push(makeUnit('spaceship', `E-Ship ${ei}`));
    }
    garrisons[p.id] = units;
  }

  return {
    v: 1,
    turn: 1,
    phase: 'player',
    points: 180, // credits
    owners,
    garrisons,
    uid: peekUid(),
    selected: null, // pick fleet first
    movedFleets: [], // planet ids whose fleet already acted this turn
    unlockedClasses: ['rifle', 'heavy', 'sniper', 'engineer'], // 4 base; buy officer/special
    activeBonus: null,     // { id: 'reinforce'|'hero'|'medical'|... } ground applies itself
    tickets: null,         // optional { attacker, defender } override
    log: ['New game'],
    result: null,
  };
}

export function restoreGame(data) {
  if (!data || data.v !== 1) return newGame();
  resetUid(data.uid || 0);
  const garrisons = emptyGarrisons();
  for (const id of Object.keys(data.garrisons || {})) {
    garrisons[id] = (data.garrisons[id] || []).map((u) => ({
      id: u.id, type: u.type, name: u.name, icon: u.icon,
      stats: { ...u.stats }, hpNow: u.hpNow ?? u.stats?.hp ?? 1,
    }));
  }
  return {
    v: 1,
    turn: data.turn | 0 || 1,
    phase: data.phase === 'enemy' || data.phase === 'battle' ? 'player' : (data.phase || 'player'),
    points: Math.max(0, data.points | 0),
    owners: { ...emptyOwner(), ...(data.owners || {}) },
    garrisons,
    uid: peekUid(),
    selected: data.selected || null,
    movedFleets: Array.isArray(data.movedFleets) ? data.movedFleets.slice() : [],
    unlockedClasses: Array.isArray(data.unlockedClasses) ? data.unlockedClasses.slice() : null,
    activeBonus: data.activeBonus && data.activeBonus.id ? { id: data.activeBonus.id } : null,
    tickets: data.tickets && typeof data.tickets === 'object' ? { ...data.tickets } : null,
    log: Array.isArray(data.log) ? data.log.slice(-40) : [],
    result: data.result || null,
  };
}

export function serialize(state) {
  return {
    v: 1,
    turn: state.turn,
    phase: state.phase === 'battle' ? 'player' : state.phase,
    points: state.points,
    owners: { ...state.owners },
    garrisons: Object.fromEntries(
      Object.entries(state.garrisons).map(([k, arr]) => [k, arr.map((u) => ({
        id: u.id, type: u.type, name: u.name, icon: u.icon,
        stats: { ...u.stats }, hpNow: u.hpNow,
      }))]),
    ),
    uid: peekUid(),
    selected: state.selected,
    movedFleets: Array.isArray(state.movedFleets) ? state.movedFleets.slice() : [],
    unlockedClasses: Array.isArray(state.unlockedClasses) ? state.unlockedClasses.slice() : null,
    activeBonus: state.activeBonus && state.activeBonus.id ? { id: state.activeBonus.id } : null,
    tickets: state.tickets && typeof state.tickets === 'object' ? { ...state.tickets } : null,
    log: (state.log || []).slice(-40),
    result: state.result,
  };
}

export function autosave(state) {
  state.uid = peekUid();
  writeSave(serialize(state));
}

export function ownedBy(state, side) {
  return PLANETS.filter((p) => state.owners[p.id] === side).map((p) => p.id);
}

export function checkEnd(state) {
  const mine = ownedBy(state, PLAYER);
  const theirs = ownedBy(state, ENEMY);
  if (mine.length === 0) { state.result = 'lose'; state.phase = 'over'; return 'lose'; }
  if (theirs.length === 0) { state.result = 'win'; state.phase = 'over'; return 'win'; }
  return null;
}

export function buyUnit(state, type, planetId) {
  const c = byType(type);
  if (!c) return { ok: false, reason: 'bad' };
  if (state.owners[planetId] !== PLAYER) return { ok: false, reason: 'planet' };
  if (state.points < c.cost) return { ok: false, reason: 'points' };
  state.points -= c.cost;
  const count = state.garrisons[planetId].filter((u) => u.type === type).length + 1;
  const labels = {
    rifle: `Rifle ${count}`, heavy: `Heavy ${count}`, recon: `Recon ${count}`,
    tank: `Tank ${count}`, spaceship: `SpaceShip ${count}`, battleship: `BattleShip ${count}`,
  };
  const u = makeUnit(type, labels[type] || `${c.name} ${count}`);
  state.garrisons[planetId].push(u);
  state.log.push(`Bought ${u.name} → ${planetById(planetId).name}`);
  autosave(state);
  return { ok: true, unit: u };
}

export function fleetAlreadyMoved(state, planetId) {
  return (state.movedFleets || []).includes(planetId);
}

export function markFleetMoved(state, fromId, toId) {
  if (!state.movedFleets) state.movedFleets = [];
  // from is spent; if all units left, from stays marked; destination gets the fleet for next turns
  if (!state.movedFleets.includes(fromId)) state.movedFleets.push(fromId);
  if (toId && !state.movedFleets.includes(toId)) state.movedFleets.push(toId);
}

export function moveUnits(state, fromId, toId, unitIds) {
  if (!areLinked(fromId, toId)) return { ok: false, reason: 'link' };
  if (state.owners[fromId] !== PLAYER) return { ok: false, reason: 'from' };
  if (state.owners[toId] !== PLAYER) return { ok: false, reason: 'to' };
  if (fleetAlreadyMoved(state, fromId)) return { ok: false, reason: 'moved' };
  if (!planetHasFleet(state, fromId)) return { ok: false, reason: 'nofleet' };
  const set = new Set(unitIds);
  let moving = state.garrisons[fromId].filter((u) => set.has(u.id));
  if (!moving.some((u) => SPACE_TYPES.has(u.type))) {
    const ship = state.garrisons[fromId].find((u) => SPACE_TYPES.has(u.type));
    if (ship) moving = [ship, ...moving];
  }
  if (!moving.length) return { ok: false, reason: 'none' };
  if (!moving.some((u) => SPACE_TYPES.has(u.type))) return { ok: false, reason: 'nofleet' };
  state.garrisons[fromId] = state.garrisons[fromId].filter((u) => !set.has(u.id));
  state.garrisons[toId].push(...moving);
  markFleetMoved(state, fromId, toId);
  state.log.push(`Moved ${moving.length} → ${planetById(toId).name}`);
  autosave(state);
  return { ok: true, moved: moving };
}


/** A fleet = at least one spaceship/battleship at the planet. Needed to move/attack. */
export function planetHasFleet(state, planetId) {
  return (state.garrisons[planetId] || []).some((u) => SPACE_TYPES.has(u.type));
}

export function fleetShipType(state, planetId) {
  const g = state.garrisons[planetId] || [];
  if (g.some((u) => u.type === 'battleship')) return 'battleship';
  if (g.some((u) => u.type === 'spaceship')) return 'spaceship';
  return null;
}

export function groundCargo(state, planetId) {
  return (state.garrisons[planetId] || []).filter((u) => GROUND_TYPES.has(u.type));
}

export function prepareAttack(state, fromId, toId, unitIds) {
  if (!areLinked(fromId, toId)) return { ok: false, reason: 'link' };
  if (state.owners[fromId] !== PLAYER) return { ok: false, reason: 'from' };
  if (state.owners[toId] === PLAYER) return { ok: false, reason: 'friendly' };
  if (fleetAlreadyMoved(state, fromId)) return { ok: false, reason: 'moved' };
  if (!planetHasFleet(state, fromId)) return { ok: false, reason: 'nofleet' };
  const set = new Set(unitIds);
  let attackers = state.garrisons[fromId].filter((u) => set.has(u.id));
  if (!attackers.some((u) => SPACE_TYPES.has(u.type))) {
    const ship = state.garrisons[fromId].find((u) => SPACE_TYPES.has(u.type));
    if (ship) attackers = [ship, ...attackers];
  }
  if (!attackers.length) return { ok: false, reason: 'none' };
  if (!attackers.some((u) => SPACE_TYPES.has(u.type))) return { ok: false, reason: 'nofleet' };
  const defenders = state.garrisons[toId].map((u) => ({ ...u, stats: { ...u.stats } }));
  const planet = planetById(toId);
  return {
    ok: true,
    fromId, toId,
    attackers: attackers.map((u) => ({ ...u, stats: { ...u.stats } })),
    defenders,
    committedIds: attackers.map((u) => u.id),
    attackerSide: PLAYER,
    defenderSide: ENEMY,
    planet: { id: planet.id, name: planet.name, icon: planet.icon, biome: planet.biome, size: planet.size },
    seed: (state.turn * 997 + planet.id.length * 13) | 0,
  };
}

/** Merge survivor hp into working attacker/defender lists; add pointsEarned for the player. */
export function applyStageResult(state, ctx, result, stage) {
  const space = new Set(['spaceship', 'battleship']);
  const ground = new Set(['rifle', 'heavy', 'recon', 'tank']);
  const role = stage === 'space' ? space : ground;

  const merge = (list, key) => {
    const byId = new Map((result.survivors[key] || []).map((u) => [u.id, u]));
    return list.map((u) => {
      if (!role.has(u.type)) return u;
      const s = byId.get(u.id);
      if (!s) return null;
      return { ...u, hpNow: s.hpNow, stats: { ...u.stats, ...(s.stats || {}) } };
    }).filter(Boolean);
  };
  ctx.attackers = merge(ctx.attackers, 'attacker');
  ctx.defenders = merge(ctx.defenders, 'defender');
  state.points += Math.max(0, result.pointsEarned | 0);
  return result.winner;
}

/** After space+ground (or skips), place survivors and maybe capture. */
export function resolveAttackEnd(state, ctx, finalWinner) {
  const attIds = new Set(ctx.committedIds);
  state.garrisons[ctx.fromId] = state.garrisons[ctx.fromId].filter((u) => !attIds.has(u.id));

  const attLive = ctx.attackers.filter((u) => u.hpNow > 0);
  const defLive = ctx.defenders.filter((u) => u.hpNow > 0);
  const attackerSide = ctx.attackerSide || PLAYER;
  const captured = finalWinner === 'attacker' && attLive.length > 0;

  if (captured) {
    state.owners[ctx.toId] = attackerSide;
    state.garrisons[ctx.toId] = attLive;
    if (attackerSide === PLAYER) {
      state.points += CAPTURE_BONUS;
      state.log.push(`Captured ${planetById(ctx.toId).name} (+${CAPTURE_BONUS} credits)`);
    } else {
      state.log.push(`Lost ${planetById(ctx.toId).name}`);
    }
  } else {
    state.garrisons[ctx.fromId].push(...attLive);
    state.garrisons[ctx.toId] = defLive;
    if (attackerSide === PLAYER) state.log.push(`Attack failed`);
    else state.log.push(`Held ${planetById(ctx.toId).name}`);
  }
  autosave(state);
  return checkEnd(state);
}

export function enemyPlan(state) {
  const enemyPlanets = ownedBy(state, ENEMY);
  const playerPlanets = ownedBy(state, PLAYER);
  const attacks = [];
  const moves = [];

  for (const eid of enemyPlanets) {
    const garrison = state.garrisons[eid];
    if (!garrison.length) continue;
    const nearPlayer = neighbors(eid).filter((n) => state.owners[n] === PLAYER);
    if (nearPlayer.length) {
      nearPlayer.sort((a, b) => state.garrisons[a].length - state.garrisons[b].length);
      const target = nearPlayer[0];
      const send = garrison.length > 2 ? garrison.slice(0, garrison.length - 1) : garrison.slice();
      if (send.length) attacks.push({ fromId: eid, toId: target, units: send });
      continue;
    }
    if (playerPlanets.length && garrison.length > 1) {
      let best = null, bestD = 99;
      for (const n of neighbors(eid)) {
        if (state.owners[n] !== ENEMY) continue;
        for (const pp of playerPlanets) {
          const A = planetById(n), B = planetById(pp);
          const d = Math.hypot(A.x - B.x, A.y - B.y);
          if (d < bestD) { bestD = d; best = n; }
        }
      }
      if (best) {
        moves.push({ fromId: eid, toId: best, units: garrison.slice(0, Math.ceil(garrison.length / 2)) });
      }
    }
  }
  return { attack: attacks[0] || null, moves: moves.slice(0, 2) };
}

export function applyEnemyMove(state, move) {
  const ids = new Set(move.units.map((u) => u.id));
  const moving = state.garrisons[move.fromId].filter((u) => ids.has(u.id));
  state.garrisons[move.fromId] = state.garrisons[move.fromId].filter((u) => !ids.has(u.id));
  state.garrisons[move.toId].push(...moving);
}

export function prepareEnemyAttack(state, attack) {
  const planet = planetById(attack.toId);
  return {
    ok: true,
    fromId: attack.fromId,
    toId: attack.toId,
    attackers: attack.units.map((u) => ({ ...u, stats: { ...u.stats } })),
    defenders: state.garrisons[attack.toId].map((u) => ({ ...u, stats: { ...u.stats } })),
    committedIds: attack.units.map((u) => u.id),
    attackerSide: ENEMY,
    defenderSide: PLAYER,
    planet: { id: planet.id, name: planet.name, icon: planet.icon, biome: planet.biome, size: planet.size },
    seed: (state.turn * 991 + 42) | 0,
  };
}

export function turnIncome(state) {
  let credits = 0;
  const parts = [];
  for (const p of PLANETS) {
    if (state.owners[p.id] !== PLAYER) continue;
    const c = p.passive?.credits | 0;
    if (c) { credits += c; parts.push(`${p.name} +${c}`); }
  }
  // Small win bonus already in points; show base income only
  return { credits, parts, total: credits };
}

export function endPlayerTurn(state) {
  // Income + passives apply when the player ends their turn (credits rise immediately)
  const inc = turnIncome(state);
  if (inc.total > 0) state.points += inc.total;
  state._lastIncome = inc;
  state.phase = 'enemy';
  state.turn += 1;
  state.movedFleets = [];
  autosave(state);
  return inc;
}

export function endEnemyTurn(state) {
  state.phase = 'player';
  // Income already granted at endPlayerTurn — do not double-apply
  autosave(state);
  return checkEnd(state);
}

export { filterForBattle, CAPTURE_BONUS, loadSave, neighbors, areLinked, planetById };
