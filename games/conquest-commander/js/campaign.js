// Campaign state (credits, battles, streak) in localStorage 'conquest-commander:campaign', rewards, enemy perk scaling.
import { PERKS } from './perks.js';
import { mulberry32 } from './data.js';
import { MAP_LIST } from './map.js';

export const LS_CAMP = 'conquest-commander:campaign';
export const START_CREDITS = 1500;
// campaign map list = map.js MAP_LIST (index 0 = Dust Ridge, 1 = Grand Valley). mapIndex = the map of the next battle;
// v2.2: it follows the map picked on the setup screen (main.js sets it before each fight), so old saves (mapIndex 0) stay valid.
export const MAPS = MAP_LIST.map(({ id, name, icon, size }) => ({ id, name, icon, size }));

export const newCampaign = () => ({ v: 1, credits: START_CREDITS, battle: 1, wins: 0, losses: 0, streak: 0, mapIndex: 0 });
const int = (x, d, lo = -1e9, hi = 1e9) => (Number.isInteger(x) && x >= lo && x <= hi ? x : d);
export function loadCampaign(storage = globalThis.localStorage) {
  let d = null; try { d = JSON.parse(storage.getItem(LS_CAMP) || 'null'); } catch (e) { d = null; }
  if (!d || d.v !== 1) return newCampaign();
  return { v: 1, credits: int(d.credits, START_CREDITS, 0), battle: int(d.battle, 1, 1), wins: int(d.wins, 0, 0), losses: int(d.losses, 0, 0), streak: int(d.streak, 0), mapIndex: int(d.mapIndex, 0, 0, MAPS.length - 1) };
}
export function saveCampaign(c, storage = globalThis.localStorage) { try { storage.setItem(LS_CAMP, JSON.stringify(c)); return true; } catch (e) { return false; } }

// credits for one battle: win 1000 + 50/post held + 2/ticket left; loss (or draw) 400 + 50/post held
export function battleReward(won, postsHeld, ticketsLeft) {
  const lines = won
    ? [{ icon: '🏆', label: 'win', n: 1, each: 1000 }, { icon: '🚩', label: 'posts', n: postsHeld, each: 50 }, { icon: '🎟️', label: 'tickets', n: ticketsLeft, each: 2 }]
    : [{ icon: '⚔️', label: 'fought', n: 1, each: 400 }, { icon: '🚩', label: 'posts', n: postsHeld, each: 50 }];
  lines.forEach((l) => (l.total = l.n * l.each));
  return { lines, total: lines.reduce((a, l) => a + l.total, 0) };
}
// apply a battle result to the campaign (returns the reward)
export function recordBattle(c, won, postsHeld, ticketsLeft) {
  const r = battleReward(won, postsHeld, ticketsLeft);
  c.credits += r.total; c.battle += 1;
  if (won) { c.wins++; c.streak = c.streak > 0 ? c.streak + 1 : 1; } else { c.losses++; c.streak = c.streak < 0 ? c.streak - 1 : -1; }
  // v2.2: no automatic rotation; the player picks the map (mapIndex keeps the map that was just played)
  return r;
}
// enemy perks: 1 to start, +1 per win in your streak, -1 per loss in your losing streak (min 0, max 6)
export const enemyPerkCount = (c) => Math.max(0, Math.min(6, 1 + c.streak));
export function enemyPerks(c, playerPerks = [], seed = 1) {
  const rng = mulberry32(seed), pool = PERKS.map((p) => p.id).filter((id) => !(id === 'garrison' && playerPerks.includes('garrison')));
  const out = [], n = Math.min(enemyPerkCount(c), pool.length);
  while (out.length < n) { const id = pool.splice((rng() * pool.length) | 0, 1)[0]; out.push(id); }
  return out;
}
