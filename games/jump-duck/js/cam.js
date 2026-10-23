// Webcam + MediaPipe PoseLandmarker (free CDN: jsDelivr + Google model storage), up to 4 people.
// Adapted from Flap Flyer v2 js/pose.js. Video never leaves the device: frames go straight from
// <video> into the in-browser WASM/GPU model.
import { PeopleTracker, personFromLandmarks, PLAYER_COLORS } from './multi.js';
import { toBody } from './body.js';
import { pickWideFront } from './view.js';

const TV = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
export const NUM_POSES = 4;
// Small / far-away kids (whole body in frame on a wide view) give weaker detections: detection and presence
// are loosened from 0.5 to 0.35. Ghosts stay out because a new player still needs face + both shoulders at
// visibility >= 0.5 for a full second (PeopleTracker / personFromLandmarks), and tracking stays at 0.5.
export const POSE_OPTS = { minPoseDetectionConfidence: 0.35, minPosePresenceConfidence: 0.35, minTrackingConfidence: 0.5 };
// No forced crop: v1 asked for width 640 AND height 480, and Chrome (resizeMode crop-and-scale) cut a portrait
// phone frame (480x640) down to 480x480. Now only a width hint + native modes (resizeMode 'none').
export const VIDEO = { facingMode: 'user', width: { ideal: 640 }, resizeMode: { ideal: 'none' } };
export const ST = { off: '', loading: '⏳', track: '✅', none: '🙈', denied: '🚫', nocam: '🚫', tap: '👆', nomodel: '⚠️' };

/** why getUserMedia failed -> status. A NotAllowedError while permission is still 'prompt' means the browser
 *  wants a user gesture first (some mobile browsers / iframes): ask for one tap instead of giving up.
 *  Right after a tap it means the kid / parent said no (or closed the prompt): denied. */
async function failStatus(e) {
  const n = e?.name || '';
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'NotReadableError') return 'nocam';
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    try { const p = await navigator.permissions?.query({ name: 'camera' }); if (p && p.state === 'prompt' && !navigator.userActivation?.isActive) return 'tap'; } catch (er) { /* unsupported */ }
    return 'denied';
  }
  return 'nocam';
}
let visionPromise = null;
function loadLandmarker() {
  if (visionPromise) return visionPromise;
  visionPromise = (async () => {
    const vision = await import(TV + '/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(TV + '/wasm');
    const make = (delegate) => vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: NUM_POSES,
      ...POSE_OPTS,
    });
    try { return await make('GPU'); } catch (e) { console.info('[pose] GPU delegate failed, using CPU', e?.message); return await make('CPU'); }
  })();
  visionPromise.catch(() => (visionPromise = null));
  return visionPromise;
}
// MediaPipe's wasm prints INFO/W lines through console.error; route those to console.info.
let patched = false;
function quietMediapipeLogs() {
  if (patched) return; patched = true;
  const orig = console.error.bind(console), origW = console.warn.bind(console);
  const isMP = (a) => typeof a[0] === 'string' && /^(INFO:|W\d{4}|I\d{4}|WARNING: All log messages before absl|Graph successfully|Created TensorFlow Lite|gl_context)/.test(a[0]);
  console.error = (...a) => (isMP(a) ? console.info('[mediapipe]', ...a) : orig(...a));
  console.warn = (...a) => (isMP(a) ? console.info('[mediapipe]', ...a) : origW(...a));
}

