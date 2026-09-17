/**
 * Content-layer object pool and per-tier generation config. typeIds are
 * opaque semantic keys to rules/solver/generator — see
 * tier-a/REFERENCE_MATRIX.json#UX-OBJECT-POOL. Tile-count/type-count ranges
 * and grid sizes per tier are tier-a/REFERENCE_MATRIX.json#MODE-DIFFICULTY-LADDER
 * (tagged `assumed` — design judgment, not sourced).
 */

import type { Tier } from "../rules/types";

export const OBJECT_TYPE_POOL = [
  "fries",
  "big-mac",
  "quarter-pounder",
  "mcnuggets",
  "happy-meal-box",
  "soda-cup",
  "milkshake",
  "mcflurry",
  "apple-pie",
  "hash-brown",
  "egg-mcmuffin",
  "sausage-patty",
  "ketchup-packet",
  "bbq-sauce-packet",
  "sweet-tea",
  "iced-coffee",
  "sundae-cup",
  "salad-bowl",
  "chicken-sandwich",
  "filet-o-fish",
  "paper-bag",
  "tray-liner",
  "straw",
  "napkin",
] as const;

export interface TierConfig {
  readonly minTiles: number;
  readonly maxTiles: number;
  readonly minTypes: number;
  readonly maxTypes: number;
  readonly cols: number;
  readonly rows: number;
}

/**
 * R-DIFFICULTY-AXES note: this config is density/Orders-relevant knobs ONLY
 * (tiles/types/grid) — it deliberately carries no time-budget field. Timer
 * budget is now a separate, purely level-index-driven axis (see
 * ecs/timerConfig.ts#timerBudgetForLevel) decoupled from difficulty band, so
 * that a relief band (Easy after Hard/VeryHard) never regains a bigger Timer
 * budget just because the band changed. See ecs/timerConfig.ts for the
 * rationale in full.
 *
 * SCATTER-FILL / DENSITY-BY-BAND pass (tier-a-build-v4): the prior pass's
 * tile counts (`easy 27-39/4x4, medium 42-81/5x5, hard 86-135/6x6, veryHard
 * 135-180/7x7`) hit ~85-98% *cell*-occupancy (at least one tile per grid
 * cell) but that metric didn't track visual fill — tiles mostly stayed
 * centered in their own cell (board/tiles.ts's old ±15%-of-cell jitter and
 * flat 40px `TILE_SIZE` regardless of cell size), so cells routinely had
 * exactly one tile with visible gaps to every neighbor: "gridded," not "a
 * scattered heap." Re-tuned against an actual rendered-*area* Monte-Carlo
 * coverage metric (tests/unit/game/coverage.test.ts), together with
 * board/tiles.ts's now cell-size-scaled tile size (`TILE_SIZE_CELL_RATIO =
 * 1.0`, was 0.62) and wider jitter (`JITTER_COEFF = 1.0`, was 0.3).
 *
 * `minTypes`/`maxTypes` are UNCHANGED from the prior pass — this was a
 * discovered hard constraint, not a stylistic choice. An earlier version of
 * this pass raised them alongside tile counts (to keep average
 * tiles-per-type, and so `rules/deriveOrders.ts`'s `requiredQty`, from
 * exploding); that broke `tests/unit/game/solvability.test.ts`'s D3 "≥95% of
 * 200 seeds produce a solvable level" gate hard (down to ~54%). Root cause:
 * `solver/solve.ts`'s bounded DFS (`NODE_BUDGET = 50_000`, untouched — out of
 * scope, see the build report) orders candidates by generic tray-completion
 * heuristics with no idea which typeId is Order-relevant; more distinct
 * on-board types inflate branching *combinatorially*, and raising the node
 * budget alone didn't recover it (tested up to 2,000,000 — plateaued around
 * 73%), confirming the bottleneck is heuristic quality, not a search-budget
 * ceiling (fixing that heuristic is solver work, explicitly out of scope
 * here). Empirically, tile-count increases alone cost only a few points of
 * solve-rate margin (measured, see build report) — comfortably within
 * budget — while type-count increases were the dominant cause of collapse.
 * So this pass raises ONLY tile counts, leaving `minTypes`/`maxTypes` at
 * their original values; tile counts are tuned down from an earlier, more
 * aggressive draft specifically to keep D3's measured solve rate at 192/200
 * (96%) with margin, while still landing every band's area-coverage in the
 * 85-100% target (measured ~0.857/0.871/0.884/0.897 easy→veryHard — see
 * coverage.test.ts). Disclosed trade-off: with types held flat and tiles up
 * ~4-6x, average tiles-per-type (and so a selected Order's `requiredQty`,
 * always a type's full on-board count) is also up roughly that much versus
 * the prior pass — Orders may take noticeably longer to fulfill now. This
 * does not touch `rules/deriveOrders.ts`, `ORDERS_TUNING`, or Orders/Timer
 * win-lose logic at all; it's a direct, load-bearing consequence of the
 * solvability constraint above, flagged for playtest feedback rather than
 * silently rebalanced without it.
 *
 * Old values (prior pass): easy 27-39/2-4 types/4x4, medium 42-81/4-7/5x5,
 * hard 86-135/6-10/6x6, veryHard 135-180/8-12/7x7.
 *
 * TYPE-VARIETY RETUNE (tier-a-build-v4, Orders/coverage-ramp pass): `minTypes`/`maxTypes` are
 * lowered again here — a deliberate reversal of the note above, not a regression. The prior
 * pass's constraint was "raising types alongside tiles blew the D3 solver-budget gate"; this
 * pass raises variety WITHOUT raising `minTiles`/`maxTiles` (those are now level-index-ramp
 * driven for real gameplay — see `coverageCurve.ts` — this range is only the flat RNG fallback
 * for callers that don't pass a `levelIndex`, and the ramp's own safety cap), so the same
 * solver-budget risk does not reapply here. Retuned to ~4/5/6/7-8 distinct types per band per
 * the build brief (was 2-4/4-7/6-10/8-12) — narrower ranges centered on those targets rather
 * than the old wide spreads, still comfortably inside `OBJECT_TYPE_POOL`'s 24 entries.
 */
export const TIER_CONFIG: Record<Tier, TierConfig> = {
  easy: { minTiles: 150, maxTiles: 180, minTypes: 3, maxTypes: 5, cols: 4, rows: 4 },
  medium: { minTiles: 180, maxTiles: 230, minTypes: 4, maxTypes: 6, cols: 5, rows: 5 },
  hard: { minTiles: 210, maxTiles: 250, minTypes: 5, maxTypes: 7, cols: 6, rows: 6 },
  veryHard: { minTiles: 230, maxTiles: 270, minTypes: 6, maxTypes: 8, cols: 7, rows: 7 },
};
