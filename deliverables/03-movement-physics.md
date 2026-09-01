# Deliverable 3 — Movement and swing physics

**Recommended model: Opus.** This is the feel-critical core of the whole
game — subtle physics bugs and "does this actually feel like swinging"
judgment calls benefit from stronger reasoning than the more mechanical
deliverables. Expect to iterate on this one, guided by actually playing it.

## What this covers

`src/scripts/game/physics.ts` — pure, testable functions (no rendering, no
DOM) that `game.ts` calls each tick:

- **Gravity integration** — standard `velocity += gravity * dt`,
  `position += velocity * dt`.
- **AABB platform collision + wall-stick** — resolve the player's box
  against level platform rectangles; walking into a wall while airborne (or
  holding into it) sticks the player to it (Vex-style), rather than just
  stopping horizontal movement.
- **Jump impulse** — a fixed upward velocity kick, usable both from the
  ground and off a wall-stick (wall-jump), triggered by `jumpPressed`.
- **Pendulum swing step** — once `web.ts` resolves an aim to a wall/rooftop
  anchor, the player's position becomes a function of angle around that
  fixed anchor point; each tick updates angle + angular velocity like a
  pendulum (gravity component along the tangent, some damping). Releasing
  the web (or hitting `jumpPressed` mid-swing) converts angular velocity
  back into a linear launch velocity.

## Key decision already made

**No physics library** (no Matter.js etc.) — hand-rolled math. Reasoning:
getting the swing to feel *right* means fighting a general-purpose engine's
constraints, which costs more time than writing the pendulum math directly;
and pure functions here are trivially unit-testable if you want extra
tests beyond the one required one.

## Interacts with

- `web.ts` (deliverable 4) — supplies the anchor point/type this module
  swings around.
- `level.ts` (deliverable 6) — supplies platform rectangles and the
  kill-plane Y (falling below it = loss condition, checked in `game.ts`).

## Verification

No automated test required here (the one focused test targets `web.ts`).
Verify by playing: does a jump feel responsive, does wall-stick feel
intentional rather than sticky/buggy, does the swing arc feel like momentum
rather than teleporting along a circle. This module is the most likely
source of the "changed after playing, not from reading code" evidence
requirement (deliverable 10) — e.g. gravity strength, swing damping, jump
impulse size.
