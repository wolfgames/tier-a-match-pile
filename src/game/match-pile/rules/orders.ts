/**
 * Match Pile — Orders data shape and pure helpers, consumed by the
 * production rules engine (`step.ts`, `winFail.ts`, `isValid.ts`).
 *
 * `Order` itself lives in `./types` (the shared, logic-free contract file —
 * see that file's header). This module holds pure functions over that shape.
 * Per `reference.ts`'s own independence requirement (the parity fast-check
 * property in tests/unit/game/rules.test.ts is only meaningful if the two
 * implementations are truly separate), `reference.ts` does NOT import from
 * here — it implements its own inline equivalents of `advanceOrders` /
 * `ordersSatisfied`, the same way it already inlines its own autoclear/tray
 * logic instead of sharing `step.ts`'s `removeFirstN`.
 *
 * See tier-a/REFERENCE_MATRIX.json#R-ORDER-DATA, #R-ORDER-PROGRESS,
 * #R-ORDER-QTY-MULTIPLE3, #R-ORDERS-WIN, #R-DISTRACTOR-VALID.
 */

import type { Order } from "./types";
import { MATCH_SIZE } from "./types";

export type { Order };

/**
 * R-ORDER-QTY-MULTIPLE3 / R-ORDER-DATA: structural validity of a single
 * Order — `requiredQty` must be a positive multiple of MATCH_SIZE, and
 * `collectedQty` must be within `[0, requiredQty]`.
 */
export function isValidOrder(order: Order): boolean {
  if (order.requiredQty <= 0 || order.requiredQty % MATCH_SIZE !== 0) return false;
  if (order.collectedQty < 0 || order.collectedQty > order.requiredQty) return false;
  return true;
}

/**
 * R-ORDER-PROGRESS: advances every Order whose `itemTypeId` matches `typeId`
 * by MATCH_SIZE, capped at that Order's `requiredQty`. Orders for other
 * typeIds — including a distractor `typeId` matching no Order at all, see
 * R-DISTRACTOR-VALID — pass through unchanged.
 */
export function advanceOrders(orders: readonly Order[], typeId: string): Order[] {
  return orders.map((order) =>
    order.itemTypeId === typeId
      ? { ...order, collectedQty: Math.min(order.collectedQty + MATCH_SIZE, order.requiredQty) }
      : order,
  );
}

/**
 * R-ORDERS-WIN: a level is won once every configured Order is satisfied.
 * Deliberately `false` when there are zero Orders — without this guard,
 * `[].every(...)` is vacuously `true`, which would win the instant any pick
 * is evaluated on a PileState with no Orders configured at all.
 */
export function ordersSatisfied(orders: readonly Order[]): boolean {
  return orders.length > 0 && orders.every((order) => order.collectedQty >= order.requiredQty);
}
