# Progress Persistence Guide

This guide explains how to implement player progress persistence. The scaffold provides reusable storage utilities, while each game defines its own progress data shape.

`createVersionedStore` is a **thin wrapper over the Wolf SDK `GameSaveService`**, backed by the player-identity singleton (`src/core/systems/identity/`). `GameSaveService` is **identity-aware localStorage — not a cloud save**: it persists on-device and stamps the save with whichever player id resolved. The wrapper's job is to keep a **sync** `{ load, save, clear, key }` surface over the SDK's async API, primed once at boot. If a cloud-backed `GameSaveService` ships later, games adopt it with **zero call-site edits** — only the wrapper's internals change.

> **Note:** This guide uses a puzzle game as a reference implementation. Many details are game-specific and will need to be adapted for your game:
> - **Data shape** - Your game may track different progress (scores, unlocks, inventory, etc.)
> - **Mid-level state** - The example saves tile rotations; your game might save different state (or none)
> - **Resume behavior** - Skipping the start screen may not be appropriate for all games
> - **Screen flow** - Your game may have different screens or navigation patterns
>
> Use this as a pattern to follow, not a copy-paste solution.

## Architecture Overview

```
scaffold/utils/storage.ts     <- createVersionedStore: GameSaveService wrapper + boot seam
scaffold/systems/identity/    <- player-identity singleton (resolves the id the save is keyed by)
scaffold/entry-client.tsx     <- boot seam: resolvePlayerId → whenStoresReady → render
game/services/progress.ts     <- Game-specific progress data & API
game/screens/LoadingScreen    <- Route based on saved progress
game/screens/GameScreen       <- Save/load tile state
app.tsx                       <- Wire up reset progress button
```

## How it works: one path + a boot seam

The sync `load()` / `save()` / `clear()` surface is served from an **in-memory cache**. That cache is primed once at boot, before the first render, so `load()` returns real persisted data by the time any screen reads it.

There is a **single persistence path** — always `GameSaveService`. The identity singleton only decides *which id* the save is stamped with; it does **not** switch storage backends, because the SDK persists to localStorage either way:

| Step | What happens |
|---|---|
| Prime | `await resolvePlayerId()`, construct `GameSaveService` keyed by `getResolvedIdentityService()` (a no-network stand-in bound to the resolved id — backend uuid when signed in, else the local id), `await service.load()` once, unwrap the envelope into the cache. |
| `save` | Cache write (sync) + `service.save()` write-through, fire-and-forget. |
| `clear` | Cache reset + `service.clear()` (sync). |

Using the no-network identity stand-in is deliberate: the real `PlayerIdentityService.identify()` calls the backend and **throws when offline**, which would break `load`/`save`. Since the save never leaves the device, the resolved id string is all `GameSaveService` needs. On the day a cloud-backed `GameSaveService` ships, swap the stand-in for the real `getPlayerIdentityService()` inside the wrapper — no call-site changes. Schema `migrations` are owned by the SDK (see below).

### The boot seam

Stores that gate the entry screen **must be constructed at module scope** so they register their prime promise before boot awaits it. Each `createVersionedStore` call pushes its prime promise into a module-level registry; `whenStoresReady()` awaits them all with `Promise.allSettled` (so one store's prime failure can't reject boot). `entry-client` awaits it after the id resolves, before render:

```typescript
// src/entry-client.tsx
await resolvePlayerId();   // budgeted; never hangs/rejects
await whenStoresReady();   // module-scope stores hydrate their caches
render();
```

## Step 1: Scaffold Storage Utilities

The scaffold provides low-level storage utilities in `src/core/utils/storage.ts`:

```typescript
// Basic get/set/remove — raw localStorage helpers, unchanged
export function getStored<T>(key: string, fallback: T): T;
export function setStored<T>(key: string, value: T): void;
export function removeStored(key: string): void;

// Versioned store (GameSaveService wrapper — sync surface over the SDK)
export function createVersionedStore<T extends { version: number }>(
  config: VersionedStoreConfig<T>
): VersionedStore<T>;

// Boot seam — entry-client awaits this once, after resolvePlayerId()
export function whenStoresReady(): Promise<unknown>;
```

### Versioned Store

Use `createVersionedStore` for complex data that may need migrations:

