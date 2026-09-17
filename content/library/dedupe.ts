/**
 * Structural dedupe key for generated candidates.
 *
 * Definition of "duplicate" used here: two puzzles are the same shape if
 * they share (a) the exact same set of (col,row,layer) positions — the
 * physical layout/occlusion structure, independent of which typeId occupies
 * each cell — and (b) the same multiset of per-typeId group sizes (how many
 * tiles share a type, sorted, independent of which concrete typeId each
 * group uses). Layout is the clearest, cheapest-to-compare signal for "this
 * is the same puzzle"; folding in the sorted group-size multiset means a
 * puzzle and its `mutate()`-relabeled twin (same shape, swapped concrete
 * types) canonicalize to the same key too — which is the case `mutate()`
 * exists to diversify away from, so treating them as duplicates here is the
 * point, not a bug.
 */

import type { PileState } from "../../src/game/match-pile/rules";

export function canonicalKey(puzzle: PileState): string {
  const positions = puzzle.tiles.map((tile) => `${tile.col},${tile.row},${tile.layer}`).sort();

  const countsByType = new Map<string, number>();
  for (const tile of puzzle.tiles) {
    countsByType.set(tile.typeId, (countsByType.get(tile.typeId) ?? 0) + 1);
  }
  const groupSizes = Array.from(countsByType.values()).sort((a, b) => a - b);

  return `${positions.join("|")}::${groupSizes.join(",")}`;
}
