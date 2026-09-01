// @vitest-environment jsdom

// SENSOR (not a contract test — this outlives the brief).
//
// A canvas game has a failure mode with no visible symptom: the render loop
// keeps painting while the simulation stops advancing. Nothing throws, the
// canvas is not blank, and every console is clean — it just looks like a
// physics bug in whatever you last touched. This week that cost real time
// twice over: once when a stale dev server served the previous deliverable's
// module, and once when a clock-origin mismatch drove the fixed-timestep
// accumulator negative so update() never ran again.
//
// So this asserts the two things a loop must do, separately:
//   1. it paints repeatedly, and
//   2. what it paints CHANGES — the world is being stepped, not just redrawn.
//
// It deliberately says nothing about what is drawn. Deliverables 6 and 7
// replace the scratch layout and the renderer wholesale; a sensor that
// counted platforms would retire with them, and the standard would go with it.

import { beforeAll, expect, test } from "vitest";

/** One recorded frame: the fill rectangles issued between two clearRect calls. */
type Frame = string[];

const frames: Frame[] = [];
let pendingFrameCallbacks: FrameRequestCallback[] = [];
let loadError: unknown = null;

/** A 2D context that records instead of rasterising. Only the calls main.ts
 *  makes are implemented; the rest are no-ops so a new draw call in a later
 *  deliverable doesn't fail the sensor for the wrong reason. */
function recordingContext(): CanvasRenderingContext2D {
  const ctx = {
    canvas: null,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    clearRect: () => {
      frames.push([]);
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      frames[frames.length - 1]?.push(`${x},${y},${w},${h}`);
    },
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    closePath: () => {},
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

beforeAll(async () => {
  document.body.innerHTML = `
    <canvas id="game"></canvas>
    <div id="touch-controls">
      <div id="joystick-ring"></div>
      <div id="joystick-knob"></div>
      <button id="jump-button"></button>
    </div>`;

  // Via unknown: getContext is an overload set whose other signatures return
  // WebGL/bitmap contexts, so a 2d-only stub can never structurally satisfy it.
  HTMLCanvasElement.prototype.getContext = (() =>
    recordingContext()) as unknown as HTMLCanvasElement["getContext"];

  // jsdom implements neither of these. Stubbing them is test setup, not a
  // workaround for a bug: every browser we target has both.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;

  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    pendingFrameCallbacks.push(cb);
    return pendingFrameCallbacks.length;
  }) as typeof window.requestAnimationFrame;

  try {
    await import("../src/scripts/main.ts");
  } catch (err) {
    loadError = err;
    return;
  }

  // Hold a movement key for the whole recording. Without it this sensor only
  // worked by accident: it was written against a scratch layout that spawned
  // the player in mid-air, so the world moved on its own and a frozen loop was
  // the only way for two frames to match. Deliverable 6's levels spawn the
  // player standing on a roof, and a standing player in an idle world paints
  // the same frame forever — which is correct, and which a frozen accumulator
  // is indistinguishable from. Driving an input is what makes the two
  // distinguishable, and it makes the sensor stronger besides: it now says
  // input reaches the simulation *and* the simulation advances, neither of
  // which depends on where a level happens to put the player.
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));

  // Frame timestamps deliberately start at 0 while performance.now() is
  // already large — the exact disagreement jsdom produces, and the one a
  // browser is only promised to avoid by convention. A loop that assumes the
  // two share an origin computes a negative first delta here and freezes.
  for (let i = 0; i < 20; i += 1) {
    const due = pendingFrameCallbacks;
    pendingFrameCallbacks = [];
    for (const cb of due) cb(i * (1000 / 60));
  }
});

test("the game module loads without throwing", () => {
  // A throw at module scope kills the loop before it starts, and the page
  // shows an empty canvas rather than an error.
  expect(loadError).toBeNull();
});

test("the game paints on every animation frame", () => {
  expect(frames.length).toBeGreaterThan(1);
});

test("the simulation advances, rather than repainting one frozen frame", () => {
  const first = frames.at(0)?.join(" ");
  const last = frames.at(-1)?.join(" ");
  expect(first).toBeDefined();
  expect(last).not.toEqual(first);
});
