// Ground battle simulation — seeded, no DOM. Crawl vs taken-out + cover + juice hooks.
export const GROUND_TYPES = new Set(['rifle', 'heavy', 'recon', 'tank']);

export const DEFAULT_STATS = Object.freeze({
  rifle:  { hp: 100, attack: 14, range:  8, speed: 2.8, armor: 0 },
  heavy:  { hp: 150, attack: 28, range:  9, speed: 1.9, armor: 2 },
  recon:  { hp:  80, attack: 20, range: 13, speed: 3.6, armor: 0 },
  tank:   { hp: 320, attack: 45, range: 11, speed: 2.0, armor: 8 },
});

export const ICONS = Object.freeze({
  rifle: '🔫', heavy: '💪', recon: '🔭', tank: '🚜',
});

export const BIOME = Object.freeze({
  desert: { ground: '#c9a85c', accent: '#8a6a2e', rock: '#6b5330', prop: 'dune' },
  ice:    { ground: '#c5dceb', accent: '#6a8aa8', rock: '#9bb4c4', prop: 'ice' },
  jungle: { ground: '#3f8a4a', accent: '#2a5530', rock: '#4a6040', prop: 'tree' },
  lava:   { ground: '#5c3230', accent: '#a04820', rock: '#3a2020', prop: 'basalt' },
  rock:   { ground: '#6e6974', accent: '#4a4550', rock: '#3a3540', prop: 'boulder' },
  ocean:  { ground: '#3d7a88', accent: '#2a4a5a', rock: '#2a4050', prop: 'coral' },
});

export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CRAWL_HP = 0.35;
const CRAWL_SPEED = 0.4;
const CRAWL_ROF = 1.4;
const HIT_BASE = 0.78;
const COVER_MUL = 0.6;       // -40% damage when covered
const STALL_PUSH_SEC = 6;    // leave cover / push after this with no damage
const MAP_LAND_W = 18;
const MAP_LAND_H = 12;
const MAP_PORT_W = 11;
const MAP_PORT_H = 18;
const FX_CAP = 80;
const SCORCH_CAP = 28;
const SEP_MIN = 1.55; // soft unit separation radius (soldier)

export function normalizeUnit(raw, i, sideTag) {
  const type = GROUND_TYPES.has(raw?.type) ? raw.type : null;
  if (!type) return null;
  const def = DEFAULT_STATS[type];
  const st = raw.stats || {};
  const stats = {
    hp:     +st.hp     || def.hp,
    attack: +st.attack || def.attack,
    range:  +st.range  || def.range,
    speed:  +st.speed  || def.speed,
    armor:  +st.armor  || def.armor,
  };
  const hpNow = Math.max(0, Math.min(stats.hp, raw.hpNow != null ? +raw.hpNow : stats.hp));
  return {
    id: raw.id || `${sideTag}-${type}-${i}`,
    type, name: raw.name || `${type[0].toUpperCase()}${type.slice(1)} ${i + 1}`,
    icon: raw.icon || ICONS[type],
    stats, hpNow, _orig: raw,
  };
}

export function filterPassthrough(units) {
  return (units || []).filter((u) => u && !GROUND_TYPES.has(u.type));
}

