# Deliverable 7 — Rendering, characters/graphics, and HUD

**Recommended model: Opus** for the first pass — visual clarity of the
enemy telegraph is what makes damage "feel fair" with zero on-screen text,
which is a judgment call. Sonnet is fine for straightforward draw-call work
once the visual language (shapes, colors, telegraph cue) is established.

## What this covers

This is the "character/graphics" deliverable — everything drawn to the
canvas: player, enemies, background, HUD, and the web/trajectory line.

`src/scripts/game/render.ts` — draw functions called from the game loop
(deliverable 1) each frame, reading from `game.ts` state (deliverable 8):

- **Background** — a simple flat city-skyline silhouette, not detailed art.
- **Player** — a simple geometric shape (no sprite sheet, no animation
  frames to author).
- **Enemies** — Doc Ock (level 2) and Venom (level 3, see deliverable 5)
  need their own silhouettes, distinct from each other and from the player:
  - **Doc Ock** — extra limb shapes reading clearly as arms, drawn visibly
    extending toward the player during the melee telegraph; the thrown
    block itself should look distinct from Doc Ock's body so its arc is
    easy to track separately from him.
  - **Venom** — a larger, distinct-silhouette shape; a crouch/wind-up pose
    during the leap telegraph that's unmistakably different from its idle
    pose, since that pose is the player's only warning.
  Every telegraph (arm-extend, block-throw wind-up, leap crouch) **must
  visibly change** (color shift, pose/shape change, whatever reads clearly)
  before the attack lands (see deliverable 5) — this is the primary
  no-tutorial fairness mechanic for combat, so it needs to be unmistakable,
  not subtle, and needs to read at phone size (390×844), not just desktop.
- **Web/trajectory** — a line from player to anchor while swinging; while
  aiming (drag held), draw the trajectory-preview points from `web.ts`
  (deliverable 4) as a dotted line/arrow so the player sees where a shot
  will land before committing.
- **HUD** — a health bar. Plain information display, not instruction — this
  doesn't violate the no-tutorial rule.

## Key decision already made

**Flat procedural shapes (rects/circles/polygons drawn in code), not
sourced sprite images.** Fastest to build and iterate for a one-week build,
and color/shape changes are the clearest wordless way to telegraph an
attack — sprite art with animation frames would cost real time for no gain
given the no-text constraint anyway.

## Verification

No automated test expected here. Verify visually at both marking viewports
(1920×1080 and 390×844) — check the telegraph is readable at phone size,
not just desktop.
