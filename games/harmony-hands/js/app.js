import { NOTES, pc, chordName, chordPcs, keyChords, DEFAULT_KEY, chordMidiNotes, midiToName } from './theory.js';
import { QuadTracker } from './grid.js';
import { HandTracker } from './hands.js';
import { Engine, MIC } from './audio.js';
import { Pad } from './pad.js';
import { MidiOut, midiSupported } from './midi.js';

const $ = (s) => document.querySelector(s);
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const QNAME = ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right'];
const SAVE = 'harmony-hands-v1';

const st = Object.assign({ key: DEFAULT_KEY, chords: keyChords(DEFAULT_KEY), voices: 2, mix: 55, point: 'tip' }, load());
st.quad = 0; st.running = false; st.pad = false;
function load() { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch (e) { return {}; } }
function save() { try { localStorage.setItem(SAVE, JSON.stringify({ key: st.key, chords: st.chords, voices: st.voices, mix: st.mix, point: st.point })); } catch (e) { /* private mode */ } }

const stage = $('#stage'), dot = $('#dot'), quads = [...document.querySelectorAll('.q')], chordBtns = [...document.querySelectorAll('.chord')];
const tracker = new QuadTracker({ aspect: 16 / 9 });
tracker.set(st.quad);
let ctx = null, engine = null, pad = null, midi = null, hands = null, streams = [], tapMode = DEBUG;

// ---------- chord grid ----------
function renderChords() {
  chordBtns.forEach((b, i) => { b.textContent = chordName(st.chords[i]); b.setAttribute('aria-label', QNAME[i] + ' chord ' + chordName(st.chords[i]) + ', tap to change'); });
  $('#keyName').textContent = NOTES[st.key];
  applyQuad(st.quad, true);
}
function applyQuad(q, force) {
  if (q < 0) return;
  if (q === st.quad && !force) return;
  st.quad = q;
  quads.forEach((el, i) => el.classList.toggle('on', i === q));
  const c = st.chords[q];
  stage.dataset.quad = q; stage.dataset.chord = chordName(c);
  if (engine) engine.set({ pcs: chordPcs(c) });
  const notes = chordMidiNotes(c);
  if (pad) pad.setChord(notes);
  if (midi) midi.sendChord(notes);
}
function setPoint(p) {
  if (!p) { dot.hidden = true; stage.dataset.hand = ''; tracker.update(null, performance.now()); return; }
  dot.hidden = false; dot.style.left = p.x * 100 + '%'; dot.style.top = p.y * 100 + '%';
  stage.dataset.hand = p.x.toFixed(3) + ',' + p.y.toFixed(3);
  const r = stage.getBoundingClientRect(); tracker.aspect = r.width / Math.max(1, r.height);
  applyQuad(tracker.update(p, performance.now()));
}
function sizeHold() { // centre hold circle radius = tracker.holdR * stage height
  const r = stage.getBoundingClientRect(); const d = 2 * tracker.holdR * r.height;
  const h = $('#hold'); h.style.width = d + 'px'; h.style.height = d + 'px'; h.style.maxHeight = 'none';
}
new ResizeObserver(sizeHold).observe(stage);

// tap / mouse fallback: ?debug=1, or when there is no camera
stage.addEventListener('pointermove', (e) => { if (tapMode && (DEBUG || e.buttons)) setPoint(toStage(e)); });
stage.addEventListener('pointerdown', (e) => {
  if (!tapMode || e.target.closest('.chord') || e.target.closest('#startOv')) return;
  const p = toStage(e); setPoint(p);
  if (!DEBUG) { const q = (p.x >= 0.5 ? 1 : 0) + (p.y >= 0.5 ? 2 : 0); if (!tracker.inHold(p.x, p.y)) { tracker.set(q); applyQuad(q); } }
});
function toStage(e) { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }

