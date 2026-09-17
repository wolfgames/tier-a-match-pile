/**
 * V1 prototype-sprint Orders derivation — a single, pure, deterministic
 * helper that turns a puzzle's `tiles` into a valid `Order[]` (see
 * rules/types.ts#Order, rules/orders.ts#isValidOrder).
 *
 * Why this exists: the shipped FTUE (`data/ftueLevels.json`) and level pack
 * (`data/levels-match-pile.json`) content was authored before Orders existed,
 * so their stored puzzles carry no `orders` at all — under R-ORDERS-WIN
 * (rules/winFail.ts) a PileState with zero Orders can never reach 'won'. This
 * helper is called at load time (services/levels.ts#getLevel()) so every
 * playable level gets a real, satisfiable Order set without touching the
 * committed JSON or the content pipeline. It is also called directly inside
 * generator/generate.ts so a bare `generate()` call is self-consistent too.
 *
 * This is intentionally rough: NOT the final difficulty curve
 * (docs/GAME-DESIGN.md#progression-and-retention is a future Progression-pass
 * concern). It only needs to be simple, deterministic, and monotonic enough
 * to demonstrate "more Orders later" for today's manual playtesting.
 *
 * Determinism: derives everything from the puzzle's own `tiles` (their
 * typeId first-appearance order) and the caller-supplied `levelIndex` — no
 * `Math.random()`, no `Date.now()`.
 */

import type { Order, Tier, Tile } from "./types";
import { MATCH_SIZE } from "./types";

/**
 * Orders-count curve (tier-a-build-v4, Orders-count-curve pass) — REPLACES the earlier
 * per-band-range/level-5-floor scheme entirely (see git history for the prior
 * `ORDERS_TUNING`/`ORDER_COUNT_FLOOR_LEVEL`/`ORDER_COUNT_FLOOR`/`ORDER_COUNT_TUNING` version).
 *
 * How many Orders a level has is now primarily a function of the level's absolute position in
 * the campaign (`ORDER_COUNT_LEVEL_RANGES` — the level always lands within its range's
 * `[min,max]`), with difficulty band deciding WHERE within that window the count lands
 * (`BAND_POSITION_FRACTION`): Easy/relief at the low end, Medium in the middle, Hard/VeryHard at
 * the high end. The level-based minimum always wins even if band would otherwise suggest going
 * lower — a relief (Easy) level several bands into the campaign must still hit its own level's
 * floor, not the campaign-relative "feels easier" floor a band-only scheme would give it.
 *
 * FTUE Level 1 is a special case handled entirely outside this file: `deriveOrders`'s
 * `allTypesRequired` flag (set only for `levelIndex === 1`) makes every distinct type an Order,
 * bypassing `orderCountForLevel` altogether — the brief's "Level 1: exactly 2 Orders" depends on
 * FTUE Level 1's own hand-authored content (`data/ftueLevels.json`, out of scope to edit here).
 * Levels 2+ (including FTUE Levels 2-3) flow through the table below.
 */

/**
 * Global safety cap — no level may ever have more Orders than this, defensively enforced even
 * though every configured level-range's own `max` already respects it (kept as an explicit named
 * constant per the build brief, not just implied by the table). Also notable: the Orders HUD
 * (`board/ordersHud.ts`) renders one line per Order with no count clamp, inside a slot sized for
 * only `board/layout.ts#ORDERS_MAX_LINES` (4) lines — a pre-existing HUD gap this cap does not
 * fix (out of scope; confirmed-working system) but that levels using 5-6 Orders will expose. See
 * build report.
 */
export const MAX_ORDERS = 6;

interface OrderCountLevelRange {
  /** Inclusive lower bound (1-based level index). */
  readonly minLevel: number;
  /** Inclusive upper bound; `Number.POSITIVE_INFINITY` for the open-ended tail range. */
  readonly maxLevel: number;
  /** Fewest Orders any level in this range may have, regardless of band. */
  readonly min: number;
  /** Most Orders any level in this range may have (before the global `MAX_ORDERS` cap). */
  readonly max: number;
}

/**
 * The exact level-range curve from the build brief. Level 1 never reaches this table (see module
 * doc comment above); levels 2+ always match exactly one row (the tail row's `Infinity` upper
 * bound guarantees a match for every level, however large).
 */
export const ORDER_COUNT_LEVEL_RANGES: readonly OrderCountLevelRange[] = [
  { minLevel: 2, maxLevel: 9, min: 2, max: 4 },
  { minLevel: 10, maxLevel: 14, min: 3, max: 4 },
  { minLevel: 15, maxLevel: 19, min: 3, max: 5 },
  { minLevel: 20, maxLevel: 24, min: 4, max: 5 },
  { minLevel: 25, maxLevel: Number.POSITIVE_INFINITY, min: 4, max: 6 },
];

/**
 * Where in a level's `[min,max]` range each band lands, as a 0-1 fraction of the range's span —
 * Easy/relief at the low end (0), Medium in the middle (0.5), Hard/VeryHard at the high end (1).
 * Expressed as a fraction (not raw counts) so the same table works regardless of how wide a
 * given level-range is.
 */
