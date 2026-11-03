/**
 * Data-driven scene-graph / state-machine engine (Twine / Ink style).
 *
 * Phases: intro → explore → accuse → result
 * State: sceneId, evidence[], flags{}, checksUsed{}, lastRoll, player skills via mystery.player
 *
 * Choices may include a d20 skill check:
 *   check: { id, skill, dc, retry?, success, fail, critSuccess?, critFail? }
 * Outcomes can giveEvidence, setFlags, go. Nat 1 / nat 20 prefer crit* text when present.
 */
(function (global) {
  "use strict";

  /** Override in tests: setRng(function () { return 15; }) — must return 1..20 */
  var rng = function () {
    return Math.floor(Math.random() * 20) + 1;
  };

  function setRng(fn) {
    if (typeof fn === "function") rng = fn;
  }

  function rollD20() {
    var n = rng();
    if (typeof n !== "number" || n < 1 || n > 20 || n !== Math.floor(n)) {
      n = Math.max(1, Math.min(20, Math.floor(Number(n)) || 1));
    }
    return n;
  }

  function createInitialState(mystery) {
    return {
      sceneId: mystery.startSceneId,
      evidence: [],
      flags: {},
      phase: "intro", // intro | explore | accuse | result
      accuse: { suspectId: null, motiveId: null },
      result: null,
      seenExamine: {},
      checksUsed: {}, // checkId -> true
      lastRoll: null // { checkId, skill, die, modifier, total, dc, outcome, text }
    };
  }

  function serialize(state) {
    return {
      sceneId: state.sceneId,
      evidence: state.evidence.slice(),
      flags: Object.assign({}, state.flags),
      phase: state.phase,
      accuse: Object.assign({}, state.accuse),
      result: state.result ? Object.assign({}, state.result) : null,
      seenExamine: Object.assign({}, state.seenExamine),
      checksUsed: Object.assign({}, state.checksUsed),
      lastRoll: state.lastRoll ? Object.assign({}, state.lastRoll) : null
    };
  }

  function hasEvidence(state, id) {
    return state.evidence.indexOf(id) !== -1;
  }

  function hasAllEvidence(state, ids) {
    if (!ids || !ids.length) return true;
    for (var i = 0; i < ids.length; i++) {
      if (!hasEvidence(state, ids[i])) return false;
    }
    return true;
  }

  function hasAllFlags(state, req) {
    if (!req) return true;
    var keys = Object.keys(req);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!!state.flags[k] !== !!req[k]) return false;
    }
    return true;
  }

  function getScene(mystery, id) {
    for (var i = 0; i < mystery.scenes.length; i++) {
      if (mystery.scenes[i].id === id) return mystery.scenes[i];
    }
    return null;
  }

  function getSuspect(mystery, id) {
    for (var i = 0; i < mystery.suspects.length; i++) {
      if (mystery.suspects[i].id === id) return mystery.suspects[i];
    }
    return null;
  }

  function getEvidence(mystery, id) {
    for (var i = 0; i < mystery.evidence.length; i++) {
      if (mystery.evidence[i].id === id) return mystery.evidence[i];
    }
    return null;
  }

  function getMotive(mystery, id) {
    for (var i = 0; i < mystery.motives.length; i++) {
      if (mystery.motives[i].id === id) return mystery.motives[i];
    }
    return null;
  }

  function skillMod(mystery, skillName) {
    var skills = (mystery.player && mystery.player.skills) || {};
    var v = skills[skillName];
    return typeof v === "number" ? v : 0;
  }

  function checkId(choice) {
    if (choice.check && choice.check.id) return choice.check.id;
    return null;
  }

  function isChoiceAvailable(state, choice) {
    if (!hasAllEvidence(state, choice.requireEvidence)) return false;
    if (!hasAllFlags(state, choice.requireFlags)) return false;
    if (choice.giveEvidence && choice.hideAfterCollect !== false) {
      if (hasEvidence(state, choice.giveEvidence)) return false;
    }
    if (choice.check) {
      var cid = checkId(choice);
      var allowRetry = !!(choice.check.retry);
      if (cid && !allowRetry && state.checksUsed[cid]) return false;
    }
    return true;
  }

  function availableChoices(mystery, state) {
    var scene = getScene(mystery, state.sceneId);
    if (!scene) return [];
    var out = [];
    for (var i = 0; i < scene.choices.length; i++) {
      if (isChoiceAvailable(state, scene.choices[i])) out.push(scene.choices[i]);
    }
    return out;
  }

  function applyOutcomeEffects(next, outcome) {
    if (!outcome) return;
    if (outcome.setFlags) {
      var fk = Object.keys(outcome.setFlags);
      for (var i = 0; i < fk.length; i++) {
        next.flags[fk[i]] = outcome.setFlags[fk[i]];
      }
    }
    if (outcome.giveEvidence) {
      if (!hasEvidence(next, outcome.giveEvidence)) {
        next.evidence.push(outcome.giveEvidence);
      }
      next.seenExamine[outcome.giveEvidence] = true;
    }
    if (outcome.go) {
      next.sceneId = outcome.go;
    }
  }

  /**
   * Resolve a skill check. Returns { die, modifier, total, dc, outcome, text, outcomeBlock }
   * outcome: "critSuccess" | "success" | "fail" | "critFail"
   */
  function resolveCheck(mystery, check) {
    var die = rollD20();
    var modifier = skillMod(mystery, check.skill);
    var total = die + modifier;
    var dc = check.dc;
    var outcome;
    var block;

    if (die === 1) {
      outcome = "critFail";
      block = check.critFail || check.fail;
    } else if (die === 20) {
      outcome = "critSuccess";
      block = check.critSuccess || check.success;
    } else if (total >= dc) {
      outcome = "success";
      block = check.success;
    } else {
      outcome = "fail";
      block = check.fail;
    }

    if (!block) {
      block = { text: "(No outcome text defined for " + outcome + ".)" };
    }

    return {
      die: die,
      modifier: modifier,
      total: total,
      dc: dc,
      skill: check.skill,
      outcome: outcome,
      text: block.text || "",
      outcomeBlock: block
    };
  }

  function applyChoice(mystery, state, choiceIndex) {
    if (state.phase !== "explore") return state;
    var choices = availableChoices(mystery, state);
    var choice = choices[choiceIndex];
    if (!choice) return state;

    var next = serialize(state);
    next.lastRoll = null;

    // Non-check flags / evidence on the choice itself still apply
    if (choice.setFlags) {
      var fk = Object.keys(choice.setFlags);
      for (var i = 0; i < fk.length; i++) {
        next.flags[fk[i]] = choice.setFlags[fk[i]];
      }
    }

    if (choice.giveEvidence) {
      if (!hasEvidence(next, choice.giveEvidence)) {
        next.evidence.push(choice.giveEvidence);
      }
      next.seenExamine[choice.giveEvidence] = true;
    }

    if (choice.talk) {
      next.flags["talked:" + choice.talk] = true;
    }

    if (choice.check) {
      var resolved = resolveCheck(mystery, choice.check);
      var cid = checkId(choice) || choice.check.skill + ":" + choice.check.dc;
      next.checksUsed[cid] = true;
      applyOutcomeEffects(next, resolved.outcomeBlock);
      next.lastRoll = {
        checkId: cid,
        skill: resolved.skill,
        die: resolved.die,
        modifier: resolved.modifier,
        total: resolved.total,
        dc: resolved.dc,
        outcome: resolved.outcome,
        text: resolved.text
      };
      // Skill-check choices usually navigate via outcome.go; choice.go is fallback if outcome has no go
      if (!resolved.outcomeBlock.go && choice.go) {
        next.sceneId = choice.go;
      }
      return next;
    }

    if (choice.accuse) {
      next.phase = "accuse";
      next.accuse = { suspectId: null, motiveId: null };
      return next;
    }

    if (choice.go) {
      next.sceneId = choice.go;
    }

    return next;
  }

  function beginMystery(state) {
    var next = serialize(state);
    next.phase = "explore";
    next.lastRoll = null;
    return next;
  }

  function openAccusation(state) {
    var next = serialize(state);
    next.phase = "accuse";
    next.accuse = { suspectId: null, motiveId: null };
    next.lastRoll = null;
    return next;
  }

  function setAccusation(state, field, value) {
    var next = serialize(state);
    next.accuse = Object.assign({}, next.accuse);
    next.accuse[field] = value;
    return next;
  }

  function submitAccusation(mystery, state) {
    var next = serialize(state);
    var sol = mystery.solution;
    var suspectOk = next.accuse.suspectId === sol.suspectId;
    var motiveOk = next.accuse.motiveId === sol.motiveId;
    var evidenceOk = hasAllEvidence(next, sol.requiredEvidence || []);
    var won = suspectOk && motiveOk && evidenceOk;

    next.phase = "result";
    next.lastRoll = null;
    next.result = {
      won: won,
      text: won ? sol.explainWin : sol.explainLose,
      suspectOk: suspectOk,
      motiveOk: motiveOk,
      evidenceOk: evidenceOk
    };
    return next;
  }

  function restart(mystery) {
    return createInitialState(mystery);
  }

  function resumeOrNew(mystery) {
    var saved = global.MysteryStorage.load(mystery.storageKey);
    if (!saved) return createInitialState(mystery);
    if (!saved.sceneId || !Array.isArray(saved.evidence)) {
      return createInitialState(mystery);
    }
    return {
      sceneId: saved.sceneId,
      evidence: saved.evidence,
      flags: saved.flags || {},
      phase: saved.phase || "intro",
      accuse: saved.accuse || { suspectId: null, motiveId: null },
      result: saved.result || null,
      seenExamine: saved.seenExamine || {},
      checksUsed: saved.checksUsed || {},
      lastRoll: saved.lastRoll || null
    };
  }

  function persist(mystery, state) {
    global.MysteryStorage.save(mystery.storageKey, serialize(state));
  }

  function clearSave(mystery) {
    global.MysteryStorage.clear(mystery.storageKey);
  }

  global.MysteryEngine = {
    createInitialState: createInitialState,
    getScene: getScene,
    getSuspect: getSuspect,
    getEvidence: getEvidence,
    getMotive: getMotive,
    skillMod: skillMod,
    availableChoices: availableChoices,
    applyChoice: applyChoice,
    beginMystery: beginMystery,
    openAccusation: openAccusation,
    setAccusation: setAccusation,
    submitAccusation: submitAccusation,
    restart: restart,
    resumeOrNew: resumeOrNew,
    persist: persist,
    clearSave: clearSave,
    hasEvidence: hasEvidence,
    serialize: serialize,
    setRng: setRng,
    rollD20: rollD20,
    resolveCheck: resolveCheck
  };
})(window);
