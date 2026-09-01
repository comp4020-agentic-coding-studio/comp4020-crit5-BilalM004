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
// Human scale, deliberately close to the player's 26x40: the gunman is the one
// enemy who is just a guy, and the size is what says so before anything else
// about him is legible.
export const GUNMAN_W = 26;
export const GUNMAN_H = 44;
export const PROJECTILE_W = 22;
export const PROJECTILE_H = 22;
export const SLUG_W = 9;
export const SLUG_H = 5;

/** How long an enemy stays lit after a web hits it, in ms. Damage that is only
 *  a pip going out is damage the player can miss entirely — the pips are 7px
 *  wide and sit above the head, which is not where anyone is looking when they
 *  just landed a shot. */
export const HIT_FLASH_MS = 160;

/** What one web hit takes off an enemy.
 *
 *  Enemy `health` used to be a hit counter — 3 meant "three webs" — which made
 *  "how tanky is this thing" and "how hard does the web hit" the same number,
 *  and there was no way to weaken the web without also making every enemy in
 *  the game flimsier. Health is now in points on the same scale as the player's
 *  100, so the two are independent dials and shots-to-kill is
 *  `ceil(health / WEB_DAMAGE)` — which is exactly what render.ts draws as pips,
 *  so the readout stays "how many more shots" rather than becoming a bar of
 *  arbitrary units. */
export const WEB_DAMAGE = 10;

/** What a physical swing-into-enemy body-check deals — more than a ranged web
 *  shot, because landing it costs the player something a web shot doesn't:
 *  they have to actually be on the rope and in reach of a counterattack when
 *  it connects, not standing safely at range. 2.5x WEB_DAMAGE, so it still
 *  takes a couple of body-checks on a boss rather than trivialising the fight
 *  outright. */
export const SWING_CONTACT_DAMAGE = 25;

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
  /** A thrown block arcs under gravity and is dodged by reading the arc; a slug
   *  flies flat and fast and is dodged by not standing there. Same struct, and
   *  the same step function — a slug is just a projectile whose gravity is 0. */
  kind: "block" | "slug";
  /** Top-left of the hitbox, matching the player/enemy convention. */
  position: Vec2;
  vel: Vec2;
  gravity: number;
  damage: number;
  /** Carried per-projectile rather than read off a module constant, because
   *  there are now two sizes and `projectileHitbox` must not have to know which
   *  kind it was handed. */
  w: number;
  h: number;
  /** Seconds since thrown. */
  elapsed: number;
  /** Seconds until it lands (and should be despawned) if nothing is hit first. */
  flightTime: number;
}

export function projectileHitbox(p: Projectile): Rect {
  return { x: p.position.x, y: p.position.y, w: p.w, h: p.h };
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
  /** How fast he walks the player down when idle and out of reach, px/s. Must
   *  stay well under physics.ts's runSpeed (320) or retreating is impossible
   *  and the reach ring becomes decoration. */
  walkSpeed: number;
  /** How far either side of his spawn he will follow. He has no collision and
   *  no ground sense — he is a slab that slides along a floor — so the level,
   *  which is the only thing that knows where that floor ends, bounds him here
   *  rather than trusting him not to walk into the sky. */
  advanceRange: number;
  health: number;
}

export const DEFAULT_DOC_OCK: DocOckConfig = {
  armReach: 210,
  meleeDamage: 30,
  meleeTelegraphMs: 650,
  meleeCooldownMs: 900,
  throwDamage: 22,
  throwTelegraphMs: 500,
  throwCooldownMs: 2200,
  throwFlightTime: 1.4,
  throwGravity: 900,
  walkSpeed: 105,
  advanceRange: 300,
  health: 50,
};

/** Only one attack track telegraphs at a time — the fairness constraint reads
 *  "each attack has its own readable tell," not "two at once." Cooldowns still
 *  run independently underneath; they just can't both cash in simultaneously. */
export type DocOckPhase = "idle" | "melee-telegraph" | "throw-telegraph";

export interface DocOckEnemy {
  kind: "doc-ock";
  id: string;
  position: Vec2;
  /** Where he was spawned. `advanceRange` is measured from here and not from
   *  wherever he has wandered to, so a long chase can never ratchet him off the
   *  end of the arena one step at a time. */
  homeX: number;
  health: number;
  cfg: DocOckConfig;
  phase: DocOckPhase;
  /** Milliseconds into the current phase; meaningless while idle. */
  elapsedMs: number;
  meleeCooldownMs: number;
  throwCooldownMs: number;
  hitFlashMs: number;
}

