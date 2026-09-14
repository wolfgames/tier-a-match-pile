/**
 * Sound Catalog — Template
 *
 * Define your game's sound effects and music here.
 * Each SoundDefinition maps to a Howler sprite channel + sprite name.
 *
 * Bundle naming convention:
 *   audio-sfx-<game>  → sound effects
 *   audio-music-<game> → music tracks
 *
 * Add corresponding bundles to asset-manifest.ts.
 */

import type { SoundDefinition } from '~/core/systems/audio';

export type { SoundDefinition };

// Example: const SFX = 'audio-sfx-mygame';

export const SOUND_BUTTON_CLICK: SoundDefinition = {
  channel: 'audio-sfx-mygame',
  sprite: 'button_click',
  volume: 0.7,
};
