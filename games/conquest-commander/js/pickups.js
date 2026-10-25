// ❤️ health + 📦 ammo packs, magazines and reload for Conquest Commander. Pure logic (no three.js, no DOM).
// ON by default since v2.4 (Chumi asked for units that use health + ammo packs). Battles are bit-identical to v2.3 when off.
//   off: ?pickups=0  ·  localStorage 'conquest-commander:pickups-flag' = '0'
//   ?pickups=1 still forces on; brains (?brains=1) stay a separate flag
// Numbers: magazine / spare mags / reload / health pack / respawn = games/shared/army/stats.js MAGS (the ONE table the
// Trooper Customizer combat demos use too). If an old stats.js without MAGS is loaded, pickups stay OFF (never throws).
// Behaviour = the demo's: a shot uses 1 round; an empty magazine reloads from the spares (reload s); an ammo pack refills
// the spares to reserveMags magazines (and starts a reload if the magazine is empty); a health pack heals +healthPack HP;
// a taken pack comes back after respawn s. Packs sit on the capture ring of every command post (one ❤️, one 📦).
import { MAP } from './map.js';
import * as Stats from '../../shared/army/stats.js?v=8';   // same URL as data.js → one module instance

export const PICKUPS_V = 1;
export const LS_PICKUPS_FLAG = 'conquest-commander:pickups-flag';
const M = Stats.MAGS || null;
// per main weapon index (blaster, rocket, sniper, shotgun, chaingun, emp) — stats.js MAGS
export const AMMO = M ? Object.freeze({ mag: M.mag, magDefault: M.magDefault, reserveMags: M.reserveMags, reload: M.reload }) : null;
// healthPack + respawn: stats.js MAGS · takeR / ringK: Conquest-only placement (pickup radius m, pack ring = postR × ringK)
export const PACK = M ? Object.freeze({ healthPack: M.healthPack, respawn: M.respawn, takeR: 1.6, ringK: 0.85 }) : null;
export const KINDS = Object.freeze(['health', 'ammo']);
// needs layer for units WITHOUT a brain (both teams; with a brain the rows decide): go for ammo when completely dry,
// for health when below lowHp and a pack is close
export const NEED = Object.freeze({ lowHp: 0.35, healthSeekR: 20 });

