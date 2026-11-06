import { Yin } from '../js/pitch.js';
import { freqToMidi } from '../js/theory.js';

function synth(freq, sr = 48000, seconds = 0.5) {
  const n = Math.floor(sr * seconds);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = 0.4 * Math.sin(2 * Math.PI * freq * i / sr);
  return buf;
}

const sr = 48000;
const yin = new Yin(sr, { fmin: 70, fmax: 900, win: 1024, thresh: 0.12 });
const need = yin.win + yin.tauMax + 4;

function check(label, freq, maxCents = 15) {
  const raw = synth(freq, sr, 1.0);
  const buf = raw.slice(raw.length - need);
  const r = yin.detect(buf);
  const cents = 1200 * Math.log2(r.f / freq);
  const ok = r.f > 0 && Math.abs(cents) <= maxCents;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: f=${r.f.toFixed(2)} conf=${r.conf.toFixed(3)} cents=${cents.toFixed(1)}`);
  if (!ok) process.exitCode = 1;
}

const e4 = 440 * 2 ** ((64 - 69) / 12);
check('E4 on', e4);
check('E4 flat40', e4 * 2 ** (-40 / 1200));
check('E4 sharp40', e4 * 2 ** (40 / 1200));
check('E4 sharp80', e4 * 2 ** (80 / 1200));
