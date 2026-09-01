// Movement and swing physics. No canvas, no DOM, no globals: everything here
// is a function of (state, intent, platforms, config, dt), so the feel can be
// unit-tested and — more importantly — retuned in one place.
//
// Hand-rolled rather than Matter.js: the swing is a single fixed-length
// constraint, which is ~20 lines of pendulum math directly, versus fighting a
// general-purpose solver's idea of a rope for the same result.
//
// Units are pixels and seconds throughout. y increases downward, so gravity is
// positive and jump impulses are negative.

import type { Rect, Vec2 } from "./geometry";
import { overlaps } from "./geometry";

export const PLAYER_W = 26;
export const PLAYER_H = 40;

/** Every number that decides how the game feels, in one object so deliverable
 *  10's playtest tuning is a diff to one place and not a hunt through logic. */
export interface PhysicsConfig {
  gravity: number;
  /** Terminal velocity. Caps per-tick travel so fast falls can't tunnel
   *  through a platform, and keeps a long drop readable. */
  maxFallSpeed: number;

  runSpeed: number;
  groundAccel: number;
  /** Deceleration applied on the ground with no horizontal input. */
  groundFriction: number;
  /** Deliberately below groundAccel: air control exists, but momentum from a
   *  swing release can't be instantly cancelled, which is the whole point of
   *  having momentum. */
  airAccel: number;
  airDrag: number;

  jumpImpulse: number;
  /** Grace period after walking off a ledge where a jump still counts. */
  coyoteTime: number;
  /** Grace period before landing where a jump press is remembered. */
  jumpBufferTime: number;

  /** Climb rate up/down a wall while stuck to it (Vex-style contact climb). */
  wallClimbSpeed: number;
  /** How long the player keeps clinging after holding away from the wall.
   *  Without it a cling drops the instant the stick wobbles off-axis. */
  wallReleaseTime: number;
  wallJumpX: number;
  wallJumpY: number;
  /** Horizontal input is ignored this long after a wall jump. Otherwise
   *  holding toward the wall (the natural thing to be doing) cancels the
   *  push-off and the wall jump feels dead. */
  wallJumpLockTime: number;

  /** Angular damping, 1/s. Small: a rope loses little energy, and the swing
   *  should read as momentum being spent, not as friction. */
  swingDamping: number;
  /** Tangential acceleration from left/right input while swinging — lets the
   *  player pump the swing higher, like a playground swing. Expressed as a
   *  linear accel so it feels the same on a short and a long rope. */
  swingPumpAccel: number;
  /** Rope reel rate from up/down input while swinging. */
  reelSpeed: number;
  minRopeLength: number;
  maxRopeLength: number;
  /** Multiplier on the launch velocity when the web is released. */
  releaseBoost: number;
  /** Extra upward kick when the release came from a jump press. */
  releaseJumpKick: number;
  maxSwingSpeed: number;

  // --- Zip ---
  //
  // A pendulum's arc bottoms out at anchor.y + length, and length is the
  // hypotenuse, so the bottom of the arc is *always* at or below the player.
  // A swing starting from rest therefore accelerates downward — which is fine
  // in mid-air and fatal on the ground, where "downward" is the floor. Firing
  // from a standstill used to attach and die in a single tick.
  //
  // So a shot taken while grounded or clinging doesn't start a pendulum at
  // all: it yanks the player along the rope as ordinary free movement, and
  // the pendulum takes over at the top of that launch, where there is room
  // below to swing into.
  /** Speed of the yank, along the rope toward the anchor. */
  zipImpulse: number;
  /** Floor on the yank's upward component, so a shot at an anchor level with
   *  the player still gets them off the ground instead of scraping along it.
   *  A floor rather than an addition: a near-vertical shot is already going
   *  up hard and shouldn't also collect this. */
  zipLift: number;
  /** Safety valve. A zip that never reaches an apex — pinned under a ceiling,
   *  say — lets go rather than tethering the player indefinitely. */
  maxZipTime: number;
}