const BAND_POSITION_FRACTION: Record<Tier, number> = {
  easy: 0,
  medium: 0.5,
  hard: 1,
  veryHard: 1,
};

/** Finds the level-range row for `levelIndex`. Falls back to the open-ended tail row (kept
 * defensive; the tail's `Infinity` maxLevel means every level >= 2 already matches a row). */
function orderCountRangeForLevel(levelIndex: number): OrderCountLevelRange {
  const row = ORDER_COUNT_LEVEL_RANGES.find((r) => levelIndex >= r.minLevel && levelIndex <= r.maxLevel);
  return row ?? ORDER_COUNT_LEVEL_RANGES[ORDER_COUNT_LEVEL_RANGES.length - 1];
}

/**
 * Direct per-level manual-playtest corrections — checked before the general level-range/
 * band-position curve below. Smallest possible change to hit an exact requested count for one
 * level without disturbing the broader progression around it.
 */
export const ORDER_COUNT_LEVEL_OVERRIDES: Readonly<Record<number, number>> = {
  5: 3,
  9: 3,
  10: 4,
};

/**
 * How many Orders a level asks for — level-range decides the allowed `[min,max]` window
 * (`orderCountRangeForLevel`), band decides where within it the count lands
 * (`BAND_POSITION_FRACTION`). `Math.max(range.min, ...)` is a defensive, explicitly-named clamp
 * per the build brief ("the level-based minimum always wins") — Easy's fraction is 0 (the
 * range's own `min`), so in practice this never needs to correct anything, but a future band or
 * fraction retune could otherwise produce a value below the level's floor without it.
 * `Math.min(..., MAX_ORDERS)` is the same kind of defensive belt-and-suspenders cap. Pure
 * function of `(levelIndex, band)` only — no board/RNG context, so it's directly testable
 * against the worked examples in the build brief. Does not yet know about the board's own
 * distinct-type ceiling — see `deriveOrders` below for the final `maxSelectable` clamp.
 */
export function orderCountForLevel(levelIndex: number, band: Tier): number {
  const override = ORDER_COUNT_LEVEL_OVERRIDES[levelIndex];
  if (override !== undefined) return Math.min(override, MAX_ORDERS);
  const range = orderCountRangeForLevel(levelIndex);
  const fraction = BAND_POSITION_FRACTION[band];
  const bandPositionValue = Math.round(range.min + fraction * (range.max - range.min));
  const cap = Math.min(range.max, MAX_ORDERS);
  return Math.max(range.min, Math.min(bandPositionValue, cap));
}

/**
 * R-ORDER-QTY-MULTIPLE3-respecting conservative `requiredQty` ranges per band, expressed as
 * [min, max] multiples of `MATCH_SIZE` (3) — replaces the old "always the type's full on-board
 * count" rule that produced absurd quantities (e.g. "0/90"). Per the build brief exactly:
 * easy 3-6, medium 3-9, hard 6-12, veryHard 6-15.
 */
export const ORDER_QTY_RANGE: Record<Tier, { readonly minQty: number; readonly maxQty: number }> = {
  easy: { minQty: 3, maxQty: 6 },
  medium: { minQty: 3, maxQty: 9 },
  hard: { minQty: 6, maxQty: 12 },
  veryHard: { minQty: 6, maxQty: 15 },
};

export interface DeriveOrdersOptions {
  /** 1-based level index — drives which eligible types get selected (the circular window offset), not how many. */
  readonly levelIndex: number;
  /** Effective difficulty band — drives orderCountForLevel's "where in the level's Orders-count range" knob. */
  readonly band: Tier;
  /**
   * FTUE Level 1 exception: when true, every distinct type present becomes
   * an Order — zero distractors, per the "only Order-relevant items" FTUE
   * requirement. Callers set this only for that one level.
   */
  readonly allTypesRequired?: boolean;
}

/** Distinct typeIds in first-appearance order — deterministic given `tiles`' own order. */
function distinctTypesInOrder(tiles: readonly Tile[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const tile of tiles) {
    if (!seen.has(tile.typeId)) {
      seen.add(tile.typeId);
      order.push(tile.typeId);
    }
  }
  return order;
}

