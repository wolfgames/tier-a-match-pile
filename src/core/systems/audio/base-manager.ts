import type { AudioLoader } from '../assets/loaders/audio';
import { audioState } from './state';
import type { SoundDefinition } from './types';
import { getRandomSound } from './utils';

/**
 * Base Audio Manager
 *
 * Provides sound-effect and music playback using the scaffold AudioLoader
 * interface (aligned with the facade's `coordinator.audio`).
 *
 * Extend this class for game-specific audio management.
 *
 * @example
 * ```typescript
 * class MyGameAudioManager extends BaseAudioManager {
 *   playShoot(): void {
 *     this.playSound(SOUND_SHOOT);
 *   }
 * }
 * ```
 */
export abstract class BaseAudioManager {
  protected audioLoader: AudioLoader;
  protected currentMusicChannel: string | null = null;
  protected currentMusicId: number | null = null;

  constructor(audioLoader: AudioLoader) {
    this.audioLoader = audioLoader;
  }

  protected playSound(sound: SoundDefinition): void {
    this.audioLoader.play(sound.channel, sound.sprite, {
      volume: sound.volume,
    });
  }

  protected playRandomSound(sounds: readonly SoundDefinition[]): void {
    const sound = getRandomSound(sounds);
    this.playSound(sound);
  }

  startMusic(track: SoundDefinition): void {
    if (!audioState.musicEnabled()) return;

    this.stopMusic();
    const id = this.audioLoader.play(track.channel, track.sprite, {
      volume: track.volume ?? 0.6,
      loop: track.loop,
    });
    this.currentMusicChannel = track.channel;
    this.currentMusicId = id;
  }

  stopMusic(): void {
    if (this.currentMusicChannel !== null && this.currentMusicId !== null) {
      this.audioLoader.stop(this.currentMusicChannel, this.currentMusicId);
    }
    this.currentMusicChannel = null;
    this.currentMusicId = null;
  }

  isMusicPlaying(): boolean {
    return this.currentMusicId !== null;
  }
}
