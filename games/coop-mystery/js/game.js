/**
 * Host-authoritative co-op mystery engine — flat 2D maze + phrase gates + tokens.
 */
(function (global) {
  'use strict';

  const PHASE = {
    LOBBY: 'lobby',
    ROUND: 'round',
    ROUND_END: 'round_end',
    FINAL: 'final',
    REVEAL: 'reveal'
  };

  const DIRS = ['N', 'E', 'S', 'W'];

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function phraseById(mystery, id) {
    return (mystery.phrases || []).find((p) => p.id === id) || null;
  }

  function clueById(mystery, id) {
    return (mystery.clues || []).find((c) => c.id === id) || null;
  }

  function cellById(mystery, id) {
    return mystery.maze.cells.find((c) => c.id === id) || null;
  }

  function roleById(mystery, id) {
    return mystery.roles.find((r) => r.id === id) || null;
  }

  function makeAbilityUses(role) {
    const uses = {};
    (role.abilities || []).forEach((a) => {
      uses[a.id] = a.usesPerRound;
    });
    return uses;
  }

  function assignRoles(mystery, players) {
    const roles = mystery.roles.slice();
    const used = new Set(players.filter((p) => p.roleId).map((p) => p.roleId));
    let ri = 0;
    players.forEach((p) => {
      if (p.roleId && roles.some((r) => r.id === p.roleId)) return;
      while (ri < roles.length * 2 && used.has(roles[ri % roles.length].id)) ri++;
      p.roleId = roles[ri % roles.length].id;
      used.add(p.roleId);
      ri++;
    });
  }

  function talkingPointsFor(mystery, roleId, roundIndex) {
    const block = mystery.roundTalkingPoints[roundIndex] || {};
    return (block[roleId] || []).slice();
  }

  function freshPrivate(mystery, role) {
    const start = mystery.maze.startId;
    return {
      unlockedClueIds: [],
      verifiedClueIds: [],
      abilityUses: makeAbilityUses(role),
      talkingPointIds: [],
      peekedCellIds: [],
      forcedShowFrom: null,
      currentCellId: start,
      visitedCellIds: [start],
      heardPhraseIds: [],
      tokens: mystery.tokensPerRound || 4,
      tokensSpent: 0,
      lockedResponseIds: [],
      lastWall: null,
      falseDoorIds: []
    };
  }

  function createGame(mystery, opts) {
    opts = opts || {};
    const players = (opts.players || []).map((p, i) => ({
      id: p.id || 'p' + i,
      name: p.name || 'Player ' + (i + 1),
      isBot: !!p.isBot,
      roleId: p.roleId || null,
      peerId: p.peerId || null
    }));
    assignRoles(mystery, players);
    const state = {
      mysteryId: mystery.id,
      phase: PHASE.LOBBY,
      roundIndex: 0,
      totalRounds: mystery.rounds,
      players: players,
      private: {},
      lastCallout: null,
      finalVotes: {},
      winner: null,
      roomCode: opts.roomCode || null,
      hostPlayerId: opts.hostPlayerId || (players[0] && players[0].id) || null,
      log: []
    };
    players.forEach((p) => {
      state.private[p.id] = freshPrivate(mystery, roleById(mystery, p.roleId));
    });
    return state;
  }

  function pushLog(state, msg) {
    state.log.push({ t: Date.now(), msg: msg });
    if (state.log.length > 50) state.log.shift();
  }

  function beginRound(state, mystery) {
    state.players.forEach((p) => {
      const role = roleById(mystery, p.roleId);
      const priv = state.private[p.id];
      priv.abilityUses = makeAbilityUses(role);
      priv.talkingPointIds = talkingPointsFor(mystery, p.roleId, state.roundIndex);
      priv.forcedShowFrom = null;
      priv.tokens = mystery.tokensPerRound || 4;
      priv.lockedResponseIds = [];
      priv.lastWall = null;
      // maze progress + heard phrases + clues persist across rounds
    });
    state.lastCallout = null;
  }

  function startGame(state, mystery) {
    state.phase = PHASE.ROUND;
    state.roundIndex = 0;
    beginRound(state, mystery);
    pushLog(state, 'Round 1 start');
    return state;
  }

  function spendTokens(priv, n) {
    const use = Math.max(0, n | 0);
    priv.tokens = Math.max(0, priv.tokens - use);
    priv.tokensSpent += use;
  }

  function hasHeard(priv, phraseId) {
    return !phraseId || priv.heardPhraseIds.indexOf(phraseId) >= 0;
  }

  /**
   * Receiver claims they heard a phrase. Wrong pick (nobody holds it) costs a token.
   * Right pick adds to heardPhraseIds — gates maze responses.
   * If phrase maps to an immediate clue via legacy clue.phraseId, also unlock (optional).
   */
  function reportHeard(state, mystery, receiverId, phraseId, fromPlayerId) {
    if (state.phase !== PHASE.ROUND) return { ok: false, error: 'Not in round' };
    const priv = state.private[receiverId];
    if (!priv) return { ok: false, error: 'No player' };
    const phrase = phraseById(mystery, phraseId);
    if (!phrase) return { ok: false, error: 'Bad phrase' };

    let speakerId = fromPlayerId || null;
    if (speakerId) {
      if (speakerId === receiverId) return { ok: false, error: 'Self' };
      const speaker = state.private[speakerId];
      if (!speaker) return { ok: false, error: 'No speaker' };
      if (speaker.talkingPointIds.indexOf(phraseId) < 0) {
        // Wrong pick — costs a token
        if (priv.tokens < 1) return { ok: false, error: 'No tokens' };
        spendTokens(priv, 1);
        pushLog(state, privName(state, receiverId) + ' wrong hear');
        return { ok: false, error: 'Wrong hear', wrong: true, tokens: priv.tokens };
      }
    } else {
      const holders = state.players.filter((p) => {
        if (p.id === receiverId) return false;
        return state.private[p.id].talkingPointIds.indexOf(phraseId) >= 0;
      });
      if (!holders.length) {
        if (priv.tokens < 1) return { ok: false, error: 'No tokens' };
        spendTokens(priv, 1);
        return { ok: false, error: 'Wrong hear', wrong: true, tokens: priv.tokens };
      }
      speakerId = holders[0].id;
    }

    if (priv.heardPhraseIds.indexOf(phraseId) < 0) {
      priv.heardPhraseIds.push(phraseId);
    }
    pushLog(state, privName(state, receiverId) + ' heard ' + phraseId);
    return { ok: true, phraseId: phraseId, fromPlayerId: speakerId, tokens: priv.tokens };
  }

  function privName(state, id) {
    const p = state.players.find((x) => x.id === id);
    return p ? p.name : id;
  }

  /**
   * Ask current cell: pick a response. Costs 1 token.
   * Dead end: extra cost, mark wall, lock response for round.
   * Wrong (locked / no phrase / already locked): lock + spend.
   * Correct: move, visit, unlock clue if any.
   */
  function askResponse(state, mystery, playerId, responseId) {
    if (state.phase !== PHASE.ROUND) return { ok: false, error: 'phase' };
    const priv = state.private[playerId];
    if (!priv) return { ok: false, error: 'player' };
    if (priv.tokens < 1) return { ok: false, error: 'No tokens' };

    const cell = cellById(mystery, priv.currentCellId);
    if (!cell) return { ok: false, error: 'cell' };
    const resp = (cell.responses || []).find((r) => r.id === responseId);
    if (!resp) return { ok: false, error: 'response' };

    if (priv.lockedResponseIds.indexOf(responseId) >= 0) {
      return { ok: false, error: 'Locked this round' };
    }

    // Phrase-gated options that aren't heard yet cannot be asked (hidden in view);
    // if somehow sent, treat as wrong pick cost.
    if (resp.requiresPhraseId && !hasHeard(priv, resp.requiresPhraseId)) {
      spendTokens(priv, 1);
      priv.lockedResponseIds.push(responseId);
      return { ok: false, error: 'Need phrase', wrong: true, tokens: priv.tokens };
    }

    // Spend ask token
    spendTokens(priv, 1);

    if (resp.deadEnd) {
      const extra = mystery.deadEndExtraCost || 1;
      spendTokens(priv, extra);
      if (priv.lockedResponseIds.indexOf(responseId) < 0) {
        priv.lockedResponseIds.push(responseId);
      }
      if (resp.clueId && priv.unlockedClueIds.indexOf(resp.clueId) < 0) {
        priv.unlockedClueIds.push(resp.clueId);
      }
      priv.lastWall = {
        cellId: cell.id,
        responseId: responseId,
        text: resp.text,
        clueText: resp.clueId && clueById(mystery, resp.clueId)
          ? clueById(mystery, resp.clueId).text
          : 'Dead end'
      };
      pushLog(state, privName(state, playerId) + ' wall');
      return {
        ok: true,
        wall: true,
        tokens: priv.tokens,
        lastWall: priv.lastWall
      };
    }

    // Success path (false-trail doors look identical; tracked privately for reveal)
    if (resp.trail === 'false' && priv.falseDoorIds.indexOf(resp.id) < 0) {
      priv.falseDoorIds.push(resp.id);
    }
    if (resp.clueId && priv.unlockedClueIds.indexOf(resp.clueId) < 0) {
      priv.unlockedClueIds.push(resp.clueId);
    }
    if (resp.to) {
      priv.currentCellId = resp.to;
      if (priv.visitedCellIds.indexOf(resp.to) < 0) {
        priv.visitedCellIds.push(resp.to);
      }
    }
    priv.lastWall = null;
    pushLog(state, privName(state, playerId) + ' moved to ' + priv.currentCellId);
    return {
      ok: true,
      wall: false,
      cellId: priv.currentCellId,
      clueId: resp.clueId || null,
      tokens: priv.tokens
    };
  }

  function keyClueCount(state, mystery, playerId) {
    const key = new Set(mystery.solution.keyClueIds);
    return (state.private[playerId].unlockedClueIds || []).filter((id) => key.has(id)).length;
  }

  /** Efficiency score: key clues / tokens spent (higher better). Raw clues as tiebreak. */
  function scorePlayer(state, mystery, playerId) {
    const keys = keyClueCount(state, mystery, playerId);
    const spent = state.private[playerId].tokensSpent || 0;
    // Keys per token; with 0 keys, fewer tokens spent ranks higher (less guessing).
    if (keys <= 0) return -spent;
    return Math.round((keys * 1000) / Math.max(1, spent));
  }

  function leaderboard(state, mystery) {
    return state.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: scorePlayer(state, mystery, p.id),
        keyClues: keyClueCount(state, mystery, p.id),
        tokensSpent: state.private[p.id].tokensSpent || 0
      }))
      .sort((a, b) => b.score - a.score || b.keyClues - a.keyClues || a.tokensSpent - b.tokensSpent);
  }

  function endRound(state, mystery) {
    if (state.phase !== PHASE.ROUND) return { ok: false };
    const board = leaderboard(state, mystery);
    const top = board[0];
    const tied = board.filter((b) => b.score === top.score);
    state.lastCallout = {
      round: state.roundIndex + 1,
      leaders: tied.map((t) => ({
        id: t.id,
        name: t.name,
        score: t.score,
        keyClues: t.keyClues,
        tokensSpent: t.tokensSpent
      })),
      board: board
    };
    state.phase = PHASE.ROUND_END;
    pushLog(state, 'Round end callout');
    return { ok: true, callout: state.lastCallout };
  }

  function advanceAfterCallout(state, mystery) {
    if (state.phase !== PHASE.ROUND_END) return { ok: false };
    if (state.roundIndex + 1 >= state.totalRounds) {
      state.phase = PHASE.FINAL;
      pushLog(state, 'Final vote');
      return { ok: true, phase: state.phase };
    }
    state.roundIndex += 1;
    state.phase = PHASE.ROUND;
    beginRound(state, mystery);
    pushLog(state, 'Round ' + (state.roundIndex + 1) + ' start');
    return { ok: true, phase: state.phase };
  }

  function castVote(state, playerId, suspectId) {
    if (state.phase !== PHASE.FINAL) return { ok: false };
    state.finalVotes[playerId] = suspectId;
    return { ok: true };
  }

  function resolveVotes(state, mystery) {
    if (state.phase !== PHASE.FINAL) return { ok: false };
    const votes = Object.values(state.finalVotes);
    if (votes.length < state.players.length) return { ok: false, error: 'Waiting for votes' };
    const counts = {};
    votes.forEach((v) => {
      counts[v] = (counts[v] || 0) + 1;
    });
    let best = null;
    let bestN = 0;
    let tie = false;
    Object.keys(counts).forEach((k) => {
      if (counts[k] > bestN) {
        best = k;
        bestN = counts[k];
        tie = false;
      } else if (counts[k] === bestN) {
        tie = true;
      }
    });
    const win = !tie && best === mystery.solution.suspectId;
    state.winner = win;
    state.phase = PHASE.REVEAL;
    state.reveal = {
      picked: best,
      tie: tie,
      correctId: mystery.solution.suspectId,
      win: win,
      board: leaderboard(state, mystery),
      players: revealDetails(state, mystery)
    };
    pushLog(state, win ? 'Win' : 'Lose');
    return { ok: true, reveal: state.reveal };
  }

  /** Final reveal: each player's clues as real / herring / dead end, and false doors passed. */
  function revealDetails(state, mystery) {
    const key = new Set(mystery.solution.keyClueIds);
    return state.players.map((p) => {
      const priv = state.private[p.id];
      return {
        id: p.id,
        name: p.name,
        clues: priv.unlockedClueIds.map((id) => {
          const c = clueById(mystery, id) || {};
          const kind = c.deadEnd ? 'deadend' : c.herring ? 'herring' : key.has(id) ? 'key' : 'real';
          return { id: id, text: c.text || id, kind: kind };
        }),
        falseDoors: (priv.falseDoorIds || []).map((rid) => {
          let label = rid;
          mystery.maze.cells.forEach((cell) => {
            (cell.responses || []).forEach((r) => {
              if (r.id === rid) label = cell.label + ' › ' + r.text;
            });
          });
          return { id: rid, label: label };
        })
      };
    });
  }

  function neighborCell(mystery, fromCell, dir) {
    const dx = { N: 0, E: 1, S: 0, W: -1 }[dir];
    const dy = { N: -1, E: 0, S: 1, W: 0 }[dir];
    const x = fromCell.x + dx;
    const y = fromCell.y + dy;
    return mystery.maze.cells.find((c) => c.x === x && c.y === y) || null;
  }

  function usePeek(state, mystery, playerId, cellId) {
    if (state.phase !== PHASE.ROUND) return { ok: false, error: 'phase' };
    const priv = state.private[playerId];
    if (!priv || (priv.abilityUses.peek || 0) < 1) return { ok: false, error: 'no uses' };
    const cell = cellById(mystery, cellId);
    if (!cell) return { ok: false, error: 'cell' };
    // Must be adjacent to current
    const cur = cellById(mystery, priv.currentCellId);
    const adj =
      Math.abs(cell.x - cur.x) + Math.abs(cell.y - cur.y) === 1;
    if (!adj) return { ok: false, error: 'not adjacent' };
    priv.abilityUses.peek -= 1;
    if (priv.peekedCellIds.indexOf(cellId) < 0) priv.peekedCellIds.push(cellId);
    return { ok: true, label: cell.label, question: cell.question };
  }

  function useForce(state, mystery, playerId, targetId) {
    if (state.phase !== PHASE.ROUND) return { ok: false, error: 'phase' };
    const priv = state.private[playerId];
    if (!priv || (priv.abilityUses.force || 0) < 1) return { ok: false, error: 'no uses' };
    if (playerId === targetId) return { ok: false, error: 'self' };
    const target = state.private[targetId];
    if (!target) return { ok: false, error: 'target' };
    priv.abilityUses.force -= 1;
    const lineId = target.talkingPointIds[0] || null;
    const phrase = lineId ? phraseById(mystery, lineId) : null;
    priv.forcedShowFrom = {
      fromId: targetId,
      phraseId: lineId,
      text: phrase ? phrase.text : null
    };
    return { ok: true, forced: priv.forcedShowFrom };
  }

  function useSwap(state, mystery, playerId, targetId, myPhraseId, theirPhraseId) {
    if (state.phase !== PHASE.ROUND) return { ok: false, error: 'phase' };
    const priv = state.private[playerId];
    const target = state.private[targetId];
    if (!priv || !target) return { ok: false, error: 'players' };
    if ((priv.abilityUses.swap || 0) < 1) return { ok: false, error: 'no uses' };
    const mi = priv.talkingPointIds.indexOf(myPhraseId);
    const ti = target.talkingPointIds.indexOf(theirPhraseId);
    if (mi < 0 || ti < 0) return { ok: false, error: 'phrase' };
    priv.abilityUses.swap -= 1;
    priv.talkingPointIds[mi] = theirPhraseId;
    target.talkingPointIds[ti] = myPhraseId;
    return { ok: true };
  }

  function useCheck(state, mystery, playerId, clueId) {
    if (state.phase !== PHASE.ROUND) return { ok: false, error: 'phase' };
    const priv = state.private[playerId];
    if (!priv || (priv.abilityUses.check || 0) < 1) return { ok: false, error: 'no uses' };
    if (priv.unlockedClueIds.indexOf(clueId) < 0) return { ok: false, error: 'not unlocked' };
    priv.abilityUses.check -= 1;
    if (priv.verifiedClueIds.indexOf(clueId) < 0) priv.verifiedClueIds.push(clueId);
    return { ok: true, clueId: clueId };
  }

  /**
   * Fog view: current cell fully; adjacent exits only (1–4 dirs).
   * Unvisited non-neighbor cells hidden. Phrase-gated responses hidden until heard.
   */
  function mazeViewFor(mystery, priv) {
    const cur = cellById(mystery, priv.currentCellId);
    const visited = new Set(priv.visitedCellIds);
    const peeked = new Set(priv.peekedCellIds);
    const walled = mystery.maze.walledDirs || {};

    const responses = (cur.responses || [])
      .filter((r) => {
        if (r.requiresPhraseId && !hasHeard(priv, r.requiresPhraseId)) return false;
        return true;
      })
      .map((r) => ({
        id: r.id,
        text: r.text,
        act: r.act || r.text,
        kind: r.kind || 'act',
        dir: r.dir,
        locked: priv.lockedResponseIds.indexOf(r.id) >= 0,
        needsPhrase: !!r.requiresPhraseId,
        // never tell client which is dead end before ask
        deadEnd: false
      }));

    const exits = DIRS.map((dir) => {
      const hardWall = (walled[cur.id] || []).indexOf(dir) >= 0;
      const resp = (cur.responses || []).find((r) => r.dir === dir);
      const gated =
        resp && resp.requiresPhraseId && !hasHeard(priv, resp.requiresPhraseId);
      const neighbor = neighborCell(mystery, cur, dir);
      let kind = 'wall';
      let label = null;
      let cellId = null;
      if (hardWall || (!resp && !neighbor)) {
        kind = 'wall';
      } else if (gated) {
        kind = 'fog'; // exit exists but phrase not heard — hidden forward
        label = '???';
      } else if (resp) {
        kind = priv.lockedResponseIds.indexOf(resp.id) >= 0 ? 'locked' : 'open';
        if (neighbor && (visited.has(neighbor.id) || peeked.has(neighbor.id))) {
          label = neighbor.label;
          cellId = neighbor.id;
        } else if (neighbor) {
          label = 'Exit';
          cellId = neighbor.id;
        } else if (resp.deadEnd) {
          label = 'Exit';
        }
      } else if (neighbor) {
        // geometric neighbor but no response that way — wall
        kind = 'wall';
      }
      const ac = (cur.actions || {})[dir];
      return { dir: dir, kind: kind, label: label, cellId: cellId, action: ac ? ac.text : null, actionKind: ac ? ac.kind : 'act' };
    });

    // Visible cells: current + visited (as trail dots) + peeked; NOT full fog-clear
    const visibleCells = mystery.maze.cells
      .filter((c) => {
        if (c.id === cur.id) return true;
        if (visited.has(c.id)) return true;
        if (peeked.has(c.id)) return true;
        // adjacent only as anonymous exits — do not list full cell
        return false;
      })
      .map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        label: c.label,
        here: c.id === cur.id,
        visited: visited.has(c.id),
        peeked: peeked.has(c.id) && !visited.has(c.id)
      }));

    // Adjacent fog cell ids (for peek ability targets) — neighbors not visited
    const peekTargets = [];
    DIRS.forEach((dir) => {
      if ((walled[cur.id] || []).indexOf(dir) >= 0) return;
      const n = neighborCell(mystery, cur, dir);
      if (n && !visited.has(n.id)) {
        peekTargets.push({ id: n.id, dir: dir, label: peeked.has(n.id) ? n.label : 'Fog' });
      }
    });

    return {
      current: {
        id: cur.id,
        x: cur.x,
        y: cur.y,
        label: cur.label,
        question: cur.question
      },
      responses: responses,
      exits: exits,
      visibleCells: visibleCells,
      peekTargets: peekTargets,
      fogHiddenCount: mystery.maze.cells.length - visibleCells.length
    };
  }

  function viewFor(state, mystery, playerId) {
    const me = state.players.find((p) => p.id === playerId);
    const priv = state.private[playerId];
    if (!me || !priv) return null;
    const role = roleById(mystery, me.roleId);

    const clues = priv.unlockedClueIds.map((id) => {
      const c = clueById(mystery, id);
      return {
        id: id,
        text: c ? c.text : id,
        deadEnd: !!(c && c.deadEnd),
        verified: priv.verifiedClueIds.indexOf(id) >= 0
      };
    });

    const hearOptions = [];
    state.players.forEach((p) => {
      if (p.id === playerId) return;
      state.private[p.id].talkingPointIds.forEach((phId) => {
        const ph = phraseById(mystery, phId);
        if (!ph) return;
        hearOptions.push({
          phraseId: ph.id,
          text: ph.text,
          fromId: p.id,
          fromName: p.name
        });
      });
    });

    // Decoy options: phrases nobody is saying this round (wrong pick costs token)
    const live = new Set(hearOptions.map((h) => h.phraseId));
    const decoys = (mystery.phrases || [])
      .filter((ph) => !live.has(ph.id))
      .slice(0, 2)
      .map((ph) => ({
        phraseId: ph.id,
        text: ph.text,
        fromId: null,
        fromName: '?',
        decoy: true
      }));

    const myTalk = priv.talkingPointIds.map((id) => {
      const ph = phraseById(mystery, id);
      return { id: id, text: ph ? ph.text : id };
    });

    const abilities = (role.abilities || []).map((a) => ({
      id: a.id,
      label: a.label,
      icon: a.icon,
      hint: a.hint,
      usesLeft: priv.abilityUses[a.id] || 0
    }));

    return {
      phase: state.phase,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      mysteryTitle: mystery.title,
      tagline: mystery.tagline,
      me: {
        id: me.id,
        name: me.name,
        roleId: me.roleId,
        roleName: role.name,
        isHost: me.id === state.hostPlayerId
      },
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        roleName: roleById(mystery, p.roleId).name,
        isBot: !!p.isBot,
        isMe: p.id === playerId
      })),
      talkingPoints: myTalk,
      hearOptions: hearOptions.concat(decoys),
      heardPhraseIds: priv.heardPhraseIds.slice(),
      maze: mazeViewFor(mystery, priv),
      clues: clues,
      tokens: priv.tokens,
      tokensPerRound: mystery.tokensPerRound,
      roleIcon: ((role.abilities || [])[0] || {}).icon || 'star',
      roundIndexKey: state.roundIndex,
      tokensSpent: priv.tokensSpent,
      lastWall: priv.lastWall,
      abilities: abilities,
      forcedShow: priv.forcedShowFrom,
      callout: state.lastCallout,
      suspects: mystery.suspects,
      myVote: state.finalVotes[playerId] || null,
      votesIn: Object.keys(state.finalVotes).length,
      votesNeeded: state.players.length,
      reveal: state.reveal || null,
      roomCode: state.roomCode,
      botLines: state.players
        .filter((p) => p.isBot)
        .map((p) => ({
          name: p.name,
          lines: state.private[p.id].talkingPointIds.map((id) => {
            const ph = phraseById(mystery, id);
            return ph ? ph.text : id;
          })
        }))
    };
  }

  function lobbyView(state, mystery) {
    return {
      phase: state.phase,
      roomCode: state.roomCode,
      mysteryTitle: mystery.title,
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        roleName: p.roleId ? roleById(mystery, p.roleId).name : '—',
        isBot: !!p.isBot,
        isHost: p.id === state.hostPlayerId
      })),
      canStart: state.players.length >= (mystery.minPlayers || 2)
    };
  }

  function addPlayer(state, mystery, player) {
    if (state.phase !== PHASE.LOBBY) return { ok: false, error: 'started' };
    if (state.players.length >= (mystery.maxPlayers || 4)) return { ok: false, error: 'full' };
    if (state.players.some((p) => p.name.toLowerCase() === player.name.toLowerCase())) {
      const existing = state.players.find(
        (p) => p.name.toLowerCase() === player.name.toLowerCase()
      );
      existing.peerId = player.peerId || existing.peerId;
      return { ok: true, player: existing, rejoined: true };
    }
    const p = {
      id: player.id || 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: player.name,
      isBot: !!player.isBot,
      roleId: null,
      peerId: player.peerId || null
    };
    state.players.push(p);
    assignRoles(mystery, state.players);
    state.players.forEach((pl) => {
      if (!state.private[pl.id]) {
        state.private[pl.id] = freshPrivate(mystery, roleById(mystery, pl.roleId));
      } else {
        const role = roleById(mystery, pl.roleId);
        state.private[pl.id].abilityUses = makeAbilityUses(role);
      }
    });
    return { ok: true, player: p };
  }

  // Legacy helper used by tests/bots
  function clueForPhrase(mystery, phraseId) {
    // Prefer maze response that requires this phrase and grants a clue
    for (let i = 0; i < mystery.maze.cells.length; i++) {
      const cell = mystery.maze.cells[i];
      for (let j = 0; j < (cell.responses || []).length; j++) {
        const r = cell.responses[j];
        if (r.requiresPhraseId === phraseId && r.clueId) {
          return clueById(mystery, r.clueId);
        }
      }
    }
    return null;
  }

  global.CoopMysteryGame = {
    PHASE: PHASE,
    DIRS: DIRS,
    createGame: createGame,
    startGame: startGame,
    reportHeard: reportHeard,
    askResponse: askResponse,
    endRound: endRound,
    advanceAfterCallout: advanceAfterCallout,
    castVote: castVote,
    resolveVotes: resolveVotes,
    usePeek: usePeek,
    useForce: useForce,
    useSwap: useSwap,
    useCheck: useCheck,
    viewFor: viewFor,
    lobbyView: lobbyView,
    addPlayer: addPlayer,
    leaderboard: leaderboard,
    scorePlayer: scorePlayer,
    keyClueCount: keyClueCount,
    cellById: cellById,
    clueForPhrase: clueForPhrase,
    phraseById: phraseById,
    serialize: function (s) {
      return clone(s);
    },
    restore: function (r) {
      return clone(r);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
