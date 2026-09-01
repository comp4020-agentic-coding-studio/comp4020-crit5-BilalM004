import type { Enemy, Projectile } from "./game/entities";
import {
  createDocOck,
  createVenom,
  damageEnemy,
  enemyHitbox,
  projectileHitbox,
  stepEnemy,
  stepProjectile,
} from "./game/entities";
import type { Rect, Vec2 } from "./game/geometry";
import { attachInput, createInputState, resetFrameEvents } from "./game/input";
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

// PLACEHOLDER (deliverable 6 replaces this with level.ts): a scratch layout
// that exercises every part of the physics — a run-up, a block to wall-jump,
// a gap too wide to jump, a high beam to swing from, and a tall wall to climb.
const PLAYER_START: Vec2 = { x: 200, y: 600 };
const KILL_PLANE_Y = 1400;
const platforms: readonly Rect[] = [
  { x: 0, y: 700, w: 900, h: 200 }, // near rooftop
  { x: 1500, y: 700, w: 1200, h: 200 }, // far rooftop, 600px gap between
  { x: 620, y: 380, w: 60, h: 320 }, // wall-jump block
  { x: 1000, y: 180, w: 400, h: 40 }, // beam over the gap: the swing anchor
  { x: 1750, y: 460, w: 260, h: 40 }, // upper ledge
  { x: 2400, y: 200, w: 60, h: 500 }, // tall wall to climb
];

const cfg = DEFAULT_PHYSICS;
const player = createPlayer(PLAYER_START);
// PLACEHOLDER (deliverable 8 owns real game state): a bare number so hits from
// this deliverable's enemies have something to land on, ahead of a real HUD.
let playerHealth = 100;

// PLACEHOLDER (deliverable 6 replaces this with level.ts's per-level configs):
// one of each boss, standing on the two rooftops, so both attack patterns are
// exercised before levels exist to house them properly.
const enemies: Enemy[] = [
  createDocOck({ x: 500, y: 612 }), // 700 - DOC_OCK_H, feet on the near rooftop
  createVenom({ x: 1700, y: 630 }), // 700 - VENOM_H, feet on the far rooftop
];
const projectiles: Projectile[] = [];

const level: WebTargetLevel = {
  platforms,
  get enemies() {
    return enemies.map((e) => ({ id: e.id, hitbox: enemyHitbox(e) }));
  },
};

// The camera is a pure translation that keeps the player at a fixed spot on
// screen. Kept as a function rather than inlined in draw() because aiming has
// to convert a screen-space pointer into the same world space.
function cameraOffset(): Vec2 {
  const c = playerCenter(player);
  return { x: c.x - canvas.width / 2, y: c.y - canvas.height * 0.6 };
}

/** The direction a web shot travels, in world space. */
function aimDirection(): Vec2 {
  if (input.aimMode === "drag") return input.aimVector;
  // Mouse: from the player toward the cursor.
  const cam = cameraOffset();
  const c = playerCenter(player);
  return {
    x: input.aimPoint.x + cam.x - c.x,
    y: input.aimPoint.y + cam.y - c.y,
  };
}

function update(dt: number): void {
  if (input.fireWeb) {
    // Re-firing mid-swing: release first so the pendulum's rotation is banked
    // back into linear velocity, which the new attach then inherits.
    if (player.swing) releaseWeb(player, cfg, false);
    const target = resolveWebTarget(playerCenter(player), aimDirection(), level);
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

  stepPlayer(player, input, platforms, cfg, dt);

  // PLACEHOLDER (deliverable 8 owns the real loss condition): respawn so a
  // fall or a depleted health bar doesn't end the play session.
  if (player.pos.y > KILL_PLANE_Y || playerHealth <= 0) {
    player.pos = { ...PLAYER_START };
    player.vel = { x: 0, y: 0 };
    player.swing = null;
    playerHealth = 100;
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
  ctx.translate(-cam.x, -cam.y);

  ctx.fillStyle = "#243352";
  for (const plat of platforms) ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

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
    const target = resolveWebTarget(center, aimDirection(), level);
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
