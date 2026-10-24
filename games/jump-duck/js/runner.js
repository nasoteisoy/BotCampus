// Shared game shell for Move & Play games: canvas + DPR, camera, sound, 🏠/🔍/🔊/⏱️ HUD,
// 3-2-1 countdown, end screen with stars, fixed-step loop and the window.__game test hooks.
// v2: the camera is the default input (starts on load), menus are body-controlled (raise a hand, hold it
// on a button), every game shows animated stick-figure how-tos and a practice step before the round.
// v4 (characters): 🧸 relaxed mode (no timer, no losing) is the DEFAULT; ⏱️ challenge = the old timed round.
//   Pick on the title by hand-hover dwell or tap (#bRelax / #bTimed), ?mode=timed in the URL, or start(..., {mode}).
//   S.playT = seconds played this round (games use it instead of roundSec - left); 🏁 ends a round any time.
// v3 (tracking fix): ▶️ -> player-count picker (👤 1-4, remembered) -> roll call (raise a hand, slots fill 1..N in
// colour; ⏭ / auto = by position) -> practice -> 3-2-1. Players are locked (track.js LockTracker): no auto-join,
// never more than N, appearance + motion matching, hold-when-close, both-hands swap gesture (not while playing).
import { Camera, ST } from './cam.js';
import { Sound } from './sound.js';
import { PLAYER_COLORS } from './multi.js';
import { viewMap, loadZoom, saveZoom, clampZoom, ZOOM_LEVELS } from './view.js';
import { BodyMenu } from './menu.js';
import { Practice } from './practice.js?v=4';
import { startDemos, MOVES } from './demo.js';
import { drawVideo, drawSkeleton } from './draw.js';
import { LockUI, PEOPLE } from './lockui.js';

export const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);

