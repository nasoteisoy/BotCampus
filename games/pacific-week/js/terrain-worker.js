import { computeTerrain } from './terrain.js';
self.onmessage = (e) => {
  const { islands, W, H, scale } = e.data;
  const t = computeTerrain(islands, W, H, scale);
  self.postMessage(t, [t.data.buffer]);
};
