/**
 * Match Pile — full-board density/coverage spec (tier-a-build-v4).
 *
 * Part B of the geometric-exposure + density pass: every non-FTUE-Level-1 level's tiles must
 * visually cover ~85-100% of its own board (generator/objectTypes.ts#TIER_CONFIG's tile counts
 * were raised and board/tiles.ts's tile-size-to-cell ratio + jitter amplitude were widened
 * alongside them — see both files' own doc comments for the before/after numbers and the
 * solver-driven constraint on how far tile counts could go).
 *
 * METRIC CHANGE (this pass): the previous version of this spec measured "cell occupancy" — the
 * fraction of `cols*rows` grid cells containing at least one tile. That metric is exactly what
 * let the original sparse/chunked-look complaint slip through: a board can hit ~86-98% cell
 * occupancy while still reading as "gridded" if each occupied cell holds one small, lightly
 * jittered tile with visible gaps to its neighbors — cell occupancy has no idea how much of the
 * board's actual pixel area is covered. This spec now measures actual rendered-area coverage via
 * Monte-Carlo sampling of the board rectangle against every tile's real (rotated) on-screen
 * footprint — the same rotated-rect point-containment math (board/exposure.ts#containsPoint) that
 * production tap-acceptance relies on, not a second, potentially-drifting approximation — so a
 * board that merely has "a tile somewhere in most cells" without much overlap no longer passes.
 */
import { describe, it, expect } from "vitest";
import { generate } from "~/game/match-pile/generator";
import { TIER_CONFIG } from "~/game/match-pile/generator/objectTypes";
import { getLevel } from "~/game/match-pile/services/levels";
import { FTUE_LEVELS } from "~/game/match-pile/data/ftueLevels";
import { tileLayoutFor, tileSizeFor } from "~/game/match-pile/board/tiles";
import { containsPoint, type TileRect } from "~/game/match-pile/board/exposure";
import { COVERAGE_CURVE, coverageTargetForLevel, tileCountForCoverageTarget, tileCountFloorForLevel } from "~/game/match-pile/generator/coverageCurve";
import { bandForLevel, FTUE_LEVEL_COUNT } from "~/game/match-pile/services/levelSequence";
import type { Tier, Tile } from "~/game/match-pile/rules/types";

const MIN_COVERAGE = 0.85;
const MAX_COVERAGE = 1.0;

/** A representative fixed board panel size (layout.ts#Slots.boardWidth/boardHeight for a common
 * portrait viewport, ~400x800 — vw capped by layout.ts#COLUMN_MAX, boardHeight per its own
 * remaining-space formula). Not read from layout.ts directly (that needs a live Pixi stage) — a
 * fixed representative size is enough to verify the tuning holds at a realistic scale, same
 * approach the previous cell-occupancy version took with `config.cols/rows` alone. */
const BOARD_W = 400;
const BOARD_H = 334;

/** NxN sample grid for the board-area Monte-Carlo estimate. Coarser than board/exposure.ts's own
 * per-tile sample grid (this estimates one board-wide union area, not one tile's exposure), but
 * fine enough to be stable to a few thousandths across reruns. */
const AREA_SAMPLES = 60;

/** Fraction (0-1) of the `boardW x boardH` rectangle covered by the union of every tile's real
 * (rotated) on-screen footprint, via the same point-containment geometry board/exposure.ts uses
 * for production tap-acceptance. */
function renderedAreaCoverage(tiles: readonly Tile[], cols: number, rows: number, boardW: number, boardH: number): number {
  const cellW = boardW / cols;
  const cellH = boardH / rows;
  const size = tileSizeFor(cellW, cellH);
  const rects: TileRect[] = tiles.map((tile) => {
    const layout = tileLayoutFor(tile, cellW, cellH, boardW, boardH);
    return { id: tile.id, x: layout.x, y: layout.y, w: size, h: size, rotation: layout.rot, zIndex: 0 };
  });

  let covered = 0;
  for (let iy = 0; iy < AREA_SAMPLES; iy++) {
    const py = (boardH * (iy + 0.5)) / AREA_SAMPLES;
    for (let ix = 0; ix < AREA_SAMPLES; ix++) {
      const px = (boardW * (ix + 0.5)) / AREA_SAMPLES;
      if (rects.some((r) => containsPoint(r, px, py))) covered += 1;
    }
  }
  return covered / (AREA_SAMPLES * AREA_SAMPLES);
}

