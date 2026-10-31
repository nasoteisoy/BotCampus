// Star Conquests — Ground Battle module (Dev B).
// Contract: export function startBattle(opts, onDone) from ground/battle.js
import { GroundSim, GROUND_TYPES, DEFAULT_STATS, coverDamageMul, ticketsFromArmy } from './sim.js';
import { GroundView } from './view.js';
import { GroundView3D, canWebGL } from './view3d.js';

export { GROUND_TYPES, DEFAULT_STATS, coverDamageMul, ticketsFromArmy };

function enrichResult(result, sim) {
  if (!result) result = {};
  if (sim) {
    const r = sim._pendingResult || sim.result();
    result.ticketsLeft = result.ticketsLeft || r.ticketsLeft || {
      attacker: Math.max(0, sim.tickets.attacker | 0),
      defender: Math.max(0, sim.tickets.defender | 0),
    };
    result.kills = result.kills || r.kills || { attacker: sim.kills?.attacker | 0, defender: sim.kills?.defender | 0 };
    result.cpsTaken = result.cpsTaken != null ? result.cpsTaken : (r.cpsTaken | 0);
    result.stats = result.stats || r.stats || {
      damageDealt: 0, damageTaken: 0, deaths: 0, captures: 0, shotsFired: 0, timeInLead: 0, kills: 0,
    };
  } else {
    result.ticketsLeft = result.ticketsLeft || { attacker: 0, defender: 0 };
    result.kills = result.kills || { attacker: 0, defender: 0 };
    result.cpsTaken = result.cpsTaken | 0;
    result.stats = result.stats || { damageDealt: 0, damageTaken: 0, deaths: 0, captures: 0, shotsFired: 0, timeInLead: 0, kills: 0 };
  }
  return result;
}


/**
 * @returns {Promise<{winner,survivors,pointsEarned,retreated?,lost?,ticketsLeft}>}
 */