```typescript
interface VersionedStoreConfig<T> {
  key: string;           // storage key / SDK appId
  version: number;       // Current schema version
  defaults: T;           // Default values for new users
  // Optional migrations, target-keyed: migrations[v] turns a v-1 payload into v.
  migrations?: Record<number, (old: unknown) => Partial<T>>;
  validate?: (data: unknown) => boolean;  // Optional validation
}

interface VersionedStore<T> {
  load(): T;             // Sync fresh copy of the primed cache (real data after boot)
  save(data: T): void;   // Cache write + service.save() write-through
  clear(): void;         // Cache reset + service.clear()
  key: string;           // The storage key (for debugging)
}
```

> **Migrations are target-keyed.** `migrations[v]` receives a `v-1` payload and returns the fields to merge for version `v`. The wrapper re-keys these to the SDK's source-keyed convention (shifted down one) and hands them to `GameSaveService`, which runs the migration loop from the stored version up to the current one.

## Step 2: Define Game-Specific Progress Data

Create `src/game/services/progress.ts` with your game's progress structure.

> **Game-Specific:** The data shape below is for a chapter/level-based puzzle game. Your game might need completely different fields. Examples:
> - **Word game**: `currentPuzzle`, `hintsUsed`, `wordsFound[]`
> - **RPG**: `playerStats`, `inventory[]`, `questProgress{}`
> - **Endless runner**: `highScore`, `coinsCollected`, `unlockedCharacters[]`

```typescript
import { createVersionedStore } from '~/core/utils/storage';

// Define your progress data shape
export interface CurrentChapter {
  manifestUrl: string;
  chapterId: string;
  countyName: string;
  chapterLength: number;
  currentLevel: number;      // 1-based level number
  startedAt: number;
  tileRotations?: number[];  // Mid-level state (optional)
  levelSeed?: number;        // For reproducible levels
}

export interface CompletedChapter {
  chapterId: string;
  countyName: string;
  completedAt: number;
}

export interface ProgressData {
  version: number;
  current: CurrentChapter | null;
  completed: CompletedChapter[];
  lastPlayedAt: number;
}

// Default state for new players
const DEFAULT_PROGRESS: ProgressData = {
  version: 1,
  current: null,
  completed: [],
  lastPlayedAt: 0,
};

// Create the versioned store
export const progressStore = createVersionedStore<ProgressData>({
  key: 'mygame_progress',  // Unique key for your game
  version: 1,
  defaults: DEFAULT_PROGRESS,
  validate: (data) => {
    if (typeof data !== 'object' || data === null) return false;
    const d = data as Record<string, unknown>;
    if (d.current !== null && typeof d.current !== 'object') return false;
    if (!Array.isArray(d.completed)) return false;
    return true;
  },
});
```

## Step 3: Create Progress API Functions

Add helper functions for common operations:

```typescript
// Load/save
export function loadProgress(): ProgressData {
  return progressStore.load();
}

export function saveProgress(data: ProgressData): void {
  progressStore.save({
    ...data,
    lastPlayedAt: Date.now(),
  });
}

// Chapter management
export function startChapter(chapter: Omit<CurrentChapter, 'currentLevel' | 'startedAt'>): void {
  const progress = loadProgress();
  saveProgress({
    ...progress,
    current: {
      ...chapter,
      currentLevel: 1,
      startedAt: Date.now(),
    },
  });
}

export function advanceLevel(): number | null {
  const progress = loadProgress();
  if (!progress.current) return null;

  const newLevel = progress.current.currentLevel + 1;
  saveProgress({
    ...progress,
    current: {
      ...progress.current,
      currentLevel: newLevel,
    },
  });
  return newLevel;
}

export function completeChapter(): void {
  const progress = loadProgress();
  if (!progress.current) return;

  const completed: CompletedChapter = {
    chapterId: progress.current.chapterId,
    countyName: progress.current.countyName,
    completedAt: Date.now(),
  };

  saveProgress({
    ...progress,
    current: null,
    completed: [...progress.completed, completed],
  });
}

// Query functions
export function hasChapterInProgress(): boolean {
  return loadProgress().current !== null;
}

export function getCurrentChapter(): CurrentChapter | null {
  return loadProgress().current;
}

export function isChapterCompleted(chapterId: string): boolean {
  return loadProgress().completed.some((c) => c.chapterId === chapterId);
}

// Reset (for settings menu)
export function clearProgress(): void {
  progressStore.clear();
}
```

