/**
 * Content-pipeline record shapes. Not part of the rules/solver/generator
 * type contract (src/game/match-pile/rules/types.ts) — these are the
 * pipeline's own output shapes, written to
 * src/game/match-pile/data/levels-match-pile.json and
 * src/game/match-pile/data/ftueLevels.ts.
 */

import type { PileState, Tier } from "../../src/game/match-pile/rules";

/** How a level's puzzle came to exist. */
export type Provenance = "generated" | "handcrafted";

/** One playable level as it ships in the content pack. */
export interface LevelRecord {
  readonly id: string;
  readonly seed: number;
  readonly puzzle: PileState;
  readonly solution: readonly string[];
  readonly tier: Tier;
  readonly difficultyScore: number;
  readonly canonicalKey: string;
  readonly provenance: Provenance;
}

/** An FTUE level additionally prescribes the player's first input (U11). */
export interface FtueLevel extends LevelRecord {
  readonly prescribedInput: readonly string[];
}

/** A raw generator candidate, as written to content/seeds/match-pile.json. */
export interface SeedCandidate {
  readonly seed: number;
  readonly tier: Tier;
  readonly puzzle: PileState;
  readonly solution: readonly string[];
}
