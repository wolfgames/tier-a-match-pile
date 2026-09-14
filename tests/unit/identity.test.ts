/**
 * Unit tests for the player-identity resolver (systems/identity/identity.ts).
 *
 * Focus: the resolved id must be **sticky** across an `identify()` timeout. On a
 * backend-configured env, `identify()` mints a backend uuid; if a later session
 * times out, the resolver must fall back to that same uuid rather than minting a
 * fresh local one — otherwise one player splits into two ids across flaky
 * sessions (analytics, flags, and the save envelope all diverge). See ENG-4222.
 *
 * The module memoizes at module scope, so each "session" is a fresh import via
 * `vi.resetModules()`; a persistent `localStorage` stub models the cross-session
 * browser store.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable identify() behaviour, swapped per test.
let identifyImpl: () => Promise<{ uuid: string; isAnonymous: boolean }>;

vi.mock('@wolfgames/client', () => ({
  PlayerIdentityService: class {
    identify() {
      return identifyImpl();
    }
    subscribe() {
      return () => {};
    }
  },
}));

vi.mock('~/core/systems/identity/host', () => ({
  isBackendConfigured: () => true,
  resolvePlayerDataHost: () => 'https://player-data.test',
}));

vi.mock('~/core/systems/identity/tokenBridge', () => ({
  resolveBridgedTokenStore: () => null,
}));

// Persistent across resetModules → models the browser localStorage surviving a
// page reload. Cleared between tests for isolation.
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};

// Preserved so afterEach can restore the environment's real localStorage
// descriptor (or its absence) instead of leaking the stub into other tests.
let originalLocalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  store.clear();
  originalLocalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageStub,
    configurable: true,
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

/** A fresh import of the memoized module — one "session". */
async function loadSession() {
  vi.resetModules();
  return import('~/core/systems/identity/identity');
}

describe('resolvePlayerId — sticky resolved id', () => {
  it('reuses the backend uuid on a later identify() timeout', async () => {
    // Session 1: backend reachable → mints and persists a backend uuid.
    identifyImpl = async () => ({ uuid: 'backend-uuid', isAnonymous: true });
    const s1 = await loadSession();
    expect(await s1.resolvePlayerId()).toBe('backend-uuid');

    // Session 2: identify() fails (timeout / unreachable) → must fall back to
    // the SAME uuid, not a freshly minted local one.
    identifyImpl = async () => {
      throw new Error('identify() exceeded 2500ms budget');
    };
    const s2 = await loadSession();
    expect(await s2.resolvePlayerId()).toBe('backend-uuid');
  });

  it('mints a local id when the backend has never been reached', async () => {
    identifyImpl = async () => {
      throw new Error('unreachable');
    };
    const s = await loadSession();
    const id = await s.resolvePlayerId();
    expect(id).toBeTruthy();
    expect(id).not.toBe('backend-uuid');
  });

  it('is memoized within a session', async () => {
    identifyImpl = async () => ({ uuid: 'backend-uuid', isAnonymous: true });
    const s = await loadSession();
    const first = await s.resolvePlayerId();
    expect(s.getResolvedPlayerId()).toBe(first);
    expect(await s.resolvePlayerId()).toBe(first);
  });
});