export class GroundSim {
  constructor(opts) {
    this.rng = mulberry32(opts.seed ?? 1);
    this.planet = opts.planet || { name: 'Planet', biome: 'rock', size: 2, icon: '🪐' };
    this.biomeKey = this.planet.biome || 'rock';
    this.biome = BIOME[this.biomeKey] || BIOME.rock;
    this.portrait = !!opts.portrait;
    this.W = this.portrait ? MAP_PORT_W : MAP_LAND_W;
    this.H = this.portrait ? MAP_PORT_H : MAP_LAND_H;
    this.time = 0;
    this.over = null;
    this.retreated = false;
    // intro → drop → fight → outro → (cleanup outside)
    this.phase = 'intro';
    this.introT = 0;
    this.outroT = 0;
    this.dropT = 0;
    this.speeds = [1, 2, 3];
    this.speedIdx = 0;
    this.selected = null;
    this.fx = [];
    this.scorch = [];
    this.shake = 0;
    this.props = this._genProps();

    this.attColor = opts.attacker?.color || '#3a8fff';
    this.defColor = opts.defender?.color || '#e74c3c';
    this.attSide = opts.attacker?.side || 'player';
    this.defSide = opts.defender?.side || 'enemy';
    this.passAtt = filterPassthrough(opts.attacker?.units);
    this.passDef = filterPassthrough(opts.defender?.units);

    const aUnits = (opts.attacker?.units || []).map((u, i) => normalizeUnit(u, i, 'a')).filter(Boolean);
    const dUnits = (opts.defender?.units || []).map((u, i) => normalizeUnit(u, i, 'd')).filter(Boolean);
    this.units = [];
    aUnits.forEach((u, i) => this.units.push(this._spawn(u, 'attacker', i, aUnits.length)));
    dUnits.forEach((u, i) => this.units.push(this._spawn(u, 'defender', i, dUnits.length)));

    this.ship = this.portrait
      ? { x: this.W / 2, y: this.H + 3, vx: 0, vy: -9, alt: 3.2, dropping: true, done: false, landedDust: false }
      : { x: -4, y: this.H * 0.35, vx: 12, vy: 0, alt: 3.2, dropping: true, done: false, landedDust: false };
    this.enemyKills = 0;
    this._pendingResult = null;
    this.bannerSkip = false;
    this.lastDamageAt = 0; // sim.time of last damage by either side
    this.lastDamageBySide = { attacker: 0, defender: 0 };
    this.assaultUntil = 0;  // while time < this, AI ignores cover and keeps pushing
  }

  get speed() { return this.speeds[this.speedIdx] || 1; }
  cycleSpeed() { this.speedIdx = (this.speedIdx + 1) % this.speeds.length; return this.speed; }
  skipBanner() { this.bannerSkip = true; }

  _genProps() {
    const props = [];
    const n = 8 + ((this.planet.size || 2) | 0) * 2;
    const kind = this.biome.prop || 'boulder';
    const margin = this.portrait ? 2.2 : 3.5;
    const walls = 2 + ((this.planet.size || 2) | 0);
    for (let i = 0; i < walls; i++) {
      const x = margin + this.rng() * (this.W - margin * 2);
      const y = margin + this.rng() * (this.H - margin * 2);
      const horiz = this.portrait ? this.rng() > 0.55 : this.rng() > 0.45;
      props.push({
        kind: 'wall', cover: true,
        x, y,
        w: horiz ? 1.6 + this.rng() * 1.0 : 0.42,
        h: horiz ? 0.42 : 1.5 + this.rng() * 0.9,
        r: 0,
      });
    }
    for (let i = 0; i < n; i++) {
      const x = 1.5 + this.rng() * (this.W - 3);
      const y = 1.5 + this.rng() * (this.H - 3);
      // keep spawn lanes clearer (left/right or top/bottom)
      if (this.portrait) {
        if (y < 3.5 || y > this.H - 3.5) continue;
      } else {
        if (x < 4.0 || x > this.W - 4.0) continue;
      }
      // trees ~1.2× soldier size (soldier r≈0.9 → canopy r≈0.55)
      const r = 0.35 + this.rng() * 0.28;
      if (kind === 'tree') {
        props.push({ kind: 'tree', cover: true, x, y, r: 0.45 + this.rng() * 0.15, w: 0.55, h: 0.55 });
      } else if (kind === 'dune') {
        props.push({ kind: 'dune', cover: false, x, y, r: r * 1.1, w: 1.4 + this.rng() * 0.6, h: 0.55 + this.rng() * 0.25 });
      } else if (kind === 'ice') {
        props.push({ kind: 'ice', cover: true, x, y, r, w: r * 1.3, h: r * 0.95 });
      } else if (kind === 'coral') {
        props.push({ kind: 'coral', cover: true, x, y, r: r * 0.85, w: r, h: r });
      } else if (kind === 'basalt') {
        props.push({ kind: 'basalt', cover: true, x, y, r, w: r * 1.15, h: r });
      } else {
        props.push({ kind: 'boulder', cover: true, x, y, r, w: r * 1.2, h: r * 1.05 });
      }
    }
    for (let i = 0; i < 3; i++) {
      props.push({
        kind: 'crater', cover: true,
        x: margin + this.rng() * (this.W - margin * 2),
        y: margin + this.rng() * (this.H - margin * 2),
        r: 0.45 + this.rng() * 0.3, w: 0.9, h: 0.9,
      });
    }
    if (kind === 'dune') {
      for (let i = 0; i < 4; i++) {
        props.push({
          kind: 'dune', cover: false,
          x: 1.5 + this.rng() * (this.W - 3),
          y: 1.5 + this.rng() * (this.H - 3),
          r: 0.55, w: 1.6 + this.rng() * 0.5, h: 0.6 + this.rng() * 0.25,
        });
      }
    } else if (kind === 'tree') {
      for (let i = 0; i < 3; i++) {
        props.push({
          kind: 'tree', cover: true,
          x: margin + this.rng() * (this.W - margin * 2),
          y: margin + this.rng() * (this.H - margin * 2),
          r: 0.48 + this.rng() * 0.12, w: 0.55, h: 0.55,
        });
      }
    }
    return props;
  }

