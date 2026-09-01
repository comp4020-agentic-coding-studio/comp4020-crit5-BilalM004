import type { Enemy, Projectile } from "./game/entities";
import { WEB_DAMAGE, damageEnemy, enemyHitbox, stepEnemy, stepProjectile } from "./game/entities";
import type { Vec2 } from "./game/geometry";
import { overlaps } from "./game/geometry";
import { attachInput, createInputState, resetFrameEvents } from "./game/input";
import type { Level } from "./game/level";
import { LEVELS, doorRect } from "./game/level";
import {
  DEFAULT_PHYSICS,
  attachWeb,
  createPlayer,
  playerCenter,
  playerRect,
  releaseWeb,
  stepPlayer,
} from "./game/physics";
import type { Facing, WebShot } from "./game/render";
import { cameraFor, cameraScale, createScene, drawFrame } from "./game/render";
import { resolveWebTarget, type WebTargetLevel } from "./game/web";

const canvasEl = document.querySelector<HTMLCanvasElement>("#game");
if (!canvasEl) throw new Error("missing #game canvas");
const canvas: HTMLCanvasElement = canvasEl;

const ctx2d = canvas.getContext("2d");
if (!ctx2d) throw new Error("2d context unavailable");
const ctx: CanvasRenderingContext2D = ctx2d;

function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

const input = createInputState();
attachInput(canvas, input);

const cfg = DEFAULT_PHYSICS;

// Health is a *run* resource, not a level one: it carries from level to level
// and is only restored by starting the run over. That single choice is what
// makes the difficulty curve mean anything — clearing level 2 at 12 health is a
// different level 3 from clearing it at 80, and the player who wants the second
// one has to earn it by dodging rather than by tanking. It also removes the
// degenerate strategy a per-level refill creates, where walking into every
// attack costs nothing as long as you reach the door.
//
// The corollary is that death has to undo the whole run rather than the level,
// because a level-only retry with carried health would be unrecoverable: you
// would respawn at the health that just killed you, forever.
const MAX_HEALTH = 100;

/** `?level=2` starts on level 2. Not a cheat and not shipped UI — there is no
 *  link to it — it exists because levels 2 and 3 are behind a swing and a
 *  wall-climb, so *looking at them* otherwise means playing level 1 first,
 *  every time, including from a headless browser. The viewport check in spec/
 *  uses it, and so does anyone tuning a boss. Clamped, so a typo starts at 1
 *  rather than crashing on an undefined level. */
function startingLevel(): number {
  const raw = new URLSearchParams(window.location.search).get("level");
  const n = raw === null ? 1 : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 1), LEVELS.length) - 1;
}

/** Where a run begins and, therefore, where death sends you back to. Normally
 *  level 1; `?level=N` moves it so that inspecting a boss headlessly does not
 *  mean replaying the whole game every time something kills you. */
const RUN_START = startingLevel();

let levelIndex = RUN_START;
let level: Level = LEVELS[levelIndex];
let player = createPlayer(level.playerStart);
let playerHealth = MAX_HEALTH;
let enemies: Enemy[] = level.spawnEnemies();
let projectiles: Projectile[] = [];

// --- The web shot ------------------------------------------------------------
//
// A fired web used to be instantaneous: the frame you released, either a rope
// existed or an enemy lost health, with nothing drawn in between. For the swing
// that was survivable, because the rope itself is the feedback. For a shot at an
// enemy it meant the game's one offensive action had *no* animation at all —
// the only evidence a shot happened was a health pip going out, 14px above a
// head nobody is looking at.
//
// So the strand now travels. What it must not do is delay the swing: the tuned
// physics from deliverable 3 was signed off with attachment on the release
// frame, and deferring it would both change that feel and open a real bug —
// the player keeps moving during the flight, so by arrival they can be outside
// `maxRopeLength`, where `attachWeb` silently refuses and the shot just does
// nothing. Hence two commit times behind one animation: an anchor commits at
// fire and the strand catches up to a rope that already exists, while an enemy
// or a miss commits on arrival, which is the case where travel time is the
// point. The player sees one mechanic; only the physics can tell them apart.
const WEB_SHOT_SPEED = 3400; // px/s
const WEB_SHOT_FADE_MS = 140;

