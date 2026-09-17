// what_in: a target FtueGate value.
// what_out: writes `ftueGate` — the single write site so no other transaction reaches into
//           this resource directly (A2/A3).
// why_here: ecs/applyTap.ts flips 'step1' -> 'awaitingFirstTap' the moment both of Level 1's
//           guided triples resolve; kept as its own transaction so applyTap stays a plain function.
import type { GameStore } from '../store';
import type { FtueGate } from '../../tutorial/steps';

export function setFtueGate(store: GameStore, { gate }: { gate: FtueGate }): void {
  store.resources.ftueGate = gate;
}
