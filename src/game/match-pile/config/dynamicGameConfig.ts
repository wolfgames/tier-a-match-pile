// what_in: the resolved payload from Wolf's DynamicData (via GetDynamicDataClientCommand),
//          fetched once at boot by src/game/screens/useDynamicGameConfig.ts — a plain object per
//          schema (difficulty/scoring/content), or omitted/null when DynamicData is unavailable.
// what_out: `applyDynamicGameConfig()` — mutates the existing config constants (TIMER_CURVE,
//           COVERAGE_CURVE, TIER_CONFIG, ORDER_*, BAND_SEQUENCE, SCORING_CONFIG, OBJECT_TYPE_POOL)
//           IN PLACE, and `DEFAULT_*_CONFIG` — frozen-at-import-time snapshots of those same
//           constants, used as the DynamicData schemas' `defaultData` (schemas/*/schema.ts).
// why_here: every pure function in ecs/timerConfig.ts, generator/coverageCurve.ts,
//           generator/objectTypes.ts, rules/deriveOrders.ts, services/levelSequence.ts, and every
//           renderer that reads TIER_CONFIG/OBJECT_TYPE_POOL directly (board/boardRenderer.ts,
//           board/tray.ts, board/tiles.ts) already reads these exact exported objects. Mutating
//           them in place — rather than adding a parallel "live config" getter everywhere — means
//           the whole codebase picks up DynamicData-resolved values with zero call-site changes,
//           and there is exactly one object per domain (no duplicate source of truth). Before
//           `applyDynamicGameConfig()` ever runs (tests, or DynamicData unavailable), every one of
//           these objects holds precisely the values it always did — behavior is unchanged.
//
// `MAX_ORDERS` (rules/deriveOrders.ts) is deliberately NOT included here: it is a bare exported
// number, not an object/array, so it cannot be mutated in place without changing its call sites.
// It stays a hardcoded safety ceiling — a defensive cap so a CMS misconfiguration can never push
// Orders past what board/ordersHud.ts's fixed-height slot can render, not a tunable itself.
import type { Tier } from '../rules/types';
import type { TierConfig } from '../generator/objectTypes';
import { TIMER_CURVE } from '../ecs/timerConfig';
import { COVERAGE_CURVE, TILE_COUNT_FLOOR_RANGES } from '../generator/coverageCurve';
import { OBJECT_TYPE_POOL, TIER_CONFIG } from '../generator/objectTypes';
import { ORDER_COUNT_LEVEL_RANGES, ORDER_COUNT_LEVEL_OVERRIDES, ORDER_QTY_RANGE } from '../rules/deriveOrders';
import { BAND_SEQUENCE } from '../services/levelSequence';
import { SCORING_CONFIG } from '../scoring/config';

const TIERS: readonly Tier[] = ['easy', 'medium', 'hard', 'veryHard'];

/**
 * Plain, fully-mutable DynamicData wire shapes — deliberately NOT reusing the app-internal
 * `readonly`-heavy types (TierConfig's own fields aside, which are read-only by convention only)
 * so this lines up 1:1 with what arktype infers from each schema's definition, without
 * readonly-array assignability friction. Kept in sync with the domain files' shapes by hand; both
 * sides are small and change rarely.
 */
export interface DifficultyConfigData {
  timer: {
    ftueBudgetMs: number;
    startBudgetMs: number;
    decreaseMsPerLevel: number;
    floorMs: number;
  };
  coverage: {
    rampStartLevelIndex: number;
    startCoverage: number;
    ceilingCoverage: number;
    rampLengthLevels: number;
    reliefDiscount: number;
  };
  tileCountFloorRanges: { minLevel: number; maxLevel: number; floor: number }[];
  tierConfig: Record<Tier, TierConfig>;
  orderCountLevelRanges: { minLevel: number; maxLevel: number; min: number; max: number }[];
  orderCountLevelOverrides: Record<string, number>;
  orderQtyRange: Record<Tier, { minQty: number; maxQty: number }>;
  bandSequence: Tier[];
}

export interface ScoringConfigData {
  coreMatchPoints: number;
  time: { maxPoints: number; tHalfMs: number; gamma: number };
  streak: { steps: number[] };
  accuracy: { min: number; max: number; gamma: number; lambdaWrong: number; alpha: number; beta: number };
  pace: {
    enabled: boolean;
    min: number;
    max: number;
    gamma: number;
    parMsPerTriple: number;
    aceMsPerTriple: number;
    perLevelParTimeMs: Record<string, number>;
    perLevelAceTimeMs: Record<string, number>;
  };
  terminal: { enabled: boolean; baseAward: number; decayRate: number };
  mastery: {
    minStars: number;
    maxStars: number;
    minSuccessStars: number;
    slowCeilingMultiplierOfPar: number;
    perLevelSlowCeilingMs: Record<string, number>;
  };
  ranking: { defaultMedian: number; perLevelMedian: Record<string, number>; firstAttemptOnly: boolean };
  rankTiers: { tier: 1 | 2 | 3 | 4 | 5; multipleOfMedian: number }[];
}

