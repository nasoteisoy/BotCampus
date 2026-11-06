import { icon, iconLabel } from './icons.js';
import { AudioEngine } from './audio-engine.js';
import { MicPitch } from './mic.js';
import { PracticeSession, formatMeter } from './practice.js';
import { getBest, setBest, getSettings, saveSettings } from './storage.js';

const engine = new AudioEngine();
let data = null;
let settings = getSettings();
let currentEx = null;
let session = null;
let mic = null;
let raf = 0;

const $ = (id) => document.getElementById(id);

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

function setIconButton(el, name, label) {
  el.innerHTML = iconLabel(name, label);
}

async function loadData() {
  const res = await fetch('data/exercises.json');
  data = await res.json();
  if (settings.octaveShift == null) settings.octaveShift = data.defaultOctaveShift;
}

function renderHome() {
  $('home-logo').innerHTML = icon('music', { size: 36 });
  setIconButton($('btn-exercises'), 'list', 'Exercises');
  setIconButton($('btn-listen'), 'play', 'Listen demo');
  setIconButton($('oct-down'), 'minus', '');
  setIconButton($('oct-up'), 'plus', '');
  $('oct-down').querySelector('.lb')?.remove();
  $('oct-up').querySelector('.lb')?.remove();
  updateOctLabel();
  $('home-tip').innerHTML = `${icon('headphones', { size: 18 })}<span>${data.headphonesTip}</span>`;
}

function updateOctLabel() {
  const s = settings.octaveShift / 12;
  $('oct-label').textContent = (s >= 0 ? '+' : '') + s;
}

