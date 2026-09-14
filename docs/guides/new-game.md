# Creating a New Game

The Amino Template is designed to host different games. Here's how to create a new game or replace the existing one.

## Game Structure

```
src/game/
├── config.ts          # Screen mappings and initial screen
├── index.ts           # Main exports
├── manifest.ts        # Asset manifest
├── state.ts           # Game state signals
├── tuning/
│   ├── types.ts       # Game tuning types & defaults
│   └── index.ts       # Tuning exports
├── audio/
│   ├── sounds.ts      # SoundDefinition constants
│   ├── manager.ts     # GameAudioManager (extends BaseAudioManager)
│   └── index.ts       # Audio exports
├── screens/
│   ├── LoadingScreen.tsx
│   ├── StartScreen.tsx
│   ├── GameScreen.tsx
│   └── ResultsScreen.tsx
└── [gamename]/        # Game-specific logic
    ├── core/          # Game entities and systems
    ├── types/         # Type definitions
    └── data/          # Static data
```

> **Modules vs Game-Specific:** `@wolfgames/components` ships generic, reusable components that work across any game built on this template (buttons, progress bars, character sprites, dialogue boxes, completion controllers). Import them via `@wolfgames/components/modules/<category>/<name>`. They accept configuration through constructor params rather than importing game-specific constants. Game-specific code in `[gamename]/` creates thin wrappers that inject game config (atlas names, fonts, sprite mappings). Catalog: `node_modules/@wolfgames/components/src/modules/INDEX.md`.

## Step-by-Step Guide

### Step 1: Clear Game-Specific Code and Storage

Remove or rename the existing game folder:
```bash
rm -rf src/game/[oldgame]   # Or rename to keep as reference
```

Clear the old game's tuning from browser storage:
```javascript
// Run in browser console, or add to your setup
localStorage.removeItem('tuning_game');
```

> **Note**: Core tuning (`tuning_scaffold`) persists across games — your engine, audio, and debug preferences stay intact.

### Step 2: Create Game Tuning

Update `src/game/tuning/types.ts`:

```typescript
import type { GameTuningBase } from '~/core/systems/tuning/types';

export interface MyGameTuning extends GameTuningBase {
  // Define your game's tunable parameters
  board: {
    width: number;
    height: number;
  };
  gameplay: {
    speed: number;
  };
}

export const MY_GAME_DEFAULTS: MyGameTuning = {
  version: '1.0.0',
  board: { width: 10, height: 10 },
  gameplay: { speed: 1.0 },
};
```

### Step 3: Update Asset Manifest

Edit `src/game/asset-manifest.ts` with your bundles and paths. Follow the [manifest contract](../recipes/manifest-contract.md): use reserved bundle prefixes (`theme-`, `audio-`, `core-`, `scene-`, etc.), relative paths, and allowed extensions.

```typescript
// In src/game/asset-manifest.ts — keep GAME_SLUG / GAME_CDN_PATH in sync with config.ts
export const manifest: Manifest = {
  cdnBase: getCdnUrl(),
  localBase: LOCAL_ASSET_PATH,
  bundles: [
    { name: 'theme-branding', assets: ['atlas-branding-wolf.json'] },
    { name: 'audio-sfx', assets: ['sfx-mygame.json'] },
  ],
};
```

- **Asset naming:** Place files in `public/assets/` following the [naming convention](naming-convention.md). Run `bun run check:assets` to validate; use `bun run check:assets --suggest` for rename suggestions.
- **Manifest validation:** Run `bun run check:manifest` (optionally `--strict`) after changing bundles.
- **Machine-readable specs:** [naming-convention.schema.json](naming-convention.schema.json), [manifest.schema.json](../schemas/manifest.schema.json).

### Step 4: Create Your Screens

Update screens in `src/game/screens/`:
- `LoadingScreen.tsx` — Asset loading UI
- `StartScreen.tsx` — Main menu
- `GameScreen.tsx` — Core gameplay
- `ResultsScreen.tsx` — End game summary

### Step 5: Update Screen Config

Edit `src/game/config.ts`:

```typescript
import { lazy } from 'solid-js';
import { LoadingScreen } from './screens/LoadingScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import type { GameConfig } from './config';

export const gameConfig: GameConfig = {
  screens: {
    loading: LoadingScreen,
    start: lazy(() => import('./screens/StartScreen')),
    game: lazy(() => import('./screens/GameScreen')),
    results: ResultsScreen,
  },
  initialScreen: 'loading',
  defaultViewportMode: 'small', // 'small' (430px phone), 'large' (768px tablet), or 'none' (full desktop)
  serverStorageUrl: null,
};
```

### Step 6: Wire Tuning (Optional)

Register live-updating paths in `src/core/dev/tuningRegistry.ts`:

