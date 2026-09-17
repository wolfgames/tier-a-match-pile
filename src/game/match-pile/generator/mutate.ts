/**
 * Content-pipeline utility (no rule id of its own): a small seeded variation
 * of an existing puzzle for dedupe/diversity. Relabels which concrete
 * typeIds are used for each triple-group via a random permutation of the
 * distinct types present — this is a consistent bijection over typeIds, so
 * the covering/layer structure (and therefore solvability) is untouched.
 */

import type { PileState, Tile } from "../rules/types";
import { createRng } from "./seed";

export function mutate(puzzle: PileState, seed: number): PileState {
  const rng = createRng(seed);
  const distinctTypes = Array.from(new Set(puzzle.tiles.map((tile) => tile.typeId)));

  const shuffled = [...distinctTypes];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  const relabel = new Map<string, string>();
  distinctTypes.forEach((typeId, index) => {
    relabel.set(typeId, shuffled[index]);
  });

  const tiles: Tile[] = puzzle.tiles.map((tile) => ({
    ...tile,
    typeId: relabel.get(tile.typeId) ?? tile.typeId,
  }));

  const tray = puzzle.tray.map((typeId) => relabel.get(typeId) ?? typeId);

  return { ...puzzle, tiles, tray };
}
