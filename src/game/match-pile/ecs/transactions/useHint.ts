// what_in: nothing — a one-shot flag flip.
// what_out: marks the level's single hint as spent and counts it against scoring.
// why_here: A2/A3 write-site rule; U3/U4 hint gating reads `hintSpent` back via feel.ts.
import type { GameStore } from '../store';

export function useHint(store: GameStore): void {
  if (store.resources.hintSpent) return;
  store.resources.hintSpent = true;
  store.resources.hintsUsed += 1;
}