interface ShotState extends WebShot {
  /** Distance from the firing point, so `progress` is a real speed rather than
   *  a fixed duration — a shot across the map should not arrive as fast as one
   *  at your feet. */
  dist: number;
  /** Damage owed on arrival. Carried as an id, not a reference: the enemy can
   *  be gone by the time the strand lands. */
  hitEnemyId: string | null;
}

let webShot: ShotState | null = null;

// Which way the figure is drawn. Kept here rather than derived in render.ts
// because it has to be *sticky*: velocity crosses zero every time the player
// stops, and a facing recomputed from the sign of vel.x flips the sprite on
// the frame a run ends. The threshold is a deadband, not a smoothing filter —
// below it the last committed direction stands.
let facing: Facing = 1;
const FACING_SPEED = 24;

/** Load a level, keeping the run's health. Everything else is rebuilt. */
function loadLevel(index: number): void {
  levelIndex = index;
  level = LEVELS[index];
  player = createPlayer(level.playerStart);
  // Level 1 spawns with the whole lesson to the right, and levels 2 and 3 with
  // the boss there, so a fresh load always faces right.
  facing = 1;
  // Fresh instances, so a retry never inherits the last attempt's half-dead
  // boss — see level.ts's spawnEnemies.
  enemies = level.spawnEnemies();
  projectiles = [];
  // A strand still travelling toward the last level's geometry would otherwise
  // land, on this level, at a coordinate that means nothing here.
  webShot = null;
}

/** Back to the start, at full health. The only thing that refills the bar. */
function startRun(): void {
  playerHealth = MAX_HEALTH;
  loadLevel(RUN_START);
}

// level.ts's Level satisfies web.ts's WebTargetLevel apart from `enemies`,
// which targeting wants as hitboxes and the level stores as live entities.
const webLevel: WebTargetLevel = {
  get platforms() {
    return level.platforms;
  },
  get enemies() {
    return enemies.map((e) => ({ id: e.id, hitbox: enemyHitbox(e) }));
  },
};

// The camera itself lives in render.ts (it is the number every draw function is
// sized against, and the viewport check has to use the same one). This is the
// wiring: it follows the player.
function view() {
  return cameraFor(playerCenter(player), canvas.width, canvas.height);
}

function screenToWorld(p: Vec2): Vec2 {
  const s = cameraScale(canvas.width, canvas.height);
  const { cam } = view();
  return { x: p.x / s + cam.x, y: p.y / s + cam.y };
}

/** The direction a web shot travels, in world space. */
function aimDirection(): Vec2 {
  // A drag is a screen-space vector, and zoom is uniform, so its direction is
  // already the world direction — converting it would divide both components
  // by the same scale and change nothing.
  if (input.aimMode === "drag") return input.aimVector;
  // Mouse: from the player toward the cursor.
  const c = playerCenter(player);
  const w = screenToWorld(input.aimPoint);
  return { x: w.x - c.x, y: w.y - c.y };
}

/** Advance the strand, and settle up when it lands.
 *
 *  The damage is applied here rather than at fire time so that "the web reached
 *  him" and "he took a hit" are the same event on screen. A shot resolved on
 *  release and animated afterwards would light the hit flash before the strand
 *  had left the hand, which is the sort of thing nobody consciously notices and
 *  everybody feels as the hit not landing properly. */
function stepWebShot(dt: number): void {
  const shot = webShot;
  if (!shot) return;

  // An attached strand belongs to the rope now. Once it has caught up, or the
  // player has let go, there is nothing left for it to animate.
  if (shot.attached && (shot.progress >= 1 || !player.swing)) {
    webShot = null;
    return;
  }

  if (shot.progress < 1) {
    shot.progress = Math.min(1, shot.progress + (WEB_SHOT_SPEED * dt) / Math.max(shot.dist, 1));
    if (shot.progress >= 1 && shot.hitEnemyId !== null) {
      const hit = enemies.find((e) => e.id === shot.hitEnemyId);
      if (hit && damageEnemy(hit, WEB_DAMAGE)) enemies.splice(enemies.indexOf(hit), 1);
      shot.hitEnemyId = null;
    }
    return;
  }

  // Landed and unattached: hold the splat briefly, then let it go. Without the
  // hold, a strand that vanishes on the frame it arrives makes the entire
  // animation a single-frame flicker at the far end.
  shot.fade -= (dt * 1000) / WEB_SHOT_FADE_MS;
  if (shot.fade <= 0) webShot = null;
}

