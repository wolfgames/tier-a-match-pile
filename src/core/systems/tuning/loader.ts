import type { ScaffoldTuning, GameTuningBase, TuningLoadResult, TuningSource } from './types';
import { SCAFFOLD_DEFAULTS } from './types';

// Paths to JSON config files
const PATHS = {
  core: '/config/tuning/core.json',
  game: '/config/tuning/game.json',
} as const;

// localStorage keys
export const STORAGE_KEYS = {
  SCAFFOLD: 'tuning_scaffold',
  GAME: 'tuning_game',
} as const;

/**
 * Deep merge utility - merges source into target, filling missing keys
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null
    ) {
      result[key] = deepMerge(targetValue as object, sourceValue as object) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Get data from localStorage
 */
function getFromStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Save data to localStorage
 */
export function saveToStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
    console.warn(`[Tuning] Failed to save to localStorage: ${key}`);
  }
}

/**
 * Load tuning configuration with fallback chain:
 * 1. localStorage (fastest, user's saved preferences)
 * 2. Fetch from /public/config/
 * 3. Built-in defaults
 */
export async function loadTuning<T extends object>(
  path: string,
  storageKey: string,
  defaults: T
): Promise<TuningLoadResult<T>> {
  // 1. Check localStorage first (fastest, preserves user changes)
  const cached = getFromStorage<T>(storageKey);
  if (cached) {
    return { data: deepMerge(defaults, cached), source: 'localStorage' };
  }

  // 2. Try fetching from /public/config/
  try {
    const response = await fetch(path);
    if (response.ok) {
      const data = await response.json();
      return { data: deepMerge(defaults, data), source: 'local' };
    }
  } catch (error) {
    console.warn(`[Tuning] Failed to fetch ${path}, using defaults:`, error);
  }

  // 3. Use built-in defaults
  return { data: defaults, source: 'local' };
}

/**
 * Load scaffold tuning configuration
 */
export async function loadScaffoldTuning(): Promise<TuningLoadResult<ScaffoldTuning>> {
  return loadTuning<ScaffoldTuning>(PATHS.core, STORAGE_KEYS.SCAFFOLD, SCAFFOLD_DEFAULTS);
}

/**
 * Load game tuning configuration
 */
export async function loadGameTuning<G extends GameTuningBase>(
  defaults: G
): Promise<TuningLoadResult<G>> {
  return loadTuning<G>(PATHS.game, STORAGE_KEYS.GAME, defaults);
}

/**
 * Clear all tuning from localStorage
 */
export function clearTuningStorage(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.SCAFFOLD);
  localStorage.removeItem(STORAGE_KEYS.GAME);
}
