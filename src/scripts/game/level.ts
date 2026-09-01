// Level layouts. Data, not behaviour: no canvas, no DOM, and no import from
// physics.ts — geometry.ts and entities.ts are the only dependencies, so
// game.ts (deliverable 8) can load a level without level.ts having an opinion
// about how the player moves through it.
//
// Every distance here was measured against the tuned physics rather than
// guessed, because "too wide to jump" and "wide enough to be lethal" are
// numbers the constants decide, not the designer:
//
//   jump height ...................... 109px  (jumpImpulse 660 @ gravity 2000)
//   longest jumpable flat gap ........ ~211px (0.66s of airtime at runSpeed)
//   one pumped swing, roof to roof ... 400px lands ~55% of naive attempts,
//                                      600px ~28%, 900px ~3%
//   wall climb tops out ............... yes — the cling breaks ~38px below the
//                                      lip and the coast + air control puts the
//                                      player on top, so a climb is a real
//                                      route to a ledge, not a dead end
//
// So: a gap of 170 is a jump, a gap of 420+ is a web shot, and nothing in
// between — an "almost jumpable" gap is the one width that teaches nothing.

import type { Enemy } from "./entities";
import { DEFAULT_DOC_OCK, DEFAULT_VENOM, DOC_OCK_H, VENOM_H, createDocOck, createVenom } from "./entities";
import type { Rect, Vec2 } from "./geometry";

export const DOOR_W = 44;
export const DOOR_H = 60;

export interface Level {
  /** Short label — the HUD's, and this file's, name for the level. */
  name: string;
  platforms: readonly Rect[];
  /** A factory, not an array. Enemies carry mutable health and phase, so a
   *  module-level `Enemy[]` literal would hand every retry of a level the
   *  half-dead, mid-telegraph boss the last attempt left behind. Calling this
   *  is what "load the level" means. */
  spawnEnemies: () => Enemy[];
  /** Top-left of the door box. Reaching it on the last level is the win. */
  door: Vec2;
  playerStart: Vec2;
  /** Below this, the player is lost. Derived by killPlaneBelow(), never typed
   *  by hand — see that function for why the two have to agree. */
  killPlaneY: number;
}

export function doorRect(level: Level): Rect {
  return { x: level.door.x, y: level.door.y, w: DOOR_W, h: DOOR_H };
}

/** Spawn an enemy with its feet on a platform, derived from that platform's own
 *  top rather than a typed constant. Deliverable 5 shipped a Doc Ock sunk 48px
 *  into a rooftop because its y was guessed; positions here are computed from
 *  the same rect the renderer draws, so that class of bug can't recur. */
function standing(platform: Rect, x: number, height: number): Vec2 {
  return { x, y: platform.y - height };
}

/** The kill plane goes *below every building's bottom edge*, and that is a
 *  rule, not a preference.
 *
 *  Falling into a gap is only a loss if there is nothing to catch on the way
 *  down — and a building's side wall is climbable. Measured: a player who
 *  misses a 380px jump falls into the gap, contacts the far building's face
 *  ~370px down, clings, and climbs out. The gap they were meant to swing over
 *  becomes a slightly slower staircase, and the level's one lesson evaporates.
 *
 *  Putting the plane under the geometry closes that off *and* makes the rule
 *  visible with no text: the buildings stop, and below where they stop there is
 *  nothing to hold. Gaps here are then sized past ~211px (unjumpable) so the
 *  fall is committed to before the far wall is anywhere near reach. */
function killPlaneBelow(platforms: readonly Rect[]): number {
  return Math.max(...platforms.map((p) => p.y + p.h)) + 60;
}

// --- Level 1 — the gap teaches the web -------------------------------------
//
// No enemies, no text, one idea. The opening frame has to carry it: the player
// stands a short walk from a roof that stops, the beam is up and to the right
// already inside web range, and there is nothing else on screen to try. Firing
// at it is the only move the geometry offers.
//
// The composition is sized for the *narrow* marking viewport, not the wide one.
// The camera is a plain translation (main.ts), so a 390px-wide phone shows
// ±195px of world around the player: anything the opening frame has to teach
// with lives inside that band. From the spawn, the roof's edge is +94px and the
// beam's near end +97px, so both are on screen on a phone and merely
// comfortable on a desktop — the reverse ordering (compose wide, hope it
// crops) would have put the whole lesson off the side of a phone.

