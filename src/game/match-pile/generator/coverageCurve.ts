// what_in: a 1-based level index (and, for tile-count conversion, a Tier + calibrated coverage
//          target).
// what_out: `COVERAGE_CURVE` (the tunable ramp), `coverageTargetForLevel()` — a pure function of
//           level index alone (0-1 fraction) — and `tileCountForCoverageTarget()`, which turns
//           that fraction into an actual tile count for a given band via a precomputed
//           empirical calibration table.
// why_here: R-DIFFICULTY-AXES precedent (ecs/timerConfig.ts#timerBudgetForLevel): today, board
//           coverage is effectively driven ONLY by difficulty band (TIER_CONFIG's tile counts) —
//           every level in the same band gets the same coverage regardless of how early/late it
//           appears. This is a NEW, independent, level-index-driven axis, parallel in spirit to
//           the Timer curve but INCREASING instead of decreasing, and (unlike the Timer curve,
//           which deliberately ignores band) intentionally relief-aware — a recurring Easy band
//           right after Hard/VeryHard may temporarily dip below the ramp's current ceiling
//           (R-RELIEF-LEVEL's spirit applied to density), while the overall multi-level trend
//           still climbs. See generate.ts for how the returned fraction becomes an actual tile
//           count per band.
//
// TILE-COUNT-FLOOR pass (tier-a-build-v4, Orders-count-curve pass): this file's ramp used to be
// the ONLY density signal — for early levels (low ramp progress -> low target coverage -> few
// calibrated tiles), that meant a thin, sparse-looking board regardless of how far into the
// campaign the level was. `tileCountFloorForLevel` below is a second, independent,
// level-index-driven minimum (not a target) — generate.ts now takes `max(calibrated, floor)`, so
// neither signal alone decides the final count; both must hold simultaneously.
import { bandForLevel, FTUE_LEVEL_COUNT } from "../services/levelSequence";
import type { Tier } from "../rules/types";

/**
 * Tunable knobs for the coverage ramp. `rampStartLevelIndex` is the ramp function's conceptual
 * domain start (levelIndex=2) — chosen to line up with the brief's "Level 2: ~65% coverage"
 * target even though Level 2 itself is hand-authored FTUE content and out of scope to edit
 * directly (`data/ftueLevels.json`). In practice the ramp's first *enforceable* point is Level 4
 * (the first post-FTUE, generator-backed level) since `services/levels.ts#getLevel()` only calls
 * the generator for `levelIndex > FTUE_LEVEL_COUNT`. Judgment call, documented here rather than
 * offsetting the domain to start effectively at 4 — this keeps the ramp's shape independent of
 * `FTUE_LEVEL_COUNT` (if FTUE ever grows/shrinks, the ramp doesn't need retuning).
 */
export const COVERAGE_CURVE = {
  /** Ramp domain starts here (see doc comment above) — Level 2's own conceptual target. */
  rampStartLevelIndex: 2,
  /** Coverage fraction (0-1) at `rampStartLevelIndex` — matches the brief's "~65% at Level 2". */
  startCoverage: 0.65,
  /**
   * Coverage fraction (0-1) the ramp converges toward. 0.90 sits in the middle of the brief's
   * "85-95% by later levels" band. Actual realized coverage at the ceiling is further clamped
   * per-band by `tileCountForCoverageTarget`'s safety cap (never exceed the band's own
   * `TIER_CONFIG.maxTiles` — see generate.ts) — for bands whose tile geometry can't reach 0.90
   * within that cap (e.g. easy's large, `MAX_TILE_SIZE`-clamped tiles), the realized ceiling
   * lands a bit lower but still within 85-95% (measured; see build report).
   */
  ceilingCoverage: 0.9,
  /** Levels of ramp-up from start to ceiling. Converges at levelIndex = rampStartLevelIndex +
   * rampLengthLevels (= 22) — "roughly level 15-25" per the brief. */
  rampLengthLevels: 20,
  /**
   * Multiplier applied to the ramp's current (un-discounted) value for a "relief" level — an
   * Easy band immediately following a Hard/VeryHard band in `BAND_SEQUENCE` (see
   * `isReliefLevel` below). Relief levels read as temporarily less dense than the ramp's current
   * ceiling, without resetting the ramp's own progress — the *next* non-relief level continues
   * climbing from where the un-discounted ramp already was.
   */
  reliefDiscount: 0.85,
};

/**
 * True if `levelIndex` is an Easy-band level immediately following a Hard/VeryHard band in
 * `BAND_SEQUENCE` — the same "relief" concept `R-RELIEF-LEVEL` already enforces for band choice
 * itself, reused here to decide when density should also temporarily dip. Guards away from the
 * FTUE range entirely (bandForLevel's own contract: callers must not call it for FTUE indices),
 * so this never fabricates a verdict from a meaningless band lookup.
 */
