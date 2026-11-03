/**
 * DOM renderer for the mystery engine.
 * Intro (you are the PC), explore with d20 roll panel, accuse, result.
 */
(function (global) {
  "use strict";

  var mystery = null;
  var state = null;
  var els = {};
  var lastPhase = null;

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
      btn("Begin as " + (p.name || "yourself"), function () {
        state = MysteryEngine.beginMystery(state);
        syncPersist();
        render();
      }, { primary: true })
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
      (roll.outcome === "critSuccess" || roll.outcome === "success"
        ? "ok"
        : "bad");
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
        var label = choice.label;
        var isCheck = !!choice.check;
        els.choices.appendChild(
          btn(
            label,
            function () {
              var before = state.evidence.length;
              state = MysteryEngine.applyChoice(mystery, state, index);
              var gained = null;
              if (state.evidence.length > before) {
                var last = state.evidence[state.evidence.length - 1];
                var ev = MysteryEngine.getEvidence(mystery, last);
                gained = ev ? ev.name : last;
              }
              syncPersist();
              render();
              if (gained) toast("Evidence: " + gained);
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
          btn(s.name + " — " + s.role, function () {
            state = MysteryEngine.setAccusation(state, "suspectId", s.id);
            syncPersist();
            render();
          }, { primary: selected })
        );
      })(mystery.suspects[i]);
    }

    clear(els.motivePick);
    for (var j = 0; j < mystery.motives.length; j++) {
      (function (m) {
        var selected = state.accuse.motiveId === m.id;
        els.motivePick.appendChild(
          btn(m.label, function () {
            state = MysteryEngine.setAccusation(state, "motiveId", m.id);
            syncPersist();
            render();
          }, { primary: selected })
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
          MysteryEngine.clearSave(mystery);
          state = MysteryEngine.restart(mystery);
          syncPersist();
          render();
        },
        { primary: true }
      )
    );
  }

  function render() {
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
      MysteryEngine.clearSave(mystery);
      state = MysteryEngine.restart(mystery);
      syncPersist();
      toggleEvidence(false);
      render();
    });
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
      restartBtn: $("restart-btn")
    };

    bind();
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
    render: render
  };

  document.addEventListener("DOMContentLoaded", boot);
})(window);