// ---------- sheets ----------
const sheet = $('#sheet');
function openSheet(title, body) { $('#sheetTitle').textContent = title; const b = $('#sheetBody'); b.replaceChildren(body); sheet.hidden = false; }
function closeSheet() { sheet.hidden = true; }
$('#sheetDone').onclick = closeSheet;
sheet.addEventListener('pointerdown', (e) => { if (e.target === sheet) closeSheet(); });
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function editChord(q) {
  const body = el('div');
  const roots = el('div', 'roots'), qual = el('div', 'qual');
  const draw = () => {
    const c = st.chords[q];
    [...roots.children].forEach((b, i) => b.classList.toggle('on', i === pc(c.root)));
    qual.children[0].classList.toggle('on', !c.minor); qual.children[1].classList.toggle('on', c.minor);
    $('#sheetTitle').textContent = '✏️ ' + chordName(c);
  };
  NOTES.forEach((n, i) => { const b = el('button', null, n); b.dataset.root = i; b.onclick = () => { st.chords[q] = { ...st.chords[q], root: i }; changed(); }; roots.append(b); });
  const maj = el('button', null, 'Major'), min = el('button', null, 'minor');
  maj.dataset.qual = 'maj'; min.dataset.qual = 'min';
  maj.onclick = () => { st.chords[q] = { ...st.chords[q], minor: false }; changed(); };
  min.onclick = () => { st.chords[q] = { ...st.chords[q], minor: true }; changed(); };
  qual.append(maj, min);
  const changed = () => { save(); renderChords(); draw(); };
  body.append(roots, qual, el('p', 'sub', QNAME[q]));
  openSheet('', body); draw();
}
chordBtns.forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); editChord(+b.dataset.q); }));

$('#btnKey').onclick = () => {
  const roots = el('div', 'roots');
  NOTES.forEach((n, i) => {
    const b = el('button', null, n); b.dataset.key = i; b.classList.toggle('on', i === st.key);
    b.onclick = () => { st.key = i; st.chords = keyChords(i); save(); renderChords(); [...roots.children].forEach((x, j) => x.classList.toggle('on', j === i)); };
    roots.append(b);
  });
  const body = el('div'); body.append(roots, el('p', 'sub', '↖ vi · ↗ I · ↙ V · ↘ IV &nbsp; | &nbsp; 🎵 Silence = F#'));
  openSheet('🎼 Key', body);
};
$('#btnTip').onclick = () => {
  const lat = engine ? engine.latencyMs() : null;
  openSheet('⏱ Less lag', el('div', 'tip',
    '<div>🎧 Wired headphones (no Bluetooth)</div><div>💻 Chrome on PC</div><div>🗂 Close other tabs</div>' +
    '<div>🎧 Always headphones: no squeal</div>' + (lat ? `<div>⏱ Now ≈ <b id="latNow">${lat} ms</b></div>` : '')));
};

// ---------- controls ----------
const mixEl = $('#mix'); mixEl.value = st.mix;
mixEl.oninput = () => { st.mix = +mixEl.value; save(); if (engine) engine.set({ mix: st.mix / 100 }); };
const vBtns = [...document.querySelectorAll('#voices button')];
const drawVoices = () => vBtns.forEach((b) => b.classList.toggle('on', +b.dataset.v === st.voices));
vBtns.forEach((b) => b.onclick = () => { st.voices = +b.dataset.v; save(); drawVoices(); if (engine) engine.set({ voices: st.voices }); });
drawVoices();
const padBtn = $('#btnPad');
padBtn.onclick = () => {
  st.pad = !st.pad; padBtn.setAttribute('aria-pressed', st.pad); padBtn.querySelector('b').textContent = st.pad ? 'On' : 'Off';
  ensureCtx(); if (!pad) { pad = new Pad(ctx, ctx.destination); pad.setChord(chordMidiNotes(st.chords[st.quad])); }
  pad.setOn(st.pad);
};
const ptBtn = $('#btnPoint');
const drawPoint = () => { ptBtn.querySelector('.ic').textContent = st.point === 'tip' ? '☝️' : '✋'; ptBtn.querySelector('.lb').textContent = st.point === 'tip' ? 'Finger' : 'Palm'; if (hands) hands.mode = st.point; };
ptBtn.onclick = () => { st.point = st.point === 'tip' ? 'palm' : 'tip'; save(); drawPoint(); };
drawPoint();

// MIDI: the whole block stays hidden unless Web MIDI works and there is an output
const midiBox = $('#midiBox'), midiSel = $('#midiSel');
function drawMidi(outs, cur) {
  midiBox.hidden = !outs.length;
  midiSel.replaceChildren(...[{ id: '', name: '⏹ Off' }, ...outs].map((o) => { const op = new Option(o.name || 'MIDI', o.id); op.selected = o.id === cur; return op; }));
}
midiSel.onchange = () => { midi.select(midiSel.value); midi.sendChord(chordMidiNotes(st.chords[st.quad])); };