export function readFlag(loc = globalThis.location, storage = globalThis.localStorage) {
  // v2.4: ON by default. Off switch: ?pickups=0 (or localStorage pickups-flag = '0'). ?brains=1 never turns them off.
  // No page URL (Node tests / headless sims) stays OFF so seeded test battles stay v2.3-identical.
  if (!loc) return false;
  let q = null;
  try { const s = loc && loc.search ? new URLSearchParams(loc.search) : null; q = s && s.get('pickups'); } catch (e) { /* no URL */ }
  if (q === '0' || q === 'off') return false;
  if (q === '1' || q === 'on') return true;
  try { return !(storage && storage.getItem(LS_PICKUPS_FLAG) === '0'); } catch (e) { return true; }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createPickups(opts = {}) {
  const P = {
    on: !!M && (opts.on !== undefined ? !!opts.on : readFlag(opts.location, opts.storage)),
    ammoCfg: AMMO, packCfg: PACK,
    // ---------- packs (state lives on the Sim: sim.__pk) ----------
    state(sim) {
      let st = sim.__pk;
      if (st && st.map === sim.map) return st;
      const R = (MAP.postR || 9) * PACK.ringK, packs = [];
      sim.posts.forEach((p, i) => {
        // ❤️ on the north edge of the ring, 📦 on the south edge (fixed spots: no randomness, replays stay identical)
        for (const [kind, dz] of [['health', -R], ['ammo', R]]) {
          let x = p.x, z = p.z + dz;
          if (sim.nav && sim.nav.freePoint) [x, z] = sim.nav.freePoint(x, z);
          packs.push({ id: packs.length, kind, post: i, x, z, active: true, readyAt: 0, taken: 0 });
        }
      });
      st = sim.__pk = { map: sim.map, packs, flash: [], taken: { health: 0, ammo: 0 }, shotsBlocked: 0, reloads: 0 };
      return st;
    },
    nearest(sim, u, kind) {
      let best = null, bd = Infinity;
      for (const k of this.state(sim).packs) { if (!k.active || k.kind !== kind) continue; const d = dist(k, u); if (d < bd) { bd = d; best = k; } }
      return best ? { pack: best, d: bd } : null;
    },
    // ---------- magazine (fields on the unit: mag, ammo, reserve, reloadAt) ----------
    weaponOf(sim, u) { const T = sim.teams[u.team], l = T && T.looks[u.look]; return l && l.st ? l.st.weapon | 0 : 0; },
    mag(sim, u) {
      if (u.mag === undefined) { u.mag = AMMO.mag[this.weaponOf(sim, u)] || AMMO.magDefault; u.ammo = u.mag; u.reserve = u.mag * AMMO.reserveMags; u.reloadAt = -1; }
      return u;
    },
    reloading(sim, u) { this.mag(sim, u); return u.reloadAt >= 0; },
    lowAmmo(sim, u) { this.mag(sim, u); return u.reserve < u.mag; },           // less than one spare magazine
    dry(sim, u) { this.mag(sim, u); return u.ammo + u.reserve === 0 && u.reloadAt < 0; },
    finishReload(sim, u) { if (u.reloadAt >= 0 && sim.time >= u.reloadAt) { const n = Math.min(u.mag, u.reserve); u.ammo += n; u.reserve -= n; u.reloadAt = -1; } },
    startReload(sim, u) { if (u.reloadAt < 0 && u.reserve > 0 && u.ammo < u.mag) { u.reloadAt = sim.time + AMMO.reload; this.state(sim).reloads++; } },
    // the sim's fire gate: true = this shot may go (uses 1 round), false = empty / reloading
    shoot(sim, u) {
      this.mag(sim, u); this.finishReload(sim, u);
      if (u.reloadAt >= 0 || u.ammo <= 0) { this.startReload(sim, u); this.state(sim).shotsBlocked++; return false; }
      u.ammo--;
      if (u.ammo === 0) this.startReload(sim, u);
      return true;
    },
    // ---------- per step: respawn packs, pick up, finish reloads ----------
    step(sim, dt) {
      const st = this.state(sim), now = sim.time;
      for (const k of st.packs) if (!k.active && now >= k.readyAt) k.active = true;
      for (const u of sim.units) {
        if (!u.alive) continue;
        if (u.mag !== undefined) this.finishReload(sim, u);
        for (const k of st.packs) {
          if (!k.active || Math.abs(k.x - u.x) > PACK.takeR || Math.abs(k.z - u.z) > PACK.takeR || dist(k, u) > PACK.takeR) continue;
          if (k.kind === 'health' ? u.hp >= u.hpMax - 0.5 : (this.mag(sim, u), u.reserve >= u.mag * AMMO.reserveMags)) continue;   // only when needed
          this.take(sim, u, k);
        }
      }
      if (st.flash.length && now - st.flash[0].t > 2) st.flash = st.flash.filter((f) => now - f.t <= 2);
      void dt;
    },
    take(sim, u, k) {
      const st = this.state(sim);
      k.active = false; k.readyAt = sim.time + PACK.respawn; k.taken++; st.taken[k.kind]++;
      if (k.kind === 'health') u.hp = Math.min(u.hpMax, u.hp + PACK.healthPack);
      else { this.mag(sim, u); u.reserve = u.mag * AMMO.reserveMags; if (u.ammo === 0) this.startReload(sim, u); }
      u.pkTook = { kind: k.kind, t: sim.time };
      if (st.flash.length < 32) st.flash.push({ x: k.x, z: k.z, kind: k.kind, team: u.team, t: sim.time });
    },
    // needs layer (no-brain units): { x, z, act } or null
    need(sim, u) {
      if (this.dry(sim, u)) { const A = this.nearest(sim, u, 'ammo'); if (A) return { x: A.pack.x, z: A.pack.z, act: 'ammo' }; }
      if (u.hp < u.hpMax * NEED.lowHp) { const H = this.nearest(sim, u, 'health'); if (H && H.d < NEED.healthSeekR) return { x: H.pack.x, z: H.pack.z, act: 'heal' }; }
      return null;
    },
  };
  return P;
}

// the shared instance the game uses (flag read once at load; PICKUPS.on can be flipped in tests)
export const PICKUPS = createPickups();
