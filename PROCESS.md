# Process overview

## What I built

A browser game built on one context-sensitive action: aim and fire a web, which
swings you between rooftops when it hits a wall and damages an enemy when it
hits one instead. Three short levels, two bosses, no tutorial text — the opening
frame has to teach the web on its own.

## The moments that mattered

**A blank canvas that wasn't a bug.** The obvious move was re-reading the
physics I had just written; instead I `curl`ed the served module and found the
deliverable-1 stub. `/mnt/c` is a WSL2 mount where inotify never fires, so the
dev server was serving stale bytes. Vite now polls — but the durable half is the
rule in `CLAUDE.md`, so the next blank canvas costs a curl, not an hour spent
debugging correct code.
[`f876822`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-BilalM004/commit/f876822)

**A freeze with no symptom.** The accumulator was seeded from `performance.now()`
but fed rAF timestamps; when those disagree `update()` stops while `draw()` keeps
painting — a frozen game that looks alive and reads as a physics bug. The fix was
three lines. What matters is `spec/game-loop.test.ts`, a sensor asserting the
world *changes* without asserting what is drawn, so it outlived the layouts and
renderer replacing underneath it. I confirmed it bites by reverting the fix.
[`58b4adc`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-BilalM004/commit/58b4adc)

**The same rule biting twice.** Doc Ock spawned 48px inside a roof, so every shot
aimed at him hit the platform behind — walls beat enemies on ties. Rather than
patch the number I derived spawns from the platform, then found the same bug
waiting in level geometry: a floor pillar would read as cover and silently eat
every shot. Arena furniture is now overhead-only, and the placement audit became
a mutation-checked sensor.
[`0c2a031...27ca465`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-BilalM004/compare/0c2a031...27ca465)

## Where this stands

Deliverables 1–6 are done. The cold playtest deliverable 6 asks for is a human
step and hasn't happened; those layouts are verified by simulation, not by play.
