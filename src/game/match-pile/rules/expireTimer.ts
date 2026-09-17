/**
 * R-TIMER-FAIL: pure phase mutation for a Timer expiry, matching R-TERMINAL's own
 * absorbing-state discipline (see winFail.ts / step.ts) — the Timer is a wall-clock/ECS
 * concept (ecs/resources.ts), not a PileState field, but the phase transition it can cause
 * is still a pure rules-layer decision, not something to inline in the ecs/ transaction.
 */
import type { PileState } from "./types";

export function expireTimer(state: PileState): PileState {
  if (state.phase !== "playing") return state;
  return { ...state, phase: "lost" };
}
