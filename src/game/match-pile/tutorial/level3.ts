// what_in: Level 3's own pristine (pre-padding) tiles (services/levels.ts#getFtueLevel(3)), or
//          the live `pile`'s remaining tile ids during play.
// what_out: pure helpers for Level 3's non-adjacent-match FTUE demo: which type is "A" (2
//           copies seeded straight into the tray, 1 reserved on the board as the guided target)
//           and which is "B" (1 copy seeded into the tray, cleaned up once the real match
//           resolves); seeding a fresh puzzle into the scripted `A | A | B` Slots Row state; and
//           the single reserved target tile id.
// why_here: tutorial/ — Level-3-specific FTUE logic, alongside steps.ts/emphasise.ts. Kept pure
//           (no ecs/Pixi imports) so ecs/transactions/loadLevel.ts, ecs/applyTap.ts and
//           screens/gameController.ts can all read it deterministically. The reserved target
//           (below) is Level 3's own `prescribedInput[0]` — a real Pixi exposure check turned
//           out to be unreliable here (a tile can pass the geometric-exposure threshold while
//           still being mostly visually covered by a padding tile at the same cell), whereas
//           `prescribedInput[0]` is already solver-validated as the first tappable pick from the
//           pristine board, and sits at a (col,row) services/levels.ts#padFtueDensity's
//           deterministic cell-cycling never reaches — guaranteed exposed by construction, no
//           runtime geometry needed.
import { getFtueLevel } from '../services/levels';
import { OBJECT_TYPE_POOL } from '../generator/objectTypes';
import type { PileState } from '../rules/types';

/** Level 3's own pristine (pre-padding) tiles give a stable, deterministic "A" (the first type,
 * with >= 3 copies — bbq-sauce-packet's 2 stacked triples). "B" must be a pure distractor type,
 * never one of Level 3's real Order types — every ORIGINAL type is an exact-count Order
 * (services/levels.ts's allTypesRequired), so permanently seeding away 1 copy of one of THOSE
 * without it ever completing would make that Order impossible to finish. Filler/distractor
 * types are added by services/levels.ts#padFtueDensity via this exact same "first
 * OBJECT_TYPE_POOL entry not already used" formula (never reuses an existing type) — replicated
 * here read-only rather than importing that private function, so this file's only dependency on
 * services/levels.ts stays the same accessor Level 1/2 already use. */
export function level3DemoTypes(): { aType: string; bType: string } | null {
  const level = getFtueLevel(3);
  if (!level) return null;
  const tiles = level.puzzle.tiles;
  const aType = tiles[0]?.typeId;
  if (!aType || tiles.filter((t) => t.typeId === aType).length < 3) return null;
  const usedTypes = new Set(tiles.map((t) => t.typeId));
  const bType = OBJECT_TYPE_POOL.find((t) => !usedTypes.has(t));
  if (!bType) return null;
  return { aType, bType };
}

/** The single tile id reserved as the demo's guided tap target — see the file header for why
 * this is `prescribedInput[0]` rather than a runtime exposure guess. Never seeded into the tray
 * (seedLevel3Demo below), so it's always the one real "A" tile left for the player to tap. */
function reservedTargetTileId(): string | null {
  return getFtueLevel(3)?.prescribedInput[0] ?? null;
}

/** Seeds a freshly-loaded Level 3 puzzle into the scripted `A | A | B` Slots Row state: pulls 2
 * of A's tiles (never the reserved target) + 1 B tile off the board straight into `tray` (never
 * through a real pick, so they count as neither a move nor Order progress). Returns the puzzle
 * untouched if Level 3's content doesn't have the shape this demo needs (defensive — content-
 * pipeline-guaranteed in practice). Pure: no Math.random()/Date.now(), a function of the
 * puzzle's own tiles only. */
export function seedLevel3Demo(puzzle: PileState): PileState {
  const types = level3DemoTypes();
  const targetId = reservedTargetTileId();
  if (!types || !targetId) return puzzle;
  const { aType, bType } = types;
  const seedableATiles = puzzle.tiles.filter((t) => t.typeId === aType && t.id !== targetId);
  const bTile = puzzle.tiles.find((t) => t.typeId === bType);
  if (seedableATiles.length < 2 || !bTile) return puzzle;
  const seededIds = new Set([seedableATiles[0].id, seedableATiles[1].id, bTile.id]);
  return {
    ...puzzle,
    tiles: puzzle.tiles.filter((t) => !seededIds.has(t.id)),
    tray: [aType, aType, bType],
  };
}

/** The tile id screens/gameController.ts should highlight — the reserved target, as long as
 * it's still on the board (true until the player's tap resolves the match). */
export function level3TargetTileId(remainingTileIds: readonly string[]): string | null {
  const id = reservedTargetTileId();
  return id && remainingTileIds.includes(id) ? id : null;
}

/** Whether `tileId` is Level 3's single reserved demo target — ecs/applyTap.ts's tap-gating
 * reads this so only the guided tile resolves; every other board tap is ignored. */
export function isLevel3Target(tileId: string): boolean {
  return tileId === reservedTargetTileId();
}