  _spawn(u, side, i, total) {
    const isAtt = side === 'attacker';
    const n = Math.max(1, total || 1);
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    const col = i % cols;
    const row = Math.floor(i / cols);
    let baseX, baseY, facing;
    if (this.portrait) {
      // armies face top (def) vs bottom (att) — spread for opening range
      const laneX = this.W / 2 - (cols - 1) * 1.35 + col * 2.7;
      baseX = laneX + (this.rng() - 0.5) * 0.25;
      baseY = isAtt
        ? this.H - 2.4 - row * 2.0
        : 2.4 + row * 2.0;
      facing = isAtt ? -Math.PI / 2 : Math.PI / 2;
    } else {
      // left (att) vs right (def) — clear opening range
      baseX = isAtt ? 2.4 + row * 1.9 : this.W - 2.4 - row * 1.9;
      baseY = this.H / 2 - (cols - 1) * 1.25 + col * 2.5;
      baseX += (this.rng() - 0.5) * 0.2;
      baseY += (this.rng() - 0.5) * 0.2;
      facing = isAtt ? 0 : Math.PI;
    }
    const status = u.hpNow <= 0 ? 'out' : (u.hpNow / u.stats.hp <= CRAWL_HP ? 'crawl' : 'ok');
    const radius = u.type === 'tank' ? 1.1 : 0.9;
    return {
      ...u, side,
      x: baseX, y: baseY,
      dropY: isAtt ? (this.portrait ? baseY + 3.2 : baseY - 2.8 - this.rng() * 0.6) : baseY,
      landed: !isAtt,
      goal: null, targetId: null,
      cd: 0.2 + this.rng() * 0.5,
      status, outT: status === 'out' ? 0 : null,
      facing, turret: facing,
      selected: false, moveFrac: 0, radius,
      covered: false, labelOffX: 0, labelOffY: 0,
    };
  }

  alive(u) { return u.status !== 'out' && u.hpNow > 0; }

  retreat() {
    if (this.over) return;
    this.retreated = true;
    this.over = 'defender';
    this._beginOutro();
  }

  selectAt(wx, wy, { clearOnMiss = true } = {}) {
    if (this.phase !== 'fight') return null;
    let best = null, bestD = 1.5;
    for (const u of this.units) {
      if (u.side !== 'attacker' || !this.alive(u) || !u.landed) continue;
      const d = Math.hypot(u.x - wx, u.y - wy);
      if (d < bestD) { bestD = d; best = u; }
    }
    if (best) {
      for (const u of this.units) u.selected = false;
      best.selected = true; this.selected = best;
    } else if (clearOnMiss) {
      for (const u of this.units) u.selected = false;
      this.selected = null;
    }
    return best;
  }

