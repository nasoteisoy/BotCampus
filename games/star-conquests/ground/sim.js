// Ground battle simulation — BF2-2005 style Conquest (posts + tickets + spawn + AI).
// No DOM. CONTRACT: pause/sc-quit via shell; result has retreated, lost, ticketsLeft.

export const GROUND_TYPES = new Set(['rifle', 'heavy', 'recon', 'sniper', 'engineer', 'officer', 'special', 'tank']);

export const DEFAULT_STATS = Object.freeze({
  rifle:     { hp: 100, attack: 16, range:  9, speed: 3.2, armor: 0, rof: 0.45 },
  heavy:     { hp: 150, attack: 38, range: 10, speed: 2.2, armor: 2, rof: 0.85 },
  recon:     { hp:  80, attack: 42, range: 16, speed: 2.8, armor: 0, rof: 1.15 },
  sniper:    { hp:  80, attack: 42, range: 16, speed: 2.8, armor: 0, rof: 1.15 },
  engineer:  { hp: 110, attack: 14, range:  6, speed: 3.0, armor: 1, rof: 0.4 },
  officer:   { hp: 120, attack: 22, range: 10, speed: 3.0, armor: 1, rof: 0.5 },
  special:   { hp: 130, attack: 28, range: 11, speed: 3.4, armor: 1, rof: 0.55 },
  tank:      { hp: 400, attack: 55, range: 14, speed: 2.4, armor: 10, rof: 1.2 },
});

/** Ticket share per CATALOG / battle type. Documented in README. */
export const TICKET_VALUE = Object.freeze({
  rifle: 20, heavy: 30, recon: 25, sniper: 25, engineer: 22, officer: 28, special: 32, tank: 50,
});

export const ALL_CLASSES = Object.freeze(['rifle', 'heavy', 'sniper', 'engineer', 'officer', 'special']);
/** Battle class ids; 'recon' kept as alias of sniper for CATALOG units. */
export const SPAWN_CLASSES = ALL_CLASSES;
export function resolveClass(id) {
  if (id === 'recon' || id === 'sniper') return 'sniper';
  if (ALL_CLASSES.includes(id)) return id;
  if (id === 'rifle' || id === 'heavy' || id === 'engineer' || id === 'tank') return id;
  return 'rifle';
}
/** Four base deploy classes when the shell sends a short list. */
export const BASE_CLASSES = Object.freeze(['rifle', 'heavy', 'sniper', 'engineer']);

export function playerUnlockedClasses(optsClasses) {
  if (!Array.isArray(optsClasses) || !optsClasses.length) return [...ALL_CLASSES];
  const out = [];
  const seen = new Set();
  // rifle always available
  out.push('rifle'); seen.add('rifle');
  for (const raw of optsClasses) {
    let id = raw === 'recon' ? 'sniper' : raw;
    if (id === 'rifle') continue;
    if (!ALL_CLASSES.includes(id) || seen.has(id)) continue;
    seen.add(id); out.push(id);
  }
  // Harmless floor: if fewer than 4 unlocked, pad with the 4 base classes
  if (out.length < 4) {
    for (const id of BASE_CLASSES) {
      if (!seen.has(id)) { seen.add(id); out.push(id); }
      if (out.length >= 4) break;
    }
  }
  return out;
}

export const ICONS = Object.freeze({
  rifle: 'rifle', heavy: 'heavy', recon: 'recon', engineer: 'engineer', tank: 'tank',
});

export const BIOME = Object.freeze({
  desert: { ground: '#c9a85c', accent: '#8a6a2e', rock: '#6b5330', prop: 'dune' },
  ice:    { ground: '#c5dceb', accent: '#6a8aa8', rock: '#9bb4c4', prop: 'ice' },
  jungle: { ground: '#3f8a4a', accent: '#2a5530', rock: '#4a6040', prop: 'tree' },
  lava:   { ground: '#5c3230', accent: '#a04820', rock: '#3a2020', prop: 'basalt' },
  rock:   { ground: '#6e6974', accent: '#4a4550', rock: '#3a3540', prop: 'boulder' },
  ocean:  { ground: '#3d7a88', accent: '#2a4a5a', rock: '#2a4050', prop: 'coral' },
});

const CRAWL_HP = 0.28;
const COVER_MUL = 0.6;
const FX_CAP = 80;
const SCORCH_CAP = 28;
export const AI_CAP = 8;
const BLEED_PER_SEC = 1.15; // tickets/sec when holding fewer posts
const CAPTURE_BASE = 0.28;  // progress/sec one ally uncontested
export const POST_RADIUS = 2.4;
const MAP_LAND_W = 28;
const MAP_LAND_H = 20;
const MAP_PORT_W = 18;
const MAP_PORT_H = 28;
export const RESPAWN_SEC = 3.5;
const CRAWL_TO_OUT = 2.8;

export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeUnit(raw, i, sideTag) {
  const type = GROUND_TYPES.has(raw?.type) ? raw.type : null;
  if (!type) return null;
  const stats = { ...(DEFAULT_STATS[type] || DEFAULT_STATS.rifle), ...(raw.stats || {}) };
  const hp = Math.max(1, stats.hp | 0);
  const hpNow = raw.hpNow != null ? Math.max(0, Math.min(hp, +raw.hpNow)) : hp;
  return {
    id: raw.id || `${sideTag}-${type}-${i}`,
    type, name: raw.name || typeLabel(type),
    icon: raw.icon || type,
    stats, hpNow,
    ticketShare: TICKET_VALUE[type] || 20,
  };
}

export function filterPassthrough(units) {
  return (units || []).filter((u) => !GROUND_TYPES.has(u?.type));
}

export function typeLabel(t) {
  return ({ rifle: 'Rifleman', heavy: 'Heavy', recon: 'Sniper', sniper: 'Sniper', engineer: 'Engineer', officer: 'Officer', special: 'Special', tank: 'Tank' })[t] || t;
}

export function ticketsFromArmy(units) {
  let sum = 0;
  for (const u of units || []) {
    if (!GROUND_TYPES.has(u?.type)) continue;
    const max = (u.stats?.hp) || DEFAULT_STATS[u.type]?.hp || 100;
    const now = u.hpNow != null ? Math.max(0, +u.hpNow) : max;
    const share = TICKET_VALUE[u.type] || 20;
    sum += share * (max > 0 ? now / max : 1);
  }
  return Math.max(10, Math.round(sum));
}

