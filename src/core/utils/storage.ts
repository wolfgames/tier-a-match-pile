/**
 * Storage utilities for persisting game data.
 *
 * `getStored`/`setStored`/`removeStored` are safe localStorage helpers with SSR
 * support and error handling. `createVersionedStore` is a thin wrapper over the
 * Wolf SDK `GameSaveService`. It keeps a sync `{ load, save, clear, key }` 
 * surface over the SDK's async API.
 */

import { GameSaveService } from '@wolfgames/client';
import type { BaseGameData, StorageConfig, StorageEnvelope } from '@wolfgames/client';
import { getResolvedIdentityService, resolvePlayerId } from '../systems/identity';

/**
 * Get a value from localStorage with a fallback.
 * Handles SSR (no window), parse errors, and missing keys.
 */
export function getStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored !== null ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Set a value in localStorage.
 * Handles SSR and quota exceeded errors silently.
 */
export function setStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

/**
 * Remove a key from localStorage.
 */
export function removeStored(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore errors
  }
}

/**
 * Configuration for a versioned store.
 */
export interface VersionedStoreConfig<T> {
  /**
   * SDK `appId` prefix (not a raw localStorage key). The Wolf SDK stores the
   * payload in an envelope under `` `${key}_save_data` ``, not under `key`
   * itself — a raw payload under the bare `key` is adopted once on first load
   * (see {@link createVersionedStore}).
   */
  key: string;
  /** Current schema version */
  version: number;
  /** Default value when no data exists or data is invalid */
  defaults: T;
  /**
   * Optional migration functions keyed by version number.
   * Called when stored version < current version.
   * Each function receives the old data and returns migrated data.
   */
  migrations?: Record<number, (old: unknown) => Partial<T>>;
  /**
   * Optional validation function.
   * Return false if data is invalid and should reset to defaults.
   */
  validate?: (data: unknown) => boolean;
}

/**
 * A versioned store with load, save, and clear operations.
 */
export interface VersionedStore<T> {
  /** Load data from storage, applying migrations if needed */
  load: () => T;
  /** Save data to storage */
  save: (data: T) => void;
  /** Clear stored data */
  clear: () => void;
  /** Get the storage key (for debugging) */
  key: string;
}

// ── Boot-time registry: the whole public seam boot awaits ────────────────────
const priming: Promise<unknown>[] = [];
/** entry-client awaits this once, after resolvePlayerId(), before render(). */
export const whenStoresReady = (): Promise<unknown> => Promise.allSettled(priming);

/**
 * Create a versioned store for persisting typed data.
 *
 * Thin wrapper over the Wolf SDK `GameSaveService`. The SDK treats `key` as an
 * `appId` prefix and stores the payload in an envelope under
 * `` `${key}_save_data` ``. A raw payload found under the bare `key` is adopted
 * into the envelope once on first load, so a fork keeps existing player saves.
 */
