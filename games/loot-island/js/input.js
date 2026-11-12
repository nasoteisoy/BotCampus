// Named actions: move (axis), interact / reset (edge). Keyboard + radial-deadzone joystick.
// Pattern adapted from parts-library/boarding-input (joystick + 56px-safe corners, 48px+ targets).

export function createInput(rootEl) {
  const keys = Object.create(null);
  const isTouch =
    (typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window));

  const state = {
    moveX: 0,
    moveY: 0,
    interact: false,
    interactPressed: false,
    reset: false,
    resetPressed: false,
    isTouch,
  };

  const DEAD = 0.18;
  let joyPtr = null;
  let joyX = 0;
  let joyY = 0;
  let interactHeld = false;
  let resetHeld = false;
  let prevInteract = false;
  let prevReset = false;

  const hud = document.createElement('div');
  hud.id = 'loot-hud';
  hud.innerHTML = `
    <div class="hint" id="loot-hint">WASD or arrows to walk · E / Space to open</div>
    <button type="button" class="reset-btn" id="loot-reset" aria-label="Reset chest">Reset</button>
    <div class="prompt" id="loot-prompt" hidden>
      <span class="chest-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="8" width="18" height="12" rx="2"/>
          <path d="M3 12h18M12 8v12"/>
          <path d="M8 8V6a4 4 0 0 1 8 0v2"/>
        </svg>
      </span>
      <span class="prompt-txt">Open</span>
      <kbd>E</kbd>
    </div>
    <button type="button" class="open-btn" id="loot-open" hidden aria-label="Open chest">
      <span class="chest-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="8" width="18" height="12" rx="2"/>
          <path d="M3 12h18M12 8v12"/>
          <path d="M8 8V6a4 4 0 0 1 8 0v2"/>
        </svg>
      </span>
      Open
    </button>
    <div class="item-slam" id="loot-item" hidden><em id="loot-item-rarity"></em><strong id="loot-item-name"></strong></div>
    <div class="touch" id="loot-touch" hidden>
      <div class="joy" id="loot-joy" aria-label="Move"><div class="joy-knob" id="loot-joy-knob"></div></div>
    </div>
  `;
  rootEl.appendChild(hud);

  const promptEl = hud.querySelector('#loot-prompt');
  const openBtn = hud.querySelector('#loot-open');
  const resetBtn = hud.querySelector('#loot-reset');
  const hintEl = hud.querySelector('#loot-hint');
  const itemEl = hud.querySelector('#loot-item');
  const itemRarity = hud.querySelector('#loot-item-rarity');
  const itemName = hud.querySelector('#loot-item-name');
  const touchEl = hud.querySelector('#loot-touch');
  const joyEl = hud.querySelector('#loot-joy');
  const knobEl = hud.querySelector('#loot-joy-knob');

  if (isTouch) {
    touchEl.hidden = false;
    hintEl.textContent = 'Stick to walk · tap Open at the chest';
  }

  function rescale(x, y) {
    const m = Math.hypot(x, y);
    if (m < DEAD) return { x: 0, y: 0 };
    const s = Math.min(1, m);
    const t = (s - DEAD) / (1 - DEAD);
    return { x: (x / m) * t, y: (y / m) * t };
  }

  function onKey(e, down) {
    const k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(k)) {
      e.preventDefault();
    }
    keys[k] = down;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    keys[lower] = down;
    if (down && (k === 'e' || k === 'E' || k === ' ' || k === 'Spacebar')) interactHeld = true;
    if (!down && (k === 'e' || k === 'E' || k === ' ' || k === 'Spacebar')) interactHeld = false;
    if (down && (k === 'r' || k === 'R')) resetHeld = true;
    if (!down && (k === 'r' || k === 'R')) resetHeld = false;
  }

  window.addEventListener('keydown', (e) => onKey(e, true), { passive: false });
  window.addEventListener('keyup', (e) => onKey(e, false), { passive: false });

  openBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    interactHeld = true;
  });
  openBtn.addEventListener('pointerup', () => { interactHeld = false; });
  openBtn.addEventListener('pointercancel', () => { interactHeld = false; });
  openBtn.addEventListener('click', (e) => { e.preventDefault(); interactHeld = true; });

  resetBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resetHeld = true;
  });
  resetBtn.addEventListener('pointerup', () => { resetHeld = false; });
  resetBtn.addEventListener('pointercancel', () => { resetHeld = false; });
  resetBtn.addEventListener('click', (e) => { e.preventDefault(); resetHeld = true; });

  function joyFromEvent(ev) {
    const r = joyEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = r.width * 0.42;
    let dx = ev.clientX - cx;
    let dy = ev.clientY - cy;
    const m = Math.hypot(dx, dy) || 1;
    if (m > max) { dx = (dx / m) * max; dy = (dy / m) * max; }
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    const n = rescale(dx / max, -dy / max);
    joyX = n.x;
    joyY = n.y;
  }

  function joyEnd() {
    joyPtr = null;
    joyX = 0;
    joyY = 0;
    knobEl.style.transform = 'translate(0,0)';
  }

  joyEl.addEventListener('pointerdown', (e) => {
    joyPtr = e.pointerId;
    joyEl.setPointerCapture(e.pointerId);
    joyFromEvent(e);
  });
  joyEl.addEventListener('pointermove', (e) => {
    if (joyPtr === e.pointerId) joyFromEvent(e);
  });
  joyEl.addEventListener('pointerup', (e) => { if (joyPtr === e.pointerId) joyEnd(); });
  joyEl.addEventListener('pointercancel', (e) => { if (joyPtr === e.pointerId) joyEnd(); });

  function sample() {
    let x = 0;
    let y = 0;
    if (keys.w || keys.W || keys.ArrowUp) y += 1;
    if (keys.s || keys.S || keys.ArrowDown) y -= 1;
    if (keys.a || keys.A || keys.ArrowLeft) x -= 1;
    if (keys.d || keys.D || keys.ArrowRight) x += 1;
    if (x || y) {
      const m = Math.hypot(x, y);
      x /= m;
      y /= m;
    }
    if (isTouch && (joyX || joyY)) {
      x = joyX;
      y = joyY;
    }
    const interact = interactHeld;
    const reset = resetHeld;
    state.moveX = x;
    state.moveY = y;
    state.interact = interact;
    state.interactPressed = interact && !prevInteract;
    state.reset = reset;
    state.resetPressed = reset && !prevReset;
    prevInteract = interact;
    prevReset = reset;
    // Click / key edge: clear held after a sample so a click is one-shot
    if (interactHeld && !keys.e && !keys.E && !keys[' '] && !keys.Spacebar) {
      interactHeld = false;
    }
    if (resetHeld && !keys.r && !keys.R) {
      resetHeld = false;
    }
    return state;
  }

  function setPrompt(visible) {
    // Touch: only the corner Open button. PC: mid-screen prompt with E, no corner button.
    if (isTouch) {
      promptEl.hidden = true;
      openBtn.hidden = !visible;
    } else {
      promptEl.hidden = !visible;
      openBtn.hidden = true;
    }
  }

  function slamItem(rarityKey, rarityLabel, item, color) {
    itemEl.hidden = false;
    itemEl.dataset.rarity = rarityKey;
    itemEl.style.color = color;
    itemRarity.textContent = rarityLabel;
    itemName.textContent = item;
    itemEl.classList.remove('slam');
    void itemEl.offsetWidth;
    itemEl.classList.add('slam');
  }

  function hideItem() {
    itemEl.hidden = true;
    itemEl.dataset.rarity = '';
    itemEl.classList.remove('slam');
  }

  function setHint(text) {
    hintEl.textContent = text;
  }

  return {
    sample,
    setPrompt,
    slamItem,
    hideItem,
    setHint,
    get isTouch() { return isTouch; },
    els: { promptEl, openBtn, resetBtn, itemEl, hintEl, joyEl },
  };
}