```typescript
const GAME_WIRED_PATHS = [
  'board.width',
  'board.height',
  'gameplay.speed',
];
```

## Core vs Game Code

### What Core Provides (Don't Recreate)

The core layer handles all the boilerplate so you can focus on game logic:

| System | What It Does | Location |
|--------|--------------|----------|
| **Asset Loading** | Loads atlases, audio sprites, images | `src/core/systems/assets/` |
| **Screen Management** | Screen transitions, routing | `src/core/systems/screens/` |
| **Audio System** | Howler.js wrapper, music/sfx control | `src/core/systems/audio/` |
| **Tuning Panel** | Live parameter editing (dev) | `src/core/systems/tuning/` |
| **Error Handling** | Global error boundary, Sentry | `src/core/systems/errors/` |
| **Pause System** | Pause/resume, visibility handling | `src/core/systems/pause/` |
| **UI Components** | Button, Spinner, ProgressBar, Logo | `src/core/ui/` |
| **MobileViewport** | 9:16 constraint for desktop testing | `src/core/ui/MobileViewport` |
| **Viewport Config** | Min width, touch targets, safe padding | `src/core/config/viewport.ts` |
| **Settings menu** | Gear + audio/options panel, both surfaces | `@wolfgames/components` → `prefabs/settings-menu-dom`, `prefabs/settings-menu` |
| **BaseAudioManager** | Audio manager base class to extend | `src/core/systems/audio/` |

### What You Create Per Game

| Item | Purpose | Location |
|------|---------|----------|
| **Game Logic** | Core gameplay, entities, systems | `src/game/[gamename]/` |
| **Module Wrappers** | Game-specific wrappers for module components | `src/game/[gamename]/` |
| **Screens** | Loading, Start, Game, Results UI | `src/game/screens/` |
| **Audio Manager** | Extends BaseAudioManager with game sounds | `src/game/audio/manager.ts` |
| **Sound Definitions** | SoundDefinition constants for each sound | `src/game/audio/sounds.ts` |
| **Asset Manifest** | List of atlases, audio, images to load | `src/game/asset-manifest.ts` |
| **Tuning Types** | Game-specific tunable parameters | `src/game/tuning/` |
| **Game State** | Signals for score, level, progress | `src/game/state.ts` |
| **Screen Config** | Screen mappings, initial screen, viewport default | `src/game/config.ts` |
| **Font** | Custom font file + @font-face CSS | `public/assets/` + `app.css` |

### Files to Update (Not Replace)

These template files need game-specific values:

| File | What to Change |
|------|----------------|
| `src/app.css` | Add `@font-face` for your game's font |
| `src/entry-server.tsx` | Update font preload `<link>` path |
| `src/entry-client.tsx` | Already waits for `document.fonts.ready` (no change needed) |
| `src/app.tsx` | Update tuning defaults import |

> **Font Loading**: The template preloads fonts in `entry-server.tsx` and waits for `document.fonts.ready` in `entry-client.tsx` to prevent FOUT (Flash of Unstyled Text) on the loading screen.

### Platform Constants (Core-Provided)

Viewport constraints are provided by the core layer — no need to recreate:

```typescript
// Already available from core:
import { VIEWPORT_MIN_WIDTH, SAFE_PADDING, MIN_TOUCH_TARGET } from '~/core/config/viewport';
```

### Recommended Constants

Define these per game:

```typescript
// src/game/config/fonts.ts
export const GAME_FONT_FAMILY = 'YourFont, system-ui, sans-serif';
```

### Using Shared Components

See the **[Shared Components Guide](shared-components.md)** for the full catalog, decision framework, and integration checklist.

`@wolfgames/components/modules/*` provides reusable Pixi components. Create game-specific wrappers that inject your config:

```typescript
// src/game/[gamename]/core/MyCharacter.ts
import { CharacterSprite } from '@wolfgames/components/modules/primitives/character-sprite';
import type { PixiLoader } from '~/core/systems/assets/loaders/gpu/pixi';

export class MyCharacter extends CharacterSprite<'hero' | 'villain'> {
  constructor(type: 'hero' | 'villain', gpuLoader: PixiLoader, scale = 1) {
    super(gpuLoader, {
      type,
      spriteMap: { hero: 'hero.png', villain: 'villain.png' },
      atlasName: 'my_sprites',
      baseSize: { width: 200, height: 200 },
    }, scale);
  }
}
```

## Tuning Storage

The tuning system stores core and game settings **separately**:

| localStorage Key | Contents | Persists |
|------------------|----------|----------|
| `tuning_scaffold` | Engine, audio, debug, performance (core) | Across all games |
| `tuning_game` | Your game's grid, difficulty, visuals | Per game (clear when switching) |

**Loading priority**: localStorage → `/public/config/tuning/*.json` → TypeScript defaults

