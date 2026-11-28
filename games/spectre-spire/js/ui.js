// Menu helpers: screens, icon hydration, hunter cards, tap-for-more tips, toasts and the guide text.
import { HUNTERS, SHOP, FLOOR_TYPES, shopPrice } from './config.js';
import { icon, ABILITY_ICON } from './icons.js';

export const $ = (s, root = document) => root.querySelector(s);
const SCREENS = ['sMenu', 'sSetup', 'sJoin', 'sLobby', 'sPause', 'sShop', 'sLift', 'sResult', 'sHelp'];

export function show(id) { for (const s of SCREENS) $('#' + s).hidden = s !== id; }
export function current() { return SCREENS.find((s) => !$('#' + s).hidden) || null; }

export function hydrateIcons(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits = [];
  while (walker.nextNode()) if (/ICON:\w+/.test(walker.currentNode.nodeValue)) hits.push(walker.currentNode);
  for (const n of hits) {
    const span = document.createElement('span');
    span.innerHTML = n.nodeValue.replace(/ICON:(\w+)/g, (_, k) => icon(k)).trim();
    n.replaceWith(...span.childNodes);
  }
}

let toastT = 0;
export function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}

// ---- tap-for-more tips: info chips explain on tap, action buttons on long-press
let tipT = 0;
export function showTip(el, html) {
  const tip = $('#tip'); tip.innerHTML = html; tip.hidden = false;
  const r = el.getBoundingClientRect(), w = Math.min(320, window.innerWidth * 0.86);
  let x = r.left + r.width / 2 - w / 2; x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
  tip.style.width = w + 'px'; tip.style.left = x + 'px';
  const below = r.bottom + 8, th = tip.offsetHeight;
  tip.style.top = (below + th < window.innerHeight - 8 ? below : Math.max(8, r.top - th - 8)) + 'px';
  clearTimeout(tipT); tipT = setTimeout(() => { tip.hidden = true; }, 5000);
}
export function initTips() {
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#tip')) $('#tip').hidden = true; }, true);
  for (const el of document.querySelectorAll('[data-tip]')) {
    const label = el.querySelector('span')?.textContent || '';
    const html = () => `<b>${label}</b>${el.dataset.tip}`;
    el.title = el.dataset.tip;
    if (el.id === 'bSuck') return; // Suck is held down to play, so its help lives in hints and the guide
    if (el.classList.contains('abtn') || el.classList.contains('guide') || el.classList.contains('tbtn')) {
      let t = 0;
      el.addEventListener('pointerdown', () => { t = setTimeout(() => showTip(el, html()), 550); });
      const cancel = () => clearTimeout(t);
      el.addEventListener('pointerup', cancel); el.addEventListener('pointercancel', cancel); el.addEventListener('pointerleave', cancel);
    } else el.addEventListener('click', () => showTip(el, html()));
  }
}

// ---- hunter cards
export function renderHunters(box, { selected, taken = new Set(), onPick, compact = false }) {
  box.innerHTML = HUNTERS.map((h, i) => `
    <button class="hcard ${i === selected ? 'sel' : ''} ${taken.has(i) && i !== selected ? 'taken' : ''}" data-i="${i}" style="--c:${h.css}" aria-pressed="${i === selected}">
      <span class="who"><span class="dot">${icon(ABILITY_ICON[h.ability])}</span>${h.name}</span>
      <span class="ab">${h.abilityName}</span>
      <span class="ds">${h.short}</span>
      <span class="more" data-more="${i}" aria-label="More about ${h.name}">${icon('help')}</span>
    </button>`).join('');
  box.onclick = (e) => {
    const more = e.target.closest('[data-more]');
    if (more) { const h = HUNTERS[+more.dataset.more]; showTip(more, `<b>${h.name} · ${h.abilityName}</b>${h.long}`); e.stopPropagation(); return; }
    const card = e.target.closest('.hcard'); if (!card) return;
    const i = +card.dataset.i;
    if (taken.has(i) && i !== selected) { showTip(card, `<b>${HUNTERS[i].name} is taken</b>Another hunter in the room picked ${HUNTERS[i].name}. Pick someone else.`); return; }
    onPick(i);
  };
  if (compact) box.classList.add('compact');
}