  tap(wx, wy) {
    if (this.phase === 'intro' || this.phase === 'outro') {
      this.bannerSkip = true;
      return 'skip';
    }
    if (this.phase !== 'fight') return 'busy';
    let enemy = null, eD = 1.6;
    for (const u of this.units) {
      if (u.side !== 'defender' || !this.alive(u)) continue;
      const d = Math.hypot(u.x - wx, u.y - wy);
      if (d < eD) { eD = d; enemy = u; }
    }
    if (enemy && this.selected && this.alive(this.selected)) {
      this.selected.targetId = enemy.id;
      this.selected.goal = null;
      return 'target';
    }
    const fri = this.selectAt(wx, wy, { clearOnMiss: false });
    if (fri) return 'select';
    if (this.selected && this.alive(this.selected)) {
      const [fx, fy] = this._free(wx, wy);
      this.selected.targetId = null;
      this.selected.goal = { x: fx, y: fy };
      return 'move';
    }
    return 'none';
  }

  _free(x, y, opts = {}) {
    x = Math.max(1.2, Math.min(this.W - 1.2, x));
    y = Math.max(1.2, Math.min(this.H - 1.2, y));
    if (opts.ignoreProps) return [x, y];
    for (const p of this.props) {
      if (p.kind === 'dune' || p.kind === 'crater') continue;
      const hw = (p.w || p.r || 0.6) * 0.55;
      const hh = (p.h || p.r || 0.6) * 0.55;
      if (Math.abs(x - p.x) < hw + 0.5 && Math.abs(y - p.y) < hh + 0.5) {
        const dx = x - p.x, dy = y - p.y;
        if (Math.abs(dx) / (hw + 0.5) > Math.abs(dy) / (hh + 0.5)) {
          x = p.x + Math.sign(dx || 1) * (hw + 0.55);
        } else {
          y = p.y + Math.sign(dy || 1) * (hh + 0.55);
        }
      }
    }
    return [x, y];
  }

  /** True if target is behind/near cover relative to shooter. */
  isCovered(target, shooter) {
    if (!shooter || !target) return false;
    for (const p of this.props) {
      if (!p.cover) continue;
      const near = Math.hypot(target.x - p.x, target.y - p.y) < (Math.max(p.w || 0, p.h || 0, p.r || 0) * 0.7 + 1.15);
      if (!near) continue;
      // prop roughly between shooter and target, or target hugging the far side
      const sx = shooter.x, sy = shooter.y, tx = target.x, ty = target.y;
      const dx = tx - sx, dy = ty - sy;
      const len2 = dx * dx + dy * dy || 1;
      const t = ((p.x - sx) * dx + (p.y - sy) * dy) / len2;
      if (t < 0.15 || t > 1.05) continue;
      const cx = sx + t * dx, cy = sy + t * dy;
      const dist = Math.hypot(p.x - cx, p.y - cy);
      const rad = Math.max(p.w || 0, p.h || 0, p.r || 0) * 0.65 + 0.35;
      if (dist < rad) return true;
    }
    return false;
  }

  _pushFx(f) {
    if (this.fx.length >= FX_CAP) this.fx.shift();
    this.fx.push(f);
  }

  step(dt) {
    if (this.phase === 'done') return;
    const s = this.speed;
    const t = dt * s;
    this.time += t;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - t * 4);

    if (this.phase === 'intro') {
      this.introT += t;
      const lim = 1.6 / Math.max(1, s * 0.65);
      if (this.bannerSkip || this.introT >= lim) {
        this.bannerSkip = false;
        this.phase = 'drop';
        this.dropT = 0;
      }
      return;
    }

    if (this.phase === 'outro') {
      this.outroT += t;
      const lim = 1.8 / Math.max(1, s * 0.7);
      if (this.bannerSkip || this.outroT >= lim) {
        this.bannerSkip = false;
        this.phase = 'done';
      }
      return;
    }

