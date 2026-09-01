# Deliverable 5 — Enemies and their projectiles

**Recommended model: Sonnet.** Mechanical once the rules below are fixed;
no open design judgment beyond what's already decided.

## What this covers

`src/scripts/game/entities.ts` — the `Enemy` and `Projectile` parts (the
`Player` type can live here too, but its behavior is mostly driven by
`physics.ts`/`input.ts`).

Each level has one boss-style enemy with its own attack pattern rather than
one generic enemy reused everywhere with just bigger numbers. Model each as
a discriminated union so `game.ts`/`render.ts` can switch on `kind`:

```
Enemy =
  | { kind: 'doc-ock', position, health, armReach, throwCooldownMs, ... }
  | { kind: 'venom', position, health, leapCooldownMs, leapDamage, ... }
```

All share: `health` (removed when a resolved web shot hits them — `type:
'enemy'` from deliverable 4), and a telegraph-before-attack pattern (still
mandatory — see Fairness constraint below).

### Level 2 — Doc Ock (melee reach + thrown blocks)

Two attacks, both must telegraph clearly since this is the player's first
combat encounter:

1. **Extended-arm melee** — when the player is within `armReach` (further
   than a normal melee range, since it's his four robot arms), the arm
   visibly extends over a wind-up (`telegraphMs`), then snaps to full reach
   — colliding with the player deals damage. Dodge by moving/swinging out
   of `armReach` before the snap completes.
2. **Thrown blocks** — on a separate cooldown, lob a `Projectile` on a
   **parabolic** arc (not the straight line a generic turret would use)
   toward the player's position at throw time. Slow enough, and the arc
   predictable enough, that a player can read where it will land and step
   or swing away — this is the "dodge" the user asked for, not a counter
   via the web.

### Level 3 — Venom (leap attack)

Unlike Doc Ock, Venom **moves** — this is the first mobile enemy:

- Idle: stays roughly in place / patrols a small range.
- Telegraph: a clear crouch/wind-up pose held for `telegraphMs`.
- Leap: launches fast toward the player's position at the moment the
  telegraph ends (ballistic, like a big jump, not a straight teleport) —
  high `leapDamage` on contact. After landing, a cooldown before it can
  telegraph again, during which it's a normal, harmless silhouette to give
  the player a genuine breather.
- The wide, obvious telegraph plus the movement/swing mechanic already in
  place gives the player a real out (swing away, don't just stand still) —
  this is the "two mechanics interacting" the brief rewards, now showing up
  in a boss fight rather than a traversal puzzle.

### Shared: hit by the web

Any enemy hit by a resolved web shot (`type: 'enemy'`) takes web damage;
`health` reaching 0 removes it. Single-hit-kill is simplest and fine here,
but a boss can reasonably take 2-3 hits if that reads better once you
playtest it.

## Difficulty ramp

Difficulty now ramps by **which boss you face**, not just numeric scaling of
one enemy — Doc Ock's ranged blocks are dodgeable and telegraphed generously;
Venom hits harder and adds movement. Each is still a single new thing to
learn per level, taught entirely by its own obvious telegraph and the level
geometry around it (see deliverable 6) — no text, no modal.

## Fairness constraint

Every attack's telegraph must be long/clear enough that a first-time player
who's never seen this enemy before can react to it — arm-extend, block-arc,
and leap wind-up all need their own readable tell (see deliverable 7). This
can't really be judged from code — it's a playtest call (candidate for the
deliverable 10 evidence requirement: telegraph duration is exactly the kind
of thing you only learn is too short by getting hit unfairly in actual
play).

## Interacts with

- `level.ts` (deliverable 6) supplies the per-level enemy configs.
- `render.ts` (deliverable 7) draws the telegraph/fire/projectile visuals.
- `game.ts` (deliverable 8) applies health changes and checks loss.
