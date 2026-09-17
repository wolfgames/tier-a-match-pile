/**
 * FTUE (first-time-user-experience) level construction. Exactly 3 levels,
 * each teaching one new rule id, per tier-a/REFERENCE_MATRIX.json and the
 * implementer brief:
 *
 *  - Level 1 (R-MATCH-SIZE / R-AUTOCLEAR, structurally unloseable): hand-built
 *    directly, NOT routed through the tiered generator. Only 2 distinct
 *    types, one triple each (6 tiles total), single layer, all exposed at
 *    once — zero stacking. With only 2 types the tray can hold at most 2
 *    incomplete copies of each before an auto-clear fires (2+2=4 <
 *    TRAY_SIZE=7), so no pick order can ever reach 'lost'.
 *  - Level 2 (R-EXPOSURE): `generate({seed, tier:'easy'})`, searched for a
 *    seed that keeps the same 2-type simplicity as level 1 but introduces a
 *    real 2-layer stack (occlusion) — the new thing being taught.
 *  - Level 3 (R-FAIL / normal tray risk): `generate({seed, tier:'easy'})`,
 *    searched for a seed with 3+ distinct types — the point where the tray
 *    can genuinely fill up and R-FAIL becomes a live possibility, unlike
 *    level 1's structurally-safe design.
 */

import { step, rate, type PileState } from "../../src/game/match-pile/rules";
import { generate } from "../../src/game/match-pile/generator";
import { validateLevel } from "./validate";
import { canonicalKey } from "./dedupe";
import type { FtueLevel } from "./types";

function distinctTypeCount(puzzle: PileState): number {
  return new Set(puzzle.tiles.map((tile) => tile.typeId)).size;
}

function maxLayer(puzzle: PileState): number {
  return puzzle.tiles.reduce((max, tile) => Math.max(max, tile.layer), 0);
}

/**
 * Applies `picks` via step() and asserts the walk never lands in 'lost'.
 * `solver/replay()`'s contract is a win-or-bust boolean over a *complete*
 * pick list, which doesn't fit checking a partial prefix — this is a
 * lighter, purpose-built check using the same step() function replay()
 * itself walks on.
 */
function assertNeverLostOverPrefix(puzzle: PileState, picks: readonly string[]): void {
  let state = puzzle;
  for (const pickId of picks) {
    state = step(state, pickId);
    if (state.phase === "lost") {
      throw new Error(
        `buildFtueLevels: prescribedInput [${picks.join(", ")}] reached 'lost' at pick "${pickId}"`
      );
    }
  }
}

function buildLevel1(): FtueLevel {
  const tiles = [
    { id: "ftue1-a0", typeId: "fries", col: 0, row: 0, layer: 0 },
    { id: "ftue1-a1", typeId: "fries", col: 1, row: 0, layer: 0 },
    { id: "ftue1-a2", typeId: "fries", col: 2, row: 0, layer: 0 },
    { id: "ftue1-b0", typeId: "soda-cup", col: 3, row: 0, layer: 0 },
    { id: "ftue1-b1", typeId: "soda-cup", col: 4, row: 0, layer: 0 },
    { id: "ftue1-b2", typeId: "soda-cup", col: 0, row: 1, layer: 0 },
  ];
  const puzzle: PileState = { tiles, tray: [], cleared: 0, phase: "playing" };
  const solution = tiles.map((tile) => tile.id);
  const prescribedInput = ["ftue1-a0", "ftue1-a1", "ftue1-a2"];

  assertNeverLostOverPrefix(puzzle, prescribedInput);

  const validation = validateLevel(puzzle);
  if (!validation.ok) {
    throw new Error(`buildFtueLevels: level 1 failed validation — ${validation.reason}`);
  }

  return {
    id: "ftue-1",
    seed: 0,
    puzzle,
    solution,
    tier: "easy",
    difficultyScore: rate(puzzle),
    canonicalKey: canonicalKey(puzzle),
    provenance: "handcrafted",
    prescribedInput,
  };
}

function buildGeneratedFtueLevel(
  id: string,
  criteria: (puzzle: PileState) => boolean,
  seedRange: number
): FtueLevel {
  for (let seed = 0; seed < seedRange; seed++) {
    const generated = generate({ seed, tier: "easy" });
    if (!generated) continue;
    if (!criteria(generated.puzzle)) continue;

    const validation = validateLevel(generated.puzzle);
    if (!validation.ok) continue;

    const prescribedInput = generated.solution.slice(0, 3);
    assertNeverLostOverPrefix(generated.puzzle, prescribedInput);

    return {
      id,
      seed,
      puzzle: generated.puzzle,
      solution: generated.solution,
      tier: "easy",
      difficultyScore: rate(generated.puzzle),
      canonicalKey: canonicalKey(generated.puzzle),
      provenance: "generated",
      prescribedInput,
    };
  }

  throw new Error(`buildFtueLevels: no seed in [0, ${seedRange}) satisfied criteria for ${id}`);
}

export function buildFtueLevels(): FtueLevel[] {
  const level1 = buildLevel1();

  // Level 2: same 2-type simplicity as level 1, but with real stacking.
  const level2 = buildGeneratedFtueLevel(
    "ftue-2",
    (puzzle) => distinctTypeCount(puzzle) === 2 && maxLayer(puzzle) >= 1,
    200
  );

  // Level 3: a 3rd+ distinct type, where the tray can genuinely fill up.
  const level3 = buildGeneratedFtueLevel(
    "ftue-3",
    (puzzle) => distinctTypeCount(puzzle) >= 3,
    200
  );

  return [level1, level2, level3];
}