function isReliefLevel(levelIndex: number): boolean {
  if (levelIndex <= FTUE_LEVEL_COUNT + 1) return false;
  const band = bandForLevel(levelIndex);
  if (band !== "easy") return false;
  const prevBand = bandForLevel(levelIndex - 1);
  return prevBand === "hard" || prevBand === "veryHard";
}

/**
 * Pure-in-spirit function of `levelIndex` alone (band only informs the relief *discount*, never
 * the ramp's own progress) — level index in, target board-area-coverage fraction (0-1) out.
 * Monotonically non-decreasing in the ramp's own progress; relief levels apply a temporary
 * discount on top without resetting that progress. No RNG/clock.
 */
export function coverageTargetForLevel(levelIndex: number): number {
  const stepsIn = Math.max(0, levelIndex - COVERAGE_CURVE.rampStartLevelIndex);
  const progress = Math.min(1, stepsIn / COVERAGE_CURVE.rampLengthLevels);
  const ramped = COVERAGE_CURVE.startCoverage + progress * (COVERAGE_CURVE.ceilingCoverage - COVERAGE_CURVE.startCoverage);
  return isReliefLevel(levelIndex) ? ramped * COVERAGE_CURVE.reliefDiscount : ramped;
}

/**
 * Empirical tile-count -> rendered-area-coverage calibration, one table per band. Generated by
 * simulating the generator's own placement rule (uniform random (col,row) per tile, layer =
 * running stack height at that cell) through `board/tiles.ts#tileSizeFor`/`tileLayoutFor`'s real
 * geometry and `board/exposure.ts#containsPoint`'s Monte-Carlo area sampling — the EXACT same
 * methodology `tests/unit/game/coverage.test.ts` uses, at its same representative board panel
 * size (400x334), averaged over 20 seeds per tile count. Re-derive this table (small standalone
 * script, not checked in) if `board/tiles.ts`'s sizing/jitter constants or `TIER_CONFIG`'s
 * cols/rows ever change — this file does not recompute it at runtime (kept a plain lookup table
 * so `generate()` stays cheap and doesn't need to import Pixi-adjacent geometry at call time).
 *
 * Notable, load-bearing finding from calibration: coverage does NOT approach 100% as tile count
 * grows — it saturates well below it (asymptotes roughly easy 0.86 / medium 0.88 / hard 0.90 /
 * veryHard 0.91). Root cause: `tileLayoutFor`'s board-bounds clamp margin is a tile's full
 * half-diagonal (so no rotation ever pokes outside the panel — a deliberate, correct choice, not
 * touched here), which keeps tile CENTERS away from the board edges by more than a tile's own
 * half-width — a persistent, un-coverable sliver near every edge regardless of tile count. Bigger
 * tiles (easy's large cells, clamped to `MAX_TILE_SIZE`) mean a proportionally bigger sliver, so
 * easy's realistic ceiling sits at the very bottom of the brief's 85-95% band rather than its
 * middle. This is a real geometric property of `board/tiles.ts`'s existing (untouched, confirmed
 * working) clamp — not a bug in this table.
 */
const COVERAGE_CALIBRATION: Record<Tier, readonly (readonly [tiles: number, coverage: number])[]> = {
  easy: [
    [10, 0.3011], [15, 0.4028], [20, 0.4954], [25, 0.5711], [30, 0.6159], [35, 0.663],
    [40, 0.7045], [45, 0.736], [50, 0.7583], [60, 0.7855], [70, 0.8099], [80, 0.8236],
    [90, 0.8349], [100, 0.8416], [110, 0.8479], [120, 0.8514], [130, 0.8536], [140, 0.8554],
    [150, 0.8572], [160, 0.8581], [175, 0.8593], [190, 0.8598], [210, 0.8604], [230, 0.8616],
    [250, 0.8621], [270, 0.8625], [300, 0.8628], [330, 0.8631], [360, 0.8635], [400, 0.864],
  ],
  medium: [
    [10, 0.2747], [15, 0.3729], [20, 0.4587], [25, 0.5236], [30, 0.5734], [35, 0.6233],
    [40, 0.6703], [45, 0.7055], [50, 0.7299], [60, 0.7724], [70, 0.8022], [80, 0.8223],
    [90, 0.8343], [100, 0.8438], [110, 0.8499], [120, 0.8555], [130, 0.8594], [140, 0.8618],
    [150, 0.8646], [160, 0.8662], [175, 0.8687], [190, 0.8702], [210, 0.8716], [230, 0.8727],
    [250, 0.8733], [270, 0.8738], [300, 0.8746], [330, 0.8752], [360, 0.8758], [400, 0.8768],
  ],
  hard: [
    [10, 0.2012], [15, 0.2812], [20, 0.3571], [25, 0.4236], [30, 0.4723], [35, 0.5183],
    [40, 0.5625], [45, 0.6056], [50, 0.6335], [60, 0.6877], [70, 0.7316], [80, 0.7654],
    [90, 0.794], [100, 0.8104], [110, 0.8239], [120, 0.8368], [130, 0.8466], [140, 0.855],
    [150, 0.8612], [160, 0.8665], [175, 0.8722], [190, 0.8753], [210, 0.8797], [230, 0.8836],
    [250, 0.8872], [270, 0.8888], [300, 0.8909], [330, 0.8926], [360, 0.8943], [400, 0.8964],
  ],
  veryHard: [
    [10, 0.1543], [15, 0.2173], [20, 0.279], [25, 0.3306], [30, 0.3797], [35, 0.4267],
    [40, 0.4705], [45, 0.5103], [50, 0.5422], [60, 0.5991], [70, 0.6505], [80, 0.6952],
    [90, 0.7323], [100, 0.7572], [110, 0.7819], [120, 0.801], [130, 0.8183], [140, 0.8323],
    [150, 0.8433], [160, 0.8549], [175, 0.8653], [190, 0.8748], [210, 0.8832], [230, 0.8913],
    [250, 0.8962], [270, 0.8996], [300, 0.9039], [330, 0.9073], [360, 0.9094], [400, 0.9121],
  ],
};

