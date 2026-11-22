/**
 * Load / save devChecklists/ only.
 * Sources: live or emulator RTDB, then localStorage cache, then local seed.
 * Never writes to the live DB from localhost or from emulator mode.
 */
import {
  SEED_META, STANDARD_DEFAULTS, HISTORY_LIMIT, LOG_LIMIT,
  normalizeProject, projectToPayload, appendHistory, validateProject,
  historyKey, isValidSlug, uniqueSlug, isValidName, isValidLevel, isValidStatus,
  nextItemId, isValidItemText,
} from './data.js';
import { testsForLevel, applyPresetToTests, shouldPromptLevelChange } from './presets.js';
import { seedGraphicsFor, isValidFocus, isValidTierId, isValidGroup, toggleTier, focusLabel, tierLabel } from './graphics.js';
import { normalizeReuseEntry } from './reuse.js';
import { LIVE_DB_URL, readEmuConfig, allowLiveWrites } from './firebase-config.js';
import { getFirebase, isVerified, getUid } from './auth.js';

export const CACHE_KEY = 'botcampus:dev-checklists';
export const HINT_KEY = 'botcampus:dev-checklists:hint';

const listeners = [];
const state = {
  projects: {},
  log: {},
  source: 'seed', // live | emu | cache | seed
  readable: false,
  writable: false,
  offline: false,
  emptyLive: false,
  error: '',
};

export function getStoreState() {
  return state;
}

export function onStore(cb) {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function emit() {
  for (const cb of listeners) {
    try { cb(state); } catch (_) { /* hook */ }
  }
}

export function seedProjects(at = Date.now()) {
  const projects = {};
  for (const meta of SEED_META) {
    projects[meta.slug] = makeProject(meta, at, 'Local list');
  }
  return projects;
}

export function makeProject(meta, at = Date.now(), historyText = 'Added project') {
  const gfx = seedGraphicsFor(meta.slug, meta);
  const proj = {
    name: meta.name,
    status: meta.status || 'active',
    level: meta.level || 'light',
    updatedAt: at,
    graphicsFocus: gfx.graphicsFocus,
    graphicsTiers: gfx.graphicsTiers,
    reuse: {},
    standards: {},
    tests: testsForLevel(meta.level || 'light'),
    history: {},
  };
  for (const d of STANDARD_DEFAULTS) {
    proj.standards[d.id] = { text: d.text, on: true };
  }
  if (historyText) {
    proj.history = appendHistory({}, { at, text: historyText, who: 'Chumi' });
  }
  return proj;
}

function cacheRead() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function cacheWrite(projects, log) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      at: Date.now(),
      projects,
      log: log || {},
    }));
  } catch (_) { /* quota */ }
}

function decodeTree(raw) {
  const projects = {};
  const src = raw && raw.projects && typeof raw.projects === 'object' ? raw.projects : raw;
  if (src && typeof src === 'object' && !src.projects) {
    for (const [slug, val] of Object.entries(src)) {
      if (slug === 'log' || slug === 'projects') continue;
      const p = normalizeProject(val, slug);
      if (p) projects[slug] = p;
    }
  }
  if (raw && raw.projects && typeof raw.projects === 'object') {
    for (const [slug, val] of Object.entries(raw.projects)) {
      const p = normalizeProject(val, slug);
      if (p) projects[slug] = p;
    }
  }
  const log = (raw && raw.log && typeof raw.log === 'object') ? raw.log : {};
  return { projects, log };
}

function restBase() {
  const emu = readEmuConfig();
  if (emu.isEmu) return emu.dbBase;
  return LIVE_DB_URL;
}

async function restGet(path) {
  const base = restBase().replace(/\/+$/, '');
  let url = `${base}/${path.replace(/^\/+/, '')}.json`;
  const emuNs = readEmuConfig();
  if (emuNs.isEmu) url += (url.includes('?') ? '&' : '?') + 'ns=chummy-games';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    if (res.status === 404) return { ok: true, value: null };
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, value: await res.json() };
  } catch (e) {
    return { ok: false, error: e };
  } finally {
    clearTimeout(t);
  }
}

