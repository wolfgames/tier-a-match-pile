/**
 * Bounded backtracking search for full-clear pick sequences. A genuine
 * search over currently-exposed tiles at each state (not a replay of a
 * puzzle's own stored `.solution`) — `solve()` is also used to validate
 * arbitrary/mutated puzzles independent of generator provenance.
 *
 * Heuristic candidate ordering (keeps the search fast on our
 * constructively-solvable puzzles without needing much backtracking):
 *   1. Prefer a tile whose typeId already has exactly MATCH_SIZE-1 copies
 *      in the tray (picking it completes/clears a triple immediately).
 *   2. Otherwise prefer types with fewer remaining exposed copies (rarer
 *      options now are more likely to become unreachable later).
 *   3. Tie-break on tile id for determinism.
 */

import type { PileState, SolvedResult, Tile } from "../rules/types";
import { MATCH_SIZE } from "../rules/types";
import { step } from "../rules/step";
import { isExposed } from "../rules/isExposed";

const NODE_BUDGET = 50_000;

function orderCandidates(state: PileState): Tile[] {
  const exposed = state.tiles.filter((tile) => isExposed(state, tile.id));

  const trayCounts = new Map<string, number>();
  for (const typeId of state.tray) {
    trayCounts.set(typeId, (trayCounts.get(typeId) ?? 0) + 1);
  }

  const exposedCountByType = new Map<string, number>();
  for (const tile of exposed) {
    exposedCountByType.set(tile.typeId, (exposedCountByType.get(tile.typeId) ?? 0) + 1);
  }

  return exposed.sort((a, b) => {
    const aCompletes = (trayCounts.get(a.typeId) ?? 0) === MATCH_SIZE - 1 ? 0 : 1;
    const bCompletes = (trayCounts.get(b.typeId) ?? 0) === MATCH_SIZE - 1 ? 0 : 1;
    if (aCompletes !== bCompletes) return aCompletes - bCompletes;

    const aRemaining = exposedCountByType.get(a.typeId) ?? 0;
    const bRemaining = exposedCountByType.get(b.typeId) ?? 0;
    if (aRemaining !== bRemaining) return aRemaining - bRemaining;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function solve(puzzle: PileState, opts: { limit: number }): SolvedResult[] {
  const results: SolvedResult[] = [];
  if (opts.limit <= 0) return results;

  let expansions = 0;
  const picks: string[] = [];

  function dfs(state: PileState): void {
    if (results.length >= opts.limit || expansions >= NODE_BUDGET) return;
    expansions += 1;

    if (state.phase === "won") {
      results.push({ ...state, picks: [...picks] });
      return;
    }
    if (state.phase === "lost") {
      return;
    }

    for (const tile of orderCandidates(state)) {
      if (results.length >= opts.limit || expansions >= NODE_BUDGET) return;
      const next = step(state, tile.id);
      picks.push(tile.id);
      dfs(next);
      picks.pop();
    }
  }

  dfs(puzzle);
  return results;
}
