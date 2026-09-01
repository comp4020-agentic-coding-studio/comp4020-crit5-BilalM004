// The mechanical rule: the rope's length is driven by `reel`, not by `moveY`.
//
// These are the same axis on the touch joystick and deliberately not on the
// keyboard. W is the jump, so the keyboard has no "up" left; if reeling read
// `moveY` it would offer S-to-lengthen and nothing to shorten, and a rope that
// can only get longer is a one-way ratchet — a few taps of S and the player is
// stuck at max length for the rest of the swing with no key to undo it.
//
// So desktop swings on a fixed-length rope rather than half a mechanic. That
// is a design decision, not an oversight, which is exactly the kind of thing
// that gets "helpfully" undone later by wiring moveY back in.

import { expect, test } from "vitest";
import type { Rect, Vec2 } from "../src/scripts/game/geometry";
import { DEFAULT_PHYSICS, attachWeb, createPlayer, stepPlayer } from "../src/scripts/game/physics";

const cfg = DEFAULT_PHYSICS;
const dt = 1 / 60;

const platforms: readonly Rect[] = [
  { x: 0, y: 700, w: 1200, h: 200 },
  { x: 1000, y: 180, w: 400, h: 40 },
];
const ANCHOR: Vec2 = { x: 1000, y: 220 };

/** Mid-air, so the web goes straight to the pendulum phase and `length` is
 *  live from the first tick. */
function swinging() {
  const p = createPlayer({ x: 860, y: 400 });
  attachWeb(p, ANCHOR, cfg);
  expect(p.swing?.phase).toBe("swing");
  return p;
}

test("holding down on the keyboard does not lengthen the rope", () => {
  const p = swinging();
  const startLength = p.swing?.length ?? 0;
  expect(startLength).toBeGreaterThan(0);

  // A keyboard intent: S is pressed, and there is no `reel` field at all.
  for (let i = 0; i < 60 && p.swing; i += 1) {
    stepPlayer(p, { moveX: 0, moveY: 1, jumpPressed: false }, platforms, cfg, dt);
  }

  expect(p.swing?.length).toBe(startLength);
});

test("the joystick can still reel the rope in", () => {
  const p = swinging();
  const startLength = p.swing?.length ?? 0;

  // A joystick intent: the vertical axis fills both fields.
  for (let i = 0; i < 60 && p.swing; i += 1) {
    stepPlayer(p, { moveX: 0, moveY: -1, reel: -1, jumpPressed: false }, platforms, cfg, dt);
  }

  expect(p.swing).not.toBeNull();
  expect(p.swing?.length).toBeLessThan(startLength - 50);
});

test("reeling in speeds the swing up rather than just shortening the rope", () => {
  // Why reel-in is the half worth keeping: tangential speed is conserved, so
  // pulling in trades length for angular rate. Reel-out only drops the player.
  const p = swinging();
  const before = p.swing;
  if (!before) throw new Error("expected a swing");
  const startRate = Math.abs(before.angularVel);

  for (let i = 0; i < 30 && p.swing; i += 1) {
    stepPlayer(p, { moveX: 0, moveY: -1, reel: -1, jumpPressed: false }, platforms, cfg, dt);
  }

  expect(Math.abs(p.swing?.angularVel ?? 0)).toBeGreaterThan(startRate);
});
