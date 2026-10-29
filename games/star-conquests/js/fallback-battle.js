import { unitIconHtml } from './shop.js';
// Fallback auto-resolve battle: animated icon-vs-icon, honors CONTRACT.md.
// Used when ground/battle.js or space/battle.js is missing or fails to load.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneUnit(u) {
  return { id: u.id, type: u.type, name: u.name, icon: u.icon,
    stats: { ...u.stats }, hpNow: u.hpNow ?? u.stats.hp };
}

/**
 * @param {object} opts - CONTRACT startBattle opts
 * @param {function} onDone - CONTRACT onDone
 */
export function startBattle(opts, onDone) {
  const mount = opts.mount;
  mount.innerHTML = '';
  const type = opts.type === 'space' ? 'space' : 'ground';
  const rng = mulberry32(opts.seed | 0);
  const playerSide = opts.attacker.side === 'player' ? 'attacker' : 'defender';

  let attackers = (opts.attacker.units || []).map(cloneUnit).filter((u) => u.hpNow > 0);
  let defenders = (opts.defender.units || []).map(cloneUnit).filter((u) => u.hpNow > 0);

  // Ignore wrong-role types (shell filters, but we still guard)
  const ground = new Set(['rifle', 'heavy', 'recon', 'tank']);
  const space = new Set(['spaceship', 'battleship']);
  const ok = type === 'space' ? space : ground;
  attackers = attackers.filter((u) => ok.has(u.type));
  defenders = defenders.filter((u) => ok.has(u.type));

  let done = false;
  const FB_SPEEDS = [1, 2, 3];
  let speedIdx = 1; // start at 2×
  let speed = FB_SPEEDS[speedIdx];
  let raf = 0;
  let last = performance.now();
  let acc = 0;

  const root = document.createElement('div');
  root.className = 'fb-root';
  root.innerHTML = `
    <div class="fb-top">
      <div class="fb-title"><span>${type === 'space' ? '🚀' : '⚔️'}</span><b>${type === 'space' ? 'Space' : 'Ground'}</b>
        <small>${opts.planet?.icon || ''} ${opts.planet?.name || ''}</small></div>
      <div class="fb-actions">
        <button type="button" class="fb-btn" data-act="speed" aria-label="Speed" title="Speed">⏩ <small>×2</small></button>
        <button type="button" class="fb-btn" data-act="retreat" aria-label="Retreat" title="Retreat">🏳️ <small>Retreat</small></button>
      </div>
    </div>
    <div class="fb-arena" data-biome="${opts.planet?.biome || 'rock'}">
      <div class="fb-side fb-atk" style="--side:${opts.attacker.color || '#3aa0ff'}"></div>
      <div class="fb-mid"><div class="fb-fx"></div></div>
      <div class="fb-side fb-def" style="--side:${opts.defender.color || '#e04848'}"></div>
    </div>
    <div class="fb-hud">
      <div class="fb-chip atk"><span>${opts.attacker.side === 'player' ? '👤' : '💀'}</span><b class="fb-acount">0</b></div>
      <div class="fb-chip def"><span>${opts.defender.side === 'player' ? '👤' : '💀'}</span><b class="fb-dcount">0</b></div>
    </div>`;
  mount.appendChild(root);

  const atkEl = root.querySelector('.fb-atk');
  const defEl = root.querySelector('.fb-def');
  const fxEl = root.querySelector('.fb-fx');
  const speedBtn = root.querySelector('[data-act="speed"]');
  const retreatBtn = root.querySelector('[data-act="retreat"]');

  // Combatant runtime state
  function wrap(list, side) {
    return list.map((u, i) => ({
      u, side,
      downed: false, // crawling / blinking
      dead: false,
      cd: rng() * 0.6,
      el: null,
      idx: i,
    }));
  }
  let A = wrap(attackers, 'attacker');
  let D = wrap(defenders, 'defender');

  function paintSide(box, arr) {
    box.innerHTML = '';
    arr.forEach((c) => {
      const d = document.createElement('div');
      d.className = 'fb-unit';
      d.dataset.id = c.u.id;
      d.innerHTML = `
        <div class="fb-icon">${unitIconHtml(c.u)}</div>
        <div class="fb-hp"><i style="width:${Math.max(0, (c.u.hpNow / c.u.stats.hp) * 100)}%"></i></div>
        <div class="fb-tag"><small>❤️ HP</small> <b>${Math.ceil(c.u.hpNow)}</b></div>
        <div class="fb-cross" hidden>✚</div>
        <div class="fb-wreck" hidden>💥</div>`;
      box.appendChild(d);
      c.el = d;
    });
  }
  paintSide(atkEl, A);
  paintSide(defEl, D);

  function refreshHud() {
    root.querySelector('.fb-acount').textContent = A.filter((c) => !c.dead).length;
    root.querySelector('.fb-dcount').textContent = D.filter((c) => !c.dead).length;
  }
  refreshHud();

  function updateEl(c) {
    if (!c.el) return;
    const pct = Math.max(0, (c.u.hpNow / c.u.stats.hp) * 100);
    c.el.querySelector('.fb-hp i').style.width = pct + '%';
    c.el.querySelector('.fb-tag b').textContent = Math.max(0, Math.ceil(c.u.hpNow));
    c.el.classList.toggle('downed', c.downed && !c.dead);
    c.el.classList.toggle('dead', c.dead);
    const cross = c.el.querySelector('.fb-cross');
    const wreck = c.el.querySelector('.fb-wreck');
    cross.hidden = !(c.downed && !c.dead);
    wreck.hidden = !c.dead;
  }

  function flash(from, to, dmg) {
    const bolt = document.createElement('div');
    bolt.className = 'fb-bolt';
    bolt.textContent = type === 'space' ? '✨' : '•';
    fxEl.appendChild(bolt);
    const a = from.el?.getBoundingClientRect();
    const b = to.el?.getBoundingClientRect();
    const arena = root.querySelector('.fb-arena').getBoundingClientRect();
    if (a && b) {
      const x0 = a.left + a.width / 2 - arena.left;
      const y0 = a.top + a.height / 2 - arena.top;
      const x1 = b.left + b.width / 2 - arena.left;
      const y1 = b.top + b.height / 2 - arena.top;
      bolt.style.left = x0 + 'px';
      bolt.style.top = y0 + 'px';
      bolt.animate([
        { transform: 'translate(0,0)', opacity: 1 },
        { transform: `translate(${x1 - x0}px,${y1 - y0}px)`, opacity: 0.2 },
      ], { duration: 280 / speed, easing: 'ease-out' });
    }
    setTimeout(() => bolt.remove(), 320 / speed);
    if (to.el) {
      const pop = document.createElement('span');
      pop.className = 'fb-dmg';
      pop.textContent = `-${Math.round(dmg)}`;
      to.el.appendChild(pop);
      setTimeout(() => pop.remove(), 500 / speed);
    }
  }

  function power(c) {
    const s = c.u.stats;
    return (s.attack || 10) * (0.85 + rng() * 0.3) / Math.max(1, 1 + (0));
  }

  function living(arr) { return arr.filter((c) => !c.dead); }

  function finish(winner, retreated = false) {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    const survivors = {
      attacker: A.filter((c) => !c.dead).map((c) => ({ ...c.u, hpNow: Math.max(1, Math.ceil(c.u.hpNow)) })),
      defender: D.filter((c) => !c.dead).map((c) => ({ ...c.u, hpNow: Math.max(1, Math.ceil(c.u.hpNow)) })),
    };
    // points for PLAYER side only
    let destroyed = 0;
    if (playerSide === 'attacker') {
      destroyed = (opts.defender.units || []).length - survivors.defender.length;
      if (winner !== 'attacker') destroyed = 0;
    } else {
      destroyed = (opts.attacker.units || []).length - survivors.attacker.length;
      if (winner !== 'defender') destroyed = 0;
    }
    const playerWon = (playerSide === 'attacker' && winner === 'attacker')
      || (playerSide === 'defender' && winner === 'defender');
    const pointsEarned = playerWon ? 10 + 5 * Math.max(0, destroyed) : 0;

    speedBtn.onclick = null;
    retreatBtn.onclick = null;
    mount.innerHTML = '';
    onDone({ winner, survivors, pointsEarned, retreated: !!retreated });
  }

  // Instant win if one side empty
  if (!A.length && !D.length) { finish('defender'); return; }
  if (!A.length) { finish('defender'); return; }
  if (!D.length) { finish('attacker'); return; }

  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % FB_SPEEDS.length;
    speed = FB_SPEEDS[speedIdx];
    speedBtn.innerHTML = `⏩ <small>×${speed}</small>`;
  });
  retreatBtn.addEventListener('click', () => {
    // retreat = defender wins, attacker survivors kept
    finish('defender', true);
  });

  function tick(dt) {
    // Downed units crawl / blink; chance to get taken out or recover briefly then die from next hits
    for (const c of [...A, ...D]) {
      if (c.dead) continue;
      if (c.downed) {
        c.downTimer = (c.downTimer || 0) + dt;
        // After crawling ~1.2s, taken out
        if (c.downTimer > 1.2) {
          c.dead = true;
          c.downed = false;
          updateEl(c);
          refreshHud();
        }
        continue;
      }
      c.cd -= dt;
      if (c.cd > 0) continue;
      const foes = living(c.side === 'attacker' ? D : A).filter((f) => !f.downed);
      const pool = foes.length ? foes : living(c.side === 'attacker' ? D : A);
      if (!pool.length) continue;
      // Prefer closest "range" — pick by index proximity + speed bias
      pool.sort((a, b) => (b.u.stats.speed || 1) - (a.u.stats.speed || 1));
      const target = pool[(rng() * Math.min(3, pool.length)) | 0];
      const atk = power(c);
      const armor = target.u.stats.armor || 0;
      const dmg = Math.max(1, atk - armor * 0.6);
      flash(c, target, dmg);
      target.u.hpNow -= dmg;
      // Range affects cooldown
      const rof = 0.55 + (6 - Math.min(6, c.u.stats.range || 3)) * 0.12;
      c.cd = rof * (0.7 + rng() * 0.5);

      if (target.u.hpNow <= 0) {
        target.u.hpNow = 0;
        // Enter downed/crawling first (distinct from taken out)
        target.downed = true;
        target.downTimer = 0;
      }
      updateEl(c);
      updateEl(target);
      refreshHud();
    }

    if (!living(A).length) finish('defender');
    else if (!living(D).length) finish('attacker');
  }

  function loop(now) {
    if (done) return;
    const dt = Math.min(0.05, (now - last) / 1000) * speed;
    last = now;
    acc += dt;
    // step sim at ~20hz logical
    while (acc >= 0.05) { tick(0.05); acc -= 0.05; if (done) return; }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
}
