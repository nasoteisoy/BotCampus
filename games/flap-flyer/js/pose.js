// Webcam + MediaPipe PoseLandmarker (lazy-loaded from jsDelivr / Google storage).
import { PoseMapper } from './poseMap.js';

const TV = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const LINES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
const DOTS = [11, 12, 13, 14, 15, 16];
// status icons
export const ST = { off: '', loading: '⏳', track: '✅', none: '🙈', denied: '🚫', nomodel: '⚠️' };

let visionPromise = null;
function loadLandmarker() {
  if (visionPromise) return visionPromise;
  visionPromise = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const files = await vision.FilesetResolver.forVisionTasks(TV + '/wasm');
    const make = (delegate) => vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1,
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

export class PoseInput {
  constructor({ box, video, canvas, status, onStatus }) {
    this.box = box; this.video = video; this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.statusEl = status; this.onStatus = onStatus || (() => {});
    this.mapper = new PoseMapper();
    this.active = false; this.stream = null; this.lm = null;
    this.out = { lift: 0, bank: 0, flap: false, tracked: false }; this.outT = 0;
    this.lastVT = -1; this.lastRun = 0; this.status = 'off'; this.frames = 0;
  }
  _set(s) { this.status = s; this.statusEl.textContent = ST[s]; this.onStatus(s); }
  async start() {
    if (this.active) return true;
    this.active = true; this.box.classList.remove('hidden'); this._set('loading');
    this.mapper.reset();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no getUserMedia');
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
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
  _stopTracks() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; }
  stop() {
    this.active = false; this._stopTracks(); this.video.srcObject = null;
    this.box.classList.add('hidden'); this._set('off'); this.lm = null;
    this.out = { lift: 0, bank: 0, flap: false, tracked: false };
  }
  // called every animation frame; runs detection at ~30 Hz
  tick(nowMs) {
    if (!this.active || !this.landmarker) return null;
    const v = this.video;
    if (v.readyState < 2 || nowMs - this.lastRun < 30 || v.currentTime === this.lastVT) return null;
    this.lastRun = nowMs; this.lastVT = v.currentTime;
    let lm = null;
    try {
      const res = this.landmarker.detectForVideo(v, nowMs);
      lm = res?.landmarks?.[0] || null;
    } catch (e) { console.info('[pose] detect failed', e?.message); return null; }
    this.frames++;
    this.lm = lm;
    const out = this.mapper.update(lm, nowMs / 1000);
    this.out = out; this.outT = nowMs;
    const s = out.tracked ? 'track' : 'none';
    if (s !== this.status) this._set(s);
    this._draw(lm);
    return out;
  }
  _draw(lm) {
    const c = this.ctx, w = this.cv.width, h = this.cv.height;
    c.clearRect(0, 0, w, h);
    if (!lm) return;
    const ok = (p) => p && (p.visibility === undefined || p.visibility > 0.5);
    c.lineWidth = 4; c.strokeStyle = '#38e6ff'; c.lineCap = 'round';
    for (const [a, b] of LINES) {
      const A = lm[a], B = lm[b]; if (!ok(A) || !ok(B)) continue;
      c.beginPath(); c.moveTo(A.x * w, A.y * h); c.lineTo(B.x * w, B.y * h); c.stroke();
    }
    c.fillStyle = '#ffe14a';
    for (const i of DOTS) { const p = lm[i]; if (!ok(p)) continue; c.beginPath(); c.arc(p.x * w, p.y * h, 6, 0, 7); c.fill(); }
  }
}