describe("Full-board coverage — a flat/tier-only generate() call still lands at ~85-100% rendered-area coverage", () => {
  // COVERAGE-RAMP correction (tier-a-build-v4, Orders/coverage-ramp pass): the previous version
  // of this describe block asserted every `getLevel()` representative level (4/6/8/14) hits
  // 85-100% coverage. That claim is no longer true BY DESIGN once coverage ramps with level
  // index (generator/coverageCurve.ts) — those specific levels are early in the ramp and land
  // well under 85-100% on purpose (measured ~70/67/71/78% respectively; see build report). The
  // 85-100% claim now only holds for `generate()` calls that DON'T pass a `levelIndex` (the flat
  // per-tier fallback path, unchanged from before this pass) — see the "broader sample" tests
  // below, which already exercise exactly that path. The ramp-aware expectations for
  // `getLevel()`'s real per-level output now live in the "Coverage ramps with level index"
  // describe block further down.

  // Broader sample (direct generate() calls, not just one levelIndex per band): the *average*
  // coverage across a representative seed sample must land in range — individual seeds can dip a
  // little below 85% (small-sample RNG variance) without the band itself failing to deliver a
  // "visually full" board on average.
  const seeds = Array.from({ length: 24 }, (_, i) => i * 11 + 5);

  it.each(Object.keys(TIER_CONFIG) as Tier[])("%s band average rendered-area coverage over %d seeds", (tier) => {
    const config = TIER_CONFIG[tier];
    let sum = 0;
    let n = 0;
    for (const seed of seeds) {
      const generated = generate({ seed, tier });
      if (!generated) continue;
      sum += renderedAreaCoverage(generated.puzzle.tiles, config.cols, config.rows, BOARD_W, BOARD_H);
      n += 1;
    }
    expect(n).toBeGreaterThan(0);
    const avg = sum / n;
    expect(avg).toBeGreaterThanOrEqual(MIN_COVERAGE);
    expect(avg).toBeLessThanOrEqual(MAX_COVERAGE);
  });

  it("bands read as monotonically fuller: average coverage strictly increases easy < medium < hard < veryHard", () => {
    const order: Tier[] = ["easy", "medium", "hard", "veryHard"];
    const averages = order.map((tier) => {
      const config = TIER_CONFIG[tier];
      let sum = 0;
      let n = 0;
      for (const seed of seeds) {
        const generated = generate({ seed, tier });
        if (!generated) continue;
        sum += renderedAreaCoverage(generated.puzzle.tiles, config.cols, config.rows, BOARD_W, BOARD_H);
        n += 1;
      }
      return sum / n;
    });
    for (let i = 1; i < averages.length; i++) {
      expect(averages[i], `${order[i]} (${averages[i].toFixed(3)}) should read fuller than ${order[i - 1]} (${averages[i - 1].toFixed(3)})`).toBeGreaterThan(averages[i - 1]);
    }
  });
});

describe("Board-bounds safety — no tile ever renders outside the fixed board panel", () => {
  const representativeLevels: Record<Tier, number> = { easy: 4, medium: 6, hard: 8, veryHard: 14 };

  it.each(Object.entries(representativeLevels))(
    "%s band representative level: every tile's center ± rotated half-diagonal stays inside [0,boardW] x [0,boardH]",
    (tier, levelIndex) => {
      const level = getLevel(levelIndex);
      const config = TIER_CONFIG[level.tier];
      const cellW = BOARD_W / config.cols;
      const cellH = BOARD_H / config.rows;
      const size = tileSizeFor(cellW, cellH);
      // Worst-case bounding radius for ANY rotation (not just the tile's own actual rotation) —
      // the same conservative margin tileLayoutFor's own clamp uses.
      const halfDiagonal = size * Math.SQRT1_2;

      for (const tile of level.puzzle.tiles) {
        const layout = tileLayoutFor(tile, cellW, cellH, BOARD_W, BOARD_H);
        expect(layout.x - halfDiagonal, `tile ${tile.id} left edge`).toBeGreaterThanOrEqual(-1e-6);
        expect(layout.x + halfDiagonal, `tile ${tile.id} right edge`).toBeLessThanOrEqual(BOARD_W + 1e-6);
        expect(layout.y - halfDiagonal, `tile ${tile.id} top edge`).toBeGreaterThanOrEqual(-1e-6);
        expect(layout.y + halfDiagonal, `tile ${tile.id} bottom edge`).toBeLessThanOrEqual(BOARD_H + 1e-6);
      }
    },
  );
});

