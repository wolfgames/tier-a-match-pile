/**
 * Reverse-construction puzzle generator (R-GEN-SOLVABLE, R-GEN-DETERMINISTIC).
 * Adapted from danhquach/mahjongsolitaire's pairs-based reverse construction
 * to triples + pure top-down cell coverage — see
 * tier-a/REFERENCE_MATRIX.json#R-GEN-SOLVABLE.
 *
 * Algorithm:
 *  1. Seed an RNG from opts.seed. Pick a tile count in range, rounded down
 *     to the nearest multiple of MATCH_SIZE (min MATCH_SIZE). k = tileCount/3
 *     triples.
 *  2. Pick a distinct-type count (clamped to k), select that many types from
 *     the pool without replacement, and build a length-k triple->typeId
 *     assignment (index 0 = first triple cleared, k-1 = last) by cycling the
 *     selected types for even usage, then shuffling the assignment order.
 *  3. Place triples in REVERSE clear order (k-1 down to 0): for each triple,
 *     pick 3 distinct (col,row) cells, and for each cell place a tile at the
 *     cell's current stack height, then bump that height. Because the
 *     first-cleared triple (index 0) is placed LAST, it always lands on top
 *     of whatever else shares its cells — guaranteeing all of triple 0's
 *     tiles are exposed at the puzzle's initial state.
 *  4. The recorded `solution` is the assignment's triples flattened in
 *     ascending (forward clear) order.
 *
 * Grid sizes are always well above 3 cells (see TIER_CONFIG), and every
 * triple draws 3 fresh distinct cells from the *entire* grid each time (no
 * shared "free positions pool" the way forward-laid-out Mahjong boards have)
 * — so this construction always succeeds for valid tier configs. The
 * nullable return type exists only for parity with the fixed
 * solvability.test.ts harness's defensive `if (g && ...)` check.
 */

import type { GenerateOptions, GeneratedPuzzle, Order, Tier, Tile } from "../rules/types";
import { MATCH_SIZE } from "../rules/types";
import { createRng } from "./seed";
import { OBJECT_TYPE_POOL, TIER_CONFIG, type TierConfig } from "./objectTypes";
import { orderCountForLevel, pickOrderQuantity } from "../rules/deriveOrders";
import { coverageTargetForLevel, tileCountForCoverageTarget, tileCountFloorForLevel } from "./coverageCurve";

/**
 * BOARD-CONTENT-MATCHES-ORDERS pass: Orders are now decided BEFORE any tile is placed, and
 * exactly `requiredQty` tiles of each Order type are placed — no more, no fewer, no hidden extra
 * copies (previously `deriveOrders` ran AFTER placement and picked a requiredQty <= whatever the
 * RNG-driven placement happened to produce for that type, which could be far less than the
 * on-board count, e.g. "6/90"). The remaining tile budget (this function's existing
 * `tileCountForOpts` target, which continues to respect the coverage ramp + level-based floor
 * exactly as before) is filled entirely with non-Order distractor types — at least 2 distinct
 * ones, always different from every Order type. If Order quantities alone would exceed the
 * target, the target is raised to fit them plus a minimum of distractors, per the build brief
 * ("if the target total tile count needs to move slightly upward... that is fine").
 */
function planOrders(
  levelIndex: number,
  band: Tier,
  rng: ReturnType<typeof createRng>,
  pool: string[],
): { orders: Order[]; orderTypes: ReadonlySet<string> } {
  const orderCount = Math.max(0, Math.min(orderCountForLevel(levelIndex, band), pool.length));
  const orders: Order[] = [];
  for (let i = 0; i < orderCount; i++) {
    const idx = rng.nextInt(pool.length);
    const typeId = pool.splice(idx, 1)[0];
    orders.push({ itemTypeId: typeId, requiredQty: pickOrderQuantity(typeId, levelIndex, band), collectedQty: 0 });
  }
  return { orders, orderTypes: new Set(orders.map((o) => o.itemTypeId)) };
}

/**
 * `generate()` only knows `opts.tier`, not a caller's absolute level index —
 * that context lives one layer up, in services/levels.ts#getLevel(), which
 * re-derives Orders against the real levelIndex for every level it returns
 * (overwriting whatever this function attaches). This tier→levelIndex proxy
 * exists only so a bare `generate({ seed, tier })` call (as used directly by
 * tests/tools, not just via getLevel()) still returns a self-consistent,
 * non-empty Orders set instead of `[]`. Approximate by design — a judgment
 * call, not a second source of truth for progression.
 */