export function startBattle(opts = {}, onDone) {
  let settled = false;
  let resolvePromise;
  const promise = new Promise((res) => { resolvePromise = res; });
  let view = null;
  let raf = 0;
  let ending = false;
  const mount = opts.mount || null;

  const finish = (result) => {
    if (settled) return;
    settled = true;
    try { if (raf) cancelAnimationFrame(raf); } catch (_) {}
    raf = 0;
    unbindMount();
    try { view?.dispose(); } catch (_) {}
    view = null;
    if (mount) {
      while (mount.firstChild) mount.removeChild(mount.firstChild);
    }
    try { if (typeof window !== 'undefined') delete window.__scGround; } catch (_) {}
    result = enrichResult(result, sim);
    try { if (typeof onDone === 'function') onDone(result); } catch (_) {}
    resolvePromise(result);
  };

  const onPauseEv = () => { paused = true; };
  const onResumeEv = () => { paused = false; last = performance.now(); };
  const onQuitEv = () => {
    if (settled || ending) return;
    ending = true;
    if (sim) {
      sim.retreated = true;
      sim.over = sim.playerSide === 'attacker' ? 'defender' : 'attacker';
      const r = sim.result();
      r.winner = sim.over;
      r.pointsEarned = 0;
      r.retreated = true;
      r.ticketsLeft = {
        attacker: Math.max(0, sim.tickets.attacker | 0),
        defender: Math.max(0, sim.tickets.defender | 0),
      };
      sim._pendingResult = r;
      sim.phase = 'done';
      sim.bannerSkip = true;
    } else {
      finish(retreatResult(opts, playerIs));
    }
  };

  function unbindMount() {
    if (!mount) return;
    try { mount.removeEventListener('sc-pause', onPauseEv); } catch (_) {}
    try { mount.removeEventListener('sc-resume', onResumeEv); } catch (_) {}
    try { mount.removeEventListener('sc-quit', onQuitEv); } catch (_) {}
  }

  const attAll = opts.attacker?.units || [];
  const defAll = opts.defender?.units || [];
  const attGround = attAll.filter((u) => GROUND_TYPES.has(u?.type));
  const defGround = defAll.filter((u) => GROUND_TYPES.has(u?.type));

  const playerIs = opts.attacker?.side === 'player' ? 'attacker'
    : opts.defender?.side === 'player' ? 'defender' : 'attacker';

  let paused = !!(mount && mount.dataset && mount.dataset.paused === '1');
  let sim = null;
  let last = performance.now();

  if (!mount) {
    Promise.resolve().then(() => finish(emptyResult(attAll, defAll, attGround.length ? 'attacker' : 'defender', playerIs, opts)));
    return promise;
  }

  mount.addEventListener('sc-pause', onPauseEv);
  mount.addEventListener('sc-resume', onResumeEv);
  mount.addEventListener('sc-quit', onQuitEv);

  if (!attGround.length || !defGround.length) {
    const winner = attGround.length ? 'attacker' : 'defender';
    Promise.resolve().then(() => {
      unbindMount();
      finish(instantResult(opts, winner, playerIs));
    });
    return promise;
  }

  const mw = mount.clientWidth || 320;
  const mh = mount.clientHeight || 480;
  sim = new GroundSim({ ...opts, portrait: mh > mw * 1.05 });

  const use3d = opts.force2d ? false : canWebGL();
  const ViewCls = use3d ? GroundView3D : GroundView;
  try {
    view = new ViewCls(mount, sim, {
      onRetreat: () => {
        if (settled || ending) return;
        sim.retreat();
        ending = true;
      },
      onSpeed: () => {},
      isPaused: () => paused || (mount.dataset && mount.dataset.paused === '1'),
    });
  } catch (err) {
    // fall back to 2D if 3D constructor throws
    try { view?.dispose(); } catch (_) {}
    view = new GroundView(mount, sim, {
      onRetreat: () => { if (!settled && !ending) { sim.retreat(); ending = true; } },
      onSpeed: () => {},
      isPaused: () => paused || (mount.dataset && mount.dataset.paused === '1'),
    });
  }

  last = performance.now();
  const frame = (now) => {
    if (settled) return;
    const isPaused = paused || (mount.dataset && mount.dataset.paused === '1');
    if (isPaused) {
      last = now;
      try { view.draw(0, { paused: true }); } catch (_) {}
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    sim.step(dt);
    try { view.draw(dt); } catch (_) {}
    if (sim.over && sim.phase === 'outro') ending = true;
    if (sim.phase === 'done') {
      const r = sim._pendingResult || sim.result();
      if (sim.retreated) r.retreated = true;
      if (!r.ticketsLeft) {
        r.ticketsLeft = {
          attacker: Math.max(0, sim.tickets.attacker | 0),
          defender: Math.max(0, sim.tickets.defender | 0),
        };
      }
      finish(r);
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
      get paused() { return paused || (mount.dataset && mount.dataset.paused === '1'); },
      tapWorld: (x, y) => sim.tap(x, y),
      retreat: () => { if (!settled && !sim.over) { sim.retreat(); ending = true; } },
      cycleSpeed: () => sim.cycleSpeed(),
      get speed() { return sim.speed; },
      skipBanner: () => sim.skipBanner(),
      skipDrop: () => { sim.skipDrop(); },
      skipToFight: () => { sim.autoStartCommand(); },
      spawnPlayer: (c, p) => sim.spawnPlayer(c, p),
      autoStartCommand: () => sim.autoStartCommand(),
      setMode: (m) => { sim.setMode(m); try { view._syncModeToggle?.(); view._paintHint?.(); } catch(_){} },
      forceOut: (id) => {
        const u = sim.units.find((x) => x.id === id);
        if (u) { u.hpNow = 0; sim._takeOut(u); }
      },
      forceCrawl: (id) => {
        const u = sim.units.find((x) => x.id === id);
        if (u && sim.alive(u)) { u.hpNow = Math.max(1, u.stats.hp * 0.2); u.status = 'crawl'; u.crawlT = 0; }
      },
      wipeSide: (side) => {
        for (const u of sim.units) if (u.side === side && sim.alive(u)) { u.hpNow = 0; sim._takeOut(u); }
        sim.tickets[side] = 0;
        sim._checkVictory();
      },
      units: () => sim.units.map((u) => ({
        id: u.id, side: u.side, type: u.type, status: u.status,
        hpNow: u.hpNow, x: +u.x.toFixed(2), y: +u.y.toFixed(2),
        landed: u.landed, selected: !!u.selected, covered: !!u.covered,
      })),
      tickets: () => ({ ...sim.tickets }),
      ticketsLeft: () => ({ ...sim.tickets }),
      posts: () => sim.posts.map((p) => ({ id: p.id, label: p.label, owner: p.owner, progress: p.progress })),
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

function ticketPair(opts, attAll, defAll) {
  const ot = opts?.tickets || {};
  const a = (typeof ot.attacker === 'number') ? ot.attacker : ticketsFromArmy(attAll);
  const d = (typeof ot.defender === 'number') ? ot.defender : ticketsFromArmy(defAll);
  // Match GroundSim floor: at least 150 per side
  return { attacker: Math.max(150, a | 0), defender: Math.max(150, d | 0) };
}

function emptyResult(attAll, defAll, winner, playerIs, opts) {
  return enrichResult({
    winner,
    survivors: { attacker: keepSurvivors(attAll, winner === 'attacker'), defender: keepSurvivors(defAll, winner === 'defender') },
    pointsEarned: 0,
    lost: { attacker: [], defender: [] },
    ticketsLeft: ticketPair(opts || {}, attAll, defAll),
  }, null);
}

function instantResult(opts, winner, playerIs) {
  const attAll = opts.attacker?.units || [];
  const defAll = opts.defender?.units || [];
  const enemyUnits = playerIs === 'attacker'
    ? (opts.defender?.units || []).filter((u) => GROUND_TYPES.has(u?.type))
    : (opts.attacker?.units || []).filter((u) => GROUND_TYPES.has(u?.type));
  const ticketsLeft = ticketPair(opts, attAll, defAll);
  // Instant: loser tickets → 0
  if (winner === 'attacker') ticketsLeft.defender = 0;
  else ticketsLeft.attacker = 0;
  return {
    winner,
    survivors: {
      attacker: keepSurvivors(attAll, winner === 'attacker'),
      defender: keepSurvivors(defAll, winner === 'defender'),
    },
    pointsEarned: pointsFor(winner, playerIs, enemyUnits.length),
    lost: {
      attacker: winner === 'attacker' ? [] : keepSurvivors(attAll, true).map((u) => ({ ...u, hpNow: 0 })),
      defender: winner === 'defender' ? [] : keepSurvivors(defAll, true).map((u) => ({ ...u, hpNow: 0 })),
    },
    ticketsLeft,
    kills: { attacker: 0, defender: 0 },
    cpsTaken: 0,
    stats: { damageDealt: 0, damageTaken: 0, deaths: 0, captures: 0, shotsFired: 0, timeInLead: 0, kills: 0 },
  };
}

function retreatResult(opts, playerIs) {
  const attAll = opts.attacker?.units || [];
  const defAll = opts.defender?.units || [];
  return {
    winner: 'defender',
    survivors: {
      attacker: keepSurvivors(attAll, true),
      defender: keepSurvivors(defAll, true),
    },
    pointsEarned: 0,
    retreated: true,
    lost: { attacker: [], defender: [] },
    ticketsLeft: ticketPair(opts, attAll, defAll),
    kills: { attacker: 0, defender: 0 },
    cpsTaken: 0,
    stats: { damageDealt: 0, damageTaken: 0, deaths: 0, captures: 0, shotsFired: 0, timeInLead: 0, kills: 0 },
  };
}

try { if (typeof window !== 'undefined') window.startGroundBattle = startBattle; } catch (_) {}

export default startBattle;