function onBoardCounts(tiles: readonly Tile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    counts.set(tile.typeId, (counts.get(tile.typeId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Deterministic string hash -> [0,1), self-contained (rules/ never imports Pixi-adjacent code
 * like board/tiles.ts's own hash01, even though this is conceptually the same technique) — used
 * only to pick a `requiredQty` within a band's conservative range without any `Math.random()`.
 */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Picks a desired Order quantity for one type: a deterministic value within the band's
 * `ORDER_QTY_RANGE` (a conservative multiple-of-`MATCH_SIZE` range, never "the type's full
 * on-board count" — that was the "0/90"-style bug this replaces). Exported so `generator/
 * generate.ts` can call it BEFORE tile placement (board-content pass: Order quantities are now
 * decided first, then exactly that many tiles are placed — see generate.ts) as well as the
 * on-board-capped `pickRequiredQty` below (still used by the FTUE post-hoc path, where tiles
 * already exist and a cap is still meaningful).
 */
export function pickOrderQuantity(typeId: string, levelIndex: number, band: Tier): number {
  const { minQty, maxQty } = ORDER_QTY_RANGE[band];
  const steps = Math.max(1, (maxQty - minQty) / MATCH_SIZE + 1);
  const stepIndex = Math.floor(hash01(`${typeId}:${levelIndex}:qty`) * steps);
  return minQty + Math.min(stepIndex, steps - 1) * MATCH_SIZE;
}

/**
 * Picks `requiredQty` for one selected Order type FROM AN ALREADY-PLACED BOARD (the FTUE
 * post-hoc path only — see `deriveOrders` below): `pickOrderQuantity`'s desired value, capped so
 * it never exceeds `onBoardQty` (itself always already a MATCH_SIZE multiple — see `eligible`
 * below). Both are MATCH_SIZE multiples, so `Math.min` of the two is always a valid MATCH_SIZE
 * multiple too — no extra flooring needed.
 */
function pickRequiredQty(typeId: string, levelIndex: number, band: Tier, onBoardQty: number): number {
  return Math.min(pickOrderQuantity(typeId, levelIndex, band), onBoardQty);
}

/**
 * Derives a valid `Order[]` for a puzzle's `tiles`. Selects a deterministic subset of the
 * distinct types present (leaving the rest as pure distractors — see `orderCountForLevel` for
 * how many), each Order's `requiredQty` picked from a conservative band-keyed range (see
 * `pickRequiredQty`/`ORDER_QTY_RANGE`) rather than the type's full on-board count, always capped
 * to what's actually on the board. See `allTypesRequired` for the FTUE Level 1 zero-distractor
 * case, which also keeps that level's old "full on-board count" behavior (no distractors to
 * leave headroom for, so the whole-count choice is simplest and was already validated by
 * playtest — out of scope to touch).
 */
export function deriveOrders(tiles: readonly Tile[], opts: DeriveOrdersOptions): Order[] {
  const counts = onBoardCounts(tiles);
  const typeOrder = distinctTypesInOrder(tiles);

  // Every type's on-board count should already be a MATCH_SIZE multiple by
  // construction (the generator places whole triples) — floor defensively
  // and drop any type whose floored count is 0 rather than assume it.
  const eligible = typeOrder
    .map((typeId) => ({
      typeId,
      qty: Math.floor((counts.get(typeId) ?? 0) / MATCH_SIZE) * MATCH_SIZE,
    }))
    .filter((entry) => entry.qty > 0);

  if (eligible.length === 0) return [];

  if (opts.allTypesRequired) {
    return eligible.map((entry) => ({ itemTypeId: entry.typeId, requiredQty: entry.qty, collectedQty: 0 }));
  }

  // orderCountForLevel is pure over (levelIndex, band) only — clamp to the board's own
  // distinct-type ceiling here, at the one call site that has that context.
  const desired = orderCountForLevel(opts.levelIndex, opts.band);

  // Prefer leaving at least one distractor (never select every distinct type) — but this is a
  // soft heuristic, not a canonical rule (R-DISTRACTOR-VALID governs how a distractor match is
  // SCORED, not that one must always exist — see tier-a/REFERENCE_MATRIX.json). The level-based
  // Orders-count floor (`ORDER_COUNT_LEVEL_RANGES`) takes priority over it: only reserve a
  // distractor when the board has enough eligible types to do so AND still reach `desired`.
  // Otherwise use every eligible type. Even then, a level whose RNG-selected on-board type count
  // (TIER_CONFIG.minTypes/maxTypes, unchanged/out of scope this pass) falls below its own level's
  // Orders-count floor cannot reach that floor at all (an Order needs a distinct type; you can't
  // have more Orders than types) — a genuine, disclosed content-availability limit, not a logic
  // bug here. See build report.
  const withDistractorSelectable = eligible.length > 1 ? eligible.length - 1 : eligible.length;
  const maxSelectable = desired > withDistractorSelectable ? eligible.length : withDistractorSelectable;
  const count = Math.max(1, Math.min(desired, maxSelectable));

  // Deterministic circular window into `eligible`, offset by levelIndex —
  // varies which types get selected across levels without any RNG. Safe
  // against duplicates because `count <= eligible.length`.
  const start = opts.levelIndex % eligible.length;
  const selected: { typeId: string; qty: number }[] = [];
  for (let i = 0; i < count; i++) {
    selected.push(eligible[(start + i) % eligible.length]);
  }

  return selected.map((entry) => ({
    itemTypeId: entry.typeId,
    requiredQty: pickRequiredQty(entry.typeId, opts.levelIndex, opts.band, entry.qty),
    collectedQty: 0,
  }));
}
