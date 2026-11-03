/**
 * Persist mystery progress in localStorage.
 * Key comes from mystery.storageKey so multiple mysteries do not collide.
 */
(function (global) {
  "use strict";

  function load(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("storage load failed", err);
      return null;
    }
  }

  function save(key, state) {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
      console.warn("storage save failed", err);
    }
  }

  function clear(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn("storage clear failed", err);
    }
  }

  global.MysteryStorage = { load: load, save: save, clear: clear };
})(window);
