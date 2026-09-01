// The mechanical rule: firing a web has to do something useful from wherever
// the player is standing, because standing on a rooftop is where every level
// starts and the brief allows no tutorial to explain otherwise.
//
// This exists because it was broken. A pendulum's arc bottoms out at
// anchor.y + length, and length is the hypotenuse of the offset to the anchor,
// so the bottom of the arc is always at or below the player. A pendulum
// starting from rest accelerates toward that bottom — which in mid-air is a
// swing, and on the ground is the floor. A standing shot attached and died in
// a single 16ms tick, and read to the player as the web silently vanishing.
//
// The assertions below are about behaviour, not mechanism: they say the web
// survives and lifts, not how. The zip is one way to satisfy that; a later
// deliverable may find another.

import { expect, test } from "vitest";
import type { Rect, Vec2 } from "../src/scripts/game/geometry";
import {
  DEFAULT_PHYSICS,
  attachWeb,
  createPlayer,
  playerCenter,
  stepPlayer,
} from "../src/scripts/game/physics";

const cfg = DEFAULT_PHYSICS;
const dt = 1 / 60;
const idle = { moveX: 0, moveY: 0, jumpPressed: false };

const GROUND: Rect = { x: 0, y: 700, w: 1200, h: 200 };
const BEAM: Rect = { x: 1000, y: 180, w: 400, h: 40 };
const platforms: readonly Rect[] = [GROUND, BEAM];

/** A player at rest on the ground, which is the state the bug was about. */
function standing(x: number) {
  const p = createPlayer({ x, y: 600 });
  for (let i = 0; i < 200 && !p.onGround; i += 1) stepPlayer(p, idle, platforms, cfg, dt);
  expect(p.onGround).toBe(true);
  expect(p.vel).toEqual({ x: 0, y: 0 });
  return p;
}

/** Somewhere on the beam that is within reach of a player standing at x. */
const REACHABLE_ANCHOR: Vec2 = { x: 1000, y: 220 };

test("a web fired from a standstill survives longer than a single tick", () => {
  const p = standing(860);
  attachWeb(p, REACHABLE_ANCHOR, cfg);
  expect(p.swing).not.toBeNull();

  // The bug: attached, then gone on the very next step.
  stepPlayer(p, idle, platforms, cfg, dt);
  expect(p.swing).not.toBeNull();

  let steps = 1;
  while (p.swing && steps < 240) {
    stepPlayer(p, idle, platforms, cfg, dt);
    steps += 1;
  }
  // Two seconds of uninterrupted web is not a demanding bar; one tick was the
  // failure, and anything that dies in under half a second is the same bug.
  expect(steps).toBeGreaterThan(30);
});

test("a web fired from a standstill lifts the player off the ground", () => {
  const p = standing(860);
  const startY = playerCenter(p).y;

  attachWeb(p, REACHABLE_ANCHOR, cfg);
  let peakY = startY;
  for (let i = 0; i < 240 && p.swing; i += 1) {
    stepPlayer(p, idle, platforms, cfg, dt);
    peakY = Math.min(peakY, playerCenter(p).y);
  }

  // Gaining height is the whole point: the shot has to get the player airborne
  // and moving, or the mechanic reads as doing nothing at all.
  expect(startY - peakY).toBeGreaterThan(60);
  expect(p.onGround).toBe(false);
});

test("a web fired in mid-air still swings immediately", () => {
  // The fix must not have been bought by changing the airborne path, which
  // was already correct.
  const p = createPlayer({ x: 860, y: 400 });
  attachWeb(p, REACHABLE_ANCHOR, cfg);
  expect(p.swing?.phase).toBe("swing");

  let steps = 0;
  while (p.swing && steps < 240) {
    stepPlayer(p, idle, platforms, cfg, dt);
    steps += 1;
  }
  expect(steps).toBeGreaterThan(30);
});

test("an anchor beyond rope range is refused rather than snapped to", () => {
  // Clamping an over-long rope would place the player on a circle they are
  // not standing on, i.e. teleport them toward the anchor.
  const p = standing(200);
  const far: Vec2 = { x: playerCenter(p).x + cfg.maxRopeLength + 100, y: 680 };
  const before = { ...playerCenter(p) };

  attachWeb(p, far, cfg);
  expect(p.swing).toBeNull();
  expect(playerCenter(p)).toEqual(before);
});
