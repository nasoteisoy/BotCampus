/** Seed data, slugs, validation, and history helpers. No I/O. */

import { isValidFocus, normalizeTierItems, DEFAULT_FOCUS, seedGraphicsFor, validateTierMap } from './graphics.js';
import { normalizeReuse, validateReuseMap } from './reuse.js';

export const SLUG_RE = /^[a-z0-9-]{1,40}$/;
export const ITEM_ID_RE = /^[a-z0-9-]{1,40}$/;
export const NAME_MIN = 1;
export const NAME_MAX = 80;
export const ITEM_TEXT_MIN = 1;
export const ITEM_TEXT_MAX = 80;
export const HISTORY_TEXT_MAX = 160;
export const HISTORY_LIMIT = 50;
export const LOG_LIMIT = 50;
export const WHO_MAX = 40;

export const LEVELS = ['light', 'normal', 'heavy'];
export const STATUSES = ['active', 'hold', 'archived'];

export const STANDARD_DEFAULTS = [
  { id: 'parts-library', text: 'Reuse parts library' },
  { id: 'maker-not-checker', text: 'Maker never checks own work' },
  { id: 'art-judges', text: 'Art judges look' },
  { id: 'icons-over-reading', text: 'Icons over reading' },
  { id: 'chumi-yes-push', text: 'Chumi yes before live push' },
  { id: 'recheck-bugs', text: 'Re-check bugs he reported' },
];

export const TEST_DEFAULTS = [
  { id: 'real-tap', text: 'Real-tap playtest by Leader' },
  { id: 'rules-tests', text: 'Rules tests' },
  { id: 'phone-only', text: 'Phone screen only' },
  { id: 'phone-sides-desk', text: 'Phone + sideways + desktop' },
  { id: 'fingerprint', text: 'File fingerprint check' },
  { id: 'open-link', text: 'Open link before sending' },
];

export const SEED_META = [
  { slug: 'island-front', name: 'Island Front', status: 'active', level: 'light' },
  { slug: 'dragon-island', name: 'Dragon Island', status: 'active', level: 'light' },
  { slug: 'ripples-2', name: 'Ripples 2', status: 'active', level: 'light' },
  { slug: 'kerovo', name: 'Kerovo', status: 'hold', level: 'light' },
];

export function isValidSlug(s) {
  return typeof s === 'string' && SLUG_RE.test(s);
}

export function isValidItemId(s) {
  return typeof s === 'string' && ITEM_ID_RE.test(s);
}

export function isValidLevel(s) {
  return LEVELS.includes(s);
}

export function isValidStatus(s) {
  return STATUSES.includes(s);
}

export function isValidName(s) {
  return typeof s === 'string' && s.length >= NAME_MIN && s.length <= NAME_MAX;
}

export function isValidItemText(s) {
  return typeof s === 'string' && s.length >= ITEM_TEXT_MIN && s.length <= ITEM_TEXT_MAX;
}

export function isValidHistoryText(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= HISTORY_TEXT_MAX;
}

export function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return isValidSlug(s) ? s : '';
}

export function nextItemId(existing, text) {
  const ids = existing && typeof existing === 'object' ? existing : {};
  let base = slugify(text) || 'item';
  if (base.length > 32) base = base.slice(0, 32);
  if (!ids[base] && isValidItemId(base)) return base;
  for (let i = 2; i < 100; i++) {
    const id = `${base}-${i}`.slice(0, 40);
    if (!ids[id] && isValidItemId(id)) return id;
  }
  const id = `item-${Date.now().toString(36)}`.slice(0, 40);
  return isValidItemId(id) ? id : 'item-x';
}

export function uniqueSlug(name, existing) {
  const map = existing && typeof existing === 'object' ? existing : {};
  let base = slugify(name);
  if (!base) base = 'project';
  if (!map[base]) return base;
  for (let i = 2; i < 100; i++) {
    const s = `${base}-${i}`.slice(0, 40);
    if (isValidSlug(s) && !map[s]) return s;
  }
  return `p-${Date.now().toString(36)}`.slice(0, 40);
}

export function itemsFromDefaults(defaults, isOn) {
  const out = {};
  for (const d of defaults) {
    out[d.id] = { text: d.text, on: !!isOn(d.id) };
  }
  return out;
}

export function cloneItems(items) {
  const out = {};
  if (!items || typeof items !== 'object') return out;
  for (const [id, raw] of Object.entries(items)) {
    if (!isValidItemId(id) || !raw || typeof raw !== 'object') continue;
    if (!isValidItemText(raw.text)) continue;
    const item = { text: raw.text, on: !!raw.on };
    if (raw.custom === true) item.custom = true;
    out[id] = item;
  }
  return out;
}

export function historyKey(at) {
  const n = Number(at) || Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `h-${n}-${rand}`.slice(0, 40);
}

export function appendHistory(history, entry, limit = HISTORY_LIMIT) {
  const map = { ...(history && typeof history === 'object' ? history : {}) };
  const text = String(entry.text || '').slice(0, HISTORY_TEXT_MAX);
  if (!text) return trimHistoryMap(map, limit);
  const at = Number(entry.at) || Date.now();
  const rec = { at, text };
  if (entry.who) rec.who = String(entry.who).slice(0, WHO_MAX);
  const key = entry.id && isValidItemId(entry.id) ? entry.id : historyKey(at);
  map[key] = rec;
  return trimHistoryMap(map, limit);
}

