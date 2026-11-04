/**
 * DOM renderer for the mystery engine.
 * Intro / explore / accuse / result + British Piper narration via MysterySpeech.
 */
(function (global) {
  "use strict";

  var mystery = null;
  var state = null;
  var els = {};
  var lastPhase = null;
  var lastSpeechKey = null;

  function $(id) {
    return document.getElementById(id);
  }

  function setText(el, text) {
    el.textContent = text;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function btn(label, onClick, opts) {
    opts = opts || {};
    var b = document.createElement("button");
    b.type = "button";
    b.className =
      "btn" +
      (opts.primary ? " btn-primary" : "") +
      (opts.danger ? " btn-danger" : "") +
      (opts.ghost ? " btn-ghost" : "") +
      (opts.check ? " btn-check" : "");
    b.textContent = label;
    if (opts.disabled) b.disabled = true;
    b.addEventListener("click", onClick);
    return b;
  }

  function toast(msg) {
    var t = $("toast");
    setText(t, msg);
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      t.hidden = true;
    }, 2200);
  }

  function syncPersist() {
    MysteryEngine.persist(mystery, state);
  }

  function hideAllViews() {
    els.introView.hidden = true;
    els.exploreView.hidden = true;
    els.accuseView.hidden = true;
    els.resultView.hidden = true;
  }

  function formatMod(n) {
    return n >= 0 ? "+" + n : String(n);
  }

  function outcomeLabel(outcome) {
    if (outcome === "critSuccess") return "Critical success";
    if (outcome === "critFail") return "Critical fail";
    if (outcome === "success") return "Success";
    return "Failure";
  }

  function speechKey() {
    if (state.phase === "intro") return "intro";
    if (state.phase === "accuse") return "accuse";
    if (state.phase === "result") {
      return "result:" + (state.result && state.result.won ? "win" : "lose");
    }
    var rollPart = state.lastRoll
      ? state.lastRoll.checkId + ":" + state.lastRoll.outcome
      : "";
    return "explore:" + state.sceneId + ":" + rollPart;
  }

  /**
   * Build narration playlist for the current screen (no button chrome).
   * Dynamic dice math is skipped; only fixed check result flavor is spoken.
   */
  function buildPlaylist(extraEvidenceId) {
    var ids = [];
    var fb = {};

    function push(id, text) {
      if (!id) return;
      ids.push(id);
      if (text) fb[id] = text;
    }

    if (state.phase === "intro") {
      var lore = mystery.lore || {};
      var p = mystery.player || {};
      push("intro:body", lore.intro || mystery.premise);
      var playerBits = ["You are " + (p.name || "Investigator") + "."];
      if (p.role) playerBits.push("Role: " + p.role + ".");
      if (p.backstory) playerBits.push(p.backstory);
      if (p.personality) playerBits.push("Personality: " + p.personality);
      push("intro:player", playerBits.join(" "));
      push("intro:setting", lore.setting);
      push("intro:history", lore.history);
    } else if (state.phase === "accuse") {
      push(
        "accuse:lead",
        "Name the killer and their motive. You can go back if you need more evidence."
      );
    } else if (state.phase === "result") {
      var won = state.result && state.result.won;
      push(
        won ? "ending:title:win" : "ending:title:lose",
        won ? "Case closed — you got it." : "Wrong accusation."
      );
      push(
        won ? "ending:win" : "ending:lose",
        state.result ? state.result.text : ""
      );
    } else {
      var scene = MysteryEngine.getScene(mystery, state.sceneId);
      if (scene) push("scene:" + scene.id, scene.text);
      if (state.lastRoll) {
        var cid = state.lastRoll.checkId;
        var outcome = state.lastRoll.outcome;
        push("check:" + cid + ":" + outcome, state.lastRoll.text || "");
      }
    }

    if (extraEvidenceId) {
      var ev = MysteryEngine.getEvidence(mystery, extraEvidenceId);
      if (ev) {
        push(
          "evidence:" + extraEvidenceId,
          (ev.name || "") + ". " + (ev.description || "")
        );
      }
    }

    return { ids: ids, fallbackTexts: fb };
  }

  function speakScreen(opts) {
    opts = opts || {};
    if (!global.MysterySpeech) return;
    var key = speechKey() + (opts.extraEvidenceId ? ":ev:" + opts.extraEvidenceId : "");
    var changed = key !== lastSpeechKey;
    if (changed || opts.force) {
      MysterySpeech.stop();
      lastSpeechKey = key;
    } else if (!opts.force) {
      return;
    }
    if (!MysterySpeech.isEnabled()) return;
    var pl = buildPlaylist(opts.extraEvidenceId || null);
    MysterySpeech.playIds(pl.ids, pl.fallbackTexts);
  }

  function syncTtsButtons() {
    if (!els.ttsToggle) return;
    var on = global.MysterySpeech && MysterySpeech.isEnabled();
    els.ttsToggle.setAttribute("aria-pressed", on ? "true" : "false");
    els.ttsToggle.textContent = on ? "Read aloud: on" : "Read aloud";
    if (els.ttsReplay) els.ttsReplay.hidden = !on;
  }

  function renderPlayerChip() {
    var p = mystery.player;
    if (!p) {
      els.playerChip.hidden = true;
      return;
    }
    els.playerChip.hidden = false;
    setText(els.playerChip, "Playing as " + p.name + " · " + (p.role || ""));
  }

  function renderEvidencePanel() {
    var list = els.evidenceList;
    clear(list);
    if (!state.evidence.length) {
      var empty = document.createElement("li");
      empty.className = "evidence-empty";
      empty.textContent = "No evidence yet. Search rooms, talk, and roll checks.";
      list.appendChild(empty);
      els.evidenceCount.textContent = "0";
      return;
    }
    els.evidenceCount.textContent = String(state.evidence.length);
    for (var i = 0; i < state.evidence.length; i++) {
      var ev = MysteryEngine.getEvidence(mystery, state.evidence[i]);
      if (!ev) continue;
      var li = document.createElement("li");
      var name = document.createElement("strong");
      name.textContent = ev.name;
      var desc = document.createElement("p");
      desc.textContent = ev.description;
      li.appendChild(name);
      li.appendChild(desc);
      list.appendChild(li);
    }
  }

  function renderIntro() {
    hideAllViews();
    els.introView.hidden = false;
    setText(els.crumb, mystery.title + " · Intro");
    setText(els.introTone, "Tone: " + (mystery.tone || "unspecified"));
    setText(els.introTitle, mystery.title);
    setText(els.introText, (mystery.lore && mystery.lore.intro) || mystery.premise || "");

    clear(els.introPlayer);
    var p = mystery.player || {};
    var ph = document.createElement("h3");
    ph.textContent = "You are " + (p.name || "the investigator");
    els.introPlayer.appendChild(ph);
    var bits = [
      p.role ? "Role: " + p.role : null,
      p.backstory ? p.backstory : null,
      p.personality ? "Personality: " + p.personality : null
    ].filter(Boolean);
    bits.forEach(function (line) {
      var para = document.createElement("p");
      para.textContent = line;
      els.introPlayer.appendChild(para);
    });
    if (p.skills) {
      var sk = document.createElement("p");
      sk.className = "skills-line";
      var parts = Object.keys(p.skills).map(function (k) {
        return k + " " + formatMod(p.skills[k]);
      });
      sk.textContent = "Skills: " + parts.join(" · ");
      els.introPlayer.appendChild(sk);
    }

    clear(els.introLore);
    var lore = mystery.lore || {};
    if (lore.setting || lore.history) {
      var lh = document.createElement("h3");
      lh.textContent = "Setting";
      els.introLore.appendChild(lh);
      if (lore.setting) {
        var s = document.createElement("p");
        s.textContent = lore.setting;
        els.introLore.appendChild(s);
      }
      if (lore.history) {
        var h = document.createElement("p");
        h.textContent = lore.history;
        els.introLore.appendChild(h);
      }
    }

    clear(els.introActions);
    els.introActions.appendChild(
      btn(
        "Begin as " + (p.name || "yourself"),
        function () {
          state = MysteryEngine.beginMystery(state);
          syncPersist();
          render();
        },
        { primary: true }
      )
    );
  }

  function renderRollPanel() {
    var roll = state.lastRoll;
    if (!roll) {
      els.rollPanel.hidden = true;
      return;
    }
    els.rollPanel.hidden = false;
    els.rollPanel.className =
      "roll-panel roll-" +
      (roll.outcome === "critSuccess" || roll.outcome === "success" ? "ok" : "bad");
    var mod = formatMod(roll.modifier);
    setText(
      els.rollMath,
      roll.skill +
        " — d20: " +
        roll.die +
        " " +
        mod +
        " = " +
        roll.total +
        " vs DC " +
        roll.dc +
        " — " +
        outcomeLabel(roll.outcome)
    );
    setText(els.rollText, roll.text || "");
  }

  function renderExplore() {
    hideAllViews();
    els.exploreView.hidden = false;

    var scene = MysteryEngine.getScene(mystery, state.sceneId);
    if (!scene) {
      setText(els.sceneTitle, "Missing scene");
      setText(els.sceneText, "Scene id not found: " + state.sceneId);
      clear(els.choices);
      els.rollPanel.hidden = true;
      return;
    }

    setText(els.sceneTitle, scene.title);
    setText(els.sceneText, scene.text);
    setText(els.crumb, mystery.title + " · " + scene.title);
    renderRollPanel();

    clear(els.choices);
    var choices = MysteryEngine.availableChoices(mystery, state);
    for (var i = 0; i < choices.length; i++) {
      (function (index, choice) {
        var isCheck = !!choice.check;
        els.choices.appendChild(
          btn(
            choice.label,
            function () {
              var before = state.evidence.length;
              state = MysteryEngine.applyChoice(mystery, state, index);
              var gainedId = null;
              var gainedName = null;
              if (state.evidence.length > before) {
                gainedId = state.evidence[state.evidence.length - 1];
                var ev = MysteryEngine.getEvidence(mystery, gainedId);
                gainedName = ev ? ev.name : gainedId;
              }
              syncPersist();
              render({ extraEvidenceId: gainedId });
              if (gainedName) toast("Evidence: " + gainedName);
            },
            { primary: !!choice.accuse, check: isCheck }
          )
        );
      })(i, choices[i]);
    }

    clear(els.exploreExtra);
    els.exploreExtra.appendChild(
      btn(
        "Open accusation desk",
        function () {
          state = MysteryEngine.openAccusation(state);
          syncPersist();
          render();
        },
        { ghost: true }
      )
    );
  }

  function renderAccuse() {
    hideAllViews();
    els.accuseView.hidden = false;
    setText(els.crumb, mystery.title + " · Accusation");

    clear(els.suspectPick);
    for (var i = 0; i < mystery.suspects.length; i++) {
      (function (s) {
        var selected = state.accuse.suspectId === s.id;
        els.suspectPick.appendChild(
          btn(
            s.name + " — " + s.role,
            function () {
              state = MysteryEngine.setAccusation(state, "suspectId", s.id);
              syncPersist();
              render();
            },
            { primary: selected }
          )
        );
      })(mystery.suspects[i]);
    }

    clear(els.motivePick);
    for (var j = 0; j < mystery.motives.length; j++) {
      (function (m) {
        var selected = state.accuse.motiveId === m.id;
        els.motivePick.appendChild(
          btn(
            m.label,
            function () {
              state = MysteryEngine.setAccusation(state, "motiveId", m.id);
              syncPersist();
              render();
            },
            { primary: selected }
          )
        );
      })(mystery.motives[j]);
    }

    var canSubmit = !!(state.accuse.suspectId && state.accuse.motiveId);
    clear(els.accuseActions);
    els.accuseActions.appendChild(
      btn(
        "Back to investigating",
        function () {
          state.phase = "explore";
          syncPersist();
          render();
        },
        { ghost: true }
      )
    );
    els.accuseActions.appendChild(
      btn(
        "Submit accusation",
        function () {
          if (!state.accuse.suspectId || !state.accuse.motiveId) {
            toast("Pick a suspect and a motive.");
            return;
          }
          state = MysteryEngine.submitAccusation(mystery, state);
          syncPersist();
          render();
        },
        { primary: true, disabled: !canSubmit }
      )
    );
  }

  function renderResult() {
    hideAllViews();
    els.resultView.hidden = false;
    setText(els.crumb, mystery.title + " · Result");

    var won = state.result && state.result.won;
    els.resultView.className =
      "panel result-view " + (won ? "result-win" : "result-lose");
    setText(els.resultTitle, won ? "Case closed — you got it" : "Wrong accusation");
    setText(els.resultText, state.result ? state.result.text : "");

    var detail = [];
    if (state.result) {
      detail.push(state.result.suspectOk ? "Suspect: correct" : "Suspect: incorrect");
      detail.push(state.result.motiveOk ? "Motive: correct" : "Motive: incorrect");
      detail.push(
        state.result.evidenceOk
          ? "Key evidence: complete"
          : "Key evidence: incomplete — keep searching next time"
      );
    }
    setText(els.resultDetail, detail.join(" · "));

    clear(els.resultActions);
    els.resultActions.appendChild(
      btn(
        "Play again",
        function () {
          if (global.MysterySpeech) MysterySpeech.stop();
          MysteryEngine.clearSave(mystery);
          state = MysteryEngine.restart(mystery);
          lastSpeechKey = null;
          syncPersist();
          render();
        },
        { primary: true }
      )
    );
  }

  function render(opts) {
    opts = opts || {};
    if (lastPhase !== null && lastPhase !== state.phase) {
      var t = $("toast");
      if (t) t.hidden = true;
    }
    lastPhase = state.phase;
    setText(els.gameTitle, mystery.title);
    renderPlayerChip();
    renderEvidencePanel();
    if (state.phase === "intro") renderIntro();
    else if (state.phase === "accuse") renderAccuse();
    else if (state.phase === "result") renderResult();
    else renderExplore();
    syncTtsButtons();
    speakScreen({ extraEvidenceId: opts.extraEvidenceId || null, force: !!opts.forceSpeech });
  }

  function toggleEvidence(force) {
    if (force !== undefined) {
      if (force) els.shell.classList.add("evidence-open");
      else els.shell.classList.remove("evidence-open");
    } else {
      els.shell.classList.toggle("evidence-open");
    }
    els.evidenceToggle.setAttribute(
      "aria-expanded",
      els.shell.classList.contains("evidence-open") ? "true" : "false"
    );
  }

  function bind() {
    els.evidenceToggle.addEventListener("click", function () {
      var t = $("toast");
      if (t) t.hidden = true;
      toggleEvidence();
    });
    els.evidenceClose.addEventListener("click", function () {
      toggleEvidence(false);
    });
    els.restartBtn.addEventListener("click", function () {
      if (!confirm("Restart the mystery? All progress and evidence will be cleared.")) return;
      if (global.MysterySpeech) MysterySpeech.stop();
      MysteryEngine.clearSave(mystery);
      state = MysteryEngine.restart(mystery);
      lastSpeechKey = null;
      syncPersist();
      toggleEvidence(false);
      render();
    });

    if (els.ttsToggle) {
      els.ttsToggle.addEventListener("click", function () {
        if (!global.MysterySpeech) return;
        var next = !MysterySpeech.isEnabled();
        var pl = buildPlaylist(null);
        MysterySpeech.setEnabled(next, { playlist: pl });
        lastSpeechKey = speechKey();
        syncTtsButtons();
      });
    }
    if (els.ttsReplay) {
      els.ttsReplay.addEventListener("click", function () {
        if (!global.MysterySpeech || !MysterySpeech.isEnabled()) return;
        lastSpeechKey = null;
        speakScreen({ force: true });
      });
    }
  }

  function boot() {
    mystery = global.MYSTERY;
    if (!mystery) {
      document.body.innerHTML =
        "<p style='padding:2rem;font-family:system-ui'>No mystery loaded. Check the script tag in index.html.</p>";
      return;
    }

    els = {
      shell: $("shell"),
      gameTitle: $("game-title"),
      crumb: $("crumb"),
      playerChip: $("player-chip"),
      introView: $("intro-view"),
      introTone: $("intro-tone"),
      introTitle: $("intro-title"),
      introText: $("intro-text"),
      introPlayer: $("intro-player"),
      introLore: $("intro-lore"),
      introActions: $("intro-actions"),
      exploreView: $("explore-view"),
      sceneTitle: $("scene-title"),
      sceneText: $("scene-text"),
      rollPanel: $("roll-panel"),
      rollMath: $("roll-math"),
      rollText: $("roll-text"),
      choices: $("choices"),
      exploreExtra: $("explore-extra"),
      accuseView: $("accuse-view"),
      suspectPick: $("suspect-pick"),
      motivePick: $("motive-pick"),
      accuseActions: $("accuse-actions"),
      resultView: $("result-view"),
      resultTitle: $("result-title"),
      resultText: $("result-text"),
      resultDetail: $("result-detail"),
      resultActions: $("result-actions"),
      evidenceList: $("evidence-list"),
      evidenceCount: $("evidence-count"),
      evidenceToggle: $("evidence-toggle"),
      evidenceClose: $("evidence-close"),
      restartBtn: $("restart-btn"),
      ttsToggle: $("tts-toggle"),
      ttsReplay: $("tts-replay")
    };

    if (global.MysterySpeech) MysterySpeech.init();
    bind();
    syncTtsButtons();
    state = MysteryEngine.resumeOrNew(mystery);
    render();
  }

  global.MysteryUI = {
    boot: boot,
    getState: function () {
      return state;
    },
    getMystery: function () {
      return mystery;
    },
    render: render,
    buildPlaylist: buildPlaylist
  };

  document.addEventListener("DOMContentLoaded", boot);
})(window);