function renderList() {
  const ul = $('ex-list');
  ul.innerHTML = '';
  data.exercises.forEach((ex, i) => {
    const best = getBest(ex.id);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ex';
    btn.innerHTML = `
      <span class="num">${i + 1}</span>
      <span class="meta"><b>${ex.title}</b><span>${ex.hint}</span></span>
      <span class="best">${best != null ? Math.round(best) + '%' : ''}</span>`;
    btn.addEventListener('click', () => openPractice(ex));
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function openPractice(ex) {
  currentEx = ex;
  stopAll();
  $('prac-title').textContent = ex.title;
  $('prac-hint').textContent = ex.hint;
  $('tempo').value = String(ex.tempo);
  $('tempo-val').textContent = String(ex.tempo);
  setIconButton($('prac-back'), 'back', '');
  $('prac-back').querySelector('.lb')?.remove();
  setIconButton($('tog-melody'), 'music', 'Melody');
  setIconButton($('tog-harmony'), 'harmony', 'Harmony');
  setIconButton($('btn-mic'), 'mic', 'Mic');
  setIconButton($('btn-play'), 'play', 'Play');
  setIconButton($('btn-stop'), 'stop', 'Stop');
  $('prac-tip').innerHTML = `${icon('headphones', { size: 18 })}<span>${data.headphonesTip}</span>`;
  $('mic-banner').classList.remove('show');

  engine.setMelodyOn(settings.melodyOn !== false);
  engine.setHarmonyOn(settings.harmonyOn !== false);
  $('tog-melody').classList.toggle('on', engine.melodyOn);
  $('tog-harmony').classList.toggle('on', engine.harmonyOn);
  $('tog-melody').setAttribute('aria-pressed', String(engine.melodyOn));
  $('tog-harmony').setAttribute('aria-pressed', String(engine.harmonyOn));

  show('screen-practice');
  requestAnimationFrame(() => {
    session = new PracticeSession({
      canvas: $('lane'),
      exercise: ex,
      octaveShift: settings.octaveShift,
    });
    session.draw();
    loopDraw();
  });
}

function loopDraw() {
  cancelAnimationFrame(raf);
  const step = () => {
    if (!$('screen-practice').classList.contains('active')) return;
    if (session) {
      session.draw();
      updateMeter(session.getMeter());
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

function updateMeter(m) {
  const f = formatMeter(m);
  $('target-note').textContent = f.target;
  $('sung-note').textContent = f.sung;
  $('meter-cents').textContent = f.centsLabel;
  $('meter-state').textContent = f.state;
  const el = $('meter');
  el.className = 'meter ' + f.cls;
}

async function ensureMic() {
  await engine.ensure();
  if (!mic) {
    mic = new MicPitch(engine.ctx);
    mic.onStatus = (st) => {
      const ban = $('mic-banner');
      if (st === 'denied') {
        $('mic-banner-text').textContent = 'Mic blocked — allow mic in browser settings';
        ban.classList.add('show');
      } else if (st === 'error') {
        $('mic-banner-text').textContent = 'Mic unavailable on this device';
        ban.classList.add('show');
      } else {
        ban.classList.remove('show');
      }
      if (st === 'live') {
        setIconButton($('btn-mic'), 'mic', 'Live');
        $('btn-mic').classList.add('on');
      } else {
        setIconButton($('btn-mic'), 'mic', 'Mic');
        $('btn-mic').classList.remove('on');
      }
    };
    mic.onPitch = (p) => {
      if (session) session.onPitch(p);
    };
  }
  if (mic.status !== 'live') {
    await mic.request();
  }
  return mic.status === 'live';
}

async function playCurrent() {
  if (!currentEx) return;
  await engine.ensure();
  // Auto-request mic for scoring if possible; denial is OK (listen-only)
  if (!mic || mic.status !== 'live') {
    try { await ensureMic(); } catch (_) {}
  }
  engine.setMelodyVolume(parseInt($('vol-mel').value, 10) / 100);
  engine.setHarmonyVolume(parseInt($('vol-har').value, 10) / 100);
  if (engine.master) engine.master.gain.value = parseInt($('vol-master').value, 10) / 100;
  const tempo = parseInt($('tempo').value, 10);
  engine.tempo = tempo;

  engine.onBeat = (b) => {
    if (session) session.onBeat(b);
  };
  engine.onDone = () => {
    finishPractice();
  };

  const handle = await engine.playTracks({
    melody: currentEx.melody,
    harmony: currentEx.harmony,
    tempo,
    octaveShift: settings.octaveShift,
  });
  if (session) session.start(handle);
  setIconButton($('btn-play'), 'play', 'Playing');
  $('btn-play').disabled = true;
}

function stopAll() {
  engine.stop();
  if (session) session.stop();
  $('btn-play').disabled = false;
  setIconButton($('btn-play'), 'play', 'Play');
}

function finishPractice() {
  engine.stop();
  if (!session) return;
  session.stop();
  const sc = session.score();
  const best = setBest(currentEx.id, sc.overall);
  $('res-score').textContent = Math.round(sc.overall) + '%';
  $('res-best').textContent = best != null ? 'Best ' + Math.round(best) + '%' : '';
  $('res-hint').textContent = currentEx.title + ' · ±50 cents';
  const ul = $('res-phrases');
  ul.innerHTML = '';
  sc.phrases.forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>Phrase ${p.index}</span><b>${Math.round(p.pct)}%</b>`;
    ul.appendChild(li);
  });
  if (!sc.phrases.length) {
    const li = document.createElement('li');
    li.innerHTML = `<span>No voiced samples</span><b>—</b>`;
    ul.appendChild(li);
  }
  setIconButton($('res-back'), 'back', '');
  $('res-back').querySelector('.lb')?.remove();
  setIconButton($('res-again'), 'refresh', 'Again');
  setIconButton($('res-list'), 'list', 'Exercises');
  show('screen-result');
  $('btn-play').disabled = false;
  setIconButton($('btn-play'), 'play', 'Play');
}

function wire() {
  $('btn-exercises').addEventListener('click', () => {
    renderList();
    setIconButton($('list-back'), 'back', '');
    $('list-back').querySelector('.lb')?.remove();
    show('screen-list');
  });
  $('list-back').addEventListener('click', () => show('screen-home'));
  $('prac-back').addEventListener('click', () => {
    stopAll();
    renderList();
    show('screen-list');
  });
  $('res-back').addEventListener('click', () => openPractice(currentEx));
  $('res-again').addEventListener('click', () => openPractice(currentEx));
  $('res-list').addEventListener('click', () => {
    renderList();
    show('screen-list');
  });

  $('oct-down').addEventListener('click', () => {
    settings.octaveShift = Math.max(-24, settings.octaveShift - 12);
    saveSettings({ octaveShift: settings.octaveShift });
    updateOctLabel();
  });
  $('oct-up').addEventListener('click', () => {
    settings.octaveShift = Math.min(12, settings.octaveShift + 12);
    saveSettings({ octaveShift: settings.octaveShift });
    updateOctLabel();
  });

  $('btn-listen').addEventListener('click', async () => {
    const ex = data.exercises[0];
    openPractice(ex);
    await waitFrames(3);
    // Listen with both tracks on
    engine.setMelodyOn(true);
    engine.setHarmonyOn(true);
    $('tog-melody').classList.add('on');
    $('tog-harmony').classList.add('on');
    await playCurrent();
  });

  function waitFrames(n) {
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        i++;
        if (i >= n) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  $('tog-melody').addEventListener('click', () => {
    engine.setMelodyOn(!engine.melodyOn);
    $('tog-melody').classList.toggle('on', engine.melodyOn);
    $('tog-melody').setAttribute('aria-pressed', String(engine.melodyOn));
    saveSettings({ melodyOn: engine.melodyOn });
  });
  $('tog-harmony').addEventListener('click', () => {
    engine.setHarmonyOn(!engine.harmonyOn);
    $('tog-harmony').classList.toggle('on', engine.harmonyOn);
    $('tog-harmony').setAttribute('aria-pressed', String(engine.harmonyOn));
    saveSettings({ harmonyOn: engine.harmonyOn });
  });

  $('tempo').addEventListener('input', () => {
    $('tempo-val').textContent = $('tempo').value;
  });
  $('vol-mel').addEventListener('input', () => {
    engine.setMelodyVolume(parseInt($('vol-mel').value, 10) / 100);
  });
  $('vol-har').addEventListener('input', () => {
    engine.setHarmonyVolume(parseInt($('vol-har').value, 10) / 100);
  });
  $('vol-master').addEventListener('input', () => {
    if (engine.master) engine.master.gain.value = parseInt($('vol-master').value, 10) / 100;
  });

  $('btn-mic').addEventListener('click', () => ensureMic());
  $('mic-retry').addEventListener('click', () => ensureMic());
  $('btn-play').addEventListener('click', () => playCurrent());
  $('btn-stop').addEventListener('click', () => stopAll());

  window.addEventListener('resize', () => {
    if (session) session._resize();
  });

  // Test hooks only when ?test=1 (standing rule: never ship active)
  if (new URLSearchParams(location.search).get('test') === '1') {
    window.__HT = {
      engine,
      get session() { return session; },
      get mic() { return mic; },
      get currentEx() { return currentEx; },
      openPractice,
      playCurrent,
      stopAll,
      ensureMic,
      finishPractice,
      getSettings: () => settings,
      PracticeSession,
    };
  }
}

async function boot() {
  await loadData();
  renderHome();
  wire();
}

boot().catch((err) => {
  console.error(err);
  $('home-hint').textContent = 'Failed to load exercises';
});
