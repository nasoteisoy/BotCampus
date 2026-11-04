/**
 * Networking: PeerJS (host-authoritative) + loopback + solo bots.
 * Room code = short peer id suffix. Rejoin via localStorage name+code.
 */
(function (global) {
  'use strict';

  const LS_KEY = 'coop-mystery:session';
  const PEER_PREFIX = 'cmys';

  function saveSession(data) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch (e) { /* ignore */ }
  }

  function makeCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += alphabet[(Math.random() * alphabet.length) | 0];
    return s;
  }

  function peerIdFromCode(code) {
    return PEER_PREFIX + String(code).toUpperCase();
  }

  /**
   * Loopback transport for tests / sandbox without WebRTC.
   * Multiple NetClient instances share a static bus keyed by room code.
   */
  const LoopBus = {
    rooms: Object.create(null),
    ensure: function (code) {
      const c = String(code).toUpperCase();
      if (!this.rooms[c]) {
        this.rooms[c] = { host: null, clients: {} };
      }
      return this.rooms[c];
    },
    reset: function () {
      this.rooms = Object.create(null);
    }
  };

  function LoopbackHost(code, handlers) {
    this.code = String(code).toUpperCase();
    this.handlers = handlers || {};
    this.room = LoopBus.ensure(this.code);
    this.room.host = this;
    this.kind = 'loopback-host';
  }

  LoopbackHost.prototype.sendTo = function (clientId, msg) {
    const c = this.room.clients[clientId];
    if (c && c.handlers.onMessage) c.handlers.onMessage(msg);
  };

  LoopbackHost.prototype.broadcast = function (msg, exceptId) {
    Object.keys(this.room.clients).forEach((id) => {
      if (id === exceptId) return;
      this.sendTo(id, msg);
    });
  };

  LoopbackHost.prototype.destroy = function () {
    if (this.room.host === this) this.room.host = null;
  };

  function LoopbackClient(code, clientId, handlers) {
    this.code = String(code).toUpperCase();
    this.clientId = clientId;
    this.handlers = handlers || {};
    this.room = LoopBus.ensure(this.code);
    this.room.clients[clientId] = this;
    this.kind = 'loopback-client';
    const host = this.room.host;
    if (host && host.handlers.onClient) {
      setTimeout(() => host.handlers.onClient(clientId, this), 0);
    } else if (handlers.onError) {
      setTimeout(() => handlers.onError('No host for room ' + this.code), 0);
    }
  }

  LoopbackClient.prototype.send = function (msg) {
    const host = this.room.host;
    if (host && host.handlers.onMessage) {
      host.handlers.onMessage(this.clientId, msg);
    }
  };

  LoopbackClient.prototype.destroy = function () {
    delete this.room.clients[this.clientId];
  };

  /**
   * PeerJS host
   */
  function PeerHost(code, handlers) {
    this.code = String(code).toUpperCase();
    this.handlers = handlers || {};
    this.kind = 'peer-host';
    this.conns = {};
    this.peer = null;
    this.ready = false;
    this.error = null;

    if (typeof Peer === 'undefined') {
      this.error = 'PeerJS failed to load';
      if (handlers.onError) handlers.onError(this.error);
      return;
    }

    const id = peerIdFromCode(this.code);
    try {
      this.peer = new Peer(id, {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });
    } catch (e) {
      this.error = String(e.message || e);
      if (handlers.onError) handlers.onError(this.error);
      return;
    }

    this.peer.on('open', () => {
      this.ready = true;
      if (handlers.onReady) handlers.onReady(this.code);
    });

    this.peer.on('connection', (conn) => {
      const cid = conn.peer;
      this.conns[cid] = conn;
      conn.on('open', () => {
        if (handlers.onClient) handlers.onClient(cid, conn);
      });
      conn.on('data', (data) => {
        if (handlers.onMessage) handlers.onMessage(cid, data);
      });
      conn.on('close', () => {
        delete this.conns[cid];
        if (handlers.onClientLeft) handlers.onClientLeft(cid);
      });
    });

    this.peer.on('error', (err) => {
      this.error = (err && err.type) || String(err);
      let msg = 'PeerJS error: ' + this.error;
      if (this.error === 'unavailable-id') msg = 'Room code taken. Try Create again.';
      if (this.error === 'network' || this.error === 'server-error' || this.error === 'socket-error') {
        msg = 'Cannot reach PeerJS broker. Check network or use Solo Test.';
      }
      if (handlers.onError) handlers.onError(msg);
    });

    this.peer.on('disconnected', () => {
      if (handlers.onError) handlers.onError('Disconnected from PeerJS broker. Rejoin or use Solo Test.');
    });
  }

  PeerHost.prototype.sendTo = function (clientId, msg) {
    const conn = this.conns[clientId];
    if (conn && conn.open) conn.send(msg);
  };

  PeerHost.prototype.broadcast = function (msg, exceptId) {
    Object.keys(this.conns).forEach((id) => {
      if (id === exceptId) return;
      this.sendTo(id, msg);
    });
  };

  PeerHost.prototype.destroy = function () {
    Object.keys(this.conns).forEach((id) => {
      try { this.conns[id].close(); } catch (e) { /* */ }
    });
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) { /* */ }
    }
  };

  function PeerClient(code, handlers) {
    this.code = String(code).toUpperCase();
    this.handlers = handlers || {};
    this.kind = 'peer-client';
    this.peer = null;
    this.conn = null;
    this.ready = false;
    this.error = null;
    this.clientId = null;

    if (typeof Peer === 'undefined') {
      this.error = 'PeerJS failed to load';
      if (handlers.onError) handlers.onError(this.error);
      return;
    }

    try {
      this.peer = new Peer({
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });
    } catch (e) {
      this.error = String(e.message || e);
      if (handlers.onError) handlers.onError(this.error);
      return;
    }

    this.peer.on('open', (id) => {
      this.clientId = id;
      const hostId = peerIdFromCode(this.code);
      const conn = this.peer.connect(hostId, { reliable: true });
      this.conn = conn;
      conn.on('open', () => {
        this.ready = true;
        if (handlers.onReady) handlers.onReady(id);
      });
      conn.on('data', (data) => {
        if (handlers.onMessage) handlers.onMessage(data);
      });
      conn.on('close', () => {
        if (handlers.onError) handlers.onError('Lost host connection. Rejoin with same code + name.');
      });
      conn.on('error', (err) => {
        if (handlers.onError) handlers.onError('Connection error: ' + ((err && err.type) || err));
      });
    });

    this.peer.on('error', (err) => {
      this.error = (err && err.type) || String(err);
      let msg = 'PeerJS error: ' + this.error;
      if (this.error === 'peer-unavailable') msg = 'No room with that code. Check code or Create room.';
      if (this.error === 'network' || this.error === 'server-error' || this.error === 'socket-error') {
        msg = 'Cannot reach PeerJS broker. Check network or use Solo Test.';
      }
      if (handlers.onError) handlers.onError(msg);
    });
  }

  PeerClient.prototype.send = function (msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  };

  PeerClient.prototype.destroy = function () {
    if (this.conn) {
      try { this.conn.close(); } catch (e) { /* */ }
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) { /* */ }
    }
  };

  /**
   * Simple bot AI for solo: each bot "announces" lines (already in view);
   * occasionally they don't auto-report — human reports hearing them.
   * Host can call botAutoReport to have bots unlock from human's lines (optional juice).
   */

  function botAutoHear(state, mystery, G) {
    const humans = state.players.filter((p) => !p.isBot);
    const bots = state.players.filter((p) => p.isBot);
    if (!humans.length || !bots.length) return [];
    const results = [];
    bots.forEach((bot) => {
      humans.forEach((h) => {
        const lines = state.private[h.id].talkingPointIds;
        for (let i = 0; i < lines.length; i++) {
          const ph = lines[i];
          if (state.private[bot.id].heardPhraseIds.indexOf(ph) >= 0) continue;
          const r = G.reportHeard(state, mystery, bot.id, ph, h.id);
          if (r.ok) results.push({ bot: bot.name, phraseId: ph });
          break;
        }
      });
      // Bot spends one ask on a safe open response if possible
      const priv = state.private[bot.id];
      const cell = G.cellById(mystery, priv.currentCellId);
      if (!cell || priv.tokens < 1) return;
      const open = (cell.responses || []).find((r) => {
        if (priv.lockedResponseIds.indexOf(r.id) >= 0) return false;
        if (r.requiresPhraseId && priv.heardPhraseIds.indexOf(r.requiresPhraseId) < 0) return false;
        return !r.deadEnd;
      });
      if (open) {
        G.askResponse(state, mystery, bot.id, open.id);
      }
    });
    return results;
  }

  global.CoopMysteryNet = {
    makeCode: makeCode,
    peerIdFromCode: peerIdFromCode,
    saveSession: saveSession,
    loadSession: loadSession,
    clearSession: clearSession,
    LoopBus: LoopBus,
    LoopbackHost: LoopbackHost,
    LoopbackClient: LoopbackClient,
    PeerHost: PeerHost,
    PeerClient: PeerClient,
    botAutoHear: botAutoHear,
    LS_KEY: LS_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);