// ---------- note readout ----------
function onAudioStatus(s) {
  const n = $('#noteName'), bar = $('#centsBar');
  if (s.f > 0) {
    n.textContent = midiToName(s.midi);
    const cents = (s.midi - Math.round(s.midi)) * 100;
    bar.style.left = 50 + cents + '%'; bar.style.background = Math.abs(cents) < 15 ? 'var(--ok)' : 'var(--warn)';
    stage.dataset.note = midiToName(s.midi); stage.dataset.hz = s.f.toFixed(2);
  } else { n.textContent = '–'; stage.dataset.note = ''; stage.dataset.hz = ''; }
  const t = s.voiced && s.targets ? s.targets.filter((x) => x != null) : [];
  $('#harmNotes').textContent = t.length ? t.map(midiToName).join(' · ') : '–';
  stage.dataset.targets = t.map(midiToName).join(',');
}

// ---------- start / stop ----------
function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (ctx.state !== 'running') ctx.resume();
}
const camStatus = $('#camStatus');
const CAM = { loading: '⏳ ✋', track: '✋ ✅', none: '🙈 Show ✋', nomodel: '⚠️ ✋ 👆 Tap a box', nocam: '🚫 📷 👆 Tap a box', nomic: '🚫 🎤' };
function setCam(s) { camStatus.hidden = !s; camStatus.textContent = CAM[s] || ''; stage.dataset.cam = s; if (s === 'nomodel' || s === 'nocam') tapMode = true; }

async function start() {
  if (st.running) return;
  st.running = true;
  ensureCtx();
  const power = $('#btnPower'); power.classList.add('on'); power.querySelector('.ic').textContent = '⏹'; power.querySelector('.lb').textContent = 'Stop'; power.setAttribute('aria-label', 'Stop');
  $('#startOv').hidden = true;
  const [micR, camR] = await Promise.allSettled([
    navigator.mediaDevices.getUserMedia({ audio: MIC }),
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 } } }),
  ]);
  if (!st.running) { [micR, camR].forEach((r) => r.status === 'fulfilled' && r.value.getTracks().forEach((t) => t.stop())); return; }
  if (micR.status === 'fulfilled') {
    streams.push(micR.value);
    engine = new Engine(ctx); engine.onStatus = onAudioStatus;
    try {
      await engine.start(micR.value);
      engine.set({ pcs: chordPcs(st.chords[st.quad]), voices: st.voices, mix: st.mix / 100 });
      const lat = engine.latencyMs(); $('#latLbl').textContent = lat + ' ms'; stage.dataset.lat = lat;
    } catch (e) { console.warn('[audio] harmonizer failed', e); }
  } else setCam('nomic');
  if (camR.status === 'fulfilled') {
    streams.push(camR.value);
    const v = $('#cam'); v.srcObject = camR.value; v.play().catch(() => {});
    hands = new HandTracker(v, (p) => { if (!(DEBUG && dbgHold)) setPoint(p); }, setCam); hands.mode = st.point;
    hands.start();
  } else setCam('nocam');
  if (midiSupported()) { midi = new MidiOut(drawMidi); midi.init().then((okk) => { if (okk) midi.sendChord(chordMidiNotes(st.chords[st.quad])); }); }
  if (!pad) { pad = new Pad(ctx, ctx.destination); }
  pad.setChord(chordMidiNotes(st.chords[st.quad]));
}
function stop() {
  st.running = false;
  if (hands) hands.stop(); hands = null;
  streams.forEach((s) => s.getTracks().forEach((t) => t.stop())); streams = [];
  if (midi) midi.allOff(); midi = null; midiBox.hidden = true;
  if (pad) pad.setOn(false); pad = null; st.pad = false; padBtn.setAttribute('aria-pressed', 'false'); padBtn.querySelector('b').textContent = 'Off';
  if (ctx) ctx.close(); ctx = null; engine = null;
  $('#cam').srcObject = null; setCam(''); tapMode = DEBUG; setPoint(null);
  const power = $('#btnPower'); power.classList.remove('on'); power.querySelector('.ic').textContent = '▶'; power.querySelector('.lb').textContent = 'Start'; power.setAttribute('aria-label', 'Start');
  $('#startOv').hidden = false; $('#noteName').textContent = '–'; $('#harmNotes').textContent = '–'; $('#latLbl').textContent = 'Lag';
}
$('#btnStart').onclick = start;
$('#btnPower').onclick = () => (st.running ? stop() : start());

// debug-only hooks (?debug=1): mouse/touch moves the "hand"; tests can drive the point directly
let dbgHold = false;
if (DEBUG) {
  window.HH = {
    st, tracker,
    point(x, y) { dbgHold = true; setPoint({ x, y }); return st.quad; },
    release() { dbgHold = false; setPoint(null); },
    engineSet(p) { engine && engine.set(p); },
    get hands() { return hands; },
  };
}
renderChords();
