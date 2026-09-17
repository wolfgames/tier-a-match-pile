/**
 * R-EXPOSURE (abstract/internal-tool version): a tile is selectable iff no
 * remaining tile shares its (col,row) at a strictly higher layer.
 * Independently derived from tier-a/REFERENCE_MATRIX.json#R-EXPOSURE — see
 * reference.ts for the test author's oracle version of the same rule.
 *
 * IMPORTANT — this is NOT the production tap-acceptance rule anymore. Tiles
 * are scattered/jittered and rotated within their cell for the "freeform
 * pile" look (board/tiles.ts), so a tile this function calls "covered" is
 * often still partially, genuinely visible on screen — and real players can
 * and should be able to tap that visible sliver directly, without first
 * clearing whatever's grid-stacked above it. Real tap acceptance is decided
 * geometrically, at the render layer:
 *
 *  - board/exposure.ts computes each tile's actual screen-space coverage
 *    (simple bounding-box math, not pixel/alpha testing) and gates
 *    interactivity on a minimum exposed-area threshold
 *    (MIN_EXPOSED_AREA_FRACTION) — see that file.
 *  - board/boardRenderer.ts + board/tiles.ts make every sufficiently-exposed
 *    tile a real interactive Pixi node with correct z-order (`zIndex`), so
 *    Pixi's own topmost-wins pointer routing resolves overlapping taps
 *    correctly for free — no custom hit-test math needed for routing itself.
 *  - rules/step.ts's production gate was relaxed to match: it no longer
 *    calls this function at all. It trusts that any tile id still present in
 *    `state.tiles` was legitimately reachable by whatever called it (the
 *    render layer, for real play; solve()/rate() pre-filter through this
 *    exact function themselves before ever handing step() a candidate id —
 *    see their own call sites — so their behavior is unaffected).
 *
 * This function itself is UNCHANGED and stays exactly as strict as before —
 * it remains the internal tool `rate.ts` (naive-walk difficulty heuristic),
 * `solver/solve.ts` (candidate ordering), and `generator/generate.ts`'s
 * reverse-construction proof rely on, all of which pre-filter through this
 * exact grid rule before ever proposing a candidate to `step()`. Nothing
 * about their solvability/difficulty reasoning changes: a puzzle solvable
 * via the strict topmost order stays solvable under the render layer's more
 * permissive rule (that same order is still legal), so relaxing what a real
 * tap can hit only ever adds legal moves beyond what they already prove,
 * never removes any.
 */

import type { PileState } from "./types";

export function isExposed(state: PileState, tileId: string): boolean {
  const target = state.tiles.find((tile) => tile.id === tileId);
  if (!target) return false;

  for (const other of state.tiles) {
    if (other.id === target.id) continue;
    if (other.col === target.col && other.row === target.row && other.layer > target.layer) {
      return false;
    }
  }

  return true;
}