export const DEFAULT_PHYSICS: PhysicsConfig = {
  gravity: 2000,
  maxFallSpeed: 1200,

  runSpeed: 320,
  groundAccel: 2600,
  groundFriction: 3000,
  airAccel: 1400,
  airDrag: 400,

  // ~110px of jump height at this gravity (v = sqrt(2*g*h)), about 2.5 body
  // heights, with a 0.33s rise — high enough to matter, short enough to feel
  // responsive rather than floaty.
  jumpImpulse: 660,
  coyoteTime: 0.1,
  jumpBufferTime: 0.1,

  wallClimbSpeed: 180,
  wallReleaseTime: 0.12,
  wallJumpX: 420,
  wallJumpY: 600,
  wallJumpLockTime: 0.16,

  swingDamping: 0.6,
  swingPumpAccel: 900,
  reelSpeed: 220,
  minRopeLength: 48,
  // Matches web.ts's shot range: a rope shorter than the reach would be
  // clamped on attach, and since the constraint then snaps the player onto
  // the circle, that clamp is a visible teleport toward the anchor.
  maxRopeLength: 520,
  releaseBoost: 1.1,
  releaseJumpKick: 180,
  maxSwingSpeed: 1400,

  zipImpulse: 760,
  zipLift: 420,
  maxZipTime: 0.6,
};

/** "zip" is the launch out of a standstill; "swing" is the pendulum proper.
 *  Both draw the same rope, so to the player it reads as one continuous
 *  action rather than two mechanics. */
export type SwingPhase = "zip" | "swing";

export interface SwingState {
  anchor: Vec2;
  /** Only meaningful once taut, i.e. in the "swing" phase. */
  length: number;
  /** Rope angle at the anchor, radians, measured from straight down. */
  angle: number;
  angularVel: number;
  phase: SwingPhase;
  /** Seconds spent zipping, against cfg.maxZipTime. */
  zipElapsed: number;
}

/** -1 = wall on the player's left, +1 = on the right, 0 = not touching one. */
export type WallSide = -1 | 0 | 1;

export interface PlayerState {
  /** Top-left of the player's AABB. */
  pos: Vec2;
  vel: Vec2;
  onGround: boolean;
  /** The wall the player is currently stuck to, 0 when free. */
  wallSide: WallSide;
  swing: SwingState | null;
  coyote: number;
  jumpBuffer: number;
  wallJumpLock: number;
  wallRelease: number;
}

/** The subset of InputState physics cares about; InputState satisfies it
 *  structurally, so game.ts can pass the input straight through. */
export interface MoveIntent {
  moveX: number;
  moveY: number;
  jumpPressed: boolean;
  /** Set by game.ts for an explicit let-go, separate from a jump release. */
  releaseWeb?: boolean;
}

export function createPlayer(start: Vec2): PlayerState {
  return {
    pos: { x: start.x, y: start.y },
    vel: { x: 0, y: 0 },
    onGround: false,
    wallSide: 0,
    swing: null,
    coyote: 0,
    jumpBuffer: 0,
    wallJumpLock: 0,
    wallRelease: 0,
  };
}

export function playerRect(p: PlayerState): Rect {
  return { x: p.pos.x, y: p.pos.y, w: PLAYER_W, h: PLAYER_H };
}

export function playerCenter(p: PlayerState): Vec2 {
  return { x: p.pos.x + PLAYER_W / 2, y: p.pos.y + PLAYER_H / 2 };
}

function setPlayerCenter(p: PlayerState, c: Vec2): void {
  p.pos.x = c.x - PLAYER_W / 2;
  p.pos.y = c.y - PLAYER_H / 2;
}

// --- Pendulum -------------------------------------------------------------
//
// The rope is a rigid constraint of fixed length L from the anchor A. With the
// angle measured from straight down, the player's centre is
//
//   P(θ) = A + L * (sin θ, cos θ)
//
// so θ = 0 hangs directly below the anchor. Differentiating gives the tangent
// direction (cos θ, -sin θ), and projecting gravity onto it gives the standard
// angular acceleration -(g / L) · sin θ.

function tangent(angle: number): Vec2 {
  return { x: Math.cos(angle), y: -Math.sin(angle) };
}

/** Where the constraint puts the player's centre. */
export function pendulumPoint(s: SwingState): Vec2 {
  return {
    x: s.anchor.x + s.length * Math.sin(s.angle),
    y: s.anchor.y + s.length * Math.cos(s.angle),
  };
}

/** The linear velocity the current rotation corresponds to — this is what a
 *  release converts back into free movement. */
export function swingVelocity(s: SwingState): Vec2 {
  const t = tangent(s.angle);
  const speed = s.angularVel * s.length;
  return { x: t.x * speed, y: t.y * speed };
}

