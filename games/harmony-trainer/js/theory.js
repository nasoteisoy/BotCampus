/** Music theory helpers (adapted from parts-library/harmony-hands). Sharps only. */
export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const pc = (n) => ((n % 12) + 12) % 12;
export const midiToName = (m) => {
  if (m == null || m < 0) return '—';
  const r = Math.round(m);
  return NOTES[pc(r)] + (Math.floor(r / 12) - 1);
};
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Cents from sungFreq to targetMidi (positive = sharp). */
export function centsOff(sungFreq, targetMidi) {
  if (!sungFreq || sungFreq <= 0 || targetMidi == null || targetMidi < 0) return null;
  const target = midiToFreq(targetMidi);
  return 1200 * Math.log2(sungFreq / target);
}

/** Nearest MIDI to a frequency. */
export function freqToNearestMidi(f) {
  if (!f || f <= 0) return null;
  return Math.round(freqToMidi(f));
}

/** Interval in semitones (absolute), ignoring octave wrap for validation. */
export function semitoneInterval(a, b) {
  if (a == null || b == null || a < 0 || b < 0) return null;
  return Math.abs(Math.round(a) - Math.round(b));
}

/** True if interval is a common diatonic harmony (3rd, 4th, 5th, 6th, octave). */
export function isAllowedHarmonyInterval(semis) {
  if (semis == null) return true; // rest
  const s = semis % 12;
  // unison (phrase ends), m3/M3, P4, P5, m6/M6, and octave (=0 after mod)
  return [0, 3, 4, 5, 7, 8, 9].includes(s);
}
