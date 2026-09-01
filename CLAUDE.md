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
7. ~~Rendering, characters/graphics, and HUD (player/enemy visuals, health
   bar, telegraphing enemy attacks)~~ — done. `render.ts` draws everything
   procedurally (rects/circles/polygons in code, no sprite images): a posed
   Spider-Man, a caged Doc Ock, a hulking Venom, and a HUD of health bar +
   level pips + level name.

   **The camera went first.** It was a
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

   That measurement set the binding constraint for everything after it: the
   phone renders the player ~20px tall and Doc Ock ~31px wide, so a colour
   shift survives and a subtle pose change does not.

   **Then the characters, and this is where the deliverable was actually
   decided: every real defect was invisible in the code and obvious in a
   magnified screenshot.** The figures type-checked, drew, animated and read
   fine in my head; a Playwright sweep at both marking viewports (crops
   magnified via `deviceScaleFactor` up to 8x, `?level=N` to reach the bosses
   headlessly) is what showed that most of them were wrong. Four findings
   changed how the renderer is built, not just its numbers:

   - **A colour flash has to be on a mass, not a line — and on a mass the hue
     must hold while the *value* moves.** Doc Ock's melee had a reach ring and
     a pose but no "right now", because its only colour change was on 1.3px
     tentacle strokes, which at phone zoom is a flicker the eye never catches.
     The coat (~19px of solid area at the same zoom) now flashes for *both*
     attacks, orange for melee to agree with the ring and yellow for the
     throw. The first flicker paired each warning colour with a near-white
     one; on a 2px rim that is fine, and on the coat he simply looked like he
     was changing outfits. Both pale members were replaced with saturated deep
     tones, so the eye reads "warning" through the whole cycle.
   - **The primary fairness mechanic was pointing at empty sky.** The melee
     pincers aimed at `base + dir * len` where `base.y = -46` and `dir` was
     normalised from a feet-origin vector, so the one tell that says "this is
     where it lands" landed a whole 46px above the player's head. Fixed as a
     fraction *along* the target vector, capped at `armReach * 0.82` so the
     tips stop short when he winds up at something out of range.
   - **Silhouette beats detail, because at phone size `detail` is off.**
     Doc Ock's tentacles ran up-and-outward at 45° with a three-fingered claw
     on each end, which is a man holding both hands up — and read loudest
     during the melee telegraph, when they turned yellow and the fingers
     spread. The fix was shape, not colour: arcs that come back *down* below
     the shoulders (an arm that comes back down is not a raised arm), a cased
     limb rather than a tapering one, and a two-prong pincer, because a tool
     on the end of an arm is a machine and a hand is not. The segment bands
     vanish on a phone; the arch still reads.
   - **Motif loses to mass at these sizes.** Three separate emblems had to
     shrink or bend: a 7.4x5 spider on a 13px chest is a hole, not a spider,
     and six straight bars off a white oval is a ribcage — a different monster
     entirely, on the one character whose emblem *must* read as a spider.

   The player needed a further eight fixes of the same kind, all found the same
   way and all invisible to the type checker: a 24%-of-body head merging into
   a same-width same-colour chest (one red blob at 20px), arms rooted at the
   centreline rather than at shoulder *joints* so every pose crossed the chest
   to get anywhere, no neck or jawline separating red head from red torso, a
   ±3px stance whose front-leg halo swallowed the back leg into one blue tube,
   mask webbing whose round line caps poked out of a 9px head as a matched
   pair of horns, and eyes overlapping by 0.3px into a single visored band.
   The shoulder-joint fix is the one worth remembering: it cost two lines and
   corrected every pose at once, where the alternative was correcting each
   pose separately and forever.

   Also fixed as a no-tutorial defect rather than a graphics one: at 390x844
   the touch controls are two identical grey circles, and the game may not say
   which is which. The jump button now carries a chevron drawn from its own
   CSS borders — no font, no asset, no markup change, nothing for CI to miss.

   `spec/game-loop.test.ts` took two changes, both in the sensor. Its
   recording context gained `clip()`, which the renderer started calling; the
   absence was worth having, because that stub throws on a method it doesn't
   know rather than silently recording half a frame. More importantly its
   "the world advanced" assertion became a *magnitude* (>4px) rather than
   inequality: this deliverable added wall-clock decoration (breathing, sway,
   twinkle) that keeps moving while a frozen accumulator paints the same world
   forever, so plain inequality would have gone green on exactly the bug the
   sensor exists to catch.

   **Carried forward:** the phone-size constraint above is now a measured
   fact, not a prediction, and the verification loop that found all of this —
   screenshot at both viewports, magnify, *read the frame* — is the only thing
   that caught any of it. Deliverable 11 confirms on a real device toolbar.
