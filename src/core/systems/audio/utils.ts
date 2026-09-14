import type { SoundDefinition } from './types';

/**
 * Get a random sound from an array of sound definitions
 * Useful for sound variations to prevent audio fatigue
 */
export function getRandomSound(sounds: readonly SoundDefinition[]): SoundDefinition {
  return sounds[Math.floor(Math.random() * sounds.length)];
}
