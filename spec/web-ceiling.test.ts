// The mechanical rule: a web that reaches its target stays attached.
//
// A shot straight up at a rooftop directly overhead is the ordinary case at a
// gap's edge, not an edge case — and it used to always drop the rope right as
// it arrived. The zip closes the distance to the anchor fast, but the
// player's own body collides with the platform (moveAndCollide stops them)
// before their center reaches it, so the apex handoff always measured a
// residual gap of about half a player height — well under minRopeLength,
// which the handoff treated the same as a fire-time "already against it,
// nothing to swing on" refusal. The web vanished and gravity took over,
// mid-air, the instant the shot succeeded.
//
// The fix distinguishes "just arrived" from "was already point-blank": only
// the zip's apex handoff clamps up to minRopeLength instead of refusing.

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
// Close enough overhead that the raycast anchor (its underside) sits well
// inside web range, the way a low rooftop across a gap actually looks.
const OVERHEAD: Rect = { x: 100, y: 550, w: 200, h: 40 };
const platforms: readonly Rect[] = [GROUND, OVERHEAD];

/** A player at rest on the ground, directly under OVERHEAD. */
function standingUnderOverhead(): { p: ReturnType<typeof createPlayer>; anchor: Vec2 } {
  const p = createPlayer({ x: 187, y: 660 });
  for (let i = 0; i < 200 && !p.onGround; i += 1) stepPlayer(p, idle, platforms, cfg, dt);
  expect(p.onGround).toBe(true);

  const anchor: Vec2 = { x: playerCenter(p).x, y: OVERHEAD.y + OVERHEAD.h };
  return { p, anchor };
}

test("a web fired straight up at a close overhead platform stays attached", () => {
  const { p, anchor } = standingUnderOverhead();
  attachWeb(p, anchor, cfg);
  expect(p.swing).not.toBeNull();

  // The bug: attached, flew up, then dropped the instant it reached the
  // platform. Run well past that moment of contact.
  for (let i = 0; i < 90; i += 1) stepPlayer(p, idle, platforms, cfg, dt);

  expect(p.swing).not.toBeNull();
  expect(p.onGround).toBe(false);
});

test("that web hangs at (at least) minRopeLength rather than snapping the player through the platform", () => {
  const { p, anchor } = standingUnderOverhead();
  attachWeb(p, anchor, cfg);

  for (let i = 0; i < 90 && p.swing; i += 1) stepPlayer(p, idle, platforms, cfg, dt);

  expect(p.swing?.length).toBeGreaterThanOrEqual(cfg.minRopeLength);
  // Hanging below the platform's underside, not inside or above it.
  expect(playerCenter(p).y).toBeGreaterThan(OVERHEAD.y + OVERHEAD.h);
});