const TIER_LEVEL_INDEX_PROXY: Record<Tier, number> = { easy: 1, medium: 10, hard: 20, veryHard: 30 };

/**
 * Tile count for one generated puzzle. Two paths:
 *  - No `levelIndex` (tests/tools calling `generate({ seed, tier })` directly): UNCHANGED —
 *    a flat RNG-driven pick within `config.minTiles`/`maxTiles`, exactly as before. This keeps
 *    every existing caller that doesn't pass `levelIndex` (solvability.test.ts's D3 sweep,
 *    coverage.test.ts's per-seed/per-band averages) bit-for-bit unaffected by the ramp below.
 *  - `levelIndex` provided (the real runtime path, via services/levels.ts#getLevel()): tile
 *    count is now ALSO a function of level index, not just band — generator/coverageCurve.ts's
 *    `coverageTargetForLevel(levelIndex)` gives a target board-area-coverage fraction, and
 *    `tileCountForCoverageTarget` converts that (band-specific tile-size geometry differs by
 *    `cols`/`rows`) into a calibrated tile count. Deterministic: a pure function of
 *    `{tier, levelIndex}`, no RNG involved in this step (RNG still drives which cells/types get
 *    used, just not how many tiles there are).
 *
 *    Safety cap: the combined count (see below) is clamped to `config.maxTiles` — the band's
 *    existing, already solvability-validated ceiling (see objectTypes.ts's own doc comment on
 *    the D3 solver-budget constraint that shaped these numbers) — so this can only ever ask for
 *    AS MANY tiles as the previously-tested range already allows, never more. For bands whose
 *    tile geometry can't reach the ramp's target coverage within that cap (see coverageCurve.ts's
 *    calibration-table comment), the realized ceiling lands a bit under the ramp's nominal target
 *    — still within the brief's 85-95% band (measured; see build report).
 *
 *    TILE-COUNT-FLOOR pass (tier-a-build-v4, Orders-count-curve pass): the coverage ramp used to
 *    be the ONLY density signal, which left early levels thin (low ramp progress -> few
 *    calibrated tiles) regardless of how far into the campaign they were. `tileCountFloorForLevel`
 *    (coverageCurve.ts) is a second, independent, level-index-driven MINIMUM — combined via
 *    `Math.max(calibrated, floor)` before the `maxTiles` cap above, so neither signal substitutes
 *    for the other: a level must satisfy both its coverage-ramp target AND its level-based floor.
 *
 *    Rounding note: the final tile count must always be a MATCH_SIZE (3) multiple (the generator
 *    only ever places whole triples), and every one of the build brief's literal floor values
 *    (55/65/80/100/130/160) happens to NOT be one. Rounding the combined value DOWN at the end
 *    (as the pre-existing flat-range path below already does) would silently undershoot a
 *    floor-bound level's stated minimum by 1-2 tiles (e.g. 65 -> 63) — so `floor` alone is rounded
 *    UP to the nearest MATCH_SIZE multiple before the `Math.max` with `calibrated`, guaranteeing a
 *    floor-bound level's realized tile count is never below the brief's literal floor value.
 */
function tileCountForOpts(opts: GenerateOptions, config: TierConfig, rng: ReturnType<typeof createRng>): number {
  if (opts.levelIndex !== undefined) {
    const target = coverageTargetForLevel(opts.levelIndex);
    const calibrated = tileCountForCoverageTarget(opts.tier, target);
    const floor = Math.ceil(tileCountFloorForLevel(opts.levelIndex) / 3) * 3;
    const combined = Math.max(calibrated, floor);
    const capped = Math.min(combined, config.maxTiles);
    return Math.max(3, Math.floor(capped / 3) * 3);
  }
  const tileCountRaw = config.minTiles + rng.nextInt(config.maxTiles - config.minTiles + 1);
  return Math.max(3, Math.floor(tileCountRaw / 3) * 3);
}

