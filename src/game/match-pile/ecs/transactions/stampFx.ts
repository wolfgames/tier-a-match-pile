// what_in: the feedbackRegistry event that just dispatched + the label it acted on + `now`.
// what_out: `lastFx`/`lastSubmitT` resources — the U8 e2e probe reads these back via feel().
// why_here: A2/A3 write-site rule; guardrail "feedback dispatched from feedbackRegistry and
//           stamped into lastFx" — the controller calls these, never assigns the resource itself.
import type { GameStore } from '../store';
import type { GameEvent } from '../../feel';

export function stampFx(store: GameStore, { event, targetLabel, t }: { event: GameEvent; targetLabel: string; t: number }): void {
  store.resources.lastFx = { event, targetLabel, t };
}

export function stampSubmit(store: GameStore, { t }: { t: number }): void {
  store.resources.lastSubmitT = t;
}