export type ContentConfigData = string[];

export interface ResolvedGameConfig {
  readonly difficulty?: DifficultyConfigData | null;
  readonly scoring?: ScoringConfigData | null;
  readonly content?: ContentConfigData | null;
}

/**
 * Snapshots of today's hardcoded values, taken at module load — i.e. before
 * `applyDynamicGameConfig` can ever run. These are the DynamicData schemas' `defaultData`
 * (each schema.ts under schemas/ imports these), so an unregistered/unpopulated schema resolves
 * to exactly the current gameplay values.
 */
export const DEFAULT_DIFFICULTY_CONFIG: DifficultyConfigData = structuredClone({
  timer: TIMER_CURVE,
  coverage: COVERAGE_CURVE,
  tileCountFloorRanges: [...TILE_COUNT_FLOOR_RANGES],
  tierConfig: TIER_CONFIG,
  orderCountLevelRanges: [...ORDER_COUNT_LEVEL_RANGES],
  orderCountLevelOverrides: { ...ORDER_COUNT_LEVEL_OVERRIDES },
  orderQtyRange: ORDER_QTY_RANGE,
  bandSequence: [...BAND_SEQUENCE],
});

export const DEFAULT_SCORING_CONFIG: ScoringConfigData = structuredClone({
  coreMatchPoints: SCORING_CONFIG.coreMatchPoints,
  time: SCORING_CONFIG.time,
  streak: { steps: [...SCORING_CONFIG.streak.steps] },
  accuracy: SCORING_CONFIG.accuracy,
  pace: SCORING_CONFIG.pace,
  terminal: SCORING_CONFIG.terminal,
  mastery: SCORING_CONFIG.mastery,
  ranking: { ...SCORING_CONFIG.ranking, perLevelMedian: { ...SCORING_CONFIG.ranking.perLevelMedian } },
  rankTiers: [...SCORING_CONFIG.rankTiers],
});

export const DEFAULT_CONTENT_POOL: ContentConfigData = Array.from(OBJECT_TYPE_POOL);

/** Replaces an array's contents in place (works around the `readonly` compile-time modifier —
 * none of these are runtime-frozen). Keeps the original array reference, so every existing
 * closure/import that already holds it sees the new contents immediately. */
function replaceArrayContents(target: unknown, items: readonly unknown[]): void {
  const arr = target as unknown[];
  arr.length = 0;
  arr.push(...items);
}

/** Same idea for a plain key->number map: drop keys no longer present, then apply the rest. */
function replaceRecordContents(target: unknown, items: Record<string, number>): void {
  const record = target as Record<string, number>;
  for (const key of Object.keys(record)) delete record[key];
  Object.assign(record, items);
}

/**
 * Applies a resolved DynamicData payload by mutating the existing config objects in place.
 * Called once at boot (src/game/screens/useDynamicGameConfig.ts) after the DynamicData client
 * resolves — never from inside a pure function, transaction, or system (guardrail: no I/O in
 * `step()`/ECS actions). Safe to call with a partial payload; any field left `null`/`undefined`
 * leaves that domain's current values untouched.
 */
export function applyDynamicGameConfig(resolved: ResolvedGameConfig): void {
  const difficulty = resolved.difficulty;
  if (difficulty) {
    Object.assign(TIMER_CURVE, difficulty.timer);
    Object.assign(COVERAGE_CURVE, difficulty.coverage);
    replaceArrayContents(TILE_COUNT_FLOOR_RANGES, difficulty.tileCountFloorRanges);
    for (const tier of TIERS) Object.assign(TIER_CONFIG[tier], difficulty.tierConfig[tier]);
    replaceArrayContents(ORDER_COUNT_LEVEL_RANGES, difficulty.orderCountLevelRanges);
    replaceRecordContents(ORDER_COUNT_LEVEL_OVERRIDES, difficulty.orderCountLevelOverrides);
    for (const tier of TIERS) Object.assign(ORDER_QTY_RANGE[tier], difficulty.orderQtyRange[tier]);
    replaceArrayContents(BAND_SEQUENCE, difficulty.bandSequence);
  }

  const scoring = resolved.scoring;
  if (scoring) {
    SCORING_CONFIG.coreMatchPoints = scoring.coreMatchPoints;
    Object.assign(SCORING_CONFIG.time, scoring.time);
    replaceArrayContents(SCORING_CONFIG.streak.steps, scoring.streak.steps);
    Object.assign(SCORING_CONFIG.accuracy, scoring.accuracy);
    Object.assign(SCORING_CONFIG.pace, scoring.pace);
    Object.assign(SCORING_CONFIG.terminal, scoring.terminal);
    Object.assign(SCORING_CONFIG.mastery, scoring.mastery);
    Object.assign(SCORING_CONFIG.ranking, scoring.ranking);
    replaceArrayContents(SCORING_CONFIG.rankTiers, scoring.rankTiers);
  }

  const content = resolved.content;
  if (content) replaceArrayContents(OBJECT_TYPE_POOL, content);
}
