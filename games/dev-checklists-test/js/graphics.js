/** Per-project graphics focus (one of four) and a 2D / 3D / whole-game tier ladder. */

export const GRAPHICS_FOCUSES = [
  { id: 'feel', label: 'Feel', icon: 'gauge' },
  { id: 'new-ability', label: 'New art', icon: 'sparkles' },
  { id: 'low-detail', label: 'Low detail', icon: 'layers' },
  { id: 'finished', label: 'Finished', icon: 'flag' },
];

export const COST_CUE = {
  1: { word: 'Fast', icon: 'feather' },
  2: { word: 'Mid', icon: 'layers' },
  3: { word: 'Long', icon: 'clock' },
  4: { word: 'Big', icon: 'zap' },
};

export const TIER_GROUPS = ['2d', '3d', 'game'];
export const TIER_GROUP_LABEL = { '2d': '2D', '3d': '3D', game: 'Whole' };

const ID_RE = /^[a-z0-9-]{1,40}$/;

/**
 * Built-in ladder, easy/fast to hard/expensive/long.
 * The 'emoji' tier is a game-art style label. The UI uses a drawn face icon, never an emoji character.
 * 'downloaded-3d' means a downloaded model that is reshaped in our style — never shipped unmodified.
 */
export const GRAPHICS_TIERS = [
  { id: 'emoji', group: '2d', label: 'Emoji', icon: 'smile', cost: 1 },
  { id: 'icon-pack', group: '2d', label: 'Icon pack', icon: 'grid', cost: 1 },
  { id: 'drawn', group: '2d', label: 'Quick drawn', icon: 'image', cost: 1 },
  { id: 'tiles', group: '2d', label: 'Tiles / backgrounds', icon: 'tiles', cost: 2 },
  { id: 'premade-sprites', group: '2d', label: 'Premade sprites', icon: 'copy', cost: 2 },
  { id: 'new-simple-sprites', group: '2d', label: 'New simple sprites', icon: 'walk', cost: 3 },
  { id: 'hand-pixel', group: '2d', label: 'Hand pixel art', icon: 'pen', cost: 3 },
  { id: 'new-expensive-sprites', group: '2d', label: 'New expensive sprites', icon: 'sparkles', cost: 4 },
  { id: 'fx-2d', group: '2d', label: '2D effects', icon: 'sparkles', cost: 3 },
  { id: 'light-2d', group: '2d', label: '2D lighting', icon: 'sun', cost: 4 },

  { id: 'shapes', group: '3d', label: 'Shapes', icon: 'box', cost: 1 },
  { id: 'shapes-detail', group: '3d', label: 'Shapes + detail', icon: 'boxplus', cost: 2 },
  { id: 'shapes-many', group: '3d', label: 'Many detail shapes', icon: 'boxes', cost: 3 },
  { id: 'color-texture', group: '3d', label: 'Color / texture', icon: 'palette', cost: 3 },
  { id: 'downloaded-3d', group: '3d', label: 'Reshaped', icon: 'download', cost: 3 },
  { id: 'small-motion', group: '3d', label: 'Small motion', icon: 'motion', cost: 3 },
  { id: 'fx', group: '3d', label: 'More FX', icon: 'sparkles', cost: 3 },
  { id: 'light-3d', group: '3d', label: 'Scene lighting', icon: 'sun', cost: 4 },
  { id: 'rigging', group: '3d', label: 'Rigging', icon: 'bone', cost: 4 },
  { id: 'premade-anim', group: '3d', label: 'Rig animations', icon: 'film', cost: 3 },
  { id: 'tripo', group: '3d', label: 'Tripo', icon: 'wand', cost: 4 },
  { id: 'ai-blender', group: '3d', label: 'AI in Blender', icon: 'wand', cost: 4 },

  { id: 'ui-look', group: 'game', label: 'UI look', icon: 'layout', cost: 2 },
  { id: 'camera-feel', group: 'game', label: 'Camera feel', icon: 'camera', cost: 3 },
  { id: 'sound-music', group: 'game', label: 'Sound / music', icon: 'music', cost: 3 },
];

/** Seed defaults. Chumi can change these any time. */
export const SEED_GRAPHICS = {
  'island-front': { focus: 'low-detail', tiers: ['shapes-detail'] },
  'dragon-island': { focus: 'new-ability', tiers: ['tripo', 'rigging', 'small-motion'] },
  'ripples-2': { focus: 'low-detail', tiers: ['drawn'] },
  'kerovo': { focus: 'feel', tiers: [] },
};

export const DEFAULT_FOCUS = 'feel';

export function isValidFocus(id) {
  return GRAPHICS_FOCUSES.some((f) => f.id === id);
}

export function isValidTierId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

export function isBuiltInTier(id) {
  return GRAPHICS_TIERS.some((t) => t.id === id);
}

export function isValidGroup(g) {
  return TIER_GROUPS.includes(g);
}

