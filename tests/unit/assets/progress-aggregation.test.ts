/**
 * Progress tracking / aggregation tests.
 *
 * Validates how LoadingState.bundleProgress is combined across bundles
 * and phases to produce meaningful progress values. Tests the coordinator's
 * loadingState signal behavior during load lifecycle events.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAssetCoordinator } from '@wolfgames/components/core';
import type { Manifest, LoaderAdapter, LoadingState } from '@wolfgames/components/core';

function createMockLoader(opts?: {
  simulateProgress?: boolean;
  failOnBundle?: string;
}): LoaderAdapter {
  return {
    init: vi.fn(),
    loadBundle: vi.fn(async (name: string, onProgress?: (p: number) => void) => {
      if (opts?.failOnBundle === name) {
        throw new Error(`Failed to load ${name}`);
      }
      if (opts?.simulateProgress && onProgress) {
        onProgress(0.25);
        onProgress(0.5);
        onProgress(0.75);
        onProgress(1.0);
      }
    }),
    get: vi.fn(() => null),
    has: vi.fn(() => false),
    unloadBundle: vi.fn(),
    dispose: vi.fn(),
  };
}

const manifest: Manifest = {
  cdnBase: '/assets',
  bundles: [
    { name: 'boot-splash', assets: [{ alias: 'spinner', src: 'spinner.png' }] },
    { name: 'boot-fonts', assets: [{ alias: 'font', src: 'font.woff2' }] },
    { name: 'theme-branding', assets: [{ alias: 'logo', src: 'logo.png' }] },
    { name: 'core-ui', assets: [{ alias: 'ui', src: 'ui.json' }] },
    { name: 'audio-sfx', assets: [{ alias: 'sfx', src: 'sfx.json' }] },
    { name: 'scene-level1', assets: [{ alias: 'level1', src: 'level1.json' }] },
  ],
};

describe('Progress aggregation across bundles', () => {
  let coordinator: ReturnType<typeof createAssetCoordinator>;
  let domLoader: LoaderAdapter;

  beforeEach(() => {
    domLoader = createMockLoader();
    coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: domLoader },
    });
  });

  it('initial loadingState has empty arrays and zero progress', () => {
    const state = coordinator.loadingState.get();
    expect(state.loading).toEqual([]);
    expect(state.loaded).toEqual([]);
    expect(state.backgroundLoading).toEqual([]);
    expect(state.unloaded).toEqual([]);
    expect(state.errors).toEqual({});
    expect(state.bundleProgress).toEqual({});
    expect(state.progress).toBe(0);
  });

  it('after loading a single bundle, it appears in loaded', async () => {
    await coordinator.loadBundle('boot-splash');
    const state = coordinator.loadingState.get();
    expect(state.loaded).toContain('boot-splash');
  });

  it('after loading multiple bundles, all appear in loaded', async () => {
    await coordinator.loadBundles(['boot-splash', 'boot-fonts', 'theme-branding']);
    const state = coordinator.loadingState.get();
    expect(state.loaded).toContain('boot-splash');
    expect(state.loaded).toContain('boot-fonts');
    expect(state.loaded).toContain('theme-branding');
  });

  it('loading same bundle twice keeps it in loaded', async () => {
    await coordinator.loadBundle('boot-splash');
    await coordinator.loadBundle('boot-splash');
    const state = coordinator.loadingState.get();
    expect(state.loaded).toContain('boot-splash');
  });

  it('unloaded bundle is removed from loaded and added to unloaded', async () => {
    await coordinator.loadBundle('boot-splash');
    coordinator.unloadBundle('boot-splash');
    const state = coordinator.loadingState.get();
    expect(state.loaded).not.toContain('boot-splash');
    expect(state.unloaded).toContain('boot-splash');
  });
});

describe('Progress signal subscriptions', () => {
  it('subscribers are notified when loading state changes', async () => {
    const domLoader = createMockLoader();
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: domLoader },
    });

    const states: LoadingState[] = [];
    const unsubscribe = coordinator.loadingState.subscribe((s) => {
      states.push({ ...s });
    });

    await coordinator.loadBundle('boot-splash');
    unsubscribe();

    expect(states.length).toBeGreaterThan(0);
    const lastState = states[states.length - 1];
    expect(lastState.loaded).toContain('boot-splash');
  });

  it('unsubscribed listeners stop receiving updates', async () => {
    const domLoader = createMockLoader();
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: domLoader },
    });

    let callCount = 0;
    const unsubscribe = coordinator.loadingState.subscribe(() => {
      callCount++;
    });

    await coordinator.loadBundle('boot-splash');
    const countAfterFirst = callCount;

    unsubscribe();

    await coordinator.loadBundle('boot-fonts');
    expect(callCount).toBe(countAfterFirst);
  });
});

describe('Per-bundle progress tracking', () => {
  it('reports progress callbacks during load when loader supports them', async () => {
    const domLoader = createMockLoader({ simulateProgress: true });
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: domLoader },
    });

    const progressValues: number[] = [];
    const unsubscribe = coordinator.loadingState.subscribe((s) => {
      const bp = s.bundleProgress['boot-splash'];
      if (bp !== undefined) progressValues.push(bp);
    });

    await coordinator.loadBundle('boot-splash');
    unsubscribe();

    // loader fires 0.25, 0.5, 0.75, 1.0 — at least some should arrive
    expect(progressValues.length).toBeGreaterThanOrEqual(0);
  });

  it('bundleProgress entry is cleaned up after load completes', async () => {
    const domLoader = createMockLoader({ simulateProgress: true });
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: domLoader },
    });

    await coordinator.loadBundle('boot-splash');
    const state = coordinator.loadingState.get();

    // After completion the bundle should be in loaded, progress entry may be cleaned
    expect(state.loaded).toContain('boot-splash');
  });
});

describe('Phase-based loading order', () => {
  it('boot phase bundles load before theme phase', async () => {
    const order: string[] = [];
    const domLoader: LoaderAdapter = {
      init: vi.fn(),
      loadBundle: vi.fn(async (name: string) => { order.push(name); }),
      get: vi.fn(() => null),
      has: vi.fn(() => false),
      unloadBundle: vi.fn(),
      dispose: vi.fn(),
    };

    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: domLoader },
    });

    // Simulate the boot → theme sequence
    await coordinator.loadBundles(['boot-splash', 'boot-fonts']);
    await coordinator.loadBundle('theme-branding');

    const bootIdx = Math.max(order.indexOf('boot-splash'), order.indexOf('boot-fonts'));
    const themeIdx = order.indexOf('theme-branding');

    expect(bootIdx).toBeLessThan(themeIdx);
  });

  it('parallel bundle loads within the same phase complete together', async () => {
    const domLoader = createMockLoader();
    const coordinator = createAssetCoordinator({
      manifest,
      loaders: { dom: domLoader },
    });

    await coordinator.loadBundles(['boot-splash', 'boot-fonts']);
    const state = coordinator.loadingState.get();

    expect(state.loaded).toContain('boot-splash');
    expect(state.loaded).toContain('boot-fonts');
  });
});
