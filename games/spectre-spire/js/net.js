// Online rooms on the shared Firebase Realtime Database (REST + streaming), same pattern as Iron Meridian.
// Room layout under spectreSpire/rooms/<code>:
//   meta            {host, v, tower, seed, phase, at}
//   lobby/<pid>     {n: name, h: hunter index, rd: ready, t: last seen}
//   p/<pid>         pose + inputs from that player, ~12 times a second
//   s               host snapshot of the whole game, ~10 times a second
const DB = 'https://chummy-games-default-rtdb.firebaseio.com/spectreSpire/rooms/';
const url = (code, path) => DB + code + (path ? '/' + path : '') + '.json';

export const PROTOCOL = 1;

async function req(method, code, path, body) {
  const r = await fetch(url(code, path), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error('The game server said ' + r.status);
  return r.json();
}
export const netGet = (code, path) => req('GET', code, path);
export const netPut = (code, path, v) => req('PUT', code, path, v);
export const netPatch = (code, path, v) => req('PATCH', code, path, v);
export const netDelete = (code, path) => req('DELETE', code, path);

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}
export function makeId() { return Math.random().toString(36).slice(2, 10); }

// Keeps a live local mirror of a database path. onChange(mirror, changedPath) fires on every update.
export function listen(code, path, onChange) {
  const es = new EventSource(url(code, path));
  let mirror = null;
  const setAt = (p, data) => {
    const parts = p.split('/').filter(Boolean);
    if (!parts.length) { mirror = data; return; }
    if (mirror === null || typeof mirror !== 'object') mirror = {};
    let o = mirror;
    for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] === null || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
    if (data === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = data;
  };
  es.addEventListener('put', (e) => { try { const d = JSON.parse(e.data); setAt(d.path, d.data); onChange(mirror, d.path); } catch (x) { /* ignore bad frame */ } });
  es.addEventListener('patch', (e) => {
    try { const d = JSON.parse(e.data); for (const k of Object.keys(d.data || {})) setAt(d.path.replace(/\/$/, '') + '/' + k, d.data[k]); onChange(mirror, d.path); } catch (x) { /* ignore bad frame */ }
  });
  es.addEventListener('cancel', () => onChange(null, '/'));
  return () => es.close();
}

// Sends the newest value of one path without piling up requests: one in flight, newest wins.
export function makeSender(code, path) {
  let inFlight = false, pending;
  let hasPending = false, failures = 0;
  const pump = () => {
    if (inFlight || !hasPending) return;
    const v = pending; hasPending = false; inFlight = true;
    netPut(code, path, v).then(() => { failures = 0; }).catch(() => { failures++; }).finally(() => { inFlight = false; pump(); });
  };
  return { send(v) { pending = v; hasPending = true; pump(); }, get failures() { return failures; } };
}