describe("Tile counts still climb monotonically with band on average (density-by-band distinctiveness)", () => {
  // TIER_CONFIG's per-band tile-count *ranges* now overlap slightly at the edges (a deliberate
  // trade-off — see objectTypes.ts's own comment on the solvability constraint that shaped these
  // exact numbers), so this checks the AVERAGE realized tile count across seeds increases
  // band-to-band, not a strict range non-overlap. tests/unit/game/progression.test.ts already
  // covers the stronger "these two specific shipped levels differ" regression guard.
  it("average generated tile count strictly increases easy < medium < hard < veryHard", () => {
    const order: Tier[] = ["easy", "medium", "hard", "veryHard"];
    const seeds = Array.from({ length: 24 }, (_, i) => i * 11 + 5);
    const averages = order.map((tier) => {
      let sum = 0;
      let n = 0;
      for (const seed of seeds) {
        const generated = generate({ seed, tier });
        if (!generated) continue;
        sum += generated.puzzle.tiles.length;
        n += 1;
      }
      return sum / n;
    });
    for (let i = 1; i < averages.length; i++) {
      expect(averages[i], `${order[i]} (${averages[i]}) should average more tiles than ${order[i - 1]} (${averages[i - 1]})`).toBeGreaterThan(averages[i - 1]);
    }
  });
});

