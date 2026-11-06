const KEY = 'botcampus:harmony-trainer:v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function write(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getBest(exerciseId) {
  const d = read();
  return (d.best && d.best[exerciseId]) || null;
}

export function setBest(exerciseId, score) {
  const d = read();
  if (!d.best) d.best = {};
  const prev = d.best[exerciseId];
  if (prev == null || score > prev) {
    d.best[exerciseId] = Math.round(score * 10) / 10;
    write(d);
    return d.best[exerciseId];
  }
  return prev;
}

export function getSettings() {
  const d = read();
  return Object.assign(
    { octaveShift: -12, tempoScale: 1, melodyOn: true, harmonyOn: true, melodyVol: 0.7, harmonyVol: 0.55 },
    d.settings || {}
  );
}

export function saveSettings(partial) {
  const d = read();
  d.settings = Object.assign(getSettings(), partial);
  write(d);
  return d.settings;
}
