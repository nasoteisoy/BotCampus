/** Test-level presets. Changing level does not auto-wipe ticks. */

import { TEST_DEFAULTS } from './data.js';

/** Light / Normal / Heavy pre-ticks over the default Tests list. */
export const LEVEL_PRESETS = {
  light: ['real-tap', 'rules-tests', 'open-link'],
  normal: ['phone-only', 'open-link', 'real-tap', 'rules-tests', 'fingerprint'],
  heavy: [
    'phone-only',
    'open-link',
    'real-tap',
    'rules-tests',
    'fingerprint',
    'phone-sides-desk',
  ],
};

export function presetIds(level) {
  const ids = LEVEL_PRESETS[level] || LEVEL_PRESETS.light;
  return ids.slice();
}

export function isDefaultTestId(id) {
  return TEST_DEFAULTS.some((d) => d.id === id);
}

/**
 * Apply a level preset to Tests.
 * Default test items are set on/off to match the preset.
 * Items Chumi added himself are left as they are.
 */
export function applyPresetToTests(tests, level) {
  const want = new Set(presetIds(level));
  const next = {};
  const src = tests && typeof tests === 'object' ? tests : {};
  for (const d of TEST_DEFAULTS) {
    const prev = src[d.id];
    next[d.id] = {
      text: (prev && prev.text) || d.text,
      on: want.has(d.id),
    };
  }
  for (const [id, item] of Object.entries(src)) {
    if (next[id] || !item || typeof item !== 'object') continue;
    next[id] = { text: item.text, on: !!item.on };
    if (item.custom === true) next[id].custom = true;
  }
  return next;
}

/** True when every default test tick matches the preset (added items ignored). */
export function testsMatchPreset(tests, level) {
  const want = new Set(presetIds(level));
  const src = tests && typeof tests === 'object' ? tests : {};
  for (const d of TEST_DEFAULTS) {
    const on = !!(src[d.id] && src[d.id].on);
    if (on !== want.has(d.id)) return false;
  }
  return true;
}

export function testsDifferFromPreset(tests, level) {
  return !testsMatchPreset(tests, level);
}

/** Build the default Tests map for a brand-new project at this level. */
export function testsForLevel(level) {
  return applyPresetToTests({}, level);
}

export function shouldPromptLevelChange(tests, nextLevel) {
  return testsDifferFromPreset(tests, nextLevel);
}
