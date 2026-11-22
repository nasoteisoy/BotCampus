/** Reuse-past-graphics records. Catalog metadata lives in catalog/parts.json. */

const ID_RE = /^[a-z0-9-]{1,80}$/;
const SAFE_PATH = /^[a-zA-Z0-9_./-]+$/;
const KINDS = ['character', 'vehicle', 'ship', 'plane', 'icon', 'sprite', 'glb', 'fx', 'ui', 'other'];

export const REUSE_KINDS = KINDS;

export const KIND_ICON = {
  character: 'user',
  vehicle: 'box',
  ship: 'box',
  plane: 'box',
  icon: 'grid',
  sprite: 'image',
  glb: 'box',
  fx: 'sparkles',
  ui: 'layout',
  other: 'clipboard',
};

export const KIND_LABEL = {
  character: 'Character',
  vehicle: 'Vehicle',
  ship: 'Ship',
  plane: 'Plane',
  icon: 'Icon',
  sprite: 'Sprite',
  glb: '3D',
  fx: 'FX',
  ui: 'UI',
  other: 'Part',
};

function cleanPath(s) {
  if (typeof s !== 'string') return '';
  const t = s.trim();
  if (!t || t.length > 200) return '';
  if (t.includes('..') || t.includes('\\') || t.includes(':')) return '';
  if (t.startsWith('/')) return '';
  if (!SAFE_PATH.test(t)) return '';
  return t;
}

export function isValidReuseId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

export function isValidKind(k) {
  return KINDS.includes(k);
}

export function normalizeReuseEntry(id, raw) {
  if (!isValidReuseId(id) || !raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
  if (!name) return null;
  let path = id;
  if (raw.path != null && String(raw.path).trim() !== '') {
    path = cleanPath(raw.path);
    if (!path) return null;
  }
  const rec = {
    id,
    name,
    source: typeof raw.source === 'string' ? raw.source.trim().slice(0, 80) : '',
    path,
    kind: isValidKind(raw.kind) ? raw.kind : 'other',
  };
  const thumb = cleanPath(raw.thumb);
  if (thumb) rec.thumb = thumb;
  return rec;
}

export function normalizeReuse(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, val] of Object.entries(raw)) {
    const rec = normalizeReuseEntry(id, val);
    if (rec) out[id] = rec;
  }
  return out;
}

export function validateReuseMap(map) {
  if (map == null) return null;
  if (typeof map !== 'object' || Array.isArray(map)) return 'bad reuse';
  for (const [id, val] of Object.entries(map)) {
    if (!normalizeReuseEntry(id, val)) return 'bad reuse entry';
    if (val && typeof val === 'object') {
      for (const k of Object.keys(val)) {
        if (!['id', 'name', 'source', 'path', 'kind', 'thumb'].includes(k)) return 'bad reuse field';
      }
    }
  }
  return null;
}

export function reuseList(map) {
  return Object.values(normalizeReuse(map)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

let catalogCache = null;

export async function loadCatalog(base = '.') {
  if (catalogCache) return catalogCache;
  const url = `${String(base).replace(/\/+$/, '')}/catalog/parts.json`;
  const res = await fetch(url);
  if (!res.ok) {
    catalogCache = { parts: [] };
    return catalogCache;
  }
  const data = await res.json();
  catalogCache = { parts: Array.isArray(data.parts) ? data.parts : [] };
  return catalogCache;
}

export function clearCatalogCache() {
  catalogCache = null;
}

export function recordFromCatalog(part) {
  if (!part || !isValidReuseId(part.id)) return null;
  return normalizeReuseEntry(part.id, {
    name: part.name,
    source: part.source,
    path: part.path,
    kind: part.kind,
    thumb: part.thumb,
  });
}
