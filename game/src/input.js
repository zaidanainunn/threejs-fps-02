// Input: pointer lock with mouse-look deltas, the key set, and the
// edge-triggered actions (reload, buy, grenades, weapon slots). The game
// never reads keys directly — main.js polls this state each fixed step.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const look = { x: 0, y: 0 };
  let locked = false;
  let firing = false;

  function requestLock() {
    canvas.requestPointerLock();
  }
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    onLockChange(locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    look.x += e.movementX;
    look.y += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) firing = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Tab') e.preventDefault();
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); firing = false; });

  return {
    keys,
    get firing() { return firing; },
    get locked() { return locked; },
    requestLock,
    // Consume the accumulated look delta since the last call.
    takeLook() {
      const out = { x: look.x, y: look.y };
      look.x = 0; look.y = 0;
      return out;
    },
    // One-shot key presses: main.js asks "was B pressed since last step?"
    pressed(code) {
      if (keys.has(code)) { keys.delete(code); return true; }
      return false;
    },
  };
}