export function createDocOck(position: Vec2, cfg: DocOckConfig = DEFAULT_DOC_OCK): DocOckEnemy {
  return {
    kind: "doc-ock",
    id: makeId("doc-ock"),
    position: { ...position },
    homeX: position.x,
    health: cfg.health,
    cfg,
    phase: "idle",
    elapsedMs: 0,
    meleeCooldownMs: 0,
    throwCooldownMs: 0,
    hitFlashMs: 0,
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
    w: PROJECTILE_W,
    h: PROJECTILE_H,
    elapsed: 0,
    flightTime: cfg.throwFlightTime,
  };
}

/** Walk toward the player, bounded by `advanceRange` either side of home.
 *
 *  He stops at 85% of `armReach` rather than at zero. A boss who walks all the
 *  way into you is standing on top of the reach ring that is supposed to be
 *  telling you where safe is, and "safe" would then be a place you can never
 *  get to. Stopping just inside the ring means the ring is always drawn around
 *  ground the player can actually stand on. */
function advanceDocOck(enemy: DocOckEnemy, dx: number, dist: number, dt: number): void {
  if (dist <= enemy.cfg.armReach * 0.85) return;
  const dir = dx >= 0 ? 1 : -1;
  const lo = enemy.homeX - enemy.cfg.advanceRange;
  const hi = enemy.homeX + enemy.cfg.advanceRange;
  const next = enemy.position.x + dir * enemy.cfg.walkSpeed * dt;
  enemy.position.x = Math.min(hi, Math.max(lo, next));
}

export function stepDocOck(enemy: DocOckEnemy, player: TargetPlayer, dt: number): AttackResult {
  enemy.hitFlashMs = Math.max(0, enemy.hitFlashMs - dt * 1000);
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
    } else {
      advanceDocOck(enemy, target.x - center.x, dist, dt);
    }
    return NO_HIT;
  }

  // Deliberately no movement past this point. He walks only while idle, and
  // stands still for the whole of either wind-up — because both attacks are
  // resolved from where he is *at the snap*, so a boss who kept walking during
  // his own telegraph would eat the distance the player just spent the
  // telegraph earning. The tell would still be readable and the dodge would
  // still be wrong, which is the exact failure the telegraphs exist to prevent.
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
   *  Doc Ock's melee, so this is a distance, not a "walk up to it" range.
   *
   *  This one has a hard ceiling and it comes from the camera, not from taste.
   *  A leap is only fair because the wind-up is readable first, and at the
   *  narrow marking viewport (390x844, VIEW_H 860 / MIN_VIEW_W 800) the player
   *  sees 400 world px either side of themselves — so a telegraph beginning
   *  much past ~410 begins off the side of a phone, and the one thing making
   *  the attack legitimate never reaches the player. Reach past that has to be
   *  bought by *closing the distance*, which is what chaseRange is for. */
  aggroRange: number;
  /** How far away it notices the player and starts stalking — much further than
   *  it can leap from, and that asymmetry is the point. It walks into leap range
   *  instead of triggering from outside the frame, so the threat radius grows
   *  without a single unreadable attack. */
  chaseRange: number;
  /** Stalking speed, px/s. Under physics.ts's runSpeed (320) so the player can
   *  break away; high enough that standing still is never the answer. */
  chaseSpeed: number;
  /** Hard bound on horizontal wandering, either side of where it spawned.
   *  Patrol bounces inside `patrolRange` of its last landing, which is a
   *  *relative* window and therefore ratchets — a few leaps in one direction and
   *  it has walked off the roof. This is the absolute one, and the level sets it
   *  from the geometry. */
  roamRange: number;
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
  leapDamage: 42,
  telegraphMs: 550,
  aggroRange: 380,
  chaseRange: 700,
  chaseSpeed: 130,
  roamRange: 300,
  leapFlightTime: 0.55,
  leapGravity: 1800,
  recoverMs: 1100,
  patrolSpeed: 110,
  patrolRange: 170,
  health: 50,
};

export type VenomPhase = "patrol" | "telegraph" | "leap" | "recover";

