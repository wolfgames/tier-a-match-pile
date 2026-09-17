// what_in: the post-`step()` PileState (already computed by the pure rules engine) + `now`.
// what_out: writes the resolved pile, counts the move, and finalises score/stars on a terminal
//           phase. `scoreTapOutcome` (called by ecs/applyTap.ts just before this) has already
//           updated the run's streak/accuracy/subtotal for this same tap, so the terminal branch
//           here sees the fully up-to-date inputs, including this tap's own contribution.
// why_here: A2/A3 — the only write site for a resolved player pick. `next` was produced by
//           `rules/step` in `ecs/applyTap.ts` (a plain function, not a transaction) — this
//           transaction only commits the already-pure result, per ecs-gameplay.md's
//           "read → run pure rules → write via transactions" turn shape.
import type { GameStore } from '../store';
import type { PileState } from '../../rules/types';
import { MATCH_SIZE } from '../../rules/types';
import { finalizeRunScore } from '../../scoring';

export function commitPick(store: GameStore, { next, now }: { next: PileState; now: number }): void {
  store.resources.pile = next;
  store.resources.movesUsed += 1;
  if (next.phase === 'playing') return;
  // Pace's T = gameplayEndMs (`now`, this winning tap) − gameplayStartMs (when normal gameplay
  // activated — `gameplayStartedAtMs`, or `startedAtMs` for a level that was never FTUE-gated;
  // see ecs/resources.ts). FTUE instruction/pause time is excluded by construction: gated Levels
  // only set `gameplayStartedAtMs` once their gate clears (ecs/transactions/clearFtueGate.ts).
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
