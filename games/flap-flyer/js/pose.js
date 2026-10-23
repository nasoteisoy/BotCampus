// Webcam + MediaPipe PoseLandmarker (lazy-loaded from jsDelivr / Google storage), up to 4 people.
import { PoseMapper } from './poseMap.js';
import { PeopleTracker, personFromLandmarks, PLAYER_COLORS } from './multi.js';

const TV = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const LINES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
const DOTS = [11, 12, 13, 14, 15, 16];
export const NUM_POSES = 4;
// status icons
export const ST = { off: '', loading: '⏳', track: '✅', none: '🙈', denied: '🚫', nomodel: '⚠️' };

let visionPromise = null;
function loadLandmarker() {
  if (visionPromise) return visionPromise;
  visionPromise = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const files = await vision.FilesetResolver.forVisionTasks(TV + '/wasm');
    const make = (delegate) => vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: NUM_POSES,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
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
const IDLE = () => ({ lift: 0, bank: 0, flap: false, tracked: false });

export class PoseInput {
  constructor({ box, video, canvas, status, onStatus }) {
    this.box = box; this.video = video; this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.statusEl = status; this.onStatus = onStatus || (() => {});
    this.tracker = new PeopleTracker();
    this.mappers = new Map(); // track id -> PoseMapper
    this.slots = [];          // slot -> { id, state, x, out, outT } for players with a bird (active or lost)
    this.active = false; this.stream = null; this.fake = false; this.fakeLms = [];
    this.out = IDLE(); this.outT = 0; // primary (lowest slot) player, v1-compatible
    this.lastVT = -1; this.lastRun = 0; this.status = 'off'; this.frames = 0; this.raw = 0;
  }
  get mapper() { return this.mappers.values().next().value || new PoseMapper(); }
  _set(s) { this.status = s; this.statusEl.textContent = ST[s]; this.onStatus(s); }
  _resetPeople() { this.tracker.reset(); this.mappers.clear(); this.slots = []; this.out = IDLE(); this.raw = 0; }
  async start() {
    if (this.active) return true;
    this.active = true; this.fake = false; this.box.classList.remove('hidden'); this.box.classList.remove('fake'); this._set('loading');
    this._resetPeople();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no getUserMedia');
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (e) {
      console.info('[pose] camera unavailable:', e?.name || e);
      this._set('denied'); this.active = false;
      setTimeout(() => { if (!this.active) this.box.classList.add('hidden'); }, 2500);
      return false;
    }
    if (!this.active) { this._stopTracks(); return false; }
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch (e) { /* autoplay with muted should work */ }
    quietMediapipeLogs();
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('model load timeout')), 30000));
      this.landmarker = await Promise.race([loadLandmarker(), timeout]);
      if (this.active) this._set('none');
    } catch (e) {
      console.info('[pose] model unavailable, keys/touch still work:', e?.message || e);
      if (this.active) this._set('nomodel');
    }
    return true;
  }
  /** Test hook: no camera / model; landmarks come from inject(). */
  startFake() {
    if (this.active && !this.fake) this.stop();
    this.active = true; this.fake = true; this._resetPeople();
    this.box.classList.remove('hidden'); this.box.classList.add('fake'); this._set('none');
  }
  /** Test hook: array of 33-landmark arrays (raw MediaPipe image coords), kept until the next inject. */
  inject(list) { this.fakeLms = Array.isArray(list) ? list : []; }
  _stopTracks() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; }
  stop() {
    this.active = false; this.fake = false; this._stopTracks(); this.video.srcObject = null;
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
    this.frames++;
    const people = [];
    for (const lm of list || []) { const p = personFromLandmarks(lm); if (p) { p.lm = lm; people.push(p); } }
    this.raw = people.filter((p) => p.face).length;
    const players = this.tracker.update(people, t);
    const alive = new Set(this.tracker.tracks.map((k) => k.id));
    for (const id of [...this.mappers.keys()]) if (!alive.has(id)) this.mappers.delete(id);
    const res = [];
    this.slots = [];
    for (const k of players) {
      let m = this.mappers.get(k.id);
      if (!m) { m = new PoseMapper(); this.mappers.set(k.id, m); }
      const out = m.update(k.lm, t);
      const e = { slot: k.slot, id: k.id, state: k.state, x: k.x, out, outT: nowMs };
      this.slots[k.slot] = e; res.push(e);
    }
    const primary = res[0];
    this.out = primary ? primary.out : IDLE(); this.outT = nowMs;
    const s = res.some((e) => e.out.tracked) ? 'track' : 'none';
    if (s !== this.status) this._set(s);
    this._draw();
    return res;
  }
  /** players with a bird, for the game: [{slot, id, state, x, out, outT}] */
  get players() { return this.slots.filter(Boolean); }
  _draw() {
    const c = this.ctx, w = this.cv.width, h = this.cv.height;
    c.clearRect(0, 0, w, h);
    if (this.fake) { c.fillStyle = '#3a332b'; c.fillRect(0, 0, w, h); }
    const ok = (p) => p && (p.visibility === undefined || p.visibility > 0.5);
    for (const k of this.tracker.tracks) {
      const lm = k.lm; if (!lm) continue;
      const col = k.slot >= 0 ? PLAYER_COLORS[k.slot].css : '#ffffff';
      // outline box around head + shoulders
      const xs = [], ys = [];
      for (const i of [0, 2, 5, 7, 8, 11, 12]) if (ok(lm[i])) { xs.push(lm[i].x * w); ys.push(lm[i].y * h); }
      if (xs.length) {
        const sw = Math.abs(lm[11].x - lm[12].x) * w;
        const x0 = Math.min(...xs) - sw * 0.25, x1 = Math.max(...xs) + sw * 0.25, y0 = Math.min(...ys) - sw * 0.55, y1 = Math.max(...ys) + sw * 0.35;
        c.lineWidth = 5; c.strokeStyle = col; c.setLineDash(k.slot >= 0 ? (k.state === 'lost' ? [4, 6] : []) : [8, 8]);
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
