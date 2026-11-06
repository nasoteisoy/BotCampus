#!/usr/bin/env node
/**
 * Validate melody/harmony intervals in data/exercises.json.
 * Allows unison, m3/M3, P4, P5, m6/M6 (and octave equivalents).
 * Exit 0 on pass, 1 on fail.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '..', 'data', 'exercises.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

const ALLOWED = new Set([0, 3, 4, 5, 7, 8, 9]);
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = (m) => NOTES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

function expand(notes) {
  let t = 0;
  const out = [];
  for (const n of notes) {
    const beats = n.beats == null ? 1 : n.beats;
    out.push({ midi: n.midi, beats, t0: t, t1: t + beats });
    t += beats;
  }
  return out;
}

function samples(ex, step = 0.25) {
  const mel = expand(ex.melody);
  const har = expand(ex.harmony);
  const end = Math.max(mel.length ? mel[mel.length - 1].t1 : 0, har.length ? har[har.length - 1].t1 : 0);
  const pairs = [];
  for (let t = 0; t < end - 1e-9; t += step) {
    const m = mel.find((n) => t >= n.t0 && t < n.t1);
    const h = har.find((n) => t >= n.t0 && t < n.t1);
    if (!m || !h || m.midi == null || h.midi == null || m.midi < 0 || h.midi < 0) continue;
    pairs.push({ t, m: m.midi, h: h.midi, semis: Math.abs(m.midi - h.midi) });
  }
  return pairs;
}

let fails = 0;
let checked = 0;
const report = [];

for (const ex of data.exercises) {
  if (ex.melody.length !== ex.harmony.length) {
    // Length may differ only if beats still align — warn but check by time
    report.push(`NOTE ${ex.id}: melody events ${ex.melody.length} vs harmony ${ex.harmony.length} (time-aligned check)`);
  }
  const melBeats = ex.melody.reduce((s, n) => s + (n.beats || 1), 0);
  const harBeats = ex.harmony.reduce((s, n) => s + (n.beats || 1), 0);
  if (Math.abs(melBeats - harBeats) > 1e-6) {
    console.error(`FAIL ${ex.id}: total beats melody=${melBeats} harmony=${harBeats}`);
    fails++;
  }
  for (const p of samples(ex)) {
    checked++;
    const mod = p.semis % 12;
    if (!ALLOWED.has(mod)) {
      console.error(
        `FAIL ${ex.id} @ beat ${p.t}: ${name(p.m)}–${name(p.h)} = ${p.semis} semitones (mod12=${mod})`
      );
      fails++;
    }
  }
  // Count parallel 3rds/6ths share
  const pairs = samples(ex, 0.5);
  const thirds = pairs.filter((p) => [3, 4, 8, 9].includes(p.semis % 12)).length;
  const pct = pairs.length ? Math.round((100 * thirds) / pairs.length) : 0;
  report.push(`OK-ish ${ex.id}: ${pairs.length} samples, ${pct}% thirds/sixths`);
}

if (fails === 0) {
  console.log(`PASS: ${checked} interval samples across ${data.exercises.length} exercises`);
  for (const line of report) console.log(' ', line);
  process.exit(0);
} else {
  console.error(`FAILED with ${fails} issues (${checked} samples)`);
  process.exit(1);
}