export function coverDamageMul(covered) { return covered ? COVER_MUL : 1; }

export class GroundSim {
  constructor(opts = {}) {
    this.opts = opts;
    this.rng = mulberry32(opts.seed || 1);
    this.planet = opts.planet || { name: 'Desert', biome: 'desert', icon: '' };
    this.biomeKey = this.planet.biome || 'desert';
    this.biome = BIOME[this.biomeKey] || BIOME.desert;
    this.portrait = !!opts.portrait;
    this.W = this.portrait ? MAP_PORT_W : MAP_LAND_W;
    this.H = this.portrait ? MAP_PORT_H : MAP_LAND_H;

    this.attSide = opts.attacker?.side || 'player';
    this.defSide = opts.defender?.side || 'enemy';
    this.attColor = opts.attacker?.color || '#3a8fff';
    this.defColor = opts.defender?.color || '#ff6a5a';
    this.playerSide = this.attSide === 'player' ? 'attacker'
      : this.defSide === 'player' ? 'defender' : 'attacker';

    const aRaw = opts.attacker?.units || [];
    const dRaw = opts.defender?.units || [];
    this.armyAtt = aRaw.map((u, i) => normalizeUnit(u, i, 'a')).filter(Boolean);
    this.armyDef = dRaw.map((u, i) => normalizeUnit(u, i, 'd')).filter(Boolean);
    this.passAtt = filterPassthrough(aRaw);
    this.passDef = filterPassthrough(dRaw);

    // Tickets: unit-derived default, opts.tickets overrides per side when number
    const defA = ticketsFromArmy(this.armyAtt.length ? this.armyAtt : stubArmy());
    const defD = ticketsFromArmy(this.armyDef.length ? this.armyDef : stubArmy());
    const ot = opts.tickets || {};
    this.ticketsStart = {
      attacker: (typeof ot.attacker === 'number' && isFinite(ot.attacker)) ? Math.max(1, ot.attacker | 0) : defA,
      defender: (typeof ot.defender === 'number' && isFinite(ot.defender)) ? Math.max(1, ot.defender | 0) : defD,
    };
    // Harmless floor: at least 150 tickets per side (shell usually sends 150+)
    this.ticketsStart.attacker = Math.max(150, this.ticketsStart.attacker | 0);
    this.ticketsStart.defender = Math.max(150, this.ticketsStart.defender | 0);
    // reinforce bonus: +25% starting tickets on player side
    if (opts.bonus?.id === 'reinforce') {
      const ps = (opts.attacker?.side === 'player') ? 'attacker' : (opts.defender?.side === 'player') ? 'defender' : 'attacker';
      this.ticketsStart[ps] = Math.max(150, Math.round(this.ticketsStart[ps] * 1.25));
    }
    this.tickets = { attacker: this.ticketsStart.attacker, defender: this.ticketsStart.defender };
    this._bleedAcc = { attacker: 0, defender: 0 };

    // Unlocked player classes (picker). AI may use any ALL_CLASSES.
    this.unlockedClasses = playerUnlockedClasses(opts.classes);
    // Bonus once for player's side
    this.bonus = (opts.bonus && opts.bonus.id) ? { id: opts.bonus.id } : null;
    this.heroReady = this.bonus?.id === 'hero';
    this.heroT = 0;
    /** { side, t } countdown while side holds ALL posts; null if inactive */
    this.holdWin = null;
    this.kills = { attacker: 0, defender: 0 };
    this.cpsTaken = 0;
    this._stats = {
      damageDealt: 0, damageTaken: 0, deaths: 0, captures: 0, shotsFired: 0, timeInLead: 0,
    };
    this._shieldT = 0;
    this._sabotageT = 0;


    this.posts = this._genPosts();
    this.props = this._genProps();
    this.units = [];
    this._uid = 0;
    this._seedAI('attacker');
    this._seedAI('defender');

    // Optional one tank per side near base post
    this._spawnTank('attacker', this.posts[0]);
    this._spawnTank('defender', this.posts[this.posts.length - 1]);
    this._applyBonusStart();

    this.player = null; // Lead-mode controlled unit
    this.mode = 'command'; // 'command' | 'lead'
    this.phase = 'spawn'; // spawn | fight | outro | done
    this.spawnPending = true;
    this.respawnT = 0;
    this.needSpawn = true;

    this.speeds = [1, 2, 3];
    this.speedIdx = 1;
    this.selected = null;
    this.fx = [];
    this.scorch = [];
    this.shake = 0;
    this.over = null;
    this.retreated = false;
    this.bannerSkip = false;
    this.outroT = 0;
    this._pendingResult = null;
    this.enemyKills = 0;
    this._lostSnap = { attacker: [], defender: [] };
    this.hintDismissed = false;
    this.time = 0;
  }

  get speed() { return this.speeds[this.speedIdx] || 1; }
  cycleSpeed() { this.speedIdx = (this.speedIdx + 1) % this.speeds.length; return this.speed; }
  skipBanner() { this.bannerSkip = true; }
  skipDrop() { /* no drop phase in BF2 slice */ this.phase = this.phase === 'spawn' ? 'spawn' : 'fight'; }


  _applyBonusStart() {
    const id = this.bonus?.id;
    if (!id) return;
    const ps = this.playerSide;
    const es = ps === 'attacker' ? 'defender' : 'attacker';
    if (id === 'shield') {
      this._shieldT = 20;
      for (const u of this.units) {
        if (u.side === ps) u.shield = 1;
      }
    }
    if (id === 'sabotage') {
      this._sabotageT = 45;
      for (const u of this.units) {
        if (u.side === es && u.type === 'tank') {
          u.disabled = true;
          u.coolT = 45;
        }
      }
    }
  }

  triggerHero() {
    if (!this.heroReady || this.heroT > 0) return false;
    if (!this.player || !this.alive(this.player)) return false;
    this.heroReady = false;
    this.heroT = 20;
    this.player.hero = true;
    return true;
  }

  alive(u) { return u && u.status !== 'out' && u.hpNow > 0; }
  isCrawl(u) { return u && u.status === 'crawl'; }

  postsHeld(side) { return this.posts.filter((p) => p.owner === side).length; }

  ownedPosts(side) { return this.posts.filter((p) => p.owner === side); }

