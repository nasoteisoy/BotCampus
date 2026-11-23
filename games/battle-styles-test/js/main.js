// Battle styles demo shell: 5 big icon tabs, each a short playable take on the same Island Front fight.
import { icon, unitIcon } from './icons.js';
import { FIGHT, ICO, sfx } from './common.js';
import aa from './tab-dice.js';
import hoi from './tab-clock.js';
import lane from './tab-lane.js';
import hex from './tab-hex.js';
import duel from './tab-duel.js';

const TABS = [aa, hoi, lane, hex, duel];
const $ = (id) => document.getElementById(id);
let cur = null, cleanup = null, ended = false;
window.__BS__ = { errors: [], get tab() { return cur && cur.id; }, get ended() { return ended; }, state: null };
window.addEventListener('error', (e) => window.__BS__.errors.push(String(e.message)));

$('tabs').innerHTML = TABS.map((t) => `<button class="tab" role="tab" data-tab="${t.id}" aria-label="${t.name}">${icon(t.icon, { size: 30 })}<span>${t.short}</span></button>`).join('');
$('fight').innerHTML = `<span class="side blue">${FIGHT.blue.map((u) => unitIcon(ICO[u], 20)).join('')}</span><span class="vs">${icon('swords', { size: 18 })}</span><span class="side red">${FIGHT.red.map((u) => unitIcon(ICO[u], 20)).join('')}</span>`;
$('b-replay').innerHTML = icon('refresh', { size: 22 });
$('b-again').innerHTML = `${icon('refresh', { size: 26 })}<span>REPLAY</span>`;

function end(win, why = '') {
  if (ended) return; ended = true;
  sfx(win ? 'win' : 'lose');
  const c = document.querySelector('.end-card'); c.classList.toggle('lose', !win);
  $('end-ico').innerHTML = icon(win ? 'trophy' : 'skull', { size: 72 });
  $('end-t').textContent = win ? 'WIN' : 'LOSE';
  $('end-why').innerHTML = why;
  setTimeout(() => { if (ended) $('end').hidden = false; }, 700);
}
function open(id) {
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  cur = TABS.find((t) => t.id === id) || TABS[0]; ended = false; $('end').hidden = true;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === cur.id));
  $('rule-ico').innerHTML = icon(cur.icon, { size: 24 }); $('rule-t').textContent = cur.decides;
  $('stage').innerHTML = ''; $('ctrl').innerHTML = '';
  cleanup = cur.mount({ stage: $('stage'), ctrl: $('ctrl'), end, sfx, setRule: (t) => { $('rule-t').textContent = t; } });
  history.replaceState(null, '', `#${cur.id}`);
}
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { sfx('tap'); open(b.dataset.tab); } });
$('b-replay').addEventListener('click', () => { sfx('tap'); open(cur.id); });
$('b-again').addEventListener('click', () => { sfx('tap'); open(cur.id); });
open((location.hash || '').slice(1) || TABS[0].id);
