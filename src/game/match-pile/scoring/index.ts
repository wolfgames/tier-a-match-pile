// what_in: the per-run scoring resources the ECS accumulates as taps resolve (ecs/resources.ts).
// what_out: `finalizeRunScore` — the single run-end composition of docs/scoring-system.md's
//           "Scoring flow": a granular, millisecond-sensitive Score (accuracy × pace applied to
//           the per-triple subtotal) alongside a separately-computed, time-based Mastery rating
//           that stays stable across the same small per-triple timing noise that legitimately
//           moves Score.
// why_here: replaces the old flat `scoring.ts` (budget-minus-costs, 0-3 stars — superseded, see
//           docs/scoring-system.md's Mastery section) with the `scoring/` module layout
//           tests/unit/game/scoring-contract.test.ts expects. ecs/transactions/commitPick.ts and
//           finishInstant.ts are the only two write-sites that call `finalizeRunScore`.
import { accuracyMultiplier, paceMultiplier } from './templateScoring';
import { DEFAULT_MEDIAN, masteryStarsFromTime, medianForLevel, rankTierForScore, timeReferencesForLevel } from './ranking';

export { SCORING_CONFIG } from './config';
export { timeEfficiencyPoints, streakStepMultiplier, scoreForSuccessfulTriple, accuracyMultiplier, paceMultiplier } from './templateScoring';
export { DEFAULT_MEDIAN, medianForLevel, rankTierForScore, masteryStarsFromTime, timeReferencesForLevel } from './ranking';

export interface RunScoreInputs {
  readonly won: boolean;
  readonly levelIndex: number;
  /** Running sum of per-triple `time_points(t) × streakStep(streak)` (ecs/resources.ts#scoreSubtotal). */
  readonly scoreSubtotal: number;
  readonly correctAttempts: number;
  readonly wrongAttempts: number;
  /** The Level's own triple count (its pristine puzzle's tile count / MATCH_SIZE) — scales
   * `medianForLevel`/`timeReferencesForLevel`'s fallback rates for Levels without an explicit
   * override. See ranking.ts. */
  readonly expectedTriples: number;
  /** T = gameplayEndMs − gameplayStartMs, ms — the real timing source for both the Pace
   * component of Score and the whole of Mastery (docs/scoring-system.md §5, config.ts#pace).
   * `gameplayStartMs` is the moment normal gameplay activates (FTUE instruction/pause time
   * excluded — ecs/resources.ts#gameplayStartedAtMs); `gameplayEndMs` is `now` at the winning
   * tap. The caller (ecs/transactions/commitPick.ts) computes this the same way every run. */
  readonly totalMs?: number;
}

export interface RunScoreResult {
  readonly score: number;
  readonly stars: number;
  readonly accuracyMultiplier: number;
  readonly median: number;
  readonly rankTier: 0 | 1 | 2 | 3 | 4 | 5;
}

/**
 * docs/scoring-system.md "Scoring flow": apply the Accuracy multiplier and the (now primary)
 * Pace multiplier to the accumulated per-triple subtotal, round to the final granular Score, then
 * derive a rank tier from the Level's median (Ranking — unchanged, still Score-based) and 0-5
 * Mastery stars from global completion time `T` (Mastery — no longer Score-based; see
 * ranking.ts#masteryStarsFromTime). Match Pile has no partial-completion mode
 * (docs/scoring-system.md's Variant note) — a loss scores 0 and shows 0 stars. A win never reads
 * as 0 stars — Mastery's time curve itself floors a successful run at `mastery.minSuccessStars`.
 */
export function finalizeRunScore(inputs: RunScoreInputs): RunScoreResult {
  const median = medianForLevel(inputs.levelIndex, inputs.expectedTriples);
  if (!inputs.won) {
    return { score: 0, stars: 0, accuracyMultiplier: 1, median, rankTier: 0 };
  }
  const accMult = accuracyMultiplier(inputs.correctAttempts, inputs.wrongAttempts);
  const timeRefs = timeReferencesForLevel(inputs.levelIndex, inputs.expectedTriples);
  const paceMult = paceMultiplier(inputs.totalMs ?? 0, timeRefs.parTimeMs, timeRefs.aceTimeMs);
  const score = Math.round(inputs.scoreSubtotal * accMult * paceMult);
  const stars = masteryStarsFromTime(inputs.totalMs ?? 0, timeRefs);
  return {
    score,
    stars,
    accuracyMultiplier: accMult,
    median,
    rankTier: rankTierForScore(score, median),
  };
}