// ---- elevator shop list
export function renderShop(box, { gold, up, onBuy, busy }) {
  box.innerHTML = SHOP.map((s) => {
    const owned = up[s.id] || 0, price = shopPrice(s, s.id === 'heal' ? 0 : owned), maxed = owned >= s.max;
    const ownTxt = s.id === 'heal' ? '' : `<span class="own">${owned}/${s.max} owned</span>`;
    return `<div class="sitem">${icon(s.icon)}<b>${s.name}</b><span class="ds">${s.desc} ${ownTxt}</span>
      <button data-buy="${s.id}" ${maxed || gold < price || busy ? 'disabled' : ''}>${maxed ? 'Maxed' : 'Buy $' + price}</button></div>`;
  }).join('');
  box.onclick = (e) => { const b = e.target.closest('[data-buy]'); if (b && !b.disabled) onBuy(b.dataset.buy); };
}

export function helpHTML() {
  const hunters = HUNTERS.map((h) => `<li><b style="color:${h.css}">${h.name} · ${h.abilityName}</b>: ${h.short}.</li>`).join('');
  const floors = Object.values(FLOOR_TYPES).map((f) => `<li><b>${f.name}</b>: ${f.goal}.</li>`).join('');
  return `
  <h3>${icon('star')} Goal</h3>
  <ul><li>Climb the haunted hotel floor by floor with your crew.</li><li>Each floor has a <b>gold quota</b> and a <b>timer</b>.</li>
  <li>Loot sitting in the elevator plus ghosts you bag count toward the quota.</li><li>Quota met: everyone standing gets in the elevator to go up.</li>
  <li>Win at the top. Lose if the timer runs out short of the quota, or everyone is spooked.</li></ul>
  <h3>${icon('ghost')} Ghosts</h3>
  <ul><li>Your flashlight is always on. Keep it on a ghost until it gets dizzy (yellow stars).</li><li>Then <b>hold Suck</b> while aiming at it.</li>
  <li>Big horned ghosts need <b>two hunters</b> sucking at once.</li><li>A ghost that glows red is about to swoop. Step aside!</li></ul>
  <h3>${icon('hand')} Loot</h3>
  <ul><li>Aim at a valuable and tap <b>Grab</b>. Tap again to drop it.</li><li>Bumping walls or dropping it from high up costs money. Fragile things lose more.</li>
  <li><b>Heavy</b> loot (clocks, golden toilets) needs two hunters to lift; alone you can only drag it slowly.</li><li>A ghost hit makes you drop what you carry.</li></ul>
  <h3>${icon('heart')} Hearts</h3>
  <ul><li>You have 3 hearts. At zero you are spooked and can only crawl.</li><li>A friend standing next to you for a moment brings you back. Bram's Mend does it at once.</li></ul>
  <h3>${icon('lift')} Floors</h3><ul>${floors}<li>Between floors the elevator shop sells upgrades for the whole team.</li></ul>
  <h3>${icon('users')} Hunters</h3><ul>${hunters}</ul>
  <h3>${icon('gear')} Controls</h3>
  <div class="keys">
    <b>Phone</b><span>Left thumb: move · Right thumb: drag to look · Buttons: Suck (hold), Grab, Skill, Jump · Hold any button for help</span>
    <span><kbd>W A S D</kbd></span><span>Move (arrow keys work too)</span>
    <span><kbd>Mouse</kbd></span><span>Look (click the game first)</span>
    <span><kbd>Left mouse</kbd> <kbd>R</kbd></span><span>Hold to suck</span>
    <span><kbd>E</kbd> <kbd>Right mouse</kbd></span><span>Grab / drop</span>
    <span><kbd>Q</kbd> <kbd>F</kbd></span><span>Skill</span>
    <span><kbd>Space</kbd></span><span>Jump</span>
    <span><kbd>G</kbd> <kbd>Tab</kbd></span><span>Trail to the elevator</span>
    <span><kbd>Esc</kbd> <kbd>P</kbd></span><span>Pause and settings</span>
  </div>`;
}
