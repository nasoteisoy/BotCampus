import { FACTIONS, TURN_ORDER, UNITS, ZONES, DEEP_SPACE } from './data.js';
import { PHASES as GP } from './game.js';

const PHASE_LABELS = {
  purchase: 'Purchase',
  combatMove: 'Combat Move',
  combat: 'Combat',
  nonCombatMove: 'Non-Combat',
  mobilize: 'Mobilize',
  collect: 'Collect Income',
};

export class UI {
  constructor(game, map) {
    this.game = game;
    this.map = map;
    this.moveFrom = null;
    this.moveTake = {};
    this.bind();
    game.onChange(() => this.render());
    map.onSelect = (sel) => this.onMapSelect(sel);
    this.render();
  }

  $(id) { return document.getElementById(id); }

  bind() {
    this.$('btn-end-phase').onclick = () => {
      const ok = this.game.nextPhase();
      if (!ok) this.toast('Finish pending combats first');
      this.map.refreshUnits();
      this.render();
    };
    this.$('btn-resolve-combat').onclick = () => this.resolveNextCombat();
    this.$('btn-combat-round').onclick = () => {
      this.game.combatRound();
      this.map.refreshUnits();
      this.render();
    };
    this.$('btn-retreat').onclick = () => {
      this.game.retreat();
      this.map.refreshUnits();
      this.render();
    };
    this.$('btn-submerge').onclick = () => {
      this.game.submergeSubs('attack');
      this.map.refreshUnits();
      this.render();
    };
    this.$('btn-move').onclick = () => this.doMove();
    this.$('btn-focus').onclick = () => {
      if (this.game.selectedLoc) this.map.focusOn(this.game.selectedLoc);
    };
    this.$('btn-sbr').onclick = () => this.doSBR();
  }

