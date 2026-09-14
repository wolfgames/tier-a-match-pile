import { getOrCreateLocalPlayerId, getResolvedPlayerId } from '~/core';
import { registerFlagConfig } from '~/core/systems/feature-flags';

// ============================================================================
// GAME-SPECIFIC FLAG TYPES
// ============================================================================

export type DifficultyVariant = 'easy_start' | 'medium_start' | 'hard_start';
export type ClueDisplayTime = '2s' | '3s' | '5s';

export interface GameFeatureFlags {
  difficulty_curve_variant: DifficultyVariant;
  county_theming_enabled: boolean;
  clue_display_time: ClueDisplayTime;
  clue_overlay_enabled: boolean;
}

// ============================================================================
// DEFAULTS & VALIDATORS
// ============================================================================

export const DEFAULT_FLAGS: GameFeatureFlags = {
  difficulty_curve_variant: 'medium_start',
  county_theming_enabled: false,
  clue_display_time: '3s',
  clue_overlay_enabled: false,
};

function isDifficultyVariant(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    ['easy_start', 'medium_start', 'hard_start'].includes(value)
  );
}

function isClueDisplayTime(value: unknown): boolean {
  return typeof value === 'string' && ['2s', '3s', '5s'].includes(value);
}

const VALIDATORS: Partial<Record<keyof GameFeatureFlags, (v: unknown) => boolean>> = {
  difficulty_curve_variant: isDifficultyVariant,
  clue_display_time: isClueDisplayTime,
};

// ============================================================================
// REGISTRATION (runs at module load)
// storagePrefix is resolved by FeatureFlagProvider from GameConfigProvider
// ============================================================================

registerFlagConfig<GameFeatureFlags>({
  defaults: DEFAULT_FLAGS,
  validators: VALIDATORS,
  // Key the flag cache by the one resolved player id (shared with analytics and
  // the save envelope), not a separate `uid`. A getter, because this registers
  // at module load — before boot resolves the id; the provider evaluates it at
  // mount, post-resolution, so `getResolvedPlayerId()` is set by then. The
  // local-id fallback stays on the same `player_id` key for the rare case it is
  // read before resolution.
  userId: () => getResolvedPlayerId() ?? getOrCreateLocalPlayerId(),
});
