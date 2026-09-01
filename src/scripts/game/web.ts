// Web targeting: the single decision the whole mechanic pivots on — what a
// shot hits, and therefore what firing the web *does*. Pure and DOM-free, like
// physics.ts, so deliverable 9's test can call it with plain literals instead
// of a canvas.
//
// No dependency on physics.ts or level.ts (neither exists yet, and even once
// they do this stays one-directional): WEB_RANGE is the source of truth for
// how far a shot reaches, and DEFAULT_PHYSICS.maxRopeLength is hand-kept equal
// to it — see the comment there. A rope can't stretch to an anchor the ray
// wasn't allowed to reach.

import type { Rect, Vec2 } from "./geometry";

/** Shot range. Keep equal to physics.ts's DEFAULT_PHYSICS.maxRopeLength: a
 *  longer ray would resolve anchors the swing constraint then has to clamp,
 *  and the clamp is a visible teleport toward the anchor. */
export const WEB_RANGE = 520;

/** What resolveWebTarget needs from an enemy. entities.ts's real `Enemy`
 *  union (deliverable 5) satisfies this structurally, the same way
 *  physics.ts's MoveIntent lets InputState pass through untouched. */
export interface WebTargetEnemy {
  id: string;
  hitbox: Rect;
}

/** The subset of level geometry targeting needs. level.ts's real `Level`
 *  (deliverable 6) satisfies this structurally — its `platforms` field is
 *  named to match. */
export interface WebTargetLevel {
  platforms: readonly Rect[];
  enemies?: readonly WebTargetEnemy[];
}

export type WebTargetType = "anchor" | "enemy" | "miss";

export interface WebTarget {
  type: WebTargetType;
  /** Where the shot ends: the hit point for 'anchor'/'enemy', or the point at
   *  WEB_RANGE along the ray for 'miss'. Always present, so a caller drawing
   *  the aim preview never has to special-case a miss to find a line to draw. */
  point: Vec2;
  enemy?: WebTargetEnemy;
}

/** Ray-vs-AABB distance by the slab method: for each axis, the ray enters and
 *  leaves a band of the rect at some t, and it hits the whole rect only where
 *  those per-axis intervals overlap. `dir` must be a unit vector, so the
 *  returned distance is in the same pixels as maxDist and the rects. */
function rayRectDistance(origin: Vec2, dir: Vec2, rect: Rect, maxDist: number): number | null {
  let tMin = 0;
  let tMax = maxDist;

  if (dir.x === 0) {
    if (origin.x < rect.x || origin.x > rect.x + rect.w) return null;
  } else {
    const t1 = (rect.x - origin.x) / dir.x;
    const t2 = (rect.x + rect.w - origin.x) / dir.x;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  if (dir.y === 0) {
    if (origin.y < rect.y || origin.y > rect.y + rect.h) return null;
  } else {
    const t1 = (rect.y - origin.y) / dir.y;
    const t2 = (rect.y + rect.h - origin.y) / dir.y;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  return tMin <= tMax ? tMin : null;
}

/** Aim, and get back what the web would do: swing off a wall, hit an enemy,
 *  or nothing. Also the trajectory preview: render.ts calls this every frame
 *  while the player is dragging to aim and draws `origin` -> `point`, so the
 *  preview is provably the same ray the shot will actually use rather than a
 *  second copy of the math.
 *
 *  Walls beat enemies exactly on a tie (an enemy standing flush against a
 *  wall behind it doesn't steal the shot) — not a case worth being more
 *  clever about, since level geometry keeps enemies clear of the walls they
 *  themselves can spawn attacks against.
 */
export function resolveWebTarget(origin: Vec2, aimVector: Vec2, level: WebTargetLevel): WebTarget {
  const len = Math.hypot(aimVector.x, aimVector.y);
  if (len < 1e-6) return { type: "miss", point: { ...origin } };
  const dir: Vec2 = { x: aimVector.x / len, y: aimVector.y / len };

  let bestDist = WEB_RANGE;
  let bestType: WebTargetType = "miss";
  let bestEnemy: WebTargetEnemy | undefined;

  for (const plat of level.platforms) {
    const dist = rayRectDistance(origin, dir, plat, bestDist);
    if (dist !== null && dist < bestDist) {
      bestDist = dist;
      bestType = "anchor";
      bestEnemy = undefined;
    }
  }

  for (const enemy of level.enemies ?? []) {
    const dist = rayRectDistance(origin, dir, enemy.hitbox, bestDist);
    if (dist !== null && dist < bestDist) {
      bestDist = dist;
      bestType = "enemy";
      bestEnemy = enemy;
    }
  }

  const point: Vec2 = { x: origin.x + dir.x * bestDist, y: origin.y + dir.y * bestDist };
  return bestType === "miss" ? { type: "miss", point } : { type: bestType, point, enemy: bestEnemy };
}