/**
 * Inverts `COVERAGE_CALIBRATION[tier]` — target coverage fraction in, calibrated tile count out
 * — via linear interpolation between the two bracketing table entries. Clamps to the table's own
 * range at both ends (a target below the smallest measured coverage or above the largest
 * achievable one just returns that endpoint's tile count) rather than extrapolating, since the
 * table's ends are themselves the practical floor/ceiling for that band's tile geometry. Callers
 * (generate.ts) apply their own additional band-specific safety cap on top of this.
 */
export function tileCountForCoverageTarget(tier: Tier, targetCoverage: number): number {
  const table = COVERAGE_CALIBRATION[tier];
  if (targetCoverage <= table[0][1]) return table[0][0];
  const last = table[table.length - 1];
  if (targetCoverage >= last[1]) return last[0];

  for (let i = 1; i < table.length; i++) {
    const [prevTiles, prevCoverage] = table[i - 1];
    const [tiles, coverage] = table[i];
    if (targetCoverage <= coverage) {
      const span = coverage - prevCoverage;
      const t = span > 0 ? (targetCoverage - prevCoverage) / span : 0;
      return Math.round(prevTiles + t * (tiles - prevTiles));
    }
  }
  return last[0];
}

interface TileCountFloorRange {
  /** Inclusive lower bound (1-based level index). */
  readonly minLevel: number;
  /** Inclusive upper bound; `Number.POSITIVE_INFINITY` for the open-ended tail range. */
  readonly maxLevel: number;
  /** Fewest tiles any level in this range may have, regardless of the coverage ramp's own
   * calibrated count. Band-independent — the same floor applies to every band at a given level. */
  readonly floor: number;
}

/**
 * The exact level-based tile-count floor from the build brief — a MINIMUM, not a target. The
 * final tile count (generate.ts#tileCountForOpts) is `max(calibrated, floor)`, so this only ever
 * raises the count above what the coverage ramp alone would produce; it never lowers it. Level 1
 * is FTUE-controlled (out of scope, see `data/ftueLevels.json`) and never reaches this table —
 * levels 2+ always match exactly one row (the tail row's `Infinity` upper bound guarantees a
 * match for every level, however large).
 */
export const TILE_COUNT_FLOOR_RANGES: readonly TileCountFloorRange[] = [
  { minLevel: 2, maxLevel: 4, floor: 55 },
  { minLevel: 5, maxLevel: 9, floor: 65 },
  { minLevel: 10, maxLevel: 14, floor: 80 },
  { minLevel: 15, maxLevel: 19, floor: 100 },
  { minLevel: 20, maxLevel: 24, floor: 130 },
  { minLevel: 25, maxLevel: Number.POSITIVE_INFINITY, floor: 160 },
];

/**
 * Pure function: level index in, minimum tile count out. No RNG/clock, no band lookup — a
 * relief (Easy) level several bands into the campaign still must hit its own level's floor here,
 * not some band-relative "feels easier" floor (R-RELIEF-LEVEL's spirit applied to density, same
 * as `coverageTargetForLevel`'s relief discount above, but this floor is never discounted itself
 * — relief only ever affects the coverage-ramp side of the `max(...)` in generate.ts).
 */
export function tileCountFloorForLevel(levelIndex: number): number {
  const row = TILE_COUNT_FLOOR_RANGES.find((r) => levelIndex >= r.minLevel && levelIndex <= r.maxLevel);
  return (row ?? TILE_COUNT_FLOOR_RANGES[TILE_COUNT_FLOOR_RANGES.length - 1]).floor;
}