    if (this.phase === 'drop') {
      this.dropT += t;
      this.ship.x += (this.ship.vx || 0) * t;
      this.ship.y += (this.ship.vy || 0) * t;
      // altitude dips while dropping
      this.ship.alt = 3.2 - Math.min(2.4, this.dropT * 0.55);
      const att = this.units.filter((u) => u.side === 'attacker');
      for (let i = 0; i < att.length; i++) {
        const u = att[i];
        if (u.landed) continue;
        const dropAt = 0.45 + i * 0.28;
        if (this.dropT >= dropAt) {
          u.dropY += 9 * t;
          if (u.dropY >= u.y) {
            u.dropY = u.y; u.landed = true;
            this._pushFx({ kind: 'dust', x: u.x, y: u.y, t: 0, life: 0.55, r: 0.9 });
          }
        }
      }
      if (this.dropT > 0.45 + att.length * 0.28 + 0.9) {
        this.phase = 'fight';
        this.ship.done = true;
        this.lastDamageAt = this.time;
        this.lastDamageBySide.attacker = this.time;
        this.lastDamageBySide.defender = this.time;
        for (const u of att) { u.landed = true; u.dropY = u.y; }
      }
      // age fx during drop
      this._ageFx(t);
      return;
    }

    // fight
    for (const u of this.units) {
      if (u.status === 'out') {
        if (u.outT != null) u.outT += t;
        continue;
      }
      if (!u.landed) continue;
      u.cd = Math.max(0, u.cd - t);

      if (u.hpNow <= 0) this._takeOut(u);
      else if (u.hpNow / u.stats.hp <= CRAWL_HP) u.status = 'crawl';
      else u.status = 'ok';
      if (!this.alive(u)) continue;

      // update covered flag vs nearest threat / current target
      const threat = u.targetId
        ? this.units.find((x) => x.id === u.targetId)
        : this.units.find((x) => x.side !== u.side && this.alive(x));
      u.covered = !!(threat && this.isCovered(u, threat));

      if (u.side === 'defender' || (u.side === 'attacker' && !u.selected)) {
        this._ai(u);
      }

      let gx = null, gy = null;
      const tgt = u.targetId ? this.units.find((x) => x.id === u.targetId && this.alive(x)) : null;
      if (tgt) {
        const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
        const aim = Math.atan2(tgt.y - u.y, tgt.x - u.x);
        u.turret = aim;
        // Honor flank/push goals even while in range (stall break)
        if (u.goal) { gx = u.goal.x; gy = u.goal.y; }
        else if (dist > u.stats.range * 0.82) { gx = tgt.x; gy = tgt.y; }
        else u.facing = aim;
      } else if (u.goal) { gx = u.goal.x; gy = u.goal.y; }

      if (gx != null) {
        const dx = gx - u.x, dy = gy - u.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.3) { u.goal = null; u.moveFrac = 0; }
        else {
          const sp = u.stats.speed * (u.status === 'crawl' ? CRAWL_SPEED : 1);
          const step = Math.min(dist, sp * t);
          u.x += (dx / dist) * step;
          u.y += (dy / dist) * step;
          u.facing = Math.atan2(dy, dx);
          if (u.type !== 'tank') u.turret = u.facing;
          else {
            // hull follows move; turret keeps aim if any
            if (!tgt) u.turret = u.facing;
          }
          u.moveFrac = (u.moveFrac + step) % 1;
          const assaulting = this.time < this.assaultUntil;
          const [fx, fy] = this._free(u.x, u.y, { ignoreProps: assaulting });
          u.x = fx; u.y = fy;
        }
      }