describe("Coverage ramps with level index (generator/coverageCurve.ts)", () => {
  // Levels 4/6/8/14 (the SAME representative levels the old flat-85-100% assertion used) are
  // early in the ramp — their real getLevel() coverage should track coverageTargetForLevel(...)
  // within a modest tolerance (the calibration table is an empirical approximation, not an exact
  // inverse of the real generator's placement, which additionally constrains cell/type
  // selection). NOTE on validation scope: Level 2 itself is hand-authored FTUE content
  // (data/ftueLevels.json) and out of scope to edit — so this checks the *ramp function's*
  // value at low level indices (coverageTargetForLevel(2) below) directly, and checks *actual
  // rendered* coverage starting at Level 4, the first level the ramp actually governs (per
  // services/levels.ts#getLevel, which only calls the generator for levelIndex > FTUE_LEVEL_COUNT).
  const COVERAGE_TOLERANCE = 0.08;
  const earlyRampLevels: Record<Tier, number> = { easy: 4, medium: 6, hard: 8, veryHard: 14 };

  it("coverageTargetForLevel(rampStartLevelIndex) [Level 2] equals the configured startCoverage (~0.65) — the ramp FUNCTION's value, not a claim about FTUE Level 2's actual (untouched, out-of-scope) content", () => {
    expect(coverageTargetForLevel(COVERAGE_CURVE.rampStartLevelIndex)).toBeCloseTo(COVERAGE_CURVE.startCoverage, 5);
  });

  it.each(Object.entries(earlyRampLevels))(
    "%s band, early-ramp representative level: actual rendered coverage tracks coverageTargetForLevel within tolerance UNLESS the tile-count floor is the binding constraint",
    (tier, levelIndex) => {
      // TILE-COUNT-FLOOR pass (tier-a-build-v4, Orders-count-curve pass): tile count is now
      // max(coverage-ramp-calibrated, tileCountFloorForLevel(levelIndex)) (see generate.ts). For
      // early levels, the level-based floor (55/65/80/... tiles) frequently EXCEEDS the ramp's
      // own calibrated count (the ramp targets only ~65-70% coverage this early) — when that
      // happens, the floor is the binding constraint, actual tiles (and so actual coverage) are
      // HIGHER than the raw ramp target by design, and this is not a regression: the floor is a
      // MINIMUM, never a substitute for the ramp's own target. Only assert the tight
      // ramp-tracking tolerance when the floor isn't binding for this level.
      const level = getLevel(levelIndex);
      expect(level.tier).toBe(tier);
      const config = TIER_CONFIG[level.tier];
      const coverage = renderedAreaCoverage(level.puzzle.tiles, config.cols, config.rows, BOARD_W, BOARD_H);
      const target = coverageTargetForLevel(levelIndex);
      const calibratedTiles = tileCountForCoverageTarget(level.tier, target);
      const floorTiles = tileCountFloorForLevel(levelIndex);
      if (floorTiles > calibratedTiles) {
        // Floor-dominated: actual coverage must be >= the ramp's raw target (more tiles can only
        // raise coverage, never lower it), never a claim of tight tracking.
        expect(coverage, `level ${levelIndex} (${tier}): floor-dominated (floor ${floorTiles} > calibrated ${calibratedTiles} tiles) — coverage ${coverage.toFixed(3)} should be >= raw ramp target ${target.toFixed(3)}`).toBeGreaterThanOrEqual(
          target - 0.02, // small epsilon for calibration-table/Monte-Carlo noise
        );
      } else {
        expect(Math.abs(coverage - target), `level ${levelIndex} (${tier}): actual ${coverage.toFixed(3)} vs target ${target.toFixed(3)}`).toBeLessThanOrEqual(
          COVERAGE_TOLERANCE,
        );
      }
    },
  );

  // Non-relief levels well past the ramp's convergence point (rampStartLevelIndex +
  // rampLengthLevels = 22) should land in the brief's 85-95% ceiling band. One per band, chosen
  // to NOT be a relief level (see isReliefLevel in coverageCurve.ts) so this measures the true
  // ceiling, not a deliberately-discounted dip.
  const convergedNonReliefLevels: Record<Tier, number> = { easy: 28, medium: 30, hard: 32, veryHard: 38 };

  it.each(Object.entries(convergedNonReliefLevels))(
    "%s band, converged non-relief level: actual rendered coverage lands in the 85-95%% ceiling band",
    (tier, levelIndex) => {
      const band = bandForLevel(levelIndex);
      expect(band, `level ${levelIndex} must be a non-relief ${tier} level for this check`).toBe(tier);
      const level = getLevel(levelIndex);
      const config = TIER_CONFIG[level.tier];
      const coverage = renderedAreaCoverage(level.puzzle.tiles, config.cols, config.rows, BOARD_W, BOARD_H);
      expect(coverage, `level ${levelIndex} (${tier}) coverage ${coverage.toFixed(3)}`).toBeGreaterThanOrEqual(0.85);
      expect(coverage, `level ${levelIndex} (${tier}) coverage ${coverage.toFixed(3)}`).toBeLessThanOrEqual(0.95);
    },
  );

  it("a relief level (Easy immediately after Hard/VeryHard) reads measurably less dense than a converged non-relief level of the same band", () => {
    // Level 33: offset 29 mod 12 = 5 -> BAND_SEQUENCE[5] = 'easy', immediately after Level 32's
    // 'hard' (offset 28 mod 12 = 4) — a genuine relief level per R-RELIEF-LEVEL, well past the
    // ramp's convergence point so the dip is attributable to the relief discount, not early-ramp
    // position.
    const reliefLevelIndex = 33;
    expect(bandForLevel(reliefLevelIndex)).toBe("easy");
    expect(bandForLevel(reliefLevelIndex - 1), "must immediately follow a Hard/VeryHard band").toBe("hard");

    const reliefCoverage = coverageTargetForLevel(reliefLevelIndex);
    const nonReliefCeiling = coverageTargetForLevel(convergedNonReliefLevels.easy);
    expect(reliefCoverage, "relief level's target must sit below the converged non-relief ceiling").toBeLessThan(nonReliefCeiling);
  });

  it("the ramp's own progress (ignoring the relief discount) is non-decreasing in level index — the multi-level trend still climbs even though individual relief levels dip", () => {
    // Compare consecutive NON-relief levels only (a relief level is an intentional, disclosed
    // dip, not a regression) across a span covering multiple bands/relief transitions.
    let lastNonReliefTarget = -1;
    for (let levelIndex = FTUE_LEVEL_COUNT + 1; levelIndex <= 40; levelIndex++) {
      const isRelief = bandForLevel(levelIndex) === "easy" && bandForLevel(levelIndex - 1) !== undefined && (levelIndex - 1 > FTUE_LEVEL_COUNT) && (bandForLevel(levelIndex - 1) === "hard" || bandForLevel(levelIndex - 1) === "veryHard");
      if (isRelief) continue;
      const target = coverageTargetForLevel(levelIndex);
      expect(target, `level ${levelIndex} target ${target.toFixed(3)} should be >= previous non-relief target ${lastNonReliefTarget.toFixed(3)}`).toBeGreaterThanOrEqual(
        lastNonReliefTarget,
      );
      lastNonReliefTarget = target;
    }
  });
});

