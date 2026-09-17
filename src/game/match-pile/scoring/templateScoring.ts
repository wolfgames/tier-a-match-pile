// what_in: cycle time / streak length / correct-wrong counts / total run time — all supplied by
//          the caller (ecs/transactions/scoreTapOutcome.ts, ecs/transactions/commitPick.ts,
//          ecs/transactions/finishInstant.ts). No Math.random(), no Date.now()/clock read in
//          here — R-SCORE-DETERMINISTIC.
// what_out: the per-triple time-efficiency/streak engine and the run-end accuracy/pace
//           multipliers, per docs/scoring-system.md's composite score.
// why_here: the module path tests/unit/game/scoring-contract.test.ts expects
//           (~/game/match-pile/scoring/templateScoring) for R-SCORE-EVENT/STREAK/
//           STREAK-RESET/ACCURACY/MS/NO-PENALTY.
import { SCORING_CONFIG } from './config';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * docs/scoring-system.md §2 — time_points(t) = maxPoints × 1 / (1 + (t / tHalf)^gamma).
 * `cycleMs` is the millisecond gap since the previous successful triple match (R-SCORE-MS) —
 * never rounded to whole seconds.
 */
export function timeEfficiencyPoints(cycleMs: number, cfg = SCORING_CONFIG.time): number {
  const t = Math.max(0, cycleMs);
  return cfg.maxPoints * (1 / (1 + (t / cfg.tHalfMs) ** cfg.gamma));
}

/**
 * docs/scoring-system.md §3 — the speed-streak multiplier for a streak of length
 * `streakLengthAfter` (1 = the first successful triple after a reset/run-start, capped at the
 * top step). Applies to time-efficiency points only, per R-SCORE-STREAK.
 */
export function streakStepMultiplier(streakLengthAfter: number, steps: readonly number[] = SCORING_CONFIG.streak.steps): number {
  const index = Math.min(Math.max(Math.trunc(streakLengthAfter) - 1, 0), steps.length - 1);
  return steps[index];
}

/**
 * The full per-triple award docs/scoring-system.md's "Scoring flow" step 1 adds to the running
 * subtotal: `coreMatchPoints + time_points(t) × streakStep(streakLen)`. The stable core is the
 * majority of this value by design (config.ts#coreMatchPoints) — Streak/time-efficiency add a
 * comparatively small bonus on top, never the other way around.
 */
export function scoreForSuccessfulTriple(args: { cycleMs: number; streakLengthAfter: number }): number {
  return SCORING_CONFIG.coreMatchPoints + timeEfficiencyPoints(args.cycleMs) * streakStepMultiplier(args.streakLengthAfter);
}

/**
 * docs/scoring-system.md §4 — continuous run-end accuracy multiplier. `correct`/`wrong` are
 * Match Pile gameplay-tap counts (an accepted vs. rejected selection attempt) — never
 * solver-optimality, never an end-of-run unmatched-item tally (R-SCORE-ACCURACY). No term here
 * ever subtracts a flat penalty (R-SCORE-NO-PENALTY) — `wrong` only ever pulls the multiplier
 * down toward `min`, it never subtracts points directly.
 */
export function accuracyMultiplier(correct: number, wrong: number, cfg = SCORING_CONFIG.accuracy): number {
  const accuracy = (correct + cfg.alpha) / (correct + cfg.lambdaWrong * wrong + cfg.alpha + cfg.beta);
  return cfg.min + (cfg.max - cfg.min) * accuracy ** cfg.gamma;
}

/**
 * docs/scoring-system.md §5 — Pace multiplier from total active-gameplay time `totalMs`
 * (T = gameplayEndMs − gameplayStartMs) against per-Level `parTimeMs`/`aceTimeMs` benchmarks.
 * Returns a neutral `1` (no-op) whenever Pace is disabled or a benchmark is unavailable — see
 * config.ts's `pace` for the current parMsPerTriple/aceMsPerTriple-scaled benchmarks.
 */
export function paceMultiplier(
  totalMs: number,
  parTimeMs: number | null,
  aceTimeMs: number | null,
  cfg = SCORING_CONFIG.pace,
): number {
  if (!cfg.enabled || parTimeMs == null || aceTimeMs == null || parTimeMs === aceTimeMs) return 1;
  const p = clamp01((parTimeMs - totalMs) / (parTimeMs - aceTimeMs));
  return cfg.min + (cfg.max - cfg.min) * p ** cfg.gamma;
}
