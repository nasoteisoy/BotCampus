// Face memory worker (face.js): 128-d face descriptors from small head crops, off the main thread.
// @vladmandic/face-api (MIT; bundles TensorFlow.js) with its tiny face detector, tiny 68-point landmarks and face
// recognition nets, all from jsDelivr (then browser-cached). Nothing leaves the device: crops come in from the tab,
// 128 numbers go back to the tab. Nothing is stored.
const BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15';
let F = null, opts = null, ready = null, queue = Promise.resolve();
async function init() {
  const t0 = performance.now();
  F = await import(BASE + '/dist/face-api.esm.js');
  // a worker has no DOM: tensors go in, so OffscreenCanvas is all face-api / tfjs need
  F.env.setEnv({
    Canvas: globalThis.OffscreenCanvas || class {}, CanvasRenderingContext2D: globalThis.OffscreenCanvasRenderingContext2D || class {},
    Image: class {}, ImageData: globalThis.ImageData || class {}, Video: class {},
    createCanvasElement: () => new OffscreenCanvas(1, 1), createImageElement: () => ({}), createVideoElement: () => ({}),
    fetch: (...a) => fetch(...a), readFile: () => Promise.reject(new Error('no files')),
  });
  let backend = 'webgl';
  try { if (typeof OffscreenCanvas === 'undefined' || !(await F.tf.setBackend('webgl'))) throw new Error('no webgl'); await F.tf.ready(); }
  catch (e) { backend = 'cpu'; await F.tf.setBackend('cpu'); await F.tf.ready(); }
  const M = BASE + '/model/';
  await Promise.all([F.nets.tinyFaceDetector.loadFromUri(M), F.nets.faceLandmark68TinyNet.loadFromUri(M), F.nets.faceRecognitionNet.loadFromUri(M)]);
  opts = new F.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.35 });
  // warm-up: compile every net once now, not in the middle of a game
  const T = F.tf.zeros([150, 150, 3]);
  try { await describe({ width: 160, height: 160, data: new Uint8Array(160 * 160 * 4) }); await F.nets.faceLandmark68TinyNet.detectLandmarks(T); await F.nets.faceRecognitionNet.computeFaceDescriptor(T); } catch (e) { /* warm-up only */ } finally { T.dispose(); }
  postMessage({ type: 'ready', backend, ms: Math.round(performance.now() - t0) });
}
async function describe(px) {
  const T = F.tf.browser.fromPixels(px);
  try {
    const r = await F.detectSingleFace(T, opts).withFaceLandmarks(true).withFaceDescriptor();
    return r ? { desc: r.descriptor, score: r.detection.score } : null;
  } finally { T.dispose(); }
}
onmessage = (e) => {
  const m = e.data || {};
  if (m.type === 'init') { ready ||= init().catch((err) => postMessage({ type: 'fail', why: String(err?.message || err) })); return; }
  if (m.type === 'desc') queue = queue.then(async () => {
    const t0 = performance.now(); let r = null;
    try { await ready; r = await describe({ width: m.w, height: m.h, data: new Uint8Array(m.data) }); } catch (err) { r = null; }
    postMessage({ type: 'res', gen: m.gen, id: m.id, desc: r ? Array.from(r.desc) : null, score: r ? r.score : 0, ms: Math.round(performance.now() - t0) });
  });
};
