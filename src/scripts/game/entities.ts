// Enemies and their projectiles. No canvas, no DOM, no dependency on
// physics.ts, level.ts or game.ts — same discipline as physics.ts and web.ts:
// a step function is a pure function of (state, playerHitbox, dt), so
// deliverable 9 can test a telegraph or an arc with plain literals, and
// game.ts (deliverable 8) is the only place damage actually lands on a
// player's health.
//
// Each boss gets its own tunable config object (DocOckConfig/VenomConfig)
// separate from its runtime state, the same split physics.ts uses for
// PhysicsConfig/PlayerState — level.ts (deliverable 6) hands each spawn one of
// these, and a deliverable-10 tuning pass is a diff to a config literal, not a
// hunt through the state machine.
//
// Units: seconds for dt (matches physics.ts's stepPlayer), but the *config*
// fields that name a duration use "Ms" (armReach, throwCooldownMs, ... — the
// brief's own naming), because a telegraph window is a design number a
// non-programmer playtester might be told about, and "650ms" reads better than
// "0.65". Runtime elapsed counters are kept in the same unit as the config
// they're compared against.

import type { Rect, Vec2 } from "./geometry";
import { overlaps, rectCenter } from "./geometry";

export const DOC_OCK_W = 64;
export const DOC_OCK_H = 88;
export const VENOM_W = 46;
export const VENOM_H = 70;
export const PROJECTILE_W = 22;
export const PROJECTILE_H = 22;

/** What a step function needs from the player — a structural subset of
 *  physics.ts's PlayerState, the same way web.ts's WebTargetEnemy lets
 *  entities.ts's real Enemy pass through untouched. */
export interface TargetPlayer {
  hitbox: Rect;
}

let nextId = 0;
function makeId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

// --- Ballistic arcs ---------------------------------------------------------
//
// Shared by Doc Ock's thrown blocks and Venom's leap: both are "aim at where
// the player's target point is, then follow gravity" rather than a straight
// line. Solving for a fixed flight time (not a fixed launch angle) is what
// lets the same helper produce a slow, readable block arc and a fast leap just
// by varying flightTime.

/** Velocity needed to travel from `from` to `to` under `gravity` in exactly
 *  `flightTime` seconds. */
export function ballisticVelocity(from: Vec2, to: Vec2, gravity: number, flightTime: number): Vec2 {
  return {
    x: (to.x - from.x) / flightTime,
    y: (to.y - from.y) / flightTime - 0.5 * gravity * flightTime,
  };
}

// --- Projectile -------------------------------------------------------------

export interface Projectile {
  id: string;
  kind: "block";
  /** Top-left of the hitbox, matching the player/enemy convention. */
  position: Vec2;
  vel: Vec2;
  gravity: number;
  damage: number;
  /** Seconds since thrown. */
  elapsed: number;
  /** Seconds until it lands (and should be despawned) if nothing is hit first. */
  flightTime: number;
}

export function projectileHitbox(p: Projectile): Rect {
  return { x: p.position.x, y: p.position.y, w: PROJECTILE_W, h: PROJECTILE_H };
}

export interface ProjectileStepResult {
  hitPlayer: boolean;
  /** True once the projectile hit or reached the end of its arc — either way
   *  the caller should remove it from play. */
  done: boolean;
}

export function stepProjectile(p: Projectile, player: TargetPlayer, dt: number): ProjectileStepResult {
  p.vel.y += p.gravity * dt;
  p.position.x += p.vel.x * dt;
  p.position.y += p.vel.y * dt;
  p.elapsed += dt;

  const hitPlayer = overlaps(projectileHitbox(p), player.hitbox);
  return { hitPlayer, done: hitPlayer || p.elapsed >= p.flightTime };
}

// --- Doc Ock (level 2: melee reach + thrown blocks) -------------------------

export interface DocOckConfig {
  /** Melee range — further than a normal punch, since it's four robot arms. */
  armReach: number;
  meleeDamage: number;
  meleeTelegraphMs: number;
  /** Cooldown after a melee resolves (hit or dodged) before it can telegraph again. */
  meleeCooldownMs: number;
  throwDamage: number;
  throwTelegraphMs: number;
  throwCooldownMs: number;
  /** Seconds the block takes to reach its target. Slow and predictable is the
   *  whole point — see the brief's dodge-by-reading-the-arc constraint. */
  throwFlightTime: number;
  throwGravity: number;
  health: number;
}

export const DEFAULT_DOC_OCK: DocOckConfig = {
  armReach: 140,
  meleeDamage: 20,
  meleeTelegraphMs: 650,
  meleeCooldownMs: 900,
  throwDamage: 15,
  throwTelegraphMs: 500,
  throwCooldownMs: 2200,
  throwFlightTime: 1.4,
  throwGravity: 900,
  health: 3,
};

