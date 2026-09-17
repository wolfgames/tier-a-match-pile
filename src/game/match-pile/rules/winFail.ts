/**
 * R-ORDERS-WIN / R-FAIL: pure phase derivation from the post-resolution
 * tiles/tray/orders shape. R-ORDERS-WIN (every configured Order satisfied) is
 * checked ahead of / independent from R-FAIL (tray at capacity) — see
 * tier-a/REFERENCE_MATRIX.json#R-ORDERS-WIN / #R-FAIL. `tiles` is no longer
 * part of the WIN test (that was the old, now-superseded R-WIN) but is kept
 * as a parameter for call-site symmetry with the tray/orders it's evaluated
 * alongside.
 *
 * `orders` defaults to `[]` defensively (`?? []`) so a caller that hasn't
 * been updated to populate the now-required `orders` field (out of scope
 * for this pass — see the calling code's own docs) degrades to "zero Orders
 * configured" rather than throwing. That is exactly R-ORDERS-WIN's own
 * zero-Orders case, not a special-cased legacy path: such a state can never
 * win via this function, by design (see orders.ts#ordersSatisfied).
 */

import type { Tile, Order, Phase } from "./types";
import { TRAY_SIZE } from "./types";
import { ordersSatisfied } from "./orders";

export function winFail(
  tiles: readonly Tile[],
  tray: readonly string[],
  orders: readonly Order[] | undefined,
): Phase {
  if (ordersSatisfied(orders ?? [])) return "won";
  if (tray.length >= TRAY_SIZE) return "lost";
  return "playing";
}
