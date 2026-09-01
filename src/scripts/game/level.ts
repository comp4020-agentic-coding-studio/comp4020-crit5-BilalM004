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
import {
  DEFAULT_DOC_OCK,
  DEFAULT_GUNMAN,
  DEFAULT_VENOM,
  DOC_OCK_H,
  GUNMAN_H,
  VENOM_H,
  createDocOck,
  createGunman,
  createVenom,
} from "./entities";
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
  /** Top-left of the door box. Reaching it advances, but only once the level's
   *  enemies are gone — main.ts owns that rule and render.ts draws the door
   *  sealed until then, so the door is a lock the player reads rather than a
   *  trigger that mysteriously does nothing. */
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

// --- Level 1 — the gap teaches the web, and the far roof teaches the rest ---
//
// No text, one idea at a time. The opening frame has to carry the first: the
// player stands a short walk from a roof that stops, the beam is up and to the
// right already inside web range, and there is nothing else on screen to try.
// Firing at it is the only move the geometry offers.
//
// The gunman is the second idea, and he is *across the gap* precisely so he
// cannot interfere with the first. At the spawn he is 655px away — outside his
// own 430px aggro range, and off the side of a 390px-wide phone — so the
// opening frame is exactly the frame it was before he existed. He wakes when
// the player is already over the gap, which is the earliest moment he is on
// screen at either marking viewport, and lands his first shot as they touch
// down beside him. With the door now sealed until the roof is clear, the only
// way on is to point the same button at a person instead of a wall.
//
// The composition is sized for the *narrow* marking viewport, not the wide one.
// Deliverable 7's camera zooms to fit rather than cropping, so a 390px-wide
// phone sees ±400px of world around the player and a desktop ±764px: anything
// the opening frame has to teach with lives inside the narrower band. From the
// spawn, the roof's edge is +94px and the beam's near end +97px, so both are on
// screen on a phone and merely comfortable on a desktop — the reverse ordering
// (compose wide, hope it crops) would have put the whole lesson off the side of
// a phone. The same band is why the gunman is at 1010 and not closer.

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
  // Standing clear of the tower (which starts at 1280) so there is no wall
  // behind him to steal a shot aimed at his body — deliverable 5's bug, and
  // deliverable 6's version of it in level geometry. From the landing roof he
  // is a straight, unobstructed line.
  spawnEnemies: () => [createGunman(standing(L1_ROOF_B, 1010, GUNMAN_H), DEFAULT_GUNMAN)],
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

/** Doc Ock, well past the entities.ts baseline. Health carries across levels,
 *  so the arithmetic that matters is the *run*, not the fight: at 100 max health
 *  two clean melee hits and a block is a dead player, and arriving at Venom
 *  healthy is something you earn rather than receive.
 *
 *  He now *walks*, and that is the change the rest of these numbers are sized
 *  around. A stationary boss with a 260px reach is a 260px-wide no-go zone you
 *  route around once; a walking one turns the same number into pressure that
 *  follows you, which is what makes the reach increase felt rather than merely
 *  larger. 130px/s is deliberately 40% of the player's 320 runSpeed — fast
 *  enough that backing off costs real ground and a retreat has to end in a
 *  swing or a corner, slow enough that the retreat exists at all.
 *
 *  `advanceRange` is the one number here derived from the geometry rather than
 *  chosen. Deliverable 6 measured this floor at 1140px (x 560..1700) with the
 *  neighbouring building's climbable face at 624; 340 either side of his spawn
 *  at 1240 keeps him inside 900..1580 (right edge 1644, clear of the 1700 drop),
 *  and leaves a player pinned against that face at ~295px from his centre —
 *  outside the 260px ring, by design. The corner is a bad place to be, not a
 *  killbox: he cannot melee you there, he can only throw at you, and the beam
 *  anchor overhead at 1020..1240 is the way out.
 *
 *  `throwFlightTime` 1.4 -> 1.05 cuts what a dodge costs (448px of running to
 *  336px) precisely so the measured arena still fits a much faster boss. */
