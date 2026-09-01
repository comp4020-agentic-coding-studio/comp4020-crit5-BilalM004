# Deliverable 6 — Level layouts

**Recommended model: Opus** for the first layout pass — deciding what a
level's geometry alone can teach (wall-jump vs. web-swing vs. combat) is a
design judgment call, not just data entry. Human playtesting still drives
the real tuning afterward (see deliverable 10).

## What this covers

`src/scripts/game/level.ts` — a `Level` type plus a small `LEVELS` array:

```
{ platforms: Rect[], enemies: Enemy[], door: Point,
  playerStart: Point, killPlaneY: number }
```

- `platforms` — rectangles the player collides with / can wall-stick to.
- `enemies` — this level's boss enemy (see deliverable 5 for the
  `doc-ock`/`venom` shapes) — one per level, not a crowd.
- `door` — reaching it on the final level = win.
- `killPlaneY` — falling below this Y = instant loss.

## Progression (3 short levels, one boss each)

- **Level 1 — movement only, no enemies.** A gap that can't be crossed by
  jumping alone, forcing the player to either wall-jump across or try the
  web on a visible anchor. This is how the *first* move stays obvious with
  zero text — the gap itself, plus a visibly distinct anchor point in view,
  teaches the web without a word.
- **Level 2 — Doc Ock.** First combat encounter. Give the arena enough
  width that the player has room to back out of his extended-arm reach and
  to sidestep/swing away from a thrown block's arc — a cramped arena makes
  both attacks unfair regardless of how well they're telegraphed. This is
  also the first time the player aims the web at something other than a
  wall.
- **Level 3 — Venom, combined with a swing-across-a-gap.** Open enough
  space that swinging away is a real escape from his leap (ties the web
  mechanic into surviving combat, not just traversal) — the "two mechanics
  interacting" the brief calls the harder, better move.

Keep it to these three levels, one boss each — breadth of content isn't the
goal here; the movement/web feel and each boss's telegraph are (see
deliverables 3-5), so don't spend build time on more levels or more enemies
per level than this.

## Verification

No automated test expected here. Verify by playing each level cold, as if
you'd never seen it — does the first screen make the first move obvious
with nothing on screen but geometry.
