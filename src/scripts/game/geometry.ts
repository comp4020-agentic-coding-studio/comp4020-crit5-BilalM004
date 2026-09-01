// Shared geometry primitives. Lives on its own because input, physics, web
// targeting, levels and rendering all speak in points and rectangles, and a
// single definition keeps them literally the same type rather than four
// structurally-identical ones.

export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned box, top-left origin, y increasing downward (canvas coords). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// Strict inequalities: boxes that merely share an edge (a player standing
// exactly on a platform) are touching, not overlapping. Collision resolution
// below depends on that — otherwise resting on the ground re-triggers a
// resolve every tick.
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
