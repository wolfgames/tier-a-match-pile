// what_in: nothing — data only.
// what_out: every scoring tunable as config/data (R-SCORE-TUNABLES), never a hardcoded magic
//           number inside templateScoring.ts/ranking.ts. Approved Match Pile V1 tuning
//           (docs/scoring-system.md "Default tunables (summary)") — this pass rebalances
//           responsibility between fine per-triple timing (Score granularity only) and global
//           completion time (Score's Pace term + all of Mastery). `accuracy.gamma`/rank tiers'
//           multiples are still the template's untouched starting shape.
// why_here: scoring/ is the module layout tests/unit/game/scoring-contract.test.ts expects
//           (scoring/{config,templateScoring,ranking}) — see that file + tier-a/evidence/red/R-SCORE-*.
//           Shape (including top-level `rankTiers`, mutable arrays/records) is not free-form: it
//           is exactly what config/dynamicGameConfig.ts#applyDynamicGameConfig and
//           schemas/match-pile-scoring/schema.ts already expect and mutate in place at boot —
//           see that file's header before changing field names/nesting here.

export interface TimeEfficiencyConfig {
  maxPoints: number;
  tHalfMs: number;
  gamma: number;
}

export interface AccuracyConfig {
  min: number;
  max: number;
  gamma: number;
  lambdaWrong: number;
  alpha: number;
  beta: number;
}

export interface PaceConfig {
  enabled: boolean;
  min: number;
  max: number;
  gamma: number;
  /** ParTime/AceTime benchmarks (docs/scoring-system.md §5) — the SAME per-Level references
   * drive both the Score-side Pace multiplier below and Mastery's time-based curve
   * (ranking.ts#masteryStarsFromTime), since both represent "normal vs excellent" global pace.
   * `parMsPerTriple`/`aceMsPerTriple` are the ms-per-successful-triple fallback rate, scaled by a
   * Level's own triple count, for any Level without an explicit entry in the per-Level records
   * below (a naive `expectedTriples × rate` slightly overstates a short Level's real total time —
   * there are only `expectedTriples − 1` inter-triple gaps, not `expectedTriples` — which is why
   * Levels 1–3 get explicit, directly-measured overrides instead of the formula). */
  parMsPerTriple: number;
  aceMsPerTriple: number;
  perLevelParTimeMs: Record<string, number>;
  perLevelAceTimeMs: Record<string, number>;
}

export interface TerminalConfig {
  enabled: boolean;
  baseAward: number;
  decayRate: number;
}

export interface MasteryConfig {
  /** Stars for a loss/unfinished run — always 0, per the Win floor below. */
  minStars: number;
  /** Stars for a win at or beyond Ace pace. */
  maxStars: number;
  /** Stars for a win at or beyond the slow ceiling (docs/scoring-system.md's "barely completes
   * before timeout" reference) — the Win floor. Every successful run scores at least this many. */
  minSuccessStars: number;
  /** Multiple of a Level's `parTimeMs` used as the "still succeeded, just slow" ceiling (the
   * mastery formula's `timerBudgetMs`) for any Level without an explicit entry in
   * `perLevelSlowCeilingMs` below. Deliberately NOT the real gameplay Timer's fail-budget
   * (ecs/timerConfig.ts) — that budget is generous survival time (5 minutes for FTUE), not a
   * meaningful "how slow is still a normal completion" reference for a 2-12 triple Level. */
  slowCeilingMultiplierOfPar: number;
  perLevelSlowCeilingMs: Record<string, number>;
}

export interface RankingConfig {
  /** Phase 1 fallback median (docs/scoring-system.md's ranking model) — used for every Level
   * until real first-attempt play data exists. Placeholder pending real Match Pile play data;
   * not derived from any live analytics in this pass. */
  defaultMedian: number;
  /** Phase 1 static, data-driven per-Level median overrides (`levelIndex -> median score`).
   * Populating this later (or swapping it for a live analytics lookup) needs no structural
   * change to ranking.ts's callers. */
  perLevelMedian: Record<string, number>;
  /** R-SCORE-FIRST-ATTEMPT: median benchmarking must only ever use first-attempt runs (never
   * "Try Again" retries, never How-to-Play replays). Not enforced by this config value itself —
   * it documents the requirement for whatever later populates `perLevelMedian`/a live median
   * source; this scoring-connection pass has no analytics pipeline to filter. */
  firstAttemptOnly: boolean;
}

export interface RankTierStep {
  tier: 1 | 2 | 3 | 4 | 5;
  multipleOfMedian: number;
}