export function isValidCost(n) {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

export function focusById(id) {
  return GRAPHICS_FOCUSES.find((f) => f.id === id) || GRAPHICS_FOCUSES[0];
}

export function focusLabel(id) {
  return focusById(id).label;
}

export function tierById(id) {
  return GRAPHICS_TIERS.find((t) => t.id === id) || null;
}

export function tierLabel(id, items) {
  if (items && items[id] && items[id].text) return items[id].text;
  const t = tierById(id);
  return t ? t.label : id;
}

export function defaultTierItems() {
  const out = {};
  for (const t of GRAPHICS_TIERS) {
    out[t.id] = { text: t.label, on: false, group: t.group, cost: t.cost };
  }
  return out;
}

function asItem(id, raw) {
  const builtin = tierById(id);
  const text = raw && typeof raw.text === 'string' ? raw.text.trim().slice(0, 80) : '';
  const label = text || (builtin ? builtin.label : id);
  if (!label) return null;
  const group = isValidGroup(raw && raw.group) ? raw.group : (builtin ? builtin.group : '2d');
  const cost = isValidCost(raw && raw.cost) ? raw.cost : (builtin ? builtin.cost : 2);
  const item = { text: label, on: !!(raw && raw.on), group, cost };
  if (raw && raw.custom === true) item.custom = true;
  if (!builtin) item.custom = true;
  return item;
}

/** Accept a full item map, a legacy boolean map, or an array of selected ids. */
export function normalizeTierItems(raw) {
  if (!raw || typeof raw !== 'object') return defaultTierItems();
  if (Array.isArray(raw)) {
    const out = defaultTierItems();
    for (const id of raw) {
      if (out[id]) out[id] = { ...out[id], on: true };
    }
    return out;
  }
  const vals = Object.values(raw);
  const legacy = vals.length > 0 && vals.every((v) => typeof v === 'boolean');
  if (legacy) {
    const out = defaultTierItems();
    for (const [id, on] of Object.entries(raw)) {
      if (out[id]) out[id] = { ...out[id], on: !!on };
    }
    return out;
  }
  const out = {};
  for (const [id, rawItem] of Object.entries(raw)) {
    if (!isValidTierId(id)) continue;
    const item = asItem(id, rawItem && typeof rawItem === 'object' ? rawItem : { on: !!rawItem });
    if (item) out[id] = item;
  }
  return out;
}

export function selectedTierIds(map) {
  const items = normalizeTierItems(map);
  const ids = Object.keys(items).filter((id) => items[id] && items[id].on);
  const order = GRAPHICS_TIERS.map((t) => t.id);
  ids.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    const aa = ia === -1 ? 1000 : ia;
    const bb = ib === -1 ? 1000 : ib;
    return aa - bb || a.localeCompare(b);
  });
  return ids;
}

export function toggleTier(map, id, on) {
  const next = { ...normalizeTierItems(map) };
  if (!next[id]) return next;
  next[id] = { ...next[id], on: !!on };
  return next;
}

export function seedGraphicsFor(slug, meta = {}) {
  const preset = SEED_GRAPHICS[slug];
  const focus = isValidFocus(meta.graphicsFocus)
    ? meta.graphicsFocus
    : (preset ? preset.focus : DEFAULT_FOCUS);
  let tiers;
  if (meta.graphicsTiers != null) {
    tiers = normalizeTierItems(meta.graphicsTiers);
  } else {
    tiers = normalizeTierItems(preset ? preset.tiers : []);
  }
  return { graphicsFocus: focus, graphicsTiers: tiers };
}

export function costWord(cost) {
  return (COST_CUE[cost] && COST_CUE[cost].word) || '';
}

export function tiersInGroup(items, group) {
  const list = [];
  const builtin = GRAPHICS_TIERS.filter((t) => t.group === group).map((t) => t.id);
  const seen = new Set();
  for (const id of builtin) {
    if (items[id]) {
      list.push({ id, ...items[id] });
      seen.add(id);
    }
  }
  for (const [id, item] of Object.entries(items || {})) {
    if (seen.has(id)) continue;
    if (item.group === group) list.push({ id, ...item });
  }
  return list;
}

export function validateTierMap(map) {
  if (map == null) return null;
  if (typeof map !== 'object' || Array.isArray(map)) return 'bad graphicsTiers';
  for (const [id, item] of Object.entries(map)) {
    if (!isValidTierId(id)) return 'bad graphics tier';
    if (!item || typeof item !== 'object') return 'bad graphics tier';
    if (typeof item.text !== 'string' || item.text.length < 1 || item.text.length > 80) return 'bad graphics tier text';
    if (typeof item.on !== 'boolean') return 'bad graphics tier';
    if (item.group != null && !isValidGroup(item.group)) return 'bad graphics group';
    if (item.cost != null && !isValidCost(item.cost)) return 'bad graphics cost';
    if (item.custom != null && typeof item.custom !== 'boolean') return 'bad graphics custom';
  }
  return null;
}
