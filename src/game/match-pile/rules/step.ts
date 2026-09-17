/**
 * Production rules engine transition function. Independently derived from
 * tier-a/REFERENCE_MATRIX.json (R-EXPOSURE, R-MATCH-SIZE, R-AUTOCLEAR,
 * R-FAIL, R-ORDERS-WIN, R-ORDER-PROGRESS, R-TERMINAL) — must behave
 * identically to `referenceStep` (reference.ts) for every input, verified by
 * a 2000-run fast-check parity property in tests/unit/game/rules.test.ts.
 *
 * R-EXPOSURE (geometric-exposure pass, tier-a-build-v4): this function no
 * longer enforces the abstract grid-stack exposure rule itself — see
 * rules/isExposed.ts's doc comment for the full rationale and the new
 * architecture. The real reachability decision now lives at the render
 * layer (board/exposure.ts + board/boardRenderer.ts + board/tiles.ts), which
 * only ever makes a tile interactive/tappable when its own bounding-box
 * coverage check says enough of it is visibly exposed on screen; this
 * function trusts that decision and simply requires the picked id to still
 * exist in `state.tiles` and the run to still be `'playing'` — its only two
 * remaining preconditions (both still exactly R-TERMINAL). `rate.ts` and
 * `solver/solve.ts` are unaffected: both pre-filter their own candidates
 * through the strict `isExposed()` themselves before ever calling this
 * function, so they never rely on (and never exercised) the gate removed
 * here.
 */

import type { PileState } from "./types";
import { MATCH_SIZE } from "./types";
import { winFail } from "./winFail";
import { advanceOrders } from "./orders";

/** Removes the first `count` occurrences of `typeId` from `tray`, preserving order of what remains. */
function removeFirstN(tray: readonly string[], typeId: string, count: number): string[] {
  const result: string[] = [];
  let remaining = count;
  for (const entry of tray) {
    if (entry === typeId && remaining > 0) {
      remaining -= 1;
      continue;
    }
    result.push(entry);
  }
  return result;
}

/**
 * R-TERMINAL: total, defensive transition. Unknown ids and picks against a
 * non-'playing' state both no-op — returning the exact same `state`
 * reference. (Exposure is no longer gated here — see the R-EXPOSURE note
 * above.)
 */
export function step(state: PileState, tileId: string): PileState {
  if (state.phase !== "playing") {
    return state;
  }

  const picked = state.tiles.find((tile) => tile.id === tileId);
  if (!picked) {
    return state;
  }

  const remainingTiles = state.tiles.filter((tile) => tile.id !== tileId);
  const trayWithPick = [...state.tray, picked.typeId];

  let occurrences = 0;
  for (const entry of trayWithPick) {
    if (entry === picked.typeId) occurrences += 1;
  }

  let nextTray = trayWithPick;
  let cleared = state.cleared;
  let nextOrders = state.orders;

  // R-AUTOCLEAR: the pick just made can be the only typeId to have reached
  // MATCH_SIZE (every prior state holds each typeId below the threshold).
  if (occurrences >= MATCH_SIZE) {
    nextTray = removeFirstN(trayWithPick, picked.typeId, MATCH_SIZE);
    cleared += MATCH_SIZE;
    // R-ORDER-PROGRESS: advance every Order matching the cleared type,
    // capped at its requiredQty. R-DISTRACTOR-VALID: a cleared type matching
    // no Order simply advances nothing — the clear itself is unaffected.
    nextOrders = advanceOrders(state.orders ?? [], picked.typeId);
  }

  return {
    tiles: remainingTiles,
    tray: nextTray,
    cleared,
    orders: nextOrders,
    // R-ORDERS-WIN: WIN is evaluated ahead of R-FAIL within this single
    // transition, matching the old pile-empty-vs-tray-full precedence this
    // rule supersedes.
    phase: winFail(remainingTiles, nextTray, nextOrders),
  };
}
