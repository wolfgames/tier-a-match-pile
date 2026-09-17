// what_in: an FTUE level index (1..FTUE_LEVEL_COUNT).
// what_out: `stepsFor` (U10 grammar copy + the real node it names), `prescribedInput` (the
//           literal first action, spelled out in the copy), `applyPrescribed` (headless proof
//           level 1 can't be lost).
// why_here: ux-contract.md §U — FTUE is a step machine over real play, never a modal.
import { getFtueLevel } from '../services/levels';
import { step } from '../rules/step';
import type { Phase, Tile } from '../rules/types';
import { isLevel3Target } from './level3';

export interface Step {
  id: string;
  copy: string;
  /** Primary node label (a real `tile-<id>` or a chrome slot like `slot-orders`/`slot-timer`)
   * — resolved and emphasised by gameController.ts, never an overlay glyph (see
   * tutorial/emphasise.ts). */
  target: string;
  /** Timer must stay paused (`timerRunning: false`) while this step is live. */
  timerPaused?: boolean;
}

export type FtueGate = 'none' | 'step1' | 'awaitingFirstTap' | 'level3Demo';

/** The gate a freshly-loaded level should start in (ecs/transactions/loadLevel.ts). Level 1 has
 * a guided tile-selection phase, so it starts at 'step1'. Level 2 has no guided-tile phase (its
 * board is the normal populated/distractor board) — it starts straight at 'awaitingFirstTap',
 * just showing its Timer instruction until the player's own first tap. Level 3 seeds a scripted
 * `A | A | B` Slots Row state (tutorial/level3.ts) and starts at 'level3Demo'. */
export function initialFtueGate(levelIndex: number): FtueGate {
  if (levelIndex === 1) return 'step1';
  if (levelIndex === 2) return 'awaitingFirstTap';
  if (levelIndex === 3) return 'level3Demo';
  return 'none';
}

/** Level 1's two guided triples, in teaching order. It has no distractors (rules/
 * deriveOrders.ts's allTypesRequired) — its whole board is exactly its 2 Orders' 2 triples, so
 * "every other tile" is exactly the second triple. */
function guidedTriplesForLevel1(): readonly [string[], string[]] {
  const level = getFtueLevel(1);
  if (!level) return [[], []];
  const first = [...level.prescribedInput];
  const second = level.puzzle.tiles.map((t) => t.id).filter((id) => !first.includes(id));
  return [first, second];
}

/** Level 1 Step 1 teaches its two triples one at a time — the first stays the active/allowed
 * match until every one of its tiles is gone from the pile, then the second becomes active.
 * Both tap-gating (ecs/applyTap.ts) and highlighting (screens/gameController.ts) read this so
 * "what's allowed" and "what's highlighted" can never disagree. */
export function activeGuidedTileIdsForLevel1(remainingTileIds: readonly string[]): string[] {
  const [first, second] = guidedTriplesForLevel1();
  const firstStillOnBoard = first.some((id) => remainingTileIds.includes(id));
  return firstStillOnBoard ? first : second;
}

/** Whether a tap on `tileId` should resolve while `levelIndex` is at `gate` (ecs/applyTap.ts).
 * 'awaitingFirstTap' does NOT lock the board — there's no Continue button, so the board stays
 * playable and the player's own tap is what dismisses the instruction (ecs/applyTap.ts calls
 * clearFtueGate on it). 'step1' restricts taps to Level 1's currently-active guided triple;
 * 'level3Demo' restricts taps to Level 3's single reserved target tile
 * (tutorial/level3.ts#isLevel3Target). */
export function isTapAllowedDuringGate(
  levelIndex: number,
  gate: FtueGate,
  tileId: string,
  remainingTiles: readonly Tile[],
): boolean {
  if (gate === 'step1' && levelIndex === 1) {
    return activeGuidedTileIdsForLevel1(remainingTiles.map((t) => t.id)).includes(tileId);
  }
  if (gate === 'level3Demo' && levelIndex === 3) {
    return isLevel3Target(tileId);
  }
  return true;
}

