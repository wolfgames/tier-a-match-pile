import type { GameTuningBase } from '~/core/systems/tuning/types';
import type { MotionPresetName } from '@wolfgames/components/modules/logic/motion-presets';

// ============================================
// GAME TUNING TYPES — Template
//
// Add your game-specific tuning interfaces here.
// Each section maps to a Tweakpane folder in dev mode.
// ============================================

export interface DevModeConfig {
  /** Skip the start screen and go directly into gameplay */
  skipStartScreen: boolean;
}

export interface GameScreensConfig {
  startBackgroundColor: string;
  loadingBackgroundColor: string;
}

export interface StartScreenConfig {
  /** Ambient motion preset for the title logo (SpriteLogoTitle). */
  logoMotion: MotionPresetName;
  /** Idle motion preset for the Play button (SpriteButton). */
  buttonMotion: MotionPresetName;
}

export interface GameTuning extends GameTuningBase {
  devMode: DevModeConfig;
  screens: GameScreensConfig;
  startScreen: StartScreenConfig;
}

// ============================================
// DEFAULT VALUES
// ============================================

export const GAME_DEFAULTS: GameTuning = {
  version: '1.0.0',
  devMode: {
    skipStartScreen: false,
  },
  screens: {
    startBackgroundColor: '#BCE083',
    loadingBackgroundColor: '#BCE083',
  },
  startScreen: {
    logoMotion:   'breathe', // scale pulse only — no tilt/sway
    buttonMotion: 'gentle',  // float + breathe
  },
};

// ============================================
// HELPERS
// ============================================

/** Parse theme from URL params — override in your game if needed */
export function getThemeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('theme') ?? null;
}
