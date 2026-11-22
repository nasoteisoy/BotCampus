import { initAuth, watchAuth } from './auth.js';
import { startStore, onStore } from './store.js';
import { render, bind, parseHash, setCatalog } from './ui.js';
import { loadCatalog } from './reuse.js';

async function boot() {
  bind(document);
  render();
  loadCatalog().then((c) => { setCatalog(c.parts); render(); }).catch(() => {});
  try {
    await initAuth();
  } catch (_) {
    // SDK failed (offline). Store will use cache or the local seed list.
  }
  watchAuth(() => render());
  onStore(() => render());
  try {
    await startStore();
  } catch (_) {
    render();
  }
  if (!location.hash) location.hash = '#/';
  parseHash();
  render();
}

boot();