export function trimHistoryMap(history, limit = HISTORY_LIMIT) {
  const list = historyList(history);
  if (list.length <= limit) {
    const out = {};
    for (const e of list) out[e.id] = packHistory(e);
    return out;
  }
  const keep = list.slice(0, limit);
  const out = {};
  for (const e of keep) out[e.id] = packHistory(e);
  return out;
}

function packHistory(e) {
  const rec = { at: e.at, text: e.text };
  if (e.who) rec.who = e.who;
  return rec;
}

export function historyList(history) {
  if (!history || typeof history !== 'object') return [];
  const list = [];
  for (const [id, raw] of Object.entries(history)) {
    if (!raw || typeof raw !== 'object') continue;
    const text = typeof raw.text === 'string' ? raw.text : '';
    const at = Number(raw.at) || 0;
    if (!text) continue;
    const rec = { id, at, text };
    if (typeof raw.who === 'string' && raw.who) rec.who = raw.who;
    list.push(rec);
  }
  list.sort((a, b) => b.at - a.at || String(b.id).localeCompare(String(a.id)));
  return list;
}

export function lastHistory(history, n = 5) {
  return historyList(history).slice(0, n);
}

export function normalizeProject(raw, slug) {
  if (!raw || typeof raw !== 'object') return null;
  if (slug && !isValidSlug(slug)) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, NAME_MAX) : '';
  if (!isValidName(name)) return null;
  const status = isValidStatus(raw.status) ? raw.status : 'active';
  const level = isValidLevel(raw.level) ? raw.level : 'light';
  const updatedAt = Number(raw.updatedAt) || 0;
  const gfx = seedGraphicsFor(slug, raw);
  const focus = isValidFocus(raw.graphicsFocus) ? raw.graphicsFocus : gfx.graphicsFocus;
  return {
    name,
    status,
    level,
    updatedAt,
    graphicsFocus: focus || DEFAULT_FOCUS,
    graphicsTiers: normalizeTierItems(raw.graphicsTiers != null ? raw.graphicsTiers : gfx.graphicsTiers),
    reuse: normalizeReuse(raw.reuse),
    standards: cloneItems(raw.standards),
    tests: cloneItems(raw.tests),
    history: trimHistoryMap(raw.history || {}, HISTORY_LIMIT),
  };
}

export function validateProject(proj, slug) {
  if (!isValidSlug(slug)) return 'bad slug';
  if (!proj || typeof proj !== 'object') return 'missing project';
  if (!isValidName(proj.name)) return 'bad name';
  if (!isValidStatus(proj.status)) return 'bad status';
  if (!isValidLevel(proj.level)) return 'bad level';
  if (typeof proj.updatedAt !== 'number' || !Number.isFinite(proj.updatedAt)) return 'bad updatedAt';
  if (!proj.standards || typeof proj.standards !== 'object') return 'bad standards';
  if (!proj.tests || typeof proj.tests !== 'object') return 'bad tests';
  if (!isValidFocus(proj.graphicsFocus)) return 'bad graphicsFocus';
  const tErr = validateTierMap(proj.graphicsTiers);
  if (tErr) return tErr;
  const rErr = validateReuseMap(proj.reuse);
  if (rErr) return rErr;
  for (const group of [proj.standards, proj.tests]) {
    for (const [id, item] of Object.entries(group)) {
      if (!isValidItemId(id)) return 'bad item id';
      if (!item || typeof item !== 'object') return 'bad item';
      if (!isValidItemText(item.text)) return 'bad item text';
      if (typeof item.on !== 'boolean') return 'bad item on';
      if (item.custom != null && typeof item.custom !== 'boolean') return 'bad custom';
    }
  }
  return null;
}

export function projectToPayload(proj) {
  const out = {
    name: proj.name,
    status: proj.status,
    level: proj.level,
    updatedAt: proj.updatedAt,
    standards: cloneItems(proj.standards),
    tests: cloneItems(proj.tests),
    graphicsFocus: isValidFocus(proj.graphicsFocus) ? proj.graphicsFocus : DEFAULT_FOCUS,
  };
  const tiers = normalizeTierItems(proj.graphicsTiers);
  if (Object.keys(tiers).length) out.graphicsTiers = tiers;
  const reuse = normalizeReuse(proj.reuse);
  if (Object.keys(reuse).length) out.reuse = reuse;
  const hist = trimHistoryMap(proj.history || {}, HISTORY_LIMIT);
  if (Object.keys(hist).length) out.history = hist;
  return out;
}

export function countTicks(items) {
  const ids = Object.keys(items || {});
  let on = 0;
  for (const id of ids) if (items[id] && items[id].on) on++;
  return { on, total: ids.length };
}

export function activeProjects(projects) {
  const out = [];
  for (const [slug, p] of Object.entries(projects || {})) {
    if (p && p.status !== 'archived') out.push({ slug, ...p });
  }
  out.sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
  return out;
}

export function archivedProjects(projects) {
  const out = [];
  for (const [slug, p] of Object.entries(projects || {})) {
    if (p && p.status === 'archived') out.push({ slug, ...p });
  }
  out.sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
  return out;
}

export function mergeLog(log) {
  return historyList(log).slice(0, LOG_LIMIT);
}
