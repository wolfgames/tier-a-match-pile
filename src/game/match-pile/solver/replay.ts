/**
 * Applies a recorded pick sequence and confirms it actually clears the
 * puzzle. Distinct from `solve()`'s validation path (which checks
 * `isValid()` on the terminal state, not `replay()`): this function's
 * contract is a plain boolean, used directly by content-validation and by
 * tests/unit/game/rules.test.ts / solvability.test.ts.
 */

import type { PileState } from "../rules/types";
import { step } from "../rules/step";

export function replay(puzzle: PileState, picks: readonly string[]): boolean {
  let state: PileState = puzzle;

  for (const pickId of picks) {
    if (state.phase !== "playing") {
      return false;
    }

    const tilesBefore = state.tiles.length;
    const next = step(state, pickId);

    // An illegal pick (unknown id, not exposed) is a no-op: tile count
    // does not shrink by exactly one.
    if (next.tiles.length !== tilesBefore - 1) {
      return false;
    }

    state = next;
  }

  return state.phase === "won";
}
