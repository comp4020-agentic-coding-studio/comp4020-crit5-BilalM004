# Deliverable 4 — Web targeting

**Recommended model: Sonnet.** A well-defined pure function — the hardest
part is the design decision (already made below), not the implementation.

## What this covers

`src/scripts/game/web.ts` — the single function the whole design pivots on:
one "shoot web" action that behaves differently depending on what it hits.

```
resolveWebTarget(origin, aimVector, level):
  { type: 'anchor' | 'enemy' | 'miss', point, enemy? }
```

Raycast from `origin` along `aimVector` against:

1. Level wall/rooftop geometry (from `level.ts`, deliverable 6) → if hit
   first, `type: 'anchor'`, `point` = the hit point physics.ts (deliverable
   3) will swing around.
2. Enemy hitboxes (from `entities.ts`, deliverable 5) → if hit first,
   `type: 'enemy'`, `enemy` = the one hit (for damage application).
3. Neither within range → `type: 'miss'`.

Also produce the **trajectory preview points** shown while the player is
dragging to aim (feeds `render.ts`, deliverable 7) — same ray, just drawn
before release rather than acted on.

## This is the one automated test

`spec/game.test.ts` (deliverable 9) tests exactly this function: aim at a
wall → `'anchor'`, aim at an enemy → `'enemy'`, aim at empty space →
`'miss'`. Write `resolveWebTarget` as a pure function with no dependency on
canvas/DOM state specifically so that test can call it directly with plain
data.

## Verification

`pnpm build`/`pnpm typecheck` alone is fine for a minor edit; run the full
`pnpm check` for anything larger (see `CLAUDE.md`).
