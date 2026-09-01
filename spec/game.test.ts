// The one mechanical rule the brief asks to be under test: what a web shot
// hits. resolveWebTarget (deliverable 4) is the pure decision the whole
// context-sensitive action pivots on — swing off a wall, damage an enemy, or
// nothing — so it's tested directly with plain data, no canvas or DOM.

import { describe, expect, it } from "vitest";
import type { Rect, Vec2 } from "../src/scripts/game/geometry";
import { resolveWebTarget, WEB_RANGE, type WebTargetLevel } from "../src/scripts/game/web";

const ORIGIN: Vec2 = { x: 0, y: 0 };

describe("resolveWebTarget", () => {
  it("aiming at a wall resolves to an anchor", () => {
    const wall: Rect = { x: 100, y: -20, w: 40, h: 40 };
    const level: WebTargetLevel = { platforms: [wall] };

    const target = resolveWebTarget(ORIGIN, { x: 1, y: 0 }, level);

    expect(target.type).toBe("anchor");
  });

  it("aiming at an enemy resolves to that enemy", () => {
    const enemy = { id: "doc-ock", hitbox: { x: 100, y: -20, w: 40, h: 40 } };
    const level: WebTargetLevel = { platforms: [], enemies: [enemy] };

    const target = resolveWebTarget(ORIGIN, { x: 1, y: 0 }, level);

    expect(target.type).toBe("enemy");
    expect(target.enemy?.id).toBe("doc-ock");
  });

  it("aiming at empty space misses, landing at WEB_RANGE along the aim", () => {
    const level: WebTargetLevel = { platforms: [], enemies: [] };

    const target = resolveWebTarget(ORIGIN, { x: 1, y: 0 }, level);

    expect(target.type).toBe("miss");
    expect(target.point.x).toBeCloseTo(WEB_RANGE);
  });
});