export function run(G) {
  const cv = $('cv'), c = cv.getContext('2d'), video = $('vid');
  const params = new URLSearchParams(location.search);
  const S = {
    mode: 'title', input: 'tap', nTap: 1, clock: 0, left: G.roundSec, count: 0, countMax: 3, W: 0, H: 0, dpr: 1,
    fps: 60, frameMs: 0, round: 0, cam: null, sound: null, params, zoom: loadZoom(), practice: null,
    relaxed: !/^(timed|challenge)$/.test(params.get('mode') || ''), playT: 0,
  };
  /** camera frame -> screen mapping (whole frame, contain + 🔍 level). Every game maps landmarks AND draws
   *  the video through this, so skeletons / hit tests stay on the picture. */
  S.view = (W = S.W, H = S.H) => { const f = S.cam.frameSize || { w: W, h: H }; return viewMap(f.w, f.h, W, H, S.zoom); };
  const sound = (S.sound = new Sound());
  const camSt = $('camSt');
  const cam = (S.cam = new Camera({
    video, onStatus: (s) => { camSt.textContent = ST[s] || ''; camSt.dataset.s = s; document.body.dataset.cam = s; camPrompt(s); },
  }));

  // ---- canvas size (adaptive DPR keeps phones at 30+ fps)
  let maxDpr = Math.min(window.devicePixelRatio || 1, params.has('dpr') ? +params.get('dpr') : 2);
  function resize() {
    const W = window.innerWidth, H = window.innerHeight, d = Math.max(1, maxDpr);
    S.W = W; S.H = H; S.dpr = d;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (cam.fake) cam.fakeAr = W / H;
    G.resize?.(S);
  }
  window.addEventListener('resize', resize); resize();

  // ---- HUD
  const muteBtn = $('mute');
  const syncMute = () => { muteBtn.textContent = sound.muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-pressed', sound.muted ? 'true' : 'false'); };
  muteBtn.addEventListener('click', (e) => { e.stopPropagation(); sound.init(); sound.setMuted(!sound.muted); syncMute(); });
  syncMute();
  window.addEventListener('keydown', (e) => { if (e.key === 'm' || e.key === 'M') muteBtn.click(); if (e.key === 'z' || e.key === 'Z') zoomBtn?.click(); });
  // 🔍 zoom: fit (whole camera frame) -> ➖ out -> ➕ in -> fit; remembered on this device
  const zoomBtn = $('zoom');
  const ZORDER = [1, 0, 2];
  function setZoom(z) {
    S.zoom = clampZoom(z); saveZoom(S.zoom);
    if (zoomBtn) { zoomBtn.dataset.z = ZOOM_LEVELS[S.zoom].id; zoomBtn.querySelector('sup').textContent = ZOOM_LEVELS[S.zoom].icon; }
    G.onZoom?.(S);
  }
  zoomBtn?.addEventListener('click', (e) => { e.stopPropagation(); setZoom(ZORDER[(ZORDER.indexOf(S.zoom) + 1) % 3]); toast('🔍' + (ZOOM_LEVELS[S.zoom].icon || '🧍'), 1.2); });
  setZoom(S.zoom);
  // sound needs one real tap / key per page (browser autoplay rule); dwell "clicks" don't count
  const unlock = () => sound.init();
  window.addEventListener('pointerdown', unlock, { passive: true }); window.addEventListener('keydown', unlock);
  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  let toastT = 0;
  function toast(txt, sec = 2.5) { const t = $('toast'); t.textContent = txt; t.classList.add('on'); toastT = sec; }

  // ---- camera first: start the webcam on load (or on the first tap when the browser asks for one)
  const autocam = params.get('autocam') !== '0';
  function camPrompt(st) {
    const m = $('camMsg'); if (!m) return;
    m.textContent = { loading: '⏳', tap: '👆', denied: '🚫', nocam: '🚫', nomodel: '⚠️', none: '🙋', track: '🙋' }[st] || '📷';
  }
  async function autoCam() {
    if (cam.active) return;
    const ok = await cam.start();
    if (!ok && cam.status === 'tap') {
      const again = () => { window.removeEventListener('pointerdown', again); if (!cam.active) cam.start(); };
      window.addEventListener('pointerdown', again);
    }
  }
  const camOk = () => cam.active && !['denied', 'nocam', 'tap'].includes(cam.status);

  // ---- flow
  async function start(input = 'tap', opts = {}) {
    sound.init();
    if (opts.mode) setRelaxed(opts.mode !== 'timed' && opts.mode !== 'challenge');
    S.input = input; S.nTap = opts.players || S.nTap || 1;
    show('title', false); show('end', false);
    if (input === 'cam' && !opts.fake) {
      const ok = cam.active ? true : await cam.start();
      if (!ok || cam.status === 'denied' || cam.status === 'nocam') { toast('🚫📷 → 👆'); S.input = 'tap'; if (cam.active) cam.stop(); }
    } else if (input === 'cam' && opts.fake) {
      cam.startFake(S.W / S.H);
    } else if (cam.active) cam.stop();
    if (S.input !== 'cam') { newRound(); return; }
    if (opts.players) cam.setPlayers(opts.players);
    // tests: fake camera without pick / roll = lock N (default 4) by position, like ⏭
    if (opts.fake && !opts.pick && !opts.roll) { cam.lockAuto(opts.players || 4); afterLock(opts); return; }
    lockFlow(opts, () => afterLock(opts));
  }
  /** picker (unless opts.pick === false) -> roll call (skipped when the same N kids are already locked and in view) */
  function lockFlow(opts, done) {
    const roll = () => {
      if (!opts.roll && lockedOk(cam.nPick)) { done(); return; }
      setMode('roll'); lock.showRoll(() => done());
    };
    if (opts.pick === false) roll(); else { setMode('pick'); lock.showPick(() => { syncPlayersBtn(); roll(); }); }
  }
  const lockedOk = (n) => cam.phase === 'locked' && cam.tracker.n === n && cam.tracker.filled.length === n && cam.tracker.filled.every((p) => p.state === 'active');
  function afterLock(opts) {
    const wantPractice = G.practice && (opts.fake ? !!opts.practice : params.get('practice') !== '0');
    if (wantPractice) startPractice(); else newRound();
  }
  function setMode(m) { S.mode = m; document.body.dataset.mode = m; cam.tracker.swapEnabled = m !== 'play'; }
  function startPractice() {
    const steps = typeof G.practice === 'function' ? G.practice(S) : G.practice;
    S.practice = new Practice(steps);
    setMode('practice'); show('practice', true); show('count', false);
    G.reset(S);
    renderPractice();
  }
  function renderPractice() {
    const P = S.practice, row = $('pSteps'); if (!P || !row) return;
    row.innerHTML = P.steps.map((st, i) => `<span class="ps${st.done ? ' ok' : ''}${i === P.i ? ' cur' : ''}"><canvas data-demo="${st.move}"${i === P.i ? '' : ' data-paused="1"'}></canvas><b>${st.done ? '✅' : st.icon || MOVES[st.move] || ''}</b></span>`).join('');
    const cur = P.current;
    if (cur) { $('pDemo').dataset.demo = cur.move; $('pIcon').textContent = cur.icon || MOVES[cur.move] || ''; }
  }
  function endPractice(skipped) {
    show('practice', false);
    if (!skipped) { toast('✅✅✅', 1.2); sound.good?.(); }
    newRound();
  }
  function newRound() {
    S.round++; S.left = G.roundSec; S.playT = 0; document.body.dataset.play = S.relaxed ? 'relaxed' : 'timed'; S.count = S.countMax; S.countBeat = -1; S.waitT = 0; S.practice = null;
    setMode('count');
    G.reset(S);
    show('count', true); show('end', false); show('title', false); show('practice', false);
    document.body.dataset.input = S.input;
  }
  function endRound() {
    if (S.mode !== 'play') return;
    setMode('end');
    sound.music(false); sound.fanfare();
    // relaxed = no losing: everyone who played gets at least one star
    const res = G.results(S).map((r) => (S.relaxed ? { ...r, stars: Math.max(1, r.stars) } : r));
    S.lastResults = res;
    const rows = $('endRows'); rows.innerHTML = '';
    for (const r of res) {
      const col = PLAYER_COLORS[r.slot] || PLAYER_COLORS[0];
      const row = document.createElement('div'); row.className = 'erow'; row.style.setProperty('--pc', col.css);
      row.innerHTML = `<span class="pd">${col.dot}</span><span class="st">${'⭐'.repeat(r.stars)}<i>${'⭐'.repeat(3 - r.stars)}</i></span><b>${r.score}</b>`;
      rows.appendChild(row);
    }
    show('end', true);
  }
  function toTitle() {
    setMode('title'); sound.music(false); S.practice = null; lock.hide(); syncPlayersBtn();
    show('end', false); show('count', false); show('practice', false); show('title', true);
    if (autocam && !cam.active) autoCam(); else if (cam.fake) { /* keep fake camera for tests */ }
  }
  // ▶️ = play with the camera (falls back to tap/keys when there is no camera)
  $('bCam').addEventListener('click', () => (['denied', 'nocam'].includes(cam.status) ? start('tap', { players: 1 }) : start('cam')));
  $('bTap').addEventListener('click', () => start('tap', { players: 1 }));
  $('bTap2')?.addEventListener('click', () => start('tap', { players: 2 }));
  $('bAgain').addEventListener('click', () => { sound.init(); newRound(); });
  $('bMenu').addEventListener('click', toTitle);
  // 🧸 relaxed (default) / ⏱️ challenge
  function setRelaxed(on) {
    S.relaxed = !!on; document.body.dataset.play = S.relaxed ? 'relaxed' : 'timed';
    for (const [id, v] of [['bRelax', true], ['bTimed', false]]) { const b = $(id); if (b) { b.classList.toggle('on', S.relaxed === v); b.setAttribute('aria-pressed', S.relaxed === v ? 'true' : 'false'); } }
  }
  $('bRelax')?.addEventListener('click', () => { setRelaxed(true); sound.good?.(); });
  $('bTimed')?.addEventListener('click', () => { setRelaxed(false); sound.good?.(); });
  setRelaxed(S.relaxed);
  // 🏁 = finish now (relaxed rounds have no timer; works in both modes)
  $('bFinish')?.addEventListener('click', (e) => { e.stopPropagation(); if (S.mode === 'play') { G.update(STEP, S); endRound(); } else if (S.mode === 'count') toTitle(); });
  // 👤N = change the player count (picker -> roll call), 📣 = roll call again (fix who is who)
  $('bPlayers')?.addEventListener('click', () => { if (!camOk()) { toast('🚫📷'); return; } lockFlow({ roll: true }, toTitle); });
  $('bRoll')?.addEventListener('click', () => { if (!camOk()) { toast('🚫📷'); return; } lockFlow({ pick: false, roll: true }, toTitle); });
  function syncPlayersBtn() { const b = $('bPlayers'); if (b) { b.querySelector('b').textContent = cam.nPick; b.setAttribute('aria-label', `Players: ${cam.nPick}. Change`); } }
  $('pSkip')?.addEventListener('click', () => { if (S.mode === 'practice') { S.practice?.skip(); endPractice(true); } });

  // ---- body-controlled menus (title / practice / end). Off while counting down + playing.
  const lock = (S.lock = new LockUI({ cam, sound, getMap: () => S.view() }));
  syncPlayersBtn();
  const menu = new BodyMenu({
    enabled: () => cam.active && ['title', 'practice', 'end', 'pick', 'roll'].includes(S.mode),
    scope: () => (S.mode === 'pick' || S.mode === 'roll' ? lock.scope : S.mode === 'practice' ? [$('practice')] : S.mode === 'end' ? [$('end'), $('top')] : [$('title'), $('top')]),
  });
  // locked players drive the menus; before anyone is locked, the nearest person does
  const menuPlayers = () => cam.menuPlayers;
  startDemos(document);
  // live camera backdrop behind the title / practice screens: the whole mirrored frame + glowing skeletons
  function drawBackdrop(c, W, H) {
    const map = S.view(W, H);
    c.fillStyle = '#1d1640'; c.fillRect(0, 0, W, H);
    if (cam.hasVideo) drawVideo(c, video, W, H, map); else if (cam.fake && cam.fakeFrame) drawVideo(c, cam.fakeFrame, W, H, map);
    for (const p of cam.players) if (p.body) drawSkeleton(c, p.body, map, (PLAYER_COLORS[p.slot] || PLAYER_COLORS[0]).css, { width: 8, glow: 22 });
    for (const q of cam.pending) drawSkeleton(c, q.body, map, '#ffffff88', { width: 5, glow: 0, alpha: 0.6 });
  }

  // ---- loop
  function step(dt) {
    S.clock += dt;
    if (cam.fake) { const r = cam.tick(S.clock); if (r) G.onPose?.(r, S.clock, S); }
    lock.update(dt);
    if (S.mode === 'practice' && S.practice) {
      const got = S.practice.update(menuPlayers(), dt);
      if (got) { sound.pop?.(); renderPractice(); if (S.practice.done) endPractice(false); }
      return;
    }
    if (S.mode === 'count') {
      const ready = !G.ready || G.ready(S) || S.waitT > 8;
      if (S.count > 1 || ready) S.count -= dt; else S.waitT += dt;
      const beat = Math.ceil(S.count);
      if (beat !== S.countBeat && beat > 0) { S.countBeat = beat; sound.tick(); }
      if (S.count <= 0) { setMode('play'); show('count', false); sound.go(); G.onPlay?.(S); }
    } else if (S.mode === 'play') {
      S.playT += dt;
      if (!S.relaxed) {
        S.left -= dt;
        if (S.left <= 0) { S.left = 0; G.update(dt, S); endRound(); return; }
      }
    }
    if (S.mode !== 'title' && S.mode !== 'pick' && S.mode !== 'roll') G.update(dt, S);
  }
  let last = performance.now(), acc = 0, frames = 0, fpsT = last, hudT = 0, slowT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const t0 = performance.now();
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!cam.fake) { const r = cam.tick(S.clock); if (r) G.onPose?.(r, S.clock, S); }
    acc += dt; let n = 0;
    if (S.paused) acc = 0;
    while (acc >= STEP && n < 6) { step(STEP); acc -= STEP; n++; }
    if (n === 6) acc = 0;
    c.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    if ((S.mode === 'title' || S.mode === 'practice' || S.mode === 'pick' || S.mode === 'roll') && cam.active && (cam.hasVideo || cam.players.length)) drawBackdrop(c, S.W, S.H);
    else G.draw(c, S.W, S.H, S);
    menu.update(menuPlayers(), now / 1000);
    if (lock.dbgOn) lock.drawDebug();
    document.body.classList.toggle('camlive', cam.hasVideo || (cam.fake && cam.active));
    if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.remove('on');
    if ((hudT -= dt) <= 0) { hudT = 0.1; hud(); }
    frames++;
    if (now - fpsT >= 1000) {
      S.fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now;
      // adaptive resolution: sustained < 40 fps -> lower DPR (once per 2 s)
      if (!params.has('noadapt') && S.fps < 40 && maxDpr > 1) { if ((slowT += 1) >= 2) { maxDpr = Math.max(1, maxDpr - 0.5); resize(); slowT = 0; } } else slowT = 0;
    }
    S.frameMs = S.frameMs * 0.95 + (performance.now() - t0) * 0.05;
  }
  function hud() {
    $('timer').textContent = S.relaxed ? '🧸' : '⏱️' + Math.ceil(S.left);
    const sc = $('scores'), list = G.hud(S) || [];
    const key = list.map((p) => p.slot + ':' + p.score).join(',');
    if (sc.dataset.k !== key) {
      sc.dataset.k = key;
      sc.innerHTML = list.map((p) => `<span class="chip" style="--pc:${(PLAYER_COLORS[p.slot] || PLAYER_COLORS[0]).css}">${p.icon || ''}<b>${p.score}</b></span>`).join('');
    }
    if (S.mode === 'count') {
      $('countN').textContent = S.count > 0 ? Math.max(1, Math.ceil(S.count)) : '';
      $('countMsg').textContent = G.countMsg ? G.countMsg(S) : '';
    }
  }
  requestAnimationFrame(frame);
  document.body.dataset.mode = 'title';
  if (autocam) autoCam();

  // ---- test hooks
  window.__game = {
    get state() { return { mode: S.mode, zoom: S.zoom, input: S.input, left: S.left, clock: S.clock, round: S.round, nTap: S.nTap, fps: S.fps, frameMs: S.frameMs, dpr: S.dpr, W: S.W, H: S.H, cam: cam.status, fake: cam.fake, relaxed: S.relaxed, playT: +S.playT.toFixed(2), detectMs: +(cam.detectMs || 0).toFixed(1), ...(G.state?.(S) || {}) }; },
    get players() { return cam.players.map((p) => ({ slot: p.slot, state: p.state, x: +p.x.toFixed(3), body: !!p.body })); },
    /** tracking lock: phase (idle | roll | locked), N, numPoses, roll call progress, candidates, last debug info */
    get lock() { const tr = cam.tracker; return { phase: tr.phase, n: tr.n, pick: cam.nPick, numPoses: cam.numPoses, ui: lock.mode, roll: tr.rollState(), cands: tr.cands.map((c) => ({ x: +c.x.toFixed(3), age: +(tr.t - c.firstSeen).toFixed(2), persisted: !!c.persisted })), debug: { dets: tr.debug.dets.map((d) => ({ slot: d.slot, cost: d.cost, x0: +d.box.x0.toFixed(3) })), rejected: tr.debug.rejected.map((r) => r.why), held: tr.debug.held.map((h) => h.slot) }, swapEnabled: tr.swapEnabled }; },
    /** fake camera frame (canvas) for the torso colour histograms */
    setFakeVideo: (cv) => { cam.fakeFrame = cv || null; },
    debug: (on = true) => lock.setDebug(on),
    pickPlayers: (n) => lock._picked(n),
    get results() { return S.lastResults || null; },
    start: (input, opts) => start(input, opts),
    /** fake camera (tests). opts.practice = true -> go through the practice step first */
    fakeCamera: (opts = {}) => start('cam', { fake: true, ...opts }),
    setFakeFrame: (w, h) => { cam.setFakeFrame(w, h); },
    setZoom: (z) => setZoom(z),
    /** 🧸 relaxed (true, default) / ⏱️ challenge (false) */
    setRelaxed: (on = true) => setRelaxed(on),
    get zoom() { return S.zoom; },
    view: () => { const m = S.view(); return { s: m.s, dw: m.dw, dh: m.dh, ox: m.ox, oy: m.oy, level: m.level, rect: m.rect }; },
    get menu() { return menu.state; },
    get practice() { const P = S.practice; return P ? { i: P.i, done: P.done, steps: P.steps.map((s) => ({ move: s.move, done: s.done })) } : null; },
    camInfo: () => ({ ...cam.info, status: cam.status, active: cam.active, fake: cam.fake }),
    toTitle: () => toTitle(),
    injectPeople: (list) => cam.inject(list),
    /** run the fixed-step sim for `sec` seconds synchronously (fake camera is sampled at 30 Hz of sim time) */
    simulate(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n && S.mode !== 'end'; i++) step(STEP); hud(); return this.state; },
    skipCount() { if (S.mode === 'count') { S.count = 0; step(STEP); } },
    setLeft(s) { S.left = s; },
    /** stop real-time stepping (tests drive time with simulate) */
    pause(p = true) { S.paused = !!p; },
    /** in-page: feed n fake frames (30 Hz) from a generator fn(i) -> landmark list, stepping the sim */
    feed(frames, gen) { for (let i = 0; i < frames; i++) { cam.inject(gen(i)); this.simulate(1 / 30); } return this.state; },
    end() { if (S.mode === 'play') { if (S.relaxed) { G.update(STEP, S); endRound(); } else { S.left = 0.001; step(STEP); } } },
    again: () => newRound(),
    ar: () => S.W / S.H,
    sound, S, G,
  };
  return { S, cam, sound, toast, endRound, start, menu };
}