/** Make the rope taut from wherever the player currently is: length and angle
 *  come from the present offset, and the player's existing velocity is
 *  projected onto the tangent, so going taut continues the arc instead of
 *  stopping dead. Returns false if the anchor is out of rope range, which the
 *  callers treat as "no swing" rather than snapping the player onto a circle
 *  they aren't standing on. */
function goTaut(p: PlayerState, anchor: Vec2, cfg: PhysicsConfig): boolean {
  const c = playerCenter(p);
  const rope = { x: c.x - anchor.x, y: c.y - anchor.y };
  const dist = Math.hypot(rope.x, rope.y);
  // Too close to swing around, and clamping up to minRopeLength would shove
  // the player outward by the difference. An anchor you're already against is
  // a wall to cling to, not a rope.
  if (dist < cfg.minRopeLength || dist > cfg.maxRopeLength) return false;

  const angle = Math.atan2(rope.x, rope.y);
  const t = tangent(angle);

  p.swing = {
    anchor: { x: anchor.x, y: anchor.y },
    length: dist,
    angle,
    angularVel: (p.vel.x * t.x + p.vel.y * t.y) / dist,
    phase: "swing",
    zipElapsed: 0,
  };
  p.onGround = false;
  p.wallSide = 0;
  return true;
}

/** Fire the web at an anchor (resolved by web.ts). Standing on something picks
 *  the zip launch, mid-air picks the pendulum directly — see the Zip section of
 *  PhysicsConfig for why a standing shot cannot simply swing. */
export function attachWeb(p: PlayerState, anchor: Vec2, cfg: PhysicsConfig): void {
  const grounded = p.onGround || p.wallSide !== 0;
  if (!grounded) {
    goTaut(p, anchor, cfg);
    return;
  }

  const c = playerCenter(p);
  const rope = { x: anchor.x - c.x, y: anchor.y - c.y };
  const dist = Math.hypot(rope.x, rope.y);
  if (dist < cfg.minRopeLength || dist > cfg.maxRopeLength) return;

  p.vel.x = (rope.x / dist) * cfg.zipImpulse;
  p.vel.y = Math.min((rope.y / dist) * cfg.zipImpulse, -cfg.zipLift);

  p.swing = {
    anchor: { x: anchor.x, y: anchor.y },
    // Length and angle are meaningless until the rope goes taut; goTaut()
    // recomputes both at the apex from wherever the launch actually ended up.
    length: dist,
    angle: 0,
    angularVel: 0,
    phase: "zip",
    zipElapsed: 0,
  };
  p.onGround = false;
  p.wallSide = 0;
  p.wallRelease = 0;
}

/** Let go, converting rotation back into a linear launch. */
export function releaseWeb(p: PlayerState, cfg: PhysicsConfig, viaJump: boolean): void {
  const s = p.swing;
  if (!s) return;

  // A zip's rope was never taut, so swingVelocity() would report the rotation
  // of a pendulum that doesn't exist. The player's own velocity is the truth,
  // and it gets no releaseBoost: the boost pays out momentum the swing built,
  // and a zip hasn't built any — compounding it here would just be free speed
  // for tapping fire and jump together.
  const zipping = s.phase === "zip";
  const v = zipping ? p.vel : swingVelocity(s);
  const boost = zipping ? 1 : cfg.releaseBoost;
  let vx = v.x * boost;
  let vy = v.y * boost;
  if (viaJump) vy -= cfg.releaseJumpKick;

  const speed = Math.hypot(vx, vy);
  if (speed > cfg.maxSwingSpeed) {
    const scale = cfg.maxSwingSpeed / speed;
    vx *= scale;
    vy *= scale;
  }

  p.vel.x = vx;
  p.vel.y = vy;
  p.swing = null;
}

// --- Collision ------------------------------------------------------------

interface Contact {
  hitWall: WallSide;
  landed: boolean;
  hitCeiling: boolean;
}

/** Integrate position from velocity and resolve against static platforms.
 *  Axes are moved and resolved separately, which is what makes sliding along
 *  a floor or wall fall out for free instead of needing corner special-cases. */
