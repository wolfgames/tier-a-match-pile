/**
 * Game Audio Manager — Template
 *
 * Extends BaseAudioManager with game-specific sound methods.
 * Add your playback methods here (e.g. playExplosion, playLevelComplete).
 *
 * Inherited from BaseAudioManager:
 * - playSound() / playRandomSound() — sound playback
 * - startMusic() / stopMusic() — music playback
 * - isMusicPlaying() — music state check
 */

import type { AudioLoader } from '~/core/systems/assets/loaders/audio';
import { BaseAudioManager } from '~/core/systems/audio';
import { SOUND_BUTTON_CLICK } from './sounds';

export class GameAudioManager extends BaseAudioManager {
  constructor(audioLoader: AudioLoader) {
    super(audioLoader);
  }

  playButtonClick(): void {
    this.playSound(SOUND_BUTTON_CLICK);
  }
}
