# Deliverable 9 — One focused automated test

**Recommended model: Sonnet.** Small and well-defined — the design
decision (what to test and why) is already made below.

## What this covers

`spec/game.test.ts` — the one mechanical rule the brief asks to be under
test. It targets `resolveWebTarget` from `web.ts` (deliverable 4), since
that's the single pure function the whole design pivots on: the
context-sensitive web (swing vs. damage vs. miss).

Cases, kept to a handful, not exhaustive (per `spec/README.md`: "no minimum
count... test the contracts"):

- Aiming at a wall/rooftop anchor → `{ type: 'anchor' }`
- Aiming at an enemy → `{ type: 'enemy' }`
- Aiming at empty space → `{ type: 'miss' }`

Follow the existing pattern in `spec/invariants.test.ts` for style (Vitest
`describe`/`it`), but this file tests game logic directly with plain data —
no need to build the site or use jsdom, since `resolveWebTarget` is a pure
function with no DOM dependency.

## Important: ask before running it

Per `CLAUDE.md`, don't run `pnpm test` / `pnpm check` / `vitest` on your own
initiative — writing this test file is fine, but ask before actually
running the suite, even to check it passes.
