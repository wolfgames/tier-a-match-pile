/**
 * R-HINT: finds one exposed tile that lies on some still-winnable
 * continuation from `state`. Reuses `solve()` with a tight search limit —
 * the first pick of any full-clear continuation from THIS state is, by
 * construction, both legal and currently exposed.
 */

import type { PileState } from "../rules/types";
import { solve } from "./solve";

export function explain(state: PileState, opts?: { limit?: number }): string | null {
  if (state.phase !== "playing") {
    return null;
  }

  const solutions = solve(state, { limit: opts?.limit ?? 1 });
  if (solutions.length === 0) {
    return null;
  }

  return solutions[0].picks[0] ?? null;
}
