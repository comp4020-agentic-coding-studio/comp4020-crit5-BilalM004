// SENSOR (not a contract test — this outlives the brief).
//
// Everything a level places — the player, a boss, the door — is positioned by
// its top-left corner against geometry defined somewhere else in the file. That
// is a subtraction the author does in their head, and deliverable 5 already got
// it wrong once: Doc Ock's spawn y was a guessed constant that sank him 48px
// into the rooftop, which the type checker was happy with and which only turned
// up because his body was also swallowing every web shot aimed at him.
//
// The tell is cheap to state and impossible to argue with: a thing standing on
// a surface has its bottom edge exactly on that surface, and overlaps no solid
// geometry at all. Nothing here knows what a level *should* look like, so this
// keeps working when deliverable 10 moves the layouts around, and it comes with
// us to any later week that places entities on geometry.

import { expect, test } from "vitest";
import { enemyHitbox } from "../src/scripts/game/entities";
import type { Rect } from "../src/scripts/game/geometry";
import { overlaps } from "../src/scripts/game/geometry";
import { LEVELS, doorRect } from "../src/scripts/game/level";
import { PLAYER_H, PLAYER_W } from "../src/scripts/game/physics";

/** Everything each level places, as (label, box) pairs. */
function placements(level: (typeof LEVELS)[number]): [string, Rect][] {
  return [
    ["player start", { x: level.playerStart.x, y: level.playerStart.y, w: PLAYER_W, h: PLAYER_H }],
    ["door", doorRect(level)],
    ...level.spawnEnemies().map((e): [string, Rect] => [`enemy ${e.kind}`, enemyHitbox(e)]),
  ];
}

test.each(LEVELS.map((l) => [l.name, l] as const))("%s: nothing is placed inside a wall", (_name, level) => {
  for (const [label, box] of placements(level)) {
    const inside = level.platforms.filter((p) => overlaps(box, p));
    expect(inside, `${label} overlaps ${inside.length} platform(s)`).toEqual([]);
  }
});

test.each(LEVELS.map((l) => [l.name, l] as const))("%s: nothing is placed floating", (_name, level) => {
  for (const [label, box] of placements(level)) {
    // Resting means the bottom edge sits on a platform top, and that platform
    // is actually underfoot horizontally rather than somewhere else in the
    // level that happens to share a y.
    const resting = level.platforms.some(
      (p) => p.y === box.y + box.h && p.x < box.x + box.w && box.x < p.x + p.w,
    );
    expect(resting, `${label} at y=${box.y} has nothing under it`).toBe(true);
  }
});

test.each(LEVELS.map((l) => [l.name, l] as const))("%s: the kill plane is below the buildings", (_name, level) => {
  // A gap is only a loss if there is nothing to catch on the way down, and a
  // building's side is climbable: a player who misses a jump can otherwise
  // land on the far wall and climb out, turning the gap into a staircase. The
  // plane has to sit under the lowest geometry for the fall to be committed.
  const lowest = Math.max(...level.platforms.map((p) => p.y + p.h));
  expect(level.killPlaneY).toBeGreaterThan(lowest);
});

test("a level's enemies are fresh on every load", () => {
  // Levels hand out enemies through a factory rather than a shared array, so
  // retrying never inherits the last attempt's half-dead, mid-telegraph boss.
  for (const level of LEVELS) {
    const first = level.spawnEnemies();
    const second = level.spawnEnemies();
    for (let i = 0; i < first.length; i++) {
      expect(second[i]).not.toBe(first[i]);
      first[i].health = 0;
      expect(second[i].health).toBeGreaterThan(0);
    }
  }
});
