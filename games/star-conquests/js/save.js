// Own save key only. Shell owns all localStorage writes.
export const SAVE_KEY = 'star-conquests:save';

export function hasSave(storage = globalThis.localStorage) {
  try { return !!storage.getItem(SAVE_KEY); } catch { return false; }
}

export function loadSave(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    return d;
  } catch {
    return null;
  }
}

export function writeSave(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage = globalThis.localStorage) {
  try { storage.removeItem(SAVE_KEY); return true; } catch { return false; }
}
