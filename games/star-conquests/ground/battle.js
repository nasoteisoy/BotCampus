// Star Conquests — Ground Battle module (Dev B).
// Contract: export function startBattle(opts, onDone) from ground/battle.js
import { GroundSim, GROUND_TYPES, DEFAULT_STATS, coverDamageMul } from './sim.js';
import { GroundView } from './view.js';

export { GROUND_TYPES, DEFAULT_STATS, coverDamageMul };

/**
 * @returns {Promise<{winner,survivors,pointsEarned}>}
 */
export function startBattle(opts = {}, onDone) {
  let settled = false;
  let resolvePromise;
  const promise = new Promise((res) => { resolvePromise = res; });
  let view = null;
  let raf = 0;

  const finish = (result) => {
    if (settled) return;
    settled = true;
    try { if (raf) cancelAnimationFrame(raf); } catch (_) {}
    raf = 0;
    try { view?.dispose(); } catch (_) {}
    view = null;
    if (opts.mount) {
      while (opts.mount.firstChild) opts.mount.removeChild(opts.mount.firstChild);
    }
    try { if (typeof window !== 'undefined') delete window.__scGround; } catch (_) {}
    try { if (typeof onDone === 'function') onDone(result); } catch (_) {}
    resolvePromise(result);
  };

  const attAll = opts.attacker?.units || [];
  const defAll = opts.defender?.units || [];
  const attGround = attAll.filter((u) => GROUND_TYPES.has(u?.type));
  const defGround = defAll.filter((u) => GROUND_TYPES.has(u?.type));

  const playerIs = opts.attacker?.side === 'player' ? 'attacker'
    : opts.defender?.side === 'player' ? 'defender' : 'attacker';

  if (!opts.mount) {
    Promise.resolve().then(() => finish(emptyResult(attAll, defAll, attGround.length ? 'attacker' : 'defender', playerIs)));
    return promise;
  }

  if (!attGround.length || !defGround.length) {
    const winner = attGround.length ? 'attacker' : 'defender';
    Promise.resolve().then(() => finish(instantResult(opts, winner, playerIs)));
    return promise;
  }

  const mw = opts.mount.clientWidth || 320;
  const mh = opts.mount.clientHeight || 480;
  const sim = new GroundSim({ ...opts, portrait: mh > mw * 1.05 });
  let ending = false;

  // After outro phase reaches 'done', cleanup then onDone exactly once.
  const endAfterBanner = () => {
    if (ending || settled) return;
    ending = true;
    // one more paint of outro, then wait until phase === 'done'
  };

  view = new GroundView(opts.mount, sim, {
    onRetreat: () => {
      if (settled || ending) return;
      sim.retreat();
      endAfterBanner();
    },
    onSpeed: () => {},
  });

  let last = performance.now();
  const frame = (now) => {
    if (settled) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    sim.step(dt);
    view.draw(dt);
    if (sim.over && sim.phase === 'outro') ending = true;
    if (sim.phase === 'done') {
      finish(sim._pendingResult || sim.result());
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  try {
    window.__scGround = {
      sim, view,
      get phase() { return sim.phase; },
      get selected() { return sim.selected; },
      tapWorld: (x, y) => sim.tap(x, y),
      retreat: () => { if (!settled && !sim.over) { sim.retreat(); endAfterBanner(); } },
      cycleSpeed: () => sim.cycleSpeed(),
      get speed() { return sim.speed; },
      skipBanner: () => sim.skipBanner(),
      skipDrop: () => {
        if (sim.phase === 'intro') { sim.phase = 'drop'; sim.introT = 99; }
        sim.phase = 'fight'; sim.ship.done = true; sim.dropT = 99;
        for (const u of sim.units) { u.landed = true; u.dropY = u.y; }
      },
      skipToFight: () => {
        sim.bannerSkip = true;
        sim.phase = 'fight';
        sim.ship.done = true;
        sim.dropT = 99;
        sim.lastDamageAt = sim.time;
        sim.lastDamageBySide = { attacker: sim.time, defender: sim.time };
        for (const u of sim.units) { u.landed = true; u.dropY = u.y; }
      },
      forceOut: (id) => {
        const u = sim.units.find((x) => x.id === id);
        if (u) { u.hpNow = 0; sim._takeOut(u); }
      },
      forceCrawl: (id) => {
        const u = sim.units.find((x) => x.id === id);
        if (u && sim.alive(u)) { u.hpNow = Math.max(1, u.stats.hp * 0.2); u.status = 'crawl'; }
      },
      wipeSide: (side) => {
        for (const u of sim.units) if (u.side === side && sim.alive(u)) { u.hpNow = 0; sim._takeOut(u); }
        sim._checkVictory();
      },
      units: () => sim.units.map((u) => ({
        id: u.id, side: u.side, type: u.type, status: u.status,
        hpNow: u.hpNow, x: +u.x.toFixed(2), y: +u.y.toFixed(2),
        landed: u.landed, selected: !!u.selected, covered: !!u.covered,
      })),
      touchTargetPx: () => view.touchTargetPx(),
      unitPixelSize: () => view.unitPixelSize(),
      fieldFillRatio: () => view.fieldFillRatio(),
      labelOverlap: () => view.labelOverlapReport(),
      avgFrameMs: () => view.avgFrameMs(),
      coverMul: coverDamageMul,
      isCovered: (tid, sid) => {
        const t = sim.units.find((u) => u.id === tid);
        const s = sim.units.find((u) => u.id === sid);
        return sim.isCovered(t, s);
      },
    };
  } catch (_) {}

  return promise;
}

function keepSurvivors(units, keepGroundAlive) {
  return (units || []).filter((u) => {
    if (!GROUND_TYPES.has(u?.type)) return true;
    if (!keepGroundAlive) return false;
    return (u.hpNow == null ? 1 : u.hpNow) > 0;
  }).map((u) => ({
    id: u.id, type: u.type, name: u.name, icon: u.icon,
    stats: u.stats ? { ...u.stats } : u.stats,
    hpNow: u.hpNow,
  }));
}

function pointsFor(winner, playerIs, enemyGroundCount) {
  if (winner !== playerIs) return 0;
  return 10 + 5 * enemyGroundCount;
}

function emptyResult(attAll, defAll, winner, playerIs) {
  return {
    winner,
    survivors: { attacker: keepSurvivors(attAll, winner === 'attacker'), defender: keepSurvivors(defAll, winner === 'defender') },
    pointsEarned: 0,
  };
}

function instantResult(opts, winner, playerIs) {
  const attAll = opts.attacker?.units || [];
  const defAll = opts.defender?.units || [];
  const enemyUnits = playerIs === 'attacker'
    ? (opts.defender?.units || []).filter((u) => GROUND_TYPES.has(u?.type))
    : (opts.attacker?.units || []).filter((u) => GROUND_TYPES.has(u?.type));
  return {
    winner,
    survivors: {
      attacker: keepSurvivors(attAll, winner === 'attacker'),
      defender: keepSurvivors(defAll, winner === 'defender'),
    },
    pointsEarned: pointsFor(winner, playerIs, enemyUnits.length),
  };
}

try { if (typeof window !== 'undefined') window.startGroundBattle = startBattle; } catch (_) {}

export default startBattle;
