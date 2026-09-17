// what_in: a 1-based level index.
// what_out: `getLevel(n)` — the only runtime path to level data (A8): FTUE (1..3) →
//           an infinite tail generated on demand.
// why_here: template-notes.md "runtime levels only via services/levels.ts".
//
// R-DIFFICULTY-BANDS/density correction: every post-FTUE level now flows through the
// band-aware generator (`generate()`) — the committed 30-level pack
// (`~/game/defaultGameData`, `data/levels-match-pile.json`) is intentionally no longer
// consumed here. That pack's content is static/pre-generated and its tile density never
// varied with band, which is why density wasn't visibly changing for early/mid levels
// during manual playtesting. The pack files themselves are NOT deleted (a future
// content-pipeline pass may revive or remove them) — this only stops the runtime from
// reading them, so they become intentional, disclosed cleanup debt.
import { generate } from '../generator/generate';
import { FTUE_LEVELS, type FtueLevel } from '../data/ftueLevels';
import type { PileState, Tier, Tile } from '../rules/types';
import { deriveOrders } from '../rules/deriveOrders';
import { bandForLevel } from './levelSequence';
import { OBJECT_TYPE_POOL } from '../generator/objectTypes';

export const FTUE_LEVEL_COUNT = FTUE_LEVELS.length;

export interface LevelData {
  levelIndex: number;
  puzzle: PileState;
  tier: Tier;
  solution: readonly string[];
}

/** Deterministic per-level seed for the infinite generated tail. */
export function seedFor(levelIndex: number): number {
  return (levelIndex * 1013904223) >>> 0;
}

/** The full hand-authored FTUE record (prescribedInput, canonicalKey, …) for levels 1..FTUE_LEVEL_COUNT. */
export function getFtueLevel(levelIndex: number): FtueLevel | null {
  return FTUE_LEVELS[levelIndex - 1] ?? null;
}

/**
 * Direct per-level minimum tile counts (manual playtest tuning) for FTUE Levels 2-3 only — their
 * hand-authored content (data/ftueLevels.json: 12 / 15 tiles) predates the density-progression
 * work and is far too sparse to begin the normal pile-density ramp. Level 3 target is intentionally
 * higher than Level 2's ("preferably slightly denser").
 */
const FTUE_MIN_TILE_COUNT: Readonly<Record<number, number>> = { 2: 30, 3: 35 };

/** Two extra distractor types (deterministic — first two of OBJECT_TYPE_POOL not already used by
 * the level's own hand-authored tiles), so padding stays a couple of real Match-3-able types
 * rather than one-triple-per-brand-new-type variety bloat. */
function fillerTypesFor(usedTypes: ReadonlySet<string>): string[] {
  return OBJECT_TYPE_POOL.filter((t) => !usedTypes.has(t)).slice(0, 2);
}

/**
 * Pads a puzzle's `tiles` up to `targetTileCount` with complete, matchable distractor triples —
 * used only for FTUE Levels 2-3 (see FTUE_MIN_TILE_COUNT). The level's own hand-authored tiles
 * (and every id the tutorial/FTUE hooks reference — data/ftueLevels.json is never edited) are
 * left completely untouched; padding tiles get fresh ids and are placed at the level's existing
 * (col,row) footprint, stacking on top of whatever is already there (tracked via `stackHeight` so
 * no (col,row,layer) collision with the original tiles is possible — R-EXPOSURE/isValid invariant).
 * Deterministic: no Math.random()/Date.now(), purely a function of the puzzle's own tiles.
 */
function padFtueDensity(puzzle: PileState, targetTileCount: number): PileState {
  const existing = puzzle.tiles;
  if (existing.length >= targetTileCount) return puzzle;

  const cols = Math.max(...existing.map((t) => t.col)) + 1;
  const rows = Math.max(...existing.map((t) => t.row)) + 1;
  const usedTypes = new Set(existing.map((t) => t.typeId));
  const fillerTypes = fillerTypesFor(usedTypes);

  const stackHeight = new Map<string, number>();
  for (const t of existing) {
    const key = `${t.col},${t.row}`;
    stackHeight.set(key, Math.max(stackHeight.get(key) ?? 0, t.layer + 1));
  }

  const needed = targetTileCount - existing.length;
  const tripleCount = Math.ceil(needed / 3);
  const padded: Tile[] = [];
  for (let t = 0; t < tripleCount; t++) {
    const typeId = fillerTypes[t % fillerTypes.length];
    for (let k = 0; k < 3; k++) {
      const cellIndex = (t * 3 + k) % (cols * rows);
      const col = cellIndex % cols;
      const row = Math.floor(cellIndex / cols);
      const key = `${col},${row}`;
      const layer = stackHeight.get(key) ?? 0;
      stackHeight.set(key, layer + 1);
      padded.push({ id: `ftue-pad-${t}-${k}`, typeId, col, row, layer });
    }
  }

  return { ...puzzle, tiles: [...existing, ...padded] };
}

