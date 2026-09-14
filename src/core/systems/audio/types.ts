/**
 * Sound definition for audio sprites
 * Used by game audio managers to define playable sounds
 */
export interface SoundDefinition {
  /** Audio bundle/channel name (e.g., 'sfx-mygame') */
  channel: string;
  /** Sprite name within the audio JSON */
  sprite: string;
  /** Default volume 0-1 (optional, defaults to 1) */
  volume?: number;
  /** When unset, the track plays once; set true for a looping background/ambient bed. */
  loop?: boolean;
}
