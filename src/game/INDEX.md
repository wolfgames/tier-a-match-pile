# Game Index

Game-specific code. Can import from `core/` and `modules/`. Nothing outside `game/` should import from here.

## Structure

```
src/game/
  config.ts        # Identity, environment, fonts, screens, manifest, data types
  state.ts         # Runtime signals (score, health, level)
  index.ts         # Barrel export

  audio/           # GameAudioManager + sound definitions
  screens/         # Solid.js screen shells + hooks
  setup/           # Game tracking hook, analytics trackers, flag config
  tuning/          # Game tuning types + defaults

  mygame/          # Your game (Pixi engine, controllers, etc.)
```

## Infrastructure

| Intent | Path |
|--------|------|
| Identity, environment, fonts, screen wiring, manifest, data types | config.ts |
| Global game state signals | state.ts |
| Game tuning types + defaults | tuning/types.ts |
| Game tuning barrel + URL helpers | tuning/index.ts |
| Game tracking hook (wraps Core analytics) | setup/tracking.ts |
| Session lifecycle tracking (start/pause/resume/end) | setup/session-tracker.ts |
| Asset loading tracking (start/complete/abandon) | setup/loading-tracker.ts |
| Game feature flag config + types | setup/flags.ts |
| Player identity (via @wolfgames/client PlayerIdentityService) | setup/tracking.ts, setup/flags.ts |

## Screens (Solid.js shells)

| Intent | Path |
|--------|------|
| Loading screen | screens/LoadingScreen.tsx |
| Start / menu screen | screens/StartScreen.tsx |
| Main game screen | screens/GameScreen.tsx |
| Results / completion screen | screens/ResultsScreen.tsx |
| Completion overlay | screens/components/CompletionOverlay.tsx |
| useGameData hook | screens/useGameData.ts |
| useCompanionDialogue hook | screens/useCompanionDialogue.ts |

## Audio

| Intent | Path |
|--------|------|
| GameAudioManager (extends BaseAudioManager) | audio/manager.ts |
| Sound effect catalog | audio/sounds.ts |

## Game Logic (mygame/)

| Intent | Path |
|--------|------|
| Game controller (Pixi ↔ GameScreen bridge) | mygame/screens/gameController.ts |
| Start view (Pixi ↔ StartScreen bridge) | mygame/screens/startView.ts |
| Game engine classes | mygame/core/ |
| Animations | mygame/animations/ |
| Controllers | mygame/controllers/ |
| Systems | mygame/systems/ |
| UI components | mygame/ui/ |
| Static data | mygame/data/ |
| Types | mygame/types/ |
| Utilities | mygame/utils/ |
| Services | mygame/services/ |

## Where to put new files

- Game engine class (Pixi container, entity) → `mygame/core/`
- Game controller / orchestration → `mygame/controllers/`
- Game-specific Pixi UI → `mygame/ui/`
- Game state signals → `state.ts`
- Game tuning values → `tuning/`
- New Solid.js screen → `screens/`
- Reusable across games? → Don't put it here, use `modules/`.

## Asset Manifest — Bundle Prefix Rules

The bundle name prefix determines which loader handles the assets:

| Prefix | Loader | Use for |
|--------|--------|---------|
| `scene-*` | **GPU (Pixi)** | Game spritesheets, backgrounds, tiles, characters |
| `core-*` | **GPU (Pixi)** | In-game UI atlases |
| `theme-*` | DOM only | Branding/logo (loading screen, pre-GPU) |
| `audio-*` | Howler | Sound effects, music |
| `boot-*` | DOM only | Splash screen assets |

**Game atlases MUST use `scene-*` or `core-*`.** Only these prefixes are registered with Pixi. Using `theme-*` for game sprites will fail — `createSprite` returns null.

For single-asset bundles, the **bundle name IS the Pixi alias**:
```
{ name: 'scene-tiles', assets: ['atlas-tiles-mygame.json'] }
→ gpuLoader.createSprite('scene-tiles', 'bg-gameboard.png')
```

## Forking Checklist

1. `config.ts` — change identity (GAME_ID, GAME_SLUG, GAME_NAME), environment URLs, manifest bundles
2. `state.ts` — define your state shape
3. `tuning/` — set your tuning defaults
4. `setup/` — configure analytics, feature flags
5. `screens/` — customize screen shells
6. `audio/` — define your sounds
7. Rename `mygame/` to your game name, build your game there
