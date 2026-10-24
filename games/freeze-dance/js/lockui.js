// Player-count picker, roll call, 🔄 swap flash and the 🐞 tracking debug overlay (DOM glue around track.js).
// Shared by the 3 games (runner.js), the hub (hubcam.js) and Flap Flyer (copied there). Buttons are plain
// <button>s, so the raised-hand dwell menus (menu.js) can press them; mouse / touch work too.
import { PLAYER_COLORS } from './multi.js';
import { savePick } from './track.js';

const CSS = `
.mpov{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(8px,2.2vh,22px);
  background:rgba(20,12,60,.55);color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:12px;box-sizing:border-box}
.mpov.hidden{display:none}
.mpov h2{margin:0;font-size:clamp(34px,8vmin,72px);line-height:1;text-shadow:0 3px 12px #0008}
.mprow{display:flex;gap:clamp(8px,2vmin,20px);flex-wrap:wrap;justify-content:center;max-width:100%}
.mppick{min-width:clamp(78px,20vmin,170px);min-height:clamp(78px,20vmin,170px);border-radius:26px;border:4px solid #ffffff55;background:#ffffff22;color:#fff;
  font-size:clamp(20px,5vmin,44px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;padding:8px 10px;line-height:1.05}
.mppick b{font-size:clamp(26px,7vmin,60px)}
.mppick .ppl{letter-spacing:-.18em;white-space:nowrap}
.mppick.cur{border-color:#ffd84a;background:#ffd84a33;box-shadow:0 0 0 4px #ffd84a55}
.mppick.hand-hover,.mppick:hover{transform:scale(1.06);background:#ffffff40}
.mpslot{width:clamp(70px,18vmin,150px);height:clamp(70px,18vmin,150px);border-radius:50%;border:5px dashed #ffffff88;display:flex;align-items:center;justify-content:center;
  font-size:clamp(30px,8vmin,64px);position:relative;background:#ffffff14;transition:background .2s,transform .2s}
.mpslot.on{border-style:solid;border-color:#fff;background:var(--pc);transform:scale(1.08)}
.mpslot i{position:absolute;inset:-9px;border-radius:50%;background:conic-gradient(#ffd84a calc(var(--p,0)*360deg),transparent 0);
  -webkit-mask:radial-gradient(circle,transparent 62%,#000 63%);mask:radial-gradient(circle,transparent 62%,#000 63%)}
.mpslot small{position:absolute;bottom:-6px;right:-4px;font-size:.45em;background:#0008;border-radius:12px;padding:2px 6px}
.mpauto{width:min(60vw,360px);height:10px;border-radius:6px;background:#ffffff33;overflow:hidden}
.mpauto i{display:block;height:100%;width:calc(var(--a,0)*100%);background:#7fe3ff}
.mpbtns{display:flex;gap:14px}
.mpbtn{font-size:clamp(26px,6vmin,46px);min-width:clamp(64px,14vmin,110px);min-height:clamp(58px,12vmin,96px);border-radius:22px;border:3px solid #ffffff66;background:#ffffff26;color:#fff;cursor:pointer}
#mpBug{position:fixed;right:2px;bottom:2px;z-index:60;font-size:18px;width:34px;height:34px;border-radius:10px;border:0;background:#0003;opacity:.35;cursor:pointer;padding:0}
#mpBug[aria-pressed=true]{opacity:1;background:#ffd84a}
#mpDbg{position:fixed;inset:0;z-index:55;pointer-events:none}
#mpDbg.hidden{display:none}
#mpSwap{position:fixed;left:50%;top:42%;z-index:58;transform:translate(-50%,-50%) scale(.4);font-size:clamp(70px,22vmin,180px);opacity:0;pointer-events:none;
  transition:opacity .25s,transform .35s;text-shadow:0 4px 18px #0009;white-space:nowrap}
#mpSwap.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
#mpSwap span{font-size:.4em;vertical-align:middle}
@media (max-height:480px){.mpov{gap:6px}.mppick{min-height:70px;min-width:92px}.mpslot{width:64px;height:64px}}
`;
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.innerHTML = html; return e; };
export const PEOPLE = (n) => '👤'.repeat(n);

