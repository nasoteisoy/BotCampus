/**
 * Google sign-in for the owner. Fake sign-in exists only when ?dcemu= is set.
 * The client never prints an email address. Fake account details are injected
 * by tests (window.__dcFakeAccounts); they are not stored in this file.
 */
import { firebaseConfig, readEmuConfig, parseHostPort } from './firebase-config.js';

let app = null;
let auth = null;
let database = null;
let sdk = null;
let watchers = [];
let current = null;
let ready = false;

export function getEmu() {
  return readEmuConfig();
}

export function getAuthUser() {
  return current;
}

export function isSignedIn() {
  return !!(current && current.uid);
}

export function isVerified() {
  return !!(current && current.uid && current.emailVerified);
}

export function getUid() {
  return current && current.uid ? current.uid : '';
}

export function getFirebase() {
  return { app, auth, database, sdk };
}

async function loadSdk() {
  if (sdk) return sdk;
  const [appMod, authMod, dbMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js'),
  ]);
  sdk = { appMod, authMod, dbMod };
  return sdk;
}

export async function initAuth() {
  const emu = readEmuConfig();
  const s = await loadSdk();
  const cfg = { ...firebaseConfig };
  if (emu.isEmu) {
    // Pin the emulator namespace to the project id so REST seeds and the SDK agree.
    cfg.databaseURL = `${emu.dbBase.replace(/\/+$/, '')}?ns=chummy-games`;
  }
  app = s.appMod.initializeApp(cfg);
  auth = s.authMod.getAuth(app);
  database = s.dbMod.getDatabase(app);

  if (emu.isEmu) {
    const dbHp = parseHostPort(emu.dbBase);
    s.dbMod.connectDatabaseEmulator(database, dbHp.host, dbHp.port);
    if (emu.authBase) {
      const aHp = parseHostPort(emu.authBase);
      s.authMod.connectAuthEmulator(auth, `${aHp.host === '127.0.0.1' || aHp.host === 'localhost' ? 'http' : 'https'}://${aHp.host}:${aHp.port}`, {
        disableWarnings: true,
      });
    }
  }

  s.authMod.onAuthStateChanged(auth, (user) => {
    current = user
      ? { uid: user.uid, emailVerified: !!user.emailVerified }
      : null;
    ready = true;
    for (const cb of watchers) {
      try { cb(current); } catch (_) { /* hook */ }
    }
  });

  installTestHooks(emu, s);
  await waitAuthReady();
  if (emu.isEmu && emu.fake) {
    try {
      await applyFakeQuery(emu.fake);
    } catch (err) {
      if (typeof window !== 'undefined') window.__dcAuthError = String(err && err.message ? err.message : err);
    }
  }
  return { app, auth, database, emu };
}

function waitAuthReady() {
  if (ready) return Promise.resolve(current);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(current), 2500);
    watchers.push(function once(u) {
      clearTimeout(t);
      watchers = watchers.filter((cb) => cb !== once);
      resolve(u);
    });
  });
}

export function watchAuth(cb) {
  watchers.push(cb);
  if (ready) cb(current);
  return () => {
    watchers = watchers.filter((x) => x !== cb);
  };
}

export async function signInGoogle() {
  if (!sdk || !auth) throw new Error('auth not ready');
  const emu = readEmuConfig();
  if (emu.isEmu) {
    return signInFake(resolveFakeAccount('chumi'));
  }
  const provider = new sdk.authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return sdk.authMod.signInWithPopup(auth, provider);
}

export async function doSignOut() {
  if (!sdk || !auth) return;
  return sdk.authMod.signOut(auth);
}

function resolveFakeAccount(name) {
  const bag = (typeof window !== 'undefined' && window.__dcFakeAccounts) || {};
  if (bag[name]) return bag[name];
  return null;
}

async function applyFakeQuery(name) {
  if (name === 'anon') {
    await doSignOut();
    return;
  }
  const acc = resolveFakeAccount(name);
  if (!acc) return;
  await signInFake(acc);
}

export async function signInFake(acc) {
  if (!acc || !acc.email) throw new Error('fake account missing');
  if (!readEmuConfig().isEmu) throw new Error('fake auth only with dcemu');
  if (!sdk || !auth) throw new Error('auth not ready');
  const payload = {
    sub: acc.uid || acc.sub || `emu-${acc.email}`,
    email: acc.email,
    email_verified: acc.emailVerified !== false && acc.email_verified !== false,
    name: acc.name || 'User',
  };
  const cred = sdk.authMod.GoogleAuthProvider.credential(JSON.stringify(payload));
  return sdk.authMod.signInWithCredential(auth, cred);
}

function installTestHooks(emu, s) {
  if (!emu.isEmu || typeof window === 'undefined') return;
  window.__dcSignInFake = (acc) => signInFake(acc);
  window.__dcSignOut = () => doSignOut();
  window.__dcGetUid = () => getUid();
}

export { loadSdk };
