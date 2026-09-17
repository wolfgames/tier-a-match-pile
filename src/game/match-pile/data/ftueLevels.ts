// what_in: nothing.
// what_out: `FTUE_LEVELS`, typed — the data itself lives in the sibling `ftueLevels.json`
//           (GENERATED FILE — do not hand-edit; produced by content/scripts/build-pack.ts from
//           content/library/selectFtue.ts#buildFtueLevels()) so this loader stays well under
//           the 150-line architecture gate regardless of pack size.
import ftueLevelsData from './ftueLevels.json';
import type { PileState, Tier } from '../rules';

export interface FtueLevel {
  readonly id: string;
  readonly seed: number;
  readonly puzzle: PileState;
  readonly solution: readonly string[];
  readonly tier: Tier;
  readonly difficultyScore: number;
  readonly canonicalKey: string;
  readonly provenance: 'generated' | 'handcrafted';
  readonly prescribedInput: readonly string[];
}

export const FTUE_LEVELS: FtueLevel[] = ftueLevelsData as FtueLevel[];
