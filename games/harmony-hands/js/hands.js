// MediaPipe Tasks Vision HandLandmarker (free CDN: jsDelivr + Google model storage).
// Video frames stay on the device: they go straight from <video> into the in-browser model.
const TV = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let patched = false;
function quietMediapipeLogs() { // the wasm prints INFO/W lines through console.error
  if (patched) return; patched = true;
  const isMP = (a) => typeof a[0] === 'string' && /^(INFO:|W\d{4}|I\d{4}|E\d{4}.*(gl_context|landmark)|WARNING: All log messages before absl|Graph successfully|Created TensorFlow Lite|gl_context)/.test(a[0]);
  const oe = console.error.bind(console), ow = console.warn.bind(console);
  console.error = (...a) => (isMP(a) ? console.info('[mediapipe]', ...a) : oe(...a));
  console.warn = (...a) => (isMP(a) ? console.info('[mediapipe]', ...a) : ow(...a));
}

export async function loadHandLandmarker() {
  quietMediapipeLogs();
  const vision = await import(TV + '/vision_bundle.mjs');
  const files = await vision.FilesetResolver.forVisionTasks(TV + '/wasm');
  const make = (delegate) => vision.HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 1,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { return await make('GPU'); } catch (e) { console.info('[hands] GPU failed, using CPU', e && e.message); return make('CPU'); }
}

const PALM = [0, 5, 9, 13, 17];
/** point on the hand in raw video coords (0..1, not mirrored). mode 'tip' = index fingertip, 'palm' = palm centre */
export function handPoint(lms, mode) {
  if (mode === 'tip') return { x: lms[8].x, y: lms[8].y };
  let x = 0, y = 0; for (const i of PALM) { x += lms[i].x; y += lms[i].y; }
  return { x: x / PALM.length, y: y / PALM.length };
}
/** raw video coords -> stage coords (0..1) for a mirrored, object-fit:cover video */
export function videoToStage(p, vw, vh, sw, sh) {
  const s = Math.max(sw / vw, sh / vh), dw = vw * s, dh = vh * s;
  return { x: ((1 - p.x) * dw + (sw - dw) / 2) / sw, y: (p.y * dh + (sh - dh) / 2) / sh };
}

export class HandTracker {
  constructor(video, onPoint, onStatus) {
    Object.assign(this, { video, onPoint, onStatus });
    this.mode = 'tip'; this.running = false; this.lm = null; this.lastT = -1; this.sm = null; this.lostAt = 0; this.fps = 0;
  }
  async start() {
    this.running = true; this.onStatus('loading');
    try { this.lm = await loadHandLandmarker(); } catch (e) { console.info('[hands] model failed', e); this.onStatus('nomodel'); return false; }
    if (!this.running) return false;
    this.onStatus('none');
    const loop = () => { if (!this.running) return; this.tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    return true;
  }
  stop() { this.running = false; this.onPoint(null); }
  tick() {
    const v = this.video;
    if (!this.lm || v.readyState < 2 || !v.videoWidth) return;
    if (v.currentTime === this.lastT) return;
    this.lastT = v.currentTime;
    const now = performance.now();
    let res; try { res = this.lm.detectForVideo(v, now); } catch (e) { return; }
    this.frames = (this.frames || 0) + 1;
    const lms = res && res.landmarks && res.landmarks[0];
    if (!lms) {
      if (this.sm && now - this.lostAt > 250) { this.sm = null; this.onPoint(null); this.onStatus('none'); }
      if (this.sm && !this.lostAt) this.lostAt = now;
      return;
    }
    this.lostAt = 0;
    const r = this.video.getBoundingClientRect();
    const p = videoToStage(handPoint(lms, this.mode), v.videoWidth, v.videoHeight, r.width, r.height);
    this.sm = this.sm ? { x: this.sm.x + 0.6 * (p.x - this.sm.x), y: this.sm.y + 0.6 * (p.y - this.sm.y) } : p;
    this.onStatus('track');
    this.onPoint(this.sm);
  }
}
