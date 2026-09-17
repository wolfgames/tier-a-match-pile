// what_in: nothing.
// what_out: small shared shapes used by both resources.ts and the transaction files.
// why_here: kept separate from plugin.ts for the same circularity reason as resources.ts.
import type { GameEvent } from '../feel';

export interface FxStamp {
  event: GameEvent;
  targetLabel: string;
  t: number;
}