export class Camera {
  constructor({ video, onStatus } = {}) {
    this.video = video; this.onStatus = onStatus || (() => {});
    this.tracker = new PeopleTracker();
    this.active = false; this.fake = false; this.fakeLms = []; this.fakeAr = 4 / 3; this.fakeSize = null;
    this.info = { zoom: null, zoomMin: null, device: '', switched: false, settings: null };
    this.stream = null; this.landmarker = null; this.status = 'off'; this.gen = 0;
    this.players = []; this.lastRun = -1; this.lastVT = -1; this.frames = 0; this.detectMs = 0;
  }
  _set(s) { if (s !== this.status) { this.status = s; this.onStatus(s); } }
  get ar() {
    if (this.fake) return this.fakeSize ? this.fakeSize.w / this.fakeSize.h : this.fakeAr;
    const v = this.video; return v && v.videoWidth ? v.videoWidth / v.videoHeight : 4 / 3;
  }
  get frameSize() {
    if (this.fake) return this.fakeSize;
    const v = this.video; return v && v.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : null;
  }
  get hasVideo() { return !this.fake && this.active && this.video && this.video.readyState >= 2; }
  reset() { this.tracker.reset(); this.players = []; }
  /** Start the webcam + model. Resolves true when video runs. Failure statuses: 'tap' (browser wants a tap
   *  first - call start() again from a click), 'denied' (permission refused), 'nocam' (no camera). */
  async start() {
    if (this.active && !this.fake) return true;
    const gen = ++this.gen; // a later stop()/startFake() makes this (async) start a no-op
    this.active = true; this.fake = false; this.reset(); this._set('loading');
    const stale = () => gen !== this.gen;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no getUserMedia'), { name: 'NotFoundError' });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { ...VIDEO }, audio: false });
      if (stale()) { stream.getTracks().forEach((t) => t.stop()); return false; }
      this.stream = stream;
    } catch (e) {
      console.info('[pose] camera unavailable:', e?.name || e);
      if (stale()) return false;
      this.active = false; this._set(await failStatus(e)); return false;
    }
    await this._widen();
    if (stale()) { if (this.stream && (!this.active || this.fake)) this._stopTracks(); return false; }
    if (!this.stream) { this.active = false; this._set('denied'); return false; }
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch (e) { /* muted autoplay */ }
    quietMediapipeLogs();
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('model load timeout')), 30000));
      this.landmarker = await Promise.race([loadLandmarker(), timeout]);
      if (!stale() && this.active) this._set('none');
    } catch (e) {
      console.info('[pose] model unavailable, tap/keys still work:', e?.message || e);
      if (!stale() && this.active) this._set('nomodel');
    }
    return !stale();
  }
  /** Show as much of the room as the hardware allows: switch to an ultra-wide front camera when one is
   *  listed, then set the lowest zoom the track supports. Never fails the start. */
  async _widen() {
    const md = navigator.mediaDevices;
    let track = this.stream?.getVideoTracks?.()[0];
    try {
      const wide = md.enumerateDevices ? pickWideFront(await md.enumerateDevices(), track?.getSettings?.().deviceId) : null;
      if (wide) {
        // many phones can't open two cameras at once: close the default one first, fall back to it on failure
        const { facingMode, ...rest } = VIDEO;
        this._stopTracks();
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
      if (z && Number.isFinite(z.min)) {
        this.info.zoomMin = z.min;
        await track.applyConstraints({ advanced: [{ zoom: z.min }] });
        this.info.zoom = z.min;
      }
    } catch (e) { console.info('[pose] zoom not applied:', e?.name || e); }
    try { this.info.settings = track?.getSettings?.() || null; if (!this.info.device) this.info.device = track?.label || ''; } catch (e) { /* ignore */ }
  }
  /** Test hook: no webcam / model; landmarks come from inject(). ar = virtual frame aspect.
   *  setFakeFrame(w, h) pins a real-camera-like frame size (e.g. 640x480) so the contain fit is exercised. */
  startFake(ar = 4 / 3) { if (this.active && !this.fake) this.stop(); this.gen++; this.active = true; this.fake = true; this.fakeAr = ar; this.reset(); this._set('none'); }
  setFakeFrame(w, h) { this.fakeSize = w && h ? { w, h } : null; }
  inject(list) { this.fakeLms = Array.isArray(list) ? list : []; }
  _stopTracks() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; }
  stop() { this.gen++; this.active = false; this.fake = false; this._stopTracks(); if (this.video) this.video.srcObject = null; this.reset(); this._set('off'); }
  /** Run detection at most ~30 Hz. t = game clock (s). Returns players (new detection) or null. */
  tick(t) {
    if (!this.active) return null;
    // ≤ 30 Hz; on slow devices back off so detection uses at most ~40 % of the time and drawing stays smooth
    const gap = this.fake ? 1 / 31 : Math.max(1 / 31, (this.detectMs || 0) * 2.5 / 1000);
    if (t - this.lastRun < gap) return null;
    let list;
    if (this.fake) list = this.fakeLms;
    else {
      if (!this.landmarker) return null;
      const v = this.video;
      if (v.readyState < 2 || v.currentTime === this.lastVT) return null;
      this.lastVT = v.currentTime;
      const t0 = performance.now();
      try { list = this.landmarker.detectForVideo(v, t0)?.landmarks || []; }
      catch (e) { console.info('[pose] detect failed', e?.message); return null; }
      const ms = performance.now() - t0;
      this.detectMs = this.detectMs ? this.detectMs * 0.9 + ms * 0.1 : Math.min(ms, 100);
    }
    this.lastRun = t;
    return this.process(list, t);
  }
  process(list, t) {
    this.frames++;
    const ar = this.ar, people = [];
    for (const lm of list || []) { const p = personFromLandmarks(lm); if (p) { p.lm = lm; people.push(p); } }
    const tracks = this.tracker.update(people, t);
    this.players = tracks.map((k) => ({
      slot: k.slot, id: k.id, state: k.state, x: k.x, color: PLAYER_COLORS[k.slot], body: k.lm ? toBody(k.lm, ar) : null,
    }));
    this._set(this.players.some((p) => p.body) ? 'track' : 'none');
    return this.players;
  }
  /** people the camera sees but who haven't joined yet (for a "hold still" ghost) */
  get pending() { return this.tracker.tracks.filter((k) => k.slot < 0 && k.lm).map((k) => ({ body: toBody(k.lm, this.ar) })); }
}
