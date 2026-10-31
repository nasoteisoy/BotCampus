// Loads Dev B/C battle modules via dynamic import; falls back to js/fallback-battle.js.
// Implements CONTRACT v1.1 shell-side sc-quit 500ms fallback.
import { filterForBattle } from './shop.js';
import { COLORS, PLAYER, ENEMY } from './state.js';

/** Modules start at 1×; CONTRACT has no speed field. Nudge UI once to 2×; ⏩ still cycles. */
function applyStartSpeed2x(type, mount) {
  try {
    const g = typeof window !== 'undefined' ? window.__scGround : null;
    if (type === 'ground' && g) {
      if (g.speed === 1 && g.cycleSpeed) {
        const btn = mount?.querySelector?.('[data-sc-speed]');
        if (btn) btn.click();
        else {
          g.cycleSpeed();
          const lab = mount?.querySelector?.('[data-sc-speed-val]');
          if (lab) lab.textContent = g.speed + '×';
        }
      }
      return;
    }
    const root = mount?.firstElementChild;
    if (root?._sc) {
      if (root._sc.timeScale === 1 && root._sc.onSpeed) root._sc.onSpeed();
      return;
    }
    const btn =
      mount?.querySelector?.('[data-sc-speed]') ||
      mount?.querySelector?.('[data-act="speed"]');
    const lab = mount?.querySelector?.('[data-sc-speed-val], [data-act="speed"] .lab, [data-act="speed"] small');
    const txt = (lab?.textContent || '').trim();
    if (btn && (/^1/.test(txt) || txt.includes('×1') || txt === 'x1' || txt === '1×')) btn.click();
  } catch { /* ignore */ }
}

async function loadModule(type) {
  const path = type === 'space' ? '../space/battle.js' : '../ground/battle.js';
  try {
    const mod = await import(path);
    if (mod && typeof mod.startBattle === 'function') return { mod, fallback: false };
  } catch {
    /* missing or broken — use fallback */
  }
  return { mod: await import('./fallback-battle.js'), fallback: true };
}

function cloneList(units) {
  return (units || []).map((u) => ({
    id: u.id, type: u.type, name: u.name, icon: u.icon,
    stats: { ...u.stats }, hpNow: u.hpNow ?? u.stats?.hp ?? 1,
  }));
}

/** Run one battle stage; resolves with the onDone result. Honors sc-quit fallback. */
export function runBattleStage({ type, planet, attackers, defenders, attackerSide, seed, mount, classes, bonus, tickets }) {
  const extra = { classes, bonus, tickets };
  const aUnits = filterForBattle(attackers, type);
  const dUnits = filterForBattle(defenders, type);

  const opts = {
    type,
    planet,
    mount,
    attacker: {
      side: attackerSide,
      color: COLORS[attackerSide] || COLORS.player,
      units: aUnits,
    },
    defender: {
      side: attackerSide === PLAYER ? ENEMY : PLAYER,
      color: COLORS[attackerSide === PLAYER ? ENEMY : PLAYER],
      units: dUnits,
    },
    seed: seed | 0,
    speed: 2,
    timeScale: 2,
  };
  // Ground-only opts (Dev B): classes / bonus / tickets. Space ignores these.
  // Ground applies bonus itself — shell must NOT double-apply shell-side effects.
  if (type === 'ground') {
    if (extra?.classes != null) opts.classes = extra.classes;
    if (extra?.bonus != null) opts.bonus = extra.bonus;
    if (extra?.tickets != null) opts.tickets = extra.tickets;
    // Read-only hook for flow tests (classes + explicit tickets)
    try {
      if (typeof window !== 'undefined') {
        window.__scLastGroundOpts = Object.freeze({
          classes: Array.isArray(opts.classes) ? opts.classes.slice() : [],
          tickets: opts.tickets && typeof opts.tickets === 'object'
            ? Object.freeze({ attacker: opts.tickets.attacker | 0, defender: opts.tickets.defender | 0 })
            : null,
        });
      }
    } catch { /* */ }
  }

  return new Promise(async (resolve) => {
    if (!aUnits.length && !dUnits.length) {
      resolve({ winner: 'defender', survivors: { attacker: [], defender: [] }, pointsEarned: 0, retreated: false });
      return;
    }
    if (!aUnits.length) {
      resolve({
        winner: 'defender',
        survivors: { attacker: [], defender: dUnits.map((u) => ({ ...u })) },
        pointsEarned: 0,
        retreated: false,
      });
      return;
    }
    if (!dUnits.length) {
      resolve({
        winner: 'attacker',
        survivors: { attacker: aUnits.map((u) => ({ ...u })), defender: [] },
        pointsEarned: attackerSide === PLAYER ? 10 : 0,
        retreated: false,
      });
      return;
    }

    let settled = false;
    let quitTimer = 0;

    const cleanup = () => {
      clearTimeout(quitTimer);
      mount.removeEventListener('sc-quit', onShellQuit);
      try { delete mount.dataset.paused; } catch { /* */ }
    };

    const done = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      const summary = {
        winner: result?.winner || 'defender',
        survivors: result?.survivors || { attacker: cloneList(aUnits), defender: cloneList(dUnits) },
        pointsEarned: Math.max(0, result?.pointsEarned | 0),
        retreated: !!result?.retreated,
        ticketsLeft: result?.ticketsLeft || null,
        // Dev B ground: optional kills {attacker,defender} + cpsTaken
        kills: result?.kills ?? null,
        cpsTaken: result?.cpsTaken ?? null,
        stats: result?.stats ?? null,
        lost: result?.lost || null,
      };
      resolve(summary);
    };

    /** Shell sc-quit: module should onDone; if not within 500ms, shell retreats. */
    function onShellQuit() {
      if (settled) return;
      clearTimeout(quitTimer);
      quitTimer = setTimeout(() => {
        if (settled) return;
        try { mount.innerHTML = ''; } catch { /* */ }
        done({
          winner: 'defender',
          survivors: { attacker: cloneList(aUnits), defender: cloneList(dUnits) },
          pointsEarned: 0,
          retreated: true,
        });
      }, 500);
    }

    mount.addEventListener('sc-quit', onShellQuit);

    const { mod, fallback } = await loadModule(type);
    mount.innerHTML = '';
    try {
      mod.startBattle(opts, done);
      if (!fallback) {
        queueMicrotask(() => applyStartSpeed2x(type, mount));
        requestAnimationFrame(() => applyStartSpeed2x(type, mount));
      }
    } catch (err) {
      if (fallback) {
        done({
          winner: 'defender',
          survivors: { attacker: aUnits.map((u) => ({ ...u })), defender: dUnits.map((u) => ({ ...u })) },
          pointsEarned: 0,
          retreated: false,
        });
        return;
      }
      mount.innerHTML = '';
      const fb = await import('./fallback-battle.js');
      fb.startBattle(opts, done);
    }
  });
}

