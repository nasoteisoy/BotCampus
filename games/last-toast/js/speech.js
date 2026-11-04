/**
 * British narration via prebuilt Piper MP3 clips (voice-manifest.json + audio/).
 * speechSynthesis is fallback only when a clip is missing.
 * Toggle default off; preference in localStorage.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "mystery-template:read-aloud";
  var manifest = null;
  var enabled = false;
  var supported = true; // audio element always "supported"; clip pack may be missing
  var audioEl = null;
  var lastPlaylist = [];
  var loadPromise = null;
  var debug = { plays: [], stops: 0, fallbacks: [] };
  var playGen = 0;

  function getAudio() {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = "auto";
    }
    return audioEl;
  }

  function loadPref() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function savePref(on) {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch (e) { /* ignore */ }
  }

  function ensureManifest() {
    if (manifest) return Promise.resolve(manifest);
    if (loadPromise) return loadPromise;
    loadPromise = fetch("voice-manifest.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("manifest " + r.status);
        return r.json();
      })
      .then(function (data) {
        manifest = data;
        return manifest;
      })
      .catch(function (err) {
        console.warn("voice manifest load failed; TTS clips unavailable", err);
        manifest = { byId: {} };
        return manifest;
      });
    return loadPromise;
  }

  function stop() {
    debug.stops += 1;
    var a = getAudio();
    try {
      a.pause();
      a.removeAttribute("src");
      a.load();
    } catch (e) { /* ignore */ }
    if (global.speechSynthesis) {
      try {
        global.speechSynthesis.cancel();
      } catch (e2) { /* ignore */ }
    }
    stop._queue = [];
  }

  function speakFallback(text) {
    if (!global.speechSynthesis || !text) return;
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "en-GB";
      u.rate = 1;
      global.speechSynthesis.speak(u);
    } catch (e) {
      console.warn("speechSynthesis fallback failed", e);
    }
  }

  function playUrl(url) {
    return new Promise(function (resolve) {
      var a = getAudio();
      var settled = false;
      var done = function () {
        if (settled) return;
        settled = true;
        a.onended = null;
        a.onerror = null;
        resolve();
      };
      a.onended = done;
      a.onerror = function () {
        console.warn("audio clip failed", url);
        done();
      };
      try {
        a.src = url;
      } catch (e) {
        done();
        return;
      }
      var p = a.play();
      if (p && typeof p.then === "function") {
        p.then(function () {
          // Tests / some browsers never fire ended for stub or tiny clips
          try {
            if (!isFinite(a.duration) || a.duration < 0.05 || a.ended || a.paused) {
              setTimeout(done, 0);
            }
          } catch (err) {
            setTimeout(done, 0);
          }
        }).catch(function () {
          done();
        });
      }
    });
  }

  /**
   * Play a list of clip ids in order (cancel anything already playing).
   * ids: string[] of manifest byId keys
   * fallbackTexts: optional parallel map id -> text for missing clips
   */
  function playIds(ids, fallbackTexts) {
    stop();
    var gen = ++playGen;
    lastPlaylist = { ids: ids.slice(), fallbackTexts: fallbackTexts || {} };
    if (!enabled) return Promise.resolve();

    return ensureManifest().then(function (man) {
      if (!enabled || gen !== playGen) return;
      var queue = ids.slice();
      var texts = fallbackTexts || {};

      function next() {
        if (!enabled || gen !== playGen) return Promise.resolve();
        if (!queue.length) return Promise.resolve();
        var id = queue.shift();
        var meta = man.byId && man.byId[id];
        if (meta && meta.file) {
          debug.plays.push({ id: id, file: meta.file });
          return playUrl(meta.file).then(next);
        }
        console.warn("missing voice clip for", id);
        var fb = texts[id];
        if (fb) {
          debug.fallbacks.push({ id: id, text: fb });
          speakFallback(fb);
        }
        return next();
      }

      return next();
    });
  }

  function replay() {
    if (!lastPlaylist || !lastPlaylist.ids || !lastPlaylist.ids.length) return;
    var ids = lastPlaylist.ids.slice();
    var fb = lastPlaylist.fallbackTexts || {};
    playIds(ids, fb);
  }

  function setEnabled(on, opts) {
    opts = opts || {};
    enabled = !!on;
    savePref(enabled);
    if (!enabled) {
      stop();
      return Promise.resolve();
    }
    // Turning on: unlock audio on mobile via this user-gesture call, then play current
    getAudio(); // create element under gesture
    if (opts.playlist) {
      return playIds(opts.playlist.ids || [], opts.playlist.fallbackTexts || {});
    }
    if (opts.replay !== false) replay();
    return Promise.resolve();
  }

  function isEnabled() {
    return enabled;
  }

  function init() {
    enabled = loadPref();
    ensureManifest();
    return { enabled: enabled, supported: supported };
  }

  global.MysterySpeech = {
    init: init,
    stop: stop,
    playIds: playIds,
    replay: replay,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    ensureManifest: ensureManifest,
    STORAGE_KEY: STORAGE_KEY,
    _debug: debug,
    _resetDebug: function () {
      debug.plays = [];
      debug.stops = 0;
      debug.fallbacks = [];
    }
  };
})(window);