/** Only one attack track telegraphs at a time — the fairness constraint reads
 *  "each attack has its own readable tell," not "two at once." Cooldowns still
 *  run independently underneath; they just can't both cash in simultaneously. */
export type DocOckPhase = "idle" | "melee-telegraph" | "throw-telegraph";

export interface DocOckEnemy {
  kind: "doc-ock";
  id: string;
  position: Vec2;
  health: number;
  cfg: DocOckConfig;
  phase: DocOckPhase;
  /** Milliseconds into the current phase; meaningless while idle. */
  elapsedMs: number;
  meleeCooldownMs: number;
  throwCooldownMs: number;
}

export function createDocOck(position: Vec2, cfg: DocOckConfig = DEFAULT_DOC_OCK): DocOckEnemy {
  return {
    kind: "doc-ock",
    id: makeId("doc-ock"),
    position: { ...position },
    health: cfg.health,
    cfg,
    phase: "idle",
    elapsedMs: 0,
    meleeCooldownMs: 0,
    throwCooldownMs: 0,
  };
}

export function docOckHitbox(e: DocOckEnemy): Rect {
  return { x: e.position.x, y: e.position.y, w: DOC_OCK_W, h: DOC_OCK_H };
}

export interface AttackResult {
  hitPlayer: boolean;
  damage: number;
  spawnedProjectile: Projectile | null;
}

const NO_HIT: AttackResult = { hitPlayer: false, damage: 0, spawnedProjectile: null };

function spawnBlock(from: Vec2, target: Vec2, cfg: DocOckConfig): Projectile {
  const vel = ballisticVelocity(from, target, cfg.throwGravity, cfg.throwFlightTime);
  return {
    id: makeId("block"),
    kind: "block",
    position: { x: from.x - PROJECTILE_W / 2, y: from.y - PROJECTILE_H / 2 },
    vel,
    gravity: cfg.throwGravity,
    damage: cfg.throwDamage,
    elapsed: 0,
    flightTime: cfg.throwFlightTime,
  };
}

export function stepDocOck(enemy: DocOckEnemy, player: TargetPlayer, dt: number): AttackResult {
  enemy.meleeCooldownMs = Math.max(0, enemy.meleeCooldownMs - dt * 1000);
  enemy.throwCooldownMs = Math.max(0, enemy.throwCooldownMs - dt * 1000);

  const center = rectCenter(docOckHitbox(enemy));
  const target = rectCenter(player.hitbox);
  const dist = Math.hypot(target.x - center.x, target.y - center.y);

  if (enemy.phase === "idle") {
    if (enemy.meleeCooldownMs === 0 && dist <= enemy.cfg.armReach) {
      enemy.phase = "melee-telegraph";
      enemy.elapsedMs = 0;
    } else if (enemy.throwCooldownMs === 0) {
      enemy.phase = "throw-telegraph";
      enemy.elapsedMs = 0;
    }
    return NO_HIT;
  }

  enemy.elapsedMs += dt * 1000;

  if (enemy.phase === "melee-telegraph" && enemy.elapsedMs >= enemy.cfg.meleeTelegraphMs) {
    enemy.meleeCooldownMs = enemy.cfg.meleeCooldownMs;
    enemy.phase = "idle";
    // Re-measured now, at the snap, not at telegraph start — this is the
    // dodge window: move out of armReach before the wind-up completes.
    if (dist <= enemy.cfg.armReach) {
      return { hitPlayer: true, damage: enemy.cfg.meleeDamage, spawnedProjectile: null };
    }
    return NO_HIT;
  }

  if (enemy.phase === "throw-telegraph" && enemy.elapsedMs >= enemy.cfg.throwTelegraphMs) {
    enemy.throwCooldownMs = enemy.cfg.throwCooldownMs;
    enemy.phase = "idle";
    // Toward the player's position at throw time (now), not at telegraph
    // start — a moving player changes where the block is actually aimed.
    return { hitPlayer: false, damage: 0, spawnedProjectile: spawnBlock(center, target, enemy.cfg) };
  }

  return NO_HIT;
}

// --- Venom (level 3: leap attack) -------------------------------------------

export interface VenomConfig {
  leapDamage: number;
  telegraphMs: number;
  /** How far away it aggroes into the telegraph — a leap has more reach than
   *  Doc Ock's melee, so this is a distance, not a "walk up to it" range. */
  aggroRange: number;
  /** Seconds the leap itself takes, ballistic like a big jump. */
  leapFlightTime: number;
  leapGravity: number;
  /** Cooldown after landing before it can telegraph again — the brief's
   *  "genuine breather," during which it's a harmless silhouette. */
  recoverMs: number;
  patrolSpeed: number;
  /** How far it wanders either side of where it last landed. */
  patrolRange: number;
  health: number;
}

