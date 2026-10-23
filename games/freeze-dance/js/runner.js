// Shared game shell for Move & Play games: canvas + DPR, camera, sound, 🏠/🔊/⏱️ HUD,
// 3-2-1 countdown, end screen with stars, fixed-step loop and the window.__game test hooks.
import { Camera, ST } from './cam.js';
import { Sound } from './sound.js';
import { PLAYER_COLORS } from './multi.js';

export const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);

export function run(G) {
  const cv = $('cv'), c = cv.getContext('2d'), video = $('vid');
  const params = new URLSearchParams(location.search);
  const S = {
    mode: 'title', input: 'tap', nTap: 1, clock: 0, left: G.roundSec, count: 0, countMax: 3, W: 0, H: 0, dpr: 1,
    fps: 60, frameMs: 0, round: 0, cam: null, sound: null, params,
  };
  const sound = (S.sound = new Sound());
  const camSt = $('camSt');
  const cam = (S.cam = new Camera({
    video, onStatus: (s) => { camSt.textContent = ST[s] || ''; camSt.dataset.s = s; },
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
  window.addEventListener('keydown', (e) => { if (e.key === 'm' || e.key === 'M') muteBtn.click(); });
  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  let toastT = 0;
  function toast(txt, sec = 2.5) { const t = $('toast'); t.textContent = txt; t.classList.add('on'); toastT = sec; }

  // ---- flow
  async function start(input = 'tap', opts = {}) {
    sound.init();
    S.input = input; S.nTap = opts.players || S.nTap || 1;
    show('title', false); show('end', false);
    if (input === 'cam' && !opts.fake) {
      const ok = await cam.start();
      if (!ok) { toast('🚫📷 → 👆'); S.input = 'tap'; }
    } else if (input === 'cam' && opts.fake) {
      cam.startFake(S.W / S.H);
    } else if (cam.active) cam.stop();
    newRound();
  }
  function newRound() {
    S.round++; S.left = G.roundSec; S.mode = 'count'; S.count = S.countMax; S.countBeat = -1; S.waitT = 0;
    G.reset(S);
    show('count', true); show('end', false); show('title', false);
    document.body.dataset.mode = 'count'; document.body.dataset.input = S.input;
  }
  function endRound() {
    if (S.mode !== 'play') return;
    S.mode = 'end'; document.body.dataset.mode = 'end';
    sound.music(false); sound.fanfare();
    const res = G.results(S);
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
  $('bCam').addEventListener('click', () => start('cam'));
  $('bTap').addEventListener('click', () => start('tap', { players: 1 }));
  $('bTap2')?.addEventListener('click', () => start('tap', { players: 2 }));
  $('bAgain').addEventListener('click', () => { sound.init(); newRound(); });
  $('bMenu').addEventListener('click', () => { S.mode = 'title'; document.body.dataset.mode = 'title'; sound.music(false); if (cam.active) cam.stop(); show('end', false); show('count', false); show('title', true); });

  // ---- loop
  function step(dt) {
    S.clock += dt;
    if (cam.fake) { const r = cam.tick(S.clock); if (r) G.onPose?.(r, S.clock, S); }
    if (S.mode === 'count') {
      const ready = !G.ready || G.ready(S) || S.waitT > 8;
      if (S.count > 1 || ready) S.count -= dt; else S.waitT += dt;
      const beat = Math.ceil(S.count);
      if (beat !== S.countBeat && beat > 0) { S.countBeat = beat; sound.tick(); }
      if (S.count <= 0) { S.mode = 'play'; document.body.dataset.mode = 'play'; show('count', false); sound.go(); G.onPlay?.(S); }
    } else if (S.mode === 'play') {
      S.left -= dt;
      if (S.left <= 0) { S.left = 0; G.update(dt, S); endRound(); return; }
    }
    if (S.mode !== 'title') G.update(dt, S);
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
    G.draw(c, S.W, S.H, S);
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
    $('timer').textContent = '⏱️' + Math.ceil(S.left);
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

  // ---- test hooks
  window.__game = {
    get state() { return { mode: S.mode, input: S.input, left: S.left, clock: S.clock, round: S.round, nTap: S.nTap, fps: S.fps, frameMs: S.frameMs, dpr: S.dpr, W: S.W, H: S.H, cam: cam.status, fake: cam.fake, detectMs: +(cam.detectMs || 0).toFixed(1), ...(G.state?.(S) || {}) }; },
    get players() { return cam.players.map((p) => ({ slot: p.slot, state: p.state, x: +p.x.toFixed(3), body: !!p.body })); },
    get results() { return S.lastResults || null; },
    start: (input, opts) => start(input, opts),
    fakeCamera: () => start('cam', { fake: true }),
    injectPeople: (list) => cam.inject(list),
    /** run the fixed-step sim for `sec` seconds synchronously (fake camera is sampled at 30 Hz of sim time) */
    simulate(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n && S.mode !== 'end'; i++) step(STEP); hud(); return this.state; },
    skipCount() { if (S.mode === 'count') { S.count = 0; step(STEP); } },
    setLeft(s) { S.left = s; },
    /** stop real-time stepping (tests drive time with simulate) */
    pause(p = true) { S.paused = !!p; },
    /** in-page: feed n fake frames (30 Hz) from a generator fn(i) -> landmark list, stepping the sim */
    feed(frames, gen) { for (let i = 0; i < frames; i++) { cam.inject(gen(i)); this.simulate(1 / 30); } return this.state; },
    end() { if (S.mode === 'play') { S.left = 0.001; step(STEP); } },
    again: () => newRound(),
    ar: () => S.W / S.H,
    sound, S, G,
  };
  return { S, cam, sound, toast, endRound, start };
}
