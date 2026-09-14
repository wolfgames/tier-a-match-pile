# Core Index

Framework shell — providers, hooks, systems, dev tools. No deps on `modules/` or `game/`.

## Systems

| Intent | Path | Hook |
|--------|------|------|
| Asset loading, preloading, bundle coordination | systems/assets/coordinator.ts | `useAssets()` |
| Asset context provider | systems/assets/context.tsx | |
| Asset type definitions (Manifest, Bundle) | systems/assets/types.ts | |
| DOM asset loader (fonts, styles) | systems/assets/loaders/dom.ts | |
| Audio sprite loader | systems/assets/loaders/audio.ts | |
| GPU/Pixi texture loader | `@wolfgames/components/pixi` (re-exported via systems/assets/index.ts) | |
| Screen navigation, transitions | systems/screens/context.tsx | `useScreen()` |
| Screen manager logic | systems/screens/manager.ts | |
| Audio playback, state, volumes | systems/audio/context.tsx | `useAudio()` |
| BaseAudioManager (extend per game) | systems/audio/base-manager.ts | |
| Sound definitions & utils | systems/audio/types.ts, utils.ts | |
| Tuning / runtime config state | systems/tuning/context.tsx | `useTuning()` |
| Tuning loader (localStorage, deep merge) | systems/tuning/loader.ts | |
| Core tuning types & defaults | systems/tuning/types.ts | |
| Pause overlay, pause state, keyboard | systems/pause/context.tsx | `usePause()` |
| Error boundary, crash recovery | systems/errors/boundary.tsx | |
| Error reporter (Sentry) | systems/errors/reporter.ts | |
| VFX particle runtime | systems/vfx/particleRuntime.ts | |
| VFX types (ParticleConfig, SpawnerData) | systems/vfx/types.ts | |
| Asset manifest & game data context | systems/manifest/context.tsx | `useManifest()` |
| Player identity (stable player id singleton) | systems/identity/ (see its README.md) | `resolvePlayerId()`, `getResolvedPlayerId()` |

## Config

| Intent | Path |
|--------|------|
| Core config (engine type, debug) | config.ts |
| Environment detection (local/prod/CDN) | config/environment.ts |
| Viewport mode from URL params | config/viewport.ts |

## UI Components

| Intent | Path |
|--------|------|
| Button component | ui/Button.tsx |
| Progress bar (Pixi) | ui/ProgressBar.tsx |
| Loading spinner | ui/Spinner.tsx |
| Game logo | ui/Logo.tsx |
| Pause overlay | ui/PauseOverlay.tsx |
| Mobile viewport wrapper | ui/MobileViewport.tsx |

## Utils

| Intent | Path |
|--------|------|
| localStorage helpers (get/set/remove) | utils/storage.ts |
| Versioned store (createVersionedStore) | utils/storage.ts |
| Settings menu (gear, audio controls, placement) | `@wolfgames/components` → `prefabs/settings-menu-dom` (DOM) / `prefabs/settings-menu` (in-canvas) |

## Integrations

| Intent | Path |
|--------|------|
| PostHog analytics service | lib/analytics.ts |
| PostHog client setup | lib/posthog.ts |
| Sentry error tracking | lib/sentry.ts |
| Game kit integration | lib/gameKit.ts |

## Analytics

| Intent | Path |
|--------|------|
| Event schemas (session, game, audio, error) | analytics/events.ts |

## Dev Tools

| Intent | Path |
|--------|------|
| Tweakpane UI panel | dev/Tweakpane.tsx |
| Full tuning editor panel | dev/TuningPanel.tsx |
| Tuning ↔ pane bindings | dev/bindings.ts |
| Tuning registry (track tuned params) | dev/tuningRegistry.ts |
| GSAP easing picker | dev/EasingPicker.ts |
| Dev environment checks | dev/env.ts |

## Main Entry Point

`index.ts` — re-exports all public APIs (hooks, providers, components, types).
