import { computeTerrain } from './terrain.js?v=9c';
self.onmessage = (e) => {
  const { islands, W, H, scale } = e.data;
  const t = computeTerrain(islands, W, H, scale);
  self.postMessage(t, [t.data.buffer]);
};
