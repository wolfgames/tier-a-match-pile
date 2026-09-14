/**
 * Player-identity module — exercised through its public surface, with
 * `@wolfgames/client`'s `PlayerIdentityService` mocked at the module boundary
 * (the single seam). Covers host-origin validation, the local fallback
 * (persistence + storage-blocked), the always-a-string / never-rejects
 * guarantee (backend reject *and* timeout), and memoization.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgedTokenStore } from '@wolfgames/client';

// Controllable mock state, hoisted so the vi.mock factory can close over it.
const mockState = vi.hoisted(() => ({
  identify: vi.fn(),
  constructorConfigs: [] as unknown[],
  instances: [] as unknown[],
}));

vi.mock('@wolfgames/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wolfgames/client')>();
  class MockPlayerIdentityService {
    config: unknown;
    identify: () => Promise<{ uuid: string }>;
    constructor(config: unknown) {
      this.config = config;
      mockState.constructorConfigs.push(config);
      mockState.instances.push(this);
      this.identify = mockState.identify;
    }
  }
  return { ...actual, PlayerIdentityService: MockPlayerIdentityService };
});

/** In-memory localStorage stand-in (node test env has no `localStorage`). */
function makeStorage(overrides: Partial<Storage> = {}): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    ...overrides,
  } as Storage;
}

/** Fresh module instance so the singleton's memoization resets per test. */
async function loadIdentity() {
  vi.resetModules();
  return import('~/core/systems/identity/identity');
}

