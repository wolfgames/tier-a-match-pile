// what_in: plain screen-space rects (center x/y, w/h, rotation radians, paint-order zIndex) for
//          every remaining tile, plus a target tile id — computed by board/tiles.ts#tileLayoutFor
//          from the same jitter/rotation math used to actually place the Pixi node.
// what_out: the fraction of the target's own (rotated) footprint NOT covered by any tile painted
//           above it, and the tap-acceptance predicate boardRenderer.ts/tiles.ts gate
//           interactivity on.
// why_here: R-EXPOSURE (geometric-exposure pass, tier-a-build-v4) — replaces the abstract
//           grid-cell/layer rule (rules/isExposed.ts, unchanged, still used by rate.ts/solve.ts/
//           generate.ts) as the actual production tap-acceptance decision. Simple bounding-box
//           geometry only (no pixel/alpha inspection) — see docs/standards/guardrails.md's
//           sizing guidance for why we don't reach for anything heavier. Pure plain-data
//           function: no Pixi import needed, so it's cheaply unit-testable in isolation (kept
//           this way deliberately over switching to real Pixi node getBounds()/containsPoint() —
//           that would make this untestable without a renderer; rotated-rect point containment
//           gets us the accuracy without paying that cost).
//
// ROOT CAUSE of "visibly-exposed tiles wrongly un-tappable" (playtest finding, this pass): every
// tile actually renders rotated up to ~±10° (board/tiles.ts#tileLayoutFor's `rot`), but this file
// previously treated every rect — target AND coverers — as an axis-aligned, unrotated box. A
// rotated square's true footprint is a diamond that is SMALLER than its own unrotated axis-aligned
// box everywhere except right at the diagonal corners, so testing sample points against a
// covering tile's unrotated box systematically overstates how much that tile actually covers —
// sample points inside the (bigger, unrotated) box but outside the real rotated diamond got
// counted as "covered" when the real rendered tile doesn't actually paint over that pixel. With
// several overlapping ~±10°-rotated tiles stacked at similar centers (same-cell layer stacks are
// exactly this shape), that overstatement compounds and pushes genuinely-exposed tiles below
// MIN_EXPOSED_AREA_FRACTION. Fix: sample points across the target's own rotated footprint (not its
// unrotated box) and test containment against each covering rect's real rotated footprint too —
// both via a rotate-into-local-space check, still plain bounding-box geometry, no polygon
// clipping.
export interface TileRect {
  readonly id: string;
  /** Center x/y in the same screen space for every rect passed in one call. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Radians, same convention as Pixi's `Container.rotation` (and board/tiles.ts#TileLayout.rot).
   * Optional/defaults to 0 for callers (tests, mostly) that only care about axis-aligned cases. */
  readonly rotation?: number;
  /** Paint order — must match the actual Pixi zIndex boardRenderer.ts assigns, so this
   * calculation and the real topmost-wins hit-testing agree on what covers what. */
  readonly zIndex: number;
}

/** Sample grid resolution (NxN points) used to approximate the target's covered area from the
 * union of possibly-overlapping covering rects. Raised from 5x5 (R-EXPOSURE's original pass) to
 * 9x9 alongside the rotation-awareness fix below — a coarser grid left more room for a sample
 * point to land in a spot that happened to flip the verdict, on top of the rotation-unaware bias
 * this pass fixes. Still cheap: at most a couple hundred tiles per level, recomputed only on a
 * `pile` change (turn-based), never per-frame. */
const COVERAGE_SAMPLE_GRID = 9;

/**
 * R-EXPOSURE-GEOMETRIC tunable: the minimum fraction of a tile's own bounding box that must be
 * uncovered for it to count as tappable. Exists so a genuinely-negligible sliver (a percent or
 * two, real geometry but impractical to hit reliably by touch) doesn't register as "exposed" —
 * engineering judgment call, not a sourced spec value. Raise it if playtesting finds slivers
 * still too fiddly to tap; lower it if too many partially-covered tiles feel unfairly dead.
 */
export const MIN_EXPOSED_AREA_FRACTION = 0.25;

