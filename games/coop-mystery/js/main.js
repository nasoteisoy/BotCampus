/**
 * App controller: host holds state, pushes private views.
 * Modes: peer | loopback | solo
 */
(function () {
  'use strict';

  const G = window.CoopMysteryGame;
  const Net = window.CoopMysteryNet;
  const UI = window.CoopUI;

  const root = document.getElementById('app');
  let mystery = null;
  let mode = null; // 'host-peer' | 'client-peer' | 'host-loop' | 'solo'
  let transport = null;
  let state = null;
  let myId = null;
  let myName = null;
  let roomCode = null;
  let lastError = null;
  let isHost = false;

  // client-side cached private view
  let clientView = null;

  function showError(msg) {
    lastError = msg;
    render();
  }

  function clearError() {
    lastError = null;
  }

  async function loadMystery() {
    const res = await fetch('data/sample-mystery.json');
    if (!res.ok) throw new Error('Cannot load mystery data');
    mystery = await res.json();
  }

  function persist() {
    if (!roomCode || !myName) return;
    Net.saveSession({
      code: roomCode,
      name: myName,
      role: isHost ? 'host' : 'client',
      mode: mode,
      playerId: myId
    });
  }

  function pushViews() {
    if (!state || !isHost) return;
    // Local render for host
    render();
    if (!transport || typeof transport.sendTo !== 'function') return;
    state.players.forEach((p) => {
      if (p.id === myId) return;
      if (p.isBot) return;
      const target = p.peerId;
      if (!target) return;
      const view =
        state.phase === G.PHASE.LOBBY
          ? { type: 'lobby', view: G.lobbyView(state, mystery) }
          : { type: 'view', view: G.viewFor(state, mystery, p.id) };
      transport.sendTo(target, view);
    });
  }

  function handleHostMessage(clientKey, msg) {
    if (!msg || !msg.type) return;
    clearError();
    if (msg.type === 'hello') {
      const r = G.addPlayer(state, mystery, {
        name: msg.name,
        peerId: clientKey,
        id: msg.playerId || undefined
      });
      if (!r.ok) {
        transport.sendTo(clientKey, { type: 'error', error: r.error });
        return;
      }
      // map peer to player
      r.player.peerId = clientKey;
      transport.sendTo(clientKey, {
        type: 'welcome',
        playerId: r.player.id,
        lobby: G.lobbyView(state, mystery)
      });
      pushViews();
      return;
    }
    if (msg.type === 'action') {
      applyAction(msg.playerId, msg.action, msg.payload || {});
    }
  }

  function applyAction(playerId, action, payload) {
    if (!isHost || !state) return;
    let result = { ok: false };
    switch (action) {
      case 'start':
        if (playerId !== state.hostPlayerId) return;
        G.startGame(state, mystery);
        result = { ok: true };
        break;
      case 'hear':
        result = G.reportHeard(state, mystery, playerId, payload.phraseId, payload.fromId);
        break;
      case 'ask':
        result = G.askResponse(state, mystery, playerId, payload.responseId);
        break;
      case 'endRound':
        if (playerId !== state.hostPlayerId) return;
        result = G.endRound(state, mystery);
        break;
      case 'next':
        if (playerId !== state.hostPlayerId) return;
        result = G.advanceAfterCallout(state, mystery);
        break;
      case 'vote':
        result = G.castVote(state, playerId, payload.suspectId);
        break;
      case 'reveal':
        if (playerId !== state.hostPlayerId) return;
        result = G.resolveVotes(state, mystery);
        break;
      case 'peek':
        result = G.usePeek(state, mystery, playerId, payload.cellId || payload.threadId);
        break;
      case 'force':
        result = G.useForce(state, mystery, playerId, payload.targetId);
        break;
      case 'swap': {
        let their = payload.theirPhraseId;
        if (!their && state.private[payload.targetId]) {
          their = state.private[payload.targetId].talkingPointIds[0];
        }
        result = G.useSwap(
          state,
          mystery,
          playerId,
          payload.targetId,
          payload.myPhraseId,
          their
        );
        break;
      }
      case 'check':
        result = G.useCheck(state, mystery, playerId, payload.clueId);
        break;
      case 'botTick':
        if (mode === 'solo') {
          Net.botAutoHear(state, mystery, G);
          result = { ok: true };
        }
        break;
      default:
        return;
    }
    if (result && result.ok === false && result.error) {
      // soft: still push views
    }
    pushViews();
  }

  function hostAction(action, payload) {
    applyAction(myId, action, payload || {});
  }

  function clientAction(action, payload) {
    if (isHost) {
      hostAction(action, payload);
      return;
    }
    if (transport && transport.send) {
      transport.send({
        type: 'action',
        playerId: myId,
        action: action,
        payload: payload || {}
      });
    }
  }

  function destroyTransport() {
    if (transport && transport.destroy) transport.destroy();
    transport = null;
  }

  function goHome() {
    destroyTransport();
    state = null;
    clientView = null;
    mode = null;
    isHost = false;
    clearError();
    render();
  }

  /** Create room with PeerJS; fallback messaging on failure */
  function createRoom(name, preferLoopback) {
    destroyTransport();
    myName = name;
    isHost = true;
    roomCode = Net.makeCode();
    myId = 'host-' + roomCode.toLowerCase();
    clearError();

    state = G.createGame(mystery, {
      roomCode: roomCode,
      hostPlayerId: myId,
      players: [{ id: myId, name: myName, isBot: false }]
    });

    const onReady = () => {
      persist();
      pushViews();
    };

    if (preferLoopback) {
      mode = 'host-loop';
      transport = new Net.LoopbackHost(roomCode, {
        onClient: function (cid) {
          /* hello comes via message */
        },
        onMessage: handleHostMessage
      });
      onReady();
      return;
    }

    mode = 'host-peer';
    transport = new Net.PeerHost(roomCode, {
      onReady: onReady,
      onClient: function () {},
      onMessage: handleHostMessage,
      onError: function (msg) {
        showError(msg);
      }
    });
    // Optimistic lobby while Peer opens
    persist();
    render();
  }

  function joinRoom(name, code, preferLoopback) {
    destroyTransport();
    myName = name;
    roomCode = String(code || '').toUpperCase();
    isHost = false;
    clearError();
    clientView = null;

    const sendHello = () => {
      transport.send({
        type: 'hello',
        name: myName,
        playerId: myId || undefined
      });
      persist();
      render();
    };

    if (preferLoopback) {
      mode = 'client-loop';
      myId = 'c-' + Math.random().toString(36).slice(2, 8);
      transport = new Net.LoopbackClient(roomCode, myId, {
        onMessage: onClientMessage,
        onError: showError
      });
      setTimeout(sendHello, 10);
      return;
    }

    mode = 'client-peer';
    transport = new Net.PeerClient(roomCode, {
      onReady: function (id) {
        myId = id;
        sendHello();
      },
      onMessage: onClientMessage,
      onError: showError
    });
    render();
  }

  function onClientMessage(msg) {
    if (!msg) return;
    if (msg.type === 'error') {
      showError(msg.error);
      return;
    }
    if (msg.type === 'welcome') {
      myId = msg.playerId;
      clientView = Object.assign({ phase: 'lobby' }, msg.lobby, {
        me: { id: myId, name: myName, isHost: false, roleName: '' }
      });
      // stash lobby shape
      clientView._lobby = msg.lobby;
      persist();
      render();
      return;
    }
    if (msg.type === 'lobby') {
      clientView = Object.assign({}, msg.view, {
        me: { id: myId, name: myName, isHost: false, roleName: '' },
        _lobby: msg.view
      });
      render();
      return;
    }
    if (msg.type === 'view') {
      clientView = msg.view;
      render();
    }
  }

  function startSolo(name) {
    destroyTransport();
    Net.LoopBus.reset();
    myName = name;
    isHost = true;
    mode = 'solo';
    roomCode = 'SOLO';
    myId = 'you';
    clearError();

    const bots = (mystery.bots || []).slice(0, 3).map((b, i) => ({
      id: 'bot' + (i + 1),
      name: b.name,
      isBot: true,
      roleId: b.roleId
    }));

    state = G.createGame(mystery, {
      roomCode: roomCode,
      hostPlayerId: myId,
      players: [{ id: myId, name: myName, isBot: false }].concat(bots)
    });
    // Keep bot roleIds from data
    bots.forEach((b) => {
      const p = state.players.find((x) => x.id === b.id);
      if (p) p.roleId = b.roleId;
      const role = mystery.roles.find((r) => r.id === b.roleId);
      if (role) {
        state.private[p.id].abilityUses = {};
        role.abilities.forEach((a) => {
          state.private[p.id].abilityUses[a.id] = a.usesPerRound;
        });
      }
    });
    // Human gets first remaining role
    const used = new Set(bots.map((b) => b.roleId));
    const humanRole = mystery.roles.find((r) => !used.has(r.id)) || mystery.roles[0];
    state.players[0].roleId = humanRole.id;
    state.private[myId].abilityUses = {};
    humanRole.abilities.forEach((a) => {
      state.private[myId].abilityUses[a.id] = a.usesPerRound;
    });

    G.startGame(state, mystery);
    persist();
    pushViews();
  }

  function currentView() {
    if (isHost && state) {
      if (state.phase === G.PHASE.LOBBY) {
        return Object.assign(G.lobbyView(state, mystery), {
          me: {
            id: myId,
            name: myName,
            isHost: true,
            roleName: state.players.find((p) => p.id === myId)
              ? mystery.roles.find((r) => r.id === state.players.find((p) => p.id === myId).roleId).name
              : ''
          }
        });
      }
      return G.viewFor(state, mystery, myId);
    }
    return clientView;
  }

  function render() {
    const saved = Net.loadSession();
    if (!mystery) {
      UI.mount(root, [UI.errorBanner('Loading…')]);
      return;
    }

    if (!mode) {
      UI.mount(root, [
        lastError ? UI.errorBanner(lastError) : null,
        UI.homeScreen(
          {
            create: (n) => createRoom(n, false),
            joinPrompt: (n) => {
              myName = n;
              mode = 'join-prompt';
              render();
            },
            solo: startSolo,
            rejoin: (s) => {
              if (s.role === 'host') createRoom(s.name, s.mode === 'host-loop');
              else joinRoom(s.name, s.code, s.mode === 'client-loop');
            }
          },
          saved
        )
      ]);
      // homeScreen returns fragment — mount expects nodes; fix by using child approach
      return;
    }

    if (mode === 'join-prompt') {
      UI.mount(root, [
        UI.joinScreen(myName, {
          home: goHome,
          join: (n, c) => joinRoom(n, c, false)
        })
      ]);
      return;
    }

    const view = currentView();
    if (!view) {
      UI.mount(root, [
        lastError ? UI.errorBanner(lastError) : null,
        elWait()
      ]);
      return;
    }

    const handlers = {
      home: goHome,
      start: () => hostAction('start'),
      endRound: () => {
        hostAction('endRound');
      },
      nextAfterCallout: () => hostAction('next'),
      vote: (id) => clientAction('vote', { suspectId: id }),
      reveal: () => hostAction('reveal'),
      openHear: (opts) => {
        const options = (opts || []).map((o) => ({
          label: (o.decoy ? '? · ' : o.fromName + ': ') + o.text,
          phraseId: o.phraseId,
          fromId: o.fromId,
          decoy: !!o.decoy
        }));
        UI.modalPicker('What did you hear?', 'Wrong pick costs a token.', options, (opt) => {
          clientAction('hear', { phraseId: opt.phraseId, fromId: opt.fromId });
          if (mode === 'solo') hostAction('botTick');
        });
      },
      askResponse: (responseId) => clientAction('ask', { responseId: responseId }),
      ability: (a) => openAbility(a, view)
    };

    let screen;
    const phase = view.phase || (view._lobby ? 'lobby' : null);
    if (phase === 'lobby' || view._lobby) {
      const lobby = view._lobby || view;
      screen = UI.lobbyScreen(lobby, handlers, isHost, lastError);
    } else if (phase === 'round') {
      screen = UI.roundScreen(view, handlers);
    } else if (phase === 'round_end') {
      screen = UI.calloutScreen(view, handlers);
    } else if (phase === 'final') {
      screen = UI.finalScreen(view, handlers);
    } else if (phase === 'reveal') {
      screen = UI.revealScreen(view, handlers);
    } else {
      screen = elWait();
    }

    const nodes = [];
    if (lastError && phase !== 'lobby') nodes.push(UI.errorBanner(lastError));
    // fragment children
    if (screen && screen.childNodes) {
      Array.from(screen.childNodes).forEach((n) => nodes.push(n));
    } else if (screen) {
      nodes.push(screen);
    }
    UI.mount(root, nodes);
  }

  function elWait() {
    const d = document.createElement('div');
    d.className = 'panel';
    d.innerHTML = '<p class="hint">Connecting…</p>';
    return d;
  }

  function openAbility(a, view) {
    if (a.id === 'peek') {
      const options = ((view.maze && view.maze.peekTargets) || []).map((t) => ({
        label: t.dir + ' · ' + t.label,
        cellId: t.id
      }));
      UI.modalPicker('Peek', a.hint, options, (opt) => {
        clientAction('peek', { cellId: opt.cellId });
      });
      return;
    }
    if (a.id === 'force') {
      const options = (view.players || [])
        .filter((p) => !p.isMe)
        .map((p) => ({ label: p.name, targetId: p.id }));
      UI.modalPicker('Ask', a.hint, options, (opt) => {
        clientAction('force', { targetId: opt.targetId });
      });
      return;
    }
    if (a.id === 'swap') {
      const others = (view.players || []).filter((p) => !p.isMe);
      UI.modalPicker(
        'Swap with',
        a.hint,
        others.map((p) => ({ label: p.name, targetId: p.id })),
        (who) => {
          const mine = (view.talkingPoints || []).map((t) => ({
            label: 'Mine: ' + t.text,
            myPhraseId: t.id
          }));
          UI.modalPicker('Your line to give', '', mine, (myOpt) => {
            // For V1: host resolves using target's first line if client doesn't know it.
            // Host path has full state; client sends target only and host picks their first.
            if (isHost && state) {
              const their = state.private[who.targetId].talkingPointIds[0];
              clientAction('swap', {
                targetId: who.targetId,
                myPhraseId: myOpt.myPhraseId,
                theirPhraseId: their
              });
            } else {
              clientAction('swap', {
                targetId: who.targetId,
                myPhraseId: myOpt.myPhraseId,
                theirPhraseId: null
              });
            }
          });
        }
      );
      return;
    }
    if (a.id === 'check') {
      const clues = (view.clues || [])
        .filter((c) => !c.deadEnd)
        .map((c) => ({ label: c.text, clueId: c.id }));
      UI.modalPicker('Double-check', a.hint, clues, (opt) => {
        clientAction('check', { clueId: opt.clueId });
      });
    }
  }

  // Test hooks only when ?test=1 (do not ship active)
  if (/(?:^|[?&])test=1(?:&|$)/.test(location.search)) {
    window.__coopMystery = {
      getState: () => state,
      getView: currentView,
      getMode: () => mode,
      getMystery: () => mystery,
      createRoom: createRoom,
      joinRoom: joinRoom,
      startSolo: startSolo,
      hostAction: hostAction,
      clientAction: clientAction,
      applyAction: function (a, p) {
        applyAction(myId, a, p);
      },
      pushViews: pushViews,
      goHome: goHome,
      Net: Net,
      G: G,
      render: render,
      isHost: () => isHost,
      myId: () => myId
    };
  }

  loadMystery()
    .then(() => {
      render();
    })
    .catch((e) => {
      UI.mount(root, [UI.errorBanner(String(e.message || e))]);
    });
})();
