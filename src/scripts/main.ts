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

// Stubs — later deliverables replace these: input handling reads real
// devices into `input`, movement/physics mutates `state` in update(), and
// rendering draws `state` in draw().
const input = {};
const state = {};

function update(dt: number): void {
  void dt;
  void input;
  void state;
}

function draw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Fixed timestep so physics (once added) behaves the same regardless of
// display refresh rate; frame time is capped so a backgrounded tab doesn't
// spend minutes "catching up" on resume.
const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 250;
let lastTime = performance.now();
let accumulatorMs = 0;

function loop(now: number): void {
  accumulatorMs += Math.min(now - lastTime, MAX_FRAME_MS);
  lastTime = now;

  while (accumulatorMs >= STEP_MS) {
    update(STEP_MS / 1000);
    accumulatorMs -= STEP_MS;
  }

  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
