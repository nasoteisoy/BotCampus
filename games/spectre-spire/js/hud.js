// In-game HUD: top bar, team chips, hearts, aim label, world labels and the elevator button.
import * as THREE from 'three';
import { HUNTERS, FLOOR_TYPES, GHOSTS, LOOT } from './config.js';
import { GHOST_KINDS } from './sim.js';
import { icon, ABILITY_ICON } from './icons.js';
import { $ } from './ui.js';

const cache = new Map();
const set = (el, key, val, prop = 'textContent') => { const k = key + prop; if (cache.get(k) !== val) { cache.set(k, val); el[prop] = val; } };
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const heartsHTML = (hp, max = 3) => Array.from({ length: max }, (_, i) => icon('heart', i < hp ? '' : 'empty')).join('');

export function resetHud() { cache.clear(); $('#labels').innerHTML = ''; labelEls.clear(); }

export function updateTopBar(snap, floor, me) {
  set($('#hFloor'), 'fl', `Floor ${snap.n}/${snap.tot}`);
  set($('#hType'), 'ty', FLOOR_TYPES[snap.ty].name);
  const tl = $('#hTimer');
  set(tl, 'tm', fmtTime(snap.tl));
  tl.classList.toggle('low', snap.tl < 30 && snap.ph === 'play');
  const q = floor.quota, met = snap.col >= q && snap.boss;
  set($('#hQuota'), 'q', `$${snap.col} / $${q}${snap.boss ? '' : ' + boss'}`);
  $('#hQbar').style.width = Math.min(100, (snap.col / q) * 100) + '%';
  $('.quota').classList.toggle('met', met);
  set($('#hBank'), 'bank', `Bank $${snap.gold}`);
  // team chips
  const chips = Object.entries(snap.h).map(([pid, h]) => {
    const [name, hi, bot, hp, down] = h, c = HUNTERS[hi].css;
    return `<div class="tchip ${pid === me ? 'me' : ''} ${down ? 'down' : ''}" style="--c:${c}"><span class="dot"></span>${esc(name)}${bot ? ' (cpu)' : ''} <span class="hp">${down ? 'spooked' : '♥'.repeat(hp)}</span></div>`;
  }).join('');
  set($('#team'), 'team', chips, 'innerHTML');
  const mine = snap.h[me];
  if (mine) {
    const [, hi, , hp, down, cd, turbo] = mine;
    set($('#hearts'), 'hearts', heartsHTML(hp), 'innerHTML');
    $('#downNote').hidden = !down;
    const H = HUNTERS[hi];
    const sk = $('#bSkill');
    sk.style.setProperty('--hc', H.css);
    set($('#skillText'), 'sk', cd > 0 ? Math.ceil(cd) + 's' : H.abilityName);
    if (cache.get('skico') !== H.ability) { cache.set('skico', H.ability); sk.querySelector('.ic').outerHTML = icon(ABILITY_ICON[H.ability]); sk.dataset.tip = H.long; sk.title = H.long; }
    sk.classList.toggle('cool', cd > 0);
    sk.querySelector('.cdring circle').style.strokeDashoffset = String(113 * Math.min(1, cd / H.cd));
    sk.classList.toggle('active', !!turbo);
  }
  // elevator button
  const g = $('#guideBtn');
  let txt = 'To elevator';
  if (met) txt = snap.dep > 0 ? `Going up in ${Math.max(1, Math.ceil(3 - snap.dep))}…` : 'Quota met! Into the elevator';
  else if (!snap.boss) txt = 'Bag the boss first';
  set($('#guideText'), 'gt', txt);
  g.classList.toggle('ready', met);
}

export function updateAim(target) {
  const cross = $('#cross'), lab = $('#aimLabel');
  cross.className = target ? target.type : '';
  if (!target) { lab.classList.remove('on'); return; }
  lab.classList.add('on');
  set(lab, 'aim', target.html, 'innerHTML');
}

