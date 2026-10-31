// 🎒 Loadout in battle: sidearms, explosives, gadgets and tanks' armor rules (SWBF2-style), using the numbers in
// games/shared/army/stats.js (SIDEARMS, EXPLOSIVES, GADGETS, TANK_RULES). Pure logic (no three.js, no DOM).
// ON in the browser (off: ?gear=0). OFF in Node so the seeded test battles (test/sim.mjs) stay bit-identical;
// test/gear.mjs turns it on. Tank armor / EMP stun apply whenever tanks are on the field (they only exist when
// the player brings one).
//   🔸 sidearm    fires while the main weapon reloads or is empty (pickups magazines)
//   🤾 thermal    thrown at a seen enemy in range, explodes after the fuse (splash)        ×count per life, cooldown cd
//   ⚠️ mines      +count mines for the mine-laying job (planted at its own post, sim mine rules)
//   🧨 detpack    placed on a tank or an enemy group in range, set off after the fuse (×detpackMul vs tanks)
//   ⏰ time bomb  planted on a post it is taking (not yours), explodes after the fuse
//   🗼 turret     deployed once per life at its post / first fight: shoots enemies in range for life s (hp, splash hurts)
//   🛰️ bot      deployed once per life on first sight: follows, shoots, and allies near it aim better (spotAcc)
//   🎒 jetpack    speed (stats) · 🔧 fusion cutter: repairs allied tanks + turrets close by
//   📦 supply     crate: heals allies in r and refills their spare magazines · 📣 rally: allies in r take less damage
import { heightAt, lineClear } from './map-stub.js';
import * as Stats from './stats.js';

