// Rendering: everything the game puts on the canvas. Draw functions only —
// they read state and issue canvas calls, and never mutate the world. Same
// discipline as physics.ts/entities.ts inverted: those modules never touch a
// canvas, this one never touches the simulation, so main.ts's draw() can run
// twice on one step (or not at all) without the game diverging.
//
// The characters are procedural shapes, not sprites — the brief's decision, and
// the right one twice over: colour and pose are the clearest wordless telegraph
// available, and there is no art pipeline to keep in sync with hitboxes that
// physics.ts owns.
//
// ## Everything here is sized for the phone, not the desktop
//
// The camera (main.ts) zooms to fit, so at the two marking viewports the same
// world pixel is ~1.26 screen px on 1920x1080 and ~0.49 on 390x844. Measured,
// that means the player is drawn **13x20px** and Doc Ock **31x43px** on a
// phone. Two consequences run through every function below:
//
//   1. What must read at that size is *colour blocking and silhouette*. Red
//      mass over blue mass with two white eyes is Spider-Man at 13px wide; a
//      web pattern is not. So fine linework (web lines, windows, rivets, the
//      chest spider) is gated behind `Scene.detail`, and nothing load-bearing
//      is ever gated behind it.
//   2. A stroke width in world units is *divided* by 2 on a phone. Every
//      stroke that has to stay visible goes through lineW(), which floors it
//      at ~1.3 screen px. That is why Scene carries `scale` at all.
//
// The telegraphs are the sharp end of that: the brief calls them the primary
// no-tutorial fairness mechanic for combat, so each one changes **colour** (a
// hazard flash, which survives 31px), **pose** (arms extending, a crouch
// deepening — progressive, so the wind-up reads as a wind-up and not a
// state-change) and for Doc Ock's melee, draws its own **reach ring**, which
// tells the player where "out of range" is without a word of text.

import type { DocOckEnemy, Enemy, GunmanEnemy, Projectile, VenomEnemy } from "./entities";
import {
  DOC_OCK_H,
  DOC_OCK_W,
  GUNMAN_H,
  GUNMAN_MUZZLE_DX,
  GUNMAN_MUZZLE_DY,
  GUNMAN_W,
  HIT_FLASH_MS,
  WEB_DAMAGE,
  PROJECTILE_H,
  PROJECTILE_W,
  VENOM_H,
  VENOM_W,
  enemyHitbox,
  gunmanFacing,
  gunmanMuzzle,
} from "./entities";
import type { Rect, Vec2 } from "./geometry";
import { rectCenter } from "./geometry";
import type { Level } from "./level";
import { doorRect } from "./level";
import type { PlayerState } from "./physics";
import { PLAYER_H, PLAYER_W, playerCenter } from "./physics";
import type { WebTarget } from "./web";

// --- Scene ------------------------------------------------------------------

/** Everything a draw function needs besides the thing it is drawing. Passed
 *  rather than kept module-global so the renderer stays re-entrant and a test
 *  can call any one function with a stub context. */
export interface Scene {
  ctx: CanvasRenderingContext2D;
  /** World-px to screen-px for this frame. Only used to keep strokes and text
   *  legible when the camera zooms out; never to change layout. */
  scale: number;
  /** False when the zoom would render fine linework sub-pixel. Detail is
   *  decoration only — the silhouette and every telegraph read without it. */
  detail: boolean;
  /** Seconds. Drives idle motion (breathing, flicker, the door's pulse) that
   *  no simulation state carries. */
  time: number;
}

/** World coordinate at the screen's top-left, plus the viewport in CSS px. */
export interface Viewport {
  w: number;
  h: number;
  cam: Vec2;
}

export function createScene(
  ctx: CanvasRenderingContext2D,
  scale: number,
  timeMs: number,
): Scene {
  // 0.8 is where a 1px world line stops surviving the downscale. Below it the
  // detail work costs draw calls and returns mush.
  return { ctx, scale, detail: scale > 0.8, time: timeMs / 1000 };
}

// --- Camera -----------------------------------------------------------------
//
// The camera shows a fixed slice of *world*, not a fixed number of pixels.
//
// It used to be a plain translation, which silently made the viewport a
// difficulty setting: at the two marking viewports (1920x1080 and 390x844) the
// desktop player saw +/-960px of world and the phone player +/-195px, a 4.9x
// advantage. Measured, that wasn't a cosmetic difference — on a phone every
// swing anchor and both bosses were off-screen at spawn in levels 2 and 3, so
// the opening frame taught nothing at the size deliverable 11 marks.
//
// Height sets the zoom, because how much *vertical* world you can see is what
// decides whether an overhead anchor is findable, and a phone is not short of
// height. Width only overrides it when the screen is narrow enough that VIEW_H
// would crop the level sideways — which is exactly the portrait case, so a
// phone zooms out instead of cropping. Both numbers are measured, not picked:
// VIEW_H is the smallest that keeps every level's anchors and bosses in the
// desktop opening frame, and MIN_VIEW_W the largest that keeps the player above
// ~20px tall on a phone.
//
// This lives in render.ts rather than main.ts because "how big is a world pixel
// on screen" is the number every function in this file is sized against, and
// because anything that wants to reproduce a true-to-life frame off-line (the
// viewport check in spec/) has to use the same camera the game does or it is
// measuring a picture the player never sees.

export const VIEW_H = 860;
export const MIN_VIEW_W = 800;

/** World-px to screen-px for a viewport of this size. */
export function cameraScale(w: number, h: number): number {
  return Math.min(h / VIEW_H, w / MIN_VIEW_W);
}

/** The viewport that frames `center`. Vertically biased (0.6 rather than 0.5)
 *  so more of the world *above* the player is visible than below: anchors are
 *  overhead, and the ground the player is standing on needs no room. */
export function cameraFor(center: Vec2, w: number, h: number): Viewport {
  const s = cameraScale(w, h);
  return { w, h, cam: { x: center.x - w / (2 * s), y: center.y - (h * 0.6) / s } };
}

// --- Palette ----------------------------------------------------------------
//
// Named by role, not by hue, so a contrast fix is one edit. The city is cool
// and desaturated on purpose: every character and every telegraph is warm and
// saturated, so "thing that can hurt me" and "thing I can stand on" separate
// by colour temperature before shape is even resolvable.

const SKY_TOP = "#080c1f";
const SKY_MID = "#182046";
const SKY_LOW = "#4a3160";
const SKY_HAZE = "#8a4a5c";
const STAR = "#cfd8ff";
const MOON = "#f2ecd8";

const CITY_FAR = "#141a35";
const CITY_MID = "#1a2140";
const CITY_NEAR = "#0e1329";

const FACADE = "#28324f";
const FACADE_SHADE = "#1d2540";
const ROOF = "#3a4770";
const ROOF_LIP = "#7285c2";
const WINDOW_LIT = "#ffd98a";
const WINDOW_DARK = "#1a2240";

const GIRDER = "#4b5578";
const GIRDER_SHADE = "#2b3352";

const VOID_FOG = "#050812";

const DOOR_FRAME = "#8a6a2c";
const DOOR_LIGHT = "#ffd166";
const DOOR_CORE = "#fff6d5";
// The sealed door. Cold and desaturated against the gold, so "shut" and "open"
// differ in hue *and* value — the pair has to survive being 22px wide.
const DOOR_FRAME_COLD = "#39405c";
const DOOR_SEALED = "#232a44";
const DOOR_BAR = "#6a7490";

const SUIT_RED = "#e02b2b";
const SUIT_RED_SHADE = "#a01d1d";
const SUIT_BLUE = "#2b45d8";
const SUIT_BLUE_SHADE = "#1b2c96";
const SUIT_LINE = "#12061a";
const EYE = "#f4f7ff";
const EYE_RIM = "#141018";

const OCK_COAT = "#4f8140";
const OCK_COAT_SHADE = "#33562a";
const OCK_TROUSER = "#2b4423";
const OCK_SKIN = "#e6c3a0";
const OCK_HAIR = "#59391f";
const OCK_GLASS = "#101319";
const TENTACLE = "#b9c4cf";
const TENTACLE_SHADE = "#67727e";

const VENOM_BODY = "#0d0d16";
const VENOM_SHEEN = "#232338";
const VENOM_WHITE = "#eef1fa";
const VENOM_TONGUE = "#c42b58";

// The gunman. Cold blues and greys on purpose: Doc Ock owns green, Venom owns
// black-and-white, and this one has to be identifiable as "not either of those"
// from a silhouette the size of the player's.
// The gunman. This started as cold blue-greys, on the reasoning that Doc Ock
// owns green and Venom owns black-and-white so the third enemy should take the
// remaining slot. The screenshots said otherwise: #3b4664 is within a few points
// of ROOF (#3a4770) and FACADE (#28324f), and the sky he stands against is
// #182046 — so a cold enemy was a man-shaped piece of architecture, dim at
// desktop and nearly gone at phone scale. Warm brown is the only family the city
// does not already use, and it separates him from the other two enemies and from
// the player's saturated red at the same time. The lesson is one the player
// figures kept teaching: the palette is not chosen against the other characters,
// it is chosen against the *background*, which is most of the screen.
const GUN_COAT = "#7a5238";
const GUN_COAT_SHADE = "#4e3222";
const GUN_TROUSER = "#2c2a33";
const GUN_SKIN = "#e0ab7d";
const GUN_SKIN_SHADE = "#9c6f4c";
const GUN_MASK = "#171a26";
const GUN_METAL = "#a8b0c4";
const MUZZLE_FLASH = "#ffe9a8";

const BLOCK_FACE = "#8d99a6";
const BLOCK_SHADE = "#5c6874";
const BLOCK_REBAR = "#b06a3b";
const SLUG_CORE = "#fff8dd";
// Bright enough to be alarming rather than decorative. At 0.42 the tracer was a
// tasteful smudge on a dark sky, which is the wrong register for the only thing
// on screen that is currently taking health off you.
const SLUG_TRAIL = "rgba(255,186,72,0.62)";

// Two hazard hues, one per attack, because both of Doc Ock's telegraphs now
// flash a *mass* rather than a line (see drawDocOck) and two identical flashes
// would be one ambiguous warning. Yellow means something is coming through the
// air; orange means something is coming at arm's length, and it matches the
// reach ring drawn at the same moment.
// Each pair flickers between itself. Both members are *saturated* — the first
// version paired a warning colour with a near-white one, which reads fine on a
// 2px rim and not at all on Doc Ock's coat: alternating green and cream, he
// looked like he was changing outfits rather than winding up. On a mass the
// hue has to stay put and the value move, so the eye keeps reading "warning"
// through the whole flicker.
const HAZARD = "#ffd166";
const HAZARD_DEEP = "#dc8f0a";
const REACH_RING = "#ff9f1c";
const MELEE_WARN = "#ff7a1c";
const MELEE_DEEP = "#c93c08";

const WEB_LINE = "#f2f5ff";

