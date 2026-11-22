/**
 * Public Firebase web config for the existing chummy-games project.
 * These values are client config, not secrets.
 * Writes go only to the devChecklists/ path. Never touch other roots.
 */
export const LIVE_DB_URL = 'https://chummy-games-default-rtdb.firebaseio.com';

export const firebaseConfig = {
  apiKey: 'AIzaSyDVbt_8GuRuHJRPAN7jFXbs_lJUfUHNxHE',
  authDomain: 'chummy-games.firebaseapp.com',
  databaseURL: LIVE_DB_URL,
  projectId: 'chummy-games',
  storageBucket: 'chummy-games.firebasestorage.app',
  messagingSenderId: '869241598273',
  appId: '1:869241598273:web:d97492b7308f785c37f1c0',
};

const HTTP_BASE = /^https?:\/\/[a-zA-Z0-9.:-]+$/;

function readParams(win) {
  try {
    return new URLSearchParams((win.location && win.location.search) || '');
  } catch {
    return new URLSearchParams();
  }
}

/** Only an explicit ?dcemu=http(s) base turns on emulator mode. Never infer from hostname. */
export function readEmuConfig(win = typeof window === 'undefined' ? undefined : window) {
  if (!win) return { isEmu: false };
  const q = readParams(win);
  const raw = q.get('dcemu') || '';
  if (!HTTP_BASE.test(raw)) return { isEmu: false };
  const dbBase = raw.replace(/\/+$/, '');
  let authBase = '';
  const authRaw = q.get('dcauth') || '';
  if (HTTP_BASE.test(authRaw)) {
    authBase = authRaw.replace(/\/+$/, '');
  } else {
    try {
      const u = new URL(dbBase);
      const port = 19111;
      authBase = `${u.protocol}//${u.hostname}:${port}`;
    } catch {
      authBase = '';
    }
  }
  const fake = String(q.get('dcfake') || '').trim();
  return { isEmu: true, dbBase, authBase, fake };
}

export function parseHostPort(base) {
  const u = new URL(base);
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  return { host: u.hostname, port };
}

/**
 * Product saves go to the live DB unless ?dcemu is set.
 * Emulator mode must never write to live, including on a real host.
 * Localhost / 127.0.0.1 without ?dcemu may write live (no client host guard).
 */
export function allowLiveWrites(win = typeof window === 'undefined' ? undefined : window) {
  if (!win || !win.location) return false;
  if (readEmuConfig(win).isEmu) return false;
  return true;
}