export const LS_GEAR_FLAG = 'conquest-commander:gear-flag';
export function readFlag(loc = globalThis.location, storage = globalThis.localStorage) {
  if (!loc) return false;                                  // Node / headless sims: off (deterministic tests)
  let q = null; try { q = new URLSearchParams(loc.search || '').get('gear'); } catch (e) { q = null; }
  if (q === '0' || q === 'off') return false;
  if (q === '1' || q === 'on') return true;
  try { return !(storage && storage.getItem(LS_GEAR_FLAG) === '0'); } catch (e) { return true; }
}
const SIDE = Stats.SIDEARMS || [], EXPL = Stats.EXPLOSIVES || [], GAD = Stats.GADGETS || [];
export const TANK_RULES = Stats.TANK_RULES || { maxPerTeam: 2, armorMul: 0.35, empStun: 2.5, detpackMul: 2, capture: false };
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export function createGear(opts = {}) {
  const G = {
    on: !!SIDE.length && (opts.on !== undefined ? !!opts.on : readFlag(opts.location, opts.storage)),
    // per-battle state on the Sim: deployed things + counters (for tests / HUD)
    state(sim) { return (sim.__gear ||= { turrets: [], bots: [], crates: [], rallies: [], bombs: [], used: { side: 0, thermal: 0, mines: 0, detpack: 0, 'time-bomb': 0, turret: 0, 'recon-bot': 0, supply: 0, rally: 0, repair: 0 } }); },
    // loadout of a unit (from its look's index state) — set once per life at spawn
    init(sim, u) {
      if (u.kind === 'tank') return;
      const T = sim.teams[u.team], l = T && T.looks[u.look], st = (l && l.st) || {};
      const side = SIDE[st.side | 0] || SIDE[0], ex = EXPL[st.expl | 0] || EXPL[0], gd = GAD[st.gadget | 0] || GAD[0];
      u.gear = { side, ex, exLeft: ex.id === 'mines' ? 1 : ex.count, exT: 2 + sim.r() * 2, gd, gdUsed: false, sideT: 0 };
      if (ex.id === 'mines') u.mines = (u.mines || 0) + ex.count;   // the mine job plants them (traits.js mineTarget)
    },
    // the main weapon can't fire (reloading / empty): the sidearm does
    sidearm(sim, u, tg) {
      const g = u.gear; if (!g || !g.side || d2(u, tg) > g.side.range * g.side.range) return false;
      if ((g.sideT -= sim.cfg.dt) > 0) return false;
      g.sideT = g.side.rof * (0.85 + 0.3 * sim.r());
      const d = Math.sqrt(d2(u, tg)), p = u.s.acc * sim.accMul(u) * (1 - 0.45 * d / g.side.range) * (tg.moving ? 0.9 : 1) * (tg.inCover ? 0.7 : tg.crouch ? 0.85 : 1) + this.spotBonus(sim, u);
      const hit = sim.r() < p, y0 = heightAt(u.x, u.z) + 1.6, y1 = heightAt(tg.x, tg.z) + 1.3;
      const ex = hit ? tg.x : tg.x + (sim.r() - 0.5) * 3, ez = hit ? tg.z : tg.z + (sim.r() - 0.5) * 3;
      sim.emit({ type: 'tracer', team: u.team, laser: false, side: true, x0: u.x, z0: u.z, y0, x1: ex, z1: ez, y1 });
      u.firing = 0.2; this.state(sim).used.side++;
      if (hit) sim.pending.push([tg, g.side.dmg * sim.teams[u.team].mods.dmgMul * (0.85 + 0.3 * sim.r()), u, 'small']);
      return true;
    },
    // allies near a friendly recon bot aim better
    spotBonus(sim, u) {
      if (!this.on) return 0;
      const S = sim.__gear; if (!S || !S.bots.length) return 0;
      for (const dr of S.bots) if (dr.team === u.team && d2(dr, u) < dr.spotR * dr.spotR) return dr.spotAcc;
      return 0;
    },
    // damage multiplier for a target standing in a friendly rally zone
    takenMul(sim, e) {
      const S = sim.__gear; if (!S || !S.rallies.length) return 1;
      for (const r of S.rallies) if (r.team === e.team && d2(r, e) < r.r * r.r) return r.dmgTaken;
      return 1;
    },
    // a splash went off: turrets / bots / crates in it get hurt too
    splash(sim, x, z, team, dmg, R) {
      const S = sim.__gear; if (!S) return;
      for (const list of [S.turrets, S.bots, S.crates]) for (const o of list) if (o.team !== team && o.hp > 0) { const d = Math.hypot(o.x - x, o.z - z); if (d < R) o.hp -= dmg * (1 - 0.6 * d / R); }
    },
    // per step (after units moved): explosives, gadgets, deployed things
    step(sim, dt) {
      const S = this.state(sim), now = sim.time, alive = sim.units.filter((u) => u.alive);
      for (const u of alive) {
        const g = u.gear; if (!g) continue;
        const tg = u.tgt && u.tgt.alive ? u.tgt : null, P = u.post >= 0 ? sim.posts[u.post] : null;
        // ----- explosive -----
        if (g.exLeft > 0 && (g.exT -= dt) <= 0) {
          const ex = g.ex;
          if (ex.id === 'thermal' && tg && d2(u, tg) < ex.range * ex.range && d2(u, tg) > 9) { this.throwAt(sim, u, tg.x, tg.z, ex, 1); g.exLeft--; g.exT = ex.cd; }
          else if (ex.id === 'detpack' && tg && d2(u, tg) < ex.range * ex.range) {
            const group = alive.filter((e) => e.team !== u.team && d2(e, tg) < 16).length;
            if (tg.kind === 'tank' || group >= 2) { this.throwAt(sim, u, tg.x, tg.z, ex, tg.kind === 'tank' ? TANK_RULES.detpackMul : 1, 'detpack'); g.exLeft--; g.exT = ex.cd; }
          } else if (ex.id === 'time-bomb' && P && P.owner !== u.team && Math.hypot(u.x - P.x, u.z - P.z) < 6) {
            S.bombs.push({ x: u.x, z: u.z, team: u.team, by: u, t: now, T: ex.fuse, dmg: ex.dmg, splash: ex.splash, kind: 'time-bomb' });
            sim.emit({ type: 'plant', team: u.team, x: u.x, z: u.z, kind: 'time-bomb' }); S.used['time-bomb']++; g.exLeft--; g.exT = ex.cd;
          } else if (ex.id === 'mines' && u.mines > 0 && !u.mineSpot && (tg || (P && P.owner === u.team && Math.hypot(u.x - P.x, u.z - P.z) < 12)) && !sim.mines.some((m) => Math.hypot(m.x - u.x, m.z - u.z) < 3)) {
            u.mineSpot = { x: u.x, z: u.z }; sim.plantMine(u); S.used.mines++; g.exT = ex.cd || 4;   // ⚠️ drop a mine where it stands (enemy near or at its own post)
          } else g.exT = 0.6;
        }
        // ----- gadget -----
        const gd = g.gd;
        if (gd.use === 'deploy' && !g.gdUsed) {
          const atPost = P && Math.hypot(u.x - P.x, u.z - P.z) < 8, fighting = !!tg;
          const want = gd.id === 'turret' ? (fighting || atPost) : gd.id === 'recon-bot' ? fighting : gd.id === 'supply' ? (atPost || u.hp < u.hpMax * 0.6) : gd.id === 'rally' ? fighting && alive.filter((a) => a.team === u.team && d2(a, u) < gd.r * gd.r).length >= 2 : false;
          if (want) this.deploy(sim, u, gd);
        } else if (gd.id === 'fusion-cutter') {
          const R2 = gd.repairR * gd.repairR;
          for (const a of alive) if (a.team === u.team && a.kind === 'tank' && a.hp < a.hpMax && d2(a, u) < R2) { const h = Math.min(a.hpMax - a.hp, gd.repairHp * dt); a.hp += h; S.used.repair += h; if ((u.fixT = (u.fixT || 0) - dt) <= 0) { u.fixT = 0.6; sim.emit({ type: 'heal', team: u.team, repair: true, x0: u.x, z0: u.z, x1: a.x, z1: a.z, y0: heightAt(u.x, u.z) + 1.2, y1: heightAt(a.x, a.z) + 1.5 }); } }
          for (const t of S.turrets) if (t.team === u.team && t.hp > 0 && t.hp < t.hpMax && d2(t, u) < R2) { t.hp = Math.min(t.hpMax, t.hp + gd.repairHp * dt); S.used.repair += gd.repairHp * dt; }
        }
      }
      // ----- deployed things -----
      for (const t of S.turrets) {
        if (t.hp <= 0 || now - t.t > t.life) { t.done = true; if (t.hp <= 0) sim.emit({ type: 'boom', x: t.x, z: t.z, y: heightAt(t.x, t.z) + 0.6, team: t.team, small: true }); continue; }
        if ((t.fireT -= dt) > 0) continue;
        const e = this.nearestEnemy(sim, alive, t, t.range); if (!e) { t.fireT = 0.3; continue; }
        t.fireT = t.rof; t.yaw = Math.atan2(e.x - t.x, e.z - t.z);
        const hit = sim.r() < 0.55 + this.spotBonus(sim, t);
        sim.emit({ type: 'tracer', team: t.team, laser: true, x0: t.x, z0: t.z, y0: heightAt(t.x, t.z) + 1.1, x1: e.x, z1: e.z, y1: heightAt(e.x, e.z) + 1.2 });
        if (hit) sim.damage(e, t.dmg, t.by && t.by.alive ? t.by : null, 'small');
      }
      for (const dr of S.bots) {
        const o = dr.by;
        if (dr.hp <= 0 || now - dr.t > dr.life || !o || !o.alive) { dr.done = true; continue; }
        const a = now * 1.3 + dr.id; dr.x = o.x + Math.cos(a) * 2.2; dr.z = o.z + Math.sin(a) * 2.2;
        if ((dr.fireT -= dt) > 0) continue;
        const e = this.nearestEnemy(sim, alive, dr, dr.range); if (!e) { dr.fireT = 0.3; continue; }
        dr.fireT = dr.rof;
        sim.emit({ type: 'tracer', team: dr.team, laser: true, x0: dr.x, z0: dr.z, y0: heightAt(dr.x, dr.z) + 2.6, x1: e.x, z1: e.z, y1: heightAt(e.x, e.z) + 1.2 });
        if (sim.r() < 0.5) sim.damage(e, dr.dmg, o, 'small');
      }
      for (const c of S.crates) {
        if (c.hp <= 0 || now - c.t > c.life) { c.done = true; continue; }
        for (const a of alive) {
          if (a.team !== c.team || a.kind === 'tank' || d2(a, c) > c.r * c.r) continue;
          if (a.hp < a.hpMax) { const h = Math.min(a.hpMax - a.hp, c.healHp * dt); a.hp += h; sim.teams[c.team].healed += h; }
          if (c.ammo && a.mag !== undefined && a.reserve !== undefined && sim.__pk) { const full = a.mag * 8; if (a.reserve < full) a.reserve = full; }
        }
      }
      for (const r of S.rallies) if (now - r.t > r.life) r.done = true;
      for (const b of S.bombs) if (now - b.t >= b.T) { b.done = true; this.blast(sim, b.x, b.z, b.team, b.dmg, b.splash, b.by, 1); }
      for (const k of ['turrets', 'bots', 'crates', 'rallies', 'bombs']) if (S[k].some((o) => o.done)) S[k] = S[k].filter((o) => !o.done);
    },
    nearestEnemy(sim, alive, o, range) {
      let best = null, bd = range * range;
      for (const e of alive) { if (e.team === o.team) continue; const d = d2(e, o); if (d < bd && lineClear(o.x, o.z, e.x, e.z)) { bd = d; best = e; } }
      return best;
    },
    throwAt(sim, u, x, z, ex, tankMul = 1, kind = 'thermal') {
      const T = ex.fuse;
      (sim.shots ||= []).push({ tx: x, tz: z, ty: heightAt(x, z) + 0.3, t: 0, T, team: u.team, owner: u, dmg: ex.dmg, splash: ex.splash, tankMul, kind });
      sim.emit({ type: 'rocket', team: u.team, grenade: true, kind, x0: u.x, z0: u.z, y0: heightAt(u.x, u.z) + 1.6, x1: x, z1: z, y1: heightAt(x, z) + 0.3, T });
      u.firing = 0.3; this.state(sim).used[kind]++;
    },
    blast(sim, x, z, team, dmg, R, by, tankMul) {
      sim.emit({ type: 'boom', x, z, y: heightAt(x, z) + 0.5, team });
      for (const e of sim.units) if (e.alive && e.team !== team) { const d = Math.hypot(e.x - x, e.z - z); if (d < R) sim.damage(e, dmg * (1 - 0.6 * d / R) * (e.kind === 'tank' ? tankMul : 1) * (e.inCover && e.duck ? 0.5 : 1), by && by.alive ? by : null, 'blast'); }
      this.splash(sim, x, z, team, dmg, R);
    },
    deploy(sim, u, gd) {
      const S = this.state(sim), id = sim.nextId++;
      const [x, z] = sim.nav.freePoint(u.x + Math.sin(u.yaw) * 1.4, u.z + Math.cos(u.yaw) * 1.4);
      const base = { id, x, z, team: u.team, by: u, t: sim.time, life: gd.life, kind: gd.id };
      if (gd.id === 'turret') S.turrets.push({ ...base, hp: gd.hp, hpMax: gd.hp, range: gd.range, rof: gd.rof, dmg: gd.dmg, fireT: 0.5, yaw: u.yaw });
      else if (gd.id === 'recon-bot') S.bots.push({ ...base, hp: gd.hp, range: gd.range, rof: gd.rof, dmg: gd.dmg, spotR: gd.spotR, spotAcc: gd.spotAcc, fireT: 0.8 });
      else if (gd.id === 'supply') S.crates.push({ ...base, hp: gd.hp, r: gd.r, healHp: gd.healHp, ammo: !!gd.ammo });
      else if (gd.id === 'rally') S.rallies.push({ ...base, x: u.x, z: u.z, r: gd.r, dmgTaken: gd.dmgTaken });
      u.gear.gdUsed = true; S.used[gd.id]++;
      sim.emit({ type: 'deploy', team: u.team, kind: gd.id, x, z });
    },
  };
  return G;
}
export const GEAR = createGear();