const LEVEL_2_OCK = {
  ...DEFAULT_DOC_OCK,
  armReach: 260,
  meleeDamage: 46,
  meleeTelegraphMs: 560,
  meleeCooldownMs: 700,
  throwDamage: 34,
  throwTelegraphMs: 400,
  throwCooldownMs: 1300,
  throwFlightTime: 1.05,
  walkSpeed: 130,
  advanceRange: 340,
  health: 70,
};

/** The gunman covering the exit gap — a step up from level 1's in every number
 *  that matters, and placed where he changes what the gap *is*. Swinging 440px
 *  was the level's victory lap; now it is done under fire, and the shot is
 *  committed to a line before the swing starts, so the swing itself is the
 *  dodge. */
const LEVEL_2_GUNMAN = {
  ...DEFAULT_GUNMAN,
  // Aggro and range are two different distances and only one of them can be
  // raised freely. `shotRange` is how far a slug that has already been fired
  // will chase you, and a tracer entering frame is readable — so it goes up
  // hard, and running away no longer outranges him. `aggroRange` is where he
  // starts *aiming*, and his dashed lane is the only warning that exists; a
  // phone at this camera sees ~400px either side of the player, so waking him
  // much past that is a shot with its telegraph drawn off-screen. 600 is
  // already past that and is the ceiling on purpose.
  aggroRange: 600,
  aimTelegraphMs: 540,
  cooldownMs: 1000,
  shotDamage: 22,
  shotSpeed: 660,
  shotRange: 1000,
  health: 30,
};

