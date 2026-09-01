# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so the deployed head is the only place a broken one shows up.

## What we're building this week

A browser game: one context-sensitive action (aim and shoot a web) that
swings you between rooftops when it hits a wall, and damages an enemy when
it hits one instead. Movement is otherwise WASD + jump + wall-climb by
contact. No tutorial, no instructions screen — the opening view has to make
the first move obvious on its own. A few short levels, enemies that get
faster/harder as you progress, and a clear win (reach the final door) and
loss (health hits zero, or you fall off the map).

Deliverables for the week, roughly in build order:

1. ~~Game scaffolding (canvas, game loop)~~ — done
2. ~~Input handling (keyboard on desktop, joystick + jump button + drag-to-aim
   on touch)~~ — done
3. ~~Movement and swing physics (feel)~~ — done (constants still to be tuned
   by playing, in deliverable 10)
4. Web targeting (deciding what a shot hits: wall vs. enemy vs. nothing)
5. Enemies and their projectiles
6. Level layouts (a small number of levels, increasing difficulty)
7. Rendering, characters/graphics, and HUD (player/enemy visuals, health
   bar, telegraphing enemy attacks)
8. Game state (health, win/lose, level progression)
9. One focused automated test on a mechanical rule
10. A tuning change driven by actually playing the finished build, not by
    reading the code
11. Verifying controls at both marking viewports

Technical detail for each deliverable (architecture, file layout, data
formats) is not in this file — it lives in `deliverables/`, one markdown
brief per deliverable, loaded in only when working on that deliverable.

Mark a deliverable as complete in the list above, once we have finished it.

## Running tests

Run `pnpm test` / `pnpm check` / `vitest` on your own initiative — no need to
ask first. Always run them for large changes and before committing; for small
in-progress edits, running the build/typecheck alone is fine.

## Playing the build

`pnpm dev` serves under the base path, so the game is at
`http://localhost:4321/comp4020-crit5-BilalM004/` — bare `localhost:4321`
renders the page shell without the game.

**A blank canvas is usually a stale dev server, not a bug in the code.** This
repo sits on `/mnt/c`, a WSL2 drvfs mount where inotify never fires, so a
long-running server keeps serving the module graph it started with. The config
now polls, but if a change doesn't appear, confirm what is actually being
served before debugging the source:

```
curl -s http://localhost:4321/src/scripts/main.ts | head -20
astro dev stop && pnpm dev   # when it is stale
```

Checking the served bytes first is the cheap step; it beats re-reading physics
that was already correct.

## The checks

`pnpm check` runs them, and `pnpm check:evidence` is the extra gate before you
ship. CI runs the same plus links, secrets and the deploy.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.
