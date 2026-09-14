import type { FlagValidator } from './types';

function getStorageKey(prefix: string, userId: string): string {
  return `${prefix}${userId}`;
}

/**
 * Validate a raw parsed object against defaults and optional validators.
 * For each key in defaults:
 *   - If a custom validator exists and passes, use the raw value
 *   - If no validator, check typeof matches the default's type
 *   - Otherwise fall back to the default
 */
export function validateFlags<T extends object>(
  raw: Record<string, unknown>,
  defaults: T,
  validators?: Partial<Record<keyof T, FlagValidator>>,
): T {
  const result = { ...defaults } as Record<string, unknown>;
  const defs = defaults as Record<string, unknown>;

  for (const key of Object.keys(defaults)) {
    const rawValue = raw[key];
    const validator = validators?.[key as keyof T];

    if (validator) {
      if (validator(rawValue)) {
        result[key] = rawValue;
      }
    } else if (typeof rawValue === typeof defs[key]) {
      result[key] = rawValue;
    }
  }

  return result as T;
}

/**
 * Load cached flags from localStorage, validated against defaults.
 */
export function loadFlagCache<T extends object>(
  storagePrefix: string,
  userId: string,
  defaults: T,
  validators?: Partial<Record<keyof T, FlagValidator>>,
): T | null {
  try {
    const raw = localStorage.getItem(getStorageKey(storagePrefix, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validateFlags(parsed, defaults, validators);
  } catch {
    return null;
  }
}

/**
 * Save flags to localStorage.
 */
export function saveFlagCache<T extends object>(
  storagePrefix: string,
  userId: string,
  flags: T,
): void {
  try {
    localStorage.setItem(getStorageKey(storagePrefix, userId), JSON.stringify(flags));
  } catch {
    /* Ignore quota errors */
  }
}
