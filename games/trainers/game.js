/* Trainers: turn-based monster battles driven by editable trainer AIs (doctrine.js). Plain JS, no dependencies.
   Part 1: engine + AI planner (also runs in node for tests). Part 2: phone UI. */
(function (root) {
'use strict';
const D = root.TRDoctrine;
const R = D.RULES, LV = R.level, ROLLS = R.rolls;
const clone = D.clone;
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const calcStat = (b, hp) => hp ? Math.floor((2 * b + 31) * LV / 100) + LV + 10 : Math.floor((2 * b + 31) * LV / 100) + 5;
const stgM = (s) => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
const accM = (s) => s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
const CRIT = R.critStages, STAT_IC = R.statusIcon, STAT_NAME = R.statusName, IMMUNE = R.immune;
const rollAt = (i) => R.rollMin + (R.rollMax - R.rollMin) * i / (ROLLS - 1);

function mkMon(slot) {
  const d = D.DEX[slot.mon], st = {};
  for (const k of Object.keys(d.base)) st[k] = calcStat(d.base[k], k === 'hp');
  return { id: slot.mon, name: d.name, type: d.type, max: st.hp, hp: st.hp, st, moves: slot.moves.slice(), status: null, slp: 0, cnf: 0, stg: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0, crit: 0 } };
}
function mkSide(tr, n) { return { tr, team: tr.team.slice(0, n).map(mkMon), act: 0, bag: clone(tr.bag), used: 0, human: false }; }
function newBattle(trA, trB, o = {}) {
  const n = o.size || 3, seed = o.seed == null ? (Math.random() * 1e9) | 0 : o.seed;
  const wt = (t) => (o.team ? Object.assign({}, t, { team: o.team }) : t);
  return { n, seed, rng: mulberry(seed), sides: [mkSide(wt(trA), n), mkSide(wt(trB), n)], turn: 0, over: false, winner: -1, why: [], ev: [] };
}
const act = (S) => S.team[S.act];
const alive = (S) => S.team.some(m => m.hp > 0);
const speedOf = (m) => m.st.spe * stgM(m.stg.spe) * (m.status === 'par' ? R.parSpeed : 1);
const fainted = (S) => S.team.filter(m => m.hp <= 0).length;

// ---------------------------------------------------------------- hit math
function damage(att, def, mv, crit, roll) {
  const phys = mv.cat === 'phys';
  const ak = phys ? 'atk' : 'spa', dk = phys ? 'def' : 'spd';
  const as = crit ? Math.max(0, att.stg[ak]) : att.stg[ak], ds = crit ? Math.min(0, def.stg[dk]) : def.stg[dk];
  let A = att.st[ak] * stgM(as); const Dv = def.st[dk] * stgM(ds);
  if (phys && att.status === 'brn') A *= R.brnAtk;
  const pow = mv.pow * (mv.hex && def.status ? 2 : 1);
  const base = Math.floor(Math.floor(Math.floor(2 * LV / 5 + 2) * pow * A / Dv) / 50) + 2;
  const e = D.eff(mv.type, def.type);
  const mult = (mv.type && mv.type === att.type ? R.stab : 1) * e * (crit ? R.critMult : 1) * roll;
  return e === 0 ? 0 : Math.max(1, Math.floor(base * mult));
}
const hitChance = (att, def, mv) => mv.acc == null ? 1 : Math.min(1, mv.acc / 100 * accM(Math.max(-6, Math.min(6, att.stg.acc - def.stg.eva))));
const critChance = (att, mv) => CRIT[Math.min(3, mv.crit + att.stg.crit)];
// expected damage, KO chance (over the 16 rolls, crit or not, times accuracy)
function analyze(att, def, mv) {
  if (!mv.pow) return { exp: 0, ko: 0, hit: hitChance(att, def, mv), eff: D.eff(mv.type, def.type), cc: 0 };
  const hit = hitChance(att, def, mv), cc = critChance(att, mv);
  let exp = 0, ko = 0;
  for (const [crit, p] of [[false, 1 - cc], [true, cc]]) for (let i = 0; i < ROLLS; i++) {
    const d = damage(att, def, mv, crit, rollAt(i));
    exp += p * Math.min(d, def.hp) / ROLLS; if (d >= def.hp) ko += p / ROLLS;
  }
  return { exp: exp * hit, ko: ko * hit, hit, eff: D.eff(mv.type, def.type), cc };
}
function bestThreat(att, def) { let b = { exp: 0, ko: 0, mv: null }; for (const id of att.moves) { const a = analyze(att, def, D.MOVES[id]); if (a.exp > b.exp) b = Object.assign(a, { mv: id }); } return b; }
const canStatus = (m, s) => s === 'cnf' ? !m.cnf : !m.status && IMMUNE[s] !== m.type;

// ---------------------------------------------------------------- AI: list every legal action, score it, pick the max (+ personality noise)
const lg2 = (e) => e === 0 ? -3 : Math.log2(e);
function offense(x, f) { let b = -3; for (const id of x.moves) { const mv = D.MOVES[id]; if (mv.pow) b = Math.max(b, lg2(D.eff(mv.type, f.type)) + (mv.type === x.type ? 0.3 : 0)); } return b; }
function matchup(x, f) { return offense(x, f) - offense(f, x) + (speedOf(x) > speedOf(f) ? 0.4 : 0); }
const SV = { slp: 1, par: 0.6, psn: 0.6, brn: 0.5, cnf: 0.4 };
function statusValue(f, s, me) {
  if (!canStatus(f, s)) return 0;
  let v = SV[s];
  if (s === 'par' && speedOf(f) > speedOf(me)) v += 0.35;
  if (s === 'brn' && f.st.atk > f.st.spa) v += 0.4;
  return v * (0.35 + 0.65 * f.hp / f.max);
}
function plan(B, si, forceReplace) {
  const me = B.sides[si], foe = B.sides[1 - si], T = me.tr, W = T.score, P = T.pers, MP = T.movePri, SW = T.sw, IT = T.items;
  const a = act(me), f = act(foe), opts = [];
  const riskK = W.risk * (1 - P.risk);
  const add = (o) => opts.push(o);
  if (forceReplace) {
    me.team.forEach((c, i) => { if (c.hp > 0 && i !== me.act) add({ label: '→' + c.name, ch: { kind: 'switch', to: i }, s: W.match * matchup(c, f) * (0.5 + 0.5 * c.hp / c.max) + 10 * c.hp / c.max, why: [] }); });
    return choose(B, si, opts, true);
  }
  const th = bestThreat(f, a), riskPct = Math.min(100, th.exp / Math.max(1, a.hp) * 100), riskT = riskPct / 100 + 0.5 * th.ko;
  const foeFirst = (mv) => (mv.pri > 0 ? 0 : speedOf(f) > speedOf(a) ? 1 : speedOf(f) === speedOf(a) ? 0.5 : 0);
  const hpF = a.hp / a.max, mA = matchup(a, f);
  const phys = a.moves.some(id => D.MOVES[id].cat === 'phys'), spec = a.moves.some(id => D.MOVES[id].cat === 'spec');
  const maxPow = Math.max(...a.moves.map(id => D.MOVES[id].pow * (D.MOVES[id].type === a.type ? 1.5 : 1)));
  a.moves.forEach((id, i) => {
    const mv = D.MOVES[id], why = []; let s = 0;
    const ff = foeFirst(mv);
    if (mv.pow) {
      const an = analyze(a, f, mv), dPct = Math.min(100, an.exp / Math.max(1, f.hp) * 100);
      s += P.aggr * (W.dmg * dPct + W.ko * an.ko) + W.type * lg2(an.eff) + W.crit * an.cc * 10 - W.acc * (1 - an.hit) * 100 + MP.attack;
      if (mv.st) { const v = mv.st[1] * statusValue(f, mv.st[0], a) * an.hit; s += W.status * v; }
      if (mv.pri > 0 && ((th.ko > 0.4 && speedOf(f) >= speedOf(a)) || (an.ko > 0.4 && speedOf(f) >= speedOf(a)))) { s += W.prio + MP.priority; why.push('first strike'); }
      if (mv.pow * (mv.type === a.type ? 1.5 : 1) >= maxPow) s += MP.strongest;
      s -= riskK * riskT * (1 - an.ko * (1 - ff));
      if (an.ko > 0.3) why.push(`KO ${Math.round(an.ko * 100)}%`);
      if (an.eff > 1) why.push(`×${an.eff} type`); else if (an.eff < 1) why.push(`×${an.eff} type`);
      if (an.cc >= 0.5) why.push('crit');
      why.push(`~${Math.round(dPct)}% dmg`);
    } else {
      const hit = mv.acc == null ? 1 : hitChance(a, f, mv);
      if (mv.st) { const v = statusValue(f, mv.st[0], a) * hit; s += W.status * v + MP.status + (v ? 0 : -25); why.push(v ? `${STAT_IC[mv.st[0]]} ${STAT_NAME[mv.st[0]]}` : 'no effect'); }
      if (mv.boost || mv.drop) {
        let g = 0;
        for (const [k, b] of Object.entries(mv.boost || {})) {
          const cur = a.stg[k], room = Math.max(0, Math.min(6, cur + b) - cur);
          const rel = k === 'atk' ? +phys : k === 'spa' ? +spec : k === 'crit' ? (cur >= 2 ? 0 : 0.6) : k === 'spe' ? (speedOf(a) < speedOf(f) ? 0.9 : 0.3) : k === 'eva' ? 0.5 : k === 'def' ? (f.st.atk >= f.st.spa ? 0.8 : 0.3) : 0.6;
          g += room * rel / (1 + 0.4 * Math.max(0, cur));
        }
        for (const [k, b] of Object.entries(mv.drop || {})) g += Math.max(0, Math.min(-b, f.stg[k] + 6)) * 0.5 * hit;
        const v = g * hpF * (1 - Math.min(1, riskT));
        s += W.setup * v + MP.setup; why.push(g ? `setup +${Math.round(g * 10) / 10}` : 'maxed');
        if (!g) s -= 25;
      }
      if (mv.heal || mv.rest) {
        const amt = mv.rest ? a.max - a.hp : Math.min(a.max * mv.heal, a.max - a.hp), h = amt / a.max;
        let v = h * 2 + (mv.cure && a.status ? 0.5 : 0) + (mv.rest && a.status ? 0.5 : 0) - (mv.rest ? 0.45 : 0);
        s += W.heal * v + MP.heal; why.push(h > 0.05 ? `heal ${Math.round(h * 100)}%` : 'full HP');
        if (h < 0.05 && !(mv.cure && a.status)) s -= 30;
      }
      s -= riskK * riskT;
    }
    add({ label: mv.name, ch: { kind: 'move', i }, s, why });
  });
  // switches
  const trig = hpF <= SW.hp ? `HP ${Math.round(hpF * 100)}%` : mA <= -SW.bad ? 'bad matchup' : '';
  const boosted = Object.values(a.stg).reduce((x, y) => x + Math.max(0, y), 0) >= 2 && SW.keepBoosted;
  if (!SW.never) me.team.forEach((c, i) => {
    if (c.hp <= 0 || i === me.act) return;
    const mc = matchup(c, f), tIn = bestThreat(f, c), rIn = Math.min(100, tIn.exp / c.hp * 100) / 100 + 0.5 * tIn.ko;
    let s = W.match * (mc - mA) * (0.4 + 0.6 * c.hp / c.max) - riskK * rIn + (trig ? SW.bonus : -SW.penalty) - (boosted ? SW.penalty : 0);
    if (riskT > 0.9) s += riskK * 0.5 * riskT; // saves the active from a likely KO
    const why = [trig || 'no trigger', `match ${mc >= 0 ? '+' : ''}${Math.round(mc * 10) / 10}`];
    add({ label: 'Switch→' + c.name, ch: { kind: 'switch', to: i }, s, why });
  });
  // items
  if (me.used < IT.maxPerBattle) {
    const stayRisk = riskK * riskT;
    const potion = (k, at) => { if (me.bag[k] > 0 && hpF <= at && a.hp < a.max) { const h = Math.min(D.ITEMS[k].heal, a.max - a.hp) / a.max; add({ label: D.ITEMS[k].name, ch: { kind: 'item', item: k }, s: W.item * (0.4 + h * 2) - stayRisk * 0.6, why: [`HP ${Math.round(hpF * 100)}%`, `+${Math.round(h * 100)}%`] }); } };
    potion('potion', IT.healAt); potion('super', IT.superAt);
    if (me.bag.full > 0 && a.status && ((a.status === 'slp' && IT.fullHealSleep && a.slp >= 1) || (a.status !== 'slp' && IT.fullHealOther))) add({ label: 'Full Heal', ch: { kind: 'item', item: 'full' }, s: W.item * (a.status === 'slp' ? 1.2 : 0.8) - stayRisk * 0.6, why: [`${STAT_IC[a.status]} cure`] });
    if (me.bag.revive > 0 && IT.reviveAt > 0 && fainted(me) >= IT.reviveAt) {
      let bi = -1, bv = -1; me.team.forEach((c, i) => { if (c.hp <= 0) { const v = Object.values(D.DEX[c.id].base).reduce((x, y) => x + y, 0); if (v > bv) { bv = v; bi = i; } } });
      if (bi >= 0) add({ label: 'Revive ' + me.team[bi].name, ch: { kind: 'item', item: 'revive', target: bi }, s: W.item * 1.1 - stayRisk * 0.6, why: [`${fainted(me)} down`] });
    }
  }
  return choose(B, si, opts, false);
}
function gumbel(r) { return -Math.log(-Math.log(Math.max(1e-9, Math.min(1 - 1e-9, r())))); }
function choose(B, si, opts, replace) {
  const T = B.sides[si].tr, r = B.rng;
  for (const o of opts) o.p = o.s + T.pers.temp * gumbel(r);
  const sorted = opts.slice().sort((x, y) => y.p - x.p);
  const pick = sorted[0];
  const top = opts.slice().sort((x, y) => y.s - x.s).slice(0, 3);
  if (!B.noWhy) B.why.push({ turn: B.turn, side: si, name: T.name, icon: T.icon, mon: act(B.sides[si]).name, replace, pick: { label: pick.label, s: pick.s, why: pick.why }, top: top.map(o => ({ label: o.label, s: o.s, why: o.why })), random: top[0] !== pick });
  return pick.ch;
}
function whyLine(w) {
  const t = w.top.map(o => `${o.label} ${Math.round(o.s)}`).join(' > ');
  return `T${w.turn} ${w.name}${w.replace ? ' (replace)' : ''}: ${w.random ? `picked ${w.pick.label} ${Math.round(w.pick.s)} 🎲 · best ` : ''}${t}${w.pick.why.length ? ` (${w.pick.why.join(', ')})` : ''}`;
}

// ---------------------------------------------------------------- turn resolution
function snap(B) { return B.sides.map(S => ({ act: S.act, hp: S.team.map(m => m.hp), st: S.team.map(m => m.status), cnf: act(S).cnf, stg: Object.assign({}, act(S).stg), bag: Object.assign({}, S.bag) })); }
function ev(B, o) { if (!B.fast) o.snap = snap(B); B.ev.push(o); }
function setStatus(B, side, m, s, src) {
  if (!canStatus(m, s)) return false;
  if (s === 'cnf') m.cnf = R.cnfMin + Math.floor(B.rng() * (R.cnfMax - R.cnfMin + 1));
  else { m.status = s; if (s === 'slp') m.slp = R.sleepMin + Math.floor(B.rng() * (R.sleepMax - R.sleepMin + 1)); }
  ev(B, { t: 'status', side, mon: m.name, s, src }); return true;
}
function doMove(B, si, i) {
  const me = B.sides[si], foe = B.sides[1 - si], a = act(me), f = act(foe), mv = D.MOVES[a.moves[i]];
  if (a.hp <= 0) return;
  if (a.status === 'slp') {
    a.slp--; ev(B, { t: 'skip', side: si, mon: a.name, why: 'slp', left: a.slp });
    if (a.slp <= 0) { a.status = null; ev(B, { t: 'wake', side: si, mon: a.name }); }
    return;
  }
  if (a.status === 'par' && B.rng() < R.parSkip) { ev(B, { t: 'skip', side: si, mon: a.name, why: 'par' }); return; }
  if (a.cnf > 0) {
    a.cnf--;
    if (a.cnf === 0) ev(B, { t: 'snap', side: si, mon: a.name });
    else if (B.rng() < R.cnfSelf) { const d = damage(a, a, { pow: R.cnfPow, cat: 'phys', type: null }, false, R.rollMin + (R.rollMax - R.rollMin) * B.rng()); a.hp = Math.max(0, a.hp - d); ev(B, { t: 'self', side: si, mon: a.name, amt: d }); if (a.hp <= 0) ev(B, { t: 'faint', side: si, mon: a.name }); return; }
  }
  ev(B, { t: 'use', side: si, mon: a.name, move: mv.name, mid: a.moves[i], type: mv.type });
  const targetsFoe = mv.pow || mv.st || mv.drop;
  if (targetsFoe && f.hp > 0 && B.rng() >= hitChance(a, f, mv)) { ev(B, { t: 'miss', side: si, mon: a.name }); return; }
  if (mv.pow) {
    if (f.hp <= 0) return;
    const crit = B.rng() < critChance(a, mv), d = damage(a, f, mv, crit, rollAt(Math.floor(B.rng() * ROLLS)));
    f.hp = Math.max(0, f.hp - d);
    ev(B, { t: 'dmg', side: 1 - si, mon: f.name, amt: d, eff: D.eff(mv.type, f.type), crit });
    if (f.hp <= 0) { ev(B, { t: 'faint', side: 1 - si, mon: f.name }); return; }
    if (mv.st && B.rng() < mv.st[1]) setStatus(B, 1 - si, f, mv.st[0], mv.name);
    return;
  }
  if (mv.st) { if (f.hp > 0 && !setStatus(B, 1 - si, f, mv.st[0], mv.name)) ev(B, { t: 'fail', side: si, mon: a.name }); }
  if (mv.boost) for (const [k, b] of Object.entries(mv.boost)) { const o = a.stg[k]; a.stg[k] = Math.max(-6, Math.min(k === 'crit' ? R.critStageMax : R.stageMax, o + b)); ev(B, { t: 'boost', side: si, mon: a.name, k, d: a.stg[k] - o }); }
  if (mv.drop) for (const [k, b] of Object.entries(mv.drop)) { const o = f.stg[k]; f.stg[k] = Math.max(-6, o + b); ev(B, { t: 'boost', side: 1 - si, mon: f.name, k, d: f.stg[k] - o }); }
  if (mv.cure && a.status) { a.status = null; a.slp = 0; ev(B, { t: 'cure', side: si, mon: a.name }); }
  if (mv.heal) { const h = Math.min(a.max - a.hp, Math.round(a.max * mv.heal)); a.hp += h; ev(B, { t: 'heal', side: si, mon: a.name, amt: h }); }
  if (mv.rest) { const h = a.max - a.hp; a.hp = a.max; a.status = 'slp'; a.slp = R.restSleep; ev(B, { t: 'heal', side: si, mon: a.name, amt: h }); ev(B, { t: 'status', side: si, mon: a.name, s: 'slp', src: mv.name }); }
}
function doSwitch(B, si, to) {
  const S = B.sides[si], o = act(S);
  for (const k of Object.keys(o.stg)) o.stg[k] = 0; o.cnf = 0;
  S.act = to; ev(B, { t: 'switch', side: si, from: o.name, mon: act(S).name, id: act(S).id });
}
function doItem(B, si, ch) {
  const S = B.sides[si], a = act(S), it = ch.item;
  if (!(S.bag[it] > 0)) return;
  S.bag[it]--; S.used++;
  if (it === 'potion' || it === 'super') { const h = Math.min(D.ITEMS[it].heal, a.max - a.hp); a.hp += h; ev(B, { t: 'item', side: si, item: it, mon: a.name, amt: h }); }
  else if (it === 'full') { const s = a.status; a.status = null; a.slp = 0; a.cnf = 0; ev(B, { t: 'item', side: si, item: it, mon: a.name, s }); }
  else if (it === 'revive') { const m = S.team[ch.target]; if (m && m.hp <= 0) { m.hp = Math.floor(m.max * R.reviveFrac); m.status = null; ev(B, { t: 'item', side: si, item: it, mon: m.name, amt: m.hp }); } }
}
function legal(B, si) {
  const S = B.sides[si], a = act(S);
  return { moves: a.moves.map((id, i) => ({ i, id })), switches: S.team.map((m, i) => i).filter(i => i !== S.act && S.team[i].hp > 0), items: Object.keys(S.bag).filter(k => S.bag[k] > 0 && (k !== 'revive' || fainted(S) > 0) && (k !== 'full' || a.status)) };
}
// one full turn; choices[si] null = AI decides
function turn(B, choices = []) {
  if (B.over) return;
  B.turn++; B.ev = [];
  const ch = [0, 1].map(si => choices[si] || plan(B, si));
  const pr = (si) => { const c = ch[si]; if (c.kind !== 'move') return 10; return D.MOVES[act(B.sides[si]).moves[c.i]].pri; };
  const order = [0, 1].map(si => ({ si, p: pr(si), s: speedOf(act(B.sides[si])), r: B.rng() })).sort((x, y) => y.p - x.p || y.s - x.s || x.r - y.r).map(o => o.si);
  for (const si of order) {
    const c = ch[si];
    if (c.kind === 'switch') doSwitch(B, si, c.to);
    else if (c.kind === 'item') doItem(B, si, c);
    else doMove(B, si, c.i);
    if (!alive(B.sides[0]) || !alive(B.sides[1])) break;
  }
  // end of turn: poison and burn
  for (const si of [0, 1]) {
    const m = act(B.sides[si]);
    if (m.hp > 0 && (m.status === 'psn' || m.status === 'brn')) {
      const d = Math.max(1, Math.floor(m.max * (m.status === 'psn' ? R.psnFrac : R.brnFrac))); m.hp = Math.max(0, m.hp - d);
      ev(B, { t: 'dot', side: si, mon: m.name, s: m.status, amt: d }); if (m.hp <= 0) ev(B, { t: 'faint', side: si, mon: m.name });
    }
  }
  checkOver(B);
  return B.ev;
}
function checkOver(B) {
  const a0 = alive(B.sides[0]), a1 = alive(B.sides[1]);
  if (!a0 || !a1 || B.turn >= R.turnCap) {
    B.over = true;
    if (a0 && !a1) B.winner = 0; else if (a1 && !a0) B.winner = 1;
    else if (a0 && a1) { const hp = (S) => S.team.reduce((x, m) => x + m.hp / m.max, 0); const h0 = hp(B.sides[0]), h1 = hp(B.sides[1]); B.winner = h0 > h1 ? 0 : h1 > h0 ? 1 : -1; }
    else B.winner = -1;
    ev(B, { t: 'end', winner: B.winner });
  }
}
const needsReplace = (B, si) => !B.over && act(B.sides[si]).hp <= 0 && alive(B.sides[si]);
function replace(B, si, to) { if (to == null) to = plan(B, si, true).to; doSwitch(B, si, to); return to; }
// auto-play a whole AI battle (tests, tournament)
function runBattle(trA, trB, o = {}) {
  const B = newBattle(trA, trB, o); B.noWhy = !o.why; B.fast = !o.why;
  while (!B.over) { turn(B); for (const si of [0, 1]) if (needsReplace(B, si)) replace(B, si); }
  return B;
}
function tournament(trA, trB, n, o = {}) {
  const r = { n, w: [0, 0], draw: 0, turns: 0 };
  const base = o.seed == null ? 1000 : o.seed;
  for (let k = 0; k < n; k++) {
    // alternate sides so neither trainer always gets the speed tie-breaks; same seeds for every doctrine pair
    const flip = k % 2 === 1;
    const B = runBattle(flip ? trB : trA, flip ? trA : trB, { size: o.size || 3, seed: base + k, team: o.sameTeam ? trA.team : null });
    r.turns += B.turn;
    if (B.winner < 0) r.draw++; else r.w[(B.winner === 1) !== flip ? 1 : 0]++;
  }
  r.rate = r.w[0] / n; r.avgTurns = r.turns / n;
  return r;
}
root.TR = { D, R, CRIT, snap, LV, mulberry, calcStat, stgM, accM, damage, analyze, hitChance, critChance, bestThreat, matchup, plan, whyLine, newBattle, turn, legal, needsReplace, replace, runBattle, tournament, act, alive, speedOf, fainted, STAT_IC, STAT_NAME, mkMon };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---------------------------------------------------------------- Part 2: phone UI */
(function () {
'use strict';
if (typeof document === 'undefined') return;
const D = TRDoctrine, $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
let roster = D.load().doc;
const ui = Object.assign({ mode: 'ai', size: 3, a: 'ace', b: 'bugkid', n: 50, same: false, speed: 0 }, (() => { try { return JSON.parse(store.get('tr-ui', '{}')) || {}; } catch (e) { return {}; } })());
const saveUi = () => store.set('tr-ui', JSON.stringify(ui));
const trOf = (id) => roster.trainers[id] || roster.trainers[roster.order[0]];
const ST = { screen: 'home', B: null, q: [], playing: true, stepping: false, timer: null, sub: 'moves', view: [null, null], hist: [], tBusy: false };

// ---------------------------------------------------------------- original monster art (procedural, cached)
const artCache = {};
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const f = (x) => Math.max(0, Math.min(255, Math.round(x * k))); return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`; }
function art(id) {
  if (artCache[id]) return artCache[id];
  const d = D.DEX[id], L = d.look, col = D.TYPES[d.type].col, r = TR.mulberry(hash(id)), S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.scale(S / 100, S / 100); g.lineJoin = 'round'; g.lineWidth = 2.2; g.strokeStyle = '#1b1b1b';
  const rx = 26 + r() * 8, ry = 22 + r() * 7, cx = 50, cy = 62, hy = cy - ry * 0.55;
  const tri = (pts, fill) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fillStyle = fill; g.fill(); g.stroke(); };
  const ell = (x, y, a, b, fill, st = true) => { g.beginPath(); g.ellipse(x, y, a, b, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (st) g.stroke(); };
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(50, cy + ry + 3, rx * 0.95, 5, 0, 0, Math.PI * 2); g.fill();
  if (L.wings) { for (const s of [-1, 1]) { g.save(); g.translate(cx + s * rx * 0.7, cy - ry * 0.4); g.rotate(s * -0.6); ell(0, -10, 11, 22, shade(col, 1.25)); g.restore(); } }
  if (L.tail) { g.beginPath(); g.moveTo(cx + rx * 0.8, cy + 4); g.quadraticCurveTo(cx + rx + 16, cy - 2, cx + rx + 10, cy - 22); g.lineWidth = 6; g.strokeStyle = '#1b1b1b'; g.stroke(); g.lineWidth = 3.5; g.strokeStyle = shade(col, 0.9); g.stroke(); g.lineWidth = 2.2; g.strokeStyle = '#1b1b1b'; ell(cx + rx + 10, cy - 24, 5, 6, d.type === 'flame' ? '#ffd23a' : shade(col, 1.3)); }
  if (L.fin) tri([cx + 2, cy - ry + 2, cx + 14, cy - ry - 16, cx + 20, cy - ry + 6], shade(col, 0.8));
  if (L.shell) { g.beginPath(); g.arc(cx + 4, cy - 2, rx * 0.95, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fillStyle = shade(col, 0.65); g.fill(); g.stroke(); }
  // feet + body + belly
  for (const s of [-1, 1]) ell(cx + s * rx * 0.55, cy + ry * 0.85, 8, 5, shade(col, 0.7));
  ell(cx, cy, rx, ry, col);
  ell(cx - 3, cy + ry * 0.25, rx * 0.55, ry * 0.55, shade(col, 1.35), false);
  if (L.spikes) for (let i = 0; i < 4; i++) { const x = cx - 8 + i * 9; tri([x - 4, cy - ry * 0.92 + Math.abs(i - 1.5) * 1.5, x, cy - ry - 9, x + 4, cy - ry * 0.92 + Math.abs(i - 1.5) * 1.5], shade(col, 0.6)); }
  if (L.ears) for (const s of [-1, 1]) tri([cx + s * 6 - 8, hy - 6, cx + s * 14 - 8, hy - 24, cx + s * 20 - 8, hy - 2], shade(col, 0.85));
  if (L.horn) tri([cx - 16, hy - 6, cx - 12, hy - 24, cx - 7, hy - 7], '#f3ecd6');
  if (L.leaf) { g.save(); g.translate(cx - 8, hy - 8); g.rotate(-0.5); ell(0, -8, 6, 12, '#7fd65a'); g.restore(); }
  if (L.cap) { g.beginPath(); g.ellipse(cx, cy - ry * 0.55, rx * 1.1, ry * 0.75, 0, Math.PI, 0); g.closePath(); g.fillStyle = '#d14f8f'; g.fill(); g.stroke(); for (const [x, y] of [[-12, -8], [6, -14], [16, -5]]) ell(cx + x, cy - ry * 0.55 + y, 3.5, 3, '#fff3fa', false); }
  // face: looks left
  const ex = cx - rx * 0.42, ey = cy - ry * 0.18;
  for (const dx of [0, 13]) { ell(ex + dx, ey, 5.5, 6.5, '#fff'); ell(ex + dx - 1.6, ey + 0.5, 2.6, 3.4, '#151515', false); ell(ex + dx - 2.6, ey - 1.6, 1, 1, '#fff', false); }
  g.beginPath(); g.moveTo(ex - 2, ey + 12); g.quadraticCurveTo(ex + 6, ey + 16, ex + 14, ey + 12); g.stroke();
  if (L.teeth) { tri([ex + 1, ey + 12.6, ex + 3, ey + 17, ex + 5, ey + 13.3], '#fff'); tri([ex + 9, ey + 13.3, ex + 11, ey + 17, ex + 13, ey + 12.6], '#fff'); }
  // type mark on the belly
  g.font = '12px system-ui'; g.textAlign = 'center'; g.fillText(D.TYPES[d.type].icon, cx + rx * 0.3, cy + ry * 0.55);
  return (artCache[id] = c.toDataURL());
}
window.TRArt = art;
// ---------------------------------------------------------------- wiki overlay (game + editor): opens wiki.html#<route> in a sheet so nothing is lost
const WIKI_CSS = `#wikiOv { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.6); display: flex; flex-direction: column; padding: calc(10px + env(safe-area-inset-top, 0px)) env(safe-area-inset-right, 0px) 0 env(safe-area-inset-left, 0px); }
#wikiOv .wkb { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: #262c1b; border: 2px solid #55603a; border-bottom: none; border-radius: 16px 16px 0 0; }
#wikiOv .wkb b { flex: 1; font-size: 16px; } #wikiOv .wkb a, #wikiOv .wkb button { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; border: 2px solid #55603a; border-radius: 12px; background: #3a4229; color: #eef0e2; text-decoration: none; font: 700 16px system-ui, sans-serif; }
#wikiOv iframe { flex: 1; width: 100%; border: 2px solid #55603a; border-top: none; background: #1f2416; }
[data-wiki] { cursor: pointer; }`;
const wikiHooks = {};
function openWiki(h) {
  let o = document.getElementById('wikiOv');
  if (!o) {
    const st = document.createElement('style'); st.textContent = WIKI_CSS; document.head.appendChild(st);
    o = document.createElement('div'); o.id = 'wikiOv'; o.hidden = true;
    o.innerHTML = '<div class="wkb"><button id="wkX" aria-label="Close wiki">✕</button><b>📖 Wiki</b><a id="wkFull" href="wiki.html" aria-label="Open the full wiki">↗</a></div><iframe id="wkF" title="Wiki"></iframe>';
    document.body.appendChild(o);
    o.querySelector('#wkX').addEventListener('click', (e) => { e.stopPropagation(); closeWiki(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWiki(); });
  }
  o.querySelector('#wkF').src = 'wiki.html?embed=1#' + h;
  o.querySelector('#wkFull').href = 'wiki.html#' + h;
  o.hidden = false;
  if (wikiHooks.open) wikiHooks.open();
}
function closeWiki() { const o = document.getElementById('wikiOv'); if (!o || o.hidden) return; o.hidden = true; o.querySelector('#wkF').src = 'about:blank'; if (wikiHooks.close) wikiHooks.close(); }
const MOVE_BY_NAME = {}, MON_BY_NAME = {};
for (const id of D.MOVE_IDS) MOVE_BY_NAME[D.MOVES[id].name] = id;
for (const id of D.MON_IDS) MON_BY_NAME[D.DEX[id].name] = id;
// a Why-log option label ("Tide Lash", "Switch→Flarelynx", "Revive Sparkit", "Potion") -> wiki route
function wikiFor(label) {
  if (MOVE_BY_NAME[label]) return 'move/' + MOVE_BY_NAME[label];
  const m = /(?:→|Revive )(.+)$/.exec(label); if (m && MON_BY_NAME[m[1]]) return 'monster/' + MON_BY_NAME[m[1]];
  if (MON_BY_NAME[label]) return 'monster/' + MON_BY_NAME[label];
  return 'rules';
}
window.TRWiki = Object.assign(openWiki, { close: closeWiki, hooks: wikiHooks, wikiFor });
if (!document.getElementById('home')) return; // editor / wiki page: art + engine + wiki overlay only
const tIc = (t) => (t ? D.TYPES[t].icon : '⭘');
const tCol = (t) => (t ? D.TYPES[t].col : '#9aa088');

// ---------------------------------------------------------------- screens
function show(scr) {
  ST.screen = scr;
  for (const s of ['home', 'battle', 'tourn']) $(s).hidden = s !== scr;
  $('bHome').hidden = scr === 'home';
  document.body.dataset.scr = scr;
}
function trRow(t, side, on) {
  return `<button class="trr${on ? ' on' : ''}" data-pick="${side}:${esc(t.id)}"><span class="tic">${esc(t.icon)}</span><span class="t"><b>${esc(t.name)}</b><span class="tm">${t.team.slice(0, ui.size).map(s => `<img src="${art(s.mon)}" alt="">`).join('')}</span></span>${on ? '<span class="ck">✔</span>' : ''}</button>`;
}
function renderHome() {
  roster = D.load().doc;
  if (!roster.trainers[ui.a]) ui.a = roster.order[0];
  if (!roster.trainers[ui.b]) ui.b = roster.order[1] || roster.order[0];
  const M = [['ai', '⚔', 'AI vs AI', 'watch two trainers'], ['you', '🎮', 'You vs AI', 'you tap the moves'], ['tourn', '🏆', 'Tournament', 'many battles, win rate']];
  $('home').innerHTML = `<div class="cols"><div>
    <div class="lbl">Mode</div><div class="list">${M.map(([k, ic, t, s]) => `<button class="mrow${ui.mode === k ? ' on' : ''}" data-mode="${k}"><span class="tic">${ic}</span><span class="t"><b>${t}</b><small>${s}</small></span>${ui.mode === k ? '<span class="ck">✔</span>' : ''}</button>`).join('')}</div>
    <div class="lbl">Team size</div><div class="seg">${[3, 6].map(n => `<button class="${ui.size === n ? 'on' : ''}" data-size="${n}">${n} v ${n}</button>`).join('')}</div>
    <a class="edl" href="editor.html">🛠 Train the trainers (editor)</a><a class="edl" href="wiki.html">📖 Wiki: monsters, moves, types, rules</a></div>
    <div><div class="lbl">🔵 ${ui.mode === 'you' ? 'You play' : 'Blue trainer'}</div><div class="list">${roster.order.map(id => trRow(trOf(id), 'a', ui.a === id)).join('')}</div></div>
    <div><div class="lbl">🔴 Red trainer</div><div class="list">${roster.order.map(id => trRow(trOf(id), 'b', ui.b === id)).join('')}</div></div></div>`;
  $('bar').innerHTML = `<button id="bStart" class="go">${ui.mode === 'tourn' ? '🏆 Open tournament' : '▶ Battle!'}</button>`;
  show('home');
}

// ---------------------------------------------------------------- battle
const SPEEDS = [0.5, 1, 2, 4, 8, 16];
const spd = () => SPEEDS[Math.max(0, Math.min(5, ui.speed + 1))];
function startBattle(o = {}) {
  roster = D.load().doc;
  clearTimeout(ST.timer);
  const B = TR.newBattle(trOf(ui.a), trOf(ui.b), { size: ui.size, seed: o.seed });
  ST.B = B; ST.q = []; ST.human = ui.mode === 'you'; ST.playing = true; ST.stepping = false; ST.sub = 'moves'; ST.view = [null, null];
  B.sides[0].human = ST.human;
  $('battle').innerHTML = `<div id="field">${[1, 0].map(si => `<div class="side s${si}" id="side${si}"><div class="card"><div class="ch"><span class="tn">${esc(B.sides[si].tr.icon)}</span><b class="mn"></b><span class="sx"></span></div><div class="hp"><i></i></div><div class="cf"><span class="pips"></span><span class="hpn"></span></div><div class="stg"></div></div><div class="spr"><img alt=""><div class="fl"></div></div></div>`).join('')}<div id="nar"></div><div id="turnN"></div><button id="bExit" aria-label="Home">🏠</button></div><div id="panel"></div><div id="endOv" hidden></div>`;
  show('battle');
  drawSides(TR.snap(B)); renderPanel();
  if (!ST.human) schedule(500); else renderPanel();
}
function drawSides(snap) {
  const B = ST.B;
  for (const si of [0, 1]) {
    const sn = snap[si], S = B.sides[si], m = S.team[sn.act], el = $('side' + si), hp = sn.hp[sn.act], pct = Math.max(0, hp / m.max * 100);
    const img = el.querySelector('img');
    if (ST.view[si] !== sn.act) { img.src = art(m.id); img.classList.remove('faint'); img.classList.remove('enter'); void img.offsetWidth; img.classList.add('enter'); ST.view[si] = sn.act; }
    if (hp > 0) img.classList.remove('faint');
    el.querySelector('.mn').textContent = m.name; el.querySelector('.card').dataset.wiki = 'monster/' + m.id; img.dataset.wiki = 'monster/' + m.id;
    const st = sn.st[sn.act];
    el.querySelector('.sx').textContent = `${tIc(m.type)}${st ? ' ' + TR.STAT_IC[st] : ''}${sn.cnf ? ' 💫' : ''}`;
    const bar = el.querySelector('.hp i'); bar.style.width = pct + '%'; bar.style.background = pct > 50 ? '#5fd35a' : pct > 20 ? '#f2c933' : '#ef5a4a';
    el.querySelector('.hpn').textContent = `${hp}/${m.max}`;
    el.querySelector('.pips').innerHTML = S.team.map((x, i) => `<i class="${sn.hp[i] <= 0 ? 'dead' : sn.st[i] ? 'sick' : ''}${i === sn.act ? ' cur' : ''}"></i>`).join('');
    const stg = Object.entries(sn.stg).filter(([, v]) => v);
    el.querySelector('.stg').innerHTML = stg.map(([k, v]) => `<span class="${v > 0 ? 'up' : 'dn'}">${v > 0 ? '⬆' : '⬇'}${k.toUpperCase()}${Math.abs(v) > 1 ? Math.abs(v) : ''}</span>`).join('');
  }
  $('turnN').textContent = 'T' + B.turn;
}
function float(si, txt, cls) {
  const box = $('side' + si) && $('side' + si).querySelector('.fl'); if (!box) return;
  const d = document.createElement('div'); d.className = 'ft ' + (cls || ''); d.textContent = txt;
  d.style.left = (30 + Math.random() * 40) + '%'; d.style.animationDuration = Math.max(0.5, 1.3 / Math.sqrt(spd())) + 's';
  box.appendChild(d); setTimeout(() => d.remove(), 1600);
}
function nar(t) { const n = $('nar'); n.textContent = t; delete n.dataset.wiki; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); }
function sprFx(si, cls) { const img = $('side' + si) && $('side' + si).querySelector('img'); if (!img) return; img.classList.remove(cls); void img.offsetWidth; img.classList.add(cls); }
const KEYN = { atk: 'ATK', def: 'DEF', spa: 'SpA', spd: 'SpD', spe: 'SPD', acc: 'ACC', eva: 'EVA', crit: 'CRIT' };
function applyEv(e) {
  ST.evCount = (ST.evCount || 0) + 1;
  if (e.t === 'use') { nar(`${tIc(e.type)} ${e.mon}: ${e.move} 📖`); $('nar').dataset.wiki = 'move/' + e.mid; sprFx(e.side, 'lunge'); }
  if (e.snap) drawSides(e.snap);
  switch (e.t) {
    case 'dmg': float(e.side, '−' + e.amt, 'dmg'); if (e.crit) float(e.side, 'CRIT!', 'crit'); if (e.eff > 1) float(e.side, '×' + e.eff + '!', 'sup'); else if (e.eff === 0) float(e.side, '✖ 0', 'weak'); else if (e.eff < 1) float(e.side, '×½', 'weak'); sprFx(e.side, 'hit'); break;
    case 'miss': float(1 - e.side, 'MISS', 'weak'); break;
    case 'skip': float(e.side, e.why === 'slp' ? '💤 zzz' : '⚡ stuck', 'st'); ST.sleepSkips = (ST.sleepSkips || 0) + (e.why === 'slp' ? 1 : 0); nar(`${e.mon} ${e.why === 'slp' ? '💤' : '⚡✖'}`); break;
    case 'wake': case 'snap': float(e.side, '👀', 'st'); break;
    case 'status': float(e.side, TR.STAT_IC[e.s] + '!', 'st'); break;
    case 'heal': if (e.amt) float(e.side, '+' + e.amt, 'heal'); break;
    case 'dot': float(e.side, TR.STAT_IC[e.s] + ' −' + e.amt, 'dmg'); break;
    case 'self': float(e.side, '💫 −' + e.amt, 'dmg'); sprFx(e.side, 'hit'); break;
    case 'boost': if (e.d) float(e.side, (e.d > 0 ? '⬆' : '⬇') + KEYN[e.k], e.d > 0 ? 'heal' : 'weak'); else float(e.side, '—', 'weak'); break;
    case 'switch': nar(`↩ ${e.mon}`); break;
    case 'item': float(e.side, D.ITEMS[e.item].icon + (e.amt ? ' +' + e.amt : ''), 'heal'); nar(`${D.ITEMS[e.item].icon} ${D.ITEMS[e.item].name}`); ST.itemsSeen = (ST.itemsSeen || []).concat([{ side: e.side, item: e.item }]); break;
    case 'fail': float(e.side, '✖', 'weak'); break;
    case 'cure': float(e.side, '✨', 'heal'); break;
    case 'faint': sprFx(e.side, 'faint'); float(e.side, '✖ out', 'dmg'); break;
  }
}
const evDelay = (e) => ({ use: 520, dmg: 620, faint: 700, switch: 600, status: 520, boost: 420, item: 600, skip: 620, end: 200 }[e.t] || 420) / spd();
function schedule(ms) { clearTimeout(ST.timer); ST.timer = setTimeout(pump, ms); }
function pump() {
  const B = ST.B; if (!B || ST.screen !== 'battle') return;
  const go = ST.playing || ST.stepRun;
  if (ST.q.length) { if (!go) return; const e = ST.q.shift(); applyEv(e); schedule(evDelay(e)); return; }
  if (B.over) { ST.stepRun = false; showEnd(); return; }
  for (const si of [0, 1]) if (TR.needsReplace(B, si)) {
    if (ST.human && si === 0) { ST.sub = 'replace'; renderPanel(); return; }
    if (!go) return;
    B.ev = []; TR.replace(B, si); ST.q.push(...B.ev); schedule(250 / spd()); return;
  }
  ST.stepRun = false;
  if (ST.human) { ST.sub = 'moves'; renderPanel(); return; }
  if (!ST.playing) { renderPanel(); return; }
  doTurn(null);
}
// ⏭ while paused: finish what is on screen instantly, then play exactly one new turn
function stepTurn() {
  const B = ST.B; if (!B || ST.playing || B.over) return;
  clearTimeout(ST.timer);
  const flush = () => { while (ST.q.length) applyEv(ST.q.shift()); };
  flush();
  for (const si of [0, 1]) if (TR.needsReplace(B, si)) { B.ev = []; TR.replace(B, si); ST.q.push(...B.ev); flush(); }
  if (B.over) { showEnd(); return; }
  TR.turn(B); ST.q.push(...B.ev); ST.stepRun = true;
  if ($('live')) $('live').innerHTML = liveWhy();
  schedule(10);
}
function doTurn(choice) {
  const B = ST.B;
  TR.turn(B, [choice, null]); ST.q.push(...B.ev);
  if ($('live')) $('live').innerHTML = liveWhy();
  if (ST.human) { ST.sub = 'wait'; renderPanel(); }
  schedule(80);
}
function renderPanel() {
  const B = ST.B, p = $('panel'); if (!B) return;
  if (!ST.human) {
    p.innerHTML = `<div class="ctl"><button id="bPlay" class="${ST.playing ? '' : 'go'}" aria-label="${ST.playing ? 'Pause' : 'Play'}">${ST.playing ? '⏸' : '▶'}</button><button id="bStep" ${ST.playing ? 'disabled' : ''} aria-label="Step one turn">⏭</button><label class="spd">🐢<input id="spd" type="range" min="-1" max="4" step="1" value="${ui.speed}" aria-label="Speed">🐇<b>×${spd()}</b></label><button id="bWhy" aria-label="Why log">🧠</button></div><div id="live">${liveWhy()}</div>`;
    return;
  }
  const S = B.sides[0], a = TR.act(S), f = TR.act(B.sides[1]);
  if (ST.sub === 'wait') { p.innerHTML = `<div class="ctl"><span class="hint grow">…</span><label class="spd">🐢<input id="spd" type="range" min="-1" max="4" step="1" value="${ui.speed}" aria-label="Speed">🐇<b>×${spd()}</b></label><button id="bWhy" aria-label="Why log">🧠</button></div>`; return; }
  if (ST.sub === 'replace' || ST.sub === 'switch') {
    p.innerHTML = `<div class="ph">${ST.sub === 'replace' ? '↩ Pick the next one' : '↩ Switch to'}${ST.sub === 'switch' ? '<button id="bBack" class="sm">✕</button>' : ''}</div><div class="bench">${S.team.map((m, i) => { const pc = m.hp / m.max * 100; return `<button class="bm" data-sw="${i}" ${m.hp <= 0 || i === S.act ? 'disabled' : ''}><img src="${art(m.id)}" alt=""><span class="t"><b>${tIc(m.type)} ${esc(m.name)}${m.status ? ' ' + TR.STAT_IC[m.status] : ''}</b><span class="hp"><i style="width:${pc}%;background:${pc > 50 ? '#5fd35a' : pc > 20 ? '#f2c933' : '#ef5a4a'}"></i></span></span><span class="m">${D.eff(D.DEX[m.id].type, f.type) > 1 ? '▲' : ''}</span></button>`; }).join('')}</div>`;
    return;
  }
  if (ST.sub === 'bag' || ST.sub === 'revive') {
    if (ST.sub === 'revive') { p.innerHTML = `<div class="ph">💖 Revive who?<button id="bBack" class="sm">✕</button></div><div class="bench">${S.team.map((m, i) => m.hp <= 0 ? `<button class="bm" data-rev="${i}"><img src="${art(m.id)}" alt="" class="gray"><span class="t"><b>${esc(m.name)}</b></span></button>` : '').join('')}</div>`; return; }
    const L = TR.legal(B, 0).items;
    p.innerHTML = `<div class="ph">🎒 Bag<button id="bBack" class="sm">✕</button></div><div class="items">${Object.keys(D.ITEMS).map(k => `<button class="it" data-item="${k}" ${L.includes(k) ? '' : 'disabled'}><span class="ic">${D.ITEMS[k].icon}</span><b>${D.ITEMS[k].name}</b><span class="cnt">×${S.bag[k] || 0}</span></button>`).join('')}</div>`;
    return;
  }
  p.innerHTML = `<div class="moves">${a.moves.map((id, i) => {
    const mv = D.MOVES[id], e = mv.pow ? D.eff(mv.type, f.type) : 1;
    const tag = mv.pow ? (e === 0 ? '✖' : e > 1 ? '▲▲' : e < 1 ? '▼' : '') : mv.st ? TR.STAT_IC[mv.st[0]] : mv.heal || mv.rest ? '❤' : mv.boost ? '⬆' : '⬇';
    return `<button class="mv" data-mv="${i}" style="--tc:${tCol(mv.type)}"><span class="ic">${tIc(mv.type)}</span><span class="t"><b>${esc(mv.name)}</b><small>${mv.pow ? '💥' + mv.pow : ''}${mv.acc && mv.acc < 100 ? ' 🎯' + mv.acc : ''}${mv.pri ? ' ⚡+' + mv.pri : ''}</small></span><span class="eff">${tag}</span></button>`;
  }).join('')}</div><div class="ctl"><button id="bSwitch">↩ Switch</button><button id="bBag">🎒 Bag</button><button id="bWhy" aria-label="Why log">🧠</button></div>`;
}
function liveWhy() {
  const B = ST.B; if (!B) return '';
  const rows = B.why.slice(-6).reverse();
  return rows.length ? `<div class="lbl">🧠 Latest choices</div><div class="why">${rows.map(w => `<div class="wr s${w.side}"><span class="wt">T${w.turn}</span><span class="wi">${esc(w.icon)}</span><div class="wb"><div class="wl">${w.top.map(o => `<button class="wk${o.label === w.pick.label ? ' pk' : ''}" data-wiki="${wikiFor(o.label)}">${esc(o.label)} <b>${Math.round(o.s)}</b></button>`).join('<i>›</i>')}</div></div></div>`).join('')}</div>` : '';
}
function showEnd() {
  const B = ST.B, w = B.winner, o = $('endOv');
  const who = w < 0 ? '🤝 Draw' : `${esc(B.sides[w].tr.icon)} ${esc(B.sides[w].tr.name)}${ST.human ? (w === 0 ? ' — you win!' : '') : ''}`;
  o.innerHTML = `<div class="eb"><div class="big">${w < 0 ? '🤝' : '🏆'}</div><h2>${who}</h2><p class="hint">${B.turn} turns · ${B.sides.map(S => S.team.filter(m => m.hp > 0).length).join(' – ')} left</p><div class="acts"><button id="bWhy2" class="go">🧠 Why</button><button id="bAgain">🔁 Again</button><button id="bHome2">🏠</button></div></div>`;
  o.hidden = false; $('panel').innerHTML = '';
}
function whyHTML(B) {
  const rows = B.why;
  if (!rows.length) return '<p class="hint">No AI decisions yet.</p>';
  return `<div class="why">${rows.map(w => `<div class="wr s${w.side}"><span class="wt">T${w.turn}</span><span class="wi">${esc(w.icon)}</span><div class="wb"><div class="wl">${w.top.map((o, k) => `<button class="wk${o.label === w.pick.label ? ' pk' : ''}" data-wiki="${wikiFor(o.label)}">${esc(o.label)} <b>${Math.round(o.s)}</b></button>`).join('<i>›</i>')}${w.random ? ` <span class="rnd">🎲 ${esc(w.pick.label)}</span>` : ''}</div><small><button class="wk mon" data-wiki="${wikiFor(w.mon)}">${tIc(D.DEX[MON_BY_NAME[w.mon]] ? D.DEX[MON_BY_NAME[w.mon]].type : null)} ${esc(w.mon)}</button>${w.replace ? ' fainted' : ''}${w.pick.why.length ? ' · ' + esc(w.pick.why.join(', ')) : ''}</small></div></div>`).join('')}</div>`;
}
function openWhy() {
  const B = ST.B; if (!B) return;
  $('ovBox').innerHTML = `<div class="ovh"><h3>🧠 Why (${B.why.length} AI choices)</h3><button id="bOvX">✕</button></div><p class="hint">Top 3 scored options each turn. Highlighted = picked. 🎲 = personality noise picked another one. Tap a move or monster for its 📖 wiki page.</p>${whyHTML(B)}<textarea id="whyTxt" readonly aria-label="Why log as text">${esc(B.why.map(TR.whyLine).join('\n'))}</textarea>`;
  $('ov').hidden = false;
}

// ---------------------------------------------------------------- tournament
function renderTourn(res) {
  const A = trOf(ui.a), Bt = trOf(ui.b);
  $('tourn').innerHTML = `<div class="vs"><span>${esc(A.icon)} <b>${esc(A.name)}</b></span><i>vs</i><span>${esc(Bt.icon)} <b>${esc(Bt.name)}</b></span></div>
    <div class="lbl">Battles</div><div class="seg">${[10, 50, 200].map(n => `<button class="${ui.n === n ? 'on' : ''}" data-tn="${n}">${n}</button>`).join('')}</div>
    <div class="lbl">Team size</div><div class="seg">${[3, 6].map(n => `<button class="${ui.size === n ? 'on' : ''}" data-tsize="${n}">${n} v ${n}</button>`).join('')}</div>
    <div class="tg"><button class="sw${ui.same ? ' on' : ''}" id="tSame" aria-label="Same team for both" aria-pressed="${ui.same}"></button><span>Both use the blue team<br><small class="hint">tests the logic only, not the teams</small></span></div>
    <div id="tProg" class="prog" hidden><i></i></div><div id="tRes">${res ? resHTML(res) : ''}</div>
    ${ST.hist.length ? `<div class="lbl">Earlier runs</div><div class="list">${ST.hist.map(h => `<div class="hr"><span>${esc(h.a)} <b>${Math.round(h.rate * 100)}%</b> vs ${esc(h.b)}</span><small>${h.n}× ${h.size}v${h.size}${h.same ? ' same team' : ''}</small></div>`).join('')}</div>` : ''}`;
  $('bar').innerHTML = `<button id="bRun" class="go">🏆 Run ${ui.n} battles</button>`;
  show('tourn');
}
function resHTML(r) {
  const pa = Math.round(r.w[0] / r.n * 100), pd = Math.round(r.draw / r.n * 100), pb = 100 - pa - pd;
  return `<div class="res"><div class="wbar"><i class="a" style="width:${pa}%">${pa}%</i><i class="d" style="width:${pd}%"></i><i class="b" style="width:${pb}%">${pb}%</i></div><div class="row3"><span>${esc(r.ai)} ${r.w[0]} wins</span><span>${r.draw} draws</span><span>${r.w[1]} wins ${esc(r.bi)}</span></div><p class="hint">${r.n} battles · ${r.avgTurns.toFixed(1)} turns each on average</p></div>`;
}
function runTourn(n) {
  if (ST.tBusy) return Promise.resolve(null);
  roster = D.load().doc;
  const A = trOf(ui.a), Bt = trOf(ui.b); n = n || ui.n;
  ST.tBusy = true; $('tProg').hidden = false; $('bRun').disabled = true;
  const tot = { n: 0, w: [0, 0], draw: 0, turns: 0 }, seed = (Math.random() * 1e6) | 0;
  return new Promise((res) => {
    const chunk = () => {
      const k = Math.min(n - tot.n, 10);
      const r = TR.tournament(A, Bt, k, { size: ui.size, sameTeam: ui.same, seed: seed + tot.n * 7 });
      tot.n += k; tot.w[0] += r.w[0]; tot.w[1] += r.w[1]; tot.draw += r.draw; tot.turns += r.turns;
      if ($('tProg')) $('tProg').firstChild.style.width = (tot.n / n * 100) + '%';
      if (tot.n < n) { setTimeout(chunk, 0); return; }
      const out = Object.assign(tot, { rate: tot.w[0] / n, avgTurns: tot.turns / n, ai: A.icon + ' ' + A.name, bi: Bt.icon + ' ' + Bt.name });
      ST.hist.unshift({ a: A.name, b: Bt.name, rate: out.rate, n, size: ui.size, same: ui.same }); ST.hist = ST.hist.slice(0, 8);
      ST.tBusy = false; ST.lastT = out; renderTourn(out); res(out);
    };
    setTimeout(chunk, 30);
  });
}

// ---------------------------------------------------------------- input
function bind() {
  document.addEventListener('click', (e) => {
    const wk = e.target.closest('[data-wiki]'); if (wk) { openWiki(wk.dataset.wiki); return; }
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (b.id === 'bHome' || b.id === 'bHome2' || b.id === 'bExit') { clearTimeout(ST.timer); ST.B = null; $('bar').hidden = false; $('ov').hidden = true; renderHome(); return; }
    if (d.mode) { ui.mode = d.mode; saveUi(); renderHome(); return; }
    if (d.size) { ui.size = +d.size; saveUi(); renderHome(); return; }
    if (d.pick) { const [s, id] = d.pick.split(':'); ui[s] = id; saveUi(); renderHome(); return; }
    if (b.id === 'bStart') { if (ui.mode === 'tourn') renderTourn(); else { $('bar').hidden = true; startBattle(); } return; }
    if (b.id === 'bPlay') { ST.playing = !ST.playing; renderPanel(); if (ST.playing) schedule(50); return; }
    if (b.id === 'bStep') { stepTurn(); return; }
    if (b.id === 'bWhy' || b.id === 'bWhy2') { openWhy(); return; }
    if (b.id === 'bOvX') { $('ov').hidden = true; return; }
    if (b.id === 'bAgain') { startBattle(); return; }
    if (d.mv !== undefined && ST.human && ST.sub === 'moves') { doTurn({ kind: 'move', i: +d.mv }); return; }
    if (b.id === 'bSwitch') { ST.sub = 'switch'; renderPanel(); return; }
    if (b.id === 'bBag') { ST.sub = 'bag'; renderPanel(); return; }
    if (b.id === 'bBack') { ST.sub = 'moves'; renderPanel(); return; }
    if (d.sw !== undefined) {
      const to = +d.sw;
      if (ST.sub === 'replace') { ST.B.ev = []; TR.replace(ST.B, 0, to); ST.q.push(...ST.B.ev); ST.sub = 'wait'; renderPanel(); schedule(50); }
      else doTurn({ kind: 'switch', to });
      return;
    }
    if (d.item) { if (d.item === 'revive') { ST.sub = 'revive'; renderPanel(); } else doTurn({ kind: 'item', item: d.item }); return; }
    if (d.rev !== undefined) { doTurn({ kind: 'item', item: 'revive', target: +d.rev }); return; }
    if (d.tn) { ui.n = +d.tn; saveUi(); renderTourn(ST.lastT); return; }
    if (d.tsize) { ui.size = +d.tsize; saveUi(); renderTourn(ST.lastT); return; }
    if (b.id === 'tSame') { ui.same = !ui.same; saveUi(); renderTourn(ST.lastT); return; }
    if (b.id === 'bRun') { runTourn(); return; }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'spd') { ui.speed = +e.target.value; saveUi(); const l = e.target.parentElement.querySelector('b'); if (l) l.textContent = '×' + spd(); } });
  $('ov').addEventListener('click', (e) => { if (e.target.id === 'ov') $('ov').hidden = true; });
  const orient = () => document.body.classList.toggle('land', innerWidth > innerHeight);
  addEventListener('resize', orient); orient();
  addEventListener('pageshow', () => { if (ST.screen === 'home') renderHome(); });
}
bind(); renderHome();
// pause AI vs AI while the wiki sheet is open
wikiHooks.open = () => { if (ST.B && ST.screen === 'battle' && !ST.human && ST.playing) { ST.wikiPaused = true; ST.playing = false; renderPanel(); } };
wikiHooks.close = () => { if (ST.wikiPaused) { ST.wikiPaused = false; ST.playing = true; renderPanel(); schedule(50); } };
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
// test hooks
window.TG = { ST, ui, get B() { return ST.B; }, startBattle, runTourn, renderHome, art, openWhy, roster: () => roster };
})();
