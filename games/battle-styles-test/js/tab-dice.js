// Tab 1: Axis & Allies style. Every unit rolls one die against its number; you pick which of yours die.
import { icon, unitIcon } from './icons.js';
import { ICO, dieSvg } from './common.js';

// attack / defence numbers (hit on a roll at or under the number)
const ATT = { inf: 1, armor: 3, art: 2, plane: 3, ship: 4 };
const DEF = { inf: 2, aa: 0, fort: 3 };
const AA_HIT = 2; // the AA gun shoots at each plane before round 1 (hits on 1-2)

export default {
  id: 'dice', short: 'DICE', name: 'Axis and Allies dice', icon: 'dice',
  decides: 'Dice vs numbers. Art makes inf 2. AA shoots planes first. You pick who dies.',
  mount({ stage, ctrl, end, sfx, setRule }) {
    let uid = 0;
    const mk = (side, t) => ({ id: uid++, side, t, hp: t === 'fort' ? 2 : 1, alive: true, die: null, hit: false });
    const blue = ['inf', 'inf', 'armor', 'art', 'ship', 'plane'].map((t) => mk('blue', t));
    const red = ['inf', 'inf', 'inf', 'aa', 'fort'].map((t) => mk('red', t));
    let round = 0, phase = 'ready', toPick = 0, msg = '', busy = false, last = null;
    stage.innerHTML = `<div class="aa-wrap"><div class="aa-row" id="dr"></div><div class="aa-mid" id="dm"></div><div class="aa-row" id="db"></div></div>`;
    ctrl.innerHTML = `<button class="btn primary big" id="d-roll" aria-label="Roll">${icon('dice', { size: 30 })}<span>ROLL</span></button><button class="btn big red" id="d-ret" aria-label="Retreat">${icon('retreat', { size: 28 })}</button>`;
    const $ = (id) => stage.querySelector(`#${id}`) || ctrl.querySelector(`#${id}`);
    const infBoost = () => { const arts = blue.filter((u) => u.alive && u.t === 'art').length; const infs = blue.filter((u) => u.alive && u.t === 'inf'); return new Set(infs.slice(0, arts).map((u) => u.id)); };
    const att = (u, boost) => (u.t === 'inf' && boost.has(u.id) ? 2 : ATT[u.t]);
    function card(u, boost) {
      const n = u.side === 'blue' ? (u.t === 'ship' && round >= 1 ? '-' : att(u, boost)) : u.t === 'aa' ? AA_HIT : DEF[u.t];
      const cls = ['uc', u.side, u.alive ? '' : 'dead', phase === 'pick' && u.side === 'blue' && u.alive && u.t !== 'ship' ? 'pick' : '', u.side === 'blue' && boost.has(u.id) ? 'boost' : ''].join(' ');
      return `<button class="${cls}" data-u="${u.id}" aria-label="${u.t}">${u.t === 'fort' ? `<span class="hp">${u.hp}</span>` : ''}<span class="num">${n}</span>${unitIcon(ICO[u.t], 34)}${u.die ? dieSvg(u.die, 30, u.hit) : '<span style="height:30px"></span>'}</button>`;
    }
    function render(rolling = false) {
      const boost = infBoost();
      $('dr').innerHTML = red.map((u) => card(u, boost)).join('');
      $('db').innerHTML = blue.map((u) => card(u, boost)).join('');
      if (rolling) stage.querySelectorAll('.uc:not(.dead)').forEach((e) => e.classList.add('rolling'));
      $('dm').innerHTML = msg;
      $('d-roll').disabled = busy || phase !== 'ready';
      $('d-ret').disabled = busy || phase !== 'ready' || round === 0;
      window.__BS__.state = { tab: 'dice', round, phase, toPick, blue: blue.filter((u) => u.alive).map((u) => u.t), red: red.filter((u) => u.alive).map((u) => `${u.t}${u.t === 'fort' ? u.hp : ''}`) };
    }
    const d6 = () => 1 + Math.floor(Math.random() * 6);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    async function roll() {
      if (busy || phase !== 'ready') return;
      busy = true; sfx('roll');
      [...blue, ...red].forEach((u) => { u.die = null; u.hit = false; });
      // AA fire before the first round: one die per plane
      if (round === 0) {
        const aaU = red.find((u) => u.t === 'aa' && u.alive), pl = blue.find((u) => u.t === 'plane' && u.alive);
        if (aaU && pl) {
          aaU.die = d6(); aaU.hit = aaU.die <= AA_HIT;
          msg = `<span class="big">${unitIcon('aa', 30)}${icon('crosshair', { size: 26 })}${unitIcon('bomber', 30)}</span>`;
          render(true); await wait(700);
          if (aaU.hit) { pl.alive = false; sfx('hit'); msg = `<span class="big">${unitIcon('bomber', 30)}${icon('x', { size: 30 })}</span>`; } else msg = `<span class="big">${unitIcon('bomber', 30)}${icon('check', { size: 30 })}</span>`;
          render(); await wait(800); aaU.die = null; aaU.hit = false;
        }
      }
      round++;
      const boost = infBoost();
      let bh = 0, rh = 0;
      for (const u of blue) if (u.alive && (u.t !== 'ship' || round === 1)) { u.die = d6(); u.hit = u.die <= att(u, boost); if (u.hit) bh++; }
      for (const u of red) if (u.alive && DEF[u.t]) { u.die = d6(); u.hit = u.die <= DEF[u.t]; if (u.hit) rh++; }
      msg = `<span class="big">R${round}</span>`; render(true); await wait(750); sfx(bh || rh ? 'hit' : 'tap');
      // Red takes its hits: infantry first, then the AA gun, the fort last (2 hits)
      let left = bh;
      for (const t of ['inf', 'aa', 'fort']) for (const u of red) { while (left > 0 && u.alive && u.t === t) { u.hp--; left--; if (u.hp <= 0) u.alive = false; } }
      const canDie = blue.filter((u) => u.alive && u.t !== 'ship');
      toPick = Math.min(rh, canDie.length);
      last = { bh, rh };
      msg = `<span class="hits blue">${icon('burst', { size: 24 })}${bh}</span><span class="hits red">${icon('burst', { size: 24 })}${rh}</span>`;
      busy = false;
      if (toPick > 0) { phase = 'pick'; msg += `<span class="big">${icon('hand', { size: 30 })}${toPick}</span>`; setRule('Tap which of yours die.'); }
      else { phase = 'ready'; }
      render(); check();
    }
    function pick(id) {
      if (phase !== 'pick') return;
      const u = blue.find((x) => x.id === id && x.alive && x.t !== 'ship'); if (!u) return;
      u.alive = false; toPick--; sfx('hit');
      if (toPick <= 0) { phase = 'ready'; setRule(this_decides); msg = `<span class="hits blue">${icon('burst', { size: 24 })}${last.bh}</span><span class="hits red">${icon('burst', { size: 24 })}${last.rh}</span>`; }
      else msg = msg.replace(/<span class="big">.*<\/span>$/, `<span class="big">${icon('hand', { size: 30 })}${toPick}</span>`);
      render(); check();
    }
    const this_decides = this.decides;
    function check() {
      if (phase === 'pick') return;
      if (!red.some((u) => u.alive)) { phase = 'over'; render(); end(true, `${unitIcon('fort', 22)}${icon('flag', { size: 22 })}`); }
      else if (!blue.some((u) => u.alive && ['inf', 'armor', 'art'].includes(u.t))) { phase = 'over'; render(); end(false, `${unitIcon('inf', 22)}${icon('x', { size: 22 })}`); }
    }
    $('d-roll').addEventListener('click', roll);
    $('d-ret').addEventListener('click', () => { if (phase !== 'ready' || busy) return; phase = 'over'; render(); end(false, `${icon('retreat', { size: 22 })}`); });
    stage.addEventListener('click', (e) => { const b = e.target.closest('[data-u]'); if (b) pick(+b.dataset.u); });
    msg = `<span class="big">${icon('dice', { size: 40 })}</span>`;
    render();
    return () => {};
  },
};