export const SCORING_CONFIG = {
  // The stable Core Match value (docs/scoring-system.md's 3rd tuning pass) — every completed
  // triple (Order-relevant or distractor, either way) is worth this many points, independent of
  // any timing. This is the foundation of the Score, and deliberately does NOT scale with
  // Streak (docs' "applies to time-efficiency points only, never to the core value") — a run's
  // Score should be dominated by "how many successful matches did I make," not by incidental
  // per-match timing noise. See `time` below for why that term is now a small fraction of this.
  coreMatchPoints: 100,
  // Fine-granularity term ONLY (docs/scoring-system.md's Score-responsibility hierarchy: the
  // stable Core Match value + global completion performance are primary, per-triple ms timing is
  // fine granularity/leaderboard separation only). `maxPoints` cut from 120 to 12 — at
  // `coreMatchPoints = 100`, even the best realistic case (near-instant cycle time at max Streak)
  // now contributes well under a fifth of a triple's subtotal, and a typical cycle time
  // contributes roughly 5-10%. `tHalfMs`/`gamma` (the curve's *shape*, not its scale) are
  // unchanged from the prior pass — already gentle around normal human cycle times; only the
  // ceiling needed to shrink.
  time: { maxPoints: 12, tHalfMs: 8000, gamma: 1.0 } satisfies TimeEfficiencyConfig,
  // Speed Streak is now a secondary modifier (docs' hierarchy), not something that can massively
  // separate two otherwise-similar runs — narrowed from the template's 1.0x-3.1x span (which let
  // one broken streak or one lucky long one triple the effective time-efficiency points) to a
  // gentle 1.0x-1.6x. Still rewards clean consecutive play; can no longer dominate.
  streak: { steps: [1.0, 1.15, 1.3, 1.45, 1.6] as number[] },
  // Accuracy is now secondary too — narrowed from the template's 0.5x-1.5x span (a 3x swing) to
  // 0.85x-1.15x so a successful run with a small number of genuine mistakes still produces a
  // healthy Score. Never a direct point penalty either way.
  accuracy: { min: 0.85, max: 1.15, gamma: 1.95, lambdaWrong: 1.0, alpha: 1, beta: 1 } satisfies AccuracyConfig,
  // Pace is a PRIMARY Score term (docs' hierarchy: global completion performance, alongside the
  // stable Core Match value, ahead of Streak/Accuracy) — but now that `coreMatchPoints` gives
  // every run a large stable foundation, Pace no longer needs an extreme percentage swing to
  // still move the Score meaningfully in absolute terms. Narrowed from the 2nd pass's 0.70x-1.40x
  // (calibrated when the core was 0 and Pace had to carry the entire "global performance" signal
  // alone) to a gentler 0.85x-1.20x. gamma = 1.0 (linear in `p`) keeps it smooth and continuous —
  // no cliffs: a small difference in total time barely moves Score, a run that takes roughly
  // double another's time shows a clearly meaningful difference.
  pace: {
    enabled: true,
    min: 0.85,
    max: 1.20,
    gamma: 1.0,
    // L4+ fallback rate — unchanged this pass (docs' "don't make later Levels as generous as
    // FTUE"): a normal-paced run still lands at Par (Mastery = 3 stars) for any Level without its
    // own entry below.
    parMsPerTriple: 3000,
    aceMsPerTriple: 1000,
    // Levels 1-3 (approved, 3rd pass): the 2nd pass's FTUE references made a normal human run
    // land almost exactly at Par (3 stars per ranking.ts's Mastery formula) — too harsh for
    // onboarding Levels per direct playtest feedback. Retuned so a normal real-player run instead
    // lands about 3/4 of the way from Par to Ace (Mastery = 4 stars): `ace = 0.6 × normal`,
    // `par = 1.4 × normal`, where `normal` is the real, directly-measured ordinary-pace time from
    // the 2nd pass's playtesting (L1 ~3200ms, L2/L3 from that pass's per-triple-gap reasoning,
    // 27000/33000ms). This makes Par read as "slow but still a normal completion" (~3 stars) and
    // Ace a genuinely fast run (~5 stars), with the typical player landing around 4.
    //   L1: normal ~3200  -> ace 2000,  par 4500.
    //   L2: normal ~27000 -> ace 16000, par 38000.
    //   L3: normal ~33000 -> ace 20000, par 46000.
    perLevelParTimeMs: { 1: 4500, 2: 38000, 3: 46000 } as Record<string, number>,
    perLevelAceTimeMs: { 1: 2000, 2: 16000, 3: 20000 } as Record<string, number>,
  } satisfies PaceConfig,
  /** Disabled — Match Pile has no single decisive final action distinct from its last triple
   * match (docs/scoring-system.md §6). */
  terminal: { enabled: false, baseAward: 1500, decayRate: 0.5 } satisfies TerminalConfig,
  // Mastery is no longer derived from Score/median at all (docs' "Score and Stars are related
  // but no longer identical signals") — it's computed directly from global active-gameplay
  // completion time T via ranking.ts#masteryStarsFromTime, so it stays stable across the same
  // small per-triple ms noise that legitimately moves the granular Score. `slowCeilingMultiplierOfPar
  // = 3` means "3x the Level's normal/par pace" reads as the barely-made-it 1-star ceiling by
  // default; Levels 1-3 don't need an override — their `perLevelParTimeMs`/`perLevelAceTimeMs`
  // above are already small, real, directly-reasoned numbers, so 3x par is already a sensible
  // generous ceiling for a "slow but successful" FTUE run.
  mastery: { minStars: 0, maxStars: 5, minSuccessStars: 1, slowCeilingMultiplierOfPar: 3, perLevelSlowCeilingMs: {} as Record<string, number> } satisfies MasteryConfig,
  ranking: {
    // Unchanged this pass — Ranking (rank tier) still normalizes against the granular final
    // Score and this per-Level median (docs' "Ranking can still use Score... do not redesign
    // Ranking"); only Mastery Stars moved to a time-based signal (see `mastery` above).
    defaultMedian: 330,
    perLevelMedian: { 1: 290, 2: 3200 } as Record<string, number>,
    firstAttemptOnly: true,
  } satisfies RankingConfig,
  /** docs/scoring-system.md "Rank tiers (percentile standing)" — Tier 0 (any score) is the
   * floor every finished run clears and is intentionally absent from this list; see
   * ranking.ts#rankTierForScore. Top-level (not nested under `ranking`) — matches
   * schemas/match-pile-scoring/schema.ts. */
  rankTiers: [
    { tier: 5, multipleOfMedian: 2.02 },
    { tier: 4, multipleOfMedian: 1.35 },
    { tier: 3, multipleOfMedian: 1.22 },
    { tier: 2, multipleOfMedian: 1.07 },
    { tier: 1, multipleOfMedian: 0.93 },
  ] as RankTierStep[],
};
