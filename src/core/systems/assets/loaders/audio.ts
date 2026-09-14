/**
 * Audio playback interface consumed by BaseAudioManager.
 *
 * Aligned with the scaffold facade's `audio` object so that
 * `coordinator.audio` satisfies this interface directly.
 *
 * Looping is applied by the facade via `PlayOptions.loop`; fades are handled by
 * BaseAudioManager, not the loader.
 */

export interface PlayOptions {
  volume?: number;
  /** Loop the sound. When unset, it plays once (Howler's default). */
  loop?: boolean;
}

export interface AudioLoader {
  /** Play a sound sprite. Returns the Howl sound ID (or -1 if channel not loaded). */
  play(channel: string, sprite?: string, opts?: PlayOptions): number;
  /** Stop a sound (all sounds on a channel, or a specific ID). */
  stop(channel: string, id?: number): void;
  /** Set the global master volume (0–1). */
  setMasterVolume(volume: number): void;
}