const L1_ROOF_A: Rect = { x: 0, y: 560, w: 480, h: 380 };
const L1_ROOF_B: Rect = { x: 900, y: 640, w: 560, h: 300 };
const L1_TOWER: Rect = { x: 1280, y: 460, w: 180, h: 180 };
const L1_PLATFORMS: readonly Rect[] = [
  L1_ROOF_A,
  // A parapet at the left edge. Blocks the one direction that leads nowhere,
  // so "go right" needs no arrow, and gives the roof a readable near end.
  { x: 0, y: 480, w: 28, h: 80 },
  // The beam. Long and starting almost overhead: the near end is visible from
  // the spawn on any viewport, and it runs *toward* the gap, so following it
  // with your eyes is already the hint. Long also means the player can aim at
  // a far part of it for a longer rope and a wider arc.
  { x: 470, y: 260, w: 380, h: 26 },
  // 420px of nothing. Twice the longest jump, so there is no "maybe", and the
  // landing roof sits 80px lower than the start — an undershot swing still
  // gets its extra airtime and lands.
  L1_ROOF_B,
  // The way out: 180px up, above jump height, so the door is behind a
  // wall-climb. Flush with the roof's right edge, so there is no ledge past it
  // to fall off while learning to climb.
  L1_TOWER,
];

const LEVEL_1: Level = {
  name: "Rooftops",
  platforms: L1_PLATFORMS,
  spawnEnemies: () => [],
  door: { x: L1_TOWER.x + (L1_TOWER.w - DOOR_W) / 2, y: L1_TOWER.y - DOOR_H },
  playerStart: { x: 360, y: L1_ROOF_A.y - 40 },
  killPlaneY: killPlaneBelow(L1_PLATFORMS),
};

// --- Level 2 — Doc Ock ------------------------------------------------------
//
// The arena is 1140px wide for one reason: Doc Ock's armReach is 140px
// centre-to-centre and his blocks take 1.4s to land, which is 448px of running
// at full speed. A player who cannot spend that much distance cannot dodge a
// telegraph they read correctly, and an attack you can see coming and still
// can't avoid is worse than an unfair one. So the floor is clear from wall to
// wall and he stands in the middle of it, 540px from where the player spawns —
// outside melee range on arrival, with the whole arena behind them to retreat
// into.
//
// The only furniture is overhead. A pillar on the floor would have read as
// cover, but web targeting resolves walls before enemies, so a pillar between
// the player and Doc Ock silently eats every shot aimed at him — the same
// "wall behind the enemy steals the shot" failure deliverable 5 hit at spawn
// time, rebuilt into the level instead. Beams at y≈290 are far above any
// player-to-boss sightline, so they can be swing anchors without ever being
// obstacles.

const L2_FLOOR: Rect = { x: 560, y: 620, w: 1140, h: 320 };
const L2_EXIT: Rect = { x: 2140, y: 660, w: 480, h: 280 };
const L2_TOWER: Rect = { x: 2440, y: 480, w: 180, h: 180 };
const L2_PLATFORMS: readonly Rect[] = [
  L2_FLOOR,
  // The neighbouring building's face, closing the arena's left side. Climbable,
  // so backing all the way out is a corner to escape from rather than a trap.
  { x: 560, y: 300, w: 64, h: 320 },
  // Dodge anchor: swinging out of a block's arc is the point of it being here.
  { x: 1020, y: 290, w: 220, h: 26 },
  // Exit anchor, over the gap.
  { x: 1790, y: 280, w: 240, h: 26 },
  L2_EXIT,
  L2_TOWER,
];