## Step 4: Mid-Level State (Tile Rotations)

> **Game-Specific:** This section is for games that need to save state within a level. The example saves tile rotation positions so players can resume exactly where they left off. Your game might:
> - **Not need this** - If levels are short or state doesn't matter
> - **Save different state** - Card positions, move history, partial answers
> - **Save on different triggers** - Every action, on pause, on level exit

For games that need to save state within a level:

```typescript
export function saveTileState(rotations: number[], seed?: number): void {
  const progress = loadProgress();
  if (!progress.current) return;

  saveProgress({
    ...progress,
    current: {
      ...progress.current,
      tileRotations: rotations,
      levelSeed: seed ?? progress.current.levelSeed,
    },
  });
}

export function getTileState(): { rotations: number[]; seed?: number } | null {
  const progress = loadProgress();
  if (!progress.current?.tileRotations) return null;

  return {
    rotations: progress.current.tileRotations,
    seed: progress.current.levelSeed,
  };
}

export function clearTileState(): void {
  const progress = loadProgress();
  if (!progress.current) return;

  const { tileRotations, levelSeed, ...rest } = progress.current;
  saveProgress({
    ...progress,
    current: rest as CurrentChapter,
  });
}
```

## Step 5: Integrate with LoadingScreen

> **Game-Specific:** The example skips the start screen entirely when resuming. This may not be right for your game:
> - You might want to always show the start screen but with a "Continue" button
> - You might want to show a "Welcome back!" message first
> - Some games need the start screen for daily challenges, news, etc.

Skip the start screen when there's saved progress:

```typescript
// src/game/screens/LoadingScreen.tsx
import { hasChapterInProgress } from '~/game/services/progress';

export function LoadingScreen() {
  const { goto } = useScreen();
  const { loadBoot, loadTheme, initGpu, unlockAudio, loadCore, loadAudio } = useAssets();

  onMount(async () => {
    // Load initial assets
    await loadBoot();
    await loadTheme();

    // Check for saved progress
    if (hasChapterInProgress()) {
      console.log('[LoadingScreen] Resuming saved progress');
      // Initialize assets that StartScreen normally loads
      unlockAudio();
      await initGpu();
      await loadCore();
      try {
        await loadAudio();
      } catch (error) {
        console.warn('Audio loading failed:', error);
      }
      await goto('game');  // Skip start screen
    } else {
      await goto('start');
    }
  });
}
```

## Step 6: Integrate with GameScreen

### On Mount: Load Saved State

```typescript
// src/game/screens/GameScreen.tsx
import { getCurrentChapter, getTileState, saveTileState, clearTileState, advanceLevel } from '~/game/services/progress';

onMount(async () => {
  // Check for saved progress
  const savedProgress = getCurrentChapter();
  const savedTileState = getTileState();

  // Generate chapter
  const chapter = generateChapter(config);

  // Determine which level to load
  let levelIndex = 0;
  if (savedProgress && savedProgress.currentLevel > 1) {
    levelIndex = Math.min(savedProgress.currentLevel - 1, chapter.length - 1);
    gameState.setCurrentLevel(savedProgress.currentLevel);
  }

  // Load the level
  game.loadLevel(chapter.levels[levelIndex]);

  // Apply saved tile rotations if resuming mid-level
  if (savedTileState?.rotations) {
    game.setTileRotations(savedTileState.rotations);
  }
});
```

### On Tile Rotate: Save State

```typescript
game.onGameEvent('tileRotated', () => {
  // Save tile state for mid-level resume
  const rotations = game.getTileRotations();
  saveTileState(rotations, currentLevel.seed);
});
```

### On Level Complete: Advance Progress

```typescript
game.onGameEvent('levelComplete', () => {
  // Clear tile state (level is done)
  clearTileState();

  // Advance to next level
  advanceLevel();

  // Update UI state
  gameState.incrementLevel();
});
```

## Step 7: Add Reset Progress Button

### Add a reset row to the settings menu

The menu is a catalog component — reset is just another item, so nothing in
`src/core/` is edited. The template's wrapper
(`src/game/screens/components/GameSettingsMenu.tsx`) shows the pattern:

