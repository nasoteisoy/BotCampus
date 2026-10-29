// Loads Dev B/C battle modules via dynamic import; falls back to js/fallback-battle.js.
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
    // Only click if label still shows 1
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

/** Run one battle stage; resolves with the onDone result. */
export function runBattleStage({ type, planet, attackers, defenders, attackerSide, seed, mount }) {
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

  return new Promise(async (resolve) => {
    if (!aUnits.length && !dUnits.length) {
      resolve({ winner: 'defender', survivors: { attacker: [], defender: [] }, pointsEarned: 0 });
      return;
    }
    if (!aUnits.length) {
      resolve({
        winner: 'defender',
        survivors: { attacker: [], defender: dUnits.map((u) => ({ ...u })) },
        pointsEarned: 0,
      });
      return;
    }
    if (!dUnits.length) {
      resolve({
        winner: 'attacker',
        survivors: { attacker: aUnits.map((u) => ({ ...u })), defender: [] },
        pointsEarned: attackerSide === PLAYER ? 10 : 0,
      });
      return;
    }

    const done = (result) => resolve(result);
    const { mod, fallback } = await loadModule(type);
    mount.innerHTML = '';
    try {
      mod.startBattle(opts, done);
      // Real modules ignore opts.speed; click ⏩ once → 2× (fallback already starts at 2×).
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
        });
        return;
      }
      // Real module crashed at start — use fallback
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
export async function runFullAttack({ ctx, mount, onStage, applyStage }) {
  if (filterForBattle(ctx.defenders, 'space').length > 0) {
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
    const spaceWinner = applyStage(spaceResult, 'space');
    if (spaceWinner !== 'attacker' || spaceResult.retreated || !ctx.attackers.length) {
      return { finalWinner: 'defender', retreated: !!spaceResult.retreated };
    }
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
  });
  const groundWinner = applyStage(groundResult, 'ground');
  if (groundResult.retreated) {
    return { finalWinner: 'defender', retreated: true };
  }
  return { finalWinner: groundWinner };
}