export function createVersionedStore<T extends { version: number }>(
  config: VersionedStoreConfig<T>
): VersionedStore<T> {
  const { key, version, defaults, migrations, validate } = config;

  // Synthetic BaseGameData wrapper type handed to the SDK.
  type Stored = T & BaseGameData;

  const toStored = (data: T): Stored =>
    ({ ...data, version, gameId: key, lastPlayed: 0 }) as Stored; // SDK re-stamps lastPlayed

  const isUsable = (candidate: { version?: unknown }): boolean =>
    typeof candidate.version === 'number' && (!validate || validate(candidate));

  // Strip synthetic base, re-apply the wrapper-owned guards, re-stamp version.
  const fromEnvelope = (env: StorageEnvelope<Stored>): T => {
    const { gameId: _g, lastPlayed: _l, ...rest } = env.data;
    const parsed = rest as unknown as T;
    if (!isUsable(parsed)) return { ...defaults };
    if (env.version > version) return { ...defaults }; // future-version guard (envelope mirror)
    return { ...parsed, version }; // payload version === currentVersion
  };

  // target-keyed template migrations → SDK source-keyed, shifted down one.
  const sdkMigrations: NonNullable<StorageConfig<Stored>['migrations']> = {};
  if (migrations) {
    for (const v of Object.keys(migrations).map(Number)) {
      sdkMigrations[v - 1] = (old) => ({ ...old, ...migrations[v](old) }) as Stored;
    }
  }

  const inBrowser = typeof window !== 'undefined';

  // The SDK stores the envelope here; a bare-key payload (below) migrates in.
  const sdkKey = `${key}_save_data`;

  /**
   * Adopt a raw payload found under the bare `key` into the SDK envelope, once.
   * No-op unless the envelope slot is empty and `key` holds a usable payload;
   * preserves its version so the SDK migration ladder still runs, then deletes
   * the bare key. Best-effort — on any failure the store falls back to defaults.
   */
  const migrateBareKey = async (): Promise<void> => {
    try {
      if (localStorage.getItem(sdkKey) !== null) return;
      const rawOld = localStorage.getItem(key);
      if (rawOld === null) return;
      const parsed = JSON.parse(rawOld) as { version?: unknown };
      if (!isUsable(parsed)) return;
      const data = { ...(parsed as unknown as T), gameId: key, lastPlayed: 0 } as Stored;
      const envelope: StorageEnvelope<Stored> = {
        version: (parsed as { version: number }).version,
        timestamp: Date.now(),
        identity: await getResolvedIdentityService().identify(),
        data,
      };
      localStorage.setItem(sdkKey, JSON.stringify(envelope));
      removeStored(key);
    } catch {
      // Best-effort; leave the bare key intact and fall back to defaults.
    }
  };

  // The SDK service, built once the player id has resolved.
  let service: GameSaveService<Stored> | null = null;

  // In-memory cache: source of truth for the sync surface.
  let cache: T = { ...defaults };

  // Hydration-window guard. `service` is null (or its `load()` unresolved) until
  // `prime` settles, and nothing gates render on `prime`. A save()/clear() issued
  // in that window would otherwise be clobbered by the disk read below (the cache
  // write lands, but the write-through no-ops, then hydration overwrites the
  // cache). We record the last such intent and replay it instead of overwriting.
  let primed = false;
  let pending: 'save' | 'clear' | null = null;

  // Self-prime: resolve id, then one async SDK load hydrates the cache.
  const prime = (async () => {
    if (!inBrowser) return; // SSR → defaults
    await resolvePlayerId(); // budgeted; never hangs/rejects
    try {
      service = new GameSaveService<Stored>({
        appId: key,
        currentVersion: version,
        initialData: { ...defaults, gameId: key, lastPlayed: 0 } as Stored,
        migrations: sdkMigrations,
        identityService: getResolvedIdentityService(), // no-network; keyed by resolved id
        // onQuotaExceeded / ttlDays: SDK defaults (not surfaced)
      });
      await migrateBareKey(); // seed the envelope from a legacy bare key, once
      const envelope = await service.load();
      if (pending) {
        // A save()/clear() happened during the hydration window — the in-memory
        // cache is authoritative. Replay the intent instead of clobbering it.
        if (pending === 'clear') service.clear();
        else void service.save(toStored(cache)).catch(() => {});
      } else {
        cache = fromEnvelope(envelope);
      }
    } catch (err) {
      // The SDK constructor is not inert: its TTL peek does an unguarded
      // localStorage read + JSON.parse that throws on corrupt stored JSON
      // (SyntaxError) or in a storage-partitioned frame (SecurityError). Degrade
      // deliberately — keep the defaults-backed in-memory cache — but surface the
      // failure instead of leaving the store silently no-op for the whole session
      // (Promise.allSettled in whenStoresReady would otherwise swallow it). Mirrors
      // the sibling try/catch in ../systems/identity/localId.ts.
      console.warn(
        `[storage] versioned store "${key}" failed to hydrate; running on in-memory cache`,
        err,
      );
    } finally {
      primed = true;
    }
  })();
  priming.push(prime);

  const load = (): T => ({ ...cache }); // sync fresh copy of the primed cache

  const save = (data: T): void => {
    cache = { ...data, version }; // sync cache write — immediate load() reflects it
    void service?.save(toStored(data)).catch(() => {}); // write-through, fire-and-forget
    if (!primed) pending = 'save'; // replayed after hydration so it isn't clobbered
  };

  const clear = (): void => {
    cache = { ...defaults };
    service?.clear(); // synchronous
    if (!primed) pending = 'clear'; // replayed after hydration so it isn't un-done
  };

  // Dev-only HMR teardown, stripped from prod. Off-surface. Detaches only
  // the SDK identity listener so hot reloads don't stack dead subscribers.
  if (import.meta.hot) import.meta.hot.dispose(() => service?.dispose());

  return { load, save, clear, key };
}
