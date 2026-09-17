/**
 * Structural invariant check for PileState, independently derived from the
 * same invariants as `referenceIsValid` (reference.ts): no duplicate tile
 * ids, no duplicate (col,row,layer), tray within bounds, no typeId in the
 * tray at count >= MATCH_SIZE, cleared is a non-negative multiple of
 * MATCH_SIZE, every Order is individually well-formed (R-ORDER-DATA /
 * R-ORDER-QTY-MULTIPLE3), and phase consistency with R-ORDERS-WIN/R-FAIL.
 *
 * R-ORDERS-WIN superseded the old R-WIN ("empty pile ⇒ won"): an empty pile
 * with unsatisfied Orders is now a real, valid, reachable "nothing left to
 * pick, still playing" state (see this file's own inline note below, and
 * the implementer's report for the full reasoning) rather than an invalid
 * one — so this file no longer rejects `tiles.length === 0` on its own.
 */

import type { PileState } from "./types";
import { MATCH_SIZE, TRAY_SIZE } from "./types";
import { ordersSatisfied } from "./orders";

export function isValid(state: PileState): boolean {
  const ids = new Set<string>();
  for (const tile of state.tiles) {
    if (ids.has(tile.id)) return false;
    ids.add(tile.id);
  }

  const cells = new Set<string>();
  for (const tile of state.tiles) {
    const key = `${tile.col},${tile.row},${tile.layer}`;
    if (cells.has(key)) return false;
    cells.add(key);
  }

  if (state.tray.length > TRAY_SIZE) return false;

  const typeCounts = new Map<string, number>();
  for (const typeId of state.tray) {
    const next = (typeCounts.get(typeId) ?? 0) + 1;
    if (next >= MATCH_SIZE) return false;
    typeCounts.set(typeId, next);
  }

  if (state.cleared < 0 || state.cleared % MATCH_SIZE !== 0) return false;

  const orders = state.orders ?? [];
  for (const order of orders) {
    if (order.requiredQty <= 0 || order.requiredQty % MATCH_SIZE !== 0) return false;
    if (order.collectedQty < 0 || order.collectedQty > order.requiredQty) return false;
  }

  // R-ORDERS-WIN: 'won' implies every Order is satisfied (not the reverse —
  // Orders can be fully satisfied while phase is still 'playing', e.g. the
  // transition that satisfies them hasn't evaluated WIN yet in some
  // hand-built fixture; that's not this file's concern to reject).
  if (state.phase === "won" && !ordersSatisfied(orders)) return false;

  if (state.phase === "playing") {
    if (state.tray.length === TRAY_SIZE) return false;
  }

  return true;
}
