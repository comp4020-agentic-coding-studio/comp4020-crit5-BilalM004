# Deliverable 8 — Game state

**Recommended model: Sonnet.** Integration work over rules that are already
decided elsewhere — no open design judgment left.

## What this covers

`src/scripts/game/game.ts` — the state machine tying everything together:
health, current level index, and win/lose detection, plus the
`update(dt, input)` function the game loop (deliverable 1) calls each tick.

```
update(dt, input):
  - feed input into physics.ts (movement/jump/swing) and web.ts (aim/fire)
  - step entities.ts (enemy telegraph/fire/projectile travel, damage)
  - check loss: health <= 0, or player.y > level.killPlaneY
  - check win: player reached level.door
    - on last level → game won
    - otherwise → advance to next level (reset player position, keep/reset
      health per whatever feels right when you playtest it)
```

## Loss/win conditions (fixed, from the brief)

- **Loss**: health hits 0, or falling off the map (below `killPlaneY`).
- **Win**: reaching the door on the final level.

Both must be genuinely reachable — the brief requires the game to be
losable, not just winnable.

## Interacts with

- `physics.ts` (deliverable 3), `web.ts` (deliverable 4), `entities.ts`
  (deliverable 5), `level.ts` (deliverable 6) — this module orchestrates
  all of them, doesn't reimplement their logic.
- `render.ts` (deliverable 7) reads this state to draw the HUD and
  win/lose screens.

## Verification

No automated test expected specifically here (the one required test targets
`web.ts`'s `resolveWebTarget`). Verify by playing: can you actually lose
both ways, can you actually reach the final door and have it register as a
win.
