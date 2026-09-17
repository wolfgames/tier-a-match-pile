// what_in: a final Score (+ Level index) for Ranking, or global completion time T (+ Level
//          index) for Mastery — two different signals for two different purposes, per
//          docs/scoring-system.md's "Score and Stars are related but no longer identical
//          signals."
// what_out: the per-Level median-normalized Ranking model (rank tier, with a floor Tier 0) —
//           still Score-based, unchanged this pass — and the time-based Mastery model (0-5
//           stars from global active-gameplay completion time, not from Score).
// why_here: the module path tests/unit/game/scoring-contract.test.ts expects
//           (~/game/match-pile/scoring/ranking) for R-SCORE-RANKING-MEDIAN/FIRST-ATTEMPT/FLOOR-TIER.
import { SCORING_CONFIG } from './config';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * `ranking.defaultMedian` holds a **median score per completed triple**, not a flat absolute
 * median — a single absolute number can't represent both a 2-triple FTUE level and a 76-triple
 * late level fairly (an early build of this calibration used one flat number and it produced
 * either permanently-0-star tutorial levels or permanently-5-star/0-star swings depending on
 * level size). `DEFAULT_MEDIAN` is exposed as-is for callers with no level context; real Ranking
 * always goes through `medianForLevel`, which scales it by the level's own triple count.
 */
export const DEFAULT_MEDIAN = SCORING_CONFIG.ranking.defaultMedian;

/**
 * R-SCORE-RANKING-MEDIAN: the median Score for `levelIndex`, for Ranking only (Mastery no
 * longer uses this — see `masteryStarsFromTime` below). Static, data-driven per-Level overrides
 * (config.ts#ranking.perLevelMedian) win when present — used today for Levels 1-2, whose fixed,
 * small, known content makes a hand-calibrated absolute median more accurate than a formula.
 * Every other Level falls back to `expectedTriples × defaultMedian`. Swapping either path for a
 * live first-attempt-only analytics lookup later (R-SCORE-FIRST-ATTEMPT) doesn't change this
 * function's signature.
 */
export function medianForLevel(levelIndex: number, expectedTriples: number, cfg = SCORING_CONFIG.ranking): number {
  const override = cfg.perLevelMedian[levelIndex];
  if (override !== undefined) return override;
  return Math.round(Math.max(1, expectedTriples) * cfg.defaultMedian);
}

/**
 * docs/scoring-system.md "Rank tiers (percentile standing)" — the highest tier whose
 * `multipleOfMedian` the score's `score / median` ratio meets or exceeds. R-SCORE-FLOOR-TIER:
 * every finished run lands on a tier, never "no rank" — Tier 0 (any score, including a
 * non-positive/zero median) is the guaranteed floor and carries no percentile.
 */
export function rankTierForScore(score: number, median: number, steps = SCORING_CONFIG.rankTiers): 0 | 1 | 2 | 3 | 4 | 5 {
  if (median <= 0) return 0;
  const ratio = score / median;
  for (const step of steps) {
    if (ratio >= step.multipleOfMedian) return step.tier;
  }
  return 0;
}

export interface TimeReferences {
  readonly parTimeMs: number;
  readonly aceTimeMs: number;
  /** The mastery formula's "barely made it" ceiling — see config.ts#mastery's doc comment on
   * why this is NOT the real gameplay Timer's fail-budget. */
  readonly timerBudgetMs: number;
}

/**
 * Resolves the Level's Par/Ace/slow-ceiling time references for both the Score-side Pace
 * multiplier (templateScoring.ts#paceMultiplier) and Mastery (masteryStarsFromTime below) — the
 * same numbers drive both, since both represent "normal vs excellent" global pace. Static,
 * data-driven per-Level overrides win when present (config.ts#pace's per-Level records); every
 * other Level falls back to `expectedTriples × parMsPerTriple/aceMsPerTriple`, and the slow
 * ceiling falls back to `parTimeMs × slowCeilingMultiplierOfPar`.
 */
export function timeReferencesForLevel(
  levelIndex: number,
  expectedTriples: number,
  paceCfg = SCORING_CONFIG.pace,
  masteryCfg = SCORING_CONFIG.mastery,
): TimeReferences {
  const triples = Math.max(1, expectedTriples);
  const parTimeMs = paceCfg.perLevelParTimeMs[levelIndex] ?? triples * paceCfg.parMsPerTriple;
  const aceTimeMs = paceCfg.perLevelAceTimeMs[levelIndex] ?? triples * paceCfg.aceMsPerTriple;
  const timerBudgetMs = masteryCfg.perLevelSlowCeilingMs[levelIndex] ?? parTimeMs * masteryCfg.slowCeilingMultiplierOfPar;
  return { parTimeMs, aceTimeMs, timerBudgetMs };
}

/**
 * docs/scoring-system.md "Mastery rating (0-5 stars)" — Mastery now answers "how quickly did the
 * player complete this Level overall," from global active-gameplay completion time `T`
 * (gameplayEndMs − gameplayStartMs), NOT from Score. This is deliberate: Score is granular and
 * millisecond-sensitive by design (leaderboard separation), but Stars must stay a stable,
 * readable signal that doesn't flip on the same small per-triple timing noise that legitimately
 * moves Score by a few points.
 *
 * Two-segment continuous interpolation across `timerBudgetMs` (slow ceiling) → `parTimeMs`
 * (normal) → `aceTimeMs` (excellent):
 *
 * - `T >= parTimeMs` (at or slower than normal): `progress = 0.5 × (timerBudgetMs − T) / (timerBudgetMs − parTimeMs)`.
 * - `T < parTimeMs` (faster than normal): `progress = 0.5 + 0.5 × (parTimeMs − T) / (parTimeMs − aceTimeMs)`.
 *
 * `progress` is clamped to `[0, 1]`, so `T` at or beyond the slow ceiling floors at
 * `minSuccessStars` and `T` at or beyond Ace pace caps at `maxStars` — this function assumes the
 * run was already a Win; the caller applies the Loss → 0★ rule (scoring/index.ts#finalizeRunScore).
 */
export function masteryStarsFromTime(T: number, timeRefs: TimeReferences, cfg = SCORING_CONFIG.mastery): number {
  const { parTimeMs, aceTimeMs, timerBudgetMs } = timeRefs;
  if (timerBudgetMs <= parTimeMs || parTimeMs <= aceTimeMs) return cfg.minSuccessStars; // degenerate config guard
  const progress = clamp01(
    T >= parTimeMs
      ? 0.5 * ((timerBudgetMs - T) / (timerBudgetMs - parTimeMs))
      : 0.5 + 0.5 * ((parTimeMs - T) / (parTimeMs - aceTimeMs)),
  );
  return Math.round(cfg.minSuccessStars + (cfg.maxStars - cfg.minSuccessStars) * progress);
}
