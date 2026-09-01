// The mechanical rule: contact and impact are different events.
//
// Drifting into a wall catches it, and that has to keep working — climbing by
// contact is one of the movement verbs the brief names. But *slamming* into
// one at swing speed used to do the same thing, and because the player pumps
// toward the wall they are swinging at, they arrive holding into it. So the
// cling fired every time, caught them mid-flight, and froze them: 686px/s to
// a dead stop, stuck in place for as long as they held the key. It read as
// the wall being glue.
//
// These assert the split by outcome — knocked off vs. caught — not by any
// particular threshold or flag, so the tuning in deliverable 10 is free to
// move the numbers without rewriting the tests.

import { expect, test } from "vitest";
import type { Rect } from "../src/scripts/game/geometry";
import {
  DEFAULT_PHYSICS,
  attachWeb,
  createPlayer,
  playerCenter,
  stepPlayer,
} from "../src/scripts/game/physics";

const cfg = DEFAULT_PHYSICS;
const dt = 1 / 60;

const WALL: Rect = { x: 620, y: 380, w: 60, h: 320 };
const platforms: readonly Rect[] = [{ x: 0, y: 900, w: 2000, h: 200 }, WALL];

/** Swing rightward into WALL at speed, holding into it the whole way — which
 *  is what pumping a swing toward a wall actually looks like. */
function crashIntoWall() {
  const p = createPlayer({ x: 300, y: 430 });
  p.vel = { x: 900, y: 0 };
  attachWeb(p, { x: 420, y: 250 }, cfg);
  expect(p.swing).not.toBeNull();

  const intent = { moveX: 1, moveY: 0, jumpPressed: false };
  for (let i = 0; i < 200 && p.swing; i += 1) stepPlayer(p, intent, platforms, cfg, dt);
  expect(p.swing).toBeNull(); // the wall dropped the web
  return { p, intent };
}

test("a swing that slams into a wall knocks the player off it", () => {
  const { p, intent } = crashIntoWall();

  // The failure was freezing on contact. Track motion over the next 12 ticks
  // while still holding into the wall.
  const positions: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    stepPlayer(p, intent, platforms, cfg, dt);
    positions.push(playerCenter(p).y);
    expect(p.wallSide).toBe(0); // never catches the wall it was thrown off
  }

  const moved = Math.max(...positions) - Math.min(...positions);
  expect(moved).toBeGreaterThan(10);
});

test("a crash does not cost the player their momentum", () => {
  const { p } = crashIntoWall();
  // Thrown clear rather than stopped dead: the wall absorbs only the
  // component pointing into it.
  expect(Math.abs(p.vel.y)).toBeGreaterThan(200);
});

const INTO_WALL = { moveX: 1, moveY: 0, jumpPressed: false };

/** Drift right into WALL and stop the moment the cling takes. Stopping on the
 *  event rather than after a fixed number of ticks matters now that holding
 *  into a wall climbs it: a fixed loop runs the player straight over the top
 *  and out the far side, and the test then reads "never stuck". */
function clingToWall() {
  const p = createPlayer({ x: 520, y: 430 });
  p.vel = { x: 120, y: 0 };
  for (let i = 0; i < 120 && p.wallSide === 0; i += 1) {
    stepPlayer(p, INTO_WALL, platforms, cfg, dt);
  }
  return p;
}

test("drifting into a wall still catches it, so the climb route survives", () => {
  expect(clingToWall().wallSide).not.toBe(0);
});

test("a caught wall is climbed by holding into it, with no second key", () => {
  // W is the jump, so there is no keyboard "up" left to climb with. Holding
  // into the wall has to be the whole input, or the climb verb is unreachable
  // on desktop.
  const p = clingToWall();
  expect(p.wallSide).not.toBe(0);

  const startY = playerCenter(p).y;
  for (let i = 0; i < 30; i += 1) stepPlayer(p, INTO_WALL, platforms, cfg, dt);
  expect(playerCenter(p).y).toBeLessThan(startY - 40);
});

test("holding down still descends a wall, so the climb goes both ways", () => {
  const p = clingToWall();
  expect(p.wallSide).not.toBe(0);

  const startY = playerCenter(p).y;
  for (let i = 0; i < 20; i += 1) {
    // Still holding into the wall — that is what keeps the grip — but S wins.
    stepPlayer(p, { moveX: 1, moveY: 1, jumpPressed: false }, platforms, cfg, dt);
  }
  expect(playerCenter(p).y).toBeGreaterThan(startY + 20);
});

test("a climb clears the top of the wall instead of dropping back down it", () => {
  // The payoff of the rebinding: the press that sticks you to the wall is the
  // press that lands you on top of it. With a separate climb key the player
  // reaches the lip and falls back down beside it.
  // Asserted as "did this ever happen" rather than "is it true at tick N":
  // holding right keeps walking, so the player crosses the 60px-wide top and
  // steps off the far side, and a fixed tick count would sample either the
  // standing or the falling half depending on the run speed of the day.
  const p = clingToWall();
  let stoodOnTop = false;
  for (let i = 0; i < 120; i += 1) {
    stepPlayer(p, INTO_WALL, platforms, cfg, dt);
    if (p.onGround && playerCenter(p).y < WALL.y) stoodOnTop = true;
  }

  expect(stoodOnTop).toBe(true);
});
