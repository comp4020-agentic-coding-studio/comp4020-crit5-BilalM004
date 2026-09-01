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

/** One recorded frame: every coordinate-bearing canvas call issued between two
 *  clearRect calls. */
type Frame = string[];

const frames: Frame[] = [];
let pendingFrameCallbacks: FrameRequestCallback[] = [];
let loadError: unknown = null;

/** A 2D context that records instead of rasterising.
 *
 *  It records the *arguments* of every call that carries a coordinate, and
 *  no-ops everything else. That is wider than it needs to be on purpose:
 *  deliverable 7 draws the player as a translated path rather than an absolute
 *  fillRect, so a recorder that logged only fillRect went camera-invariant —
 *  the world transform is a translate() this stub throws away, which leaves
 *  every rooftop's fillRect at the same world coordinates frame after frame.
 *  The sensor would have kept passing on the parallax background alone and
 *  stopped watching the thing it was written to watch.
 *
 *  Recording transforms and path points instead keeps it saying nothing about
 *  *what* is drawn — the deliberate choice above — while making "the player
 *  moved" the signal it actually reads. */
function recordingContext(): CanvasRenderingContext2D {
  const log = (...args: number[]): void => {
    frames[frames.length - 1]?.push(args.map((n) => Math.round(n * 100) / 100).join(","));
  };
  const ctx = {
    canvas: null,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    lineDashOffset: 0,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    clearRect: () => {
      frames.push([]);
    },
    fillRect: log,
    strokeRect: log,
    translate: log,
    rotate: log,
    moveTo: log,
    lineTo: log,
    arc: log,
    ellipse: log,
    quadraticCurveTo: log,
    fillText: (_text: string, x: number, y: number) => log(x, y),
    save: () => {},
    restore: () => {},
    scale: () => {},
    beginPath: () => {},
    stroke: () => {},
    fill: () => {},
    closePath: () => {},
    setLineDash: () => {},
    // Clipping is a no-op here for the same reason `scale` is: this stub records
    // coordinates and has no raster to mask. Its absence is what made the sensor
    // fail the first time the renderer clipped a path — and that failure was
    // worth having, because it is the shape of failure this stub should give.
    // It throws on a call it does not know rather than silently recording a
    // partial frame, so a missing method is a named error and not a passing test
    // that quietly stopped watching half the draw.
    clip: () => {},
    // Gradients are opaque handles as far as this stub cares: the renderer only
    // ever builds one and assigns it to fillStyle.
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
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

/** The largest single-coordinate difference between two frames, compared call
 *  for call. Frames whose call counts differ at all count as changed. */
function maxCoordDelta(a: Frame, b: Frame): number {
  const nums = (f: Frame): number[] => f.flatMap((row) => row.split(",").map(Number));
  const x = nums(a);
  const y = nums(b);
  if (x.length !== y.length) return Number.POSITIVE_INFINITY;
  let worst = 0;
  for (let i = 0; i < x.length; i += 1) worst = Math.max(worst, Math.abs(x[i] - y[i]));
  return worst;
}

test("the simulation advances, rather than repainting one frozen frame", () => {
  const first = frames.at(0);
  const last = frames.at(-1);
  expect(first).toBeDefined();
  expect(last).toBeDefined();

  // A *magnitude*, not just inequality, and that distinction is the whole
  // reason this assertion was rewritten in deliverable 7. The renderer now has
  // decorative motion driven by wall-clock time rather than by the simulation —
  // breathing, a swaying tentacle, a twinkling star — and wall-clock time keeps
  // advancing while a frozen accumulator paints the same world forever. Plain
  // inequality would have been satisfied by a 0.5px breathing bob, so the
  // sensor would have gone green on exactly the bug it exists to catch. It
  // survived the mutation check by luck: a frozen game leaves the player in the
  // one pose that happens to have no time term in it.
  //
  // 4px is comfortably above every decorative amplitude in render.ts (the
  // largest is a 4px tentacle sway, which moves ~0.07px per frame) and far
  // below what one held movement key buys in 20 frames (~87px at the tuned
  // runSpeed). It is a floor on "the world moved", not a measurement of it.
  expect(maxCoordDelta(first!, last!)).toBeGreaterThan(4);
});
