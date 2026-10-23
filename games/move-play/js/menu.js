// Body-controlled menus: raise a hand -> a glowing ✋ cursor (one per player, in the player's colour);
// hold it on a button for ~1.2 s while the ring fills -> the button is clicked. Mouse / touch keep working.
// DOM glue around the pure HandCursors (hands.js) + DwellClicker (dwell.js).
import { HandCursors, fullBodyInFrame } from './hands.js';
import { DwellClicker } from './dwell.js';
import { PLAYER_COLORS } from './multi.js';

export const DWELL_SELECTOR = 'button:not([disabled]), a.btn, a.card, [data-dwell]';

export class BodyMenu {
  /**
   * @param o.enabled () => bool        menus active right now (off while playing: arm moves would press buttons)
   * @param o.scope   () => Element[]   where to look for targets (default: whole document)
   * @param o.onFire  (el) => void      after a dwell click
   * @param o.inFrame (body) => bool    "is this player framed well?" (default: whole body) -> 📏 step back
   */
  constructor(o = {}) {
    this.o = o; this.hands = new HandCursors(); this.dwell = new DwellClicker(o.dwell);
    this.layer = document.createElement('div'); this.layer.id = 'hands'; this.layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.layer);
    this.els = new Map(); this.cursors = []; this.lastFired = null; this.hover = new Set(); this.on = false;
    this.step = document.getElementById('stepBack');
  }
  targets() {
    const roots = this.o.scope ? this.o.scope() : [document];
    const out = [], W = innerWidth, H = innerHeight;
    for (const root of roots) {
      if (!root) continue;
      for (const el of root.querySelectorAll(this.o.selector || DWELL_SELECTOR)) {
        if (el.closest('.hidden') || el.dataset.nodwell != null) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) continue;
        if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        out.push({ id: el, x: r.left, y: r.top, w: r.width, h: r.height });
      }
    }
    return out;
  }
  /** players [{id, slot, body}], t seconds */
  update(players, t) {
    const on = this.o.enabled ? !!this.o.enabled() : true;
    this._step(players);
    if (!on) { if (this.on) { this.hands.reset(); this.dwell.reset(); this._render([]); } this.cursors = []; this.on = false; return; }
    this.on = true;
    const cursors = this.hands.update(players, innerWidth, innerHeight);
    const { fired, rings } = this.dwell.update(cursors, this.targets(), t);
    this.cursors = rings.map((r, i) => ({ ...r, slot: cursors[i].slot }));
    this._render(this.cursors);
    for (const f of fired) {
      this.lastFired = f.targetId;
      this.o.onFire?.(f.targetId);
      f.targetId.classList.add('dwell-fired'); setTimeout(() => f.targetId.classList.remove('dwell-fired'), 400);
      f.targetId.click();
    }
    if (fired.length) this.dwell.settle(); // next screen: the resting hand must not click what appears under it
  }
  _render(list) {
    const seen = new Set(), hov = new Set();
    for (const r of list) {
      let el = this.els.get(r.cursorId);
      if (!el) { el = document.createElement('div'); el.className = 'hcur'; el.innerHTML = '<i></i><span>✋</span>'; this.layer.appendChild(el); this.els.set(r.cursorId, el); }
      const col = PLAYER_COLORS[r.slot] || PLAYER_COLORS[0];
      el.style.setProperty('--pc', col.css); el.style.setProperty('--p', r.p.toFixed(3));
      el.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px)`;
      el.classList.toggle('over', !!r.targetId); el.classList.toggle('done', !!r.done);
      seen.add(r.cursorId); if (r.targetId) hov.add(r.targetId);
    }
    for (const [id, el] of this.els) if (!seen.has(id)) { el.remove(); this.els.delete(id); }
    for (const el of this.hover) if (!hov.has(el)) el.classList.remove('hand-hover');
    for (const el of hov) el.classList.add('hand-hover');
    this.hover = hov;
  }
  /** 📏 step back: someone is tracked but not fully in frame (head/feet cut off) for > 0.8 s */
  _step(players) {
    if (!this.step) return;
    const bad = !!players && players.some((p) => p.body && !(this.o.inFrame || fullBodyInFrame)(p.body)); // o.inFrame: game-specific framing (Flap Flyer: upper body)
    const now = performance.now();
    if (bad) { this.badSince ??= now; } else this.badSince = null;
    this.step.classList.toggle('on', bad && now - this.badSince > 800);
  }
  get state() { return { on: this.on, cursors: this.cursors.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), p: +c.p.toFixed(2), over: !!c.targetId })), clicks: this.dwell.clicks }; }
}