function update(dt: number): void {
  if (input.fireWeb) {
    // Re-firing mid-swing: release first so the pendulum's rotation is banked
    // back into linear velocity, which the new attach then inherits.
    if (player.swing) releaseWeb(player, cfg, false);
    const origin = playerCenter(player);
    const target = resolveWebTarget(origin, aimDirection(), webLevel);
    if (target.type === "anchor") attachWeb(player, target.point, cfg);
    webShot = {
      to: target.point,
      progress: 0,
      fade: 1,
      attached: target.type === "anchor" && Boolean(player.swing),
      dist: Math.hypot(target.point.x - origin.x, target.point.y - origin.y),
      hitEnemyId: target.type === "enemy" ? (target.enemy?.id ?? null) : null,
    };
  }

  stepWebShot(dt);

  for (const enemy of enemies) {
    const result = stepEnemy(enemy, { hitbox: playerRect(player) }, dt);
    if (result.hitPlayer) playerHealth -= result.damage;
    if (result.spawnedProjectile) projectiles.push(result.spawnedProjectile);
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const result = stepProjectile(p, { hitbox: playerRect(player) }, dt);
    if (result.hitPlayer) playerHealth -= p.damage;
    if (result.done) projectiles.splice(i, 1);
  }

  stepPlayer(player, input, level.platforms, cfg, dt);

  if (player.vel.x > FACING_SPEED) facing = 1;
  else if (player.vel.x < -FACING_SPEED) facing = -1;

  // Falling and running out of health are the same outcome, deliberately: two
  // ways to lose that cost different amounts would push the player toward the
  // cheap one.
  if (player.pos.y > level.killPlaneY || playerHealth <= 0) {
    startRun();
  } else if (enemies.length === 0 && overlaps(playerRect(player), doorRect(level))) {
    // The door only counts once the level is clear. Without that gate every
    // enemy is optional — the fastest route through a rooftop with a gunman on
    // it is to swing straight past him — and an enemy you can ignore is not
    // difficulty, it is scenery. render.ts draws the door barred until this is
    // true, so the rule is visible rather than merely enforced.
    if (levelIndex === LEVELS.length - 1) startRun();
    else loadLevel(levelIndex + 1);
  }

  resetFrameEvents(input);
}

// render.ts (deliverable 7) owns every pixel; this is the wiring — camera,
// facing, and the one aim query the preview needs.
function draw(timeMs: number): void {
  const scene = createScene(ctx, cameraScale(canvas.width, canvas.height), timeMs);

  // The preview calls resolveWebTarget itself, on this frame's aim, so the
  // dotted line drawn is provably the ray the shot will use rather than a
  // second copy of the aim math.
  const aim = input.aiming
    ? resolveWebTarget(playerCenter(player), aimDirection(), webLevel)
    : null;

  drawFrame(scene, view(), {
    level,
    player,
    facing,
    enemies,
    projectiles,
    aim,
    shot: webShot,
    hud: {
      health: playerHealth,
      maxHealth: MAX_HEALTH,
      levelName: level.name,
      levelIndex,
      levelCount: LEVELS.length,
    },
  });
}

// Fixed timestep so physics behaves the same regardless of display refresh
// rate; frame time is capped so a backgrounded tab doesn't spend minutes
// "catching up" on resume.
const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 250;
// Seeded from the first frame's own timestamp rather than performance.now():
// the two only share a time origin by convention, and if they disagree the
// first delta is negative, the accumulator goes negative, and update() never
// runs again — a frozen game that still paints, which looks like a physics bug
// rather than a clock bug. Clamping below at 0 makes that unrepresentable.
let lastTime: number | null = null;
let accumulatorMs = 0;

function loop(now: number): void {
  if (lastTime === null) lastTime = now;
  accumulatorMs += Math.min(Math.max(now - lastTime, 0), MAX_FRAME_MS);
  lastTime = now;

  while (accumulatorMs >= STEP_MS) {
    update(STEP_MS / 1000);
    accumulatorMs -= STEP_MS;
  }

  draw(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
