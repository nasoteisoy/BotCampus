import { SAVE_KEY } from './constants.js';

const DEFAULT = {
  best: { 0: null, 1: null, 2: null },
  settings: { sound: true, music: true, reduceShake: false },
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULT);
    const data = JSON.parse(raw);
    return {
      best: { ...DEFAULT.best, ...(data.best || {}) },
      settings: { ...DEFAULT.settings, ...(data.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function writeSave(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function recordBest(level, seconds) {
  const s = loadSave();
  const prev = s.best[level];
  if (prev == null || seconds < prev) {
    s.best[level] = Math.round(seconds * 100) / 100;
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
