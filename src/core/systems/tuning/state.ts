import { createSignal, createRoot, batch } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import type { ScaffoldTuning, GameTuningBase, TuningState, TuningSource } from './types';
import { SCAFFOLD_DEFAULTS } from './types';
import {
  loadScaffoldTuning,
  loadGameTuning,
  STORAGE_KEYS,
  saveToStorage,
  clearTuningStorage,
} from './loader';

/**
 * Set a nested path in an object using produce (for stores)
 */
function setStorePath<T extends object>(
  setStore: (fn: (state: T) => void) => void,
  path: string,
  value: unknown
): void {
  const keys = path.split('.');
  setStore(
    produce((state: T) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let current: any = state;
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
    })
  );
}

/**
 * Create a tuning state instance
 */
export function createTuningState<
  S extends ScaffoldTuning = ScaffoldTuning,
  G extends GameTuningBase = GameTuningBase
>(scaffoldDefaults: S, gameDefaults: G): TuningState<S, G> {
  // Use stores for fine-grained reactivity - only the specific path that changes
  // will trigger effects that access that path
  const [scaffoldStore, setScaffoldStore] = createStore<S>(structuredClone(scaffoldDefaults));
  const [gameStore, setGameStore] = createStore<G>(structuredClone(gameDefaults));
  const [isLoaded, setIsLoaded] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [source, setSource] = createSignal<{ scaffold: TuningSource; game: TuningSource }>({
    scaffold: 'local',
    game: 'local',
  });

  // Store original defaults for reset
  const originalScaffold = scaffoldDefaults;
  const originalGame = gameDefaults;

  const load = async (): Promise<void> => {
    try {
      const [scaffoldResult, gameResult] = await Promise.all([
        loadScaffoldTuning(),
        loadGameTuning(gameDefaults),
      ]);

      batch(() => {
        // Use reconcile to efficiently update stores with loaded data
        setScaffoldStore(reconcile(scaffoldResult.data as S));
        setGameStore(reconcile(gameResult.data as G));
        setSource({
          scaffold: scaffoldResult.source,
          game: gameResult.source,
        });
        setIsLoaded(true);
        setLoadError(null);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Tuning] Load failed:', message);
      setLoadError(message);
      // Still mark as loaded, using defaults
      setIsLoaded(true);
    }
  };

  const setScaffoldPath = (path: string, value: unknown): void => {
    setStorePath(setScaffoldStore, path, value);
  };

  const setGamePath = (path: string, value: unknown): void => {
    setStorePath(setGameStore, path, value);
  };

  const reset = (): void => {
    batch(() => {
      setScaffoldStore(reconcile(structuredClone(originalScaffold)));
      setGameStore(reconcile(structuredClone(originalGame)));
      clearTuningStorage();
    });
  };

  /**
   * Get the default value for a specific path
   */
  const getDefaultValue = (path: string, isScaffold: boolean): unknown => {
    const keys = path.split('.');
    const defaults = isScaffold ? originalScaffold : originalGame;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = defaults;
    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  };

  /**
   * Reset a specific path to its default value
   */
  const resetPath = (path: string, isScaffold: boolean): void => {
    const defaultValue = getDefaultValue(path, isScaffold);
    if (defaultValue !== undefined) {
      if (isScaffold) {
        setScaffoldPath(path, defaultValue);
      } else {
        setGamePath(path, defaultValue);
      }
    }
  };

  const save = (): void => {
    // Stores are directly accessible as objects (unwrapped for serialization)
    saveToStorage(STORAGE_KEYS.SCAFFOLD, JSON.parse(JSON.stringify(scaffoldStore)));
    saveToStorage(STORAGE_KEYS.GAME, JSON.parse(JSON.stringify(gameStore)));
  };

  const exportJson = (): string => {
    return JSON.stringify(
      {
        scaffold: scaffoldStore,
        game: gameStore,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  };

  const importJson = (json: string): boolean => {
    try {
      const data = JSON.parse(json);
      batch(() => {
        if (data.scaffold) setScaffoldStore(reconcile(data.scaffold));
        if (data.game) setGameStore(reconcile(data.game));
      });
      return true;
    } catch (error) {
      console.error('[Tuning] Import failed:', error);
      return false;
    }
  };

  /**
   * Apply overrides to game tuning without saving to localStorage.
   * Used for URL params that should take effect but not persist.
   */
  const applyGameOverrides = (overrides: Record<string, unknown>): void => {
    for (const [path, value] of Object.entries(overrides)) {
      setStorePath(setGameStore, path, value);
    }
  };

  return {
    // Stores are accessed directly (not as functions) for fine-grained reactivity
    // Accessing tuning.game.grid.tileSize will only trigger effects when that value changes
    scaffold: scaffoldStore,
    game: gameStore,
    isLoaded,
    loadError,
    source,
    scaffoldDefaults: originalScaffold,
    gameDefaults: originalGame,
    setScaffoldPath,
    setGamePath,
    applyGameOverrides,
    load,
    save,
    reset,
    resetPath,
    exportJson,
    importJson,
  };
}

// Default singleton for scaffold-only usage (without game tuning)
export const scaffoldTuningState = createRoot(() =>
  createTuningState(SCAFFOLD_DEFAULTS, { version: '1.0.0' } as GameTuningBase)
);