const HUD_TRACK = "rgba(8,12,28,0.72)";
const HUD_EDGE = "rgba(244,247,255,0.28)";
const HP_HIGH = "#57d98a";
const HP_MID = "#ffd166";
const HP_LOW = "#e5484d";
const HUD_TEXT = "rgba(232,238,255,0.78)";

// --- Small maths ------------------------------------------------------------

const TAU = Math.PI * 2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOut(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - (1 - c) * (1 - c);
}

/** Deterministic pseudo-random in [0,1). The skyline and the lit windows are
 *  generated rather than authored, and they must be *stable*: seeding from
 *  Math.random() would reshuffle the city every frame. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A stroke width in world units, floored so it survives the phone's zoom.
 *  1.3 screen px rather than 1: a hairline on a high-DPI phone disappears into
 *  the background it is drawn over. */
function lineW(s: Scene, world: number): number {
  return Math.max(world, 1.3 / s.scale);
}

// --- Shape helpers ----------------------------------------------------------

/** Two-segment limb (shoulder-elbow-hand or hip-knee-foot) as one round-capped
 *  stroke. Round caps are what make a stroked polyline read as a limb with
 *  joints instead of a bent stick. */
function limb(s: Scene, a: Vec2, b: Vec2, c: Vec2, w: number, color: string): void {
  const { ctx } = s;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
}

/** One segment, for a boot or a forearm drawn in a second colour over a limb. */
function segment(s: Scene, a: Vec2, b: Vec2, w: number, color: string): void {
  const { ctx } = s;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** The red boot: the ankle-down end of a leg, never the whole shin.
 *
 *  This started as a full-length `segment(knee, foot)` and it was measured
 *  wrong, not drawn wrong: with red boots covering the entire lower leg and red
 *  arms, the figure came out roughly 80% red, and the blue — which is half of
 *  what makes a red-and-blue figure Spider-Man rather than a red one — survived
 *  only as a thumbprint between the hips. At 20px on a phone it vanished
 *  outright and the player read as a red smear. */
function boot(s: Scene, knee: Vec2, foot: Vec2, w: number, color: string): void {
  segment(s, { x: lerp(knee.x, foot.x, 0.5), y: lerp(knee.y, foot.y, 0.5) }, foot, w, color);
}

/** A tapered quad between two joints — the torso, built from bands so the suit
 *  can change colour partway down without a second silhouette to keep aligned. */
function band(s: Scene, a: Vec2, b: Vec2, wa: number, wb: number, fill: string): void {
  const { ctx } = s;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 0.5;
  const ny = (dx / len) * 0.5;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.x + nx * wa, a.y + ny * wa);
  ctx.lineTo(b.x + nx * wb, b.y + ny * wb);
  ctx.lineTo(b.x - nx * wb, b.y - ny * wb);
  ctx.lineTo(a.x - nx * wa, a.y - ny * wa);
  ctx.closePath();
  ctx.fill();
}

function disc(s: Scene, c: Vec2, r: number, fill: string): void {
  const { ctx } = s;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, TAU);
  ctx.fill();
}

/** A point on the quadratic through a, control b, c. */
function quadAt(a: Vec2, b: Vec2, c: Vec2, u: number): Vec2 {
  const m = 1 - u;
  return {
    x: m * m * a.x + 2 * m * u * b.x + u * u * c.x,
    y: m * m * a.y + 2 * m * u * b.y + u * u * c.y,
  };
}

/** One of Doc Ock's arms: a dark casing, a lit core inside it, and segment
 *  bands across the casing.
 *
 *  The casing is the part that matters. The first version was a single pale
 *  stroke with a thin darker line laid over it, and at every zoom that is what
 *  a bare arm looks like — a smooth tapering limb. Machinery reads as machinery
 *  because it is *jointed and cased*: a hard edge all the way round and visible
 *  segments along the length. Neither of those costs anything at 31px, where
 *  the casing is simply what makes the arm thick enough to see. */
function tentacle(s: Scene, a: Vec2, b: Vec2, c: Vec2, w: number, color: string): void {
  const { ctx } = s;
  ctx.lineCap = "round";
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? TENTACLE_SHADE : color;
    ctx.lineWidth = pass === 0 ? w + 2.6 : w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(b.x, b.y, c.x, c.y);
    ctx.stroke();
  }

  if (!s.detail) return;
  ctx.strokeStyle = TENTACLE_SHADE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 1; k <= 5; k += 1) {
    const p = quadAt(a, b, c, k / 6);
    const q = quadAt(a, b, c, k / 6 + 0.03);
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const nx = (-(q.y - p.y) / len) * (w / 2);
    const ny = ((q.x - p.x) / len) * (w / 2);
    ctx.moveTo(p.x - nx, p.y - ny);
    ctx.lineTo(p.x + nx, p.y + ny);
  }
  ctx.stroke();
}

/** Two prongs on the end of a tentacle, opening with `open`.
 *
 *  Two, not the three it used to have. Three splayed prongs on the end of a
 *  limb held up and outward is a hand with spread fingers, and that is exactly
 *  what the melee telegraph looked like: a man surrendering, in bright yellow.
 *  A pincer is a tool, and a tool on the end of an arm is a machine. */
function pincer(s: Scene, ctrl: Vec2, tip: Vec2, open: number, color: string): void {
  const { ctx } = s;
  const ang = Math.atan2(tip.y - ctrl.y, tip.x - ctrl.x);
  ctx.lineCap = "round";
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? TENTACLE_SHADE : color;
    ctx.lineWidth = pass === 0 ? 4.8 : 2.6;
    ctx.beginPath();
    for (const k of [-1, 1]) {
      const a = ang + k * 0.3 * open;
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x + Math.cos(a) * 8, tip.y + Math.sin(a) * 8);
    }
    ctx.stroke();
  }
}

/** An almond eye: two quadratic curves, so it has the swept comic-book shape
 *  rather than reading as a circle. Angled outward — the tilt is most of what
 *  makes the mask look like a mask at 20px tall. */
