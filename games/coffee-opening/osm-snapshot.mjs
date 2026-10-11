// osm-snapshot.mjs: the one-off OpenStreetMap snapshot tool for the 🗺 Metro map (node 18+). Not loaded by the app.
//   node osm-snapshot.mjs                                   (default server overpass-api.de)
//   OVERPASS=https://overpass.openstreetmap.fr/api/interpreter node osm-snapshot.mjs   (any public Overpass mirror)
// Asks Overpass ONCE for every amenity=cafe (plus coffee-brand fast_food) in the Phoenix-metro bbox, splits the result
// locally into existing-dutch-bros.json and competitors.json (drive-thru cafes + coffee brands), dated by the OSM base timestamp.
// Data © OpenStreetMap contributors, ODbL 1.0. Keep usage light: run it rarely, never from the app.
import { writeFileSync } from 'node:fs';
const SERVER = process.env.OVERPASS || 'https://overpass-api.de/api/interpreter';
const BB = '33.0,-112.75,33.95,-111.45';
const BRANDS = /starbucks|black rock|scooter|human bean|dunkin|biggby|7 brew|seven brew|ziggi|caribou|peet|coffee bean/i;
const q = `[out:json][timeout:120];(nwr["amenity"="cafe"](${BB});
nwr["amenity"="fast_food"]["brand"~"Dunkin|Dutch Bros|7 Brew|Ziggi|Scooter|Starbucks",i](${BB}););out center tags;`;
const r = await fetch(SERVER, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': 'dutch-bros-opening-tracker-pitch/4 (one-off snapshot)' } });
if (!r.ok) throw new Error('Overpass HTTP ' + r.status);
const j = await r.json(); if (j.remark) throw new Error('Overpass remark: ' + j.remark);
const els = j.elements || [], fetched = (j.osm3s?.timestamp_osm_base || new Date().toISOString()).slice(0, 10), seen = new Set();
const pt = (e) => (e.type === 'node' ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null);
const db = [], comp = [];
for (const e of els) {
  const k = e.type + e.id, t = e.tags || {}, p = pt(e); if (seen.has(k) || !p) continue; seen.add(k);
  const label = (t.brand || '') + ' ' + (t.name || ''), dt = t.drive_through === 'yes';
  const it = { lat: +p[0].toFixed(5), lng: +p[1].toFixed(5), name: t.name || t.brand || 'Cafe', brand: t.brand || '', dt, osm: k };
  if (/dutch bros/i.test(label)) db.push(it); else if (dt || BRANDS.test(label)) comp.push(it);
}
const base = { fetched, osm_base: j.osm3s?.timestamp_osm_base || null, status: 'ok', source: 'OpenStreetMap via the Overpass API (' + new URL(SERVER).host + ')',
  credit: '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)', bbox: BB.split(',').map(Number), tool: 'osm-snapshot.mjs' };
writeFileSync('existing-dutch-bros.json', JSON.stringify({ ...base, query: 'amenity=cafe|fast_food whose brand or name contains "Dutch Bros"', items: db }));
writeFileSync('competitors.json', JSON.stringify({ ...base, query: 'amenity=cafe with drive_through=yes, or cafe/fast_food brand or name: ' + BRANDS.source + ' (Dutch Bros excluded)', items: comp }));
console.log(`existing Dutch Bros: ${db.length} · competitors: ${comp.length} (drive-thru ${comp.filter((c) => c.dt).length}) · OSM data ${fetched}`);
