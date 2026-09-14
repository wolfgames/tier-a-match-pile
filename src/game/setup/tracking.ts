import type { BaseAnalyticsService } from '@wolfgames/components/core';
import { useAnalyticsService } from '@wolfgames/components/solid';
import {
  audioSettingChangedSchema,
  errorCapturedSchema,
  gameStartSchema,
  screenEnterSchema,
  screenExitSchema,
  startScreenSkippedSchema,
} from './events';

// ============================================================================
// GAME TRACKING HOOK
// ============================================================================

export interface GameTracking {
  trackGameStart: (params: typeof gameStartSchema.infer) => void;
  trackAudioSettingChanged: (
    params: typeof audioSettingChangedSchema.infer,
  ) => void;
  trackScreenView: (params: typeof screenEnterSchema.infer) => void;
  trackScreenExit: (params: typeof screenExitSchema.infer) => void;
  trackError: (params: typeof errorCapturedSchema.infer) => void;
  trackStartScreenSkipped: (
    params: typeof startScreenSkippedSchema.infer,
  ) => void;
  service: BaseAnalyticsService;
}

export function useGameTracking(): GameTracking {
  const service = useAnalyticsService();

  return {
    trackGameStart: service.createTracker(
      'game_start',
      gameStartSchema,
      ['base'],
      {},
    ),
    trackAudioSettingChanged: service.createTracker(
      'audio_setting_changed',
      audioSettingChangedSchema,
      ['base'],
      {},
    ),
    trackScreenView: service.createTracker(
      'screen_enter',
      screenEnterSchema,
      ['base'],
      {},
    ),
    trackScreenExit: service.createTracker(
      'screen_exit',
      screenExitSchema,
      ['base'],
      {},
    ),
    trackError: service.createTracker(
      'error_captured',
      errorCapturedSchema,
      ['base'],
      {},
    ),
    trackStartScreenSkipped: service.createTracker(
      'start_screen_skipped',
      startScreenSkippedSchema,
      ['base'],
      {},
    ),
    service,
  };
}
