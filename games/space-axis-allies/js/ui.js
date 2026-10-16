import { FACTIONS, TURN_ORDER, UNITS, ZONES } from './data.js';
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
    // "Show moves" toggle (persists) + M shortcut
    this.showMoves = localStorage.getItem('saa.showMoves') === '1';
    this.$('btn-moves').onclick = () => this.setShowMoves(!this.showMoves);
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'm' || e.key === 'M') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) this.setShowMoves(!this.showMoves);
    });
    this._syncMovesBtn();
    this.$('btn-focus').onclick = () => {
      if (this.game.selectedLoc) this.map.focusOn(this.game.selectedLoc);
    };
    this.$('btn-sbr').onclick = () => this.doSBR();
  }

  setShowMoves(on) {
    this.showMoves = !!on;
    localStorage.setItem('saa.showMoves', on ? '1' : '0');
    this._syncMovesBtn();
    if (!on) this._clearPreview();
    this.toast(on ? 'Show moves: ON — click any stack to preview' : 'Show moves: OFF');
  }

  _syncMovesBtn() {
    const b = this.$('btn-moves');
    if (!b) return;
    b.classList.toggle('on', this.showMoves);
    b.setAttribute('aria-pressed', this.showMoves ? 'true' : 'false');
    b.textContent = 'Moves';
  }

  /** Inspect-only preview for any stack (any faction / phase). Never moves anything. */
  _showPreview(loc, fac) {
    const g = this.game;
    if (!Object.keys(g.getStack(loc, fac)).length) return this._clearPreview();
    this.preview = { loc, fac };
    // Own stack in a non-combat phase previews non-combat; everything else previews as combat move for its owner
    // Inspect preview: red attacks (combat move) + green repositioning (non-combat) for the stack's owner
    const pv = g.previewTargets(loc, fac, true, true);
    if (pv.radius > 0) this.map.showMoveSphere(loc, pv.radius); else this.map.hideMoveSphere();
    this.map.setMoveTargets(loc, pv.targets);
  }

  _clearPreview() {
    if (!this.preview) return;
    this.preview = null;
    if (!this.moveFrom) { this.map.hideMoveSphere(); this.map.clearMoveTargets(); }
  }

  hideToast() { const t = this.$('toast'); if (t) t.style.display = 'none'; clearTimeout(this._tt); }

  toast(msg) {
    const t = this.$('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { t.style.display = 'none'; }, 2800);
  }

  onMapSelect(sel) {
    this.hideToast();
    const phase0 = this.game.currentPhase;
    const ownMovePhase = phase0 === 'combatMove' || phase0 === 'nonCombatMove';
    // Preview mode: any stack that isn't being moved by its owner right now
    if (sel && sel.type === 'units' && this.showMoves && !(ownMovePhase && sel.fac === this.game.currentFaction) && !(this.moveFrom && (this.map.moveTargets?.targets || {})[sel.id])) {
      this.moveFrom = null; this.moveTo = null;
      this.game.selectedLoc = sel.id;
      this._showPreview(sel.id, sel.fac);
      this.renderSelection();
      return;
    }
    if (this.preview) this._clearPreview();
    if (!sel) {
      if (this.moveFrom) { this.moveFrom = null; this.moveTo = null; this._updateMoveSphere(); this._renderRoute(); }
      return;
    }
    const phase = this.game.currentPhase;
    if (sel.type === 'space') {
      // Free-space destination inside the movement sphere
      if ((phase === 'combatMove' || phase === 'nonCombatMove') && this.moveFrom) {
        this.moveTo = sel.pos;
        this._renderRoute();
        this.renderSelection();
      }
      return;
    }
    const loc = sel.id;
    this.game.selectedLoc = loc;

    // Clicking another of your own stacks that is not a legal target switches the selection
    const ownStack = sel.type === 'units' && sel.fac === this.game.currentFaction;
    if (this.moveFrom && this.moveFrom !== loc && ownStack && !(this.map.moveTargets?.targets || {})[loc]) {
      this.moveFrom = null; this.moveTo = null;
    }
    if ((phase === 'combatMove' || phase === 'nonCombatMove') && this.moveFrom && this.moveFrom !== loc) {
      // destination chosen — must be a highlighted legal target
      const tg = this.map.moveTargets?.targets || {};
      if (!tg[loc]) {
        const chk = this.game.tryMove(this.moveFrom, loc, this._take(), phase === 'combatMove', true);
        this.toast(chk.ok ? 'Not a legal destination for this selection' : chk.err);
        return;
      }
      this.moveTo = loc;
      this._renderRoute();
      this.renderSelection();
      return;
    }

    if ((phase === 'combatMove' || phase === 'nonCombatMove') && sel.type === 'units' && sel.fac === this.game.currentFaction) {
      this.moveFrom = loc;
      this.moveTo = null;
      this._renderRoute();
      this._fillMoveUnits(loc);
      this._updateMoveSphere();
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
        this._updateMoveSphere();
      };
    }
  }

  _renderRoute() {
    const el = this.$('move-route');
    if (!el) return;
    if (!this.moveFrom) { el.textContent = 'Select one of your stacks.'; return; }
    const g = this.game;
    const to = this.moveTo == null ? 'click a destination' : (Array.isArray(this.moveTo) ? 'Open space point' : g.locationName(this.moveTo));
    el.innerHTML = `<b>${g.locationName(this.moveFrom)}</b> → ${to}`;
  }

  /** Movement sphere for the selected stack: slowest chosen ship/air unit (or whole stack if none chosen). */
  /** Chosen counts, or the whole stack if none chosen yet. */
  _take() {
    const chosen = Object.fromEntries(Object.entries(this.moveTake || {}).filter(([, n]) => n > 0));
    return Object.keys(chosen).length ? chosen : { ...this.game.getStack(this.moveFrom, this.game.currentFaction) };
  }

  _updateMoveSphere() {
    if (!this.moveFrom) { this.map.hideMoveSphere(); this.map.clearMoveTargets(); return; }
    const take = this._take();
    const r = this.game.moveRadius(take);
    if (r > 0) this.map.showMoveSphere(this.moveFrom, r); else this.map.hideMoveSphere();
    const targets = this.game.legalTargets(this.moveFrom, take, this.game.currentPhase === 'combatMove');
    this.map.setMoveTargets(this.moveFrom, targets);
  }

  doMove() {
    const from = this.moveFrom;
    const to = this.moveTo;
    if (!from || !to) { this.toast('Pick from and to'); return; }
    const take = {};
    for (const inp of this.$('move-units').querySelectorAll('input')) {
      const n = parseInt(inp.value, 10) || 0;
      if (n > 0) take[inp.dataset.type] = n;
    }
    if (!Object.keys(take).length) Object.assign(take, this._take()); // no counts chosen → whole stack
    const combat = this.game.currentPhase === 'combatMove';
    const res = this.game.tryMove(from, to, take, combat);
    if (!res.ok) this.toast(res.err);
    else {
      this.moveFrom = null;
      this.moveTo = null;
      this._renderRoute();
      this.map.hideMoveSphere();
      this.map.clearMoveTargets();
      // Selection follows the moved stack (old origin may no longer exist)
      this.game.selectedLoc = res.to || null;
      this.$('move-units').innerHTML = '';
      this.map.refreshUnits();
      if (res.to) this.map.highlight({ type: ZONES[res.to] ? 'zone' : 'units', id: res.to });
    }
    this.render();
  }

  doSBR() {
    const from = this.moveFrom;
    const to = this.moveTo;
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
    if (g.currentPhase !== 'combatMove' && g.currentPhase !== 'nonCombatMove') { this.moveFrom = null; this.moveTo = null; if (!this.preview) { this.map?.hideMoveSphere?.(); this.map?.clearMoveTargets?.(); } }
    if (g.selectedLoc && !g.zones[g.selectedLoc] && !g.isFree(g.selectedLoc)) g.selectedLoc = null; // stale (fleet merged/destroyed)
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
    const g0 = this.game;
    if (g0.selectedLoc && !g0.zones[g0.selectedLoc] && !g0.isFree(g0.selectedLoc)) g0.selectedLoc = null;
    const loc = this.game.selectedLoc;
    const box = this.$('selection-box');
    if (!loc) {
      box.innerHTML = '<div class="hint">Click a zone or unit stack. Fleets move anywhere inside their movement sphere.</div>';
      return;
    }
    const name = this.game.locationName(loc);
    const z = this.game.zones[loc];
    let html = `<strong>${name}</strong>`;
    if (this.preview && this.preview.loc === loc) {
      const pf = FACTIONS[this.preview.fac];
      html += `<span class="preview-tag">Preview</span><div class="hint">Showing where <span style="color:${pf.color}">${pf.name}</span>'s stack could move (inspect only).</div>`;
    }
    if (z) {
      if (z.terrain === 'sea') {
        html += `<div class="hint">SEA zone · no income · ships hover here · unload/bombard adjacent land</div>`;
      } else {
        const own = FACTIONS[z.owner];
        html += `<div>LAND · Owner: <span style="color:${own.color}">${own.name}</span>
          · IPC ${z.ipc}${z.vc ? ' · VC: ' + z.vc : ''}${z.factory ? ' · Factory' : ''}</div>`;
      }
    } else {
      html += `<div class="hint">Fleet in open space (no income)</div>`;
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