/**
 * Full attack: space first if the defender has ships, then ground.
 * Losing or retreating in space aborts the landing (no ground battle).
 */
/**
 * Full attack chain (BF2 / Chumi hard rule):
 * - Attacker MUST have a fleet (space unit). Shell gates before calling.
 * - Enemy fleet in orbit → space first; space loss → no ground.
 * - No enemy fleet (or space win) → ground (unless no defenders = auto-capture).
 * - Ground module applies its own points/bonus; shell only adds result.pointsEarned once via applyStage.
 */
export async function runFullAttack({ ctx, mount, onStage, applyStage, classes, bonus, tickets }) {
  const stages = [];
  const attShips = filterForBattle(ctx.attackers, 'space');
  if (!attShips.length) {
    return { finalWinner: 'defender', retreated: false, lastResult: null, stages, reason: 'no-fleet' };
  }

  const defShips = filterForBattle(ctx.defenders, 'space');
  if (defShips.length > 0) {
    onStage && onStage('space');
    const spaceResult = await runBattleStage({
      type: 'space',
      planet: ctx.planet,
      attackers: ctx.attackers,
      defenders: ctx.defenders,
      attackerSide: ctx.attackerSide,
      seed: ctx.seed,
      mount,
    });
    stages.push({ type: 'space', result: spaceResult });
    const spaceWinner = applyStage(spaceResult, 'space');
    if (spaceWinner !== 'attacker' || spaceResult.retreated || !ctx.attackers.length) {
      return { finalWinner: 'defender', retreated: !!spaceResult.retreated, lastResult: spaceResult, stages };
    }
  }

  const defGround = filterForBattle(ctx.defenders, 'ground');
  if (!defGround.length && !filterForBattle(ctx.defenders, 'space').length) {
    // Empty world after space (or no defenders): capture on arrival — no ground fight
    const auto = {
      winner: 'attacker',
      survivors: { attacker: cloneList(ctx.attackers), defender: [] },
      pointsEarned: 0, // capture bonus applied by resolveAttackEnd
      retreated: false,
      ticketsLeft: null, kills: null, cpsTaken: null, stats: null,
    };
    stages.push({ type: 'ground', result: auto, autoCapture: true });
    applyStage(auto, 'ground');
    return { finalWinner: 'attacker', retreated: false, lastResult: auto, stages };
  }

  onStage && onStage('ground');
  const groundResult = await runBattleStage({
    type: 'ground',
    planet: ctx.planet,
    attackers: ctx.attackers,
    defenders: ctx.defenders,
    attackerSide: ctx.attackerSide,
    seed: (ctx.seed + 17) | 0,
    mount,
    classes,
    bonus,
    tickets,
  });
  stages.push({ type: 'ground', result: groundResult });
  const groundWinner = applyStage(groundResult, 'ground');
  if (groundResult.retreated) {
    return { finalWinner: 'defender', retreated: true, lastResult: groundResult, stages };
  }
  return { finalWinner: groundWinner, retreated: false, lastResult: groundResult, stages };
}