      this._tryShoot(u);
    }

    this._separateUnits();
    this._ageFx(t);
    this._resolveLabels();
    this._checkVictory();
  }

  /** Soft push so live units don't stack on each other. */
  _separateUnits() {
    const live = this.units.filter((u) => this.alive(u) && u.landed);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const minD = (a.radius + b.radius) * 1.05;
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = 0.01; dy = 0; d = 0.01; }
        if (d >= minD) continue;
        const push = (minD - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const [ax, ay] = this._free(a.x, a.y); a.x = ax; a.y = ay;
        const [bx, by] = this._free(b.x, b.y); b.x = bx; b.y = by;
      }
    }
  }

  _ageFx(t) {
    const fx = this.fx;
    let w = 0;
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      f.t += t;
      if (f.t < f.life) fx[w++] = f;
    }
    fx.length = w;
  }

  /** Place Out chips away from live units (candidate search). */
  _resolveLabels() {
    const live = [];
    for (const u of this.units) {
      if (this.alive(u) && u.landed) live.push(u);
      u.labelOffX = 0;
      u.labelOffY = 0;
    }
    const cands = [
      { x: 1.8, y: 0 }, { x: -1.8, y: 0 }, { x: 1.6, y: -1.0 }, { x: -1.6, y: -1.0 },
      { x: 1.6, y: 1.0 }, { x: -1.6, y: 1.0 }, { x: 0, y: 1.6 }, { x: 0, y: -1.6 },
      { x: 2.4, y: 0.4 }, { x: -2.4, y: 0.4 }, { x: 2.2, y: -1.4 }, { x: -2.2, y: -1.4 },
    ];
    for (const u of this.units) {
      if (u.status !== 'out') continue;
      let best = cands[0], bestScore = -1e9;
      for (const c of cands) {
        let minD = 99;
        for (const L of live) {
          const d = Math.hypot((u.x + c.x) - L.x, (u.y + c.y) - L.y);
          minD = Math.min(minD, d - L.radius);
        }
        // prefer above-ish and closer to wreck
        const score = minD * 3 - Math.hypot(c.x, c.y) * 0.35 + (c.y < 0 ? 0.4 : 0);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      u.labelOffX = best.x;
      u.labelOffY = best.y;
    }
  }

  stallAge() {
    return Math.max(0, this.time - (this.lastDamageAt || 0));
  }

  /** Seconds since this side last dealt damage (one-sided poke still stalls the other). */
  sideStallAge(side) {
    return Math.max(0, this.time - (this.lastDamageBySide?.[side] || 0));
  }

  _ai(u) {
    const foes = this.units.filter((x) => x.side !== u.side && this.alive(x) && x.landed);
    if (!foes.length) { u.targetId = null; return; }
    let best = null, bestD = 1e9;
    for (const f of foes) {
      const d = Math.hypot(f.x - u.x, f.y - u.y);
      if (d < bestD) { bestD = d; best = f; }
    }
    if (!best) return;
    u.targetId = best.id;

    // Stall break: no damage for ~6s (global or this side not dealing) → assault
    if (this.stallAge() >= STALL_PUSH_SEC || this.sideStallAge(u.side) >= STALL_PUSH_SEC) {
      this.assaultUntil = Math.max(this.assaultUntil, this.time + 5.5);
    }
    const assaulting = this.time < this.assaultUntil;

    if (assaulting) {
      const base = Math.atan2(best.y - u.y, best.x - u.x);
      const jitter = (this.rng() - 0.5) * 1.1;
      const side = this.rng() < 0.5 ? 1 : -1;
      // Press in close — hold short so they actually enter engagement
      const hold = Math.max(0.55, Math.min(bestD * 0.22, u.stats.range * 0.22));
      let ang = base + jitter + side * (0.35 + this.rng() * 0.55);
      // If a cover prop is roughly between us and the foe, arc around it THEN in
      for (const p of this.props) {
        if (!p.cover) continue;
        const dx = best.x - u.x, dy = best.y - u.y;
        const len2 = dx * dx + dy * dy || 1;
        const tt = ((p.x - u.x) * dx + (p.y - u.y) * dy) / len2;
        if (tt < 0.1 || tt > 0.95) continue;
        const cx = u.x + tt * dx, cy = u.y + tt * dy;
        const rad = Math.max(p.w || 0, p.h || 0, p.r || 0.6) * 0.65 + 0.4;
        if (Math.hypot(p.x - cx, p.y - cy) > rad) continue;
        ang = Math.atan2(best.y - p.y, best.x - p.x) + side * (0.9 + this.rng() * 0.5);
        break;
      }
      const tx = best.x - Math.cos(ang) * hold;
      const ty = best.y - Math.sin(ang) * hold;
      const [fx, fy] = this._free(tx, ty, { ignoreProps: true });
      u.goal = { x: fx, y: fy };
      return;
    }

    // Prefer a cover prop between self and foe if nearby (while fighting is active)
    let coverGoal = null;
    if (this.rng() < 0.55) {
      let bestScore = 1e9;
      for (const p of this.props) {
        if (!p.cover) continue;
        const dMe = Math.hypot(p.x - u.x, p.y - u.y);
        if (dMe > 6) continue;
        const ang = Math.atan2(best.y - p.y, best.x - p.x);
        const sx = p.x - Math.cos(ang) * (Math.max(p.w || 0, p.r || 0.6) * 0.55 + 0.7);
        const sy = p.y - Math.sin(ang) * (Math.max(p.h || 0, p.r || 0.6) * 0.55 + 0.7);
        const score = dMe + Math.hypot(sx - best.x, sy - best.y) * 0.15;
        if (score < bestScore) { bestScore = score; coverGoal = { x: sx, y: sy }; }
      }
    }
    if (bestD > u.stats.range * 0.8) {
      if (coverGoal && bestD > u.stats.range * 0.5) {
        const [fx, fy] = this._free(coverGoal.x, coverGoal.y);
        u.goal = { x: fx, y: fy };
      } else {
        const a = Math.atan2(best.y - u.y, best.x - u.x) + (this.rng() - 0.5) * 0.35;
        const hold = Math.max(1.4, u.stats.range * 0.55);
        const [fx, fy] = this._free(best.x - Math.cos(a) * hold, best.y - Math.sin(a) * hold);
        u.goal = { x: fx, y: fy };
      }
    } else if (coverGoal && !u.covered && this.rng() < 0.35) {
      const [fx, fy] = this._free(coverGoal.x, coverGoal.y);
      u.goal = { x: fx, y: fy };
    } else u.goal = null;
  }

  _tryShoot(u) {
    if (u.cd > 0) return;
    const tgt = u.targetId ? this.units.find((x) => x.id === u.targetId && this.alive(x)) : null;
    if (!tgt) return;
    const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
    if (dist > u.stats.range) return;
    const aim = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    u.facing = u.type === 'tank' ? u.facing : aim;
    u.turret = aim;
    const rof = (u.type === 'tank' ? 1.35 : u.type === 'heavy' ? 1.05 : u.type === 'recon' ? 1.25 : 0.65)
      * (u.status === 'crawl' ? CRAWL_ROF : 1);
    u.cd = rof;
    const acc = HIT_BASE * (1 - 0.32 * (dist / Math.max(1, u.stats.range)));
    const hit = this.rng() < acc;
    const color = u.side === 'attacker' ? this.attColor : this.defColor;
    // muzzle + tracer
    const mz = u.radius * 0.95;
    const mx = u.x + Math.cos(aim) * mz;
    const my = u.y + Math.sin(aim) * mz;
    this._pushFx({ kind: 'muzzle', x: mx, y: my, t: 0, life: 0.22, ang: aim, tank: u.type === 'tank' });
    this._pushFx({
      kind: 'tracer', x0: mx, y0: my, x1: tgt.x, y1: tgt.y,
      t: 0, life: u.type === 'tank' ? 0.45 : 0.32, color, tank: u.type === 'tank',
    });
    if (hit) {
      let raw = u.stats.attack;
      const covered = this.isCovered(tgt, u);
      if (covered) raw *= COVER_MUL;
      const dmg = Math.max(1, raw - (tgt.stats.armor || 0) * 1.5);
      tgt.hpNow = Math.max(0, tgt.hpNow - dmg);
      this.lastDamageAt = this.time;
      this.lastDamageBySide[u.side] = this.time;
      this._pushFx({ kind: 'spark', x: tgt.x, y: tgt.y, t: 0, life: 0.45, n: u.type === 'tank' ? 9 : 6 });
      this._pushFx({ kind: 'dmg', x: tgt.x, y: tgt.y, t: 0, life: 1.1, dmg: Math.round(dmg), covered });
      if (u.type === 'tank') {
        this._addScorch(tgt.x, tgt.y);
        this.shake = Math.max(this.shake, 0.35);
      }
      if (tgt.hpNow <= 0) this._takeOut(tgt, u);
      else if (tgt.hpNow / tgt.stats.hp <= CRAWL_HP) tgt.status = 'crawl';
    }
  }

  _addScorch(x, y) {
    if (this.scorch.length >= SCORCH_CAP) this.scorch.shift();
    this.scorch.push({ x, y, r: 0.7 + this.rng() * 0.4, a: 0.72 });
  }

  _takeOut(u, by) {
    if (u.status === 'out') return;
    u.hpNow = 0; u.status = 'out'; u.outT = 0;
    u.selected = false; u.goal = null; u.targetId = null;
    if (this.selected === u) this.selected = null;
    this._pushFx({ kind: 'out', x: u.x, y: u.y, t: 0, life: 0.35 });
    this._pushFx({ kind: 'spark', x: u.x, y: u.y, t: 0, life: 0.35, n: 6 });
    this.shake = Math.max(this.shake, u.type === 'tank' ? 0.55 : 0.3);
    this._addScorch(u.x, u.y);
    if (by) {
      const killerIsPlayer = (by.side === 'attacker' && this.attSide === 'player')
        || (by.side === 'defender' && this.defSide === 'player');
      const victimIsEnemy = (u.side === 'attacker' && this.attSide === 'enemy')
        || (u.side === 'defender' && this.defSide === 'enemy');
      if (killerIsPlayer && victimIsEnemy) this.enemyKills++;
    }
  }

  _checkVictory() {
    if (this.over) return;
    const aLive = this.units.some((u) => u.side === 'attacker' && this.alive(u));
    const dLive = this.units.some((u) => u.side === 'defender' && this.alive(u));
    if (!aLive && !dLive) { this.over = 'defender'; this._beginOutro(); return; }
    if (!aLive) { this.over = 'defender'; this._beginOutro(); return; }
    if (!dLive) { this.over = 'attacker'; this._beginOutro(); return; }
  }

  _beginOutro() {
    if (this.phase === 'outro' || this.phase === 'done') return;
    this.phase = 'outro';
    this.outroT = 0;
    this.bannerSkip = false;
    this._pendingResult = this.result();
  }

  /** Player-perspective victory? */
  playerWon() {
    const playerIs = this.attSide === 'player' ? 'attacker'
      : this.defSide === 'player' ? 'defender' : 'attacker';
    return this.over === playerIs;
  }

  result() {
    if (this._pendingResult && this.phase === 'done') return this._pendingResult;
    const pack = (side, pass) => {
      const live = this.units
        .filter((u) => u.side === side && this.alive(u))
        .map((u) => ({
          id: u.id, type: u.type, name: u.name, icon: u.icon,
          stats: { ...u.stats },
          hpNow: Math.max(1, Math.round(u.hpNow)),
        }));
      return [...live, ...pass.map((u) => ({ ...u }))];
    };
    const winner = this.over || 'defender';
    const playerWon = (winner === 'attacker' && this.attSide === 'player')
      || (winner === 'defender' && this.defSide === 'player');
    let kills = this.enemyKills;
    if (playerWon && kills === 0) {
      const enemySide = this.attSide === 'player' ? 'defender' : 'attacker';
      kills = this.units.filter((u) => u.side === enemySide && u.status === 'out').length;
    }
    return {
      winner,
      survivors: { attacker: pack('attacker', this.passAtt), defender: pack('defender', this.passDef) },
      pointsEarned: playerWon ? (10 + 5 * kills) : 0,
    };
  }
}

/** Pure helper for tests: cover damage multiplier. */
export function coverDamageMul(covered) { return covered ? COVER_MUL : 1; }
export { STALL_PUSH_SEC };