export function aimText(target, holdId) {
  if (target.type === 'loot') {
    const d = LOOT[target.kind];
    const tags = [];
    if (d.weight >= 3) tags.push('<span class="hv">Heavy: 2 hunters</span>');
    else if (d.fragile >= 0.8) tags.push('<span class="f">Fragile</span>');
    if (target.inZone) tags.push('in elevator');
    const act = holdId === target.id ? 'Grab = drop' : 'Grab';
    return `${d.name} · <span class="v">$${target.value}</span>${tags.length ? ' · ' + tags.join(' · ') : ''} · ${act}`;
  }
  const d = GHOSTS[target.kind];
  if (target.stunned) return `${d.name} · <b>dizzy! Hold Suck</b>${d.need > 1 ? ' · 2 hunters' : ''}`;
  return `${d.name} · keep your light on it${d.need > 1 ? ' · needs 2 hunters' : ''}`;
}

// labels that float over ghosts, hunters, cages and (with Lantern) loot
const labelEls = new Map();
const v3 = new THREE.Vector3();
export function updateLabels(view, snap, me, floor, w, h) {
  const want = new Map();
  const add = (key, x, y, z, html, cls = '') => want.set(key, { x, y, z, html, cls });
  for (const g of snap.g) {
    const [id, ki, x, y, z, , st, cap, hp] = g, kind = GHOST_KINDS[ki], size = GHOSTS[kind].size;
    if (kind === 'boss') add('g' + id, x, y + size, z, `Night Manager · ${hp} left<div class="bar"><i style="width:${cap}%"></i></div>`);
    else if (st & 16) add('g' + id, x, y + size * 0.8, z, `Need 2 hunters!<div class="bar"><i style="width:${cap}%"></i></div>`, 'need');
    else if (st & 2) add('g' + id, x, y + size * 0.8, z, `<div class="bar"><i style="width:${cap}%"></i></div>`);
  }
  for (const [pid, hh] of Object.entries(snap.h)) {
    if (pid === me) continue;
    const [name, hi, , , down, , , revive, , , x, y, z] = hh;
    const c = HUNTERS[hi].css;
    if (down) add('h' + pid, x, y + 0.9, z, `<span class="tagc" style="--c:${c}">${esc(name)}</span> spooked · stand close<div class="bar"><i style="width:${Math.round(revive / 2.5 * 100)}%"></i></div>`, 'need');
    else add('h' + pid, x, y + 2.05, z, `<span class="tagc" style="--c:${c}">${esc(name)}</span>`);
  }
  for (const [id, prog, freed] of snap.c || []) {
    if (freed) continue;
    const c = floor.cages[id];
    add('c' + id, c.x, 2.4, c.z, `Free the guest: stand here<div class="bar"><i style="width:${prog}%"></i></div>`);
  }
  if (snap.rv > 0) for (const l of snap.l) if (!l[7]) add('l' + l[0], l[1], l[2] + 0.5, l[3], `$${l[5]}`);
  const layer = $('#labels');
  for (const [k, el] of labelEls) if (!want.has(k)) { el.remove(); labelEls.delete(k); }
  for (const [k, d] of want) {
    let el = labelEls.get(k);
    if (!el) { el = document.createElement('div'); el.className = 'wl'; layer.appendChild(el); labelEls.set(k, el); }
    v3.set(d.x, d.y, d.z).project(view.camera);
    const dist = view.camera.position.distanceTo(v3.set(d.x, d.y, d.z));
    if (dist > 24 || v3.set(d.x, d.y, d.z).project(view.camera).z > 1) { el.style.display = 'none'; continue; }
    el.style.display = '';
    if (el._html !== d.html) { el.innerHTML = d.html; el._html = d.html; }
    el.className = 'wl ' + d.cls;
    el.style.transform = `translate(-50%,-100%) translate(${(v3.x * 0.5 + 0.5) * w}px, ${(-v3.y * 0.5 + 0.5) * h}px)`;
  }
}

export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
