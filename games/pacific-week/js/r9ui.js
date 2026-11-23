// r9 UI helpers (no game state here): big kind badges, echelon lines, rank chips, cost tags, plain-word names,
// and the Menu sheets (Tutorial, Matchups). Style follows the parts-library gold-dark panels (--acc gold on dark).
import { icon, unitIcon, UNIT_NAMES } from './icons.js?v=9';
import { rankBoard } from './art.js?v=9';
import { STRONG, WEAK, KEYS } from './matchups.js?v=9';

// kind = what a card / marker IS: ground forces, ships, planes or a commander
export const KIND = {
  army: { col: '#4e7d32', ring: '#a6d98a', word: 'ARMY' },
  fleet: { col: '#1d4f91', ring: '#8fc0ff', word: 'FLEET' },
  air: { col: '#1f7fa8', ring: '#9be3ff', word: 'AIR' },
  cmd: { col: '#a9781c', ring: '#ffd86b', word: 'CMDR' },
};
const KIND_SVG = {
  army: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 6l18 12M21 6L3 18"/>',
  fleet: '<circle cx="12" cy="5" r="2.6"/><line x1="12" y1="22" x2="12" y2="7.6"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>',
  air: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  cmd: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
};
// echelon lines like real map symbols: III regiment, II battalion, I company
export function echHtml(n, cls = '') {
  if (!n) return '';
  const w = n * 5 + 1;
  return `<svg class="ech ${cls}" data-ech="${n}" width="${w * 1.6}" height="16" viewBox="0 0 ${w} 10" aria-label="${['', 'company', 'battalion', 'regiment'][n]}">${Array.from({ length: n }, (_, i) => `<rect x="${1 + i * 5}" y="0" width="3" height="10" rx="1"/>`).join('')}</svg>`;
}
export function kindBadge(kind, { ech = 0, word = true, cls = '' } = {}) {
  const k = KIND[kind]; if (!k) return '';
  return `<span class="kb kb-${kind} ${cls}" data-kind="${kind}" style="--kb:${k.col};--kr:${k.ring}">${echHtml(ech)}<span class="kb-i"><svg viewBox="0 0 24 24" fill="${kind === 'cmd' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${KIND_SVG[kind]}</svg></span>${word ? `<b>${k.word}</b>` : ''}</span>`;
}
// the same badge on a canvas (map markers): a coloured disc with the kind symbol, echelon bars above it
const kindPath = {};
const KIND_P2D = { army: 'M3 6l18 12M21 6L3 18', fleet: 'M12 22V7.6M5 12H2a10 10 0 0 0 20 0h-3', air: KIND_SVG.air.match(/d="([^"]+)"/)[1], cmd: 'M12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3z' };
export function drawKindBadge(c, kind, x, y, r, ech = 0) {
  const k = KIND[kind]; if (!k) return;
  c.save();
  c.fillStyle = k.col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.lineWidth = Math.max(1, r * 0.16); c.strokeStyle = k.ring; c.stroke();
  const p = kindPath[kind] || (kindPath[kind] = new Path2D(KIND_P2D[kind]));
  c.translate(x - r * 0.68, y - r * 0.68); c.scale(r * 1.36 / 24, r * 1.36 / 24);
  c.strokeStyle = '#fff'; c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round';
  if (kind === 'army') c.strokeRect(3, 6, 18, 12);
  if (kind === 'fleet') { c.beginPath(); c.arc(12, 5, 2.6, 0, 7); c.stroke(); }
  if (kind === 'cmd') { c.fillStyle = '#fff'; c.fill(p); } else c.stroke(p);
  c.restore();
  if (ech) { // black-edged white bars over the disc
    const bw = r * 0.26, gap = r * 0.2, tw = ech * bw + (ech - 1) * gap, bx = x - tw / 2, by = y - r * 1.95, bh = r * 0.8;
    c.save(); c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.85)'; c.lineWidth = Math.max(1, r * 0.12);
    for (let i = 0; i < ech; i++) { c.strokeRect(bx + i * (bw + gap), by, bw, bh); c.fillRect(bx + i * (bw + gap), by, bw, bh); }
    c.restore();
  }
}
const rankCache = {};
export function rankChip(rank, h = 18) {
  const key = `${rank}:${h}`; if (rankCache[key]) return rankCache[key];
  const c = document.createElement('canvas'), W = Math.round(h * 2.4); c.width = W * 2; c.height = h * 2;
  const q = c.getContext('2d'); q.scale(2, 2); rankBoard(q, rank, 1, 1, W - 2, h - 2);
  return (rankCache[key] = `<img class="rk" data-rank="${rank}" src="${c.toDataURL()}" width="${W}" height="${h}" alt="${RANK_WORD[rank]}">`);
}
export const RANK_WORD = { capt: 'Captain', maj: 'Major', col: 'Colonel' };
export const coinHtml = (n) => `<span class="cost">${icon('coins', { size: 14 })}<b>${n}</b></span>`;
export const ord = (n) => { const v = n % 100; return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`; };
export const cap = (w) => w.charAt(0) + w.slice(1).toLowerCase();
export const typeWord = (t) => cap(UNIT_NAMES[t] || t);
// strong / weak words for the matchup keys
export const KEY_WORD = { army: 'Army', fleet: 'Fleet', fort: 'Fort', recon: 'Recon', fighter: 'Fighter', bomber: 'Bomber', torpedo: 'Torpedo' };
export const PERK_INFO = { atk: { ic: 'sword', w: 'ATK+' }, def: { ic: 'shield', w: 'DEF+' }, move: { ic: 'move', w: 'MOVE+' }, scout: { ic: 'eye', w: 'SCOUT' } };
export function starsHtml(n, max = 3) {
  return `<span class="coh" data-stars="${n}" aria-label="cohesion ${n} of ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">${icon('star', { size: 13 })}</i>`).join('')}</span>`;
}
// Strong vs / Weak vs row: icons + short words (only shown for a selected unit)
export function matchWords(k, keyImg) {
  if (!k || !STRONG[k]) return '';
  const part = (cls, lab, list) => `<span class="mw ${cls}"><i class="ar"></i><b>${lab}</b>${list.length ? list.map((x) => `<span class="mwk">${keyImg(x)}<small>${KEY_WORD[x]}</small></span>`).join('') : '<small class="none">-</small>'}</span>`;
  return `<div class="mwrow" data-k="${k}">${part('up', 'Strong vs', STRONG[k])}${part('dn', 'Weak vs', WEAK[k])}</div>`;
}
export function matchupsSheet(keyImg) {
  return `<div class="sheet-h">${icon('swords', { size: 26 })}<b>MATCHUPS</b></div><div class="mtab">${KEYS.map((k) => `<div class="mt-row" data-k="${k}"><span class="mt-k">${keyImg(k)}<b>${KEY_WORD[k]}</b></span>${matchWords(k, keyImg)}</div>`).join('')}</div>`;
}
// Tutorial: picture-first steps; each step = a picture (built by the caller from real game art) + 1-3 words
export function tutorialPick() {
  return `<div class="sheet-h">${icon('book', { size: 26 })}<b>TUTORIAL</b></div><div class="tut-pick">
    <button class="btn tut-b" data-tut="battle">${icon('swords', { size: 44 })}<b>BATTLE</b></button>
    <button class="btn tut-b" data-tut="map">${icon('map', { size: 44 })}<b>CAMPAIGN MAP</b></button></div>`;
}
export function tutorialStep(steps, i, which) {
  const st = steps[i];
  return `<div class="sheet-h">${icon(which === 'battle' ? 'swords' : 'map', { size: 24 })}<b>${which === 'battle' ? 'BATTLE' : 'CAMPAIGN MAP'}</b><span class="tut-n">${i + 1}/${steps.length}</span></div>
    <div class="tut-pic">${st.pic}</div><div class="tut-cap">${st.cap}</div>
    <div class="tut-nav"><button class="btn ico" data-tstep="${i - 1}" ${i ? '' : 'disabled'} aria-label="Back">${icon('back', { size: 26 })}</button>
    <span class="tut-dots">${steps.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</span>
    ${i < steps.length - 1 ? `<button class="btn ico primary" data-tstep="${i + 1}" aria-label="Next">${icon('back', { size: 26, className: 'sc-ico flip' })}</button>` : `<button class="btn ico primary" data-tdone="1" aria-label="Done">${icon('check', { size: 26 })}</button>`}</div>`;
}