export interface VenomEnemy {
  kind: "venom";
  id: string;
  position: Vec2;
  /** Spawn x. `roamRange` is measured from here — see the config field. */
  homeX: number;
  /** Spawn y — the platform he stands on. Venom has no platform collision at
   *  all outside the leap's ballistic arc, so this is what a resolved leap
   *  snaps back to (see stepVenom's leap phase) rather than trusting the arc
   *  to land him on his feet. */
  groundY: number;
  vel: Vec2;
  health: number;
  cfg: VenomConfig;
  phase: VenomPhase;
  elapsedMs: number;
  patrolOrigin: Vec2;
  patrolDir: 1 | -1;
  hitFlashMs: number;
}

export function createVenom(position: Vec2, cfg: VenomConfig = DEFAULT_VENOM): VenomEnemy {
  return {
    kind: "venom",
    id: makeId("venom"),
    position: { ...position },
    homeX: position.x,
    groundY: position.y,
    vel: { x: 0, y: 0 },
    health: cfg.health,
    cfg,
    phase: "patrol",
    elapsedMs: 0,
    patrolOrigin: { ...position },
    patrolDir: 1,
    hitFlashMs: 0,
  };
}

export function venomHitbox(e: VenomEnemy): Rect {
  return { x: e.position.x, y: e.position.y, w: VENOM_W, h: VENOM_H };
}

/** Every horizontal move Venom makes on foot goes through here, so `roamRange`
 *  is one rule rather than a thing each caller remembers. Returns true if the
 *  clamp bit, which the patrol uses to turn around at the boundary — otherwise
 *  it would grind against the wall of its own roam box forever. */
function moveVenom(enemy: VenomEnemy, dx: number): boolean {
  const lo = enemy.homeX - enemy.cfg.roamRange;
  const hi = enemy.homeX + enemy.cfg.roamRange;
  const cur = enemy.position.x;
  const wanted = cur + dx;
  // Only movement heading *further* out is restrained. A leap is aimed at the
  // player and is not clamped, so it can legitimately land him outside the box;
  // snapping him back to the edge on the next walked frame would be a teleport,
  // and walking home has to stay free from wherever he lands.
  let next = wanted;
  if (dx > 0 && wanted > hi) next = Math.max(cur, hi);
  if (dx < 0 && wanted < lo) next = Math.min(cur, lo);
  enemy.position.x = next;
  return next !== wanted;
}

function stepPatrol(enemy: VenomEnemy, dt: number): void {
  const clamped = moveVenom(enemy, enemy.patrolDir * enemy.cfg.patrolSpeed * dt);
  const offset = enemy.position.x - enemy.patrolOrigin.x;
  // Both turns point him somewhere rather than just reversing him, so neither
  // can flap frame to frame: back toward the last landing when he has paced far
  // enough from it, and back toward home if the roam box stopped him.
  if (Math.abs(offset) >= enemy.cfg.patrolRange) enemy.patrolDir = offset > 0 ? -1 : 1;
  if (clamped) enemy.patrolDir = enemy.position.x > enemy.homeX ? -1 : 1;
}

/** Stalk toward the player. Stops short of `aggroRange` rather than walking all
 *  the way in: past that point the leap is what closes the distance, and a
 *  Venom that also walked would be shoving the player around by contact with no
 *  attack having happened. */
function stepChase(enemy: VenomEnemy, dx: number, dist: number, dt: number): void {
  if (dist <= enemy.cfg.aggroRange) return;
  moveVenom(enemy, (dx >= 0 ? 1 : -1) * enemy.cfg.chaseSpeed * dt);
}

