# Audio Setup Guide

How to add and manage audio in games built on this scaffold.

## Overview

The audio system uses:
- **Howler.js** - Audio playback engine
- **Audio Sprites** - Multiple sounds packed into single files
- **Dual Format** - WebM + MP3 for browser compatibility

## Audio Sprite Format

Audio sprites pack multiple sounds into a single audio file with a JSON manifest.

### JSON Structure

```json
{
  "urls": [
    "sfx-mygame.webm",
    "sfx-mygame.mp3"
  ],
  "sprite": {
    "button_click": [0, 508],
    "tile_rotate_1": [7120, 100],
    "level_complete": [11578, 480]
  }
}
```

**IMPORTANT:** The key must be `"urls"` (not `"src"`). The Howler loader resolves
each URL relative to cdnBase. Using `"src"` will cause a runtime error.

Each sprite entry: `"name": [start_ms, duration_ms]`

### Creating Audio Sprites

1. **Generate the source clips** via the wolf-game-kit MCP: `generate_sfx`
   for sound effects, `generate_music` for music, `generate_tts` for dialog.
   Then pack them with the `sfx-audio-sprite` / `dialog-audio-sprite` process
   templates, which output a Howler-compatible sprite (audio files + JSON
   sprite map with `urls[]`). Full workflow:
   [asset-pipeline.md](asset-pipeline.md).

   For hand-made clips (WAV or high-quality MP3), pack manually with the
   audiosprite tool — no global npm install, use bunx:
   ```bash
   bunx audiosprite -o sfx-mygame -f howler2 *.wav
   ```

2. **Export both formats**:
   - WebM (smaller, better quality)
   - MP3 (fallback for Safari)

3. **Stage and publish** — audio sprites are game media, published from
   `assets/src/`, not committed to `public/assets/`. The sprite JSON stays at
   the top level (its `urls[]` refs rewrite relative to the manifest base —
   NOT under `json-data/`):
   ```
   assets/src/
   ├── sfx-mygame.json
   ├── sfx-mygame.webm
   └── sfx-mygame.mp3
   ```
   Then `bun run assets:publish` (rewrites the JSON's `urls[]` to the hashed
   media names, verifies, writes the lockfile) and register the bundle in the
   manifest with `src: 'sfx-mygame.json'`. (Local fallback for rapid
   iteration: see [asset-pipeline.md](asset-pipeline.md).)

## Sound Definitions

Define sounds using the scaffold's `SoundDefinition` type for type safety and easy management.

### Create Sound Catalog

```typescript
// src/game/audio/sounds.ts
import type { SoundDefinition } from '~/core/systems/audio';
export type { SoundDefinition };

// UI Sounds
export const SOUND_BUTTON_CLICK: SoundDefinition = {
  channel: 'sfx-mygame',
  sprite: 'button_click',
  volume: 0.7,
};

// Gameplay Sounds (with variations to prevent fatigue)
export const SOUND_TILE_ROTATE: readonly SoundDefinition[] = [
  { channel: 'sfx-mygame', sprite: 'tile_rotate_1', volume: 0.5 },
  { channel: 'sfx-mygame', sprite: 'tile_rotate_2', volume: 0.5 },
  { channel: 'sfx-mygame', sprite: 'tile_rotate_3', volume: 0.5 },
] as const;

// Music Tracks
export const MUSIC_TRACKS: readonly SoundDefinition[] = [
  { channel: 'sfx-mygame', sprite: 'music_track_1' },
  { channel: 'sfx-mygame', sprite: 'music_track_2' },
] as const;
```

## Game Audio Manager

Extend `BaseAudioManager` from scaffold to create your game's audio manager.