describe("Tile-count floor (generator/coverageCurve.ts#tileCountFloorForLevel) — a second, independent minimum, not a substitute for the coverage ramp", () => {
  it("boundary spot-checks: tileCountFloorForLevel holds exactly at every table edge (4→5, 9→10, 14→15, 19→20, 24→25)", () => {
    expect(tileCountFloorForLevel(4)).toBe(55);
    expect(tileCountFloorForLevel(5)).toBe(65);
    expect(tileCountFloorForLevel(9)).toBe(65);
    expect(tileCountFloorForLevel(10)).toBe(80);
    expect(tileCountFloorForLevel(14)).toBe(80);
    expect(tileCountFloorForLevel(15)).toBe(100);
    expect(tileCountFloorForLevel(19)).toBe(100);
    expect(tileCountFloorForLevel(20)).toBe(130);
    expect(tileCountFloorForLevel(24)).toBe(130);
    expect(tileCountFloorForLevel(25)).toBe(160);
    expect(tileCountFloorForLevel(200)).toBe(160); // open-ended tail range
  });

  it("levels 4 through 60 never fall below their level-based tile-count floor — LITERALLY (generate.ts rounds the floor UP to a MATCH_SIZE multiple before combining, so the brief's exact stated minimum always holds, never off by 1-2 tiles from a naive round-down)", () => {
    for (let levelIndex = 4; levelIndex <= 60; levelIndex++) {
      const { puzzle } = getLevel(levelIndex);
      const floor = tileCountFloorForLevel(levelIndex);
      expect(puzzle.tiles.length, `level ${levelIndex} has ${puzzle.tiles.length} tiles, below its floor ${floor}`).toBeGreaterThanOrEqual(floor);
    }
  });

  it("a relief level's tile count still respects its OWN level's floor even when lower than the preceding non-relief level", () => {
    // Level 33: easy-relief immediately after level 32 (hard) — see progression.test.ts /
    // coverage.test.ts's own existing relief-level tests for the same pair. Level 33 sits in the
    // levels-25+ floor range (160 tiles minimum).
    expect(bandForLevel(33)).toBe("easy");
    expect(bandForLevel(32)).toBe("hard");
    const relief = getLevel(33);
    const predecessor = getLevel(32);
    expect(relief.puzzle.tiles.length).toBeGreaterThanOrEqual(tileCountFloorForLevel(33));
    // "Easier"/thinner relative to its immediate hard predecessor is fine and expected; only the
    // absolute per-level floor is a hard requirement.
    expect(relief.puzzle.tiles.length).toBeLessThanOrEqual(predecessor.puzzle.tiles.length);
  });

  it("the floor is combined via max() with the coverage-ramp-calibrated count, never as a replacement for it — a band whose calibrated count already exceeds the floor is unaffected", () => {
    // Deep into the ramp (past convergence), the calibrated count for every band comfortably
    // exceeds even the largest floor (160) — confirms the floor only ever raises the count when
    // it's the larger of the two, per generate.ts's `Math.max(calibrated, floor)`.
    const levelIndex = 38; // veryHard, converged, non-relief (see existing convergedNonReliefLevels)
    const target = coverageTargetForLevel(levelIndex);
    const calibrated = tileCountForCoverageTarget("veryHard", target);
    const floor = tileCountFloorForLevel(levelIndex);
    expect(calibrated).toBeGreaterThan(floor);
    const { puzzle } = getLevel(levelIndex);
    // Realized count tracks the (larger) calibrated value, capped by TIER_CONFIG.veryHard.maxTiles
    // and rounded down to a MATCH_SIZE multiple — not the (smaller, non-binding) floor.
    expect(puzzle.tiles.length).toBeGreaterThan(Math.floor(floor / 3) * 3);
  });
});

describe("FTUE Level 1 stays exempt from the density/coverage bump", () => {
  it("FTUE Level 1's hand-authored puzzle is untouched by the TIER_CONFIG changes", () => {
    const level1 = FTUE_LEVELS[0];
    expect(level1).toBeDefined();
    expect(level1.provenance).toBeDefined();
    // FTUE content is hand-authored/pre-generated (data/ftueLevels.json) and never flows through
    // TIER_CONFIG at runtime (services/levels.ts#getLevel only consults TIER_CONFIG for the
    // generated tail) — asserting its tile count here is a regression guard that this pass never
    // touched that path, not a coverage claim (Level 1 is explicitly exempt from the 85-100%
    // requirement).
    const viaGetLevel = getLevel(1);
    expect(viaGetLevel.puzzle.tiles).toEqual(level1.puzzle.tiles);
  });
});
