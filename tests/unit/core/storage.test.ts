/**
 * `createVersionedStore` — the GameSaveService wrapper (#93). Exercised through
 * its public `{ load, save, clear, key }` surface, with the identity singleton
 * and `@wolfgames/client`'s `GameSaveService` mocked at the two module seams.
 *
 * Covers: the unchanged raw helpers; backend-mode boot hydration + write-through;
 * local-fallback persistence + guards + migration loop; lazy/never-offline SDK
 * construction; the migration re-key; and `whenStoresReady()` fail-open.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Controllable mock state (hoisted for the vi.mock factories) ──────────────
const mockState = vi.hoisted(() => ({
  resolve: vi.fn(async () => 'id-1'),
  // GameSaveService spy surface
  constructedConfigs: [] as any[],
  loadImpl: vi.fn(),
  saveSpy: vi.fn(async () => {}),
  clearSpy: vi.fn(() => {}),
  disposeSpy: vi.fn(() => {}),
}));

vi.mock('~/core/systems/identity', () => ({
  getResolvedIdentityService: () => ({ kind: 'resolved' }) as any,
  resolvePlayerId: () => mockState.resolve(),
}));

vi.mock('@wolfgames/client', () => {
  class MockGameSaveService {
    config: any;
    constructor(config: any) {
      this.config = config;
      mockState.constructedConfigs.push(config);
    }
    load = () => mockState.loadImpl(this.config);
    save = (data: any) => mockState.saveSpy(data);
    clear = () => mockState.clearSpy();
    dispose = () => mockState.disposeSpy();
  }
  return { GameSaveService: MockGameSaveService };
});

/** In-memory localStorage stand-in (node test env has no `localStorage`). */
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

/** Envelope shape the mocked SDK `load()` returns. */
function envelope<T>(data: T, version: number) {
  return { version, timestamp: 0, identity: {} as any, data };
}

/** Fresh module so the module-scope `priming[]` registry resets per test. */
async function loadStorage() {
  vi.resetModules();
  return import('~/core/utils/storage');
}

interface Progress {
  version: number;
  currentLevel: number;
}

beforeEach(() => {
  mockState.resolve.mockReset().mockResolvedValue('id-1');
  mockState.constructedConfigs.length = 0;
  mockState.loadImpl.mockReset();
  mockState.saveSpy.mockReset().mockResolvedValue(undefined);
  mockState.clearSpy.mockReset();
  mockState.disposeSpy.mockReset();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', makeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('raw helpers (unchanged)', () => {
  it('getStored returns fallback with no window, then round-trips a value', async () => {
    const { getStored, setStored, removeStored } = await loadStorage();
    setStored('k', { a: 1 });
    expect(getStored('k', null)).toEqual({ a: 1 });
    expect(getStored('missing', 'fb')).toBe('fb');
    removeStored('k');
    expect(getStored('k', 'fb')).toBe('fb');
  });

  it('getStored swallows parse errors and returns the fallback', async () => {
    const { getStored } = await loadStorage();
    localStorage.setItem('bad', '{not json');
    expect(getStored('bad', 'fb')).toBe('fb');
  });
});

