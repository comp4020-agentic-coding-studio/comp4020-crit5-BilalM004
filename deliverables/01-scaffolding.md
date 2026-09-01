# Deliverable 1 — Game scaffolding

**Recommended model: Sonnet.** Fully mechanical once the structure below is
decided — no feel or design judgment involved.

## What this covers

The empty shell everything else plugs into: a full-viewport canvas, a
resize handler, and a fixed-timestep `requestAnimationFrame` loop that will
call into `game.update(dt, input)` and `render.draw(ctx, state)` (from later
deliverables — stub them if they don't exist yet).

## Files

- `src/pages/index.astro` — replace the placeholder content with:
  - the existing `<nav aria-label="Primary">` / Home link (keeps the
    invariants test green)
  - a real `<h1>` as the game's title — this doubles as the visible "start"
    affordance (not instruction — it's branding, the way any game's title
    screen has a name on it)
  - a `<canvas>` element, sized to fill the viewport
- `src/scripts/main.ts` — bootstraps: get the canvas + 2D context, size it to
  `window.innerWidth`/`innerHeight` with a `resize` listener, run the game
  loop.
- `src/layouts/Layout.astro` — leave as-is for now; just update the
  `description` prop text once the game has a name/feel worth describing.

## Constraints from the brief

- Static site, no backend, no new npm dependencies.
- Must render correctly at both marking viewports: 1920×1080 desktop and
  390×844 phone (Chrome DevTools device toolbar) — canvas sizing needs to
  handle both without layout breaking.
- `pnpm build`/`pnpm typecheck` alone is fine for a minor edit; run the full
  `pnpm check` for anything larger (see `CLAUDE.md`).
