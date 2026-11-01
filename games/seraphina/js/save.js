import { SAVE_KEY } from './constants.js';

const DEFAULT = {
  best: 0,
  settings: { sound: true, music: true, reduceShake: false },
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULT);
    const data = JSON.parse(raw);
    return {
      best: typeof data.best === 'number' ? data.best : 0,
      settings: { ...DEFAULT.settings, ...(data.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function writeSave(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function recordBest(score) {
  const s = loadSave();
  if (score > s.best) {
    s.best = score;
    writeSave(s);
    return true;
  }
  return false;
}

export function saveSettings(settings) {
  const s = loadSave();
  s.settings = { ...s.settings, ...settings };
  writeSave(s);
}
