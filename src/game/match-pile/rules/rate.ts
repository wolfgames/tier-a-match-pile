/**
 * Difficulty heuristic for a generated puzzle. No external source for this
 * formula — tier-a/REFERENCE_MATRIX.json#MODE-DIFFICULTY-LADDER is tagged
 * `assumed`, so this is engineering judgment, documented inline. Must stay
 * cheap: the content pipeline runs it over 200+ candidates.
 *
 * Approach: a naive greedy playthrough (NOT the full backtracking solver)
 * that always picks the lowest-(col,row) currently-exposed tile. This
 * approximates "an unskilled player with no lookahead" and lets us measure
 * how much the puzzle's layer/type structure punishes that strategy:
 *
 *  - `maxTrayOccupancy`: the highest tray size reached right after an
 *    insertion, before that insertion's own auto-clear (if any) empties it
 *    back out. Bigger peaks mean the naive walk keeps flirting with FAIL.
 *  - average branching: the mean number of *distinct types* simultaneously
 *    exposed at each decision point. More concurrent distinct types means
 *    more ways to go wrong (queue the wrong thing) — a proxy for cognitive
 *    load / occlusion complexity.
 *  - a fixed penalty if the naive walk actually reaches 'lost' before
 *    'won' — the strongest possible difficulty signal available cheaply.
 *
 * Final score = 0.5 * occupancyScore + 0.3 * branchingScore + 0.2 * failPenalty,
 * each sub-score clamped to [0,1]. Weights are a judgment call: occupancy
 * dominates because it directly tracks proximity to the real fail condition;
 * branching is a secondary signal; the fail penalty is a strong but binary
 * kicker so puzzles the naive strategy can't even clear sort to the top.
 */

import type { PileState } from "./types";
import { TRAY_SIZE } from "./types";
import { isExposed } from "./isExposed";
import { step } from "./step";

/** Upper bound used to normalize average branching into [0,1]. Matches the
 * hard tier's maxTypes (see generator/objectTypes.ts#TIER_CONFIG) — the
 * highest distinct-type count the generator will ever produce. */
const MAX_EXPECTED_BRANCHING = 10;

export function rate(puzzle: PileState): number {
  let state: PileState = puzzle;
  let maxTrayOccupancy = 0;
  let branchingSum = 0;
  let branchingSamples = 0;

  // Bounded by tile count + a small margin: each successful pick removes
  // exactly one tile, so this always terminates well before the cap.
  const stepBudget = puzzle.tiles.length + 5;

  for (let i = 0; i < stepBudget && state.phase === "playing" && state.tiles.length > 0; i++) {
    const exposed = state.tiles.filter((tile) => isExposed(state, tile.id));
    if (exposed.length === 0) break;

    const distinctExposedTypes = new Set(exposed.map((tile) => tile.typeId)).size;
    branchingSum += distinctExposedTypes;
    branchingSamples += 1;

    let pick = exposed[0];
    for (const tile of exposed) {
      if (tile.col < pick.col || (tile.col === pick.col && tile.row < pick.row)) {
        pick = tile;
      }
    }

    const preInsertOccupancy = state.tray.length + 1;
    if (preInsertOccupancy > maxTrayOccupancy) {
      maxTrayOccupancy = preInsertOccupancy;
    }

    state = step(state, pick.id);
  }

  const occupancyScore = Math.min(maxTrayOccupancy / TRAY_SIZE, 1);
  const avgBranching = branchingSamples > 0 ? branchingSum / branchingSamples : 0;
  const branchingScore = Math.min(avgBranching / MAX_EXPECTED_BRANCHING, 1);
  const failPenalty = state.phase === "lost" ? 1 : 0;

  return occupancyScore * 0.5 + branchingScore * 0.3 + failPenalty * 0.2;
}
