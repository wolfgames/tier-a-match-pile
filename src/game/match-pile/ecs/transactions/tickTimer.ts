// what_in: `dtMs` sampled by the caller (the Pixi ticker's `deltaMS`) — never read from a
//          clock internally; deterministic given the same store + dtMs.
// what_out: advances `timerRemainingMs` down by `dtMs` while `timerRunning` and
//           `pile.phase === 'playing'`; on reaching 0, expires the run (rules/expireTimer.ts)
//           and flips `timerRunning` false. No-ops (and reconciles `timerRunning` to false)
//           once the run is no longer 'playing', so a finished run never keeps "running".
// why_here: A2/A3 write-site rule; the actual phase mutation lives in rules/expireTimer.ts
//           (R-TIMER-FAIL), matching how Orders' own phase logic lives in rules/, not ecs/.
import type { GameStore } from '../store';
import { expireTimer } from '../../rules/expireTimer';

export function tickTimer(store: GameStore, { dtMs }: { dtMs: number }): void {
  const pile = store.resources.pile;

  if (pile.phase !== 'playing') {
    if (store.resources.timerRunning) store.resources.timerRunning = false;
    return;
  }

  if (!store.resources.timerRunning) return;

  const remaining = Math.max(0, store.resources.timerRemainingMs - dtMs);
  store.resources.timerRemainingMs = remaining;

  if (remaining <= 0) {
    store.resources.pile = expireTimer(pile);
    store.resources.timerRunning = false;
  }
}