/** Conservative broad-phase: true if the two rects' bounding CIRCLES (half-diagonal radius, which
 * covers the rect at any rotation) could possibly overlap. May pass a few pairs through that
 * don't actually overlap once rotation is considered — harmless, the per-sample containment check
 * below is the real answer — but, unlike an unrotated-AABB test, can never wrongly rule out a pair
 * that a rotated footprint really does overlap. */
function overlaps(a: TileRect, b: TileRect): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rSum = boundingRadius(a) + boundingRadius(b);
  return dx * dx + dy * dy < rSum * rSum;
}

function boundingRadius(r: TileRect): number {
  return Math.sqrt((r.w / 2) ** 2 + (r.h / 2) ** 2);
}

/** True if world point (px,py) falls inside `r`'s own real (possibly rotated) footprint —
 * rotate the point into the rect's local, unrotated frame, then a plain axis-aligned bounds
 * check. Still "simple bounding-box geometry," just evaluated in the rect's own rotated frame
 * instead of assuming rotation 0. Exported so tests can measure actual rendered-area coverage
 * (Monte-Carlo sampling of the board rect against every tile's real footprint) using the exact
 * same point-containment math production hit-testing relies on, instead of a second, potentially
 * drifting approximation. */
export function containsPoint(r: TileRect, px: number, py: number): boolean {
  const dx = px - r.x;
  const dy = py - r.y;
  const rot = r.rotation ?? 0;
  if (rot === 0) {
    return Math.abs(dx) <= r.w / 2 && Math.abs(dy) <= r.h / 2;
  }
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // World -> rect-local: rotate by -rot (world = R(rot) * local, so local = R(rot)^T * world).
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2;
}

/**
 * Fraction (0-1) of `target`'s own (rotated) footprint not covered by any rect with a strictly
 * higher `zIndex`. Approximated by sampling a COVERAGE_SAMPLE_GRID x COVERAGE_SAMPLE_GRID grid of
 * points across the target's REAL rendered footprint (its own rotation, not an axis-aligned
 * stand-in) and checking, per sample, whether any higher-zIndex rect's REAL rotated footprint
 * contains it — a simple rotate-into-local-space bounding-box method that handles multiple
 * overlapping covering tiles without full polygon clipping.
 */
export function exposedFraction(rects: readonly TileRect[], targetId: string): number {
  const target = rects.find((r) => r.id === targetId);
  if (!target) return 0;

  const covering = rects.filter((r) => r.id !== targetId && r.zIndex > target.zIndex && overlaps(r, target));
  if (covering.length === 0) return 1;

  const rot = target.rotation ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  let coveredSamples = 0;
  const totalSamples = COVERAGE_SAMPLE_GRID * COVERAGE_SAMPLE_GRID;

  for (let iy = 0; iy < COVERAGE_SAMPLE_GRID; iy++) {
    const ly = -target.h / 2 + (target.h * (iy + 0.5)) / COVERAGE_SAMPLE_GRID;
    for (let ix = 0; ix < COVERAGE_SAMPLE_GRID; ix++) {
      const lx = -target.w / 2 + (target.w * (ix + 0.5)) / COVERAGE_SAMPLE_GRID;
      // Rotate the sample from the target's own local frame into world space (local -> world:
      // world = R(rot) * local), so the sample points trace the target's REAL rendered
      // footprint, not an axis-aligned stand-in for it.
      const sx = target.x + lx * cos - ly * sin;
      const sy = target.y + lx * sin + ly * cos;
      const covered = covering.some((r) => containsPoint(r, sx, sy));
      if (covered) coveredSamples += 1;
    }
  }

  return 1 - coveredSamples / totalSamples;
}

/** Production tap-acceptance predicate: is at least MIN_EXPOSED_AREA_FRACTION of `targetId`'s
 * own bounding box left uncovered by tiles painted above it? */
export function isGeometricallyExposed(rects: readonly TileRect[], targetId: string): boolean {
  return exposedFraction(rects, targetId) >= MIN_EXPOSED_AREA_FRACTION;
}