```typescript
// src/game/audio/manager.ts
import type { AudioLoader } from '~/core/systems/assets/loaders/audio';
import { BaseAudioManager } from '~/core/systems/audio';
import {
  SOUND_BUTTON_CLICK,
  SOUND_TILE_ROTATE,
  SOUND_LEVEL_COMPLETE,
  MUSIC_TRACKS,
} from './sounds';

export class GameAudioManager extends BaseAudioManager {
  private currentMusicIndex = 0;

  constructor(audioLoader: AudioLoader) {
    super(audioLoader);
  }

  // Single sound
  playButtonClick(): void {
    this.playSound(SOUND_BUTTON_CLICK);
  }

  // Random from variations (prevents audio fatigue)
  playTileRotate(): void {
    this.playRandomSound(SOUND_TILE_ROTATE);
  }

  // Simple sound
  playLevelComplete(): void {
    this.playSound(SOUND_LEVEL_COMPLETE);
  }

  // Game-specific music control with track rotation
  startGameMusic(): void {
    const track = MUSIC_TRACKS[this.currentMusicIndex];
    this.startMusic(track);  // Inherited from BaseAudioManager
  }

  nextTrack(): void {
    this.stopMusic();  // Inherited from BaseAudioManager
    this.currentMusicIndex = (this.currentMusicIndex + 1) % MUSIC_TRACKS.length;
    this.startGameMusic();
  }
}
```

### BaseAudioManager Methods

The scaffold provides these methods via `BaseAudioManager`:

| Method | Purpose |
|--------|---------|
| `playSound(sound)` | Play a single SoundDefinition |
| `playRandomSound(sounds)` | Play random from array (variations) |
| `startMusic(track)` | Start a music track; loops when the track's `SoundDefinition` sets `loop: true`, otherwise plays once |
| `stopMusic()` | Stop the current music track |
| `isMusicPlaying()` | Check if music is currently playing |

## Register Audio Bundle

```typescript
// src/game/asset-manifest.ts
export const manifest: Manifest = {
  bundles: [
    // Audio bundles use 'audio-' prefix
    { name: 'audio-sfx-mygame', assets: ['sfx-mygame.json'] },
  ],
};
```

## Using Audio in Screens

```typescript
// src/game/screens/GameScreen.tsx

export function GameScreen() {
  const { coordinator } = useAssets();
  const [audioManager, setAudioManager] = createSignal<GameAudioManager | null>(null);

  onMount(async () => {
    // Create audio manager
    const manager = new GameAudioManager(coordinator.audio);
    setAudioManager(manager);

    // Wire up game events
    game.onGameEvent('tileRotated', () => {
      manager.playTileRotate();
    });

    game.onGameEvent('levelComplete', () => {
      manager.playLevelComplete();
    });
  });
}
```

## Mobile Audio Unlock

Mobile browsers require user interaction before playing audio. The scaffold handles this automatically:

```typescript
// In your start screen
const handleStart = async () => {
  unlockAudio();  // From useAssets() - call on first user tap
  await loadCore();
  // Audio is now unlocked
};
```

## Reactive Audio Controls

The scaffold provides reactive audio state:

```typescript
import { audioState } from '~/core/systems/audio';

// React to music toggle
createEffect(() => {
  const manager = audioManager();
  if (!manager) return;

  if (audioState.musicEnabled()) {
    manager.startGameMusic(); // Game-specific method
  } else {
    manager.stopMusic();
  }
});

// React to volume changes
createEffect(() => {
  const volume = audio.volume();
  coordinator.audio.setMasterVolume(volume);
});
```

## Best Practices

1. **Use audio sprites** - Reduces HTTP requests, improves loading
2. **Provide variations** - 3-5 variations for frequent sounds prevents fatigue
3. **Respect user settings** - Always check `audioState.musicEnabled()`
4. **Loop background music** - Set `loop: true` on the track's `SoundDefinition`; `startMusic()` honors it (omit for one-shot cues)
5. **Set appropriate volumes** - Music ~0.5-0.6, SFX ~0.5-0.8
6. **Test on mobile** - Ensure unlock flow works on iOS Safari

## Troubleshooting

### "Audio not playing"
- Check `unlockAudio()` was called on user interaction
- Verify bundle loaded: check console for errors
- Test in Chrome DevTools with autoplay policy disabled

### "Music cuts out"
- Check if screen transition is stopping music
- Verify music state persists across screens

### "Audio delayed on mobile"
- Use shorter sprites for responsive sounds
- Preload audio bundles before gameplay