function applyDecoded(decoded, source, { readable, writable, offline, emptyLive }) {
  state.projects = decoded.projects;
  state.log = decoded.log || {};
  state.source = source;
  state.readable = !!readable;
  state.writable = !!writable;
  state.offline = !!offline;
  state.emptyLive = !!emptyLive;
  state.error = '';
  if (readable && Object.keys(decoded.projects).length) {
    cacheWrite(decoded.projects, decoded.log);
  }
  emit();
}

function applyFallback({ offline }) {
  const picked = fallbackFromCacheOrSeed(cacheRead());
  applyDecoded({ projects: picked.projects, log: picked.log || {} }, picked.source, {
    readable: false,
    writable: false,
    offline: !!offline,
    emptyLive: false,
  });
}

/** True when a successful live (non-emu) read has no projects and should use cache/seed. */
export function shouldFallbackEmptyLive(val, isEmu = false) {
  return !isEmu && isEmptyChecklistVal(val);
}

export function isEmptyChecklistVal(val) {
  if (val == null) return true;
  if (typeof val !== 'object') return true;
  const decoded = decodeTree(val);
  return Object.keys(decoded.projects).length === 0;
}

export function fallbackFromCacheOrSeed(cache) {
  if (cache && cache.projects && Object.keys(cache.projects).length) {
    return { source: 'cache', ...decodeTree(cache) };
  }
  return { source: 'seed', projects: seedProjects(), log: {} };
}

function canWriteNow() {
  const emu = readEmuConfig();
  if (!isVerified()) return false;
  if (emu.isEmu) return state.readable;
  if (!allowLiveWrites()) return false;
  return state.readable;
}

export function canEdit() {
  return canWriteNow() && state.writable;
}

export async function startStore() {
  const emu = readEmuConfig();
  const { database, sdk } = getFirebase();

  if (database && sdk) {
    const { ref, onValue } = sdk.dbMod;
    const root = ref(database, 'devChecklists');
    onValue(root, (snap) => {
      const val = snap.val();
      const decoded = decodeTree(val || {});
      const emptyLive = isEmptyChecklistVal(val);
      if (emu.isEmu && emptyLive) {
        // If the SDK landed on an empty namespace, try the namespaced REST read.
        restThenFallback();
        return;
      }
      if (shouldFallbackEmptyLive(val, emu.isEmu)) {
        applyFallback({ offline: false });
        return;
      }
      applyDecoded(decoded, emu.isEmu ? 'emu' : 'live', {
        readable: true,
        writable: emu.isEmu || allowLiveWrites(),
        offline: false,
        emptyLive: emptyLive && Object.keys(decoded.projects).length === 0,
      });
    }, () => {
      // Permission or network error on the listener.
      restThenFallback();
    });
    return;
  }

  await restThenFallback();
}

async function restThenFallback() {
  const got = await restGet('devChecklists');
  const emu = readEmuConfig();
  if (got.ok) {
    if (shouldFallbackEmptyLive(got.value, emu.isEmu)) {
      applyFallback({ offline: false });
      return;
    }
    const decoded = decodeTree(got.value || {});
    const emptyLive = isEmptyChecklistVal(got.value);
    applyDecoded(decoded, emu.isEmu ? 'emu' : 'live', {
      readable: true,
      writable: emu.isEmu || allowLiveWrites(),
      offline: false,
      emptyLive,
    });
    return;
  }
  const offline = !got.status || got.status >= 500 || got.error;
  applyFallback({ offline: !!offline });
}

async function writeProject(slug, proj, logText) {
  const err = validateProject(proj, slug);
  if (err) throw new Error(err);
  if (!canWriteNow()) throw new Error('read-only');
  const { database, sdk } = getFirebase();
  if (!database || !sdk) throw new Error('no database');
  const payload = projectToPayload(proj);
  const { ref, set, push } = sdk.dbMod;
  await set(ref(database, `devChecklists/projects/${slug}`), payload);
  if (logText) {
    const rec = { at: proj.updatedAt, text: logText, who: 'Chumi', slug };
    await push(ref(database, 'devChecklists/log'), rec);
  }
}

function mustEdit() {
  if (!canEdit()) {
    const e = new Error('read-only');
    e.code = 'readonly';
    throw e;
  }
}