function moveAndCollide(p: PlayerState, platforms: readonly Rect[], dt: number): Contact {
  const contact: Contact = { hitWall: 0, landed: false, hitCeiling: false };

  p.pos.x += p.vel.x * dt;
  if (p.vel.x !== 0) {
    for (const plat of platforms) {
      if (!overlaps(playerRect(p), plat)) continue;
      if (p.vel.x > 0) {
        p.pos.x = plat.x - PLAYER_W;
        contact.hitWall = 1;
      } else {
        p.pos.x = plat.x + plat.w;
        contact.hitWall = -1;
      }
      p.vel.x = 0;
    }
  }

  p.pos.y += p.vel.y * dt;
  if (p.vel.y !== 0) {
    for (const plat of platforms) {
      if (!overlaps(playerRect(p), plat)) continue;
      if (p.vel.y > 0) {
        p.pos.y = plat.y - PLAYER_H;
        contact.landed = true;
      } else {
        p.pos.y = plat.y + plat.h;
        contact.hitCeiling = true;
      }
      p.vel.y = 0;
    }
  }

  return contact;
}

/** Which side a wall is on, by probing regardless of velocity — a player
 *  already pressed flush against a wall has zero horizontal velocity, so
 *  collision results alone can't answer this.
 *
 *  The probe is inset vertically so that a floor or ceiling plane, and the
 *  1px corner of a ledge, don't read as climbable wall. */
export function wallContact(p: PlayerState, platforms: readonly Rect[]): WallSide {
  const inset = 6;
  const probe: Rect = {
    x: p.pos.x,
    y: p.pos.y + inset,
    w: PLAYER_W,
    h: PLAYER_H - inset * 2,
  };
  const reach = 3;

  for (const plat of platforms) {
    if (overlaps({ ...probe, x: probe.x + reach }, plat)) return 1;
    if (overlaps({ ...probe, x: probe.x - reach }, plat)) return -1;
  }
  return 0;
}

// --- Step -----------------------------------------------------------------

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

/** Advance the player one fixed step. Mutates `p` (the game loop owns a single
 *  player object and steps it in place). */
export function stepPlayer(
  p: PlayerState,
  intent: MoveIntent,
  platforms: readonly Rect[],
  cfg: PhysicsConfig,
  dt: number,
): void {
  p.coyote = Math.max(0, p.coyote - dt);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  p.wallJumpLock = Math.max(0, p.wallJumpLock - dt);
  if (intent.jumpPressed) p.jumpBuffer = cfg.jumpBufferTime;

  if (p.swing) {
    // A jump press mid-swing is the launch — the main way the mechanic is
    // used — so it takes priority over being a jump.
    if (p.jumpBuffer > 0 || intent.releaseWeb) {
      const viaJump = p.jumpBuffer > 0;
      p.jumpBuffer = 0;
      releaseWeb(p, cfg, viaJump);
    } else if (p.swing.phase === "zip") {
      stepZip(p, intent, platforms, cfg, dt);
      return;
    } else {
      stepSwing(p, intent, platforms, cfg, dt);
      return;
    }
  }

  stepFree(p, intent, platforms, cfg, dt);
}

/** The launch out of a standstill. The player moves freely — air control and
 *  collision behave exactly as normal — while the rope stays drawn, and the
 *  pendulum engages at the apex, which is the first moment there is room below
 *  to swing into. */
function stepZip(
  p: PlayerState,
  intent: MoveIntent,
  platforms: readonly Rect[],
  cfg: PhysicsConfig,
  dt: number,
): void {
  const s = p.swing;
  if (!s) return;

  s.zipElapsed += dt;
  const rising = p.vel.y < 0;
  stepFree(p, intent, platforms, cfg, dt);

  // Landed again, or caught a wall: the zip delivered the player somewhere
  // solid, which is a fine outcome. Let go rather than leaving a rope hanging
  // off someone standing still — that was the original bug's whole shape.
  if (p.onGround || p.wallSide !== 0) {
    p.swing = null;
    return;
  }

  if (s.zipElapsed >= cfg.maxZipTime) {
    p.swing = null;
    return;
  }

  // Apex. `rising` is sampled before the step so a zip that starts already
  // falling (fired off a ledge) doesn't convert on its very first tick, before
  // it has bought any height.
  if (rising && p.vel.y >= 0 && !goTaut(p, s.anchor, cfg)) p.swing = null;
}