export function stepVenom(enemy: VenomEnemy, player: TargetPlayer, dt: number): AttackResult {
  enemy.hitFlashMs = Math.max(0, enemy.hitFlashMs - dt * 1000);

  if (enemy.phase === "patrol") {
    const center = rectCenter(venomHitbox(enemy));
    const target = rectCenter(player.hitbox);
    const dist = Math.hypot(target.x - center.x, target.y - center.y);

    if (dist <= enemy.cfg.aggroRange) {
      enemy.phase = "telegraph";
      enemy.elapsedMs = 0;
    } else if (dist <= enemy.cfg.chaseRange) {
      stepChase(enemy, target.x - center.x, dist, dt);
    } else {
      stepPatrol(enemy, dt);
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
      // ...but no further than the roam box, which the leap has to respect for
      // the same reason the walk does. It is the leap, not the walk, that can
      // put him somewhere impossible: he has no ground under him and no
      // collision, so a lunge at a player out over the gap lands him hovering
      // in open sky, and one aimed past the roof gunman parks him in front of
      // the shots meant for that gunman. Clamping the landing rather than
      // refusing the leap keeps the attack — he lunges as far as the roof
      // allows and comes up short, which is legible as a miss.
      const lo = enemy.homeX - enemy.cfg.roamRange + VENOM_W / 2;
      const hi = enemy.homeX + enemy.cfg.roamRange + VENOM_W / 2;
      const landing = { x: Math.min(hi, Math.max(lo, target.x)), y: target.y };
      enemy.vel = ballisticVelocity(center, landing, enemy.cfg.leapGravity, enemy.cfg.leapFlightTime);
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
      // The arc is aimed so Venom's *centre* reaches the player's centre —
      // right for landing a hit, since that is what makes the two hitboxes
      // overlap, but wrong for a miss: a standing player's centre sits well
      // above their feet, and Venom is taller than the player (70px vs
      // 40px), so translating that centre back into his own top-left
      // `position` leaves his feet below the platform he leapt from. Snapping
      // y back to `groundY` here is what makes every leap end standing —
      // whether it connected or not — instead of sinking him into the roof a
      // little further with every miss.
      enemy.position.y = enemy.groundY;
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

// --- Gunman (a guy with a pistol; the rank-and-file threat) -----------------
//
// The two bosses are *encounters*: you walk into an arena and it is about them.
// The gunman is the opposite, and that is the job he was added for — he stands
// where you have to go, plinks at you while you are busy with something else,
// and refuses to let the door open until he is dealt with. He is also the
// cheapest possible teacher for "the web hits enemies too": level 1 puts one
// across the gap with nothing else on that roof, so the first thing the player
// does after learning to swing is discover the other half of the same button.
//
// Everything about him is deliberately legible rather than deep. He does not
// move: a shooter who repositions is a second thing to track, and the reason
// he exists is to be a fixed hazard you route *around*. His whole threat is one
// telegraphed line of fire, and the dodge is "do not be on that line when it
// finishes" — which, unlike a reach ring or a ballistic arc, costs nothing to
// read at phone size.

export interface GunmanConfig {
  /** He wakes up at this distance and not before. Sized per level against what
   *  is actually on screen there: a shooter the player cannot see yet is not a
   *  difficulty, it is damage from nowhere. */
  aggroRange: number;
  /** Wind-up before the shot leaves. The full dodge window — see stepGunman,
   *  which does not re-aim during it. */
  aimTelegraphMs: number;
  cooldownMs: number;
  shotDamage: number;
  shotSpeed: number;
  /** How far a slug travels before it despawns. */
  shotRange: number;
  health: number;
}

/** The level-1 baseline: slow, weak, and generous. He is the first enemy in the
 *  game and the first thing the player ever shoots at, so his job is to be
 *  survivable while you work out what the web does to people. */
export const DEFAULT_GUNMAN: GunmanConfig = {
  aggroRange: 470,
  aimTelegraphMs: 720,
  cooldownMs: 1600,
  shotDamage: 9,
  shotSpeed: 460,
  shotRange: 760,
  health: 10,
};

export type GunmanPhase = "idle" | "aim" | "cooldown";

export interface GunmanEnemy {
  kind: "gunman";
  id: string;
  position: Vec2;
  health: number;
  cfg: GunmanConfig;
  phase: GunmanPhase;
  elapsedMs: number;
  /** Where the shot is committed to go, locked in when the wind-up starts.
   *  Null while idle. See stepGunman for why this is stored rather than
   *  re-measured at the trigger. */
  aimAt: Vec2 | null;
  /** Counts down after a shot leaves, for the muzzle flash. */
  muzzleMs: number;
  hitFlashMs: number;
}

export function createGunman(position: Vec2, cfg: GunmanConfig = DEFAULT_GUNMAN): GunmanEnemy {
  return {
    kind: "gunman",
    id: makeId("gunman"),
    position: { ...position },
    health: cfg.health,
    cfg,
    phase: "idle",
    elapsedMs: 0,
    aimAt: null,
    muzzleMs: 0,
    hitFlashMs: 0,
  };
}

export function gunmanHitbox(e: GunmanEnemy): Rect {
  return { x: e.position.x, y: e.position.y, w: GUNMAN_W, h: GUNMAN_H };
}

/** The pistol's position relative to the box: out to the facing side at chest
 *  height. Exported because the renderer has to put the gun, the hand and the
 *  flash on the same point the slug is actually born at — a tracer that starts
 *  somewhere other than the muzzle is a lie about where the shot came from, and
 *  two copies of "11" in two files is how that lie gets written. */
export const GUNMAN_MUZZLE_DX = 11;
export const GUNMAN_MUZZLE_DY = 15;

/** Which way he is turned: toward whatever he last looked at. Locked along with
 *  `aimAt` during a wind-up, so he cannot pivot mid-telegraph and fire down a
 *  line he was never pointing at. */
export function gunmanFacing(e: GunmanEnemy): 1 | -1 {
  return (e.aimAt?.x ?? e.position.x + GUNMAN_W) >= e.position.x + GUNMAN_W / 2 ? 1 : -1;
}

export function gunmanMuzzle(e: GunmanEnemy): Vec2 {
  return {
    x: e.position.x + GUNMAN_W / 2 + gunmanFacing(e) * GUNMAN_MUZZLE_DX,
    y: e.position.y + GUNMAN_MUZZLE_DY,
  };
}

function spawnSlug(from: Vec2, target: Vec2, cfg: GunmanConfig): Projectile {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    id: makeId("slug"),
    kind: "slug",
    position: { x: from.x - SLUG_W / 2, y: from.y - SLUG_H / 2 },
    // Flat. A bullet that droops is a bullet the player has to solve for, and
    // this enemy is not the one that should be asking them to.
    vel: { x: (dx / len) * cfg.shotSpeed, y: (dy / len) * cfg.shotSpeed },
    gravity: 0,
    damage: cfg.shotDamage,
    w: SLUG_W,
    h: SLUG_H,
    elapsed: 0,
    flightTime: cfg.shotRange / cfg.shotSpeed,
  };
}

/** Aim, fire, wait.
 *
 *  The aim point is locked at the *start* of the wind-up, and both bosses do
 *  the opposite — Doc Ock's block and Venom's leap are aimed at wherever the
 *  player is when the telegraph ends. That difference is the whole reason this
 *  enemy is fair to stack two of. A boss that re-aims at the last instant is
 *  dodged by moving late and decisively, which is a skill worth having and a
 *  full-attention act; if the gunmen did the same, a player mid-swing over a
 *  480px gap with a boss winding up would be tracked by every shooter on the
 *  map at once and there would be no line to be off. Locking the line early
 *  makes them hazards you can route around while thinking about something
 *  else — which is exactly what a background threat has to be. */
export function stepGunman(enemy: GunmanEnemy, player: TargetPlayer, dt: number): AttackResult {
  enemy.hitFlashMs = Math.max(0, enemy.hitFlashMs - dt * 1000);
  enemy.muzzleMs = Math.max(0, enemy.muzzleMs - dt * 1000);

  const center = rectCenter(gunmanHitbox(enemy));
  const target = rectCenter(player.hitbox);

  if (enemy.phase === "idle") {
    if (Math.hypot(target.x - center.x, target.y - center.y) <= enemy.cfg.aggroRange) {
      enemy.phase = "aim";
      enemy.elapsedMs = 0;
      enemy.aimAt = { ...target };
    } else {
      // Face where the player is even while asleep, so walking into his range
      // is not the first time the player learns he is pointed at them.
      enemy.aimAt = { ...target };
    }
    return NO_HIT;
  }

  enemy.elapsedMs += dt * 1000;

  if (enemy.phase === "aim") {
    if (enemy.elapsedMs >= enemy.cfg.aimTelegraphMs) {
      enemy.phase = "cooldown";
      enemy.elapsedMs = 0;
      enemy.muzzleMs = 90;
      const aim = enemy.aimAt ?? target;
      return {
        hitPlayer: false,
        damage: 0,
        spawnedProjectile: spawnSlug(gunmanMuzzle(enemy), aim, enemy.cfg),
      };
    }
    return NO_HIT;
  }

  if (enemy.elapsedMs >= enemy.cfg.cooldownMs) {
    enemy.phase = "idle";
    enemy.elapsedMs = 0;
  }
  return NO_HIT;
}

// --- Shared ------------------------------------------------------------------

export type Enemy = DocOckEnemy | VenomEnemy | GunmanEnemy;

export function enemyHitbox(enemy: Enemy): Rect {
  if (enemy.kind === "doc-ock") return docOckHitbox(enemy);
  if (enemy.kind === "venom") return venomHitbox(enemy);
  return gunmanHitbox(enemy);
}

/** Dispatches on `kind` so game.ts has a single call site regardless of what
 *  this level happens to contain. */
export function stepEnemy(enemy: Enemy, player: TargetPlayer, dt: number): AttackResult {
  if (enemy.kind === "doc-ock") return stepDocOck(enemy, player, dt);
  if (enemy.kind === "venom") return stepVenom(enemy, player, dt);
  return stepGunman(enemy, player, dt);
}

/** Apply damage in health points; returns true once this brings the enemy to 0,
 *  so the caller knows to remove it from play. A web hit passes `WEB_DAMAGE`;
 *  everything is on the same 100-point scale as the player, so a boss at 90
 *  health against a 10-point web is nine shots.
 *
 *  Lights the hit flash whether or not the hit was fatal, because a survivable
 *  hit is the case that needs it: a kill is self-evidently a kill. */
export function damageEnemy(enemy: Enemy, amount: number): boolean {
  enemy.health -= amount;
  enemy.hitFlashMs = HIT_FLASH_MS;
  return enemy.health <= 0;
}

// --- Difficulty scaling (the loop counter) ----------------------------------
//
// Reaching the final door restarts the run rather than ending the game, and
// each restart after the first is a "loop" — main.ts counts them and hands
// the count back here as a scale. Two independent multipliers, not one,
// because "stronger" and "faster" are different axes level.ts already keeps
// separate per enemy (a gunman's bullet speed isn't his health): `power`
// scales damage and health, `speed` scales movement and projectile speed.
//
// Telegraph timings (meleeTelegraphMs, aimTelegraphMs, ...) are deliberately
// left out of both. They're the fairness floor documented on VenomConfig's
// telegraphMs — below ~300ms a wind-up stops being readable and becomes a
// coin flip — and speeding those up with every loop would erode exactly the
// "one readable tell" guarantee the rest of the game is built on. A looped
// enemy hits harder and closes distance faster; it does not warn you later.
export interface DifficultyScale {
  /** Multiplies movement and projectile speeds. */
  speed: number;
  /** Multiplies damage and health. */
  power: number;
}

/** The tuned baseline, unscaled — the first playthrough plays exactly as
 *  deliverables 6-8 left it. */
export const NEUTRAL_SCALE: DifficultyScale = { speed: 1, power: 1 };

/** `loopCount` is 0 for the first playthrough, 1 after the first full clear,
 *  and so on. Compounding is deliberate — a NG+ where the tenth loop feels
 *  like the first would defeat the point of counting loops at all. */
export function scaleForLoop(loopCount: number): DifficultyScale {
  return { speed: 1 + loopCount * 0.12, power: 1 + loopCount * 0.15 };
}

export function scaleDocOckConfig(cfg: DocOckConfig, scale: DifficultyScale): DocOckConfig {
  return {
    ...cfg,
    meleeDamage: cfg.meleeDamage * scale.power,
    throwDamage: cfg.throwDamage * scale.power,
    health: cfg.health * scale.power,
    walkSpeed: cfg.walkSpeed * scale.speed,
  };
}

export function scaleVenomConfig(cfg: VenomConfig, scale: DifficultyScale): VenomConfig {
  return {
    ...cfg,
    leapDamage: cfg.leapDamage * scale.power,
    health: cfg.health * scale.power,
    chaseSpeed: cfg.chaseSpeed * scale.speed,
    patrolSpeed: cfg.patrolSpeed * scale.speed,
  };
}

export function scaleGunmanConfig(cfg: GunmanConfig, scale: DifficultyScale): GunmanConfig {
  return {
    ...cfg,
    shotDamage: cfg.shotDamage * scale.power,
    health: cfg.health * scale.power,
    shotSpeed: cfg.shotSpeed * scale.speed,
  };
}
