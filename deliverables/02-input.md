# Deliverable 2 — Input handling

**Recommended model: Sonnet.** The spec below is concrete and mirrors
desktop/touch 1:1 — no open design decision left to make while coding.

## What this covers

`src/scripts/game/input.ts` — a single `InputState` that both keyboard+mouse
and touch feed into the same way, so `game.ts` never has to know which
input method is active:

```
{ moveX, moveY, jumpPressed, aiming, aimVector, fireWeb }
```

## Desktop (keyboard + mouse)

- A/D → `moveX`, S → `moveY` (down only)
- W → `jumpPressed`
- Mouse-down + drag on the canvas → `aiming = true`, `aimVector` = drag
  vector; mouse-up → `fireWeb` event with the final `aimVector`

**Amended after playing.** The brief above originally read "WASD →
`moveX`/`moveY`, Space → `jumpPressed`". Jump moved to W and Space was
unbound, so the whole movement set is one hand on one key cluster. That
costs the keyboard its "up", which the wall climb used, so climbing became
*by contact*: holding into a wall is what drives it (`physics.ts`,
`stepFree`). The two changes pay for each other — the press that carries you
into a wall now carries you up it and over the top, where before you needed
D to stick, W to climb, and D again to clear the ledge.

Consequence worth stating: **mid-swing rope reeling is touch-only.** With no
keyboard "up", reeling from `moveY` would have offered S-to-lengthen and
nothing to shorten — and a rope that can only get longer is a one-way
ratchet, since a few taps of S pin the player at max length with no key to
undo it. Half a mechanic is worse than none, so `InputState` gained a
separate `reel` axis that only the joystick fills, and desktop swings on a
fixed-length rope. Reeling isn't one of the movement verbs `CLAUDE.md`
names, so it didn't earn a fifth key outside the cluster.

`spec/rope-length.test.ts` pins that split, because "the keyboard
deliberately cannot do this" is the kind of decision a later change undoes
by helpfully wiring `moveY` back in.

## Touch (phone viewport, 390×844)

Three fixed zones, mirroring the desktop input *shape* (a continuous move
input, a discrete jump tap, a discrete aim-drag-release) so behavior
transfers with zero on-screen text:

- **Bottom-left: floating joystick.** Appears wherever the thumb first
  touches (not a fixed dead spot); show a faint always-visible resting ring
  by default so the touch zone has some affordance even before it's used.
- **Bottom-right corner: small dedicated jump button.** A plain circle,
  visually the universal "jump" shape — this avoids any tap-vs-drag
  ambiguity, so no minimum-drag-distance threshold is needed for it.
- **Rest of the right half: drag-to-aim zone.** Press-drag-release fires the
  web, same as the desktop mouse-drag; draw the trajectory arrow while
  dragging (feeds the render deliverable).

Use **Pointer Events** (`pointerdown`/`pointermove`/`pointerup`), not
separate mouse/touch listeners — Chrome's DevTools device-toolbar touch
emulation dispatches through the same pointer event path, and it keeps one
code path for both input methods.

## Detecting which layout to show

Show the mobile control zones when `matchMedia('(pointer: coarse)')`
matches, or the viewport is narrow — don't hide them purely on
`window.innerWidth` alone since the DevTools emulation is what marking
actually uses; verify against the real device-toolbar iPhone preset
(390×844), not just a resized desktop window.

## Verification

Test both paths manually at the two marking viewports (see deliverable 11).
No automated test is expected here — the one focused test in this project
targets `web.ts`'s `resolveWebTarget` instead.