const LEVEL_2: Level = {
  name: "Doc Ock",
  platforms: L2_PLATFORMS,
  // Fought at the tuned defaults. He is the first enemy the player meets, so
  // the baseline in entities.ts is exactly the right difficulty for him; the
  // step up happens in level 3.
  spawnEnemies: () => [createDocOck(standing(L2_FLOOR, 1240, DOC_OCK_H), DEFAULT_DOC_OCK)],
  door: { x: L2_TOWER.x + (L2_TOWER.w - DOOR_W) / 2, y: L2_TOWER.y - DOOR_H },
  // 900, not the 700 this shipped with. At 700 the player stood 527px from Doc
  // Ock, which frames fine on a desktop and puts him off-screen entirely on a
  // 390px-wide phone — you walked into a boss fight you had never seen. The
  // camera can't fix that: framing 527px of world on a phone needs a zoom that
  // renders the player 11px tall. Moving the spawn is the cheap half. It costs
  // nothing the arena was sized for — retreat room is measured from Doc Ock
  // (680px to the left wall, still well past the 448px a thrown block buys),
  // and 340px of separation is far outside his 140px reach.
  playerStart: { x: 900, y: L2_FLOOR.y - 40 },
  killPlaneY: killPlaneBelow(L2_PLATFORMS),
};

// --- Level 3 — Venom, and the swing out -------------------------------------
//
// The two mechanics have to interact, not just take turns. Venom patrols the
// middle of the only roof, and the only exit is a 480px gap — so the player is
// aiming, firing and swinging *while* something is winding up a leap at them,
// which is a different act from doing either of those calmly.
//
// Two anchors over the roof itself, before the exit anchor, so swinging away
// from a telegraph is always available and never a one-shot: an escape route
// the player has to nail on the first attempt isn't an escape route.

const L3_ROOF: Rect = { x: 0, y: 640, w: 1120, h: 300 };
const L3_EXIT: Rect = { x: 1600, y: 700, w: 500, h: 240 };
const L3_TOWER: Rect = { x: 1920, y: 520, w: 180, h: 180 };
const L3_PLATFORMS: readonly Rect[] = [
  L3_ROOF,
  { x: 0, y: 560, w: 28, h: 80 },
  { x: 380, y: 300, w: 220, h: 26 },
  { x: 830, y: 270, w: 240, h: 26 },
  { x: 1180, y: 300, w: 240, h: 26 },
  L3_EXIT,
  L3_TOWER,
];

/** Venom, a step above the defaults: quicker to commit, quicker to recover, and
 *  he notices the player from further off. The numbers moved because this is
 *  the last level and the brief asks enemies to get harder, and they moved
 *  *here* rather than in entities.ts because a per-spawn config is exactly what
 *  the DEFAULT_VENOM/VenomConfig split was built for — the baseline stays
 *  honest and this is one level's opinion of it. A first pass: deliverable 10
 *  re-picks these from play. */
const LEVEL_3_VENOM = {
  ...DEFAULT_VENOM,
  telegraphMs: 480,
  aggroRange: 300,
  recoverMs: 950,
  patrolSpeed: 80,
};

const LEVEL_3: Level = {
  name: "Venom",
  platforms: L3_PLATFORMS,
  // Venom at 520, not the 780 this shipped with — the same off-screen-boss fix
  // as level 2, applied to the enemy instead of the spawn. Here it's the spawn
  // that has a job: the parapet at the player's back is what says "go right"
  // without a word, and it only says it if the player starts beside it. Moving
  // Venom instead keeps that, and it costs nothing — he still stands between
  // the player and the gap, with 600px of roof behind him to be fought in, and
  // at 410px he is still outside his own 300px aggro range at spawn, so he
  // notices you as you approach rather than the instant the level loads.
  spawnEnemies: () => [createVenom(standing(L3_ROOF, 520, VENOM_H), LEVEL_3_VENOM)],
  door: { x: L3_TOWER.x + (L3_TOWER.w - DOOR_W) / 2, y: L3_TOWER.y - DOOR_H },
  playerStart: { x: 110, y: L3_ROOF.y - 40 },
  killPlaneY: killPlaneBelow(L3_PLATFORMS),
};

export const LEVELS: readonly Level[] = [LEVEL_1, LEVEL_2, LEVEL_3];
