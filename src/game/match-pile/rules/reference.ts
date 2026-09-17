/**
 * Match Pile — independent reference implementation of the rules engine.
 * Owned by the test author, NOT the implementer; it is the oracle the parity
 * test compares production `step()` against. Derived only from `./types` and
 * `tier-a/REFERENCE_MATRIX.json` — must not import from, or resemble, the
 * production `rules/` modules (does NOT import production `./orders`; the
 * Order-advance/Orders-satisfied logic below is independently implemented).
 * Covers R-EXPOSURE, R-MATCH-SIZE, R-AUTOCLEAR, R-FAIL, R-ORDERS-WIN
 * (supersedes R-WIN), R-ORDER-PROGRESS, R-ORDER-QTY-MULTIPLE3, R-TERMINAL,
 * R-TRAY-SIZE. R-EXPOSURE note (tier-a-build-v4 geometric-exposure pass):
 * `referenceStep` no longer gates on exposure, in lockstep with production
 * `step.ts` (see `rules/isExposed.ts`'s doc comment for why); `referenceIsExposed`
 * itself is UNCHANGED and stays exported/used directly by rules.test.ts.
 */

import type { Order, PileState } from "./types";
import { MATCH_SIZE, TRAY_SIZE } from "./types";

/**
 * R-ORDERS-WIN: independent implementation of "every configured Order is
 * satisfied" — deliberately `false` when there are zero Orders (otherwise
 * `[].every(...)` vacuously wins a PileState with no Orders configured).
 */
function referenceOrdersSatisfied(orders: readonly Order[]): boolean {
  if (orders.length === 0) return false;
  for (const order of orders) {
    if (order.collectedQty < order.requiredQty) return false;
  }
  return true;
}

/**
 * R-ORDER-PROGRESS: independent implementation of advancing every Order
 * matching `typeId` by MATCH_SIZE, capped at that Order's requiredQty.
 */
function referenceAdvanceOrders(orders: readonly Order[], typeId: string): Order[] {
  const next: Order[] = [];
  for (const order of orders) {
    if (order.itemTypeId !== typeId) {
      next.push(order);
      continue;
    }
    const collectedQty = Math.min(order.collectedQty + MATCH_SIZE, order.requiredQty);
    next.push({ ...order, collectedQty });
  }
  return next;
}

/** R-EXPOSURE: topmost remaining tile at its (col,row) is selectable. */
export function referenceIsExposed(state: PileState, tileId: string): boolean {
  const target = state.tiles.find((t) => t.id === tileId);
  if (!target) return false;
  for (const other of state.tiles) {
    if (other.id === target.id) continue;
    if (
      other.col === target.col &&
      other.row === target.row &&
      other.layer > target.layer
    ) {
      return false;
    }
  }
  return true;
}

/** Counts occurrences of each typeId currently in the tray. */
function countByType(tray: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const typeId of tray) {
    counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  }
  return counts;
}

/** R-TERMINAL/R-AUTOCLEAR/R-FAIL/R-ORDERS-WIN: total, defensive transition.
 * Illegal picks (unknown id, non-playing phase) no-op. Exposure is
 * deliberately NOT gated here anymore — see this file's header. */
export function referenceStep(state: PileState, tileId: string): PileState {
  if (state.phase !== "playing") {
    return state;
  }

  const tile = state.tiles.find((t) => t.id === tileId);
  if (!tile) {
    return state;
  }

  // Remove the picked tile from the pile.
  const nextTiles = state.tiles.filter((t) => t.id !== tileId);

  // Insert its typeId into the tray.
  let nextTray = [...state.tray, tile.typeId];
  let cleared = state.cleared;
  let nextOrders = state.orders ?? [];

  // R-AUTOCLEAR: only the just-inserted typeId can have reached MATCH_SIZE.
  const counts = countByType(nextTray);
  const insertedCount = counts.get(tile.typeId) ?? 0;
  if (insertedCount >= MATCH_SIZE) {
    let removed = 0;
    const filtered: string[] = [];
    for (const typeId of nextTray) {
      if (typeId === tile.typeId && removed < MATCH_SIZE) {
        removed++;
        continue;
      }
      filtered.push(typeId);
    }
    nextTray = filtered;
    cleared += MATCH_SIZE;
    // R-ORDER-PROGRESS: advance every Order matching the cleared type.
    nextOrders = referenceAdvanceOrders(nextOrders, tile.typeId);
  }

  // R-ORDERS-WIN wins outright regardless of tray/pile state (supersedes the
  // old pile-empty R-WIN); else R-FAIL when the tray is full.
  const phase = referenceOrdersSatisfied(nextOrders)
    ? "won"
    : nextTray.length >= TRAY_SIZE
      ? "lost"
      : "playing";

  return { tiles: nextTiles, tray: nextTray, cleared, orders: nextOrders, phase };
}

/**
 * Structural invariant check, independent of production `isValid.ts`.
 * Covers: no duplicate tile ids, no duplicate (col,row,layer), tray bound,
 * no typeId at count >= MATCH_SIZE in the tray, cleared is a non-negative
 * multiple of MATCH_SIZE, every Order individually well-formed, and phase
 * consistency with R-ORDERS-WIN/R-FAIL.
 */
export function referenceIsValid(state: PileState): boolean {
  const seenIds = new Set<string>();
  for (const tile of state.tiles) {
    if (seenIds.has(tile.id)) return false;
    seenIds.add(tile.id);
  }

  const seenCells = new Set<string>();
  for (const tile of state.tiles) {
    const key = `${tile.col},${tile.row},${tile.layer}`;
    if (seenCells.has(key)) return false;
    seenCells.add(key);
  }

  if (state.tray.length > TRAY_SIZE) return false;

  const counts = countByType(state.tray);
  for (const count of counts.values()) {
    if (count >= MATCH_SIZE) return false;
  }

  if (state.cleared < 0 || state.cleared % MATCH_SIZE !== 0) return false;

  const orders = state.orders ?? [];
  for (const order of orders) {
    if (order.requiredQty <= 0 || order.requiredQty % MATCH_SIZE !== 0) return false;
    if (order.collectedQty < 0 || order.collectedQty > order.requiredQty) return false;
  }

  // R-ORDERS-WIN supersedes R-WIN: 'won' now requires every Order satisfied
  // (not an empty pile), and an empty pile no longer forces 'won'.
  if (state.phase === "won" && !referenceOrdersSatisfied(orders)) return false;

  if (state.phase === "playing") {
    if (state.tray.length === TRAY_SIZE) return false;
  }

  return true;
}
