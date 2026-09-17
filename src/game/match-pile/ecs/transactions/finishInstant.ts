// what_in: a terminal PileState + the move count that produced it + `now`.
// what_out: same finalisation as commitPick, for the debug/agent "jump to the end" paths
//           (solve()/fail() on window.__GAME_DEBUG__) that don't replay every tap — so their
//           streak/accuracy/subtotal are whatever real taps (if any) already accumulated before
//           the jump, never fabricated.
// why_here: A2/A3 write-site rule.
import type { GameStore } from '../store';
import type { PileState } from '../../rules/types';
import { MATCH_SIZE } from '../../rules/types';
import { finalizeRunScore } from '../../scoring';

export function finishInstant(
  store: GameStore,
  { next, movesUsed, now }: { next: PileState; movesUsed: number; now: number },
): void {
  store.resources.pile = next;
  store.resources.movesUsed = movesUsed;
  const solveMs = Math.max(0, now - (store.resources.gameplayStartedAtMs || store.resources.startedAtMs));
  const result = finalizeRunScore({
    won: next.phase === 'won',
    levelIndex: store.resources.levelIndex,
    scoreSubtotal: store.resources.scoreSubtotal,
    correctAttempts: store.resources.correctAttempts,
    wrongAttempts: store.resources.wrongAttempts,
    expectedTriples: store.resources.currentPuzzle.tiles.length / MATCH_SIZE,
    totalMs: solveMs,
  });
  store.resources.solveMs = solveMs;
  store.resources.score = result.score;
  store.resources.stars = result.stars;
}