beforeEach(() => {
  mockState.identify.mockReset();
  mockState.constructorConfigs.length = 0;
  mockState.instances.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // A deployed env by default so the backend path is attempted; the Local-skip
  // path is exercised explicitly in its own test.
  vi.stubEnv('VITE_APP_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('validateHostOrigin', () => {
  it('accepts a concrete http(s) origin and normalizes it', async () => {
    const { validateHostOrigin } = await import(
      '~/core/systems/identity/tokenBridge'
    );
    expect(validateHostOrigin('https://vault.wolf.games')).toBe(
      'https://vault.wolf.games',
    );
    expect(validateHostOrigin('http://localhost:3000/shelf')).toBe(
      'http://localhost:3000',
    );
  });

  it('rejects missing, non-http(s), and unparseable values', async () => {
    const { validateHostOrigin } = await import(
      '~/core/systems/identity/tokenBridge'
    );
    expect(validateHostOrigin(null)).toBeNull();
    expect(validateHostOrigin(undefined)).toBeNull();
    expect(validateHostOrigin('')).toBeNull();
    expect(validateHostOrigin('javascript:alert(1)')).toBeNull();
    expect(validateHostOrigin('ftp://vault.wolf.games')).toBeNull();
    expect(validateHostOrigin('vault.wolf.games')).toBeNull();
    expect(validateHostOrigin('not a url')).toBeNull();
  });
});

describe('local fallback id', () => {
  it('persists under the player_id key and survives a reload', async () => {
    const storage = makeStorage();
    vi.stubGlobal('localStorage', storage);
    const { getOrCreateLocalPlayerId, PLAYER_ID_KEY } = await import(
      '~/core/systems/identity/localId'
    );

    const first = getOrCreateLocalPlayerId();
    expect(first).toBeTruthy();
    expect(storage.getItem(PLAYER_ID_KEY)).toBe(first);

    // Same process, second call → same id.
    expect(getOrCreateLocalPlayerId()).toBe(first);

    // Simulate a reload: fresh module, same (persisted) storage.
    const reloaded = await import('~/core/systems/identity/localId');
    expect(reloaded.getOrCreateLocalPlayerId()).toBe(first);
  });

  it('returns an ephemeral id without throwing when storage is blocked', async () => {
    const blocked = makeStorage({
      setItem: () => {
        throw new Error('blocked');
      },
    });
    vi.stubGlobal('localStorage', blocked);
    const { getOrCreateLocalPlayerId } = await import(
      '~/core/systems/identity/localId'
    );

    let id: string | undefined;
    expect(() => {
      id = getOrCreateLocalPlayerId();
    }).not.toThrow();
    expect(typeof id).toBe('string');
    expect(id).toBeTruthy();
  });

  it('generates a uuid without a secure context (no crypto.randomUUID)', async () => {
    vi.stubGlobal('crypto', {});
    const { generatePlayerId } = await import('~/core/systems/identity/localId');
    expect(generatePlayerId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('resolvePlayerId singleton', () => {
  it('resolves to the backend uuid when identify() succeeds', async () => {
    mockState.identify.mockResolvedValue({ uuid: 'backend-123' });
    const identity = await loadIdentity();

    expect(await identity.resolvePlayerId()).toBe('backend-123');
    expect(identity.getResolvedPlayerId()).toBe('backend-123');
  });

  it('falls back to a local id (never rejects) when the backend rejects', async () => {
    const storage = makeStorage();
    vi.stubGlobal('localStorage', storage);
    mockState.identify.mockRejectedValue(new Error('backend down'));
    const identity = await loadIdentity();

    const id = await identity.resolvePlayerId();
    expect(typeof id).toBe('string');
    expect(id).toBeTruthy();
    expect(id).toBe(storage.getItem('player_id'));
    expect(identity.getResolvedPlayerId()).toBe(id);
  });

  it('falls back to a local id when identify() exceeds the ~2.5s budget', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', makeStorage());
    mockState.identify.mockReturnValue(new Promise<never>(() => {}));
    const identity = await loadIdentity();

    const pending = identity.resolvePlayerId();
    await vi.advanceTimersByTimeAsync(2500);
    const id = await pending;

    expect(typeof id).toBe('string');
    expect(id).toBeTruthy();
  });

  it('skips the backend entirely in Local env — local id, no identify() call', async () => {
    // Local env + no host override → no reachable backend from a localhost
    // origin, so the doomed (CORS-rejected) request is never sent.
    vi.stubEnv('VITE_APP_ENV', '');
    vi.stubEnv('VITE_PLAYER_DATA_HOST', '');
    vi.stubGlobal('localStorage', makeStorage());
    mockState.identify.mockResolvedValue({ uuid: 'unused' });
    const identity = await loadIdentity();

    const id = await identity.resolvePlayerId();
    expect(mockState.identify).not.toHaveBeenCalled();
    expect(typeof id).toBe('string');
    expect(id).toBeTruthy();
  });

  it('still attempts the backend in Local when a host override opts in', async () => {
    vi.stubEnv('VITE_APP_ENV', '');
    vi.stubEnv('VITE_PLAYER_DATA_HOST', 'https://player-data.local.test');
    mockState.identify.mockResolvedValue({ uuid: 'override-1' });
    const identity = await loadIdentity();

    expect(await identity.resolvePlayerId()).toBe('override-1');
    expect(mockState.identify).toHaveBeenCalledTimes(1);
  });

  it('falls back to a local id when the backend rejects', async () => {
    vi.stubGlobal('localStorage', makeStorage());
    mockState.identify.mockRejectedValue(new Error('backend down'));
    const identity = await loadIdentity();

    const id = await identity.resolvePlayerId();
    expect(typeof id).toBe('string');
    expect(id).toBeTruthy();
  });

  it('falls back to a local id when the identify budget is exceeded', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', makeStorage());
    mockState.identify.mockReturnValue(new Promise<never>(() => {}));
    const identity = await loadIdentity();

    const pending = identity.resolvePlayerId();
    await vi.advanceTimersByTimeAsync(2500);
    const id = await pending;

    expect(typeof id).toBe('string');
    expect(id).toBeTruthy();
  });

  it('memoizes the id and the service instance across calls', async () => {
    mockState.identify.mockResolvedValue({ uuid: 'mem-1' });
    const identity = await loadIdentity();

    const [a, b] = await Promise.all([
      identity.resolvePlayerId(),
      identity.resolvePlayerId(),
    ]);
    expect(a).toBe('mem-1');
    expect(b).toBe('mem-1');
    expect(await identity.resolvePlayerId()).toBe('mem-1');
    expect(mockState.identify).toHaveBeenCalledTimes(1);

    expect(identity.getPlayerIdentityService()).toBe(
      identity.getPlayerIdentityService(),
    );
    expect(mockState.constructorConfigs).toHaveLength(1);
  });
});

describe('service construction', () => {
  it('uses the standalone session (no tokenStore) when not embedded', async () => {
    mockState.identify.mockResolvedValue({ uuid: 'x' });
    const identity = await loadIdentity();

    identity.getPlayerIdentityService();
    const config = mockState.constructorConfigs[0] as {
      host: string;
      tokenStore?: unknown;
    };
    expect(config.host).toMatch(/^https:\/\/player-data\./);
    expect(config.tokenStore).toBeUndefined();
  });

  it('falls back to a standalone session when ?wolfHost= is not a valid origin', async () => {
    vi.stubGlobal('window', {
      location: { search: '?wolfHost=ftp://vault.wolf.games' },
      parent: {},
    });
    mockState.identify.mockResolvedValue({ uuid: 'x' });
    const identity = await loadIdentity();

    identity.getPlayerIdentityService();
    const config = mockState.constructorConfigs[0] as { tokenStore?: unknown };
    expect(config.tokenStore).toBeUndefined();
  });

  it('builds a BridgedTokenStore from a valid ?wolfHost= origin', async () => {
    vi.stubGlobal('window', {
      location: { search: '?wolfHost=https://vault.wolf.games' },
      parent: {},
    });
    mockState.identify.mockResolvedValue({ uuid: 'x' });
    const identity = await loadIdentity();

    identity.getPlayerIdentityService();
    const config = mockState.constructorConfigs[0] as { tokenStore?: unknown };
    expect(config.tokenStore).toBeInstanceOf(BridgedTokenStore);
  });
});
