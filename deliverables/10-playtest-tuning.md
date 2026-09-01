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
