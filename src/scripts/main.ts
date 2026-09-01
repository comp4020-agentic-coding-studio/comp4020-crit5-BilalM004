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

// PLACEHOLDER (deliverable 4 replaces this with web.ts's resolveWebTarget):
// march along the aim ray and take the first point inside a platform. Good
// enough to feel the swing; the real one also resolves enemies and misses.
const WEB_RANGE = 520;
function findAnchor(origin: Vec2, aim: Vec2): Vec2 | null {
  const len = Math.hypot(aim.x, aim.y);
  if (len < 1) return null;
  const dir = { x: aim.x / len, y: aim.y / len };
  for (let d = 0; d <= WEB_RANGE; d += 6) {
    const point = { x: origin.x + dir.x * d, y: origin.y + dir.y * d };
    for (const plat of platforms) {
      if (
        point.x >= plat.x &&
        point.x <= plat.x + plat.w &&
        point.y >= plat.y &&
        point.y <= plat.y + plat.h
      ) {
        return point;
      }
    }
  }
  return null;
}

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
    const anchor = findAnchor(playerCenter(player), aimDirection());
    if (anchor) attachWeb(player, anchor, cfg);
  }

  stepPlayer(player, input, platforms, cfg, dt);

  // PLACEHOLDER (deliverable 8 owns the real loss condition): respawn so a
  // fall doesn't end the play session.
  if (player.pos.y > KILL_PLANE_Y) {
    player.pos = { ...PLAYER_START };
    player.vel = { x: 0, y: 0 };
    player.swing = null;
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

  // Preview the exact ray the shot will use, so what you see is what fires.
  if (input.aiming) {
    const aim = aimDirection();
    const anchor = findAnchor(center, aim);
    ctx.strokeStyle = anchor ? "#7dffb4" : "rgba(245,245,245,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    const len = Math.hypot(aim.x, aim.y) || 1;
    const end = anchor ?? {
      x: center.x + (aim.x / len) * WEB_RANGE,
      y: center.y + (aim.y / len) * WEB_RANGE,
    };
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  const box = playerRect(player);
  ctx.fillStyle = player.wallSide !== 0 ? "#ffd166" : "#e63946";
  ctx.fillRect(box.x, box.y, box.w, box.h);

  ctx.restore();
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
