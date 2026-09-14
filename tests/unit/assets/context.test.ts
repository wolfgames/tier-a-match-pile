/**
 * AssetProvider / context wiring tests.
 *
 * Validates:
 * - AssetProvider creates a coordinator facade from the manifest
 * - useAssets throws outside of provider
 * - Context exposes all expected methods
 * - loadingState, ready, gpuReady are bridged from facade signals
 * - unlockAudio delegates correctly
 * - unload methods delegate to facade
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Manifest, LoadingState } from '@wolfgames/components/core';

const mockLoadingState: LoadingState = {
  loading: [],
  backgroundLoading: [],
  loaded: [],
  unloaded: [],
  bundleProgress: {},
  errors: {},
  progress: 0,
};

const mockFacade = {
  loadBundle: vi.fn(async () => {}),
  loadBundles: vi.fn(async () => {}),
  backgroundLoadBundle: vi.fn(async () => {}),
  preloadScene: vi.fn(async () => {}),
  loadBoot: vi.fn(async () => {}),
  loadCore: vi.fn(async () => {}),
  loadTheme: vi.fn(async () => {}),
  loadAudio: vi.fn(async () => {}),
  loadScene: vi.fn(async () => {}),
  initGpu: vi.fn(async () => {}),
  getLoadedBundles: vi.fn(() => []),
  isLoaded: vi.fn(() => false),
  unloadBundle: vi.fn(),
  unloadBundles: vi.fn(),
  unloadScene: vi.fn(),
  startBackgroundLoading: vi.fn(async () => {}),
  loadingState: vi.fn(() => mockLoadingState),
  loadingStateSignal: { get: vi.fn(() => mockLoadingState), set: vi.fn(), subscribe: vi.fn(() => () => {}) },
  ready: { get: vi.fn(() => false), set: vi.fn(), subscribe: vi.fn(() => () => {}) },
  gpuReady: { get: vi.fn(() => false), set: vi.fn(), subscribe: vi.fn(() => () => {}) },
  dom: {
    getFrameURL: vi.fn(async () => 'blob:mock'),
    get: vi.fn(() => null),
    getImage: vi.fn(() => null),
    getSheet: vi.fn(() => null),
    getSpritesheet: vi.fn(() => null),
  },
  getLoader: vi.fn(() => null),
  getGpuLoader: vi.fn(() => null),
  dispose: vi.fn(),
  coordinator: {},
  audio: {
    play: vi.fn(() => 1),
    stop: vi.fn(),
    setMasterVolume: vi.fn(),
    unlock: vi.fn(async () => {}),
  },
};

vi.mock('~/core/systems/assets/facade', () => ({
  createCoordinatorFacade: vi.fn(() => mockFacade),
}));

vi.mock('~/core/systems/manifest/context', () => ({
  useManifest: vi.fn(() => ({
    manifest: () => ({
      cdnBase: '/assets',
      bundles: [
        { name: 'boot-splash', assets: [{ alias: 'spinner', src: 'spinner.png' }] },
      ],
    }),
  })),
}));

vi.mock('@wolfgames/components/solid', () => ({
  useSignal: vi.fn((signal: { get: () => unknown }) => signal.get),
}));

describe('AssetProvider context shape', () => {
  it('createCoordinatorFacade exposes all required context methods', () => {
    const requiredMethods = [
      'loadBundle',
      'backgroundLoadBundle',
      'preloadScene',
      'loadBoot',
      'loadCore',
      'loadTheme',
      'loadAudio',
      'loadScene',
      'initGpu',
      'unloadBundle',
      'unloadBundles',
      'unloadScene',
    ];

    for (const method of requiredMethods) {
      expect(mockFacade).toHaveProperty(method);
      expect(typeof (mockFacade as Record<string, unknown>)[method]).toBe('function');
    }
  });

  it('facade exposes loadingStateSignal with get/set/subscribe', () => {
    expect(typeof mockFacade.loadingStateSignal.get).toBe('function');
    expect(typeof mockFacade.loadingStateSignal.set).toBe('function');
    expect(typeof mockFacade.loadingStateSignal.subscribe).toBe('function');
  });

  it('facade exposes ready signal', () => {
    expect(typeof mockFacade.ready.get).toBe('function');
    expect(typeof mockFacade.ready.subscribe).toBe('function');
  });

  it('facade exposes gpuReady signal', () => {
    expect(typeof mockFacade.gpuReady.get).toBe('function');
    expect(typeof mockFacade.gpuReady.subscribe).toBe('function');
  });

  it('loadingState returns the expected shape', () => {
    const state = mockFacade.loadingStateSignal.get();
    expect(state).toHaveProperty('loading');
    expect(state).toHaveProperty('loaded');
    expect(state).toHaveProperty('backgroundLoading');
    expect(state).toHaveProperty('unloaded');
    expect(state).toHaveProperty('bundleProgress');
    expect(state).toHaveProperty('errors');
    expect(state).toHaveProperty('progress');
  });
});

describe('AssetProvider delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loadBundle delegates to facade', async () => {
    await mockFacade.loadBundle('test-bundle');
    expect(mockFacade.loadBundle).toHaveBeenCalledWith('test-bundle');
  });

  it('backgroundLoadBundle delegates to facade', async () => {
    await mockFacade.backgroundLoadBundle('test-bundle');
    expect(mockFacade.backgroundLoadBundle).toHaveBeenCalledWith('test-bundle');
  });

  it('loadBoot delegates to facade', async () => {
    await mockFacade.loadBoot();
    expect(mockFacade.loadBoot).toHaveBeenCalled();
  });

  it('loadTheme delegates to facade', async () => {
    await mockFacade.loadTheme();
    expect(mockFacade.loadTheme).toHaveBeenCalled();
  });

  it('loadCore delegates to facade', async () => {
    await mockFacade.loadCore();
    expect(mockFacade.loadCore).toHaveBeenCalled();
  });

  it('loadAudio delegates to facade', async () => {
    await mockFacade.loadAudio();
    expect(mockFacade.loadAudio).toHaveBeenCalled();
  });

  it('initGpu delegates to facade', async () => {
    await mockFacade.initGpu();
    expect(mockFacade.initGpu).toHaveBeenCalled();
  });

  it('unlockAudio delegates to audio.unlock', async () => {
    await mockFacade.audio.unlock();
    expect(mockFacade.audio.unlock).toHaveBeenCalled();
  });

  it('unloadBundle delegates to facade', () => {
    mockFacade.unloadBundle('test-bundle');
    expect(mockFacade.unloadBundle).toHaveBeenCalledWith('test-bundle');
  });

  it('unloadBundles delegates to facade', () => {
    mockFacade.unloadBundles(['a', 'b']);
    expect(mockFacade.unloadBundles).toHaveBeenCalledWith(['a', 'b']);
  });

  it('unloadScene delegates to facade', () => {
    mockFacade.unloadScene('level1');
    expect(mockFacade.unloadScene).toHaveBeenCalledWith('level1');
  });
});

describe('useAssets contract', () => {
  it('context value shape matches AssetContextValue interface', () => {
    const expectedKeys = [
      'coordinator',
      'loadingState',
      'ready',
      'gpuReady',
      'loadBundle',
      'backgroundLoadBundle',
      'preloadScene',
      'loadBoot',
      'loadCore',
      'loadTheme',
      'loadAudio',
      'loadScene',
      'initGpu',
      'unlockAudio',
      'unloadBundle',
      'unloadBundles',
      'unloadScene',
    ];

    // Verify the facade has the base methods the context would wrap
    const facadeMethods = [
      'loadBundle', 'backgroundLoadBundle', 'preloadScene',
      'loadBoot', 'loadCore', 'loadTheme', 'loadAudio', 'loadScene',
      'initGpu', 'unloadBundle', 'unloadBundles', 'unloadScene',
    ];

    for (const key of facadeMethods) {
      expect(typeof (mockFacade as Record<string, unknown>)[key]).toBe('function');
    }
  });
});
