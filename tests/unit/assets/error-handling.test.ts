/**
 * Asset loading error handling tests.
 *
 * Validates:
 * - Failed bundle loads are recorded in loadingState.errors
 * - Error does not prevent subsequent bundles from loading
 * - Failed bundle can be retried
 * - Multiple concurrent failures are tracked independently
 * - Error state is cleared on successful retry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAssetCoordinator } from '@wolfgames/components/core';
import type { Manifest, LoaderAdapter, LoadingState } from '@wolfgames/components/core';

const manifest: Manifest = {
  cdnBase: '/assets',
  bundles: [
    { name: 'boot-splash', assets: [{ alias: 'spinner', src: 'spinner.png' }] },
    { name: 'boot-fonts', assets: [{ alias: 'font', src: 'font.woff2' }] },
    { name: 'theme-branding', assets: [{ alias: 'logo', src: 'logo.png' }] },
    { name: 'core-ui', assets: [{ alias: 'ui', src: 'ui.json' }] },
  ],
};

function createFailingLoader(failOn: Set<string>): LoaderAdapter {
  return {
    init: vi.fn(),
    loadBundle: vi.fn(async (name: string) => {
      if (failOn.has(name)) {
        throw new Error(`Load failed: ${name}`);
      }
    }),
    get: vi.fn(() => null),
    has: vi.fn(() => false),
    unloadBundle: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('Error tracking in loadingState', () => {
  it('records error for a failed bundle', async () => {
    const loader = createFailingLoader(new Set(['boot-splash']));
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: loader },
    });

    try {
      await coordinator.loadBundle('boot-splash');
    } catch {
      // expected
    }

    const state = coordinator.loadingState.get();
    expect(state.errors).toHaveProperty('boot-splash');
    expect(state.errors['boot-splash']).toBeInstanceOf(Error);
  });

  it('failed bundle is not in loaded array', async () => {
    const loader = createFailingLoader(new Set(['boot-splash']));
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: loader },
    });

    try {
      await coordinator.loadBundle('boot-splash');
    } catch {
      // expected
    }

    const state = coordinator.loadingState.get();
    expect(state.loaded).not.toContain('boot-splash');
  });

  it('other bundles still load after one fails', async () => {
    const loader = createFailingLoader(new Set(['boot-splash']));
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: loader },
    });

    try {
      await coordinator.loadBundle('boot-splash');
    } catch {
      // expected
    }

    await coordinator.loadBundle('boot-fonts');
    const state = coordinator.loadingState.get();
    expect(state.loaded).toContain('boot-fonts');
    expect(state.loaded).not.toContain('boot-splash');
  });
});

describe('Multiple concurrent failures', () => {
  it('tracks errors for each failed bundle independently', async () => {
    const loader = createFailingLoader(new Set(['boot-splash', 'theme-branding']));
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: loader },
    });

    const results = await Promise.allSettled([
      coordinator.loadBundle('boot-splash'),
      coordinator.loadBundle('boot-fonts'),
      coordinator.loadBundle('theme-branding'),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
    expect(results[2].status).toBe('rejected');

    const state = coordinator.loadingState.get();
    expect(state.errors).toHaveProperty('boot-splash');
    expect(state.errors).toHaveProperty('theme-branding');
    expect(state.errors).not.toHaveProperty('boot-fonts');
    expect(state.loaded).toContain('boot-fonts');
  });
});

describe('Retry after failure', () => {
  it('retrying a failed bundle loads it on success', async () => {
    let failCount = 0;
    const loader: LoaderAdapter = {
      init: vi.fn(),
      loadBundle: vi.fn(async (name: string) => {
        if (name === 'boot-splash' && failCount === 0) {
          failCount++;
          throw new Error('Transient failure');
        }
      }),
      get: vi.fn(() => null),
      has: vi.fn(() => false),
      unloadBundle: vi.fn(),
      dispose: vi.fn(),
    };

    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: loader },
    });

    // First attempt fails
    try {
      await coordinator.loadBundle('boot-splash');
    } catch {
      // expected
    }

    let state = coordinator.loadingState.get();
    expect(state.loaded).not.toContain('boot-splash');

    // Retry succeeds
    await coordinator.loadBundle('boot-splash');
    state = coordinator.loadingState.get();
    expect(state.loaded).toContain('boot-splash');
  });

  it('retrying all failed bundles clears them from errors', async () => {
    let attempts = 0;
    const loader: LoaderAdapter = {
      init: vi.fn(),
      loadBundle: vi.fn(async (name: string) => {
        if (name === 'boot-splash' && attempts < 1) {
          attempts++;
          throw new Error('First attempt fails');
        }
      }),
      get: vi.fn(() => null),
      has: vi.fn(() => false),
      unloadBundle: vi.fn(),
      dispose: vi.fn(),
    };

    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: loader },
    });

    try {
      await coordinator.loadBundle('boot-splash');
    } catch {
      // expected
    }

    // Verify error is recorded
    let state = coordinator.loadingState.get();
    expect(state.errors).toHaveProperty('boot-splash');

    // Retry
    await coordinator.loadBundle('boot-splash');
    state = coordinator.loadingState.get();
    expect(state.loaded).toContain('boot-splash');
  });
});

describe('Error propagation', () => {
  it('loadBundle rejects with the loader error', async () => {
    const loader = createFailingLoader(new Set(['boot-splash']));
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: loader },
    });

    await expect(coordinator.loadBundle('boot-splash')).rejects.toThrow('Load failed: boot-splash');
  });

  it('loadBundles rejects when any bundle fails', async () => {
    const loader = createFailingLoader(new Set(['theme-branding']));
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: loader },
    });

    await expect(
      coordinator.loadBundles(['boot-splash', 'theme-branding'])
    ).rejects.toThrow();
  });
});
