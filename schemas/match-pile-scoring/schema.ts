// Local DynamicData schema scaffold for `match-pile-scoring` (see `wolf-dev schema create --key
// match-pile-scoring`). Not yet registered/deployed against Wolf's backend. `defaultData` mirrors
// docs/scoring-system.md's "Default tunables (summary)" exactly as shipped today (see
// src/game/match-pile/scoring/config.ts / config/dynamicGameConfig.ts) — an unregistered/
// unpopulated schema behaves identically to the current hardcoded scoring math.
import { type } from "arktype";
import { DEFAULT_SCORING_CONFIG } from "../../src/game/match-pile/config/dynamicGameConfig";

export const MatchPileScoringDef = type({
  coreMatchPoints: "number",
  time: {
    maxPoints: "number",
    tHalfMs: "number",
    gamma: "number",
  },
  streak: {
    steps: "number[]",
  },
  accuracy: {
    min: "number",
    max: "number",
    gamma: "number",
    lambdaWrong: "number",
    alpha: "number",
    beta: "number",
  },
  pace: {
    enabled: "boolean",
    min: "number",
    max: "number",
    gamma: "number",
    parMsPerTriple: "number",
    aceMsPerTriple: "number",
    perLevelParTimeMs: "Record<string, number>",
    perLevelAceTimeMs: "Record<string, number>",
  },
  terminal: {
    enabled: "boolean",
    baseAward: "number",
    decayRate: "number",
  },
  mastery: {
    minStars: "number",
    maxStars: "number",
    minSuccessStars: "number",
    slowCeilingMultiplierOfPar: "number",
    perLevelSlowCeilingMs: "Record<string, number>",
  },
  ranking: {
    defaultMedian: "number",
    perLevelMedian: "Record<string, number>",
    firstAttemptOnly: "boolean",
  },
  rankTiers: type({
    tier: "1|2|3|4|5",
    multipleOfMedian: "number",
  }).array(),
});

export const defaultData: typeof MatchPileScoringDef.infer | null = DEFAULT_SCORING_CONFIG;
