/**
 * Match Pile — shared rules types & constants.
 *
 * This is the ONLY file shared between the reference model (`reference.ts`,
 * owned by the test author) and the production engine (`step.ts`/`isValid.ts`/
 * `winFail.ts`, owned by the implementer). It carries data shapes and tuned
 * constants only — zero logic — so a parity test comparing the two
 * implementations' behavior is meaningful rather than circular.
 *
 * See tier-a/REFERENCE_MATRIX.json for the sourced decision behind every
 * constant and shape below (R-TRAY-SIZE, R-MATCH-SIZE, R-EXPOSURE, R-FAIL,
 * R-WIN [superseded by R-ORDERS-WIN], R-TERMINAL, R-ORDER-DATA,
 * R-ORDER-PROGRESS, R-ORDER-QTY-MULTIPLE3).
 */

/** R-TRAY-SIZE: the tray holds at most this many objects at once. */
export const TRAY_SIZE = 7;

/** R-MATCH-SIZE: this many identical types in the tray auto-clears. */
export const MATCH_SIZE = 3;

export type Phase = "playing" | "won" | "lost";

export type Tier = "easy" | "medium" | "hard" | "veryHard";

/**
 * One object in the pile. `typeId` is an opaque content-layer string (see
 * tier-a/REFERENCE_MATRIX.json#UX-OBJECT-POOL) — rules/solver/generator never
 * interpret it beyond equality. `col`/`row` address a grid cell; `layer` is
 * the stack height at that cell (0 = bottom). R-EXPOSURE: a tile is
 * selectable iff no remaining tile shares its (col,row) at a strictly higher
 * layer.
 */
export interface Tile {
  readonly id: string;
  readonly typeId: string;
  readonly col: number;
  readonly row: number;
  readonly layer: number;
}

/**
 * R-ORDER-DATA: one data-driven Order — a request for `requiredQty` copies of
 * `itemTypeId`, tracked via `collectedQty`. R-ORDER-QTY-MULTIPLE3:
 * `requiredQty` is always a positive multiple of MATCH_SIZE (no partial-triple
 * fulfillment). `collectedQty` always satisfies `0 <= collectedQty <=
 * requiredQty`. See tier-a/REFERENCE_MATRIX.json#R-ORDER-DATA.
 */
export interface Order {
  readonly itemTypeId: string;
  readonly requiredQty: number;
  readonly collectedQty: number;
}

/** The full state of one Match Pile run. */
export interface PileState {
  /** Objects still in the pile (not yet picked). */
  readonly tiles: readonly Tile[];
  /** typeIds currently held in the tray, in insertion order. length <= TRAY_SIZE always. */
  readonly tray: readonly string[];
  /** Count of objects cleared so far. Always a non-negative multiple of MATCH_SIZE. */
  readonly cleared: number;
  /**
   * R-ORDERS-WIN: the active Orders for this run. A required field — every
   * PileState must make an explicit, honest choice about its Orders (even if
   * that choice is `[]`) rather than silently defaulting. See R-ORDER-DATA /
   * R-ORDER-PROGRESS / R-ORDER-QTY-MULTIPLE3.
   */
  readonly orders: readonly Order[];
  readonly phase: Phase;
}

/** A state reached by applying a full pick sequence from some initial puzzle. */
export interface SolvedResult extends PileState {
  /** The tile-id pick order that reaches this state from the puzzle's initial state. */
  readonly picks: readonly string[];
}

export interface GenerateOptions {
  readonly seed: number;
  readonly tier: Tier;
  /**
   * Optional 1-based level index. When provided, the generator derives its tile count from
   * `generator/coverageCurve.ts#coverageTargetForLevel` (a level-index-driven board-coverage
   * ramp) instead of a flat per-tier range — see that file for the full rationale. Omitted by
   * callers that only care about a tier's flat range (tests, tools) — the generator falls back
   * to `TIER_CONFIG`'s `minTiles`/`maxTiles` range exactly as before when this is undefined, so
   * existing seed-driven behavior is unchanged for any caller that doesn't pass it.
   */
  readonly levelIndex?: number;
}

export interface GeneratedPuzzle {
  readonly puzzle: PileState;
  /** A recorded valid clear order (tile ids) proving `puzzle` is solvable. */
  readonly solution: readonly string[];
  readonly tier: Tier;
  readonly seed: number;
}
