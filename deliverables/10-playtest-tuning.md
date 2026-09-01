# Deliverable 10 — A tuning change driven by playing

**Recommended model: Sonnet** for the edit itself — the judgment here is
yours, from actually playing the finished build; the model's job is just to
apply whatever you decide needs to change.

## What this covers

The brief requires evidence that "one change you made came from playing the
finished game rather than reading its code." This deliverable is that: play
the finished (or near-finished) build yourself, find one thing that only
reveals itself through play, and change it.

## Candidates (pick whichever actually needs it — don't pre-decide)

- Touch drag-distance feel / aim responsiveness on the phone viewport.
- Web max range (too easy or too restrictive to reach anchors/enemies).
- Jump height / gravity strength (from `physics.ts`, deliverable 3).
- Enemy telegraph duration (from `entities.ts`, deliverable 5) — too short
  feels unfair, too long feels slow.
- Enemy fire-rate/damage ramp across levels (from `level.ts`, deliverable
  6) — too steep or too flat a difficulty curve.

## What to do with it

Once you've made the change, note it (with a commit citation) in
`PROCESS.md` when you write that up — it's one of the strongest kinds of
evidence the brief asks for, precisely because it can't be faked by reading
the code.

## Log

Kept here as it happens, so `PROCESS.md` can cite it rather than
reconstruct it later. Tuning that came from play, not from reading code:

- **`2f8cc91` — `crashSpeed` 420 → 900, `zipImpulse` 760 → 1050.** Reported
  from playing: crashes fired too readily, and a web shot at a wall didn't
  pull hard enough toward it. Neither was visible in the code, and both had
  passed every numerical check — `crashSpeed` in particular had a test
  proving the crash worked, which is exactly why nothing caught that it
  fired on essentially *every* swing.

  Worth recording as method, not just outcome: "too sensitive" is a claim
  about a distribution, so the fix was to measure the distribution first.
  Pumped swings arrive at a wall at 387–1038px/s, which put the old
  threshold underneath almost all of it. The measurement also killed a
  plausible-looking option — raising `zipLift` does nothing at this impulse,
  because a typical shot's own vertical component already clears the floor.

- **`a94d658` — Doc Ock's `meleeCooldownMs`/`throwCooldownMs` now start at
  1000ms instead of 0.** Found by playing: reloading level 2 and
  screenshotting immediately caught him already mid-telegraph on the very
  first frame after the arena loaded — before the no-tutorial player had
  even registered he was there. Invisible in the code, because
  `createDocOck` zero-initializing both cooldowns reads as "ready to act
  the moment he's relevant," not "acts before the player can react." The
  throw branch has no `armReach`-style range gate the way melee does, so a
  zero cooldown let him open on a player who hadn't looked yet, from any
  distance.

  The fix is a beat longer than his own longest telegraph
  (`meleeTelegraphMs`, 650ms), which guarantees an idle sighting window
  before either tell can start. Verified live, not just typechecked:
  reloading the level shows him standing idle at t=0 and t=500ms, with the
  first telegraph only appearing at t=1100ms.
