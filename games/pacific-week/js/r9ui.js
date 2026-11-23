// r9 UI helpers (no game state here): big kind badges, echelon lines, rank chips, cost tags, plain-word names,
// and the Menu sheets (Tutorial, Matchups). Style follows the parts-library gold-dark panels (--acc gold on dark).
import { icon, unitIcon, UNIT_NAMES } from './icons.js?v=9d';
import { rankBoard } from './art.js?v=9d';
import { STRONG, WEAK, KEYS } from './matchups.js?v=9d';

// kind = what a card / marker IS: ground forces, ships, planes or a commander
export const KIND = {
  army: { col: '#4e7d32', ring: '#a6d98a', word: 'ARMY' },
  fleet: { col: '#1d4f91', ring: '#8fc0ff', word: 'FLEET' },
  air: { col: '#1f7fa8', ring: '#9be3ff', word: 'AIR WING' },
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
// r9b: the word on an army badge is its echelon (REGIMENT / BATTALION / COMPANY), never ARMY
export const ECH_WORD = { 3: 'REGIMENT', 2: 'BATTALION', 1: 'COMPANY' };
export function kindBadge(kind, { ech = 0, word = true, cls = '' } = {}) {
  const k = KIND[kind]; if (!k) return '';
  const wd = kind === 'army' ? ECH_WORD[ech] || 'TROOPS' : k.word;
  return `<span class="kb kb-${kind} ${cls}" data-kind="${kind}" style="--kb:${k.col};--kr:${k.ring}">${echHtml(ech)}<span class="kb-i"><svg viewBox="0 0 24 24" fill="${kind === 'cmd' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${KIND_SVG[kind]}</svg></span>${word ? `<b>${wd}</b>` : ''}</span>`;
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

// ---- r9b: commander names + the commander panel ----
const FIRST = 'ABCDEFGHJKLMNPRSTW';
const SUR = {
  blue: ['Harlan', 'Ostrow', 'Kendell', 'Marsh', 'Calloway', 'Brandt', 'Whitcombe', 'Reyes', 'Lindqvist', 'Abernathy', 'Dorsey', 'Hale', 'Fenwick', 'Okafor', 'Prescott', 'Vance', 'Tolliver', 'Merritt', 'Sato', 'Ingram', 'Castellan', 'Rourke', 'Pell', 'Garrick'],
  red: ['Varek', 'Moradin', 'Kesh', 'Torvald', 'Ilgar', 'Senna', 'Duvra', 'Halvik', 'Orsk', 'Petrane', 'Zalec', 'Brannoc', 'Valtis', 'Corvo', 'Remik', 'Tarnes', 'Ulvar', 'Kostin', 'Arvel', 'Drago', 'Mirsk', 'Lazko', 'Fenrik', 'Sabor'],
};
export function cmdName(side, seed) {
  const n = Math.abs(Math.floor(seed * 2654435761) >>> 0);
  const list = SUR[side] || SUR.blue;
  return `${FIRST[n % FIRST.length]}. ${list[(n >>> 7) % list.length]}`;
}
export const PERK_WORDS = {
  atk: 'Attack: his troops hit 5% more often',
  def: 'Defence: his troops are hit 5% less',
  move: 'Move: his fleet sails 150 further',
  scout: 'Scout: sees the zones next to him',
};
// c = { side, seed, rank, perk, stars (null = none), what }; portraitSrc = data URL of the big portrait
export function cmdPanel(c, portraitSrc) {
  const p = c.perk && PERK_INFO[c.perk];
  return `<div class="cp-head"><img class="cp-p" alt="" src="${portraitSrc}" width="84" height="84"><div class="cp-id">
      <div class="cp-name">${RANK_WORD[c.rank]} ${cmdName(c.side, c.seed)}</div>
      <div class="cp-rank">${rankChip(c.rank, 24)}<b>${RANK_WORD[c.rank]}</b></div>
      <div class="cp-what">${c.what}</div></div>
      <button class="btn ico cp-x" data-cpx="1" aria-label="Close">${icon('x', { size: 22 })}</button></div>
    <div class="cp-row">${p ? `<span class="perk big">${icon(p.ic, { size: 20 })}<b>${p.w}</b></span><span class="cp-w">${PERK_WORDS[c.perk]}</span>` : `<span class="perk none">${icon('minus', { size: 18 })}</span><span class="cp-w">No perk</span>`}</div>
    ${c.stars == null ? '' : `<div class="cp-row">${starsHtml(c.stars)}<span class="cp-w">Together ${c.stars}/3 (longer under him = better)</span></div>`}`;
}
export const waveSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>';

// ======================= r9b asks 7 + 8: lands, islands, the goal =======================
export const LAND_WORD = { sea: 'Sea zone', beach: 'Beach', port: 'Port', air: 'Airfield', ridge: 'Ridge', jungle: 'Jungle', depot: 'Depot', hq: 'HQ' };
export const LAND_SHORT = {
  sea: 'ships fight here',
  beach: 'landing spot', port: 'ships dock', air: 'planes base here', ridge: 'high ground, cover',
  jungle: 'thick cover', depot: '+2 supply a week', hq: 'home base, new troops land',
};
// what each land does (Lands menu). Combat lines follow G.TERRAIN; the rest are the existing rules.
const LAND_DOES = {
  sea: 'Open water. Ships move and fight here. Planes can strike ships here. Troops on transports are exposed.',
  beach: 'Landing spot. Your ships help you attack here.',
  port: 'Ships dock here. Bought ships land at your HOME port. Your ships help you attack here.',
  air: 'Planes base and land here. Bought planes land at your HOME airfield.',
  ridge: 'High ground: defenders have cover.',
  jungle: 'Thick jungle: foot soldiers do well, heavy guns do badly.',
  depot: '+2 supply every week.',
  hq: 'Home base. Bought companies land at your HOME HQ. Lose your home HQ = you lose.',
};
const upChip = (pic, w) => `<span class="lp up">${upArrow}${pic}<b>${w}</b></span>`;
const dnChip = (pic, w) => `<span class="lp dn">${dnArrow}${pic}<b>${w}</b></span>`;
const upArrow = '<svg class="lp-a" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5 M5 11l7-7 7 7"/></svg>';
const dnArrow = '<svg class="lp-a" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15 M5 13l7 7 7-7"/></svg>';
export function landPros(kind, G) {
  const T = G.TERRAIN[kind] || { up: [], down: [], cover: 0 }, out = [], pct = Math.round(G.TER_STEP * 100);
  for (const ty of T.up) out.push(upChip(unitIcon(ty, 20), `${typeWord(ty)} +${pct}%`));
  for (const ty of T.down) out.push(dnChip(unitIcon(ty, 20), `${typeWord(ty)} -${pct}%`));
  for (const ty of T.downAtk || []) out.push(dnChip(unitIcon(ty, 20), `${typeWord(ty)} attacking -${pct}%`));
  if (T.cover > 0) out.push(upChip(icon('shield', { size: 20 }), `Defenders: cover, hit ${pct}% less`));
  if (T.cover < 0) out.push(dnChip(icon('shield', { size: 20 }), `Defenders: no cover, hit ${pct}% more`));
  if (kind === 'sea') return [upChip(unitIcon('dd', 20), 'Ships fight'), upChip(icon('plane', { size: 20 }), 'Planes can strike'), dnChip(unitIcon('inf', 20), 'Troops aboard exposed')].join('');
  if (kind === 'beach' || kind === 'port') out.push(upChip(unitIcon('dd', 20), 'Attackers: ships help'));
  if (kind === 'air') out.push(upChip(icon('plane', { size: 20 }), 'Planes land'));
  if (kind === 'depot') out.push(upChip(icon('coins', { size: 20 }), `+${G.DEPOT_SUPPLY} supply`));
  if (kind === 'hq') out.push(upChip(unitIcon('inf', 20), 'Home: new companies land')); // r9d: buying is the BUY button; each kind lands at one home zone
  if (kind === 'port') out.push(upChip(unitIcon('dd', 20), 'Home: new ships land'));
  if (kind === 'air') out.push(upChip(icon('plane', { size: 20 }), 'Home: new planes land'));
  if (!out.length) out.push('<span class="lp none">No fight changes</span>');
  return out.join('');
}
export function landsSheet(landImg, G) {
  const kinds = ['sea', 'beach', 'port', 'air', 'ridge', 'jungle', 'depot', 'hq'];
  return `<div class="sheet-h">${icon('map', { size: 26 })}<b>LANDS</b></div><div class="lands">${kinds.map((k) => `<div class="ld-row" data-land="${k}">
    <span class="ld-k">${landImg(k)}<b>${LAND_WORD[k]}</b></span><div class="ld-b"><div class="ld-does">${LAND_DOES[k]}</div><div class="ld-pc">${landPros(k, G)}</div></div></div>`).join('')}</div>`;
}
// what holding this island gives you (ask 7)
export function islandGives(I, G) {
  const dep = I.secs.filter((x) => x.kind === 'depot').length, sup = (G.INCOME[I.type] || 0) + dep * G.DEPOT_SUPPLY;
  const out = [`<span class="ig">${icon('coins', { size: 16 })}<b>+${sup} supply a week</b></span>`];
  if (I.secs.some((x) => x.kind === 'air')) out.push(`<span class="ig">${icon('plane', { size: 16 })}<b>planes can land</b></span>`);
  if (I.secs.some((x) => x.kind === 'port')) out.push(`<span class="ig">${icon('anchor', { size: 16 })}<b>ships dock${I.type === 'home' ? ' + unload' : ''}</b></span>`);
  if (I.type === 'home') out.push(`<span class="ig">${icon('home', { size: 16 })}<b>home HQ</b></span>`);
  return `<span class="in-gives">${out.join('')}</span>`;
}
export const goalLine = (G, S) => `${icon('target', { size: 16 })}<b>Take ${cap(G.island(S, G.homeOf('red')).name)} to win</b><span class="dot">·</span><b>Lose ${cap(G.island(S, G.homeOf('blue')).name)} = lose</b>`;
export const shipSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15h16l-2 3H6z M9 15v-2h5v2 M11 13v-2.5"/></svg>`;