## Audio Setup (Phased Approach)

Audio setup follows a two-phase approach since you won't have sound events until gameplay features exist.

### Phase 1: Early Skeleton (Project Setup)

Create the audio structure before you have sounds:

**1. Create `src/game/audio/sounds.ts`:**
```typescript
import type { SoundDefinition } from '~/core/systems/audio';
export type { SoundDefinition };

// Define sounds as you add them to the game
// Example structure (add real sounds later):
// export const SOUND_ACTION: SoundDefinition = {
//   channel: 'sfx-mygame',
//   sprite: 'action_sound',
//   volume: 0.7,
// };
```

**2. Create `src/game/audio/manager.ts`:**
```typescript
import type { AudioLoader } from '~/core/systems/assets/loaders/audio';
import { BaseAudioManager } from '~/core/systems/audio';

export class GameAudioManager extends BaseAudioManager {
  constructor(audioLoader: AudioLoader) {
    super(audioLoader);
  }

  // Add game-specific sound methods as features develop
  // playAction(): void {
  //   this.playSound(SOUND_ACTION);
  // }
}
```

**3. Create `src/game/audio/index.ts`:**
```typescript
export { GameAudioManager } from './manager';
export * from './sounds';
```

### Phase 2: Adding Sounds (As Features Develop)

As you implement game features, add sounds incrementally:

1. **Add sound definition** to `sounds.ts`
2. **Add play method** to `GameAudioManager`
3. **Call from gameplay code** where the event occurs

**Example - Adding a "score" sound:**
```typescript
// sounds.ts
export const SOUND_SCORE: SoundDefinition = {
  channel: 'sfx-mygame',
  sprite: 'score_ding',
  volume: 0.6,
};

// manager.ts
playScore(): void {
  this.playSound(SOUND_SCORE);
}

// In gameplay code
audioManager.playScore();
```

### BaseAudioManager Features

The core layer provides these methods via `BaseAudioManager`:

| Method | Purpose |
|--------|---------|
| `playSound(sound)` | Play a single sound effect |
| `playRandomSound(sounds)` | Play random from array (variations) |
| `startMusic(track, fadeIn?)` | Start music with optional fade |
| `stopMusic(fadeOut?)` | Stop music with optional fade |
| `isMusicPlaying()` | Check music state |

### Sound Variations

For sounds that play frequently, use arrays to prevent audio fatigue:

```typescript
export const SOUND_CLICK: readonly SoundDefinition[] = [
  { channel: 'sfx-mygame', sprite: 'click_1', volume: 0.5 },
  { channel: 'sfx-mygame', sprite: 'click_2', volume: 0.5 },
  { channel: 'sfx-mygame', sprite: 'click_3', volume: 0.5 },
] as const;

// In manager
playClick(): void {
  this.playRandomSound(SOUND_CLICK);
}
```

## Quick Setup Checklist

Use this checklist when starting a new game:

- [ ] Clear old game folder: `rm -rf src/game/[oldgame]/`
- [ ] Clear localStorage: `localStorage.removeItem('tuning_game')`
- [ ] Create `src/game/[newgame]/` folder structure
- [ ] Create `src/game/tuning/types.ts` with game defaults
- [ ] Create `src/game/asset-manifest.ts` with asset list (follow [manifest contract](../recipes/manifest-contract.md); run `bun run check:manifest` and `bun run check:assets`)
- [ ] Create `src/game/audio/sounds.ts` (empty skeleton)
- [ ] Create `src/game/audio/manager.ts` (extends BaseAudioManager)
- [ ] Create `src/game/audio/index.ts` (exports)
- [ ] Create `src/game/screens/` (Loading, Start, Game, Results)
- [ ] Update `src/game/config.ts` with screen mappings and `defaultViewportMode`
- [ ] Add font to `public/assets/` and update `src/app.css`
- [ ] Update font preload in `src/entry-server.tsx`
- [ ] Create `src/game/state.ts` for game signals
- [ ] Create game-specific wrappers in `[gamename]/` for shared components

## Tips

- **Tuning Panel**: Press backtick (`) to access live tuning
- **Core vs Game**: Cyan = core settings, Orange = your game settings
- **Hot Reload**: Most changes hot-reload, tuning changes apply instantly when wired
- **Assets**: Place in `public/` folder, reference in manifest
- **Team Defaults**: Create `public/config/tuning/game.json` for shared overrides
- **Viewport Mode**: Set `defaultViewportMode` in `config.ts` to control the desktop preview frame. Toggle at runtime via URL (`?viewport=large`), TweakPane dropdown, or the dev toggle button (top-left: S/L/∞). See [Viewport Mode](../standards/mobile.md)

See [Tuning Panel](../core/entry-points.md) for detailed setup guide including storage system.
