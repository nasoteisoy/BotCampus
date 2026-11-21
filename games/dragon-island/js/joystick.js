// Left on-screen joystick for phones. Knob clamp + pointer capture adapted from the parts-library boarding-input touch stick.
const DEADZONE = 0.12;

export function createJoystick(el, knob) {
  const state = { x: 0, y: 0, active: false };
  let id = null;
  const set = (e) => {
    const r = el.getBoundingClientRect(), max = r.width / 2 - knob.offsetWidth / 4;
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy) || 1, cl = Math.min(len, max), nx = (dx / len) * cl, ny = (dy / len) * cl;
    knob.style.transform = `translate(${nx}px, ${ny}px)`;
    const m = cl / max, s = m < DEADZONE ? 0 : (m - DEADZONE) / (1 - DEADZONE) / m;
    state.x = (nx / max) * s; state.y = -(ny / max) * s;
  };
  const reset = (e) => {
    if (e && e.pointerId !== id) return;
    id = null; state.x = 0; state.y = 0; state.active = false; knob.style.transform = ''; el.classList.remove('on');
  };
  el.addEventListener('pointerdown', (e) => { if (id !== null) return; id = e.pointerId; el.setPointerCapture(e.pointerId); state.active = true; el.classList.add('on'); set(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  el.addEventListener('pointerup', reset);
  el.addEventListener('pointercancel', reset);
  el.addEventListener('lostpointercapture', reset);
  return state;
}