/**
 * FTUE/pack content was authored before Orders existed (their stored puzzles
 * carry no `orders`), and even the generator's own output only carries a
 * tier-approximated Order set (see generate.ts's TIER_LEVEL_INDEX_PROXY
 * comment) — so every puzzle is re-derived here against its real levelIndex
 * and effective difficulty band, the context only this call site has, before
 * it ever reaches a player. FTUE Level 1 is the sole zero-distractor
 * exception (R-DISTRACTOR-VALID's counterpart): every distinct type it
 * contains becomes an Order.
 */
function attachOrders(puzzle: PileState, levelIndex: number, band: Tier): PileState {
  return {
    ...puzzle,
    orders: deriveOrders(puzzle.tiles, { levelIndex, band, allTypesRequired: levelIndex === 1 }),
  };
}

/**
 * getLevel() is the single place every non-FTUE level's *effective* difficulty band is decided
 * (services/levelSequence.ts#bandForLevel) and applied uniformly to Orders count/quantities
 * and (via ecs/timerConfig.ts#timerBudgetForLevel, called separately by loadLevel — NOT band
 * derived) Timer budget. Every post-FTUE level now flows through the band-aware generator, so
 * tile density genuinely scales with band for every level, not just a "generated tail". The
 * returned `tier` always reflects this effective band, so downstream code (Orders tuning, any
 * UI showing tier) stays consistent with the sequence.
 */
export function getLevel(levelIndex: number): LevelData {
  if (levelIndex <= FTUE_LEVEL_COUNT) {
    const l = FTUE_LEVELS[levelIndex - 1];
    const minTiles = FTUE_MIN_TILE_COUNT[levelIndex];
    if (minTiles) {
      // BOARD-CONTENT-MATCHES-ORDERS, extended to FTUE Levels 2-3: every ORIGINAL hand-authored
      // type becomes an Order at EXACTLY its original count (allTypesRequired — the same
      // mechanism Level 1 already uses), not a band-range-picked quantity that could fall short
      // of the true count (deriveOrders' normal path can legitimately pick e.g. 3 when a type
      // actually has 6 on the board — a real mismatch, caught by testing before landing this).
      // padFtueDensity always adds brand-new distractor types (never more copies of an existing
      // type), so those original per-type counts are fixed and never touched by padding, and the
      // 2 padding filler types are guaranteed to stay pure distractors.
      const orders = deriveOrders(l.puzzle.tiles, { levelIndex, band: l.tier, allTypesRequired: true });
      const puzzle = { ...padFtueDensity(l.puzzle, minTiles), orders };
      return { levelIndex, puzzle, tier: l.tier, solution: l.solution };
    }
    return { levelIndex, puzzle: attachOrders(l.puzzle, levelIndex, l.tier), tier: l.tier, solution: l.solution };
  }
  // BOARD-CONTENT-MATCHES-ORDERS pass: generate() now decides Orders BEFORE placing tiles and
  // places EXACTLY each Order's requiredQty (generator/generate.ts#planOrders) — its returned
  // puzzle.orders is already correct and must NOT be overwritten by attachOrders' post-hoc
  // re-derivation (which would re-pick quantities from whatever the board happens to contain,
  // undoing the exact-match guarantee). attachOrders is now FTUE-only (above).
  const band = bandForLevel(levelIndex);
  const seed = seedFor(levelIndex);
  const generated = generate({ seed, tier: band, levelIndex });
  if (!generated) {
    // Degenerate seed (astronomically unlikely per generate()'s own contract) — retry once.
    const fallback = generate({ seed: seed + 1, tier: band, levelIndex });
    if (!fallback) throw new Error(`getLevel(${levelIndex}): generator failed twice`);
    return { levelIndex, puzzle: fallback.puzzle, tier: band, solution: fallback.solution };
  }
  return { levelIndex, puzzle: generated.puzzle, tier: band, solution: generated.solution };
}
