import type { Vec2 } from "./geometry";

export type { Vec2 };

/** How the aim direction is read from the pointer. The two input methods keep
 *  the same *gesture* (press, drag, release) but not the same vector math,
 *  because the constraint on each is different:
 *
 *  - "pointer" (mouse): direction is player -> cursor. The web goes where you
 *    point, which is the only reading a player guesses without being told.
 *  - "drag" (touch): the drag delta itself is the direction. The thumb zone is
 *    half the screen, so aiming at the finger would make everything left of
 *    the player unreachable; a drag keeps all 360 degrees available. */
export type AimMode = "pointer" | "drag";

export interface InputState {
  moveX: number;
  moveY: number;
  jumpPressed: boolean;
  aiming: boolean;
  aimMode: AimMode;
  /** Current pointer position in viewport pixels (the canvas fills it). */
  aimPoint: Vec2;
  /** Pointer travel since the press that began this aim. */
  aimVector: Vec2;
  /** One-shot: an aim was released this step. The direction comes from
   *  aimMode + aimPoint/aimVector, which still hold their release values. */
  fireWeb: boolean;
}

export function createInputState(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    jumpPressed: false,
    aiming: false,
    aimMode: "pointer",
    aimPoint: { x: 0, y: 0 },
    aimVector: { x: 0, y: 0 },
    fireWeb: false,
  };
}

// jumpPressed/fireWeb are one-shot events; the consumer calls this after
// reading them each fixed step.
export function resetFrameEvents(state: InputState): void {
  state.jumpPressed = false;
  state.fireWeb = false;
}

const JUMP_BUTTON_MARGIN = 84; // matches #jump-button's CSS center (40px inset + 44px half-width)
const JUMP_BUTTON_RADIUS = 44;
const JOYSTICK_MAX_RADIUS = 50;
const TOUCH_LAYOUT_MAX_WIDTH = 820;

export function attachInput(canvas: HTMLCanvasElement, state: InputState): void {
  attachKeyboard(state);
  attachPointer(canvas, state);
  attachTouchControlsVisibility();
}

/** W jumps, so there is no keyboard "up". Climbing is by contact instead:
 *  hold into the wall and the physics reads that as a climb, which means the
 *  hand never leaves WASD and the key that gets you *to* a wall is the same
 *  one that gets you *up* it. Space is deliberately unbound — one movement
 *  cluster, nothing off to the side. */
const JUMP_KEYS = new Set(["KeyW", "ArrowUp"]);

function attachKeyboard(state: InputState): void {
  const held = new Set<string>();

  function updateMove(): void {
    const right = held.has("KeyD") || held.has("ArrowRight") ? 1 : 0;
    const left = held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0;
    const down = held.has("KeyS") || held.has("ArrowDown") ? 1 : 0;
    state.moveX = right - left;
    // Down-only. The touch joystick still produces a full analog moveY, and
    // physics keeps honouring negative values, so nothing downstream had to
    // learn that one input method is short a direction.
    state.moveY = down;
  }

  window.addEventListener("keydown", (e) => {
    // !repeat: a held W is one jump, not a jump every key-repeat interval.
    if (JUMP_KEYS.has(e.code) && !e.repeat) state.jumpPressed = true;
    if (!held.has(e.code)) {
      held.add(e.code);
      updateMove();
    }
  });

  window.addEventListener("keyup", (e) => {
    held.delete(e.code);
    updateMove();
  });
}

function classifyTouchZone(x: number, y: number): "jump" | "joystick" | "aim" {
  const dx = x - (window.innerWidth - JUMP_BUTTON_MARGIN);
  const dy = y - (window.innerHeight - JUMP_BUTTON_MARGIN);
  if (dx * dx + dy * dy <= JUMP_BUTTON_RADIUS * JUMP_BUTTON_RADIUS) return "jump";
  return x < window.innerWidth / 2 ? "joystick" : "aim";
}

interface PointerTrack {
  pointerId: number;
  origin: Vec2;
}

