// Music theory helpers (pure, no DOM). Sharps only, like the reel (D#m, F#, C#, B).
export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const pc = (n) => ((n % 12) + 12) % 12;
export const midiToName = (m) => NOTES[pc(Math.round(m))] + (Math.floor(Math.round(m) / 12) - 1);
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const chordName = (c) => NOTES[pc(c.root)] + (c.minor ? 'm' : '');
export const chordPcs = (c) => [pc(c.root), pc(c.root + (c.minor ? 3 : 4)), pc(c.root + 7)];

/** Quadrant order: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
 *  The reel's layout in F# major is vi / I / V / IV  ->  D#m  F#  C#  B. */
export function keyChords(keyRoot) {
  const k = pc(keyRoot);
  return [
    { root: pc(k + 9), minor: true },  // vi
    { root: k, minor: false },         // I
    { root: pc(k + 7), minor: false }, // V
    { root: pc(k + 5), minor: false }, // IV
  ];
}
export const DEFAULT_KEY = 6; // F#

/** Harmony targets for a sung (float) MIDI note: nearest chord tone above, nearest below,
 *  then the second chord tone above. The sung note is rounded first; a chord tone equal to the sung
 *  note is skipped (the harmony is always a different note). Same logic lives in the worklet. */
export function harmonyTargets(sungMidi, pcs, voices) {
  const n = Math.round(sungMidi);
  const isTone = (m) => pcs.includes(pc(m));
  const up = []; for (let m = n + 1; up.length < 2 && m < n + 25; m++) if (isTone(m)) up.push(m);
  let down = n - 1; while (!isTone(down) && down > n - 13) down--;
  const t = [up[0], down, up[1]];
  return t.slice(0, Math.max(0, Math.min(3, voices)));
}

/** Notes sent to MIDI / the pad: bass root (octave 2) + close triad from octave 3. */
export function chordMidiNotes(c) {
  const r = 48 + pc(c.root); // C3..B3
  const third = r + (c.minor ? 3 : 4), fifth = r + 7;
  return [r - 12, r, third, fifth];
}