export const DEFAULT_VENOM: VenomConfig = {
  leapDamage: 30,
  telegraphMs: 550,
  aggroRange: 260,
  leapFlightTime: 0.55,
  leapGravity: 1800,
  recoverMs: 1100,
  patrolSpeed: 60,
  patrolRange: 90,
  health: 3,
};

export type VenomPhase = "patrol" | "telegraph" | "leap" | "recover";

export interface VenomEnemy {
  kind: "venom";
  id: string;
  position: Vec2;
  vel: Vec2;
  health: number;
  cfg: VenomConfig;
  phase: VenomPhase;
  elapsedMs: number;
  patrolOrigin: Vec2;
  patrolDir: 1 | -1;
}

export function createVenom(position: Vec2, cfg: VenomConfig = DEFAULT_VENOM): VenomEnemy {
  return {
    kind: "venom",
    id: makeId("venom"),
    position: { ...position },
    vel: { x: 0, y: 0 },
    health: cfg.health,
    cfg,
    phase: "patrol",
    elapsedMs: 0,
    patrolOrigin: { ...position },
    patrolDir: 1,
  };
}

export function venomHitbox(e: VenomEnemy): Rect {
  return { x: e.position.x, y: e.position.y, w: VENOM_W, h: VENOM_H };
}

function stepPatrol(enemy: VenomEnemy, dt: number): void {
  enemy.position.x += enemy.patrolDir * enemy.cfg.patrolSpeed * dt;
  const offset = enemy.position.x - enemy.patrolOrigin.x;
  if (Math.abs(offset) >= enemy.cfg.patrolRange) enemy.patrolDir = offset > 0 ? -1 : 1;
}

export function stepVenom(enemy: VenomEnemy, player: TargetPlayer, dt: number): AttackResult {
  if (enemy.phase === "patrol") {
    stepPatrol(enemy, dt);
    const center = rectCenter(venomHitbox(enemy));
    const target = rectCenter(player.hitbox);
    if (Math.hypot(target.x - center.x, target.y - center.y) <= enemy.cfg.aggroRange) {
      enemy.phase = "telegraph";
      enemy.elapsedMs = 0;
    }
    return NO_HIT;
  }

  if (enemy.phase === "telegraph") {
    enemy.elapsedMs += dt * 1000;
    if (enemy.elapsedMs >= enemy.cfg.telegraphMs) {
      const center = rectCenter(venomHitbox(enemy));
      // Aimed at the player's position at the moment the wind-up ends, per
      // the brief, not where they were when the telegraph started.
      const target = rectCenter(player.hitbox);
      enemy.vel = ballisticVelocity(center, target, enemy.cfg.leapGravity, enemy.cfg.leapFlightTime);
      enemy.elapsedMs = 0;
      enemy.phase = "leap";
    }
    return NO_HIT;
  }

  if (enemy.phase === "leap") {
    enemy.vel.y += enemy.cfg.leapGravity * dt;
    enemy.position.x += enemy.vel.x * dt;
    enemy.position.y += enemy.vel.y * dt;
    enemy.elapsedMs += dt * 1000;

    const hitPlayer = overlaps(venomHitbox(enemy), player.hitbox);
    const arcDone = enemy.elapsedMs / 1000 >= enemy.cfg.leapFlightTime;
    if (hitPlayer || arcDone) {
      enemy.phase = "recover";
      enemy.elapsedMs = 0;
      // Patrol resumes from wherever it actually landed, not the old spawn.
      enemy.patrolOrigin = { ...enemy.position };
      if (hitPlayer) return { hitPlayer: true, damage: enemy.cfg.leapDamage, spawnedProjectile: null };
    }
    return NO_HIT;
  }

  // Recovering: harmless silhouette even on contact — the brief's breather.
  enemy.elapsedMs += dt * 1000;
  if (enemy.elapsedMs >= enemy.cfg.recoverMs) {
    enemy.phase = "patrol";
    enemy.elapsedMs = 0;
  }
  return NO_HIT;
}

// --- Shared ------------------------------------------------------------------

export type Enemy = DocOckEnemy | VenomEnemy;

export function enemyHitbox(enemy: Enemy): Rect {
  return enemy.kind === "doc-ock" ? docOckHitbox(enemy) : venomHitbox(enemy);
}

/** Dispatches on `kind` so game.ts has a single call site regardless of which
 *  boss this level has. */
export function stepEnemy(enemy: Enemy, player: TargetPlayer, dt: number): AttackResult {
  return enemy.kind === "doc-ock" ? stepDocOck(enemy, player, dt) : stepVenom(enemy, player, dt);
}

/** Apply web damage; returns true once this brings the enemy to 0 health, so
 *  the caller knows to remove it from play. Both configs above default to 3
 *  web hits rather than 1 — the brief's boss allowance — tune per playtest. */
export function damageEnemy(enemy: Enemy, amount: number): boolean {
  enemy.health -= amount;
  return enemy.health <= 0;
}
