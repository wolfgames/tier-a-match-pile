/**
 * Content validation: is this puzzle structurally sound and actually
 * solvable? Runs `solve()` as a genuine search (not a replay of the
 * generator's own recorded proof) so this also validates mutated/arbitrary
 * candidates independent of provenance.
 */

import { isValid, type PileState } from "../../src/game/match-pile/rules";
import { solve, replay } from "../../src/game/match-pile/solver";

export interface ValidateLevelOptions {
  /** Search budget passed to solve(); default 1 (existence check only). */
  readonly solveLimit?: number;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export function validateLevel(
  puzzle: PileState,
  opts: ValidateLevelOptions = {}
): ValidationResult {
  if (!isValid(puzzle)) {
    return { ok: false, reason: "isValid() rejected the puzzle's structural invariants" };
  }

  const solutions = solve(puzzle, { limit: opts.solveLimit ?? 1 });
  if (solutions.length === 0) {
    return { ok: false, reason: "solve() found no full-clear continuation within its budget" };
  }

  const [solution] = solutions;
  if (!isValid(solution)) {
    return { ok: false, reason: "solve()'s terminal state failed isValid()" };
  }

  if (!replay(puzzle, solution.picks)) {
    return { ok: false, reason: "replay() of the found solution did not reach 'won'" };
  }

  return { ok: true };
}
