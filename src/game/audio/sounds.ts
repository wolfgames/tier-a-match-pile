/**
 * Sound Catalog — Template starter (unused)
 *
 * This scaffold pair (audio/manager.ts + audio/sounds.ts) has no current
 * importer — match-pile defines its own catalog at
 * `src/game/match-pile/audio/sounds.ts` and dispatches feedback via
 * `feedbackRegistry`/`feel.ts` instead. Left in place as the generic
 * GameAudioManager starting point for a future game; update or remove
 * alongside it.
 *
 * Bundle naming convention:
 *   audio-sfx-<game>  → sound effects
 *   audio-music-<game> → music tracks
 *
 * Add corresponding bundles to asset-manifest.ts.
 */

import type { SoundDefinition } from '~/core/systems/audio';

export type { SoundDefinition };

// Example: const SFX = 'audio-sfx-<game>';

export const SOUND_BUTTON_CLICK: SoundDefinition = {
  channel: 'audio-sfx-template',
  sprite: 'button_click',
  volume: 0.7,
};