function almond(
  s: Scene,
  c: Vec2,
  w: number,
  h: number,
  tilt: number,
  fill: string,
  rim: string | null,
): void {
  const { ctx } = s;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.quadraticCurveTo(-w / 6, -h / 2, w / 2, -h * 0.12);
  ctx.quadraticCurveTo(-w / 6, h / 2, -w / 2, 0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (rim) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = lineW(s, 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Sky and skyline --------------------------------------------------------
//
// Background is drawn in *screen* space, before the world transform, because
// parallax is a screen-space effect: a layer's job is to move by a fraction of
// the camera, and expressing that in world coordinates means undoing the very
// transform you just applied.

/** World y the background city stands on. Chosen just under the playable
 *  rooftops (levels put roofs at y 560-700), so the skyline sits behind and
 *  below the level rather than cutting across it. */
const HORIZON_Y = 815;

/** Screen y of a background layer's ground line. `p` is the parallax factor:
 *  1 = glued to the world, 0 = glued to the screen. Interpolating between the
 *  two (rather than scaling cam.y) is what keeps a distant layer from sliding
 *  off the top of the screen when the player takes a long fall. */
function layerGroundY(view: Viewport, s: Scene, p: number): number {
  const world = (HORIZON_Y - view.cam.y) * s.scale;
  return world * p + view.h * 0.74 * (1 - p);
}

export function drawSky(s: Scene, view: Viewport): void {
  const { ctx } = s;
  const grad = ctx.createLinearGradient(0, 0, 0, view.h);
  grad.addColorStop(0, SKY_TOP);
  grad.addColorStop(0.45, SKY_MID);
  grad.addColorStop(0.8, SKY_LOW);
  grad.addColorStop(1, SKY_HAZE);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, view.w, view.h);

  // Stars: nearly fixed to the screen (p = 0.03), so they read as infinitely
  // far away rather than as a nearby layer moving slowly.
  const starGround = layerGroundY(view, s, 0.03);
  ctx.fillStyle = STAR;
  for (let i = 0; i < 70; i += 1) {
    const x = hash01(i * 3.1) * view.w;
    const y = hash01(i * 7.7 + 5) * Math.max(starGround * 0.8, 1);
    // Twinkle from a per-star phase, so they don't pulse in unison.
    const a = 0.25 + 0.55 * Math.abs(Math.sin(s.time * 0.6 + hash01(i) * TAU));
    ctx.globalAlpha = a;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;

  // A full moon with a soft halo, not a crescent: a crescent needs a bite
  // taken out in the sky's own colour, and the sky is a gradient, so the bite
  // would only match at one height.
  const moon = { x: view.w * 0.78, y: Math.max(starGround * 0.28, view.h * 0.08) };
  // Sized off the *smaller* viewport dimension. Off height alone, a portrait
  // phone got a 30px moon with a 120px halo — a quarter of the screen's width
  // of glow, which read as a light source in the level rather than as scenery.
  const r = clamp(Math.min(view.w, view.h) * 0.035, 11, 44);
  const halo = ctx.createRadialGradient(moon.x, moon.y, r, moon.x, moon.y, r * 4);
  halo.addColorStop(0, "rgba(242,236,216,0.28)");
  halo.addColorStop(1, "rgba(242,236,216,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(moon.x - r * 4, moon.y - r * 4, r * 8, r * 8);
  disc(s, moon, r, MOON);
}

interface SkylineLayer {
  p: number;
  color: string;
  step: number;
  minH: number;
  maxH: number;
  seed: number;
  /** Lit windows on this layer, if the zoom can show them. */
  windows: boolean;
}

const SKYLINE: readonly SkylineLayer[] = [
  { p: 0.12, color: CITY_FAR, step: 150, minH: 120, maxH: 330, seed: 1.3, windows: false },
  { p: 0.3, color: CITY_MID, step: 210, minH: 180, maxH: 470, seed: 5.9, windows: true },
  { p: 0.55, color: CITY_NEAR, step: 300, minH: 260, maxH: 620, seed: 11.2, windows: true },
];

export function drawSkyline(s: Scene, view: Viewport): void {
  const { ctx } = s;
  for (const layer of SKYLINE) {
    const groundY = layerGroundY(view, s, layer.p);
    if (groundY < -10) continue;
    const camX = view.cam.x * layer.p;
    // Index range covering the viewport, in the layer's own world grid. One
    // extra column each side so a building never pops in at the edge.
    const first = Math.floor(camX / layer.step) - 1;
    const last = Math.ceil((camX + view.w / s.scale) / layer.step) + 1;

    for (let i = first; i <= last; i += 1) {
      const r = hash01(i * 1.87 + layer.seed);
      const w = layer.step * (0.55 + hash01(i * 2.31 + layer.seed) * 0.35);
      const h = lerp(layer.minH, layer.maxH, r);
      const x = (i * layer.step - camX) * s.scale;
      const sw = w * s.scale;
      const sh = h * s.scale;
      ctx.fillStyle = layer.color;
      ctx.fillRect(x, groundY - sh, sw, sh + view.h);

      // A water tower or antenna on some roofs. Pure silhouette, and it is
      // what stops a skyline of plain rectangles reading as a bar chart.
      const cap = hash01(i * 4.13 + layer.seed);
      if (cap > 0.72) {
        const mw = sw * 0.16;
        ctx.fillRect(x + sw * 0.6, groundY - sh - sh * 0.14, mw, sh * 0.14);
      } else if (cap < 0.16) {
        ctx.fillRect(x + sw * 0.42, groundY - sh - sh * 0.2, Math.max(sw * 0.04, 1), sh * 0.2);
      }

      if (!layer.windows || !s.detail) continue;
      // Sparse lit windows. Only some columns are lit, and only on the upper
      // two-thirds, so it reads as offices rather than as a texture.
      const cell = Math.max(9 * s.scale, 4);
      const cols = Math.floor(sw / (cell * 2));
      const rows = Math.floor((sh * 0.7) / (cell * 2));
      ctx.fillStyle = WINDOW_LIT;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if (hash01(i * 97 + cx * 13 + cy * 3.7 + layer.seed) > 0.12) continue;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(
            x + cell + cx * cell * 2,
            groundY - sh + cell + cy * cell * 2,
            cell * 0.8,
            cell * 0.8,
          );
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}

// --- Level geometry ---------------------------------------------------------

/** Platforms this thin are girders, not buildings: they get rivets and no
 *  windows. Level 6's beams are 26px tall and its buildings 180+. */
const GIRDER_MAX_H = 40;

/** The standable top face, in world px. Drawn in a lighter colour than the
 *  facade with a bright lip, because "which surface can I land on" is a
 *  question the player asks every second and no text may answer. */
const ROOF_BAND = 10;

export function drawPlatforms(s: Scene, level: Level): void {
  const { ctx } = s;
  for (let i = 0; i < level.platforms.length; i += 1) {
    const p = level.platforms[i];
    if (p.h <= GIRDER_MAX_H) {
      drawGirder(s, p);
      continue;
    }

    ctx.fillStyle = FACADE;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // A shaded strip down the right-hand side gives the block a lit direction,
    // which is most of what makes a flat rect read as a solid volume.
    ctx.fillStyle = FACADE_SHADE;
    ctx.fillRect(p.x + p.w - Math.min(p.w * 0.18, 22), p.y, Math.min(p.w * 0.18, 22), p.h);

    ctx.fillStyle = ROOF;
    ctx.fillRect(p.x, p.y, p.w, Math.min(ROOF_BAND, p.h));
    ctx.fillStyle = ROOF_LIP;
    ctx.fillRect(p.x, p.y, p.w, lineW(s, 2));

    if (!s.detail) continue;
    // Windows on a grid derived from the rect itself, so they stay put as the
    // camera moves and never straddle an edge.
    const cell = 26;
    const cols = Math.floor((p.w - 14) / cell);
    const rows = Math.floor((p.h - ROOF_BAND - 14) / cell);
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        const lit = hash01(i * 31.7 + cx * 5.3 + cy * 2.9) > 0.72;
        ctx.fillStyle = lit ? WINDOW_LIT : WINDOW_DARK;
        ctx.globalAlpha = lit ? 0.55 : 0.8;
        ctx.fillRect(p.x + 10 + cx * cell, p.y + ROOF_BAND + 10 + cy * cell, 12, 16);
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawGirder(s: Scene, p: Rect): void {
  const { ctx } = s;
  ctx.fillStyle = GIRDER;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = GIRDER_SHADE;
  ctx.fillRect(p.x, p.y + p.h * 0.45, p.w, p.h * 0.55);
  ctx.fillStyle = ROOF_LIP;
  ctx.fillRect(p.x, p.y, p.w, lineW(s, 2));

  if (!s.detail) return;
  ctx.fillStyle = ROOF_LIP;
  ctx.globalAlpha = 0.5;
  for (let x = p.x + 12; x < p.x + p.w - 6; x += 34) {
    ctx.fillRect(x, p.y + p.h * 0.22, 3, 3);
    ctx.fillRect(x, p.y + p.h * 0.68, 3, 3);
  }
  ctx.globalAlpha = 1;
  // Cross-bracing, faint: reads as structure, and marks the beam as a thing
  // you web onto rather than a floating slab. Purely decorative.
  ctx.strokeStyle = GIRDER_SHADE;
  ctx.lineWidth = lineW(s, 1.4);
  ctx.beginPath();
  for (let x = p.x; x < p.x + p.w - p.h; x += p.h) {
    ctx.moveTo(x, p.y + p.h);
    ctx.lineTo(x + p.h, p.y);
  }
  ctx.stroke();
}

/** The void under the city. Two jobs, and the second is mechanical: the kill
 *  plane sits below every building (level.ts's killPlaneBelow), and this is the
 *  only thing that says so on screen. Fog thickening downward from just under
 *  the rooftops to solid black past the plane means "the buildings stop, and
 *  below that there is nothing to hold" is visible rather than learned by
 *  dying. */
export function drawVoid(s: Scene, level: Level): void {
  const { ctx } = s;
  const top = level.killPlaneY - 300;
  const bottom = level.killPlaneY + 900;
  const grad = ctx.createLinearGradient(0, top, 0, level.killPlaneY + 120);
  grad.addColorStop(0, "rgba(5,8,18,0)");
  grad.addColorStop(0.55, "rgba(5,8,18,0.72)");
  grad.addColorStop(1, VOID_FOG);
  ctx.fillStyle = grad;
  // Wide enough to cover the viewport at any zoom, anchored on the level's own
  // geometry rather than the camera, so it never shifts relative to the city.
  ctx.fillRect(-4000, top, 12000, bottom - top);
}

// --- The door ---------------------------------------------------------------

/** The exit. `locked` while the level still has enemies in it.
 *
 *  The lock has to be a *different object*, not a dimmer version of the same
 *  one, and that is the whole design of this function. A player who walks into
 *  a door that quietly does nothing concludes the door is broken, or that they
 *  are standing wrong — and with no tutorial there is no line of text to
 *  correct them. So the sealed door emits no light at all (light is this game's
 *  only "come here" signal, and it would be lying), goes cold grey instead of
 *  gold, and wears three heavy bars across the opening. Bars are the choice
 *  because they say *why* as well as *what*: something is holding it shut. The
 *  unlock is then the largest visual change in the game — grey and barred to
 *  gold and glowing — which is exactly the weight the moment deserves, since it
 *  is the game's only confirmation that a roof is clear. */
export function drawDoor(s: Scene, door: Rect, locked: boolean): void {
  const { ctx } = s;
  const c = rectCenter(door);
  const pulse = 0.72 + 0.28 * Math.sin(s.time * 2.2);
  const r = door.w / 2;

  // Halo first, behind the frame. The door is the level's goal and the only
  // piece of geometry the player is looking *for*, so it is the one thing
  // allowed to emit light — and only once it will actually open.
  if (!locked) {
    const glow = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, door.h * 1.5);
    glow.addColorStop(0, `rgba(255,209,102,${0.5 * pulse})`);
    glow.addColorStop(0.5, `rgba(255,209,102,${0.16 * pulse})`);
    glow.addColorStop(1, "rgba(255,209,102,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(c.x - door.h * 1.5, c.y - door.h * 1.5, door.h * 3, door.h * 3);
  }

  ctx.fillStyle = locked ? DOOR_FRAME_COLD : DOOR_FRAME;
  ctx.fillRect(door.x - 4, door.y - 4, door.w + 8, door.h + 4);

  // Arched opening: a rect with a half-round top.
  ctx.fillStyle = locked ? DOOR_SEALED : DOOR_LIGHT;
  ctx.beginPath();
  ctx.moveTo(door.x, door.y + door.h);
  ctx.lineTo(door.x, door.y + r);
  ctx.arc(door.x + r, door.y + r, r, Math.PI, 0);
  ctx.lineTo(door.x + door.w, door.y + door.h);
  ctx.closePath();
  ctx.fill();

  if (locked) {
    // Three bars, thick enough to survive the phone's 0.49 scale as bars rather
    // than as a texture. Overhanging the frame on both sides so they read as
    // something bolted *across* the door instead of as panelling on it.
    ctx.fillStyle = DOOR_BAR;
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect(door.x - 7, door.y + door.h * (0.24 + i * 0.24), door.w + 14, 7);
    }
    return;
  }

  ctx.fillStyle = DOOR_CORE;
  ctx.globalAlpha = pulse;
  ctx.fillRect(door.x + door.w * 0.28, door.y + door.h * 0.35, door.w * 0.44, door.h * 0.65);
  ctx.globalAlpha = 1;
}

// --- The player: a 2D Spider-Man --------------------------------------------
//
// Drawn as a posed figure, not a shape, because the pose is free information:
// running, falling, clinging and swinging all *look* different with no extra
// state to store and no animation frames to author. Every joint below is
// derived from PlayerState (velocity, wall side, rope angle) or from position,
// so there is no animation clock to keep in sync with the simulation — the run
// cycle is a function of how far the player has travelled, which means it
// cannot desync from the run.
//
// Local coordinates: origin at the hitbox's bottom-centre (the feet), +x is
// whichever way the player faces, +y is down. drawPlayer applies the flip, so
// every pose below is written facing right and mirrors for free.

// The figure's skeleton, in the local frame where 0 is the feet and -PLAYER_H
// (-40) is the top of the hitbox.
//
// These four numbers were all a little too generous to the head and a little
// too mean to the torso: a 9.6px head on a 40px figure is 24% of it, and the
// head's *bottom* sat exactly on the shoulder line at the same 13px width as
// the chest band and in the same red. The result was one continuous red mass
// from the eyes to the hips with no neck and no shoulders — at 20px on a phone,
// a red blob on blue legs. The head is now narrower than the shoulders, which
// is what actually draws the shoulder line, and the torso is longer than the
// head is tall.
const HEAD_R = 4.1;
const HEAD_Y = -36;
const NECK_Y = -30.6;
const HIP_Y = -17;

interface Pose {
  head: Vec2;
  neck: Vec2;
  hip: Vec2;
  /** [elbow, hand] / [knee, foot]. "Back" is drawn behind the torso. */
  armBack: [Vec2, Vec2];
  armFront: [Vec2, Vec2];
  legBack: [Vec2, Vec2];
  legFront: [Vec2, Vec2];
}

export type Facing = 1 | -1;

/** World position of the hitbox's bottom-centre — the local frame's origin. */
function footOrigin(p: PlayerState): Vec2 {
  return { x: p.pos.x + PLAYER_W / 2, y: p.pos.y + PLAYER_H };
}

/** The facing the pose is actually drawn at, which is not always the one the
 *  caller asked for:
 *
 *  - Clinging, the player is against a wall, so they face the wall. Drawing a
 *    cling facing away puts all four limbs in mid-air.
 *  - Swinging, they face the anchor, so the reaching arm goes up the rope
 *    instead of behind their back. Velocity-derived facing points along the
 *    arc, which is across the rope at the bottom of a swing.
 *
 *  Exported implicitly through drawPlayer and playerHandWorld, which both call
 *  it, so the rope and the hand holding it can never disagree. */
function effectiveFacing(p: PlayerState, requested: Facing): Facing {
  if (p.wallSide !== 0) return p.wallSide === 1 ? 1 : -1;
  if (p.swing) {
    const dx = p.swing.anchor.x - (p.pos.x + PLAYER_W / 2);
    if (Math.abs(dx) > 2) return dx > 0 ? 1 : -1;
  }
  return requested;
}

/** Local-space direction from the shoulders toward the swing anchor. */
function ropeDirLocal(p: PlayerState, facing: Facing): Vec2 {
  const o = footOrigin(p);
  const a = p.swing!.anchor;
  const dx = (a.x - o.x) * facing;
  const dy = a.y - o.y - NECK_Y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function poseFor(p: PlayerState, facing: Facing, time: number): Pose {
  if (p.swing) return swingPose(p, facing);
  if (p.wallSide !== 0) return clingPose(time);
  if (!p.onGround) return airPose(p);
  if (Math.abs(p.vel.x) > 24) return runPose(p);
  return idlePose(time);
}

function idlePose(time: number): Pose {
  // Breathing, so a standing player is not a corpse. Small: 0.5px of world.
  const b = Math.sin(time * 2.2) * 0.5;
  return {
    head: { x: 0.8, y: HEAD_Y + b },
    neck: { x: 0, y: NECK_Y + b },
    hip: { x: 0, y: HIP_Y + b * 0.4 },
    // Arms hang *outside* the torso, hands level with the hips. They used to end
    // at (±5, -18.5) — inside a chest band 13px wide — so both red arms lay on
    // the red chest and the idle silhouette was a figure holding something in
    // front of it with both hands. Nothing about the pose was wrong; it was
    // simply invisible, and what filled in for it read as clasped hands.
    armBack: [
      { x: -5.2, y: -24.6 + b },
      { x: -6.4, y: -17 + b },
    ],
    armFront: [
      { x: 5.2, y: -24.6 + b },
      { x: 6.6, y: -16.8 + b },
    ],
    // ...and the stance is wide enough that the two legs are two legs. At the
    // old ±3 the front leg's shade halo covered the back leg outright and the
    // pair rendered as one blue tube.
    legBack: [
      { x: -3.4, y: -9 },
      { x: -4.6, y: 0 },
    ],
    legFront: [
      { x: 3.6, y: -9 },
      { x: 4.9, y: 0 },
    ],
  };
}

/** Run cycle keyed on *distance travelled*, not on a clock: `pos.x * facing`
 *  advances whichever way the player runs, so the legs can never cycle while
 *  the player is held against a wall, and never freeze while they sprint. */
function runPose(p: PlayerState): Pose {
  const stride = 26;
  const th = ((p.pos.x * (p.vel.x >= 0 ? 1 : -1)) / stride) * TAU;
  const bob = -Math.abs(Math.sin(th)) * 1.2;

  const leg = (phase: number): [Vec2, Vec2] => {
    const sn = Math.sin(phase);
    const lift = Math.max(0, sn) * 6;
    return [
      { x: sn * 4 + 2, y: -9.5 - lift * 0.45 },
      { x: sn * 8, y: -lift },
    ];
  };
  const sw = Math.sin(th);

  return {
    head: { x: 3, y: HEAD_Y + bob },
    neck: { x: 2, y: NECK_Y + bob },
    hip: { x: 0, y: HIP_Y + bob },
    armBack: [
      { x: sw * 3 - 3.6, y: -24.4 + bob },
      { x: sw * 6.5 - 4, y: -19.4 + bob },
    ],
    armFront: [
      { x: -sw * 3 + 3.8, y: -24.4 + bob },
      { x: -sw * 6.5 + 4.4, y: -19.4 + bob },
    ],
    legBack: leg(th + Math.PI),
    legFront: leg(th),
  };
}

function airPose(p: PlayerState): Pose {
  // One number drives the whole pose: rising reaches up, falling spreads out.
  // Reading it off vel.y means a jump's arc is legible from the silhouette.
  const rise = clamp(-p.vel.y / 620, -1, 1);
  return {
    head: { x: 1.8, y: HEAD_Y },
    neck: { x: 1, y: NECK_Y },
    hip: { x: 0, y: HIP_Y - 0.5 },
    armBack: [
      { x: -5.6, y: -26 - rise },
      { x: -8.8, y: -29 - rise * 3 },
    ],
    armFront: [
      { x: 6, y: -29 - rise * 1.5 },
      { x: 9.4, y: -32.5 - rise * 4 },
    ],
    legBack: [
      { x: -1.6, y: -11 },
      { x: -6.6, y: -3.5 - rise },
    ],
    legFront: [
      { x: 4.6, y: -12 - rise },
      { x: 1.6, y: -5 - rise * 2 },
    ],
  };
}

/** The wall crawl. +x is into the wall (effectiveFacing guarantees it), so
 *  every limb reaches forward and the figure reads as gripping rather than
 *  standing sideways in the air. */
function clingPose(time: number): Pose {
  const b = Math.sin(time * 3.4) * 0.6;
  return {
    head: { x: 4.2, y: -33.4 + b },
    neck: { x: 2.6, y: -29 + b },
    hip: { x: -1, y: -19 + b * 0.5 },
    armBack: [
      { x: 5.2, y: -25 + b },
      { x: 9, y: -22 + b },
    ],
    armFront: [
      { x: 7, y: -32 + b },
      { x: 10.4, y: -36 + b },
    ],
    legBack: [
      { x: 2, y: -9 },
      { x: 5.4, y: -1 },
    ],
    legFront: [
      { x: 6, y: -11.5 },
      { x: 9.4, y: -5 },
    ],
  };
}

/** The swing. The reaching arm lies along the rope and the body hangs and
 *  trails behind it, which is the one pose in the game that has to be right:
 *  it is on screen for the whole of the mechanic the brief is built around. */
function swingPose(p: PlayerState, facing: Facing): Pose {
  const d = ropeDirLocal(p, facing);
  // Lean the torso toward the anchor. The hip stays put; the shoulders swing
  // up the rope, so a shallow rope gives a near-horizontal body and a vertical
  // one gives an upright hang, both for free.
  const neck: Vec2 = { x: d.x * 8, y: HIP_Y + d.y * 12 };
  const hand: Vec2 = { x: neck.x + d.x * 13, y: neck.y + d.y * 13 };
  const elbow: Vec2 = { x: neck.x + d.x * 6.6 - d.y * 1.6, y: neck.y + d.y * 6.6 + d.x * 1.6 };
  return {
    head: { x: neck.x + 1.2 + d.x * 1.5, y: neck.y - 4.4 + d.y * 1.5 },
    neck,
    hip: { x: 0, y: HIP_Y },
    // Trailing arm flung back — the counterweight that sells the arc.
    armBack: [
      { x: -5.2, y: HIP_Y - 8 },
      { x: -11, y: HIP_Y - 6 },
    ],
    armFront: [elbow, hand],
    legBack: [
      { x: -3.4, y: HIP_Y + 6 },
      { x: -9, y: HIP_Y + 12 },
    ],
    legFront: [
      { x: -5.6, y: HIP_Y + 4 },
      { x: -12.4, y: HIP_Y + 7 },
    ],
  };
}

/** World position of the hand the web comes out of. Exported so drawWeb can
 *  start the rope at the hand instead of at the player's centre — the rope and
 *  the arm holding it come from the same pose function, so they cannot drift
 *  apart when a pose changes. */
export function playerHandWorld(p: PlayerState, facing: Facing, time: number): Vec2 {
  const f = effectiveFacing(p, facing);
  const o = footOrigin(p);
  const pose = poseFor(p, f, time);
  return { x: o.x + pose.armFront[1].x * f, y: o.y + pose.armFront[1].y };
}

export function drawPlayer(s: Scene, p: PlayerState, facing: Facing): void {
  const { ctx } = s;
  const f = effectiveFacing(p, facing);
  const o = footOrigin(p);
  const pose = poseFor(p, f, s.time);

  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(f, 1);

  const shoulder = pose.neck;
  const hip = pose.hip;

  // Arms hang from a *joint*, not from the base of the neck. Every pose puts its
  // elbows relative to the body's centreline, and the limb root was `shoulder` —
  // the centreline point — so both arms left the figure at the throat and had to
  // cross the chest to get anywhere. Two joints at the ends of the shoulder line
  // cost nothing and fix every pose at once rather than one at a time.
  const jointFront = { x: shoulder.x + 4.4, y: shoulder.y + 0.7 };
  const jointBack = { x: shoulder.x - 4.4, y: shoulder.y + 0.7 };

  // Back limbs first, in shaded colours, so depth reads without an outline.
  limb(s, hip, pose.legBack[0], pose.legBack[1], 5, SUIT_BLUE_SHADE);
  boot(s, pose.legBack[0], pose.legBack[1], 5.4, SUIT_RED_SHADE);
  limb(s, jointBack, pose.armBack[0], pose.armBack[1], 4.2, SUIT_RED_SHADE);

  // Torso: red over the chest, blue from the ribs down. The split is the
  // single most identifiable thing about the suit at 13px wide, so it is the
  // one piece of the figure that is never gated behind `detail`.
  band(s, shoulder, hip, 13, 10.5, SUIT_BLUE);
  band(s, shoulder, { x: lerp(shoulder.x, hip.x, 0.55), y: lerp(shoulder.y, hip.y, 0.55) }, 13, 11.4, SUIT_RED);

  // Front limbs, each over a one-step-darker copy of itself a pixel wider. An
  // outline pass would do the same job, but this survives the downscale better:
  // it is the same silhouette rather than a hairline, so it does not thin out
  // to nothing on a phone. Without it, a red arm crossing the red torso — which
  // is most of the idle and run cycle — disappeared into it.
  limb(s, hip, pose.legFront[0], pose.legFront[1], 6.4, SUIT_BLUE_SHADE);
  limb(s, hip, pose.legFront[0], pose.legFront[1], 5, SUIT_BLUE);
  boot(s, pose.legFront[0], pose.legFront[1], 5.8, SUIT_RED);
  // 5.2, not the 6.2 this started at: a 6.2px arm with round caps on a 13px
  // torso bulged 4px past the hip and read as an oven mitt, not a hand.
  limb(s, jointFront, pose.armFront[0], pose.armFront[1], 5.2, SUIT_RED_SHADE);
  limb(s, jointFront, pose.armFront[0], pose.armFront[1], 3.8, SUIT_RED);

  // Head: a disc, then the eyes. The mask has no features other than eyes, so
  // the eyes carry the whole read and are drawn oversized for the head.
  //
  // On a shade halo, like the front limbs, and for the same reason: the head is
  // red and the chest it sits on is red, so without one there is no jawline —
  // only a silhouette. Not gated behind `detail`, because the size where it
  // matters most is the size where `detail` is off.
  segment(s, { x: pose.head.x * 0.5, y: pose.head.y + HEAD_R }, shoulder, 3.6, SUIT_RED_SHADE);
  disc(s, pose.head, HEAD_R + 0.75, SUIT_RED_SHADE);
  disc(s, pose.head, HEAD_R, SUIT_RED);
  // Two eyes with a gap between them. They used to overlap by 0.3px, which at
  // any zoom is one continuous dark-rimmed band across the face — a visor.
  almond(s, { x: pose.head.x + 1.7, y: pose.head.y - 0.7 }, 4.8, 3.4, -0.35, EYE, s.detail ? EYE_RIM : null);
  almond(s, { x: pose.head.x - 2.9, y: pose.head.y - 0.5 }, 3.2, 2.5, -0.3, EYE, s.detail ? EYE_RIM : null);

  if (s.detail) {
    // Mask webbing, in a red shadow rather than the near-black outline colour.
    // Four near-black lines across a 9.6px head is not a web pattern, it is a
    // dirty face — comics draw the mask's webbing as a darker red for the same
    // reason.
    // Clipped to the head, because it wasn't: round line caps at
    // `head.y - HEAD_R` sat half outside the disc, and the two rightmost of them
    // landed near the edge, where they poked up as a matched pair of horns. A
    // 9px head has no room for a stray 0.6px cap.
    ctx.save();
    ctx.beginPath();
    ctx.arc(pose.head.x, pose.head.y, HEAD_R, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = SUIT_RED_SHADE;
    ctx.lineWidth = 0.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = -1; i <= 2; i += 1) {
      ctx.moveTo(pose.head.x + i * 1.7, pose.head.y - HEAD_R);
      ctx.lineTo(pose.head.x + i * 1.25, pose.head.y + HEAD_R);
    }
    ctx.stroke();
    ctx.restore();

    // The chest spider: a body and three swept legs a side. What this replaced
    // was three straight horizontal bars, which at every zoom merged into one
    // solid dark 7x3 block — a hole punched in the chest rather than an emblem,
    // and the first thing the eye landed on.
    // Sized down from a 7.4x5 spider on a 13px chest, which is the same mistake
    // the three bars made in a different shape: at that scale it is a dark mass
    // covering most of the torso, and mass beats motif — the eye reads a hole,
    // not an emblem. The comics' spider is small and near-centred.
    const chest = { x: lerp(shoulder.x, hip.x, 0.3), y: lerp(shoulder.y, hip.y, 0.3) };
    ctx.fillStyle = SUIT_LINE;
    ctx.beginPath();
    ctx.ellipse(chest.x, chest.y, 0.8, 1.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = SUIT_LINE;
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const y = chest.y - 1 + i * 1;
      const spread = 1.7 + i * 0.45;
      const drop = (i - 1) * 1.2;
      ctx.moveTo(chest.x - 0.5, y);
      ctx.quadraticCurveTo(chest.x - spread, y - 0.7, chest.x - spread - 0.4, y + drop);
      ctx.moveTo(chest.x + 0.5, y);
      ctx.quadraticCurveTo(chest.x + spread, y - 0.7, chest.x + spread + 0.4, y + drop);
    }
    ctx.stroke();
  }

  ctx.restore();
}

// --- The web ----------------------------------------------------------------

/** The strand, hand toward `to`, extended `progress` of the way there.
 *
 *  One function for both the rope and a shot in flight, and that is not a
 *  saving — it is the reason the two look like one mechanic. A zip and a swing
 *  already draw the same line on purpose (physics.ts: "to the player it reads
 *  as one continuous action"); a shot that misses, and a shot that hits a man,
 *  now join them. What differs between the four is where the line stops and
 *  what happens when it lands, which is the honest difference.
 *
 *  The splat is drawn only on arrival, so it means what it looks like: the web
 *  is stuck to *that*. `alpha` fades a spent strand out — a shot that connected
 *  with an enemy has no rope to become, and a strand that vanished on the frame
 *  it landed would make the whole animation a single-frame flicker. */
export function drawWebStrand(s: Scene, from: Vec2, to: Vec2, progress: number, alpha = 1): void {
  const { ctx } = s;
  const u = clamp(progress, 0, 1);
  const tip = { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u) };

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.strokeStyle = WEB_LINE;
  ctx.lineWidth = lineW(s, 2);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  if (u < 1) {
    // A blob on the leading end while it travels. Without it a strand growing
    // at 4000px/s is a line that is simply *there* a frame later; the blob is
    // what the eye tracks, and tracking it is what makes the shot read as
    // having been fired rather than having appeared.
    disc(s, tip, lineW(s, 3.4), WEB_LINE);
    ctx.restore();
    return;
  }

  // A splat where it bit. Small, but it is the confirmation that the shot
  // connected with *that* surface.
  disc(s, tip, lineW(s, 3.4), WEB_LINE);
  if (s.detail) {
    ctx.lineWidth = lineW(s, 1.6);
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU + 0.4;
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x + Math.cos(a) * 8.5, tip.y + Math.sin(a) * 8.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** The aim preview. Fed the WebTarget that web.ts resolved for this exact
 *  frame, so what is drawn is provably the shot that will fire — and the
 *  colour answers the only question the player has ("will this swing me, hurt
 *  something, or waste a shot?") before they commit. */
export function drawAimPreview(s: Scene, from: Vec2, target: WebTarget): void {
  const { ctx } = s;
  const anchor = target.type === "anchor";
  const enemy = target.type === "enemy";
  const color = anchor ? "#7dffb4" : enemy ? "#ff6b6b" : "rgba(240,244,255,0.32)";

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW(s, 2);
  // Dashes crawl toward the target, so the line reads as a direction of travel
  // rather than as a static ruler.
  ctx.setLineDash([9, 7]);
  ctx.lineDashOffset = -((s.time * 40) % 16);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(target.point.x, target.point.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const r = 7;
  if (anchor) {
    // A ring: "the rope will attach here."
    ctx.lineWidth = lineW(s, 2.4);
    ctx.beginPath();
    ctx.arc(target.point.x, target.point.y, r, 0, TAU);
    ctx.stroke();
  } else if (enemy) {
    // A crosshair: "this will hit."
    ctx.lineWidth = lineW(s, 2.4);
    ctx.beginPath();
    ctx.moveTo(target.point.x - r, target.point.y);
    ctx.lineTo(target.point.x + r, target.point.y);
    ctx.moveTo(target.point.x, target.point.y - r);
    ctx.lineTo(target.point.x, target.point.y + r);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Enemies ----------------------------------------------------------------

/** 0..1 through the current telegraph, or null when there is nothing to warn
 *  about. Driving pose *and* colour off one progress number is what makes a
 *  wind-up read as a wind-up: the tell grows, so the player can see how much
 *  time is left rather than only that something is happening. */
function telegraphProgress(e: Enemy): number | null {
  if (e.kind === "doc-ock") {
    if (e.phase === "melee-telegraph") return clamp(e.elapsedMs / e.cfg.meleeTelegraphMs, 0, 1);
    if (e.phase === "throw-telegraph") return clamp(e.elapsedMs / e.cfg.throwTelegraphMs, 0, 1);
    return null;
  }
  if (e.kind === "gunman") {
    if (e.phase === "aim") return clamp(e.elapsedMs / e.cfg.aimTelegraphMs, 0, 1);
    return null;
  }
  if (e.phase === "telegraph") return clamp(e.elapsedMs / e.cfg.telegraphMs, 0, 1);
  return null;
}

/** Hazard colour that flickers *faster* the closer the attack is. Driven by
 *  wall-clock time with a rate that ramps with progress, not by progress
 *  alone — progress alone gives the same number of flashes however long the
 *  telegraph lasts, which is the one thing that must not be true: the player
 *  reads "how soon" off the rate.
 *
 *  This is the half of every telegraph that survives phone size. 31px of Doc
 *  Ock has room for a colour and not much else, and a *changing* colour is
 *  visible in peripheral vision where a static one is not.
 *
 *  `warm` switches to the orange pair, which is Doc Ock's melee — the attack
 *  whose danger is a radius rather than a trajectory. See MELEE_WARN. */
function hazard(s: Scene, t: number, warm = false): string {
  const rate = 4 + 10 * t; // Hz
  const on = Math.sin(s.time * TAU * rate) > 0;
  if (warm) return on ? MELEE_DEEP : MELEE_WARN;
  return on ? HAZARD_DEEP : HAZARD;
}

export function drawEnemy(s: Scene, e: Enemy, playerCenter: Vec2): void {
  drawHitFlash(s, e);
  if (e.kind === "doc-ock") drawDocOck(s, e, playerCenter);
  else if (e.kind === "venom") drawVenom(s, e, playerCenter);
  else drawGunman(s, e, playerCenter);
  drawHealthPips(s, e);
}

/** A white burst behind an enemy that a web just hit.
 *
 *  Behind, and as a glow rather than a tint over the body, for a reason the
 *  rest of this file keeps running into: tinting the drawn pixels means
 *  compositing against a canvas that is already opaque everywhere, so it would
 *  wash the sky as readily as the enemy. A halo needs no compositing tricks,
 *  survives being drawn under a black Venom, and — being *outside* the
 *  silhouette — is visible even when the enemy is behind something. */
function drawHitFlash(s: Scene, e: Enemy): void {
  if (e.hitFlashMs <= 0) return;
  const { ctx } = s;
  const box = enemyHitbox(e);
  const c = rectCenter(box);
  const t = clamp(e.hitFlashMs / HIT_FLASH_MS, 0, 1);
  const r = Math.max(box.w, box.h) * (0.62 + 0.28 * (1 - t));
  const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
  glow.addColorStop(0, `rgba(255,255,255,${0.72 * t})`);
  glow.addColorStop(0.55, `rgba(255,255,255,${0.3 * t})`);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
}

/** Web-shot progress on an enemy. Information, not instruction: pips that go
 *  out, so a hit that does not kill still visibly did something.
 *
 *  One pip is one web hit, not one health point — enemy health is in points now
 *  (entities.ts's WEB_DAMAGE) and a boss on 80 would otherwise draw eighty
 *  slivers. "How many more shots" is the only thing the player can act on, so
 *  it is the only thing the readout says.
 *
 *  The pip width is derived rather than fixed, because the count is no longer
 *  three or four: eight fixed-width pips over a 46px-wide Venom is a bar wider
 *  than the character it belongs to, which at phone zoom reads as part of the
 *  skyline. Sizing to the silhouette keeps the readout attached to its owner. */
function drawHealthPips(s: Scene, e: Enemy): void {
  const { ctx } = s;
  const box = enemyHitbox(e);
  const shots = Math.max(1, Math.ceil(e.cfg.health / WEB_DAMAGE));
  if (shots <= 1) return;
  const left = Math.max(0, Math.ceil(e.health / WEB_DAMAGE));
  const gap = 3;
  const span = Math.max(box.w, 54);
  const w = clamp((span - (shots - 1) * gap) / shots, 3, 7);
  const total = shots * w + (shots - 1) * gap;
  const x0 = box.x + box.w / 2 - total / 2;
  const y = box.y - 14;
  for (let i = 0; i < shots; i += 1) {
    ctx.fillStyle = i < left ? HP_LOW : "rgba(12,16,32,0.6)";
    ctx.fillRect(x0 + i * (w + gap), y, w, 4);
  }
}

function drawDocOck(s: Scene, e: DocOckEnemy, target: Vec2): void {
  const { ctx } = s;
  const box = { x: e.position.x, y: e.position.y, w: DOC_OCK_W, h: DOC_OCK_H };
  const c = rectCenter(box);
  const facing: Facing = target.x >= c.x ? 1 : -1;
  const t = telegraphProgress(e);
  const melee = e.phase === "melee-telegraph";
  const throwing = e.phase === "throw-telegraph";
  const metal = t === null ? TENTACLE : hazard(s, t, melee);

  // The reach ring. armReach is centre-to-centre and the melee re-measures at
  // the snap (entities.ts), so this circle is *exactly* the dodge window,
  // drawn from the same config number the hit test uses. It is the clearest
  // wordless instruction in the game: get outside the ring.
  if (melee && t !== null) {
    ctx.save();
    ctx.strokeStyle = REACH_RING;
    ctx.globalAlpha = 0.28 + 0.5 * t;
    ctx.lineWidth = lineW(s, 2.5);
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -((s.time * 60) % 24);
    ctx.beginPath();
    ctx.arc(c.x, c.y, e.cfg.armReach, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(c.x, box.y + box.h);
  ctx.scale(facing, 1);

  // --- Tentacles, behind the body -----------------------------------------
  //
  // Four, from a harness at the small of the back. Each one arcs up and out
  // *over* the shoulder line and then back down, so the tips point at the
  // ground and the four together frame him in a cage half again his own width.
  // That arch is the whole character: it is what says "machine" before any
  // detail is legible, and at 31px on a phone it is the only thing that is.
  //
  // The first version ran them up-and-outward at 45 degrees and simply stopped,
  // which — with a three-fingered claw on each end — read as a man holding both
  // hands up, and read that way loudest during the melee telegraph, when they
  // turned yellow and the fingers spread. The fix was the silhouette, not the
  // colour: an arm that comes back down is not a raised arm.
  //
  // The melee telegraph drives the inner pair down and forward at the player,
  // and the throw telegraph rears one back over the head with the block already
  // visible in its pincer. Drawing the block *before* it is thrown is
  // deliberate: the arc is easier to read if you saw where it started.
  const localTarget = { x: (target.x - c.x) * facing, y: target.y - (box.y + box.h) };
  const dist = Math.hypot(localTarget.x, localTarget.y) || 1;
  const dir = { x: localTarget.x / dist, y: localTarget.y / dist };

  for (let i = 0; i < 4; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const rank = i < 2 ? 0 : 1;
    const base = { x: side * 5, y: -46 - rank * 6 };
    const sway = Math.sin(s.time * 1.6 + i * 1.7) * 4;

    // Control point well above the head and outside the tip: that is what bows
    // the curve over the top and brings it back down. The tip then has to land
    // *below the shoulders* — first attempt stopped it at head height, which
    // made the four arcs a crown sitting on him rather than a cage around him,
    // and put four pincers in a ring around his face.
    let ctrl = { x: side * (30 + rank * 15), y: -104 - rank * 12 + sway };
    let tip = { x: side * (38 + rank * 13) + sway * 0.5, y: -34 - rank * 8 + sway };
    let claw = 1;

    if (melee && t !== null && rank === 0) {
      const reach = easeOut(t);

      // The goal is a fraction *along localTarget*, not `base + dir * len`.
      // Those differ by base.y, and base.y is -46: the old version aimed both
      // pincers a whole 46px above the player's head, so the one telegraph the
      // player is supposed to read as "this is where it lands" pointed at empty
      // sky. Capped at armReach * 0.82 so the tips stop short when he is
      // winding up at something out of range rather than stretching to it.
      const k = Math.min(1, (e.cfg.armReach * 0.82) / dist);
      const goal = { x: localTarget.x * k, y: localTarget.y * k - side * 9 };
      tip = { x: lerp(tip.x, goal.x, reach), y: lerp(tip.y, goal.y, reach) };
      ctrl = {
        x: lerp(ctrl.x, (base.x + goal.x) / 2 - dir.y * 26 * side, reach),
        y: lerp(ctrl.y, (base.y + goal.y) / 2 + dir.x * 26 * side, reach),
      };
      claw = 1 + reach * 1.5;
    }

    if (throwing && t !== null && i === 0) {
      const rear = easeOut(t);
      tip = { x: lerp(tip.x, -30, rear), y: lerp(tip.y, -110, rear) };
      ctrl = { x: lerp(ctrl.x, 16, rear), y: lerp(ctrl.y, -96, rear) };
    }

    // Only the arms that are actually doing the attack go hazard-coloured. The
    // throw used to light all four, which bleached the whole cage and buried the
    // one fact worth reading — *that* arm, the one with the rock in it.
    const lit = (melee && rank === 0) || (throwing && i === 0) ? metal : TENTACLE;
    tentacle(s, base, ctrl, tip, 6 - rank, lit);
    pincer(s, ctrl, tip, claw, lit);

    if (throwing && t !== null && i === 0) {
      drawBlockShape(s, { x: tip.x, y: tip.y - 4 }, s.time * 2);
    }
  }

  // --- Body ---------------------------------------------------------------
  //
  // The coat flashes for *both* attacks, in each attack's own hue. It used to
  // flash only for the throw, on the theory that melee already had the reach
  // ring — but the ring is a hint about geometry, and the thing the melee had no
  // version of was "right now". At 31px the only melee colour change was on
  // 1.3px-wide tentacle strokes, which is a flicker the eye does not catch; the
  // coat is ~19px of solid area at the same zoom. A colour flash has to be on a
  // mass, not a line. Two hues keep the two attacks distinguishable, and orange
  // is the ring's own colour, so the mass and the radius agree.
  const flash = t !== null ? hazard(s, t, melee) : null;

  // Legs.
  limb(s, { x: -4, y: -28 }, { x: -7, y: -14 }, { x: -8, y: 0 }, 9, OCK_TROUSER);
  limb(s, { x: 4, y: -28 }, { x: 7, y: -14 }, { x: 9, y: 0 }, 9, OCK_TROUSER);

  // Coat: a trapezoid, wider at the shoulders, with a flared hem so he reads
  // as bulky next to the player's silhouette even at 31px wide.
  ctx.fillStyle = flash ?? OCK_COAT;
  ctx.beginPath();
  ctx.moveTo(-15, -58);
  ctx.lineTo(15, -58);
  ctx.lineTo(19, -26);
  ctx.lineTo(-19, -26);
  ctx.closePath();
  ctx.fill();
  // The shaded far side of the coat, but not while flashing: it is a third of
  // the coat's width, and a third of the flashing mass is exactly what a
  // 31px-wide warning cannot spare.
  if (flash === null) {
    ctx.fillStyle = OCK_COAT_SHADE;
    ctx.fillRect(8, -58, 11, 32);
  }
  if (s.detail) {
    ctx.strokeStyle = OCK_COAT_SHADE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -58);
    ctx.lineTo(0, -26);
    ctx.stroke();
  }

  // Arms, human ones, tucked — the tentacles are the threat, so the arms stay
  // out of the silhouette's way. Both take the flash: only the far one used to,
  // and the near one then sat on the flashing coat as a bright green blob, which
  // is a second moving thing competing with the warning it is drawn on top of.
  limb(s, { x: -12, y: -55 }, { x: -17, y: -44 }, { x: -12, y: -34 }, 6, flash ?? OCK_COAT);
  limb(s, { x: 12, y: -55 }, { x: 18, y: -44 }, { x: 13, y: -34 }, 6, flash ?? OCK_COAT);

  // Head: skin, bowl haircut, black round glasses. The glasses are the read at
  // small sizes — two dark holes in a pale face.
  const head = { x: 1, y: -68 };
  disc(s, head, 9, OCK_SKIN);
  ctx.fillStyle = OCK_HAIR;
  ctx.beginPath();
  ctx.arc(head.x, head.y - 1.5, 9.4, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = OCK_HAIR;
  ctx.fillRect(head.x - 9.4, head.y - 2.5, 18.8, 2.5);
  disc(s, { x: head.x + 4.4, y: head.y + 1 }, 3.4, OCK_GLASS);
  disc(s, { x: head.x - 2.4, y: head.y + 1 }, 3, OCK_GLASS);
  if (s.detail) {
    ctx.strokeStyle = OCK_GLASS;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(head.x + 1.2, head.y + 1);
    ctx.lineTo(head.x + 0.6, head.y + 1);
    ctx.stroke();
  }

  ctx.restore();
}

function drawVenom(s: Scene, e: VenomEnemy, target: Vec2): void {
  const { ctx } = s;
  const box = { x: e.position.x, y: e.position.y, w: VENOM_W, h: VENOM_H };
  const c = rectCenter(box);
  const facing: Facing = target.x >= c.x ? 1 : -1;
  const t = telegraphProgress(e);

  // Pose is one squash/stretch pair, and the four phases each get an
  // unmistakable one. The crouch is the player's only warning that a leap is
  // coming (there is no reach ring to draw — the leap is aimed at wherever the
  // player is when the wind-up ends, so any ground preview would be a lie), so
  // it goes deep: 28% shorter and 20% wider is a different silhouette, not a
  // different shade.
  let squashY = 1;
  let squashX = 1;
  if (t !== null) {
    squashY = 1 - 0.28 * easeOut(t);
    squashX = 1 + 0.2 * easeOut(t);
  } else if (e.phase === "leap") {
    squashY = 1.14;
    squashX = 0.9;
  } else if (e.phase === "recover") {
    // Slumped, and the brief's "harmless silhouette" — it must not look like a
    // wind-up, so it squashes on *both* axes rather than widening.
    squashY = 0.92;
    squashX = 0.96;
  }

  ctx.save();
  ctx.translate(c.x, box.y + box.h);
  ctx.scale(facing * squashX, squashY);

  const glow = t !== null ? hazard(s, t) : null;

  // Legs: heavy, bent, planted wide.
  limb(s, { x: -5, y: -24 }, { x: -11, y: -12 }, { x: -12, y: 0 }, 10, VENOM_BODY);
  limb(s, { x: 5, y: -24 }, { x: 11, y: -12 }, { x: 13, y: 0 }, 10, VENOM_BODY);

  // Torso: a hulking mass, no neck. Wider at the shoulders than the player is
  // tall, which is the whole point — "bigger than you" has to land instantly.
  ctx.fillStyle = VENOM_BODY;
  ctx.beginPath();
  ctx.moveTo(-18, -50);
  ctx.quadraticCurveTo(-24, -34, -13, -22);
  ctx.lineTo(13, -22);
  ctx.quadraticCurveTo(24, -34, 18, -50);
  ctx.closePath();
  ctx.fill();
  if (s.detail) {
    ctx.fillStyle = VENOM_SHEEN;
    ctx.beginPath();
    ctx.moveTo(-14, -48);
    ctx.quadraticCurveTo(-19, -36, -11, -26);
    ctx.lineTo(-5, -26);
    ctx.quadraticCurveTo(-13, -36, -8, -48);
    ctx.closePath();
    ctx.fill();
  }

  // The white spider, chest-spanning. Venom's actual read at any size.
  ctx.fillStyle = VENOM_WHITE;
  ctx.beginPath();
  ctx.ellipse(0, -36, 4, 6.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = VENOM_WHITE;
  ctx.lineWidth = lineW(s, 1.6);
  ctx.lineCap = "round";
  // Legs swept, not straight. Six straight bars radiating off a white oval is a
  // ribcage — which is a *different* monster — and Venom's emblem is the one
  // thing on him that has to be read as a spider.
  ctx.beginPath();
  for (let i = 0; i < 3; i += 1) {
    const y = -42 + i * 6;
    const drop = -3 + i * 4;
    for (const k of [-1, 1]) {
      ctx.moveTo(k * 3, y);
      ctx.quadraticCurveTo(k * 11, y - 4 + i * 2, k * 16, y + drop);
    }
  }
  ctx.stroke();

  // Arms: forward and clawed on the leap, hanging otherwise.
  //
  // Each drawn twice — a wider pass in the sheen colour, then the body colour
  // inside it, so the pale pass survives as a rim. Both arms were flat
  // VENOM_BODY on a flat VENOM_BODY torso, which is fine while they hang beside
  // him and useless the moment they matter: on the leap the near arm crosses the
  // chest, and a black arm over a black torso is not an arm, it is nothing. The
  // rim is the only thing separating them, and it is 1.3px on a phone, which is
  // why it is a wider silhouette rather than a stroked outline.
  const leaping = e.phase === "leap";
  const arms: Array<[Vec2, Vec2, Vec2, number]> = [
    [
      { x: -14, y: -48 },
      leaping ? { x: -6, y: -44 } : { x: -21, y: -36 },
      leaping ? { x: 6, y: -40 } : { x: -18, y: -22 },
      7,
    ],
    [
      { x: 14, y: -48 },
      leaping ? { x: 22, y: -46 } : { x: 21, y: -36 },
      leaping ? { x: 32, y: -42 } : { x: 19, y: -22 },
      7.5,
    ],
  ];
  for (const [a, b, d, w] of arms) {
    limb(s, a, b, d, w + 2.4, VENOM_SHEEN);
    limb(s, a, b, d, w, VENOM_BODY);
  }

  // Head: no separate skull, just a mass with eyes and a grin.
  const head = { x: 2, y: -56 };
  ctx.fillStyle = VENOM_BODY;
  ctx.beginPath();
  ctx.ellipse(head.x, head.y, 12, 10.5, 0, 0, TAU);
  ctx.fill();

  // Eyes: huge, jagged, angled inward. On recover they close to slits, which
  // is the visual difference between "breather" and "about to leap".
  const eyeH = e.phase === "recover" ? 1.6 : t !== null ? 3.2 : 4.6;
  almond(s, { x: head.x + 5.2, y: head.y - 2 }, 10, eyeH, -0.3, VENOM_WHITE, null);
  almond(s, { x: head.x - 5.6, y: head.y - 2 }, 8.4, eyeH * 0.9, 0.34, VENOM_WHITE, null);

  // Grin, and a tongue that lashes out with the wind-up.
  ctx.fillStyle = VENOM_WHITE;
  const mouthW = leaping ? 11 : 8.5;
  const mouthH = leaping ? 5 : 2.4;
  ctx.beginPath();
  ctx.moveTo(head.x - mouthW, head.y + 4);
  ctx.quadraticCurveTo(head.x, head.y + 4 + mouthH * 2, head.x + mouthW, head.y + 4);
  ctx.quadraticCurveTo(head.x, head.y + 4 + mouthH * 0.4, head.x - mouthW, head.y + 4);
  ctx.closePath();
  ctx.fill();
  if (t !== null || leaping) {
    const reach = leaping ? 26 : 10 + 22 * easeOut(t ?? 0);
    ctx.strokeStyle = VENOM_TONGUE;
    ctx.lineWidth = lineW(s, 2.6);
    ctx.beginPath();
    ctx.moveTo(head.x, head.y + 6);
    ctx.quadraticCurveTo(head.x + reach * 0.6, head.y + 12, head.x + reach, head.y + 4);
    ctx.stroke();
  }

  // The colour half of the telegraph: a hot rim around the whole silhouette,
  // flickering faster as the leap nears. Survives 22px wide, which the crouch
  // alone might not on the smallest marking viewport.
  if (glow) {
    ctx.strokeStyle = glow;
    ctx.lineWidth = lineW(s, 2.6);
    ctx.globalAlpha = 0.55 + 0.45 * (t ?? 0);
    ctx.beginPath();
    ctx.moveTo(-18, -50);
    ctx.quadraticCurveTo(-24, -34, -13, -22);
    ctx.lineTo(13, -22);
    ctx.quadraticCurveTo(24, -34, 18, -50);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(head.x, head.y, 12, 10.5, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/** The gunman: a man with a pistol, drawn at the player's own scale.
 *
 *  The figure is deliberately the plainest one in the game — coat, cap, gun.
 *  He is the enemy the player meets most often, and a character met six times
 *  should resolve in one glance and then get out of the way of the thing that
 *  actually matters, which is the line he is about to fire down.
 *
 *  That tell is three signals on one clock: the coat goes hazard (a mass, not a
 *  line — deliverable 7's finding), the pistol swings onto the target, and a
 *  dashed lane crawls out from the muzzle. Only the lane says *where*, and it is
 *  drawn from `gunmanMuzzle` along `aimAt` — the same function and the same
 *  point the slug is actually born at and aimed down, so the warning cannot
 *  drift off the shot it is warning about. A telegraph that is merely nearly
 *  right is worse than none: it teaches a dodge that does not work. */
function drawGunman(s: Scene, e: GunmanEnemy, target: Vec2): void {
  const { ctx } = s;
  const facing = gunmanFacing(e);
  const t = telegraphProgress(e);
  const muzzle = gunmanMuzzle(e);
  const aim = e.aimAt ?? target;
  const dx = aim.x - muzzle.x;
  const dy = aim.y - muzzle.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // --- The lane, in world space, before the figure's local transform -------
  //
  // Drawn out to the slug's full range rather than to the aim point, because
  // the aim point is not where the danger stops — a shot locked at the player's
  // last position keeps going, and standing just past it is not safety. Dashed
  // and crawling forward: motion is what catches peripheral vision, which is
  // where this line is when the player is mid-swing and looking somewhere else.
  if (t !== null) {
    ctx.save();
    ctx.globalAlpha = 0.22 + 0.55 * t;
    ctx.strokeStyle = hazard(s, t);
    ctx.lineWidth = lineW(s, 1.1 + 2.3 * t);
    ctx.lineCap = "butt";
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -s.time * 240;
    ctx.beginPath();
    ctx.moveTo(muzzle.x, muzzle.y);
    ctx.lineTo(muzzle.x + ux * e.cfg.shotRange, muzzle.y + uy * e.cfg.shotRange);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.restore();
  }

  // --- The figure ----------------------------------------------------------
  ctx.save();
  ctx.translate(e.position.x + GUNMAN_W / 2, e.position.y + GUNMAN_H);
  ctx.scale(facing, 1);

  // The coat is the flashing mass. Everything else keeps its own colour, so
  // "he is about to fire" and "which one is he" never compete.
  const coat = t === null ? GUN_COAT : hazard(s, t);
  // Offset by his x so a pair of gunmen do not breathe in lockstep, which is
  // what turns two enemies into one wallpaper pattern.
  const bob = Math.sin(s.time * 2.3 + e.position.x * 0.07) * 0.6;
  const shoulderY = -33 + bob;

  segment(s, { x: -4, y: -18 }, { x: -6.5, y: -2 }, 5.4, GUN_TROUSER);
  segment(s, { x: 4, y: -18 }, { x: 6.5, y: -2 }, 5.4, GUN_TROUSER);
  ctx.fillStyle = GUN_MASK;
  ctx.fillRect(-10, -3, 7.5, 3);
  ctx.fillRect(3, -3, 8.5, 3);

  // Back arm behind the torso, front arm in front of it, so the coat separates
  // them. Two arms at the same depth on a 13px-wide body is one wide sleeve.
  limb(s, { x: -4.5, y: shoulderY + 1 }, { x: -8, y: -26 }, { x: -6, y: -19 }, 4.4, GUN_COAT_SHADE);

  band(s, { x: 0, y: shoulderY }, { x: 0, y: -14 }, 17, 14.5, coat);
  // The hem, a shade darker and flared: the one line that says "coat" rather
  // than "torso" at a size where buttons and lapels are gone.
  band(s, { x: 0, y: -19 }, { x: 0, y: -13 }, 15, 16.5, GUN_COAT_SHADE);

  // Neck, collar, head — in that order, and the order is the whole point. A neck
  // in the same skin tone as the face, round-capped, merges with the head into
  // one pale wedge that reads as a nose rather than a person (the first crop of
  // this figure did exactly that). So the neck is a *shadow* tone and the collar
  // is drawn over its base, which leaves the lit skin as a separate shape with a
  // jawline under it.
  segment(s, { x: 1, y: shoulderY + 0.5 }, { x: 1, y: shoulderY - 3 }, 3.6, GUN_SKIN_SHADE);
  band(s, { x: 0, y: shoulderY - 1.5 }, { x: 0, y: shoulderY + 2.5 }, 9, 14, GUN_COAT_SHADE);
  disc(s, { x: 1.5, y: shoulderY - 7 }, 4.6, GUN_SKIN);
  // A cap: crown plus a forward brim. The brim is the cheapest facing cue there
  // is — it points the way he is looking from any distance, and unlike an eye
  // it is still a shape at 0.49 scale.
  ctx.fillStyle = GUN_MASK;
  ctx.beginPath();
  ctx.arc(1.5, shoulderY - 7, 4.7, Math.PI, TAU);
  ctx.fill();
  ctx.fillRect(1.5, shoulderY - 8.8, 7.5, 1.9);

  // The pistol, hinged at the fixed muzzle offset and rotated onto the target.
  // The hand stays put while the barrel swings, which is what makes the aim
  // readable as *aiming* rather than as the whole man rocking back and forth.
  const gunX = GUNMAN_MUZZLE_DX;
  const gunY = GUNMAN_MUZZLE_DY - GUNMAN_H;
  const angle = Math.atan2(uy, ux * facing);

  limb(s, { x: 4.5, y: shoulderY + 1 }, { x: 9, y: -31 }, { x: gunX, y: gunY }, 4.6, coat);
  ctx.save();
  ctx.translate(gunX, gunY);
  ctx.rotate(angle);
  ctx.fillStyle = GUN_METAL;
  ctx.fillRect(-2, -1.6, 9, 3.2);
  ctx.fillStyle = GUN_MASK;
  ctx.fillRect(-1.5, 0.6, 3.4, 4.6);
  disc(s, { x: 0, y: 0 }, 2.4, GUN_SKIN);

  // The flash. Fires *after* the slug exists, so it confirms a shot rather than
  // predicting one — the lane already did the predicting, and a second warning
  // at the moment of firing would be noise arriving too late to act on.
  if (e.muzzleMs > 0) {
    const f = clamp(e.muzzleMs / 90, 0, 1);
    ctx.globalAlpha = f;
    disc(s, { x: 9.5, y: 0 }, 3.2 + 2.6 * f, MUZZLE_FLASH);
    ctx.strokeStyle = MUZZLE_FLASH;
    ctx.lineWidth = lineW(s, 1.6);
    ctx.beginPath();
    for (const a of [-0.6, 0, 0.6]) {
      ctx.moveTo(9.5, 0);
      ctx.lineTo(9.5 + Math.cos(a) * 11 * f, Math.sin(a) * 11 * f);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.restore();
}

// --- Projectiles ------------------------------------------------------------

/** The thrown block, drawn as its own object (grey rubble, nothing green) so
 *  its arc can be tracked separately from Doc Ock himself — the brief's
 *  requirement, and the reason it tumbles: rotation is what the eye locks
 *  onto when following a parabola. */
function drawBlockShape(s: Scene, at: Vec2, rot: number): void {
  const { ctx } = s;
  const r = PROJECTILE_W / 2;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(rot);
  ctx.fillStyle = BLOCK_FACE;
  ctx.fillRect(-r, -r, PROJECTILE_W, PROJECTILE_H);
  ctx.fillStyle = BLOCK_SHADE;
  ctx.fillRect(-r, r * 0.35, PROJECTILE_W, r * 0.65);
  ctx.fillRect(r * 0.4, -r, r * 0.6, PROJECTILE_H);
  if (s.detail) {
    ctx.strokeStyle = BLOCK_REBAR;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r - 3, -r * 0.3);
    ctx.lineTo(r + 3, -r * 0.1);
    ctx.stroke();
  }
  ctx.strokeStyle = BLOCK_SHADE;
  ctx.lineWidth = lineW(s, 1.4);
  ctx.strokeRect(-r, -r, PROJECTILE_W, PROJECTILE_H);
  ctx.restore();
}

/** A slug in flight: a tracer, not a bullet.
 *
 *  A 9x5 object crossing the screen at 620px/s is, at the phone's 0.49 scale,
 *  about two pixels moving ten of them per frame — which is to say invisible.
 *  So the drawn thing is mostly the trail: a streak along the direction of
 *  travel with the round core at its head. That is also the honest picture,
 *  since what the player has to judge is the *line*, not the pellet. */
function drawSlug(s: Scene, p: Projectile): void {
  const { ctx } = s;
  const c = { x: p.position.x + p.w / 2, y: p.position.y + p.h / 2 };
  const sp = Math.hypot(p.vel.x, p.vel.y) || 1;
  const ux = p.vel.x / sp;
  const uy = p.vel.y / sp;

  ctx.strokeStyle = SLUG_TRAIL;
  ctx.lineWidth = lineW(s, 4);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(c.x - ux * 34, c.y - uy * 34);
  ctx.stroke();

  ctx.strokeStyle = SLUG_CORE;
  ctx.lineWidth = lineW(s, 1.8);
  ctx.beginPath();
  ctx.moveTo(c.x + ux * 3, c.y + uy * 3);
  ctx.lineTo(c.x - ux * 12, c.y - uy * 12);
  ctx.stroke();

  disc(s, c, lineW(s, 2.2), SLUG_CORE);
}

export function drawProjectile(s: Scene, p: Projectile): void {
  const { ctx } = s;
  if (p.kind === "slug") {
    drawSlug(s, p);
    return;
  }
  const c = { x: p.position.x + PROJECTILE_W / 2, y: p.position.y + PROJECTILE_H / 2 };

  // A short motion trail along the current velocity: makes a fast block
  // readable at phone size, where 22px of world is 11 screen px.
  const sp = Math.hypot(p.vel.x, p.vel.y) || 1;
  ctx.strokeStyle = "rgba(141,153,166,0.32)";
  ctx.lineWidth = lineW(s, PROJECTILE_W * 0.5);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(c.x - (p.vel.x / sp) * 20, c.y - (p.vel.y / sp) * 20);
  ctx.stroke();

  drawBlockShape(s, c, p.elapsed * 5);
}

// --- HUD --------------------------------------------------------------------

export interface HudState {
  health: number;
  maxHealth: number;
  levelName: string;
  levelIndex: number;
  levelCount: number;
  /** How many times the final door has been reached — 0 on the first
   *  playthrough. Shown as "Loop N" (1-based) so a fresh run still reads as
   *  something rather than a blank. */
  loop: number;
}

/** Screen space, after the world transform is popped. Information only — a
 *  health bar and which level you are on. No prompts, no key hints: the
 *  no-tutorial rule is about instruction, and neither of these instructs. */
export function drawHud(s: Scene, view: Viewport, hud: HudState): void {
  const { ctx } = s;
  // Scaled with the viewport so the bar is the same *proportion* of a phone
  // screen as of a desktop one. Fixed pixels would make it a hairline on one
  // and a banner on the other.
  const u = clamp(view.w / 1920, 0.45, 1.15);
  const x = 22 * u + 10;
  const y = 22 * u + 10;
  const w = 300 * u;
  const h = 16 * u;
  const frac = clamp(hud.health / hud.maxHealth, 0, 1);

  ctx.fillStyle = HUD_TRACK;
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);

  const color = frac > 0.5 ? HP_HIGH : frac > 0.25 ? HP_MID : HP_LOW;
  // Low health pulses. The only "you are in trouble" signal in the game, and
  // it costs no text.
  ctx.globalAlpha = frac > 0.25 ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(s.time * 5));
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * frac, h);
  ctx.globalAlpha = 1;

  // Segment ticks at 20%, which is Doc Ock's melee damage — so "how many more
  // hits can I take" is countable at a glance rather than estimated.
  ctx.fillStyle = "rgba(8,12,28,0.55)";
  for (let i = 1; i < 5; i += 1) ctx.fillRect(x + (w / 5) * i - 1, y, 2, h);

  ctx.strokeStyle = HUD_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);

  // Level pips, then the name.
  const pipY = y + h + 9 * u;
  const pip = 9 * u;
  for (let i = 0; i < hud.levelCount; i += 1) {
    ctx.fillStyle = i <= hud.levelIndex ? DOOR_LIGHT : "rgba(232,238,255,0.22)";
    ctx.fillRect(x + i * (pip + 5 * u), pipY, pip, Math.max(3 * u, 2));
  }

  ctx.fillStyle = HUD_TEXT;
  ctx.font = `${Math.round(15 * u)}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  // "Loop 1" rather than "Loop 0" for the first playthrough — the counter is
  // there so a player who has looped knows it, not so they can see a zero.
  ctx.fillText(`${hud.levelName}  ·  Loop ${hud.loop + 1}`, x, pipY + 10 * u);
}

// --- Frame ------------------------------------------------------------------

/** A web shot mid-flight (or mid-fade), owned by main.ts.
 *
 *  This exists as frame state rather than as a flag on the player because a
 *  shot that misses, or that kills its target, has no rope to become — there is
 *  nothing in `PlayerState` for it to live on once it is over. `progress` is
 *  0..1 out to `to`, and `fade` 1..0 afterwards. */
export interface WebShot {
  to: Vec2;
  progress: number;
  fade: number;
  /** True when this shot's anchor is already the player's rope. The rope and
   *  the shot are then the same strand and must be drawn once, at the shot's
   *  extension — see drawFrame. */
  attached: boolean;
}

export interface FrameState {
  level: Level;
  player: PlayerState;
  facing: Facing;
  enemies: readonly Enemy[];
  projectiles: readonly Projectile[];
  /** The target web.ts resolved this frame, when the player is aiming. */
  aim: WebTarget | null;
  /** The strand travelling out from the hand, if one is in the air. */
  shot: WebShot | null;
  hud: HudState;
}

/** One frame, in the order the layers have to composite: sky and parallax city
 *  in screen space, then everything in the world, then the HUD back in screen
 *  space. main.ts owns the camera and the transform; this owns what goes in it,
 *  so "what is drawn" and "where the camera is" stay separable. */
export function drawFrame(s: Scene, view: Viewport, f: FrameState): void {
  const { ctx } = s;
  ctx.clearRect(0, 0, view.w, view.h);
  drawSky(s, view);
  drawSkyline(s, view);

  ctx.save();
  // Scale before translate, so the translation is in world units.
  ctx.scale(s.scale, s.scale);
  ctx.translate(-view.cam.x, -view.cam.y);

  drawPlatforms(s, f.level);
  drawVoid(s, f.level);
  // Locked while anything is still alive on this level. The door is the only
  // object in the game whose appearance is a rule rather than a state of the
  // world, and it has to be, because there is no text to say "kill them first".
  drawDoor(s, doorRect(f.level), f.enemies.length > 0);

  const center = playerCenter(f.player);
  const hand = playerHandWorld(f.player, f.facing, s.time);

  // One strand, three cases, and exactly one of them draws.
  //
  // The rope and a shot at the same anchor are the same object to the player,
  // so an attached shot draws *instead of* the rope, partially extended: main.ts
  // attaches on the frame the trigger is released (see the note there), which
  // means for a few frames the swing exists before its strand has arrived, and
  // the strand is what the player is watching.
  //
  // Shots at enemies and shots at nothing are drawn here rather than after the
  // enemies, so a strand that ends on a boss ends *behind* him — it reads as
  // having struck him instead of as having been painted over him.
  if (f.shot?.attached && f.player.swing) {
    drawWebStrand(s, hand, f.player.swing.anchor, f.shot.progress);
  } else if (f.player.swing) {
    // A zip and a taut swing draw the same straight rope on purpose —
    // physics.ts makes them one action to the player — so this does not branch
    // on phase.
    drawWebStrand(s, hand, f.player.swing.anchor, 1);
  } else if (f.shot) {
    drawWebStrand(s, hand, f.shot.to, f.shot.progress, f.shot.fade);
  }

  for (const e of f.enemies) drawEnemy(s, e, center);
  for (const p of f.projectiles) drawProjectile(s, p);

  // Above the enemies, so a shot lined up on a boss is not hidden behind it.
  // Anchored on the player's *centre*, because that is the origin main.ts
  // hands to resolveWebTarget — drawing it from the hand would be a prettier
  // line that lies about where the ray starts.
  if (f.aim) drawAimPreview(s, center, f.aim);

  drawPlayer(s, f.player, f.facing);

  ctx.restore();
  drawHud(s, view, f.hud);
}