export class LockUI {
  /**
   * @param o.cam     Camera (cam.js) or anything with { tracker, players, setPlayers, startRoll, lockAuto, nPick, events }
   * @param o.getMap  () => viewMap-like {x(), y(), dw, dh} for the 🐞 boxes (screen px)
   * @param o.sound   optional { pop(), good() }
   * @param o.colors  slot colours (default PLAYER_COLORS)
   */
  constructor(o) {
    this.o = o; this.cam = o.cam; this.colors = o.colors || PLAYER_COLORS; this.mode = null; this.done = null; this.lockedAt = -1; this.dbgOn = false;
    if (!document.getElementById('mpCss')) document.head.appendChild(el('style', { id: 'mpCss' }, CSS));
    // picker
    this.pick = el('div', { id: 'mpPick', class: 'mpov hidden', role: 'dialog', 'aria-label': 'How many players?' },
      `<h2 aria-hidden="true">👥❓</h2><div class="mprow">${[1, 2, 3, 4].map((n) => `<button class="mppick" data-n="${n}" aria-label="${n} player${n > 1 ? 's' : ''}"><span class="ppl">${PEOPLE(n)}</span><b>${n}</b></button>`).join('')}</div>`);
    // roll call
    this.roll = el('div', { id: 'mpRoll', class: 'mpov hidden', role: 'dialog', 'aria-label': 'Roll call: raise a hand' },
      `<h2 aria-hidden="true">🙋</h2><div class="mprow" id="mpSlots"></div><div class="mpauto" aria-hidden="true"><i></i></div>
       <div class="mpbtns"><button class="mpbtn" id="mpSkip" aria-label="Skip: players by position">⏭</button></div>`);
    this.bug = el('button', { id: 'mpBug', 'aria-label': 'Tracking debug view', 'aria-pressed': 'false', 'data-nodwell': '', title: 'Debug (D)' }, '🐞');
    this.dbg = el('canvas', { id: 'mpDbg', class: 'hidden', 'aria-hidden': 'true' });
    this.swapEl = el('div', { id: 'mpSwap', role: 'status', 'aria-label': 'Players swapped' }, '🔄');
    for (const e of [this.pick, this.roll, this.dbg, this.swapEl, this.bug]) document.body.appendChild(e);
    this.pick.addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) this._picked(+b.dataset.n); });
    this.roll.querySelector('#mpSkip').addEventListener('click', () => { if (this.mode !== 'roll') return; this.cam.lockAuto(this.cam.nPick, true); this._finishRoll(true); });
    this.bug.addEventListener('click', (e) => { e.stopPropagation(); this.setDebug(!this.dbgOn); });
    addEventListener('keydown', (e) => { if ((e.key === 'd' || e.key === 'D') && !['play', 'count'].includes(document.body.dataset.mode)) this.setDebug(!this.dbgOn); });
    if (new URLSearchParams(location.search).get('debug') === '1') this.setDebug(true);
    this.swapT = 0;
  }
  get open() { return this.mode; }
  /** overlay elements for the dwell-menu scope */
  get scope() { return this.mode === 'pick' ? [this.pick] : this.mode === 'roll' ? [this.roll] : []; }
  setDebug(on) { this.dbgOn = !!on; this.bug.setAttribute('aria-pressed', on ? 'true' : 'false'); this.dbg.classList.toggle('hidden', !on); }
  /** big hover-to-pick row 👤 1 … 👤👤👤👤 4; done(n) after a pick */
  showPick(done) {
    this.mode = 'pick'; this.done = done; this.roll.classList.add('hidden'); this.pick.classList.remove('hidden');
    for (const b of this.pick.querySelectorAll('[data-n]')) b.classList.toggle('cur', +b.dataset.n === this.cam.nPick);
  }
  _picked(n) {
    if (this.mode !== 'pick') return;
    savePick(n); this.cam.setPlayers(n); this.o.sound?.pop?.();
    this.pick.classList.add('hidden'); const d = this.done; this.mode = null; this.done = null; d?.(n);
  }
  /** roll call for N = cam.nPick; done({auto}) once all N slots are locked (or ⏭ / auto by position) */
  showRoll(done) {
    this.mode = 'roll'; this.done = done; this.lockedAt = -1; this.pick.classList.add('hidden'); this.roll.classList.remove('hidden');
    this.cam.startRoll(this.cam.nPick); this._slots(); this.render();
  }
  _slots() {
    const n = this.cam.nPick, row = this.roll.querySelector('#mpSlots');
    row.innerHTML = Array.from({ length: n }, (_, s) => `<span class="mpslot" style="--pc:${this.colors[s].css}" data-slot="${s}"><i></i><b>✋</b><small>${s + 1}</small></span>`).join('');
  }
  _finishRoll(auto) {
    if (this.mode !== 'roll') return;
    this.render(); this.o.sound?.good?.();
    this.mode = 'rolldone'; this.lockedAt = performance.now();
    setTimeout(() => { this.roll.classList.add('hidden'); const d = this.done; this.mode = null; this.done = null; d?.({ auto }); }, auto ? 250 : 650);
  }
  hide() { this.pick.classList.add('hidden'); this.roll.classList.add('hidden'); this.mode = null; this.done = null; }
  render() {
    if (this.mode !== 'roll' && this.mode !== 'rolldone') return;
    const R = this.cam.tracker.rollState();
    const next = R.slots.indexOf(false);
    this.roll.querySelectorAll('.mpslot').forEach((e, s) => {
      const on = R.slots[s]; e.classList.toggle('on', on);
      e.querySelector('b').textContent = on ? '✅' : '✋';
      e.style.setProperty('--p', !on && s === next ? R.best.toFixed(2) : '0');
    });
    this.roll.querySelector('.mpauto').style.setProperty('--a', R.auto.toFixed(3));
  }
  /** call once per frame after the camera ticked; t = seconds */
  update(dt = 1 / 60) {
    for (const e of this.cam.events || []) {
      if (e.type === 'lock' && this.mode === 'roll') this.o.sound?.pop?.();
      if (e.type === 'swap') this.flashSwap(e.slots);
    }
    if (this.cam.events) this.cam.events = [];
    if (this.mode === 'roll') { this.render(); if (this.cam.tracker.phase === 'locked') this._finishRoll(false); }
    if (this.swapT > 0 && (this.swapT -= dt) <= 0) this.swapEl.classList.remove('on');
    if (this.dbgOn) this.drawDebug();
  }
  flashSwap(slots = [0, 1]) {
    const [a, b] = slots, A = this.colors[a] || this.colors[0], B = this.colors[b] || this.colors[1];
    this.swapEl.innerHTML = `<span>${A.dot || '●'}</span>🔄<span>${B.dot || '●'}</span>`; this.swapEl.classList.add('on'); this.swapT = 1.2;
    this.o.sound?.good?.();
  }
  /** 🐞: every detection's torso box, its slot, matching cost, held / candidate / extra / rejected */
  drawDebug() {
    const cv = this.dbg, W = innerWidth, H = innerHeight, d = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(W * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, W, H);
    const map = this.o.getMap?.(); if (!map) return;
    const tr = this.cam.tracker, D = tr.debug || { dets: [], rejected: [], held: [] };
    const R = (b) => [map.x(b.x0), map.y(b.y0), map.x(b.x1) - map.x(b.x0), map.y(b.y1) - map.y(b.y0)];
    c.font = 'bold 13px system-ui,sans-serif'; c.textBaseline = 'top';
    const label = (x, y, txt, bg) => { const w = c.measureText(txt).width + 8; c.fillStyle = bg; c.fillRect(x, y - 18, w, 17); c.fillStyle = '#fff'; c.fillText(txt, x + 4, y - 16); };
    for (const r of D.rejected || []) { if (!r.box) continue; const [x, y, w, h] = R(r.box); c.setLineDash([4, 4]); c.strokeStyle = '#ffffff88'; c.lineWidth = 1.5; c.strokeRect(x, y, w, h); c.setLineDash([]); label(x, y, '✖ ' + r.why, '#0009'); }
    for (const q of D.dets || []) {
      const [x, y, w, h] = R(q.box), col = q.slot >= 0 ? (this.colors[q.slot] || this.colors[0]).css : '#ffffff';
      c.strokeStyle = col; c.lineWidth = q.slot >= 0 ? 3 : 2; if (q.slot < 0) c.setLineDash([6, 4]); c.strokeRect(x, y, w, h); c.setLineDash([]);
      const txt = q.slot >= 0 ? `P${q.slot + 1} c=${q.cost == null ? '–' : q.cost.toFixed(2)}` : q.cand ? `new ${q.cand.age}s${q.cand.persisted ? ' ✓' : ''}${q.extra ? ' extra' : ''}` : 'near held';
      label(x, y, txt, q.slot >= 0 ? col : '#000a');
    }
    for (const h of D.held || []) { const [x, y, w, hh] = R(h.box); c.strokeStyle = '#ffb020'; c.lineWidth = 5; c.strokeRect(x - 3, y - 3, w + 6, hh + 6); label(x, y + hh + 20, `⏸ P${h.slot + 1} held`, '#c77800'); }
    // summary panel
    const pl = tr.players(), lines = [`${tr.phase} · N=${tr.n} · numPoses=${tr.n + 1}`, ...pl.map((p) => `P${p.slot + 1} ${p.state}${p.cost != null ? ' c=' + p.cost.toFixed(2) : ''}`), `cands ${tr.cands.length}`];
    c.fillStyle = '#000a'; c.fillRect(40, H - 22 - lines.length * 16, 190, lines.length * 16 + 8);
    c.fillStyle = '#fff'; lines.forEach((t, i) => c.fillText(t, 46, H - 18 - (lines.length - i) * 16 + 4));
  }
}