export function generate(opts: GenerateOptions): GeneratedPuzzle | null {
  const config = TIER_CONFIG[opts.tier];
  const rng = createRng(opts.seed);

  const tileCount = tileCountForOpts(opts, config, rng);

  // Prefer the caller's real levelIndex when given (more accurate than the tier proxy below) —
  // services/levels.ts#getLevel() re-derives per-level context anyway, so this only changes
  // direct generate() callers (tests/tools) that pass levelIndex themselves.
  const ordersLevelIndex = opts.levelIndex ?? TIER_LEVEL_INDEX_PROXY[opts.tier];

  // 1-2. Determine Orders and each Order's exact quantity, BEFORE any tile is placed.
  const pool = [...OBJECT_TYPE_POOL];
  const { orders, orderTypes } = planOrders(ordersLevelIndex, opts.tier, rng, pool);
  const orderTilesTotal = orders.reduce((sum, o) => sum + o.requiredQty, 0);

  // 4-6. Remaining population = non-Order distractor types. Target distinct type count comes from
  // the existing band-driven RNG pick (unchanged); distractor type count is whatever's left after
  // Orders, floored at 2 distinct distractor types (never fewer, always different from every
  // Order type — `pool` already excludes them).
  const distinctTypesRaw = config.minTypes + rng.nextInt(config.maxTypes - config.minTypes + 1);
  const desiredDistractorTypes = Math.max(2, distinctTypesRaw - orderTypes.size);
  const distractorTypeCount = Math.max(1, Math.min(desiredDistractorTypes, pool.length));
  const distractorTypes: string[] = [];
  for (let i = 0; i < distractorTypeCount; i++) {
    const idx = rng.nextInt(pool.length);
    distractorTypes.push(pool.splice(idx, 1)[0]);
  }

  // Distractor tile budget = whatever's left of the level's target tile count after Orders, but
  // never less than one triple per distractor type (every distractor type must be Match-3-able) —
  // raising the effective total above the nominal target when Orders + minimum distractors demand
  // it, per the build brief ("that is fine... respect the minimum tile floor rather than forcing
  // an invalid exact total").
  const minDistractorTiles = distractorTypes.length * MATCH_SIZE;
  const distractorTilesTotal = Math.max(minDistractorTiles, tileCount - orderTilesTotal);
  const distractorTripleCount = Math.ceil(distractorTilesTotal / MATCH_SIZE);

  // 3. Build the triple -> type assignment: exactly `requiredQty/3` triples per Order type (so the
  // board ends up with EXACTLY requiredQty copies — R-ORDER-DATA's own boardCount===requiredQty
  // rule), plus the distractor triples round-robined across distractor types (guarantees every
  // distractor type gets >= 1 triple as long as distractorTripleCount >= distractorTypes.length,
  // which minDistractorTiles above already guarantees).
  const assignment: string[] = [];
  for (const order of orders) {
    for (let i = 0; i < order.requiredQty / MATCH_SIZE; i++) assignment.push(order.itemTypeId);
  }
  for (let i = 0; i < distractorTripleCount; i++) {
    assignment.push(distractorTypes[i % distractorTypes.length]);
  }

  // Shuffle the triple -> type assignment ORDER only (Fisher-Yates) — this only changes which
  // triple clears first/last (the reverse-construction stacking order), never which types exist
  // or in what quantity, so the exact-match guarantee above is unaffected.
  for (let i = assignment.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = assignment[i];
    assignment[i] = assignment[j];
    assignment[j] = tmp;
  }
  const tripleCount = assignment.length;

  const stackHeights = new Map<string, number>();
  const tiles: Tile[] = [];
  const idsByTriple = new Map<number, string[]>();
  let globalIndex = 0;

  // Placement order = reverse of clear order.
  for (let tripleIndex = tripleCount - 1; tripleIndex >= 0; tripleIndex--) {
    const typeId = assignment[tripleIndex];
    const cellsUsed = new Set<string>();
    const idsForTriple: string[] = [];

    for (let copy = 0; copy < 3; copy++) {
      let col: number;
      let row: number;
      let cellKey: string;
      do {
        col = rng.nextInt(config.cols);
        row = rng.nextInt(config.rows);
        cellKey = `${col},${row}`;
      } while (cellsUsed.has(cellKey));
      cellsUsed.add(cellKey);

      const layer = stackHeights.get(cellKey) ?? 0;
      stackHeights.set(cellKey, layer + 1);

      const id = `t${globalIndex}`;
      globalIndex += 1;
      tiles.push({ id, typeId, col, row, layer });
      idsForTriple.push(id);
    }

    idsByTriple.set(tripleIndex, idsForTriple);
  }

  const solution: string[] = [];
  for (let tripleIndex = 0; tripleIndex < tripleCount; tripleIndex++) {
    const ids = idsByTriple.get(tripleIndex);
    if (ids) solution.push(...ids);
  }

  return {
    puzzle: { tiles, tray: [], cleared: 0, orders, phase: "playing" },
    solution,
    tier: opts.tier,
    seed: opts.seed,
  };
}
