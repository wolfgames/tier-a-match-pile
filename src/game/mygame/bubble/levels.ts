/**
 * levels — the difficulty ramp.
 *
 * Pure data: each level sets how many colours are in play, how long the incoming
 * chain is, and how fast it marches toward the door (design px / sec). Levels
 * start slow and widen the palette / lengthen the chain as they go. `seed` makes
 * each level's colour sequence deterministic (no Math.random in the sim).
 */

export interface LevelConfig {
  /** 1-based label for the HUD. */
  label: number;
  /** Number of distinct colours in play (prefix of the palette). */
  colors: number;
  /** How many balls make up the incoming chain. */
  chainLength: number;
  /** Chain march speed toward the door (design px / sec). */
  speed: number;
  /** Deterministic seed for this level's colour sequence + hopper. */
  seed: number;
}

export const LEVELS: readonly LevelConfig[] = [
  { label: 1, colors: 3, chainLength: 22, speed: 16, seed: 1337 },
  { label: 2, colors: 4, chainLength: 30, speed: 24, seed: 2551 },
  { label: 3, colors: 4, chainLength: 38, speed: 32, seed: 4243 },
  { label: 4, colors: 5, chainLength: 46, speed: 40, seed: 6151 },
  { label: 5, colors: 5, chainLength: 54, speed: 50, seed: 9973 },
];

export const LEVEL_COUNT = LEVELS.length;

/** The level config for an index, clamped into range. */
export function levelFor(index: number): LevelConfig {
  return LEVELS[Math.max(0, Math.min(LEVEL_COUNT - 1, index))];
}
