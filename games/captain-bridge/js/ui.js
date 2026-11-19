// HUD + panels (gold-dark-panels tokens, sc-shell-menus sheet pattern). Icons first, short text.
import { icon } from './icons.js';
import { DEPTS, PLANS, STATUS } from './data.js';

const $ = (s) => document.querySelector(s);
const deptOf = (id) => DEPTS.find((d) => d.id === id);
const badge = (name, color, size = 28) => `<span class="badge" style="--c:${color}">${icon(name, { size })}</span>`;
const statusKey = () => `<div class="key">${Object.values(STATUS).map((s) => `<span class="stat sm" style="--c:${s.color}">${icon(s.icon, { size: 24 })}<b>${s.label}</b></span>`).join('')}</div>`;
const stat = (k) => { const s = STATUS[k]; return `<span class="stat" style="--c:${s.color}">${icon(s.icon, { size: 24 })}<b>${s.label}</b></span>`; };

export function createUI(h) {
  const sheet = $('#sheet'), body = $('#sheetBody'), title = $('#sheetTitle');
  let open = null, shownAt = 0;
  const ghost = () => performance.now() - shownAt < 400; // a touch that opened a card must not also press a button on it
  const ui = {
    get open() { return open; },
    close() { if (!open) return; open = null; sheet.hidden = true; sheet.dataset.kind = ''; document.body.classList.remove('sheet', 'sheet-officer'); h.onClose?.(); },
    show(kind, html, head) {
      open = kind; sheet.dataset.kind = kind; document.body.classList.add('sheet'); document.body.classList.toggle('sheet-officer', kind.startsWith('officer')); title.innerHTML = head; body.innerHTML = html; sheet.hidden = false; body.scrollTop = 0; shownAt = performance.now(); h.sfx?.('open');
    },
    officer(o) {
      const d = deptOf(o.dept);
      ui.show('officer:' + o.dept, `
        <div class="who">${badge(d.icon, d.color, 40)}<div><div class="nm">${o.name}</div><div class="role">${o.role}</div></div></div>
        <div class="row">${stat(o.status)}</div>
        <div class="lines">${d.lines.map(([ic, t]) => `<div class="ln" style="--c:${d.color}">${icon(ic, { size: 24 })}<span>${t}</span></div>`).join('')}</div>
        <button class="btn wide" data-act="reports">${icon('clipboard', { size: 24 })}<span>All reports</span></button>`,
        `${icon('user', { size: 24 })}<span>Officer</span>`);
    },
    reports() {
      ui.show('reports', `<div class="grid">${DEPTS.map((d) => `
        <div class="tile" style="--c:${d.color}">
          <div class="th">${badge(d.icon, d.color, 26)}<span class="tn">${d.name}</span><span class="sdot" style="--c:${STATUS[d.status].color}" title="${STATUS[d.status].label}">${icon(STATUS[d.status].icon, { size: 24 })}</span></div>
          ${d.lines.map(([ic, t]) => `<div class="ln">${icon(ic, { size: 24 })}<span>${t}</span></div>`).join('')}
        </div>`).join('')}</div>
        ${statusKey()}`,
        `${icon('clipboard', { size: 24 })}<span>Department Reports</span>`);
    },
    plans() {
      ui.show('plans', `<div class="list">${PLANS.map((p) => `
        <div class="plan" style="--c:${p.color}">
          ${badge(p.icon, p.color, 26)}
          <div class="pi"><div class="pn">${p.name}</div>
            <div class="pm">${p.kind === 'sortie' ? `<span>${icon('plane', { size: 24 })}x${p.ships}</span>` : `<span>${icon('rocket', { size: 24 })}Ship</span>`}<span>${icon('clock', { size: 24 })}${p.when}</span><span class="sdot" style="--c:${STATUS[p.status].color}">${icon(STATUS[p.status].icon, { size: 24 })}</span></div></div>
          <button class="btn show" data-act="show" data-id="${p.id}" aria-label="Show ${p.name}">${icon('eye', { size: 24 })}<span>Show</span></button>
        </div>`).join('')}</div>
        ${statusKey()}`,
        `${icon('route', { size: 24 })}<span>Flight Plans</span>`);
    },
    settings(s) {
      ui.show('settings', `
        <div class="set"><span class="sl">${icon('flip', { size: 24 })}Invert look</span><button class="btn tog ${s.invert ? 'on' : ''}" data-act="invert">${icon(s.invert ? 'check' : 'x', { size: 24 })}<span>${s.invert ? 'On' : 'Off'}</span></button></div>
        <div class="set"><span class="sl">${icon('drag', { size: 24 })}Look speed</span><span class="step"><button class="btn sq" data-act="sens-" aria-label="Slower">${icon('minus', { size: 24 })}</button><b>${s.sens.toFixed(1)}</b><button class="btn sq" data-act="sens+" aria-label="Faster">${icon('plus', { size: 24 })}</button></span></div>
        <div class="set"><span class="sl">${icon('eye', { size: 24 })}View width</span><span class="step"><button class="btn sq" data-act="fov-" aria-label="Narrower">${icon('minus', { size: 24 })}</button><b>${s.fov}</b><button class="btn sq" data-act="fov+" aria-label="Wider">${icon('plus', { size: 24 })}</button></span></div>
        <div class="set"><span class="sl">${icon(s.muted ? 'mute' : 'volume', { size: 24 })}Sound</span><button class="btn tog ${s.muted ? '' : 'on'}" data-act="mute">${icon(s.muted ? 'x' : 'check', { size: 24 })}<span>${s.muted ? 'Off' : 'On'}</span></button></div>
        <div class="credits">Models: Quaternius (CC0) · Captain + crew: HQ trooper · Icons: Lucide (ISC) · 3D: three.js (MIT)</div>`,
        `${icon('settings', { size: 24 })}<span>Settings</span>`);
    },
  };
  $('#sheetClose').addEventListener('click', () => { if (ghost()) return; h.sfx?.('blip'); ui.close(); });
  body.addEventListener('click', (e) => { if (ghost()) return; const b = e.target.closest('[data-act]'); if (b) h.onAct?.(b.dataset.act, b.dataset.id); });
  return ui;
}

export function hudButton(id, ic, label) { const b = document.getElementById(id); b.innerHTML = `${icon(ic, { size: 26 })}<span class="lb">${label}</span>`; return b; }
export { icon };