  setMode(m) {
    if (m !== 'command' && m !== 'lead') return;
    this.mode = m;
    if (m === 'command' && this.player) {
      this.player.playerControlled = false;
    }
    if (m === 'lead' && this.player && this.alive(this.player)) {
      this.player.playerControlled = true;
    }
  }

  /** Open spawn UI after death / at start. */
  requestSpawn() {
    this.needSpawn = true;
    this.phase = 'spawn';
    this.spawnPending = true;
  }

  /**
   * Pick class + post and enter fight as player trooper (Lead) or just dismiss spawn (Command keeps AI).
   * @returns {boolean} ok
   */
  spawnPlayer(classType, postId) {
    let type = resolveClass(classType);
    if (type === 'tank' || type === 'recon') type = type === 'recon' ? 'sniper' : 'rifle';
    if (!this.unlockedClasses.includes(type)) type = 'rifle';
    const post = this.posts.find((p) => p.id === postId) || this.ownedPosts(this.playerSide)[0];
    if (!post || post.owner !== this.playerSide) return false;
    // Remove old player body if any
    if (this.player && this.alive(this.player)) {
      this.player.playerControlled = false;
    }
    const u = this._makeUnit(this.playerSide, type, post.x + (this.rng() - 0.5) * 3.2, post.y + (this.rng() - 0.5) * 3.2);
    u.playerControlled = this.mode === 'lead';
    u.isPlayer = true;
    this.units.push(u);
    this.player = u;
    this.needSpawn = false;
    this.spawnPending = false;
    this.respawnT = 0;
    if (this.phase === 'spawn') this.phase = 'fight';
    return true;
  }

  /** Command-mode: dismiss spawn and auto-seed player as AI-controlled rifle at first owned post. */
  autoStartCommand() {
    const posts = this.ownedPosts(this.playerSide);
    if (!posts.length) {
      // claim nearest starting post
      const p = this.playerSide === 'attacker' ? this.posts[0] : this.posts[this.posts.length - 1];
      p.owner = this.playerSide;
      p.progress = 1;
    }
    const post = this.ownedPosts(this.playerSide)[0];
    this.mode = 'command';
    return this.spawnPlayer('rifle', post.id);
  }

  retreat() {
    if (this.over) return;
    this.retreated = true;
    this.over = this.playerSide === 'attacker' ? 'defender' : 'attacker';
    this._beginOutro();
  }

  /** Player Lead input: moveDir world xz, aimYaw, fire, reload */
  setPlayerInput(inp = {}) {
    if (!this.player || !this.alive(this.player) || !this.player.playerControlled) return;
    this.player.input = {
      mx: inp.mx || 0, my: inp.my || 0,
      aim: inp.aim != null ? inp.aim : this.player.aim,
      fire: !!inp.fire,
      reload: !!inp.reload,
      interact: !!inp.interact,
    };
  }

  selectedUnits() {
    return this.units.filter((u) => u.selected && u.side === this.playerSide && this.alive(u) && !u.playerControlled);
  }

  clearSelection() {
    this.selected = null;
    for (const u of this.units) u.selected = false;
  }

  selectUnits(list) {
    this.clearSelection();
    for (const u of list) {
      if (u && u.side === this.playerSide && this.alive(u) && !u.playerControlled) u.selected = true;
    }
    this.selected = this.selectedUnits()[0] || null;
  }

  boxSelect(x0, y0, x1, y1) {
    const minx = Math.min(x0, x1), maxx = Math.max(x0, x1);
    const miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
    const pad = 0.6;
    const hits = this.units.filter((u) =>
      u.side === this.playerSide && this.alive(u) && !u.playerControlled
      && u.x >= minx - pad && u.x <= maxx + pad && u.y >= miny - pad && u.y <= maxy + pad
    );
    if (hits.length) this.selectUnits(hits);
    return hits.length;
  }

  orderSelected(wx, wy, opts = {}) {
    const list = this.selectedUnits();
    if (!list.length) return 'none';
    const enemy = this._unitAt(wx, wy);
    if (enemy && enemy.side !== this.playerSide && this.alive(enemy)) {
      for (const u of list) {
        u.targetId = enemy.id;
        u.goal = { x: enemy.x, y: enemy.y };
      }
      return 'attack';
    }
    const post = this._postAt(wx, wy);
    if (post) {
      for (const u of list) {
        u.goal = { x: post.x, y: post.y, postId: post.id };
        u.targetId = null;
      }
      return 'order-post';
    }
    for (const u of list) {
      u.goal = { x: wx, y: wy };
      u.targetId = null;
    }
    return 'move';
  }

  tap(wx, wy) {
    if (this.phase === 'outro') { this.skipBanner(); return 'skip'; }
    if (this.phase === 'spawn') return 'spawn';
    if (this.mode === 'lead') return 'lead';
    const hitU = this._unitAt(wx, wy);
    if (hitU && hitU.side === this.playerSide && this.alive(hitU) && !hitU.isPlayer) {
      this.selectUnits([hitU]);
      return 'select';
    }
    if (hitU && hitU.side !== this.playerSide && this.alive(hitU) && this.selectedUnits().length) {
      return this.orderSelected(wx, wy);
    }
    const post = this._postAt(wx, wy);
    if (this.selectedUnits().length) {
      return this.orderSelected(wx, wy);
    }
    if (post) {
      for (const u of this.units) {
        if (u.side === this.playerSide && this.alive(u) && !u.playerControlled) {
          u.goal = { x: post.x, y: post.y, postId: post.id };
        }
      }
      return 'rally';
    }
    return 'none';
  }

  step(dt) {
    if (this.phase === 'done') return;
    const sdt = dt * this.speed;
    this.time += sdt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - sdt * 2);

    // FX age
    for (const f of this.fx) f.t += sdt;
    this.fx = this.fx.filter((f) => f.t < f.life);

    if (this.phase === 'spawn') {
      // AI still idle; wait for spawn choice (or tests call autoStartCommand/spawnPlayer)
      this._tickBleed(sdt);
      this._checkVictory();
      return;
    }

    if (this.phase === 'outro') {
      this.outroT += sdt;
      if (this.bannerSkip || this.outroT > 2.2) {
        this.phase = 'done';
      }
      return;
    }

