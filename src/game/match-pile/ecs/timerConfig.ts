// what_in: a 1-based level index.
// what_out: `TIMER_TUNING` (FTUE/fallback flat budget), `TIMER_CURVE` (the tunable
//           level-index-driven Timer curve), and `timerBudgetForLevel()` — the single
//           function that decides a level's Timer budget.
// why_here: keeps the countdown budget a named, documented value instead of a magic number
//           inline in resources.ts/loadLevel.ts. Final tuning/curve is explicitly out of scope
//           for this pass (see the build brief) — these are V1 placeholder values.
//
// R-DIFFICULTY-AXES correction: Timer budget and difficulty band are now two fully
// separate axes. Previously the Timer was keyed off the difficulty *band*
// (TIMER_BUDGET_BY_TIER, derived from TIER_CONFIG's now-removed `timeBudgetMs`), which meant
// a later level landing on an Easy/Medium "relief" band (R-RELIEF-LEVEL) got a BIGGER Timer
// budget again — wrong for campaign progression, called out as a bug during manual
// playtesting. `timerBudgetForLevel()` below is a pure function of `levelIndex` alone: it
// never looks at band, so it is monotonic non-increasing by construction and a relief band
// cannot cause it to jump back up.
import { FTUE_LEVEL_COUNT } from '../services/levelSequence';

export const TIMER_TUNING = {
  /**
   * Default countdown budget for a run, in milliseconds. 300_000ms = 5:00.
   * Used as a defensive fallback only (e.g. if a level index somehow produced
   * an out-of-range curve result) — normal levels get their budget from
   * `timerBudgetForLevel()`.
   */
  defaultBudgetMs: 300_000,
};

/**
 * R-DIFFICULTY-AXES: the tunable Timer curve, keyed purely by level index — never by
 * difficulty band. Illustrative V1 numbers (final tuning is out of scope this pass); keep
 * this a simple, strictly-non-increasing linear-or-similar curve with a floor.
 */
export const TIMER_CURVE = {
  /** Flat budget for the hand-authored FTUE levels (1..FTUE_LEVEL_COUNT). */
  ftueBudgetMs: 300_000,
  /** Baseline budget for level `FTUE_LEVEL_COUNT + 1` (the first post-FTUE level). */
  startBudgetMs: 300_000,
  /** Linear decline per level index after the first post-FTUE level. */
  decreaseMsPerLevel: 5_000,
  /** Configurable minimum floor, in milliseconds (1:30). */
  floorMs: 90_000,
};

/**
 * Pure function: level index in, Timer budget (ms) out. No RNG/clock, no difficulty-band
 * lookup — this is what makes it monotonic non-increasing in `levelIndex` regardless of
 * where relief bands fall in BAND_SEQUENCE. FTUE levels (1..FTUE_LEVEL_COUNT) get the flat
 * `ftueBudgetMs`; every level after that declines linearly from `startBudgetMs`, clamped at
 * `floorMs`.
 */
export function timerBudgetForLevel(levelIndex: number): number {
  if (levelIndex <= FTUE_LEVEL_COUNT) return TIMER_CURVE.ftueBudgetMs;
  const stepsAfterFirst = levelIndex - FTUE_LEVEL_COUNT - 1; // 0 at the first post-FTUE level
  return Math.max(TIMER_CURVE.floorMs, TIMER_CURVE.startBudgetMs - stepsAfterFirst * TIMER_CURVE.decreaseMsPerLevel);
}
