## 🎮 New Game

Guide for setting up a new game after forking this repo.

Constraints {
  - Read-only — do NOT make changes, only explain what needs to be done
  - Be specific — show file paths, expected values, code snippets
  - Reference generic examples rather than any specific game
}

Process {
  1. Print the setup checklist below
  2. Ask which game name/slug the user wants to use
  3. Walk through each section, showing exactly what to change
}

---

## Setup Checklist

### Step 1: Game Identity

Update `src/game/config.ts` — everything flows from here:

```
GAME_ID            → analytics event tag (e.g. "word_quest")
GAME_SLUG          → URL/storage key prefix (e.g. "wordquest")
GAME_NAME          → display name (e.g. "Word Quest")
GAME_CDN_PATH      → CDN path segment (auto-derived from GAME_SLUG)
GAME_STORAGE_PREFIX → localStorage prefix (auto-derived from GAME_SLUG)
```

Files that read from config.ts (no changes needed if imports are correct):
- `game/setup/tracking.ts` → GAME_ID, GAME_STORAGE_PREFIX
- `game/setup/flags.ts` → GAME_STORAGE_PREFIX
- `game/analytics/trackers.ts` → GAME_ID
- `game/analytics/index.ts` → reads via param set defaults

### Step 2: Game Config

Update `src/game/index.ts` — screens and initial screen:

```
gameConfig.screens       → map of screen name → component
gameConfig.initialScreen → which screen loads first
```

### Step 3: Tuning Defaults

Update `src/game/tuning/types.ts` and `src/game/tuning/index.ts`:
- Define your `GameTuning` interface (game-specific tunable values)
- Set `GAME_DEFAULTS` with sensible starting values
- Example: tile sizes, animation speeds, grid config

### Step 4: Audio

Replace `src/game/audio/`:
- `sounds.ts` → define your sound/music assets
- `manager.ts` → extend `BaseAudioManager` with game-specific methods

### Step 5: Asset Manifest

Update your asset bundles for the new game:
- Replace `public/assets/` with your game's sprites, fonts, images
- Follow the [manifest contract](../recipes/manifest-contract.md) and [asset naming convention](../guides/naming-convention.md)
- Run `bun run check:assets` and `bun run check:manifest` to validate
- Update manifest in `src/game/asset-manifest.ts` to match new asset names; keep font loading in `entry-client.tsx` — update font family/URL

### Step 6: Screens

Replace `src/game/screens/`:
- Keep the pattern: each screen is a Solid.js component
- Wire them into `gameConfig.screens` (Step 2)
- Screens access analytics via `useAnalytics()`, assets via `useAssets()`

### Step 7: Analytics — Trackers

Replace `src/game/analytics/trackers.ts`:
- Define your game-specific events (what matters for YOUR game)
- Use the same `createTracker` pattern with param sets
- Keep `base` param set, replace/remove `level_ctx` and `level_config` as needed

### Step 8: Analytics — Context

Update `src/game/analytics/index.ts`:
- Replace the game context with your game's session state
- Define your own param set schemas (location, config, etc.)
- Update `addParamsDefault` to read from your new context

### Step 9: Analytics — Provider

Update `src/game/setup/tracking.ts`:
- Replace existing tracker imports with your new trackers
- Update `AnalyticsContextValue` type with your tracker signatures
- Update `session_end` override to include your session rollup counters
- Update or remove survey logic if not needed

### Step 10: Feature Flags

Update `src/game/setup/flags.ts`:
- Replace `FeatureFlags` interface with your game's flags
- Update `DEFAULT_FLAGS` with your defaults
- Replace validators (`isDifficultyVariant`, etc.) with yours
- Update `processFlags` to read your flag names from PostHog
- Update `ph.register()` super properties

### Step 11: Game Logic

Replace `src/game/mygame/` with your game's core:
- This is 100% game-specific — no core layer dependencies here
- Your game mechanics, rendering, state machine, etc.

### Step 12: Clean Up

- Delete `src/game/mygame/` (placeholder game logic)
- Modules live upstream in `@wolfgames/components` — no local `src/modules/` to prune
- Delete placeholder level data from `public/levels/`
- Update `public/` assets (favicon, manifest.json, etc.)

---

## What You DON'T Touch

These core systems work as-is for any game:

```
src/core/systems/assets/     ← asset loading pipeline
src/core/systems/audio/      ← BaseAudioManager
src/core/systems/screens/    ← screen transitions
src/core/systems/pause/      ← pause state
src/core/systems/errors/     ← error boundary + reporter
src/core/systems/tuning/     ← dev tuning panel
src/core/systems/manifest/   ← manifest provider
src/core/lib/                ← gameKit, sentry, posthog bridge
src/core/config/             ← environment, viewport
src/core/ui/                 ← shared UI components
```

---

## localStorage Keys To Be Aware Of

These use `GAME_STORAGE_PREFIX` and will be unique per game:
- `{prefix}ff_{uid}` — feature flag cache
- `{prefix}survey_cd_{uid}` — survey cooldown
- `{prefix}progress` — game save data (if you use the progress system)
- `{prefix}has_played` — returning player flag
- `{prefix}tutorial-done` — tutorial completion flag
