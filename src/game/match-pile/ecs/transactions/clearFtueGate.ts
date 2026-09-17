// what_in: the wall-clock `now` the caller (ecs/applyTap.ts) already sampled for this tap.
// what_out: clears the FTUE gate, starts the Timer — the only moment `timerRunning` may flip
//           true for a level that loaded gated (loadLevel.ts leaves it false for those) — and
//           stamps `gameplayStartedAtMs`, the scoring system's "normal gameplay activation"
//           instant (docs/scoring-system.md — cycle time for the run's first successful triple
//           is measured from here, never from `loadLevel`'s FTUE-inclusive `now`).
// why_here: A2/A3 write-site rule; fired by the player's own first real tap while the gate is
//           'awaitingFirstTap' (ecs/applyTap.ts) — there is no Continue button.
import type { GameStore } from '../store';

export function clearFtueGate(store: GameStore, { now }: { now: number }): void {
  if (store.resources.ftueGate === 'none') return;
  store.resources.ftueGate = 'none';
  store.resources.timerRunning = true;
  store.resources.gameplayStartedAtMs = now;
}