function stepSwing(
  p: PlayerState,
  intent: MoveIntent,
  platforms: readonly Rect[],
  cfg: PhysicsConfig,
  dt: number,
): void {
  const s = p.swing;
  if (!s) return;

  // Reel in/out. Conserving tangential linear speed (rather than angular
  // momentum) means pulling the rope in still speeds up the swing noticeably,
  // without the r^-2 blow-up that turns a reel into a slingshot exploit.
  if (intent.moveY !== 0) {
    const wanted = s.length + intent.moveY * cfg.reelSpeed * dt;
    const next = Math.min(Math.max(wanted, cfg.minRopeLength), cfg.maxRopeLength);
    if (next !== s.length) {
      s.angularVel *= s.length / next;
      s.length = next;
    }
  }

  const gravityTerm = -(cfg.gravity / s.length) * Math.sin(s.angle);
  const pumpTerm = (intent.moveX * cfg.swingPumpAccel) / s.length;
  s.angularVel += (gravityTerm + pumpTerm - cfg.swingDamping * s.angularVel) * dt;
  s.angle += s.angularVel * dt;

  const before = { x: p.pos.x, y: p.pos.y };
  setPlayerCenter(p, pendulumPoint(s));

  // The rope must not drag the player through a building. Rather than solving
  // the constraint against geometry, hand off: rewind, let go, and continue on
  // the tangent as free movement, so a swing into a rooftop becomes a landing
  // that keeps its speed.
  for (const plat of platforms) {
    if (!overlaps(playerRect(p), plat)) continue;
    p.pos.x = before.x;
    p.pos.y = before.y;
    releaseWeb(p, cfg, false);
    stepFree(p, intent, platforms, cfg, dt);
    return;
  }

  p.onGround = false;
  p.wallSide = 0;
}

function stepFree(
  p: PlayerState,
  intent: MoveIntent,
  platforms: readonly Rect[],
  cfg: PhysicsConfig,
  dt: number,
): void {
  // Wall-stick: airborne, touching a wall, and either holding into it or
  // already clinging. Skipped during the wall-jump lockout, or the player
  // re-sticks to the wall they just pushed off.
  const touching = p.onGround || p.wallJumpLock > 0 ? 0 : wallContact(p, platforms);
  const holdingInto = touching !== 0 && Math.sign(intent.moveX) === touching;

  if (touching !== 0 && (holdingInto || p.wallSide === touching)) {
    if (holdingInto) p.wallRelease = 0;
    else p.wallRelease += dt;
    p.wallSide = p.wallRelease > cfg.wallReleaseTime ? 0 : touching;
  } else {
    p.wallSide = 0;
    p.wallRelease = 0;
  }

  const stuck = p.wallSide !== 0;

  if (p.jumpBuffer > 0 && (p.onGround || p.coyote > 0)) {
    p.vel.y = -cfg.jumpImpulse;
    p.jumpBuffer = 0;
    p.coyote = 0;
    p.onGround = false;
  } else if (p.jumpBuffer > 0 && stuck) {
    p.vel.y = -cfg.wallJumpY;
    p.vel.x = -p.wallSide * cfg.wallJumpX;
    p.jumpBuffer = 0;
    p.wallJumpLock = cfg.wallJumpLockTime;
    p.wallSide = 0;
    p.wallRelease = 0;
  }

  if (p.wallSide !== 0) {
    // Clinging: gravity is off and up/down climbs the wall by contact. No
    // input means holding position, which reads as a deliberate grip rather
    // than a slow slide the player has to fight.
    p.vel.y = intent.moveY * cfg.wallClimbSpeed;
    // Pinned horizontally: holding away from the wall feeds the release timer
    // instead of sliding the player off it. Without this the cling breaks as
    // soon as the player drifts out of probe range, which happens in a couple
    // of ticks and leaves wallReleaseTime doing nothing.
    p.vel.x = 0;
  } else {
    p.vel.y = Math.min(p.vel.y + cfg.gravity * dt, cfg.maxFallSpeed);

    if (p.wallJumpLock === 0) {
      const target = intent.moveX * cfg.runSpeed;
      if (intent.moveX !== 0) {
        const accel = p.onGround ? cfg.groundAccel : cfg.airAccel;
        p.vel.x = approach(p.vel.x, target, accel * dt);
      } else {
        const drag = p.onGround ? cfg.groundFriction : cfg.airDrag;
        p.vel.x = approach(p.vel.x, 0, drag * dt);
      }
    }
  }

  const wasOnGround = p.onGround;
  const contact = moveAndCollide(p, platforms, dt);

  p.onGround = contact.landed;
  if (wasOnGround && !p.onGround && p.vel.y >= 0) p.coyote = cfg.coyoteTime;
  if (p.onGround) {
    p.wallSide = 0;
    p.wallRelease = 0;
  }
}
