// what_in: a 1-based level index.
// what_out: `BAND_SEQUENCE` (the exported, tunable difficulty-band cycle) and
//           `bandForLevel()` — a pure function mapping any post-FTUE level index to its
//           effective difficulty band.
// why_here: R-DIFFICULTY-BANDS / R-RELIEF-LEVEL (tier-a/REFERENCE_MATRIX.json) — this is the
//           actual progression engine driving Timer budget, Orders count, and (for the
//           generated tail) tile density. Deterministic: pure function of levelIndex only, no
//           RNG/clock. Lives alongside services/levels.ts but as its own module so it can be
//           imported (and unit-tested) without pulling in the committed level pack.
import { FTUE_LEVELS } from '../data/ftueLevels';
import type { Tier } from '../rules/types';

/**
 * How many levels are hand-authored FTUE (1..FTUE_LEVEL_COUNT). Computed from the same source
 * data services/levels.ts uses for its own FTUE_LEVEL_COUNT — both derive from
 * `FTUE_LEVELS.length`, so there's no drift risk between the two independently-exported
 * constants.
 */
export const FTUE_LEVEL_COUNT = FTUE_LEVELS.length;

/**
 * R-DIFFICULTY-BANDS / R-RELIEF-LEVEL: the difficulty-band cycle applied to every level after
 * FTUE. This is the corrected sequence — the source brief's own example ("Hard -> Very Hard"
 * back-to-back) violated its own explicit rule ("after every Hard or Very Hard, the next level
 * must be Easy"); this sequence fixes that while preserving gradual escalation, all four bands
 * present, and strict relief after Hard/Very Hard (including at the wrap-around from the last
 * entry back to the first — see progression.test.ts for the direct assertion).
 *
 * Index 0 = the first level after FTUE (i.e. levelIndex === FTUE_LEVEL_COUNT + 1). Cycles via
 * modulo thereafter. Retune here, not inline in getLevel()/generate() callers.
 */
export const BAND_SEQUENCE: readonly Tier[] = [
  'easy',
  'easy',
  'medium',
  'medium',
  'hard',
  'easy',
  'medium',
  'hard',
  'easy',
  'medium',
  'veryHard',
  'easy',
];

/**
 * Maps a level index (1-based, strictly after FTUE) to its effective difficulty band. Pure
 * function of `levelIndex` only — deterministic, no RNG/clock, safe to call from generator.ts,
 * services/levels.ts, and tests alike.
 *
 * Callers must not call this for FTUE indices (1..FTUE_LEVEL_COUNT) — FTUE levels keep their
 * own hand-authored `tier` field untouched by the band sequence.
 */
export function bandForLevel(levelIndex: number): Tier {
  const offset = levelIndex - FTUE_LEVEL_COUNT - 1;
  const index = ((offset % BAND_SEQUENCE.length) + BAND_SEQUENCE.length) % BAND_SEQUENCE.length;
  return BAND_SEQUENCE[index];
}