/** Whether Level 1's guided Step 1 is fully played through — none of either triple's tiles
 * remain in the pile. Used by ecs/applyTap.ts to decide when Step 1 may advance to Step 2;
 * resolving only the first triple must NOT trigger this (it hands off to the second instead). */
export function isStep1CompleteForLevel1(remainingTileIds: readonly string[]): boolean {
  const [first, second] = guidedTriplesForLevel1();
  const guided = new Set([...first, ...second]);
  return remainingTileIds.every((id) => !guided.has(id));
}

const humanName = (typeId: string): string => typeId.replace(/-/g, ' ').toUpperCase();

function firstTile(levelIndex: number) {
  const level = getFtueLevel(levelIndex);
  if (!level) return null;
  const id = level.prescribedInput[0];
  return level.puzzle.tiles.find((t) => t.id === id) ?? null;
}

/** The literal first action, in the words the copy spells out (U11). */
export function prescribedInput(levelIndex: number): string | null {
  const tile = firstTile(levelIndex);
  return tile ? humanName(tile.typeId) : null;
}

/** Level 1: two Timer-paused instructions (docs/GAME-DESIGN.md#ftue) — teach tap-3-identical,
 * then teach Orders are the objective. The second is dismissed by the player's own next tap
 * (no Continue button). */
function stepsForLevel1(): Step[] {
  const level = getFtueLevel(1);
  if (!level) return [];
  const [first] = guidedTriplesForLevel1();
  return [
    {
      id: 'ftue-1-1',
      // Step 1's real highlight target is dynamic (screens/gameController.ts calls
      // activeGuidedTileIdsForLevel1 every repaint) — `target` here is just the initial tile.
      copy: 'Tap 3 identical items to collect them.',
      target: `tile-${first[0]}`,
      timerPaused: true,
    },
    {
      id: 'ftue-1-2',
      copy: 'Collect all goal items to finish the level.',
      target: 'slot-orders',
      timerPaused: true,
    },
  ];
}

/** Level 2: one Timer-paused instruction pointing at the Timer HUD — its board is the normal
 * populated/distractor board (no guided tile-selection phase), so there's nothing to teach here
 * except "Orders before Timer" (docs/GAME-DESIGN.md#ftue). Dismissed by the player's own first
 * tap (no Continue button). */
function stepsForLevel2(): Step[] {
  return [
    {
      id: 'ftue-2-1',
      copy: 'Collect all the goals before time is over!',
      target: 'slot-timer',
      timerPaused: true,
    },
  ];
}

/** Level 3: one Timer-paused instruction pointing at the Slots Row — its board is the normal
 * populated/distractor board, seeded (tutorial/level3.ts) into a scripted `A | A | B` Slots Row
 * state at load. Dismissed once the player's tap on the highlighted "A" completes the
 * non-adjacent match through normal resolution (no Continue button). */
function stepsForLevel3(): Step[] {
  return [
    {
      id: 'ftue-3-1',
      copy: "Items don't have to be in order to match.",
      target: 'slot-action',
      timerPaused: true,
    },
  ];
}

/** One instruction per FTUE level, live for the whole level — Levels 1/2/3 are implemented
 * above. Any level beyond that has no instruction (returns no steps). */
export function stepsFor(levelIndex: number): Step[] {
  if (levelIndex === 1) return stepsForLevel1();
  if (levelIndex === 2) return stepsForLevel2();
  if (levelIndex === 3) return stepsForLevel3();
  return [];
}

/** Headless proof: replaying level 1's exact prescribed picks never reaches a lost state. */
export function applyPrescribed(levelIndex: number): { phase: Phase } {
  const level = getFtueLevel(levelIndex);
  if (!level) return { phase: 'lost' };
  let state = level.puzzle;
  for (const id of level.prescribedInput) state = step(state, id);
  return { phase: state.phase };
}
