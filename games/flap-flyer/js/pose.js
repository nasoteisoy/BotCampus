// Webcam + MediaPipe PoseLandmarker (lazy-loaded from jsDelivr / Google storage), up to 4 people.
import { PoseMapper } from './poseMap.js';
import { PLAYER_COLORS } from './multi.js';
import { LockTracker, checkPerson, torsoHist, loadPick, saveLock, loadLock } from './track.js';
import { toBody } from './body.js';
import { pickWideFront } from './view.js';

const TV = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const LINES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
const DOTS = [11, 12, 13, 14, 15, 16];
// v4 tracking fix: the model looks for N + 1 people (N = the 👤 player count, default 2), the lock never makes more
// than N players (track.js LockTracker: roll call, shirt colour + size + motion matching, hold when close).
export const NUM_POSES = 4; // upper bound (N = 3 -> 4); the live value is PoseInput.numPoses
// status icons
export const ST = { off: '', loading: '⏳', track: '✅', none: '🙈', denied: '🚫', nocam: '🚫', tap: '👆', nomodel: '⚠️' };
// v3: kids further back (wider view) give weaker detections: detection + presence 0.5 -> 0.35. Ghosts stay out:
// a new player still needs face + both shoulders (visibility >= 0.5) for ~1 s (PeopleTracker), tracking stays 0.5.
export const POSE_OPTS = { minPoseDetectionConfidence: 0.35, minPosePresenceConfidence: 0.35, minTrackingConfidence: 0.5 };
// v3: no forced crop. v2 asked for 640 x 480 and Chrome (resizeMode crop-and-scale) cut a portrait phone frame
// (480x640) to 480x480. Now only a width hint + the camera's native modes.
export const VIDEO = { facingMode: 'user', width: { ideal: 640 }, resizeMode: { ideal: 'none' } };
async function failStatus(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    try { const p = await navigator.permissions?.query({ name: 'camera' }); if (p && p.state === 'prompt' && !navigator.userActivation?.isActive) return 'tap'; } catch (er) { /* unsupported */ }
    return 'denied';
  }
  return 'nocam';
}

let visionPromise = null;
function loadLandmarker(numPoses = NUM_POSES) {
  if (visionPromise) return visionPromise;
  visionPromise = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const files = await vision.FilesetResolver.forVisionTasks(TV + '/wasm');
    const make = (delegate) => vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses,
      ...POSE_OPTS,
    });
    try { return await make('GPU'); } catch (e) { console.info('[pose] GPU delegate failed, using CPU', e?.message); return await make('CPU'); }
  })();
  visionPromise.catch(() => (visionPromise = null));
  return visionPromise;
}

// MediaPipe's wasm prints INFO/W lines through console.error; route those to console.info so
// real errors stay visible.
let consolePatched = false;
function quietMediapipeLogs() {
  if (consolePatched) return; consolePatched = true;
  const orig = console.error.bind(console), origW = console.warn.bind(console);
  const isMP = (a) => typeof a[0] === 'string' && /^(INFO:|W\d{4}|I\d{4}|WARNING: All log messages before absl|Graph successfully|Created TensorFlow Lite|gl_context)/.test(a[0]);
  console.error = (...a) => (isMP(a) ? console.info('[mediapipe]', ...a) : orig(...a));
  console.warn = (...a) => (isMP(a) ? console.info('[mediapipe]', ...a) : origW(...a));
}
const SCREEN_SEC = 2.0; // v3 behaviour kept: a screen closes ~2 s after its kid leaves (the lock slot stays)
const IDLE = () => ({ lift: 0, bank: 0, flap: false, tracked: false });