function attachPointer(canvas: HTMLCanvasElement, state: InputState): void {
  let aimTrack: PointerTrack | null = null;
  let joystickTrack: PointerTrack | null = null;

  const joystickRing = document.querySelector<HTMLElement>("#joystick-ring");
  const joystickKnob = document.querySelector<HTMLElement>("#joystick-knob");

  function restJoystickPosition(): Vec2 {
    return { x: 90, y: window.innerHeight - 90 };
  }

  function positionJoystick(center: Vec2, knobOffset: Vec2): void {
    if (joystickRing) {
      joystickRing.style.left = `${center.x}px`;
      joystickRing.style.top = `${center.y}px`;
    }
    if (joystickKnob) {
      joystickKnob.style.left = `${center.x}px`;
      joystickKnob.style.top = `${center.y}px`;
      joystickKnob.style.transform = `translate(${knobOffset.x}px, ${knobOffset.y}px)`;
    }
  }
  positionJoystick(restJoystickPosition(), { x: 0, y: 0 });
  window.addEventListener("resize", () => {
    if (!joystickTrack) positionJoystick(restJoystickPosition(), { x: 0, y: 0 });
  });

  function setJoystickOffset(dx: number, dy: number): void {
    const dist = Math.min(Math.hypot(dx, dy), JOYSTICK_MAX_RADIUS);
    const angle = Math.atan2(dy, dx);
    const clampedX = Math.cos(angle) * dist;
    const clampedY = Math.sin(angle) * dist;
    state.moveX = clampedX / JOYSTICK_MAX_RADIUS;
    state.moveY = clampedY / JOYSTICK_MAX_RADIUS;
    if (joystickKnob) joystickKnob.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
  }

  function beginAim(e: PointerEvent, mode: AimMode): void {
    aimTrack = { pointerId: e.pointerId, origin: { x: e.clientX, y: e.clientY } };
    state.aiming = true;
    state.aimMode = mode;
    state.aimPoint = { x: e.clientX, y: e.clientY };
    state.aimVector = { x: 0, y: 0 };
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") {
      beginAim(e, "pointer");
      return;
    }

    const zone = classifyTouchZone(e.clientX, e.clientY);
    if (zone === "jump") {
      state.jumpPressed = true;
    } else if (zone === "joystick" && !joystickTrack) {
      joystickTrack = { pointerId: e.pointerId, origin: { x: e.clientX, y: e.clientY } };
      joystickRing?.classList.add("active");
      positionJoystick({ x: e.clientX, y: e.clientY }, { x: 0, y: 0 });
    } else if (zone === "aim" && !aimTrack) {
      beginAim(e, "drag");
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (aimTrack && e.pointerId === aimTrack.pointerId) {
      state.aimPoint = { x: e.clientX, y: e.clientY };
      state.aimVector = { x: e.clientX - aimTrack.origin.x, y: e.clientY - aimTrack.origin.y };
    } else if (joystickTrack && e.pointerId === joystickTrack.pointerId) {
      setJoystickOffset(e.clientX - joystickTrack.origin.x, e.clientY - joystickTrack.origin.y);
    }
  });

  function endAim(e: PointerEvent): void {
    if (aimTrack && e.pointerId === aimTrack.pointerId) {
      state.fireWeb = true;
      state.aiming = false;
      aimTrack = null;
    }
  }

  function endJoystick(e: PointerEvent): void {
    if (joystickTrack && e.pointerId === joystickTrack.pointerId) {
      joystickTrack = null;
      state.moveX = 0;
      state.moveY = 0;
      joystickRing?.classList.remove("active");
      positionJoystick(restJoystickPosition(), { x: 0, y: 0 });
    }
  }

  canvas.addEventListener("pointerup", (e) => {
    endAim(e);
    endJoystick(e);
  });
  canvas.addEventListener("pointercancel", (e) => {
    // A cancelled pointer is an interrupted gesture, not a shot: drop the aim
    // without firing.
    if (aimTrack && e.pointerId === aimTrack.pointerId) {
      state.aiming = false;
      aimTrack = null;
    }
    endJoystick(e);
  });
}

function attachTouchControlsVisibility(): void {
  const root = document.querySelector<HTMLElement>("#touch-controls");
  if (!root) return;

  const coarsePointer = window.matchMedia("(pointer: coarse)");

  function update(): void {
    const show = coarsePointer.matches || window.innerWidth <= TOUCH_LAYOUT_MAX_WIDTH;
    root!.classList.toggle("visible", show);
  }

  update();
  coarsePointer.addEventListener("change", update);
  window.addEventListener("resize", update);
}
