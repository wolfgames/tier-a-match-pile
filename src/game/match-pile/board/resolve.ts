// what_in: the tapped tile id + wall-clock `now`.
// what_out: dispatches 'input'/'submit' immediately, resolves the pick via `applyTap`, then
//           stamps the outcome fx (U2/U8 — every registry row this game actually uses).
// why_here: keeps gameController.ts a thin composition script (A4); board/ per the slice plan.
import type { GameDatabase } from '../ecs/plugin';
import { applyTap } from '../ecs/applyTap';
import type { GameEvent } from '../feel';

export interface ResolvedTap {
  event: GameEvent;
  phase: 'playing' | 'won' | 'lost';
  label: string;
}

export function resolveTap(db: GameDatabase, tileId: string, now: number): ResolvedTap {
  const label = `tile-${tileId}`;
  db.transactions.stampFx({ event: 'input', targetLabel: label, t: now });
  db.transactions.stampSubmit({ t: now });
  db.transactions.stampFx({ event: 'submit', targetLabel: label, t: now });
  const result = applyTap(db, tileId, now);
  db.transactions.stampFx({ event: result.event, targetLabel: label, t: now });
  return { event: result.event, phase: result.phase, label };
}
