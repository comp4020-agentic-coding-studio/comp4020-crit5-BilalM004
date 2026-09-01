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
3. ~~Movement and swing physics (feel)~~ — done, playtested and signed off.
   Two rounds of that playtest changed real behaviour rather than numbers:
   a web fired from the ground died in one tick (`1b1001d`), and swinging
   into a wall froze the player against it (`5f2e352`). Constants were then
   tuned from play (`2f8cc91`); more may move in deliverable 10 once there
   is a finished build to play. A third behaviour bug turned up while
   building deliverable 4 and got fixed in `physics.ts`: a web fired
   straight up at a close overhead platform reached it and then dropped
   instantly, because the zip's apex handoff treated "arrived, half a
   player-height short of the anchor" the same as a fire-time "too close to
   swing on" refusal. Fixed by letting only that handoff clamp up to
   `minRopeLength` instead of refusing (`spec/web-ceiling.test.ts`).
4. ~~Web targeting (deciding what a shot hits: wall vs. enemy vs. nothing)~~ —
   done. `web.ts`'s `resolveWebTarget` is a pure ray-vs-AABB targeting
   function (slab-method intersection, no marching), wired into `main.ts` in
   place of the deliverable-3 placeholder. Enemy targeting now exercises real
   enemies — see deliverable 5.
5. ~~Enemies and their projectiles~~ — done. `entities.ts`'s `DocOckEnemy` and
   `VenomEnemy` are a discriminated `Enemy` union, each a config object
   (tunable numbers, level.ts's future per-spawn input) plus runtime state
   (phase, timers), the same split physics.ts uses for
   `PhysicsConfig`/`PlayerState`. Doc Ock's melee and thrown-block attacks run
   as two independently-cooldowned tracks that never telegraph at once, so
   the fairness constraint (one readable tell at a time) holds structurally
   rather than by convention. Both the thrown block and Venom's leap reuse
   one `ballisticVelocity` helper — a fixed-flight-time solve rather than a
   fixed-angle one, so the same function produces a slow readable arc and a
   fast leap. Wired into `main.ts` in place of the deliverable-4 empty enemy
   list. Manual playtest (drag-fire at Doc Ock from `pnpm dev`) caught a
   placement bug the type checker couldn't: Doc Ock's spawn `y` sank it 48px
   into the rooftop platform, which also meant every web shot aimed at its
   body hit the platform behind it first, on the "walls beat enemies on a
   tie" rule — fixed by deriving the spawn from the platform's own `y`
   instead of a guessed constant.
6. ~~Level layouts (a small number of levels, increasing difficulty)~~ — done.
   `level.ts` is three levels of pure data (Rooftops / Doc Ock / Venom), wired
   into `main.ts` behind a placeholder level cursor so all three can be walked
   end to end — the only way a layout can be verified at all.

   Every distance was **measured by headless simulation against the tuned
   physics**, not guessed, because "too wide to jump" is a number the constants
   decide: jump height 109px, longest jumpable flat gap ~211px, and a pumped
   swing crosses 400px on ~55% of naive attempts. So a gap is either ≤170
   (a jump) or ≥420 (a web shot) — an "almost jumpable" gap is the one width
   that teaches nothing. Three findings changed the design rather than the
   numbers:

   - **Gaps were a staircase, not a hazard.** The first measurement said a
     380px gap was jumpable; the tick trace showed why it wasn't — the player
     falls in, contacts the *far* building's side face ~370px down, wall-clings
     and climbs out. Any gap was a slower path, not a loss. Fixed structurally:
     `killPlaneBelow()` derives `killPlaneY` as `max(y + h) + 60` so the plane
     always sits under every building, which also makes the rule readable with
     no text (the buildings stop; below that there is nothing to hold).
   - **Hand arithmetic said a climbed wall couldn't be topped out** (~2px
     short). The simulation said otherwise: the cling breaks ~38px below the
     lip and coast + air control lands the player on top. Trusting the sim over
     the arithmetic is what made the door towers (a required climb) viable.
   - **Arena furniture is overhead-only.** A floor pillar in Doc Ock's arena
     would read as cover but silently eat every web shot aimed at him, on the
     same "walls beat enemies on a tie" rule that bit deliverable 5 — the same
     bug rebuilt into level geometry. Beams at y≈290 sit above every
     player-to-boss sightline; verified 0 shots stolen (23/23 and 24/24 clear).

   Two smaller structural choices: `spawnEnemies` is a **factory**, not an
   `Enemy[]`, so retrying a level never inherits the last attempt's half-dead
   mid-telegraph boss; and `standing(platform, x, height)` derives spawn `y`
   from the platform's own top, re-encoding deliverable 5's fix so it can't
   regress. The brief expects no test here, so `spec/level-placement.test.ts`
   went in as a **sensor**, not a contract test: nothing is placed inside a
   wall, nothing floats, the kill plane is below the geometry, enemies are
   fresh per load. Mutation-checked by re-introducing the 48px sink — it fails
   and names the offender.

   `spec/game-loop.test.ts` needed a fix, in the sensor rather than the game:
   it had only ever passed by accident, because the scratch layout spawned the
   player mid-air so the world moved on its own. A real level spawns them
   standing, and a standing player in an idle world paints the same frame
   forever — indistinguishable from a frozen accumulator. It now holds a
   movement key, so it asserts input reaches the simulation *and* the
   simulation advances.
7. Rendering, characters/graphics, and HUD (player/enemy visuals, health
   bar, telegraphing enemy attacks).

   **The camera is done, ahead of the rest of this deliverable.** It was a
   plain translation, which quietly made the viewport a difficulty setting:
   at the two marking viewports (1920x1080 and 390x844) desktop saw ±960px of
   world and the phone ±195px, a 4.9x advantage, and on a phone *every* anchor
   and both bosses were off-screen at spawn in levels 2 and 3. It now scales:
   `VIEW_H = 860` sets the zoom from viewport height, and `MIN_VIEW_W = 800`
   overrides it only when the screen is narrow enough to crop sideways, so a
   portrait phone zooms out instead of cropping. Desktop sees 1529x860 world,
   the phone 800x1731 — a 1.9x spread, down from 4.9x — and every landmark is
   in frame at both. Aim needed a `screenToWorld`; a drag vector didn't,
   because uniform zoom divides both components by the same scale.

   A measured sweep showed the camera alone **cannot** fix this: framing
   Venom at his old +657px on a 390px screen needs a zoom that renders the
   player 11px tall. So the last of it was spawn placement — level 2's start
   moved 700→900 and level 3's Venom 780→520, each chosen to preserve what
   deliverable 6 measured (Doc Ock's retreat room is measured from *him*, not
   the spawn; level 3's parapet only says "go right" if the player starts
   beside it).

   **Carried into the rest of this deliverable:** the phone renders the player
   ~20px tall and Doc Ock ~31px wide. That is the binding constraint on the
   telegraph work the brief calls the primary no-tutorial fairness mechanic —
   a colour shift will survive that size, a subtle pose change will not.
   Deliverable 11 confirms it on a real device toolbar.
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

Run `pnpm test` / `pnpm check` / `vitest` freely, on your own initiative —
never ask first. For a minor, in-progress edit, `pnpm build`/`pnpm typecheck`
alone is enough; run the full `pnpm check` for anything larger, and always
before committing.

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
