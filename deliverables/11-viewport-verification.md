# Deliverable 11 — Verifying controls at both marking viewports

**Recommended model: Sonnet**, following the input.ts spec (deliverable 2);
escalate to Opus only if the touch layout genuinely feels wrong and needs a
redesign, not just a small tweak.

## What this covers

The brief marks at two fixed viewport sizes in the latest stable Chrome,
reproduced via Chrome DevTools' device toolbar — not a resized browser
window:

- **1920×1080** — desktop. Keyboard (WASD/Space) + mouse-drag aim.
- **390×844** — phone (the iPhone preset in DevTools' device toolbar), with
  touch emulation on. Joystick + jump button + drag-to-aim (deliverable 2).

## What to check

- Both input paths actually work end-to-end: move, jump, wall-stick, aim,
  fire, swing, damage an enemy, take damage, fall/lose, reach the door/win.
- The opening screen makes the first move obvious with **zero text** at
  both sizes — what's legible on a 1920×1080 screen has to still be legible
  and reachable on 390×844.
- The enemy telegraph (deliverable 7) reads clearly at phone size, not just
  desktop.
- Nothing overlaps or clips at either size (joystick/jump-button placement,
  HUD, canvas bounds).

## Not automated

This is manual verification, not a test file — the one automated test in
this project is `spec/game.test.ts` (deliverable 9), which is unrelated to
viewport size.