const LEVEL_2: Level = {
  name: "Doc Ock",
  platforms: L2_PLATFORMS,
  // The gunman is on the far side of the exit gap, not in the arena, and that
  // is a targeting constraint rather than a taste one: an enemy standing
  // between the player and Doc Ock would silently eat every shot aimed at the
  // boss, since resolveWebTarget returns the nearest thing on the ray and does
  // not care which of them the player meant. Across the gap he is never on that
  // line. From the arena he is ~900px away and asleep; he wakes as the player
  // reaches the anchor.
  spawnEnemies: () => [
    createDocOck(standing(L2_FLOOR, 1240, DOC_OCK_H), LEVEL_2_OCK),
    createGunman(standing(L2_EXIT, 2200, GUNMAN_H), LEVEL_2_GUNMAN),
  ],
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

/** Venom, and the numbers moved *here* rather than in entities.ts because a
 *  per-spawn config is exactly what the DEFAULT_VENOM/VenomConfig split was
 *  built for — the baseline stays honest and this is one level's opinion of it.
 *
 *  He is the last thing in the game and he hits like it: 44 damage is nearly
 *  half a full bar, and a full bar is not what anyone arrives here with. The
 *  350ms telegraph is the floor rather than a number I liked — below about
 *  300ms a wind-up stops being a wind-up and becomes a coin flip, and the whole
 *  fairness argument for a no-text game is that every hit was readable first.
 *
 *  `recoverMs` is the one number that moved *against* difficulty on purpose. It
 *  is the brief's genuine breather, and it is also the only window in which the
 *  player can safely aim a web at him; shrinking it to nothing would make him
 *  not harder but unkillable. 700ms is short enough to be pressure and long
 *  enough to be a shot. */
const LEVEL_3_VENOM = {
  ...DEFAULT_VENOM,
  leapDamage: 56,
  telegraphMs: 350,
  // 410, and the small number here is the *finding*, not a lack of nerve.
  //
  // I first took this to 560 and the phone screenshot refused it: at 390x844 the
  // camera shows 400 world px either side of the player, Venom stands 420px from
  // the spawn, and he was already a red sliver at the edge of the frame. A 560px
  // trigger means the wind-up — the only reason a leap that takes half your
  // health is fair rather than arbitrary — begins entirely off-screen. 410 puts
  // his near edge ~13px inside a phone frame, and is the ceiling, not a choice.
  //
  // So the reach went into `chaseRange` instead, and the result is a bigger
  // increase than 560 would have been: he now notices the player from 880px, two
  // thirds of the roof, and *walks at them* until he is close enough to leap.
  // The distance from which he is a threat roughly doubled; the distance from
  // which he can hit you without warning did not move. That is the whole trick,
  // and it is the same one Doc Ock's walk plays in level 2.
  aggroRange: 410,
  chaseRange: 880,
  // 165px/s: half the player's 320, so breaking away is always possible and
  // never free. Backing off to line up a shot now costs ground he is taking.
  chaseSpeed: 165,
  // Bounds both the walk and the leap's landing, from the geometry. The roof
  // runs 0..1120 and the roof gunman stands at 940; 340 either side of the spawn
  // at 520 holds Venom inside 180..860, measured at 170..916 including the
  // fraction of a frame a leap overshoots its solved landing by.
  //
  // The binding constraint is the roof's right edge, not the gunman. Venom has
  // no ground under him and no collision, so an unbounded lunge at a player out
  // over the 480px gap leaves him hovering in open sky. Standing in front of the
  // gunman is the milder problem it looks like: resolveWebTarget returns the
  // nearest thing on the ray, but unlike the *wall* version of this bug the
  // nearest thing here is an enemy who has to die anyway, so an intercepted shot
  // is redirected rather than wasted. What the box buys is that he cannot take
  // up permanent station there.
  roamRange: 340,
  // A leap is aimed where you are when the wind-up ends, so the dodge is lateral
  // movement during the flight — flight time *is* the dodge window. At 410px of
  // reach, 0.52s holds him under 800px/s at full extension, which is a readable
  // arc rather than a horizontal blur.
  leapFlightTime: 0.52,
  recoverMs: 650,
  patrolSpeed: 190,
  patrolRange: 200,
  health: 80,
};

/** Two of these, and they are the reason level 3 is a different kind of hard
 *  rather than the same kind with bigger numbers. Venom is one thing to read at
 *  a time; a gunman on the roof behind him and another across the gap mean the
 *  player is reading a leap telegraph while already standing on somebody's
 *  firing line. Both are one-shot-per-1.5s and both commit their line early, so
 *  the composite is busy rather than unfair — see stepGunman on why locking the
 *  aim early is what makes stacking them legitimate. */
const LEVEL_3_GUNMAN = {
  ...DEFAULT_GUNMAN,
  // Same split as level 2's: `shotRange` goes far past anything on this roof, so
  // there is no longer a distance at which you have simply left him behind, but
  // `aggroRange` stops at 640 because it is the telegraph that has to be on
  // screen when it starts.
  aggroRange: 640,
  aimTelegraphMs: 460,
  cooldownMs: 1350,
  shotDamage: 28,
  shotSpeed: 760,
  shotRange: 1200,
  health: 30,
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
  // and at 420px he is still outside his own 410px leap range at spawn, so the
  // level still opens with him noticed rather than mid-air. What he no longer
  // does is wait: 420 is inside his 880px chase, so he starts walking at the
  // player on the first frame and the approach happens whether or not they
  // advance.
  //
  // The gunmen sit either side of the gap, and neither stands between the
  // player and Venom — the same shot-stealing constraint as level 2. The first
  // is at 940, past the far end of Venom's 340px roam box (180..860) so Venom
  // cannot take up station in front of him; the second is on
  // the landing roof, so the swing across is covered from the far side exactly
  // as level 2's was, which is the one difficulty this level inherits rather
  // than invents.
  spawnEnemies: () => [
    createVenom(standing(L3_ROOF, 520, VENOM_H), LEVEL_3_VENOM),
    createGunman(standing(L3_ROOF, 940, GUNMAN_H), LEVEL_3_GUNMAN),
    createGunman(standing(L3_EXIT, 1700, GUNMAN_H), LEVEL_3_GUNMAN),
  ],
  door: { x: L3_TOWER.x + (L3_TOWER.w - DOOR_W) / 2, y: L3_TOWER.y - DOOR_H },
  playerStart: { x: 110, y: L3_ROOF.y - 40 },
  killPlaneY: killPlaneBelow(L3_PLATFORMS),
};

export const LEVELS: readonly Level[] = [LEVEL_1, LEVEL_2, LEVEL_3];