```tsx
// src/game/screens/components/GameSettingsMenu.tsx
import { SettingsMenuDom } from '@wolfgames/components/modules/prefabs/settings-menu-dom';
import { clearProgress } from '~/game/services/progress';

const handleResetProgress = () => {
  clearProgress();
  window.location.reload();  // Reload to show start screen
};

<SettingsMenuDom
  items={[
    // ...audio rows...
    // Dev-only: keep it off production builds.
    ...(config.isProduction()
      ? []
      : [{ type: 'button' as const, label: 'Reset Progress', background: '#e03a2f', onClick: handleResetProgress }]),
  ]}
/>
```

In-canvas, the same item goes to `prefabs/settings-menu`, which takes the same
`items` array.

## Step 8: Game Entity Support

> **Game-Specific:** These methods are specific to tile-based puzzle gameplay. Your game entities will need different methods based on what state you're saving. The key pattern is:
> - A **getter** to extract saveable state from your game objects
> - A **setter** to restore state when loading (without triggering animations/sounds)

Add methods to your game entities for getting/setting state:

```typescript
// src/game/mygame/core/RoadTile.ts
export class RoadTile {
  /** Set rotation state directly (for loading saved progress) */
  setRotation(rotation: number): void {
    this._currentRotation = rotation % 4;
    this._visualRotation = this._currentRotation * 90;
    this.applyRotation();
  }
}

// src/game/mygame/core/MyGame.ts
export class MyGame {
  /** Get all tile rotations (for saving progress) */
  getTileRotations(): number[] {
    return this.roadTiles.map(tile => tile.currentRotation);
  }

  /** Set tile rotations (for loading saved progress) */
  setTileRotations(rotations: number[]): void {
    if (rotations.length !== this.roadTiles.length) {
      console.warn('Rotation count mismatch, ignoring saved state');
      return;
    }
    for (let i = 0; i < this.roadTiles.length; i++) {
      this.roadTiles[i].setRotation(rotations[i]);
    }
    this.updateConnectionVisuals();
  }
}
```

## Data Migration Example

When you need to change the progress data structure:

```typescript
export const progressStore = createVersionedStore<ProgressData>({
  key: 'mygame_progress',
  version: 2,  // Bump version
  defaults: DEFAULT_PROGRESS,
  validate: (data) => { /* ... */ },
  migrations: {
    // migrations[2] receives a v1 payload and returns the fields to merge for v2.
    2: (old) => {
      const d = old as ProgressData;
      return { newField: 'default value' };
    },
  },
});
```

Each migration returns a **partial** — only the changed/added fields. The wrapper re-keys the entries to the SDK's source-keyed convention and hands them to `GameSaveService`, which owns the migration loop + version stamping (a missing entry for a version just bumps the number, no field changes). Define a migration entry for every version that changes the payload shape.

## Debugging

Add console logs to trace progress operations:

```typescript
export function loadProgress(): ProgressData {
  const data = progressStore.load();
  console.log('[progress] loadProgress:', data);
  return data;
}

export function saveProgress(data: ProgressData): void {
  console.log('[progress] saveProgress:', data);
  progressStore.save(data);
}
```

Use URL params for testing:
- `?debugProgress=1` - Simulate returning player state

## What's Reusable vs Game-Specific

| Component | Reusable? | Notes |
|-----------|-----------|-------|
| `scaffold/utils/storage.ts` | Yes | Core storage utilities work for any game |
| `createVersionedStore()` | Yes | Versioned storage pattern is universal |
| A reset row on the settings menu | Yes | Reset button pattern works for any game |
| Progress data shape | No | Each game defines its own `ProgressData` |
| Mid-level state (tile rotations) | No | Specific to puzzle games with grid state; adapt for your game |
| Skip start screen logic | Maybe | Depends on your game's UX requirements |
| `getTileRotations()`/`setTileRotations()` | No | Your game needs its own state accessors |

## Checklist

- [ ] Create `game/services/progress.ts` with data types
- [ ] Create versioned store with validation
- [ ] Add API functions (start, advance, complete, clear)
- [ ] Add mid-level state functions if needed (saveTileState, etc.)
- [ ] Update LoadingScreen to check for progress and skip start
- [ ] Update GameScreen to load saved level and tile state
- [ ] Wire up save on tile rotate / game actions
- [ ] Wire up clear tile state on level complete
- [ ] Add a reset progress row to the settings menu (dev builds only)
- [ ] Test: Start game, rotate tiles, refresh - should resume
- [ ] Test: Complete level, refresh - should be on next level
- [ ] Test: Reset progress - should go back to start screen
