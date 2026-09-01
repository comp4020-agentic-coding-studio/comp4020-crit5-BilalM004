# Deliverable 6 — Level layouts

**Recommended model: Opus** for the first layout pass — deciding what a
level's geometry alone can teach (wall-jump vs. web-swing vs. combat) is a
design judgment call, not just data entry. Human playtesting still drives
the real tuning afterward (see deliverable 10).

## What this covers

`src/scripts/game/level.ts` — a `Level` type plus a small `LEVELS` array:

```
{ platforms: Rect[], enemies: EnemyConfig[], door: Point,
  playerStart: Point, killPlaneY: number }
```

- `platforms` — rectangles the player collides with / can wall-stick to.
- `enemies` — per-level `EnemyConfig`s (position, fireRate, damage,
  telegraphMs — see deliverable 5).
- `door` — reaching it on the final level = win.
- `killPlaneY` — falling below this Y = instant loss.

## Suggested progression (3 short levels)

- **Level 1 — movement only, no enemies.** A gap that can't be crossed by
  jumping alone, forcing the player to either wall-jump across or try the
  web on a visible anchor. This is how the *first* move stays obvious with
  zero text — the gap itself, plus a visibly distinct anchor point in view,
  teaches the web without a word.
- **Level 2 — introduces one enemy**, slow fire rate, generous telegraph.
  First time the player needs to aim the web at something other than a
  wall.
- **Level 3 — combines a swing-across-a-gap with a faster enemy** — the
  "two mechanics interacting" the brief calls the harder, better move.

Keep it to this few levels and reused enemy configs (just faster/harder per
level) — breadth of content isn't the goal here; the movement/web feel is
(see deliverables 3-4), so don't spend build time on more levels than this.

## Verification

No automated test expected here. Verify by playing each level cold, as if
you'd never seen it — does the first screen make the first move obvious
with nothing on screen but geometry.
