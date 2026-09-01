# Deliverable 5 — Enemies and their projectiles

**Recommended model: Sonnet.** Mechanical once the rules below are fixed;
no open design judgment beyond what's already decided.

## What this covers

`src/scripts/game/entities.ts` — the `Enemy` and `Projectile` parts (the
`Player` type can live here too, but its behavior is mostly driven by
`physics.ts`/`input.ts`).

**Enemy config** (per instance, set from `level.ts` data): position,
`fireRate` (ms between shots), `damage`, `telegraphMs` (wind-up time before
firing).

**Enemy update loop**, each tick:

1. Idle → telegraph timer counts down (this is the wind-up the render
   deliverable must show visually — a color/shape change, not text).
2. Telegraph ends → spawn a `Projectile` aimed at the player's position at
   that instant, reset the fire-rate timer.
3. `Projectile` travels in a straight line at a fixed speed; on colliding
   with the player's box, apply `damage` to health (in `game.ts`,
   deliverable 8) and despawn.
4. Enemy hit by a resolved web shot (`type: 'enemy'` from deliverable 4) →
   apply web damage, remove enemy (or reduce its own health, if you want a
   multi-hit enemy — single-hit is simpler and fine for a game this size).

## Difficulty ramp

Per-level `fireRate`/`damage` values increase — that's the *only* way
difficulty increases across levels. No new enemy behaviors mid-game, since a
new rule would need teaching, which breaks the no-tutorial constraint.

## Fairness constraint

The telegraph must be long/clear enough that a first-time player who's
never seen this enemy before can react to it. This can't really be judged
from code — it's a playtest call (candidate for the deliverable 10 evidence
requirement: telegraph duration is exactly the kind of thing you only learn
is too short by getting hit unfairly in actual play).

## Interacts with

- `level.ts` (deliverable 6) supplies the per-level enemy configs.
- `render.ts` (deliverable 7) draws the telegraph/fire/projectile visuals.
- `game.ts` (deliverable 8) applies health changes and checks loss.