8. Game state (health, win/lose, level progression) — **mostly done, out of
   order**, because a play-feel request landed that could not be answered
   without it: a web-shot animation, a third enemy, a real difficulty curve,
   and health that carries between levels. What exists now:

   - **Health is a run resource.** It carries level to level and only a fresh
     run refills it, so clearing level 2 at 12 health is a different level 3
     from clearing it at 80. The corollary is forced, not chosen: death has to
     restart the *run*, because a level-only retry with carried health
     respawns you at the health that just killed you, forever. Falling and
     bleeding out are deliberately the same outcome — two losses with
     different costs would push the player toward the cheap one.
   - **The door is locked until the level is clear.** Without that gate every
     enemy is optional (the fastest route past a gunman is to swing over him),
     and an enemy you can ignore is scenery rather than difficulty. The lock is
     drawn as a *different object*, not a dimmed one: no glow at all, cold grey
     instead of gold, three heavy bars across the opening. With no tutorial, a
     door that quietly does nothing reads as broken, and "broken" is the one
     conclusion the player must not reach; bars say *why* as well as *what*,
     and the unlock is then the largest single visual change in the game.
   - **A third enemy, the gunman**, deliberately the plainest figure in the
     game. The two bosses are encounters; he is furniture with a trigger —
     stationary, one telegraphed line of fire, and the dodge is "do not be on
     that line when it finishes". He is also the cheapest possible teacher for
     *the web hits enemies too*: level 1 puts one across the gap with nothing
     else on that roof. His aim point locks at the **start** of the wind-up,
     where both bosses re-measure at the end — that inversion is the whole
     reason two of them at once is fair rather than a firing squad.
   - **The web shot animates.** It used to be instantaneous, which for the
     swing was survivable (the rope is its own feedback) but left the game's
     one offensive action with *no* animation at all — the only evidence a shot
     happened was a health pip going out, 14px above a head nobody is looking
     at. One `drawWebStrand(from, to, progress)` now draws both the rope and a
     shot in flight, which is not a saving but the reason the two read as one
     mechanic.

   Three findings worth keeping:

   - **Travel time cannot be allowed to delay the swing.** Deferring
     `attachWeb` to the strand's arrival would change deliverable 3's signed-off
     feel *and* open a real bug: the player keeps moving during the flight, so
     by arrival they can be outside `maxRopeLength`, where `attachWeb` silently
     refuses and the shot does nothing at all. So there are two commit times
     behind one animation — an anchor commits at fire and the strand catches up
     to a rope that already exists; an enemy or a miss commits on arrival,
     which is the case where travel time is the point. The player sees one
     mechanic; only the physics can tell them apart.
   - **Feedback flashes must not look like warnings.** A web hit lights a white
     halo *behind* the enemy. White because every other flash in the game is a
     warning the player must read, and this is the one signal going the other
     way; behind and outside the silhouette because tinting drawn pixels means
     compositing against a canvas that is opaque everywhere, which would wash
     the sky as readily as the enemy.
   - **A palette is chosen against the background, not against the cast.** The
     gunman started cold blue-grey on the reasoning that Doc Ock owns green and
     Venom owns black-and-white. The screenshots killed it: `#3b4664` is within
     a few points of `ROOF` (`#3a4770`) and `FACADE` (`#28324f`), and the sky
     behind him is `#182046` — so a "sensibly" coloured enemy was a man-shaped
     piece of architecture, dim on desktop and nearly gone at phone scale. Warm
     brown is the only family the city does not already use. The same crop
     caught a same-tone neck merging his head into one pale wedge (deliverable
     7's jawline lesson, rediscovered); a shadow-toned neck under a collar
     fixed it.

   Difficulty was tuned **without moving deliverable 6's measured geometry**.
   The 1140px arena floor is untouched; Doc Ock's throw flight time went
   1.4 → 1.05, which *reduces* the dodge cost from 448px of running to 336px,
   so the measured room still fits a much faster boss.
   Venom's telegraph floor is 350ms — below ~300ms a wind-up is a coin flip,
   which would break the no-text fairness argument — and his `recoverMs` moved
   *against* difficulty on purpose, because it is the only window in which the
   player can safely aim a web at him. Every gunman is placed against the
   targeting rule that has now bitten twice (walls beat enemies on a tie, so
   anything on the player-to-boss ray silently eats shots): level 2's stands
   across the exit gap rather than in the arena, and level 3's are past Venom's
   patrol and on the landing roof. `spec/level-placement.test.ts` covers all
   six new spawns for free.

   A **second tuning pass** then landed on top of it, from play: longer enemy
   reach (the bosses especially), significantly more damage and movement, more
   enemy health, and a weaker web. Three of the five were straightforward
   number moves. The other two each turned out to be a structural problem.

   - **"More health" and "weaker web" were the same knob.** Enemy `health` was
     a hit counter — `3` meant three webs — so "how tanky is this" and "how
     hard does the web hit" could not move independently, and nothing could
     weaken the web without making every enemy flimsier. Health is now in
     points on the same 100-point scale as the player's, with one
     `WEB_DAMAGE = 10` constant at the single damage call site, so
     shots-to-kill is `ceil(health / WEB_DAMAGE)`. `render.ts`'s pips were
     re-derived from that rather than from health, because pips drawn per point
     would put eighty slivers over an 80-health boss; they still read "how many
     more shots". Shots-to-kill went 1 / 4 / 2 / 4 → 1 / 7 / 3 / 8, with level
     1's gunman deliberately left at one.
   - **The camera puts a hard ceiling on attack range, and it is 400px.**
     Deliverable 7's `cameraScale` means a 390x844 phone sees exactly 400 world
     px either side of the player, so a telegraph that *begins* further out than
     that begins off-screen — the wind-up is the entire reason a leap is fair.
     I ignored this and took Venom's `aggroRange` to 560; the phone frame
     refused it, showing him off the right edge at spawn with nothing on screen
     but a sliver of his pips. So range was split in two: `aggroRange` (410,
     where he commits) and a new `chaseRange`/`chaseSpeed` (880, where he
     *notices* and starts walking at you). That is a bigger increase than 560
     would have been — the distance from which he is a threat roughly doubled,
     and the distance from which he can hit you with no warning did not move.
     Doc Ock got the same treatment from the other end: he had no movement at
     all, so `walkSpeed`/`advanceRange` turn his enlarged reach ring from a
     static no-go zone into pressure that follows. He stops at 85% of
     `armReach` (a boss standing on top of his own ring makes "safe" a place
     you cannot reach) and holds still through both wind-ups, because both
     attacks resolve from where he stands *at the snap* — a boss who walked
     during his own telegraph would eat the distance the telegraph just paid
     the player.

   One bug and one wrong claim, both found by simulating rather than reasoning:
   Venom's roam box bounded only his *walk*, so an unclamped leap could land
   him hovering in open sky over the 480px gap (measured `x 15..1101` against a
   stated 180..906). Clamping the leap's landing rather than refusing the leap
   keeps the attack and reads as a short lunge. And I had written that the box
   stops him "eating the shots meant for" the roof gunman — untrue: unlike a
   wall, an enemy on the ray still takes the damage, so a body in the way is a
   redirect, not a theft. Only walls steal.

   **Still owed by this deliverable:** a legible *win*. Reaching the final
   door currently starts a fresh run with no acknowledgement, which is
   progression without an ending.
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
