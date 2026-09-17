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

  match-pile/      # The game (ECS, board, rules, generator, solver, screens)
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

## Game Logic (match-pile/)

| Intent | Path |
|--------|------|
| Game controller (Pixi ↔ GameScreen bridge) | match-pile/screens/gameController.ts |
| Start view (Pixi ↔ StartScreen bridge) | match-pile/screens/startView.ts |
| ECS plugin, transactions, agent surface | match-pile/ecs/ |
| Pure rules engine (match/exposure/win-fail/scoring) | match-pile/rules/ |
| Level generator + difficulty curve | match-pile/generator/ |
| Solver (hint, solvability, replay) | match-pile/solver/ |
| Board rendering (layout, tiles, tray, chrome, hud) | match-pile/board/ |
| FTUE tutorial steps + emphasis | match-pile/tutorial/ |
| Celebration/feedback fx | match-pile/fx/ |
| Sound catalog | match-pile/audio/ |
| Level/content services | match-pile/services/ |
| Static + generated level data | match-pile/data/ |
| Brand tokens, palette, typography | match-pile/brand.tokens.json, palette.ts, typography.ts |

## Where to put new files

- New ECS transaction / resource → `match-pile/ecs/`
- New rule or scoring change → `match-pile/rules/`
- New board visual / renderer → `match-pile/board/`
- New generator or solver behavior → `match-pile/generator/`, `match-pile/solver/`
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
{ name: 'scene-tiles', assets: ['atlas-tiles-match-pile.json'] }
→ gpuLoader.createSprite('scene-tiles', 'bg-gameboard.png')
```

## Forking Checklist (completed for this project)

1. `config.ts` — change identity (GAME_ID, GAME_SLUG, GAME_NAME), environment URLs, manifest bundles
2. `state.ts` — define your state shape
3. `tuning/` — set your tuning defaults
4. `setup/` — configure analytics, feature flags
5. `screens/` — customize screen shells
6. `audio/` — define your sounds (see `match-pile/audio/sounds.ts`)
7. Game lives in `match-pile/` (the template's original starter game folder has been removed)