  toast(msg) {
    const t = this.$('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { t.style.display = 'none'; }, 2800);
  }

  onMapSelect(sel) {
    if (!sel) return;
    const loc = sel.id;
    this.game.selectedLoc = loc;

    const phase = this.game.currentPhase;
    if ((phase === 'combatMove' || phase === 'nonCombatMove') && this.moveFrom && this.moveFrom !== loc) {
      // destination chosen
      this.$('move-to').value = loc;
      this.renderSelection();
      return;
    }

    if ((phase === 'combatMove' || phase === 'nonCombatMove') && sel.type === 'units' && sel.fac === this.game.currentFaction) {
      this.moveFrom = loc;
      this.$('move-from').value = loc;
      this._fillMoveUnits(loc);
    }

    if (phase === 'mobilize' && ZONES[loc] && this.game.zones[loc].owner === this.game.currentFaction) {
      this._showMobilize(loc);
    }

    this.renderSelection();
  }

  _fillMoveUnits(loc) {
    const stack = this.game.getStack(loc, this.game.currentFaction);
    const box = this.$('move-units');
    box.innerHTML = '';
    this.moveTake = {};
    for (const [t, n] of Object.entries(stack)) {
      if (n <= 0) continue;
      const row = document.createElement('div');
      row.className = 'unit-line';
      row.innerHTML = `<label>${UNITS[t].name} (${n}) <input type="number" min="0" max="${n}" value="0" data-type="${t}"></label>`;
      box.appendChild(row);
      row.querySelector('input').onchange = (e) => {
        this.moveTake[t] = Math.max(0, Math.min(n, parseInt(e.target.value, 10) || 0));
      };
    }
  }

  doMove() {
    const from = this.$('move-from').value.trim();
    const to = this.$('move-to').value.trim();
    if (!from || !to) { this.toast('Pick from and to'); return; }
    const take = {};
    for (const inp of this.$('move-units').querySelectorAll('input')) {
      const n = parseInt(inp.value, 10) || 0;
      if (n > 0) take[inp.dataset.type] = n;
    }
    if (!Object.keys(take).length) { this.toast('Select unit counts'); return; }
    const combat = this.game.currentPhase === 'combatMove';
    const res = this.game.tryMove(from, to, take, combat);
    if (!res.ok) this.toast(res.err);
    else {
      this.moveFrom = null;
      this.map.refreshUnits();
      this.map.highlight({ type: ZONES[to] ? 'zone' : 'deep', id: to });
    }
    this.render();
  }

  doSBR() {
    const from = this.$('move-from').value.trim();
    const to = this.$('move-to').value.trim();
    const n = parseInt(this.$('sbr-count').value, 10) || 1;
    const res = this.game.strategicBomb(from, to, n);
    if (!res.ok) this.toast(res.err);
    else this.map.refreshUnits();
    this.render();
  }

  _showMobilize(loc) {
    const box = this.$('mobilize-box');
    box.innerHTML = `<div class="hint">Placing at <b>${this.game.zones[loc].name}</b></div>`;
    for (const p of this.game.purchased) {
      const row = document.createElement('div');
      row.className = 'unit-line';
      row.innerHTML = `<label>${UNITS[p.type].name} (×${p.count})
        <input type="number" min="0" max="${p.count}" value="0" data-type="${p.type}"></label>
        <button data-place="${p.type}">Place</button>`;
      box.appendChild(row);
      row.querySelector('button').onclick = () => {
        const n = parseInt(row.querySelector('input').value, 10) || 0;
        if (n <= 0) return;
        const res = this.game.mobilize(loc, { [p.type]: n });
        if (!res.ok) this.toast(res.err);
        this.map.refreshUnits();
        this.render();
        this._showMobilize(loc);
      };
    }
    if (!this.game.purchased.length) box.innerHTML += '<div class="hint">No purchased units left.</div>';
  }

  resolveNextCombat() {
    if (this.game.combatState) {
      this.render();
      return;
    }
    const next = this.game.pendingCombats[0];
    if (!next) { this.toast('No pending combats'); return; }
    this.game.startCombat(next.loc);
    this.map.focusOn(next.loc);
    this.map.refreshUnits();
    this.render();
  }

  render() {
    const g = this.game;
    this.$('round-label').textContent = `Round ${g.round}`;
    this.$('turn-label').textContent = g.faction.name;
    this.$('turn-dot').style.background = g.faction.color;
    this.$('ipc-label').textContent = `${g.ipc[g.currentFaction]} IPC`;

    // Phases
    const pp = this.$('phase-pills');
    pp.innerHTML = '';
    for (const p of GP) {
      const el = document.createElement('span');
      el.className = 'phase-pill' + (p === g.currentPhase ? ' active' : '');
      el.textContent = PHASE_LABELS[p];
      pp.appendChild(el);
    }

    // Factions list
    const fl = this.$('faction-list');
    fl.innerHTML = '';
    const vc = g.victoryCities();
    this.$('vc-allies').textContent = `Allies VC ${vc.allies}/10`;
    this.$('vc-axis').textContent = `Axis VC ${vc.axis}/9`;

    for (const id of TURN_ORDER) {
      const f = FACTIONS[id];
      const row = document.createElement('div');
      row.className = 'faction-row' + (id === g.currentFaction ? ' current' : '');
      row.style.borderLeftColor = f.color;
      row.innerHTML = `<span>${f.name}</span><span>${g.ipc[id]} IPC · ${g.computeIncome(id)}/t</span>`;
      fl.appendChild(row);
    }

    // Purchase panel
    const buy = this.$('buy-panel');
    buy.style.display = g.currentPhase === 'purchase' ? 'block' : 'none';
    if (g.currentPhase === 'purchase') {
      const grid = this.$('buy-grid');
      grid.innerHTML = '';
      for (const u of Object.values(UNITS)) {
        const name = document.createElement('span');
        name.textContent = u.name;
        const cost = document.createElement('span');
        cost.className = 'cost';
        cost.textContent = `${u.cost} · ${u.attack}/${u.defense}`;
        const btn = document.createElement('button');
        btn.textContent = 'Buy';
        btn.disabled = !g.canPurchase(u.id);
        btn.onclick = () => { g.purchase(u.id, 1); this.render(); };
        grid.appendChild(name);
        grid.appendChild(cost);
        grid.appendChild(btn);
      }
      const pud = this.$('purchased-list');
      pud.textContent = g.purchased.length
        ? 'Pending: ' + g.purchased.map(p => `${p.count}× ${UNITS[p.type].name}`).join(', ')
        : 'No purchases yet.';
    }

    // Move panel
    const movePanel = this.$('move-panel');
    const moving = g.currentPhase === 'combatMove' || g.currentPhase === 'nonCombatMove';
    movePanel.style.display = moving ? 'block' : 'none';

    // Combat panel
    const cp = this.$('combat-panel');
    const inCombatPhase = g.currentPhase === 'combat' || g.combatState;
    if (g.combatState) {
      cp.classList.add('visible');
      const cs = g.combatState;
      this.$('combat-title').textContent = `Combat: ${g.locationName(cs.loc)} (rnd ${cs.round})`;
      this.$('combat-atk').textContent = 'Atk: ' + cs.attackers.map(u => UNITS[u.type].abbrev).join(' ') || '(none)';
      this.$('combat-def').textContent = 'Def: ' + cs.defenders.map(u => UNITS[u.type].abbrev).join(' ') || '(none)';
      this.$('combat-log').innerHTML = cs.log.slice(-6).map(l =>
        `<div>${l.side}: ${l.hits} hit(s)${l.rolls && l.rolls.length ? ' [' + l.rolls.map(r => `${r.type[0]}${r.r}`).join(' ') + ']' : ''}</div>`
      ).join('');
      this.$('btn-combat-round').disabled = cs.done || cs.attackers.length === 0 || cs.defenders.length === 0;
    } else if (g.currentPhase === 'combat') {
      cp.classList.add('visible');
      this.$('combat-title').textContent = `Pending combats: ${g.pendingCombats.length}`;
      this.$('combat-atk').textContent = g.pendingCombats.map(c => g.locationName(c.loc)).join(', ') || 'None';
      this.$('combat-def').textContent = '';
      this.$('combat-log').innerHTML = '';
      this.$('btn-combat-round').disabled = true;
    } else {
      cp.classList.remove('visible');
    }

    // Mobilize
    this.$('mobilize-panel').style.display = g.currentPhase === 'mobilize' ? 'block' : 'none';

    // Collect hint
    this.$('collect-hint').style.display = g.currentPhase === 'collect' ? 'block' : 'none';
    if (g.currentPhase === 'collect') {
      this.$('collect-hint').textContent = `Collect ${g.computeIncome(g.currentFaction)} IPC, then End Phase to finish turn.`;
    }

    // Log
    this.$('log').innerHTML = g.log.slice(0, 25).map(l =>
      `<div><span class="fac" style="color:${FACTIONS[l.fac]?.color || '#aaa'}">${FACTIONS[l.fac]?.short || ''}</span> ${l.msg}</div>`
    ).join('');

    this.renderSelection();

    if (g.winner) {
      this.$('win-overlay').classList.add('visible');
      this.$('win-text').textContent = g.winner === 'axis' ? 'Axis Victory!' : 'Allied Victory!';
    }
  }

  renderSelection() {
    const loc = this.game.selectedLoc;
    const box = this.$('selection-box');
    if (!loc) {
      box.innerHTML = '<div class="hint">Click a zone, deep-space lane, or unit stack.</div>';
      return;
    }
    const name = this.game.locationName(loc);
    const z = this.game.zones[loc];
    let html = `<strong>${name}</strong>`;
    if (z) {
      if (z.terrain === 'sea') {
        html += `<div class="hint">SEA zone · no income · ships hover here · unload/bombard adjacent land</div>`;
      } else {
        const own = FACTIONS[z.owner];
        html += `<div>LAND · Owner: <span style="color:${own.color}">${own.name}</span>
          · IPC ${z.ipc}${z.vc ? ' · VC: ' + z.vc : ''}${z.factory ? ' · Factory' : ''}</div>`;
      }
    } else {
      html += `<div class="hint">Deep-space lane (no income · fleet movement)</div>`;
    }
    const rows = this.game.unitCountSummary(loc);
    if (rows.length) {
      html += '<div style="margin-top:6px">Units:</div>';
      for (const r of rows) {
        html += `<div style="color:${FACTIONS[r.fac].color}">${FACTIONS[r.fac].short}: ${r.parts}</div>`;
      }
    } else html += '<div class="hint">Empty</div>';
    box.innerHTML = html;
  }
}