describe('primed SDK store', () => {
  it('hydrates the cache from one SDK load() before boot completes', async () => {
    mockState.loadImpl.mockResolvedValue(
      envelope({ version: 1, currentLevel: 5, gameId: 'g', lastPlayed: 9 }, 1),
    );
    const { createVersionedStore, whenStoresReady } = await loadStorage();

    const store = createVersionedStore<Progress>({
      key: 'g',
      version: 1,
      defaults: { version: 1, currentLevel: 1 },
    });

    // Before boot the cache is still defaults.
    expect(store.load().currentLevel).toBe(1);
    await whenStoresReady();

    const loaded = store.load();
    expect(loaded).toEqual({ version: 1, currentLevel: 5 }); // synthetic base stripped
    expect(mockState.constructedConfigs).toHaveLength(1);
    // sync load() returns a fresh copy, not the cache reference
    expect(store.load()).not.toBe(loaded);
  });

  it('save() writes cache sync and fires a write-through to the SDK', async () => {
    mockState.loadImpl.mockResolvedValue(
      envelope({ version: 1, currentLevel: 1, gameId: 'g', lastPlayed: 0 }, 1),
    );
    const { createVersionedStore, whenStoresReady } = await loadStorage();
    const store = createVersionedStore<Progress>({
      key: 'g',
      version: 1,
      defaults: { version: 1, currentLevel: 1 },
    });
    await whenStoresReady();

    store.save({ version: 1, currentLevel: 7 });
    expect(store.load().currentLevel).toBe(7); // sync cache reflects immediately
    expect(mockState.saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ currentLevel: 7, gameId: 'g', version: 1 }),
    );
    // the wrapper never touches the raw key — the SDK owns persistence
    expect(localStorage.getItem('g')).toBeNull();
  });

  it('keys the SDK envelope with the resolved-id identity service', async () => {
    mockState.loadImpl.mockResolvedValue(
      envelope({ version: 1, currentLevel: 1, gameId: 'g', lastPlayed: 0 }, 1),
    );
    const { createVersionedStore, whenStoresReady } = await loadStorage();
    createVersionedStore<Progress>({
      key: 'g',
      version: 1,
      defaults: { version: 1, currentLevel: 1 },
    });
    await whenStoresReady();
    expect(mockState.constructedConfigs[0].identityService).toEqual({ kind: 'resolved' });
  });

  it('clear() resets the cache and calls service.clear()', async () => {
    mockState.loadImpl.mockResolvedValue(
      envelope({ version: 1, currentLevel: 5, gameId: 'g', lastPlayed: 0 }, 1),
    );
    const { createVersionedStore, whenStoresReady } = await loadStorage();
    const store = createVersionedStore<Progress>({
      key: 'g',
      version: 1,
      defaults: { version: 1, currentLevel: 1 },
    });
    await whenStoresReady();

    store.clear();
    expect(store.load().currentLevel).toBe(1);
    expect(mockState.clearSpy).toHaveBeenCalledTimes(1);
  });

  it('re-keys target-keyed migrations to SDK source-keyed (shifted down one)', async () => {
    mockState.loadImpl.mockResolvedValue(
      envelope({ version: 2, currentLevel: 1, gameId: 'g', lastPlayed: 0 }, 2),
    );
    const { createVersionedStore, whenStoresReady } = await loadStorage();
    createVersionedStore<Progress>({
      key: 'g',
      version: 2,
      defaults: { version: 2, currentLevel: 1 },
      migrations: { 2: (old: any) => ({ currentLevel: old.currentLevel ?? 0 }) },
    });
    await whenStoresReady();

    const cfg = mockState.constructedConfigs[0];
    expect(cfg.appId).toBe('g');
    expect(cfg.currentVersion).toBe(2);
    // template migrations[2] → SDK migrations[1]
    expect(Object.keys(cfg.migrations)).toEqual(['1']);
  });

  it('applies the guards on the hydrated envelope (future version → defaults)', async () => {
    mockState.loadImpl.mockResolvedValue(
      envelope({ version: 9, currentLevel: 99, gameId: 'g', lastPlayed: 0 }, 9),
    );
    const { createVersionedStore, whenStoresReady } = await loadStorage();
    const store = createVersionedStore<Progress>({
      key: 'g',
      version: 1,
      defaults: { version: 1, currentLevel: 1 },
    });
    await whenStoresReady();
    expect(store.load()).toEqual({ version: 1, currentLevel: 1 });
  });
});

describe('whenStoresReady fail-open', () => {
  it('resolves (allSettled) even when a store rejects at prime', async () => {
    mockState.loadImpl.mockRejectedValue(new Error('load failed'));
    const { createVersionedStore, whenStoresReady } = await loadStorage();
    const store = createVersionedStore<Progress>({
      key: 'g',
      version: 1,
      defaults: { version: 1, currentLevel: 1 },
    });

    await expect(whenStoresReady()).resolves.toBeDefined();
    // cache stays at defaults since hydration failed
    expect(store.load()).toEqual({ version: 1, currentLevel: 1 });
  });
});