    // fight
    this._tickCapture(sdt);
    this._tickBleed(sdt);
    this._tickBonus(sdt);
    this._tickUnits(sdt);
    this._tickAI(sdt);
    this._keepTanksOffPosts();
    this._separateUnits(sdt);
    this._tickPlayer(sdt);
    this._maintainAICount();
    this._tickHoldWin(sdt);
    this._checkVictory();
  }


  _tickBonus(dt) {
    const ps = this.playerSide;
    if (this.mode === 'lead' && this.player && this.alive(this.player)) this._stats.timeInLead += dt;
    if (this.bonus?.id === 'medical') {
      for (const u of this.units) {
        if (u.side !== ps || !this.alive(u) || u.status === 'crawl') continue;
        u.hpNow = Math.min(u.stats.hp, u.hpNow + 3.5 * dt);
      }
    }
    if (this._shieldT > 0) {
      this._shieldT -= dt;
      if (this._shieldT <= 0) {
        for (const u of this.units) u.shield = 0;
      }
    }
    if (this._sabotageT > 0) {
      this._sabotageT -= dt;
      if (this._sabotageT <= 0) {
        for (const u of this.units) if (u.disabled) { u.disabled = false; }
      }
    }
    if (this.heroT > 0) {
      this.heroT -= dt;
      if (this.player) {
        this.player.hero = this.heroT > 0;
        if (this.heroT <= 0) this.player.hero = false;
      }
    }
  }

  _tickBleed(dt) {
    const aP = this.postsHeld('attacker');
    const dP = this.postsHeld('defender');
    if (aP < dP) this._bleedAcc.attacker += BLEED_PER_SEC * dt;
    if (dP < aP) this._bleedAcc.defender += BLEED_PER_SEC * dt;
    for (const side of ['attacker', 'defender']) {
      while (this._bleedAcc[side] >= 1) {
        this._bleedAcc[side] -= 1;
        this._loseTicket(side, 'bleed');
      }
    }
  }

  _loseTicket(side, reason) {
    if (this.tickets[side] <= 0) return;
    this.tickets[side] = Math.max(0, this.tickets[side] - 1);
    if (reason === 'death') {
      // mark army share consumption handled in result()
    }
  }

  _tickCapture(dt) {
    for (const p of this.posts) {
      let a = 0, d = 0;
      for (const u of this.units) {
        if (!this.alive(u) || u.status === 'crawl') continue;
        const dx = u.x - p.x, dy = u.y - p.y;
        if (dx * dx + dy * dy <= POST_RADIUS * POST_RADIUS) {
          if (u.side === 'attacker') a++;
          else d++;
        }
      }
      p.alliesA = a; p.alliesD = d;
      const onlyA = a > 0 && d === 0;
      const onlyD = d > 0 && a === 0;
      const contested = a > 0 && d > 0;
      p.contested = contested;
      if (contested) continue;
      if (onlyA) {
        if (p.owner === 'attacker') { p.progress = 1; continue; }
        const rate = CAPTURE_BASE * (1 + 0.35 * (a - 1));
        if (p.owner === 'defender' || p.owner == null) {
          // neutralize first if enemy
          if (p.owner === 'defender') {
            p.progress = Math.max(0, p.progress - rate * dt);
            if (p.progress <= 0) { p.owner = null; p.progress = 0; }
          } else {
            p.progress = Math.min(1, p.progress + rate * dt);
            if (p.progress >= 1) { p.owner = 'attacker'; p.progress = 1; this._pingCapture(p); }
          }
        }
      } else if (onlyD) {
        if (p.owner === 'defender') { p.progress = 1; continue; }
        const rate = CAPTURE_BASE * (1 + 0.35 * (d - 1));
        if (p.owner === 'attacker') {
          p.progress = Math.max(0, p.progress - rate * dt);
          if (p.progress <= 0) { p.owner = null; p.progress = 0; }
        } else {
          p.progress = Math.min(1, p.progress + rate * dt);
          if (p.progress >= 1) { p.owner = 'defender'; p.progress = 1; this._pingCapture(p); }
        }
      }
    }
  }

  _pingCapture(p) {
    this._pushFx({ kind: 'capture', x: p.x, y: p.y, t: 0, life: 0.9, owner: p.owner, label: p.label });
    if (p.owner === this.playerSide) {
      this.cpsTaken += 1;
      this._stats.captures += 1;
    }
  }

  /** Seconds on the ground before a taken-out body is removed (sink/fade handled in view). */
  static OUT_REMOVE_T = 3.0;

  _tickUnits(dt) {
    for (const u of this.units) {
      if (u.status === 'out') {
        u.outT = (u.outT || 0) + dt;
        continue;
      }
      if (u.status === 'crawl') {
        u.crawlT = (u.crawlT || 0) + dt;
        u.x += Math.cos(u.aim || 0) * 0.15 * dt;
        u.y += Math.sin(u.aim || 0) * 0.15 * dt;
        if (u.crawlT >= CRAWL_TO_OUT) this._takeOut(u, u._lastHitBy);
        continue;
      }
      if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - dt * 3);
      if (u.reloadT > 0) u.reloadT = Math.max(0, u.reloadT - dt);
      if (u.coolT > 0) u.coolT = Math.max(0, u.coolT - dt);
      if (u.shotT != null) u.shotT += dt;
      if (u.hitT != null) u.hitT += dt;
      // walk distance for gait (arenaPose)
      if (u._px != null) {
        const dx = u.x - u._px, dy = u.y - u._py;
        const d = Math.hypot(dx, dy);
        if (d > 1e-4) { u.walkDist = (u.walkDist || 0) + d; u.moving = d / Math.max(1e-3, dt); }
        else u.moving = 0;
      }
      u._px = u.x; u._py = u.y;

      // Engineer heal/repair pulse
      if (u.type === 'engineer') {
        u._healAcc = (u._healAcc || 0) + dt;
        if (u._healAcc > 0.6) {
          u._healAcc = 0;
          for (const o of this.units) {
            if (o.side !== u.side || !this.alive(o) || o === u) continue;
            const dx = o.x - u.x, dy = o.y - u.y;
            if (dx * dx + dy * dy < 3.5 * 3.5) {
              const add = o.type === 'tank' ? 8 : 4;
              o.hpNow = Math.min(o.stats.hp, o.hpNow + add);
              if (o.status === 'crawl' && o.hpNow > o.stats.hp * CRAWL_HP) o.status = 'ok';
            }
          }
        }
      }
    }
    // Despawn taken-out bodies after OUT_REMOVE_T (tanks keep ~5.5s for tankfx wreck)
    const cutFor = (u) => (u?.type === 'tank' ? 5.5 : GroundSim.OUT_REMOVE_T);
    if (this.units.some((u) => u.status === 'out' && (u.outT || 0) >= cutFor(u))) {
      this.units = this.units.filter((u) => !(u.status === 'out' && (u.outT || 0) >= cutFor(u)));
      if (this.player && this.player.status === 'out' && (this.player.outT || 0) >= cutFor(this.player)) {
        // keep player ref for respawn UI, but body is gone from field
      }
    }
  }

  _tickPlayer(dt) {
    const u = this.player;
    if (!u || !this.alive(u)) {
      if (u && u.status === 'out' && !this.needSpawn && this.phase === 'fight') {
        this.respawnT += dt;
        if (this.respawnT >= RESPAWN_SEC) this.requestSpawn();
      }
      return;
    }
    if (!u.playerControlled || this.mode !== 'lead') return;
    const inp = u.input || {};
    // Boarded tank: drive the vehicle, keep player glued to it
    const tank = u.inTank ? this.units.find((x) => x.id === u.inTank) : null;
    if (tank && this.alive(tank)) {
      const sp = (tank.stats.speed || 2.4) * 1.05;
      const mdt = dt;
      const len = Math.hypot(inp.mx || 0, inp.my || 0);
      if (len > 0.05) {
        const nx = (inp.mx || 0) / (len || 1);
        const ny = (inp.my || 0) / (len || 1);
        tank.x = this._clampX(tank.x + nx * sp * mdt);
        tank.y = this._clampY(tank.y + ny * sp * mdt);
        tank.aim = inp.aim != null ? inp.aim : Math.atan2(ny, nx);
        tank.moving = sp;
      } else if (inp.aim != null) {
        tank.aim = inp.aim;
      }
      u.x = tank.x; u.y = tank.y; u.aim = tank.aim;
      if (inp.fire) this._tryFire(tank);
      if (inp.interact) this._tryEnterTank(u);
      return;
    }
    if (u.inTank && (!tank || !this.alive(tank))) { u.inTank = null; }
    const sp = u.stats.speed * (u.status === 'crawl' ? 0.35 : 1) * (u.hero ? 1.55 : 1);
    const mdt = dt;
    const len = Math.hypot(inp.mx || 0, inp.my || 0);
    if (len > 0.05) {
      const nx = (inp.mx || 0) / (len || 1);
      const ny = (inp.my || 0) / (len || 1);
      u.x = this._clampX(u.x + nx * sp * mdt);
      u.y = this._clampY(u.y + ny * sp * mdt);
      u.aim = inp.aim != null ? inp.aim : Math.atan2(ny, nx);
    } else if (inp.aim != null) {
      u.aim = inp.aim;
    }
    if (inp.fire) this._tryFire(u);
    if (inp.interact) this._tryEnterTank(u);
  }

  _tickAI(dt) {
    for (const u of this.units) {
      if (!this.alive(u) || u.playerControlled || u.status === 'crawl') continue;
      if (u.type === 'tank' && u.driver == null) {
        // idle tank — light AI drive toward nearest contested/enemy post
      }
      this._aiBrain(u, dt);
    }
  }

  _aiBrain(u, dt) {
    // Pick target post: nearest not owned, or contested owned
    let goalPost = null;
    let best = 1e9;
    for (const p of this.posts) {
      const owned = p.owner === u.side;
      const enemy = p.owner && p.owner !== u.side;
      const contested = p.contested;
      const dx = p.x - u.x, dy = p.y - u.y;
      const d = dx * dx + dy * dy;
      let score = d;
      if (enemy) score *= 0.45;
      else if (!owned) score *= 0.35; // rush neutrals hard
      else if (contested) score *= 0.4;
      else score *= 2.2; // leave safe owned posts
      if (score < best) { best = score; goalPost = p; }
    }
    if (u.goal?.postId) {
      const gp = this.posts.find((p) => p.id === u.goal.postId);
      if (gp) goalPost = gp;
    } else if (goalPost) {
      // Tanks hold ~2.8m off the pole; infantry still go to the post
      if (u.type === 'tank') {
        const ox = u.side === 'attacker' ? 2.8 : -2.8;
        const oy = u.side === 'attacker' ? 1.0 : -1.0;
        u.goal = { x: goalPost.x + ox, y: goalPost.y + oy, postId: goalPost.id };
      } else {
        u.goal = { x: goalPost.x, y: goalPost.y, postId: goalPost.id };
      }
    }

    // Cover-ish: if near wall/sandbag and enemy in range, slow
    const enemy = this._nearestEnemy(u);
    if (enemy) {
      const d = Math.hypot(enemy.x - u.x, enemy.y - u.y);
      u.aim = Math.atan2(enemy.y - u.y, enemy.x - u.x);
      if (d <= u.stats.range + 0.5) {
        u.covered = this.isCovered(u, enemy);
        this._tryFire(u, enemy);
        // strafe slowly
        if (d < u.stats.range * 0.45) {
          u.x = this._clampX(u.x - Math.cos(u.aim) * u.stats.speed * 0.35 * dt);
          u.y = this._clampY(u.y - Math.sin(u.aim) * u.stats.speed * 0.35 * dt);
        }
        return;
      }
    }

    if (u.goal) {
      const dx = u.goal.x - u.x, dy = u.goal.y - u.y;
      const dist = Math.hypot(dx, dy);
      const holdR = u.type === 'tank' ? 1.1 : 0.55;
      if (dist > holdR) {
        const sp = u.stats.speed * (u.covered ? 0.7 : 1);
        u.x = this._clampX(u.x + (dx / dist) * sp * dt);
        u.y = this._clampY(u.y + (dy / dist) * sp * dt);
        u.aim = Math.atan2(dy, dx);
      } else {
        // hold near post offset
        u.goal = { ...u.goal };
      }
    }
  }

  _tryFire(u, forcedTarget) {
    if (u.disabled) return;
    if (u.coolT > 0 || u.reloadT > 0 || u.status === 'crawl') return;
    let tgt = forcedTarget || this._nearestEnemy(u);
    const inRange = !!(tgt && this.alive(tgt) && Math.hypot(tgt.x - u.x, tgt.y - u.y) <= (u.stats.range || 0) + 0.4);
    // Player-driven tank: LMB / Fire must always shoot along aim (visual + cool),
    // even with no enemy in range — otherwise PC mouse click is a silent no-op.
    const playerDriven = !!(u.playerControlled || (this.player && (u.id === this.player.inTank || u === this.player)));
    if (!inRange && !(playerDriven && u.type === 'tank')) return;
    if (!inRange) tgt = null;
    let rof = u.stats.rof || 0.5;
    if (u.hero) rof *= 0.55;
    u.coolT = rof;
    u.shotT = 0;
    if (tgt) u.aim = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    // else keep current aim (Lead mouse look / tank.aim from input)
    if (u.side === this.playerSide) this._stats.shotsFired += 1;
    const mx = u.x + Math.cos(u.aim) * 0.5;
    const my = u.y + Math.sin(u.aim) * 0.5;
    this._pushFx({ kind: 'muzzle', x: mx, y: my, t: 0, life: 0.18, ang: u.aim, tank: u.type === 'tank' });
    const x1 = tgt ? tgt.x : u.x + Math.cos(u.aim) * Math.min(14, (u.stats.range || 14) * 0.85);
    const y1 = tgt ? tgt.y : u.y + Math.sin(u.aim) * Math.min(14, (u.stats.range || 14) * 0.85);
    this._pushFx({
      kind: 'tracer', x0: mx, y0: my, x1, y1,
      t: 0, life: 0.12, color: u.side === 'attacker' ? this.attColor : this.defColor,
    });
    if (!tgt) return;
    const covered = this.isCovered(tgt, u);
    let dmg = u.stats.attack * (0.85 + this.rng() * 0.3);
    if (u.type === 'heavy' && tgt.type === 'tank') dmg *= 1.8;
    if (u.type === 'recon') dmg *= 1.15;
    dmg *= coverDamageMul(covered);
    dmg = Math.max(1, dmg - (tgt.stats.armor || 0));
    this._applyDamage(tgt, dmg, u, covered);
  }

  _applyDamage(tgt, dmg, by, covered) {
    if (tgt.shield) dmg *= 0.45;
    if (by && by.hero) dmg *= 1.75;
    if (by && by.side === this.playerSide) this._stats.damageDealt += dmg;
    if (tgt.side === this.playerSide) this._stats.damageTaken += dmg;
    tgt.hpNow = Math.max(0, tgt.hpNow - dmg);
    tgt.hitFlash = 1;
    tgt.hitT = 0;
    tgt._lastHitBy = by;
    const tankHit = tgt.type === 'tank';
    this._pushFx({ kind: 'spark', x: tgt.x, y: tgt.y, t: 0, life: 0.4, n: 6, tankHit });
    this._pushFx({ kind: 'dmg', x: tgt.x, y: tgt.y, t: 0, life: 1.0, dmg: Math.round(dmg), covered, tankHit });
    this._pushFx({ kind: 'hitflash', x: tgt.x, y: tgt.y, t: 0, life: 0.25, r: 0.4, tankHit });
    if (tgt.hpNow <= 0) {
      this._down(tgt, by);
    } else if (tgt.hpNow <= tgt.stats.hp * CRAWL_HP && tgt.status !== 'crawl' && tgt.type !== 'tank') {
      tgt.status = 'crawl';
      tgt.crawlT = 0;
    }
  }

  _down(u, by) {
    if (u.type === 'tank' || u.status === 'crawl') {
      this._takeOut(u, by);
      return;
    }
    u.status = 'crawl';
    u.crawlT = 0;
    u.hpNow = 0;
  }

  _takeOut(u, by) {
    if (u.status === 'out') return;
    u.hpNow = 0; u.status = 'out'; u.outT = 0; u.hitFlash = 1;
    u.selected = false; u.goal = null; u.playerControlled = false;
    this._pushFx({ kind: 'out', x: u.x, y: u.y, t: 0, life: 0.35, tank: u.type === 'tank' });
    this._pushFx({ kind: 'spark', x: u.x, y: u.y, t: 0, life: 0.35, n: 6 });
    this.shake = Math.max(this.shake, u.type === 'tank' ? 0.5 : 0.25);
    this._addScorch(u.x, u.y);
    this._loseTicket(u.side, 'death');
    if (u.side === this.playerSide) this._stats.deaths += 1;
    if (by) {
      this.kills[by.side] = (this.kills[by.side] || 0) + 1;
      const killerPlayer = by.isPlayer || by.side === this.playerSide;
      const victimEnemy = u.side !== this.playerSide;
      if (killerPlayer && victimEnemy) this.enemyKills++;
    }
    if (u.isPlayer) {
      this.respawnT = 0;
      // respawn timer starts in _tickPlayer
    }
  }

  _maintainAICount() {
    for (const side of ['attacker', 'defender']) {
      if (this.tickets[side] <= 0) continue;
      const posts = this.ownedPosts(side);
      if (!posts.length) continue;
      const live = this.units.filter((u) => u.side === side && this.alive(u) && u.type !== 'tank').length;
      if (live >= AI_CAP) continue;
      // respawn AI
      const post = posts[(Math.random() * posts.length) | 0];
      const classes = ALL_CLASSES;
      const type = classes[(this.rng() * classes.length) | 0];
      const ang = this.rng() * Math.PI * 2;
      const rad = 1.5 + this.rng() * 1.8;
      const u = this._makeUnit(side, type, post.x + Math.cos(ang) * rad, post.y + Math.sin(ang) * rad);
      const neutrals = this.posts.filter((p) => p.owner !== side);
      if (neutrals.length) {
        const target = neutrals[(this.rng() * neutrals.length) | 0];
        u.goal = { x: target.x, y: target.y, postId: target.id };
      }
      this.units.push(u);
    }
  }

  _seedAI(side) {
    const base = side === 'attacker' ? this.posts[0] : this.posts[this.posts.length - 1];
    base.owner = side;
    base.progress = 1;
    const n = Math.min(AI_CAP, 6);
    for (let i = 0; i < n; i++) {
      const type = ALL_CLASSES[i % ALL_CLASSES.length];
      const ang = (i / n) * Math.PI * 2 + this.rng() * 0.4;
      const rad = 1.6 + (i % 3) * 0.7 + this.rng() * 0.4;
      const u = this._makeUnit(
        side, type,
        base.x + Math.cos(ang) * rad,
        base.y + Math.sin(ang) * rad,
      );
      this.units.push(u);
    }
    const neutrals = this.posts.filter((p) => p.owner !== side);
    let ni = 0;
    for (const u of this.units) {
      if (u.side !== side || u.type === 'tank') continue;
      const target = neutrals[ni % Math.max(1, neutrals.length)];
      ni++;
      if (target) u.goal = { x: target.x, y: target.y, postId: target.id };
    }
  }

  _spawnTank(side, post) {
    if (!post) return;
    // Keep hull clear of CP flag pole (~2.5m avoid)
    const u = this._makeUnit(side, 'tank', post.x + (side === 'attacker' ? 3.6 : -3.6), post.y + (side === 'attacker' ? 1.2 : -1.2));
    u.driver = null;
    this.units.push(u);
  }

  /** Push tanks outside CP pole radius so the black pole never skewers the hull. */
  _keepTanksOffPosts() {
    const R = 2.5;
    for (const u of this.units) {
      if (u.type !== 'tank') continue; // include wrecks still in the list
      for (const p of this.posts) {
        const dx = u.x - p.x, dy = u.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 1e-4) {
          const k = (R - d) / d;
          u.x = this._clampX(u.x + dx * k);
          u.y = this._clampY(u.y + dy * k);
        } else if (d <= 1e-4) {
          u.x = this._clampX(u.x + R);
        }
      }
    }
  }

  _tryEnterTank(player) {
    if (!player) return false;
    // Exit if already boarded
    if (player.inTank) {
      const t = this.units.find((x) => x.id === player.inTank);
      if (t) {
        t.driver = null;
        player.inTank = null;
        player.x = t.x + 1.4; player.y = t.y + 0.2;
        return 'exit';
      }
      player.inTank = null;
      return false;
    }
    for (const t of this.units) {
      if (t.type !== 'tank' || t.side !== player.side || !this.alive(t)) continue;
      if (t.driver) continue;
      if (Math.hypot(t.x - player.x, t.y - player.y) < 2.6) {
        t.driver = player.id;
        player.inTank = t.id;
        player.x = t.x; player.y = t.y;
        return 'enter';
      }
    }
    return false;
  }

  _makeUnit(side, type, x, y) {
    const stats = { ...(DEFAULT_STATS[type] || DEFAULT_STATS.rifle) };
    return {
      id: `u${++this._uid}`,
      side, type, name: typeLabel(type), icon: type,
      stats, hpNow: stats.hp,
      x: this._clampX(x), y: this._clampY(y),
      aim: side === 'attacker' ? 0 : Math.PI,
      status: 'ok', coolT: this.rng() * 0.5, reloadT: 0,
      goal: null, targetId: null, selected: false,
      covered: false, hitFlash: 0, landed: true,
      playerControlled: false, isPlayer: false, input: null,
      radius: type === 'tank' ? 0.9 : 0.35,
      ticketShare: TICKET_VALUE[type] || 20,
    };
  }


  _separateUnits(dt) {
    const minD = 1.35;
    const list = this.units.filter((u) => this.alive(u) && u.status !== 'crawl' && u.type !== 'tank');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy) || 0.001;
        if (d >= minD) continue;
        const push = ((minD - d) / minD) * 2.8 * dt;
        dx /= d; dy /= d;
        // player resists less push from AI
        const aw = a.playerControlled ? 0.25 : 1;
        const bw = b.playerControlled ? 0.25 : 1;
        a.x = this._clampX(a.x - dx * push * aw);
        a.y = this._clampY(a.y - dy * push * aw);
        b.x = this._clampX(b.x + dx * push * bw);
        b.y = this._clampY(b.y + dy * push * bw);
      }
    }
  }

  _nearestEnemy(u) {
    let best = null, bd = 1e9;
    for (const o of this.units) {
      if (o.side === u.side || !this.alive(o)) continue;
      const d = Math.hypot(o.x - u.x, o.y - u.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  isCovered(tgt, from) {
    if (!tgt || !from) return false;
    for (const p of this.props) {
      if (!p.cover) continue;
      // crude segment vs prop circle
      const mx = (tgt.x + from.x) / 2, my = (tgt.y + from.y) / 2;
      const dx = mx - p.x, dy = my - p.y;
      if (dx * dx + dy * dy < (p.r || 0.5) * (p.r || 0.5) * 1.2) return true;
    }
    return !!tgt.covered;
  }

  _unitAt(x, y) {
    let best = null, bd = 0.9;
    for (const u of this.units) {
      if (!this.alive(u)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      const r = (u.radius || 0.4) + 0.35;
      if (d < r && d < bd) { bd = d; best = u; }
    }
    return best;
  }

  _postAt(x, y) {
    for (const p of this.posts) {
      if (Math.hypot(p.x - x, p.y - y) <= POST_RADIUS) return p;
    }
    return null;
  }

  _clampX(x) { return Math.max(0.5, Math.min(this.W - 0.5, x)); }
  _clampY(y) { return Math.max(0.5, Math.min(this.H - 0.5, y)); }

  _pushFx(f) {
    if (this.fx.length >= FX_CAP) this.fx.shift();
    this.fx.push(f);
  }

  _addScorch(x, y) {
    if (this.scorch.length >= SCORCH_CAP) this.scorch.shift();
    this.scorch.push({ x, y, r: 0.7 + this.rng() * 0.4, a: 0.72 });
  }

  _genPosts() {
    const labels = ['A', 'B', 'C', 'D', 'E'];
    const n = 5;
    const posts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = this.portrait
        ? this.W * 0.5 + (i - 2) * (this.W * 0.16)
        : this.W * (0.12 + t * 0.76);
      const y = this.portrait
        ? this.H * (0.12 + t * 0.76)
        : this.H * (0.28 + Math.sin(t * Math.PI) * 0.35);
      posts.push({
        id: `post-${labels[i]}`,
        label: labels[i],
        x, y, r: POST_RADIUS,
        owner: null, progress: 0, contested: false,
        alliesA: 0, alliesD: 0,
      });
    }
    return posts;
  }

  _genProps() {
    const props = [];
    const margin = 2;
    for (let i = 0; i < 14; i++) {
      props.push({
        kind: 'boulder', cover: true,
        x: margin + this.rng() * (this.W - margin * 2),
        y: margin + this.rng() * (this.H - margin * 2),
        r: 0.55 + this.rng() * 0.45, w: 1, h: 1,
      });
    }
    for (let i = 0; i < 8; i++) {
      props.push({
        kind: 'wall', cover: true,
        x: margin + this.rng() * (this.W - margin * 2),
        y: margin + this.rng() * (this.H - margin * 2),
        r: 0.7, w: 1.6 + this.rng(), h: 0.35,
        rot: this.rng() * Math.PI,
      });
    }
    for (let i = 0; i < 6; i++) {
      props.push({
        kind: 'sandbag', cover: true,
        x: margin + this.rng() * (this.W - margin * 2),
        y: margin + this.rng() * (this.H - margin * 2),
        r: 0.55, w: 1.1, h: 0.4, rot: this.rng() * Math.PI,
      });
    }
    return props;
  }

  _tickHoldWin(dt) {
    if (this.over || this.phase !== 'fight') { this.holdWin = null; return; }
    const n = this.posts.length;
    const aPosts = this.postsHeld('attacker');
    const dPosts = this.postsHeld('defender');
    let side = null;
    if (n > 0 && aPosts === n) side = 'attacker';
    else if (n > 0 && dPosts === n) side = 'defender';
    if (!side) { this.holdWin = null; return; }
    if (!this.holdWin || this.holdWin.side !== side) {
      this.holdWin = { side, t: 20 };
      return;
    }
    this.holdWin.t -= dt;
    if (this.holdWin.t <= 0) {
      this.over = side;
      this.holdWin = null;
      this._beginOutro();
    }
  }

  _checkVictory() {
    if (this.over) return;
    if (this.tickets.attacker <= 0) { this.over = 'defender'; this._beginOutro(); return; }
    if (this.tickets.defender <= 0) { this.over = 'attacker'; this._beginOutro(); return; }
    const aPosts = this.postsHeld('attacker');
    const dPosts = this.postsHeld('defender');
    const aLive = this.units.some((u) => u.side === 'attacker' && this.alive(u));
    const dLive = this.units.some((u) => u.side === 'defender' && this.alive(u));
    if (aPosts === 0 && !aLive) { this.over = 'defender'; this._beginOutro(); return; }
    if (dPosts === 0 && !dLive) { this.over = 'attacker'; this._beginOutro(); return; }
  }

  _beginOutro() {
    if (this.phase === 'outro' || this.phase === 'done') return;
    this.phase = 'outro';
    this.outroT = 0;
    this.bannerSkip = false;
    this._pendingResult = this.result();
  }

  playerWon() {
    return this.over === this.playerSide;
  }

  /**
   * Ticket → survivors/lost rule (see README):
   * fraction = ticketsLeft/ticketsStart.
   * Army units ordered by id; consume ticket shares from the front until
   * consumed >= (start - left). Those units are `lost` (hpNow 0).
   * Remaining survivors get hpNow scaled by fraction (min 1 if fraction>0).
   */
  result() {
    if (this._pendingResult && this.phase === 'done') return this._pendingResult;
    const winner = this.over || 'defender';
    const playerWon = winner === this.playerSide;
    const ticketsLeft = {
      attacker: Math.max(0, this.tickets.attacker | 0),
      defender: Math.max(0, this.tickets.defender | 0),
    };

    const sideResult = (side, army, pass) => {
      const start = this.ticketsStart[side] || 1;
      const left = ticketsLeft[side];
      const frac = Math.max(0, Math.min(1, left / start));
      const consumed = Math.max(0, start - left);
      const ordered = [...army].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      let used = 0;
      const lost = [];
      const survivors = [];
      for (const u of ordered) {
        const share = u.ticketShare || TICKET_VALUE[u.type] || 20;
        if (used + share * 0.5 <= consumed) {
          used += share;
          lost.push({
            id: u.id, type: u.type, name: u.name, icon: u.icon,
            stats: { ...u.stats }, hpNow: 0,
          });
        } else {
          const hp = Math.max(1, Math.round((u.hpNow != null ? u.hpNow : u.stats.hp) * frac));
          survivors.push({
            id: u.id, type: u.type, name: u.name, icon: u.icon,
            stats: { ...u.stats }, hpNow: frac <= 0 ? 0 : hp,
          });
          if (frac <= 0) {
            lost.push(survivors.pop());
          }
        }
      }
      // passthrough non-ground always survive
      for (const u of pass) {
        survivors.push({
          id: u.id, type: u.type, name: u.name, icon: u.icon,
          stats: u.stats ? { ...u.stats } : u.stats,
          hpNow: u.hpNow,
        });
      }
      return { survivors, lost };
    };

    const a = sideResult('attacker', this.armyAtt, this.passAtt);
    const d = sideResult('defender', this.armyDef, this.passDef);

    let kills = this.enemyKills;
    if (playerWon && kills === 0) {
      const enemySide = this.playerSide === 'attacker' ? 'defender' : 'attacker';
      kills = Math.max(0, (this.ticketsStart[enemySide] - ticketsLeft[enemySide]) | 0);
    }

    const out = {
      winner,
      survivors: { attacker: a.survivors, defender: d.survivors },
      lost: { attacker: a.lost, defender: d.lost },
      pointsEarned: playerWon ? (10 + 5 * Math.min(kills, 20)) : 0,
      ticketsLeft: { attacker: ticketsLeft.attacker, defender: ticketsLeft.defender },
      kills: { attacker: this.kills.attacker | 0, defender: this.kills.defender | 0 },
      cpsTaken: this.cpsTaken | 0,
      stats: {
        damageDealt: Math.round(this._stats.damageDealt),
        damageTaken: Math.round(this._stats.damageTaken),
        deaths: this._stats.deaths | 0,
        captures: this._stats.captures | 0,
        shotsFired: this._stats.shotsFired | 0,
        timeInLead: Math.round(this._stats.timeInLead),
        kills: (this.kills[this.playerSide] | 0),
      },
    };
    if (this.retreated) out.retreated = true;
    return out;
  }
}

function stubArmy() {
  return [
    { type: 'rifle', stats: DEFAULT_STATS.rifle, hpNow: 100 },
    { type: 'rifle', stats: DEFAULT_STATS.rifle, hpNow: 100 },
    { type: 'heavy', stats: DEFAULT_STATS.heavy, hpNow: 150 },
    { type: 'recon', stats: DEFAULT_STATS.recon, hpNow: 80 },
  ].map((u, i) => normalizeUnit({ ...u, id: `stub-${i}` }, i, 's'));
}

export const STALL_PUSH_SEC = 6;
