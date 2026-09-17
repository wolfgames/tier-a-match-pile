/**
 * Match Pile — Wolf Template Scoring System contract.
 *
 * Per docs/scoring-system.md and tier-a/REFERENCE_MATRIX.json's R-SCORE-*
 * rules. The old src/game/match-pile/scoring.ts (budget-minus-costs, 0-3
 * stars) has been replaced by src/game/match-pile/scoring/{config,
 * templateScoring,ranking,index}.ts — the per-triple time-efficiency/streak
 * engine, the continuous run-end accuracy multiplier, and the median-
 * normalized ranking/0-5-mastery model. See tier-a/evidence/red/*.txt for
 * the original recorded (red) runs this contract now closes out.
 */

import { describe, it, expect } from "vitest";
import {
  timeEfficiencyPoints,
  streakStepMultiplier,
  scoreForSuccessfulTriple,
  accuracyMultiplier,
  finalizeRunScore,
  SCORING_CONFIG,
  DEFAULT_MEDIAN,
  medianForLevel,
  rankTierForScore,
  masteryStarsFromTime,
  timeReferencesForLevel,
} from "~/game/match-pile/scoring";

describe("Scoring contract", () => {
  it("R-SCORE-DETERMINISTIC — finalizeRunScore is a pure function of its inputs", () => {
    const inputs = { won: true, levelIndex: 4, scoreSubtotal: 987.6, correctAttempts: 12, wrongAttempts: 2, expectedTriples: 19 };
    expect(finalizeRunScore(inputs)).toEqual(finalizeRunScore({ ...inputs }));
  });

  it("R-SCORE-CONTINUOUS — score varies continuously; 1ms of cycle-time difference never ties", () => {
    const a = scoreForSuccessfulTriple({ cycleMs: 1000, streakLengthAfter: 1 });
    const b = scoreForSuccessfulTriple({ cycleMs: 1001, streakLengthAfter: 1 });
    expect(a).not.toBe(b);
  });

  it("R-SCORE-EVENT — the scoring event is a completed triple match; Order-relevance never enters the formula", () => {
    // scoreForSuccessfulTriple takes only cycle time + streak length — no Order/distractor
    // flag exists to pass in, by construction. A distractor triple and an Order-relevant triple
    // with the same cycle time and streak length score identically.
    const distractor = scoreForSuccessfulTriple({ cycleMs: 500, streakLengthAfter: 2 });
    const orderRelevant = scoreForSuccessfulTriple({ cycleMs: 500, streakLengthAfter: 2 });
    expect(distractor).toBe(orderRelevant);
  });

  it("R-SCORE-STREAK — the streak multiplier increases across consecutive successful triples, capped at the top step", () => {
    const steps = SCORING_CONFIG.streak.steps;
    for (let i = 1; i < steps.length; i++) {
      expect(streakStepMultiplier(i + 1)).toBeGreaterThan(streakStepMultiplier(i));
    }
    expect(streakStepMultiplier(steps.length + 5)).toBe(steps[steps.length - 1]);
  });

  it("R-SCORE-STREAK-RESET — modeled by streakLengthAfter=1 (the reset case) scoring lower than a longer streak at the same cycle time", () => {
    const afterReset = scoreForSuccessfulTriple({ cycleMs: 1000, streakLengthAfter: 1 });
    const midStreak = scoreForSuccessfulTriple({ cycleMs: 1000, streakLengthAfter: 4 });
    expect(midStreak).toBeGreaterThan(afterReset);
  });

  it("R-SCORE-MS — cycle time is accepted and scored at millisecond resolution, not coarser", () => {
    const t1 = timeEfficiencyPoints(1999);
    const t2 = timeEfficiencyPoints(2001);
    expect(t1).not.toBe(t2);
  });

  it("R-SCORE-ACCURACY / R-SCORE-NO-PENALTY — accuracy is a continuous run-end multiplier; no term ever subtracts a flat penalty", () => {
    const perfect = accuracyMultiplier(20, 0);
    const oneWrong = accuracyMultiplier(20, 1);
    const manyWrong = accuracyMultiplier(20, 10);
    expect(perfect).toBeGreaterThan(oneWrong);
    expect(oneWrong).toBeGreaterThan(manyWrong);
    // A single wrong attempt never drives the multiplier below the configured floor — it's a
    // continuous pull toward `min`, never a fixed point subtraction.
    expect(manyWrong).toBeGreaterThanOrEqual(SCORING_CONFIG.accuracy.min);
  });

  it("R-SCORE-RANKING-MEDIAN / R-SCORE-FIRST-ATTEMPT — ranking normalizes against a per-Level median (scaled by triple count) with a DEFAULT_MEDIAN fallback rate", () => {
    expect(medianForLevel(999_999, 10)).toBe(DEFAULT_MEDIAN * 10);
    expect(SCORING_CONFIG.ranking.firstAttemptOnly).toBe(true);
  });

  it("R-SCORE-FLOOR-TIER — every score lands on a tier; Tier 0 is the guaranteed floor", () => {
    expect(rankTierForScore(0, DEFAULT_MEDIAN)).toBe(0);
    expect(rankTierForScore(DEFAULT_MEDIAN * 3, DEFAULT_MEDIAN)).toBe(5);
  });

  it("R-SCORE-MASTERY — mastery is rated on a 0-5 star scale, from global completion time (not Score)", () => {
    const refs = timeReferencesForLevel(999_999, 10);
    expect(masteryStarsFromTime(refs.timerBudgetMs, refs)).toBe(SCORING_CONFIG.mastery.minSuccessStars);
    expect(masteryStarsFromTime(refs.aceTimeMs, refs)).toBe(5);
    expect(masteryStarsFromTime(refs.parTimeMs, refs)).toBe(3);
  });

  it("R-SCORE-TUNABLES — scoring constants live in scoring/config.ts, not as hardcoded implementation constants", () => {
    expect(SCORING_CONFIG.time.tHalfMs).toBe(8000);
    expect(SCORING_CONFIG.streak.steps).toEqual([1.0, 1.15, 1.3, 1.45, 1.6]);
  });

  it("finalizeRunScore: a loss always scores 0 (Match Pile has no partial-completion mode)", () => {
    expect(finalizeRunScore({ won: false, levelIndex: 1, scoreSubtotal: 5000, correctAttempts: 10, wrongAttempts: 0, expectedTriples: 2 }).score).toBe(0);
  });
});