export async function saveTick(slug, group, itemId, on) {
  mustEdit();
  const proj = { ...state.projects[slug] };
  if (!proj) throw new Error('missing project');
  const bag = { ...proj[group] };
  if (!bag[itemId]) throw new Error('missing item');
  bag[itemId] = { ...bag[itemId], on: !!on };
  proj[group] = bag;
  const label = bag[itemId].text;
  const text = `${on ? 'Ticked' : 'Unticked'} ${label}`.slice(0, 160);
  return commit(slug, proj, text);
}

export async function saveLevel(slug, level, mode) {
  mustEdit();
  if (!isValidLevel(level)) throw new Error('bad level');
  const proj = { ...state.projects[slug] };
  if (!proj) throw new Error('missing project');
  const prompt = shouldPromptLevelChange(proj.tests, level);
  if (prompt && mode !== 'apply' && mode !== 'keep') {
    return { needsChoice: true, level };
  }
  proj.level = level;
  let text = `Level ${cap(level)}`;
  if (mode === 'apply') {
    proj.tests = applyPresetToTests(proj.tests, level);
    text = `Level ${cap(level)}, preset applied`;
  } else if (mode === 'keep') {
    text = `Level ${cap(level)}, ticks kept`;
  }
  return commit(slug, proj, text);
}


export async function saveFocus(slug, focus) {
  mustEdit();
  if (!isValidFocus(focus)) throw new Error('bad graphicsFocus');
  const proj = { ...state.projects[slug] };
  if (!proj) throw new Error('missing project');
  if (proj.graphicsFocus === focus) return { slug, project: proj };
  proj.graphicsFocus = focus;
  return commit(slug, proj, `Focus ${focusLabel(focus)}`.slice(0, 160));
}

export async function saveTier(slug, tierId, on) {
  mustEdit();
  if (!isValidTierId(tierId)) throw new Error('bad graphics tier');
  const proj = { ...state.projects[slug] };
  if (!proj) throw new Error('missing project');
  proj.graphicsTiers = toggleTier(proj.graphicsTiers, tierId, !!on);
  const text = `${on ? 'Tier on' : 'Tier off'}: ${tierLabel(tierId, proj.graphicsTiers)}`.slice(0, 160);
  return commit(slug, proj, text);
}


export async function saveTierAdd(slug, text, group = '2d', cost = 2) {
  mustEdit();
  if (!isValidItemText(text)) throw new Error('bad item text');
  if (!isValidGroup(group)) throw new Error('bad graphics group');
  const proj = { ...state.projects[slug] };
  if (!proj) throw new Error('missing project');
  const bag = { ...proj.graphicsTiers };
  const id = nextItemId(bag, text);
  bag[id] = { text, on: false, group, cost: cost || 2, custom: true };
  proj.graphicsTiers = bag;
  return commit(slug, proj, `Added tier: ${text}`.slice(0, 160));
}

export async function saveTierRename(slug, tierId, text) {
  mustEdit();
  if (!isValidItemText(text)) throw new Error('bad item text');
  const proj = { ...state.projects[slug] };
  if (!proj || !proj.graphicsTiers || !proj.graphicsTiers[tierId]) throw new Error('missing tier');
  const bag = { ...proj.graphicsTiers };
  const prev = bag[tierId].text;
  bag[tierId] = { ...bag[tierId], text };
  proj.graphicsTiers = bag;
  return commit(slug, proj, `Renamed tier ${prev} to ${text}`.slice(0, 160));
}

export async function saveTierRemove(slug, tierId) {
  mustEdit();
  const proj = { ...state.projects[slug] };
  if (!proj || !proj.graphicsTiers || !proj.graphicsTiers[tierId]) throw new Error('missing tier');
  const bag = { ...proj.graphicsTiers };
  const prev = bag[tierId].text;
  delete bag[tierId];
  proj.graphicsTiers = bag;
  return commit(slug, proj, `Removed tier ${prev}`.slice(0, 160));
}

export async function saveReuse(slug, rec, on) {
  mustEdit();
  const entry = normalizeReuseEntry(rec.id || rec, rec);
  if (!entry) throw new Error('bad reuse entry');
  const proj = { ...state.projects[slug] };
  if (!proj) throw new Error('missing project');
  const bag = { ...(proj.reuse || {}) };
  if (on) bag[entry.id] = entry;
  else delete bag[entry.id];
  proj.reuse = bag;
  const text = `${on ? 'Reuse on' : 'Reuse off'}: ${entry.name}`.slice(0, 160);
  return commit(slug, proj, text);
}