export class PoseInput {
  constructor({ box, video, canvas, status, onStatus }) {
    this.box = box; this.video = video; this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.statusEl = status; this.onStatus = onStatus || (() => {});
    const q = new URLSearchParams(location.search), edge = q.has('edge') ? +q.get('edge') : NaN;
    this.tracker = new LockTracker(Number.isFinite(edge) ? { edge } : {});
    this.nPick = loadPick(); this.tracker.setN(this.nPick); this.importLock();
    this.events = []; this.fakeFrame = null; this.sampler = null; this.cands = []; this.lastT = 0;
    this.mappers = new Map(); // track id -> PoseMapper
    this.slots = [];          // slot -> { id, state, x, out, outT } for players with a bird (active or lost)
    this.active = false; this.stream = null; this.fake = false; this.fakeLms = [];
    this.out = IDLE(); this.outT = 0; // primary (lowest slot) player, v1-compatible
    this.lastVT = -1; this.lastRun = 0; this.status = 'off'; this.frames = 0; this.raw = 0;
    this.gen = 0; this.info = {}; this.fakeAr = 4 / 3;
  }
  /** width / height of the camera frame (fake camera: 4:3) */
  get ar() { const v = this.video; return !this.fake && v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : this.fakeAr; }
  get hasVideo() { return this.active && !this.fake && this.video.readyState >= 2 && this.video.videoWidth > 0; }
  /** players with a body for the hand-cursor menus: [{id, slot, body}] */
  get bodies() {
    const ar = this.ar, pl = this.tracker.players().filter((k) => k.lm && k.state !== 'lost').map((k) => ({ id: k.id, slot: k.slot, body: toBody(k.lm, ar) })).filter((p) => p.body);
    if (pl.length) return pl; // locked players drive the menus; before anyone is locked, the nearest person does
    const near = this.cands.filter((c) => c.age >= this.tracker.o.menuSec).sort((a, b) => b.sw - a.sw)[0];
    const body = near && toBody(near.lm, ar);
    return body ? [{ id: 'c' + near.id, slot: -1, body }] : [];
  }
  /** players + not-yet-players the preview draws: [{id, slot (-1 = not a player), state, x, lm, held}] */
  get tracks() { return [...this.tracker.players(), ...this.cands.map((c) => ({ id: c.id, slot: -1, state: 'cand', x: c.x, lm: c.lm }))]; }
  /** player count N (1..4): numPoses = N + 1 */
  setPlayers(n) {
    this.nPick = Math.max(1, Math.min(4, n | 0)); this.tracker.setN(this.nPick);
    try { this.landmarker?.setOptions?.({ numPoses: this.nPick + 1 })?.catch?.(() => {}); } catch (e) { console.info('[pose] numPoses not changed', e?.message); }
  }
  get numPoses() { return this.nPick + 1; }
  startRoll(n = this.nPick) { this.setPlayers(n); this.tracker.startRoll(n, this.lastT); }
  lockAuto(n = this.nPick, keep = false) { this.setPlayers(n); this.tracker.lockAuto(n, this.lastT, keep); }
  importLock() { const L = loadLock(); if (L && this.tracker.importLock(L, this.lastT || 0)) { this.nPick = this.tracker.n; return true; } return false; }
  get phase() { return this.tracker.phase; }
  get frameEl() { return this.fake ? this.fakeFrame : this.hasVideo ? this.video : null; }
  _grab() {
    const src = this.frameEl; if (!src) return null;
    const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height; if (!sw || !sh) return null;
    const W = 160, H = Math.max(40, Math.round((160 * sh) / sw));
    if (!this.sampler) { this.sampler = document.createElement('canvas'); this.sctx = this.sampler.getContext('2d', { willReadFrequently: true }); }
    if (this.sampler.width !== W || this.sampler.height !== H) { this.sampler.width = W; this.sampler.height = H; }
    try { this.sctx.drawImage(src, 0, 0, W, H); return this.sctx.getImageData(0, 0, W, H); } catch (e) { return null; }
  }
  /** preview box takes the frame's aspect, so the WHOLE frame shows (no cover crop) */
  _fitBox() {
    const ar = this.ar; this.box.style.setProperty('--car', ar.toFixed(4));
    const w = 320, h = Math.round(w / ar);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
  }
  get mapper() { return this.mappers.values().next().value || new PoseMapper(); }
  _set(s) { this.status = s; this.statusEl.textContent = ST[s]; this.onStatus(s); }
  _resetPeople() { this.tracker.reset(); this.tracker.setN(this.nPick); if (!this.fake) this.importLock(); this.mappers.clear(); this.slots = []; this.cands = []; this.out = IDLE(); this.raw = 0; }
  async start() {
    if (this.active && !this.fake) return true;
    const gen = ++this.gen, stale = () => gen !== this.gen;
    this.active = true; this.fake = false; this.box.classList.remove('hidden'); this.box.classList.remove('fake'); this._set('loading');
    this._resetPeople(); this.info = {};
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no getUserMedia'), { name: 'NotFoundError' });
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { ...VIDEO }, audio: false });
    } catch (e) {
      console.info('[pose] camera unavailable:', e?.name || e);
      if (stale()) return false;
      this.active = false; this._set(await failStatus(e));
      setTimeout(() => { if (!this.active) this.box.classList.add('hidden'); }, 2500);
      return false;
    }
    if (stale() || !this.active) { this._stopTracks(); return false; }
    await this._widen();
    if (stale()) { if (this.stream && (!this.active || this.fake)) this._stopTracks(); return false; }
    if (!this.stream) { this.active = false; this._set('nocam'); return false; }
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch (e) { /* autoplay with muted should work */ }
    this._fitBox();
    this.video.addEventListener('loadedmetadata', () => this._fitBox(), { once: true });
    quietMediapipeLogs();
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('model load timeout')), 30000));
      this.landmarker = await Promise.race([loadLandmarker(this.numPoses), timeout]);
      this.setPlayers(this.nPick);
      if (!stale() && this.active) this._set('none');
    } catch (e) {
      console.info('[pose] model unavailable, keys/touch still work:', e?.message || e);
      if (!stale() && this.active) this._set('nomodel');
    }
    return !stale();
  }
  /** widest view the device offers: ultra-wide front camera (by label) + minimum zoom when the track reports zoom */
  async _widen() {
    const md = navigator.mediaDevices;
    let track = this.stream?.getVideoTracks?.()[0];
    try {
      const wide = md.enumerateDevices ? pickWideFront(await md.enumerateDevices(), track?.getSettings?.().deviceId) : null;
      if (wide) {
        const { facingMode, ...rest } = VIDEO;
        this._stopTracks(); // many phones can't open two cameras at once
        try {
          this.stream = await md.getUserMedia({ video: { ...rest, deviceId: { exact: wide.deviceId } }, audio: false });
          this.info.switched = true; this.info.device = wide.label;
        } catch (e) {
          console.info('[pose] wide camera failed, using the default one:', e?.name || e);
          this.stream = await md.getUserMedia({ video: { ...VIDEO }, audio: false });
        }
        track = this.stream.getVideoTracks()[0];
      }
    } catch (e) { console.info('[pose] wide camera switch skipped:', e?.name || e); }
    try {
      const z = track?.getCapabilities?.().zoom;
      if (z && Number.isFinite(z.min)) { this.info.zoomMin = z.min; await track.applyConstraints({ advanced: [{ zoom: z.min }] }); this.info.zoom = z.min; }
    } catch (e) { console.info('[pose] zoom not applied:', e?.name || e); }
    try { this.info.settings = track?.getSettings?.() || null; if (!this.info.device) this.info.device = track?.label || ''; } catch (e) { /* ignore */ }
  }
  /** Test hook: no camera / model; landmarks come from inject(). */
  startFake() {
    if (this.active && !this.fake) this.stop();
    this.gen++; this.active = true; this.fake = true; this._resetPeople(); this._fitBox();
    this.box.classList.remove('hidden'); this.box.classList.add('fake'); this._set('none');
  }
  /** Test hook: array of 33-landmark arrays (raw MediaPipe image coords), kept until the next inject. */
  inject(list) { this.fakeLms = Array.isArray(list) ? list : []; }
  _stopTracks() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; }
  stop() {
    this.gen++; this.active = false; this.fake = false; this._stopTracks(); this.video.srcObject = null;
    this.box.classList.add('hidden'); this._set('off');
    this._resetPeople();
  }
  // called every animation frame; runs detection at ~30 Hz. Returns the per-slot outputs of this run, or null.
  tick(nowMs) {
    if (!this.active) return null;
    let list;
    if (this.fake) {
      if (nowMs - this.lastRun < 30) return null;
      this.lastRun = nowMs;
      list = this.fakeLms;
    } else {
      if (!this.landmarker) return null;
      const v = this.video;
      if (v.readyState < 2 || nowMs - this.lastRun < 30 || v.currentTime === this.lastVT) return null;
      this.lastRun = nowMs; this.lastVT = v.currentTime;
      try {
        const res = this.landmarker.detectForVideo(v, nowMs);
        list = res?.landmarks || [];
      } catch (e) { console.info('[pose] detect failed', e?.message); return null; }
    }
    return this.process(list, nowMs);
  }
  process(list, nowMs) {
    const t = nowMs / 1000;
    this.frames++; this.lastT = t;
    const ar = this.ar, chk = (list || []).map((lm) => checkPerson(lm, ar, this.tracker.o));
    if (chk.some((r) => r.ok)) { const img = this._grab(); if (img) for (const r of chk) if (r.ok) r.det.hist = torsoHist(img, r.det.lm, ar, this.tracker.o); }
    this.raw = chk.filter((r) => r.ok).length;
    const tracks = this.tracker.update(chk, t, ar);
    this.events = this.tracker.events.slice();
    if (this.events.some((e) => e.type === 'lock' || e.type === 'swap' || e.type === 'locked')) saveLock(this.tracker.exportLock());
    this.cands = this.tracker.candidates().map((c) => ({ id: c.id, x: c.x, sw: c.sw, lm: c.lm, age: t - c.firstSeen, persisted: c.persisted }));
    const alive = new Set(tracks.map((k) => k.id));
    for (const id of [...this.mappers.keys()]) if (!alive.has(id)) this.mappers.delete(id);
    const res = [];
    this.slots = [];
    for (const k of tracks) {
      let m = this.mappers.get(k.id);
      if (!m) { m = new PoseMapper(); this.mappers.set(k.id, m); }
      // held (kids close together) = last good pose, no new flaps; lost = bird hovers (main.js 'away')
      let out;
      if (k.state === 'active' && k.lm) out = m.last = m.update(k.lm, t);
      else out = { ...(m.last || IDLE()), flap: false, tracked: k.state === 'held' };
      // a kid gone for SCREEN_SEC loses the screen (split view closes) but keeps the slot: back in view -> same bird
      const gone = k.state === 'lost' && k.lostFor >= SCREEN_SEC;
      const e = { slot: k.slot, id: k.id, state: k.state, held: k.held, gone, x: k.x, out, outT: nowMs };
      this.slots[k.slot] = e; res.push(e);
    }
    const primary = res[0];
    this.out = primary ? primary.out : IDLE(); this.outT = nowMs;
    const s = res.some((e) => e.out.tracked) || this.cands.length ? 'track' : 'none';
    if (s !== this.status) this._set(s);
    this._draw();
    return res;
  }
  /** players with a bird, for the game: [{slot, id, state, x, out, outT}] */
  get players() { return this.slots.filter((e) => e && !e.gone); }
  _draw() {
    const c = this.ctx, w = this.cv.width, h = this.cv.height;
    c.clearRect(0, 0, w, h);
    if (this.fake) { c.fillStyle = '#3a332b'; c.fillRect(0, 0, w, h); }
    const ok = (p) => p && (p.visibility === undefined || p.visibility > 0.5);
    for (const k of this.tracks) {
      const lm = k.lm; if (!lm) continue;
      const col = k.slot >= 0 ? PLAYER_COLORS[k.slot].css : '#ffffff';
      // outline box around head + shoulders
      const xs = [], ys = [];
      for (const i of [0, 2, 5, 7, 8, 11, 12]) if (ok(lm[i])) { xs.push(lm[i].x * w); ys.push(lm[i].y * h); }
      if (xs.length) {
        const sw = Math.abs(lm[11].x - lm[12].x) * w;
        const x0 = Math.min(...xs) - sw * 0.25, x1 = Math.max(...xs) + sw * 0.25, y0 = Math.min(...ys) - sw * 0.55, y1 = Math.max(...ys) + sw * 0.35;
        c.lineWidth = 5; c.strokeStyle = col; c.setLineDash(k.slot >= 0 ? (k.state === 'lost' ? [4, 6] : []) : [8, 8]);
        if (k.state === 'held') { c.save(); c.strokeStyle = '#ffb020'; c.lineWidth = 9; c.globalAlpha = 0.6; c.strokeRect(x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10); c.restore(); }
        c.beginPath(); c.roundRect ? c.roundRect(x0, y0, x1 - x0, y1 - y0, 12) : c.rect(x0, y0, x1 - x0, y1 - y0); c.stroke();
        c.setLineDash([]);
        // number tag (canvas is mirrored by CSS, so un-mirror the text)
        const label = k.slot >= 0 ? String(k.slot + 1) : '…';
        const r = 17, cx = (x0 + x1) / 2, cy = y0 - 2;
        c.fillStyle = col; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
        c.save(); c.translate(cx, cy); c.scale(-1, 1);
        c.fillStyle = k.slot >= 0 ? '#fff' : '#3a332b'; c.font = 'bold 22px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(label, 0, 1); c.restore();
      }
      c.lineWidth = 4; c.strokeStyle = k.slot >= 0 ? col : '#ffffffaa'; c.lineCap = 'round';
      for (const [a, b] of LINES) {
        const A = lm[a], B = lm[b]; if (!ok(A) || !ok(B)) continue;
        c.beginPath(); c.moveTo(A.x * w, A.y * h); c.lineTo(B.x * w, B.y * h); c.stroke();
      }
      c.fillStyle = '#ffe14a';
      for (const i of DOTS) { const p = lm[i]; if (!ok(p)) continue; c.beginPath(); c.arc(p.x * w, p.y * h, 5, 0, 7); c.fill(); }
    }
  }
}
