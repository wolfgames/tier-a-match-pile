/**
 * path — the fixed track the ball chain marches along.
 *
 * Pure module (no Pixi): a **rectangular** spiral that makes exactly two loops
 * (see `LOOPS`) before diving to a door opening near the centre. It is built
 * from orthogonal corner points and sampled as a polyline with cumulative arc
 * length. Distance along the path is a single scalar `t` in [0, PATH_LENGTH]:
 *   • t = 0            → ENTRY  (outer top-left corner) — where balls slide in
 *   • t = PATH_LENGTH  → DOOR   (inner end, near CENTER) — the hole; reaching it loses
 *
 * The sim advances the chain by increasing `t` and reads `posAt(t)` for design-
 * space coordinates; the renderer uses the same `posAt`/`PATH_POINTS`, so the
 * groove drawn on screen is exactly the line the balls travel. Deterministic and
 * framework-free — identical every run, testable headlessly.
 */

import { BALL_SPACING, CENTER, DESIGN_H, DESIGN_W } from './config';

/** A sampled point on the track. */
export interface PathPoint {
  x: number;
  y: number;
}

// ── Rectangular-spiral parameters ────────────────────────────────────────────
const [CX, CY] = CENTER;
/** Full rectangular loops from the entry before the dive to the door. */
const LOOPS = 2;
/** Gap from the design-box edge to the outermost ring (design px). */
const MARGIN = 80;
/** Inset between successive rings (design px). Must exceed BALL_SPACING so balls
 *  on adjacent arms never touch. */
const GAP = 100;
/** How far above the centre the door opening sits (clear of the central cannon). */
const DOOR_RISE = 70;

/**
 * Walk an inward, clockwise rectangular spiral from the outer top-left corner:
 * right along the top, down the right side, left along the bottom, up the inset
 * left side — repeated `LOOPS` times — then a short dive to the centre column
 * and down to the door opening just above the centre.
 */
function buildRectSpiral(): PathPoint[] {
  let left = MARGIN;
  let right = DESIGN_W - MARGIN;
  let top = MARGIN;
  let bottom = DESIGN_H - MARGIN;

  const pts: PathPoint[] = [{ x: left, y: top }]; // ENTRY — outer top-left
  for (let loop = 0; loop < LOOPS; loop++) {
    pts.push({ x: right, y: top }); // → top
    pts.push({ x: right, y: bottom }); // ↓ right
    pts.push({ x: left, y: bottom }); // ← bottom
    top += GAP;
    pts.push({ x: left, y: top }); // ↑ inset left side
    left += GAP;
    right -= GAP;
    bottom -= GAP;
  }
  // Dive to the door: run to the centre column, then down to the opening.
  pts.push({ x: CX, y: top });
  pts.push({ x: CX, y: CY - DOOR_RISE }); // DOOR — just above the central cannon
  return pts;
}

function withCumulativeLength(points: PathPoint[]): number[] {
  const cumLen: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumLen.push(cumLen[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return cumLen;
}

const PATH_POINTS = buildRectSpiral();
const CUM_LEN = withCumulativeLength(PATH_POINTS);

/** Total arc length of the track (design px). */
export const PATH_LENGTH = CUM_LEN[CUM_LEN.length - 1];

/** Sampled polyline for drawing the groove (the renderer strokes through these). */
export { PATH_POINTS };

/**
 * Position at arc-distance `t`. `t` is clamped to the track: values < 0 (balls
 * still queued off the entry) return ENTRY; values beyond the end return DOOR.
 * Binary search over the cumulative-length table, then linear interpolation.
 */
export function posAt(t: number): PathPoint {
  if (t <= 0) return { ...PATH_POINTS[0] };
  if (t >= PATH_LENGTH) return { ...PATH_POINTS[PATH_POINTS.length - 1] };

  // Binary search for the first sample whose cumulative length >= t.
  let lo = 0;
  let hi = CUM_LEN.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (CUM_LEN[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const a = PATH_POINTS[i - 1];
  const b = PATH_POINTS[i];
  const segLen = CUM_LEN[i] - CUM_LEN[i - 1] || 1;
  const f = (t - CUM_LEN[i - 1]) / segLen;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

// Guard: the track must hold the longest chain any level throws at it. Kept as a
// runtime assertion so tuning the geometry can't silently break gameplay.
if (PATH_LENGTH < 40 * BALL_SPACING) {
  throw new Error(`path too short: ${PATH_LENGTH}px — widen the rectangular spiral`);
}

/** The two ends of the track (design px). */
export const ENTRY: PathPoint = { ...PATH_POINTS[0] };
export const DOOR: PathPoint = { ...PATH_POINTS[PATH_POINTS.length - 1] };