export async function saveItemAdd(slug, group, text) {
  mustEdit();
  const { nextItemId, isValidItemText } = await import('./data.js');
  if (!isValidItemText(text)) throw new Error('bad item text');
  const proj = { ...state.projects[slug] };
  if (!proj) throw new Error('missing project');
  const bag = { ...proj[group] };
  const id = nextItemId(bag, text);
  bag[id] = { text, on: false, custom: true };
  proj[group] = bag;
  const g = group === 'standards' ? 'Standard' : 'Test';
  return commit(slug, proj, `Added ${g}: ${text}`.slice(0, 160));
}

export async function saveItemRename(slug, group, itemId, text) {
  mustEdit();
  const { isValidItemText } = await import('./data.js');
  if (!isValidItemText(text)) throw new Error('bad item text');
  const proj = { ...state.projects[slug] };
  if (!proj || !proj[group] || !proj[group][itemId]) throw new Error('missing item');
  const bag = { ...proj[group] };
  const prev = bag[itemId].text;
  bag[itemId] = { ...bag[itemId], text };
  proj[group] = bag;
  return commit(slug, proj, `Renamed ${prev} to ${text}`.slice(0, 160));
}

export async function saveItemRemove(slug, group, itemId) {
  mustEdit();
  const proj = { ...state.projects[slug] };
  if (!proj || !proj[group] || !proj[group][itemId]) throw new Error('missing item');
  const bag = { ...proj[group] };
  const prev = bag[itemId].text;
  delete bag[itemId];
  proj[group] = bag;
  return commit(slug, proj, `Removed ${prev}`.slice(0, 160));
}

export async function saveProjectAdd({ name, status, level }) {
  mustEdit();
  if (!isValidName(name)) throw new Error('bad name');
  const st = isValidStatus(status) ? status : 'active';
  const lv = isValidLevel(level) ? level : 'light';
  const slug = uniqueSlug(name, state.projects);
  const proj = makeProject({ name, status: st, level: lv }, Date.now(), `Added project ${name}`);
  return commit(slug, proj, `Added project ${name}`);
}

export async function saveProjectRename(slug, name) {
  mustEdit();
  if (!isValidName(name)) throw new Error('bad name');
  const proj = { ...state.projects[slug] };
  if (!proj) throw new Error('missing project');
  const prev = proj.name;
  proj.name = name;
  return commit(slug, proj, `Renamed project ${prev} to ${name}`.slice(0, 160));
}

export async function saveProjectStatus(slug, status) {
  mustEdit();
  if (!isValidStatus(status)) throw new Error('bad status');
  const proj = { ...state.projects[slug] };
  if (!proj) throw new Error('missing project');
  proj.status = status;
  const text = status === 'archived'
    ? `Archived ${proj.name}`
    : status === 'hold'
      ? `${proj.name} on hold`
      : `Restored ${proj.name}`;
  return commit(slug, proj, text);
}

export async function saveStarterList() {
  mustEdit();
  if (Object.keys(state.projects).length) throw new Error('not empty');
  const at = Date.now();
  const { database, sdk } = getFirebase();
  if (!database || !sdk) throw new Error('no database');
  const { ref, set, push } = sdk.dbMod;
  for (const meta of SEED_META) {
    const proj = makeProject(meta, at, `Added project ${meta.name}`);
    const err = validateProject(proj, meta.slug);
    if (err) throw new Error(err);
    await set(ref(database, `devChecklists/projects/${meta.slug}`), projectToPayload(proj));
  }
  await push(ref(database, 'devChecklists/log'), {
    at, text: 'Added starter list', who: 'Chumi',
  });
}

async function commit(slug, proj, text) {
  const next = { ...proj };
  next.updatedAt = Date.now();
  next.history = appendHistory(next.history, { at: next.updatedAt, text, who: 'Chumi' }, HISTORY_LIMIT);
  await writeProject(slug, next, text);
  // Optimistic; listener will confirm.
  state.projects = { ...state.projects, [slug]: next };
  emit();
  return { slug, project: next };
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function hintSeen() {
  try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
}

export function markHintSeen() {
  try { localStorage.setItem(HINT_KEY, '1'); } catch (_) { /* */ }
}

// silence unused in some builds
void historyKey;
void isValidSlug;
void LOG_LIMIT;
void getUid;
