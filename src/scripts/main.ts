import type { Enemy, Projectile } from "./game/entities";
import {
  damageEnemy,
  enemyHitbox,
  projectileHitbox,
  stepEnemy,
  stepProjectile,
} from "./game/entities";
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

// PLACEHOLDER (deliverable 8 owns real game state): enough of a level cursor to
// play all three levels end to end, which is the only way deliverable 6's
// layouts can be verified at all. Reaching the door advances; dying restarts
// the level rather than the run.
let levelIndex = 0;
let level: Level = LEVELS[levelIndex];
let player = createPlayer(level.playerStart);
let playerHealth = 100;
let enemies: Enemy[] = level.spawnEnemies();
let projectiles: Projectile[] = [];

function loadLevel(index: number): void {
  levelIndex = index;
  level = LEVELS[index];
  player = createPlayer(level.playerStart);
  playerHealth = 100;
  // Fresh instances, so a retry never inherits the last attempt's half-dead
  // boss — see level.ts's spawnEnemies.
  enemies = level.spawnEnemies();
  projectiles = [];
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

// The camera shows a fixed slice of *world*, not a fixed number of pixels.
//
// It used to be a plain translation, which silently made the viewport a
// difficulty setting: at the two marking viewports (1920x1080 and 390x844) the
// desktop player saw +/-960px of world and the phone player +/-195px, a 4.9x
// advantage. Measured, that wasn't a cosmetic difference — on a phone every
// swing anchor and both bosses were off-screen at spawn in levels 2 and 3,
// so the opening frame taught nothing at the size deliverable 11 marks.
//
// Height sets the zoom, because how much *vertical* world you can see is what
// decides whether an overhead anchor is findable, and a phone is not short of
// height. Width only overrides it when the screen is narrow enough that VIEW_H
// would crop the level sideways — which is exactly the portrait case, so a
// phone zooms out instead of cropping. Both numbers are measured, not picked:
// VIEW_H is the smallest that keeps every level's anchors and bosses in the
// desktop opening frame, and MIN_VIEW_W the largest that keeps the player
// above ~20px tall on a phone.
const VIEW_H = 860;
const MIN_VIEW_W = 800;

/** World-pixels-to-screen-pixels for the current viewport. */
function cameraScale(): number {
  return Math.min(canvas.height / VIEW_H, canvas.width / MIN_VIEW_W);
}

/** World coordinate drawn at the screen's top-left corner. */
function cameraOffset(): Vec2 {
  const s = cameraScale();
  const c = playerCenter(player);
  return { x: c.x - canvas.width / (2 * s), y: c.y - (canvas.height * 0.6) / s };
}

function screenToWorld(p: Vec2): Vec2 {
  const s = cameraScale();
  const cam = cameraOffset();
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

function update(dt: number): void {
  if (input.fireWeb) {
    // Re-firing mid-swing: release first so the pendulum's rotation is banked
    // back into linear velocity, which the new attach then inherits.
    if (player.swing) releaseWeb(player, cfg, false);
    const target = resolveWebTarget(playerCenter(player), aimDirection(), webLevel);
    if (target.type === "anchor") {
      attachWeb(player, target.point, cfg);
    } else if (target.type === "enemy" && target.enemy) {
      const hit = enemies.find((e) => e.id === target.enemy!.id);
      // Real damage/removal is deliverable 8's job; here it's enough to prove
      // a resolved 'enemy' shot reaches an enemy's health at all.
      if (hit && damageEnemy(hit, 1)) {
        enemies.splice(enemies.indexOf(hit), 1);
      }
    }
  }

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

  // PLACEHOLDER (deliverable 8 owns win/lose and progression proper): retry on
  // death, advance on the door, wrap at the end so a play session can walk all
  // three layouts without a reload.
  if (player.pos.y > level.killPlaneY || playerHealth <= 0) {
    loadLevel(levelIndex);
  } else if (overlaps(playerRect(player), doorRect(level))) {
    loadLevel((levelIndex + 1) % LEVELS.length);
  }

  resetFrameEvents(input);
}

// PLACEHOLDER (deliverable 7 owns rendering): flat boxes, drawn only so the
// physics can be felt and watched.
function draw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const center = playerCenter(player);
  const cam = cameraOffset();
  ctx.save();
  // Scale before translate, so the translation is in world units.
  ctx.scale(cameraScale(), cameraScale());
  ctx.translate(-cam.x, -cam.y);

  ctx.fillStyle = "#243352";
  for (const plat of level.platforms) ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

  // The door is the level's goal, so it is the one piece of geometry that has
  // to read as different at a glance rather than waiting for deliverable 7.
  const door = doorRect(level);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(door.x, door.y, door.w, door.h);

  if (player.swing) {
    ctx.strokeStyle = "#f5f5f5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(player.swing.anchor.x, player.swing.anchor.y);
    ctx.lineTo(center.x, center.y);
    ctx.stroke();
  }

  // Preview the exact ray the shot will use: resolveWebTarget itself, called
  // before release instead of after, so the line drawn is provably the line
  // that fires rather than a second copy of the aim math.
  if (input.aiming) {
    const target = resolveWebTarget(center, aimDirection(), webLevel);
    ctx.strokeStyle =
      target.type === "anchor"
        ? "#7dffb4"
        : target.type === "enemy"
          ? "#ff6b6b"
          : "rgba(245,245,245,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(target.point.x, target.point.y);
    ctx.stroke();
  }

  // Telegraphing reads as a colour change here; render.ts (deliverable 7)
  // replaces this with the arm-extend/crouch animations the brief requires.
  for (const enemy of enemies) {
    const hitbox = enemyHitbox(enemy);
    const telegraphing = enemy.phase === "melee-telegraph" || enemy.phase === "throw-telegraph" || enemy.phase === "telegraph";
    ctx.fillStyle = telegraphing ? "#ffd166" : enemy.kind === "doc-ock" ? "#8a5cf5" : "#2ec4b6";
    ctx.fillRect(hitbox.x, hitbox.y, hitbox.w, hitbox.h);
  }
  ctx.fillStyle = "#ff6b6b";
  for (const p of projectiles) {
    const hitbox = projectileHitbox(p);
    ctx.fillRect(hitbox.x, hitbox.y, hitbox.w, hitbox.h);
  }

  const box = playerRect(player);
  ctx.fillStyle = player.wallSide !== 0 ? "#ffd166" : "#e63946";
  ctx.fillRect(box.x, box.y, box.w, box.h);

  ctx.restore();

  // PLACEHOLDER (deliverable 7/8 own the real HUD): a bare bar, in screen
  // space, so health changes from this deliverable's attacks are visible
  // without a debugger. fillRect only — the game-loop sensor's recording
  // context stubs just the calls main.ts already made.
  ctx.fillStyle = "rgba(245,245,245,0.25)";
  ctx.fillRect(16, 16, 160, 10);
  ctx.fillStyle = "#7dffb4";
  ctx.fillRect(16, 16, 160 * Math.max(playerHealth, 0) / 100, 10);
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

  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
