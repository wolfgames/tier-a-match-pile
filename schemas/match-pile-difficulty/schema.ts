// Local DynamicData schema scaffold for `match-pile-difficulty` (see `wolf-dev schema create
// --key match-pile-difficulty`). Not yet registered/deployed against Wolf's backend — see
// docs/recipes/asset-pipeline.md-style handoff note in the PR description for the commands to run
// once authenticated. `defaultData` is the exact value the game already ships with today (see
// src/game/match-pile/config/dynamicGameConfig.ts), so an unregistered/unpopulated schema behaves
// identically to the current hardcoded curves.
//
// Caveat for whoever later populates a real data entry via `wolf-dev schema data create`: the
// open-ended tail rows below use `Number.POSITIVE_INFINITY` for `maxLevel`, which is not valid
// JSON (`JSON.stringify(Infinity)` -> `null`). Substitute a large finite sentinel (e.g. `999999`)
// in any hand-authored JSON payload — the row-matching logic treats it as "every level past this
// point" either way.
import { type } from "arktype";
import { DEFAULT_DIFFICULTY_CONFIG } from "../../src/game/match-pile/config/dynamicGameConfig";

const TIER = "'easy'|'medium'|'hard'|'veryHard'";

const tierConfigEntry = {
  minTiles: "number",
  maxTiles: "number",
  minTypes: "number",
  maxTypes: "number",
  cols: "number",
  rows: "number",
} as const;

const orderQtyRangeEntry = {
  minQty: "number",
  maxQty: "number",
} as const;

export const MatchPileDifficultyDef = type({
  timer: {
    ftueBudgetMs: "number",
    startBudgetMs: "number",
    decreaseMsPerLevel: "number",
    floorMs: "number",
  },
  coverage: {
    rampStartLevelIndex: "number",
    startCoverage: "number",
    ceilingCoverage: "number",
    rampLengthLevels: "number",
    reliefDiscount: "number",
  },
  tileCountFloorRanges: type({
    minLevel: "number",
    maxLevel: "number",
    floor: "number",
  }).array(),
  tierConfig: {
    easy: tierConfigEntry,
    medium: tierConfigEntry,
    hard: tierConfigEntry,
    veryHard: tierConfigEntry,
  },
  orderCountLevelRanges: type({
    minLevel: "number",
    maxLevel: "number",
    min: "number",
    max: "number",
  }).array(),
  orderCountLevelOverrides: "Record<string, number>",
  orderQtyRange: {
    easy: orderQtyRangeEntry,
    medium: orderQtyRangeEntry,
    hard: orderQtyRangeEntry,
    veryHard: orderQtyRangeEntry,
  },
  bandSequence: `(${TIER})[]`,
});

export const defaultData: typeof MatchPileDifficultyDef.infer | null = DEFAULT_DIFFICULTY_CONFIG;
