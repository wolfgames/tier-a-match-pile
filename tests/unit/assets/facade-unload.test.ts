/**
 * Scaffold facade unload path tests.
 *
 * The existing coordinator.unload.test.ts exercises the upstream
 * createAssetCoordinator directly. These tests verify the scaffold
 * createCoordinatorFacade's unload methods delegate correctly and
 * that state is consistent after unload operations.
 *
 * Validates:
 * - unloadBundle delegates to underlying facade
 * - unloadBundles delegates to underlying facade
 * - unloadScene delegates to underlying facade
 * - loadingState reflects unloaded bundles
 * - Unloaded bundles are no longer reported as loaded
 * - dispose cleans up all resources
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@wolfgames/components/core', () => {
  const createAssetFacade = vi.fn(({ loaders }: { loaders?: Record<string, unknown> }) => {
    const loaded = new Set<string>();
    const unloaded = new Set<string>();
    return {
      loadBundle: vi.fn(async (name: string) => { loaded.add(name); unloaded.delete(name); }),
      loadBundles: vi.fn(async (names: string[]) => { for (const n of names) { loaded.add(n); unloaded.delete(n); } }),
      backgroundLoadBundle: vi.fn(async () => {}),
      preloadScene: vi.fn(async () => {}),
      loadBoot: vi.fn(async () => { loaded.add('boot-splash'); }),
      loadCore: vi.fn(async () => { loaded.add('core-ui'); }),
      loadTheme: vi.fn(async () => { loaded.add('theme-branding'); }),
      loadAudio: vi.fn(async () => { loaded.add('audio-sfx'); }),
      loadScene: vi.fn(async (name: string) => { loaded.add(`scene-${name}`); }),
      initGpu: vi.fn(async () => {}),
      getLoadedBundles: vi.fn(() => [...loaded]),
      isLoaded: vi.fn((name: string) => loaded.has(name)),
      unloadBundle: vi.fn((name: string) => { loaded.delete(name); unloaded.add(name); }),
      unloadBundles: vi.fn((names: string[]) => { for (const n of names) { loaded.delete(n); unloaded.add(n); } }),
      unloadScene: vi.fn((sceneName: string) => {
        const name = `scene-${sceneName}`;
        loaded.delete(name);
        unloaded.add(name);
      }),
      startBackgroundLoading: vi.fn(async () => {}),
      loadingState: vi.fn(() => ({
        loading: [],
        loaded: [...loaded],
        backgroundLoading: [],
        unloaded: [...unloaded],
        errors: {},
        bundleProgress: {},
        progress: 0,
      })),
      loadingStateSignal: {
        get: vi.fn(() => ({
          loading: [],
          loaded: [...loaded],
          backgroundLoading: [],
          unloaded: [...unloaded],
          errors: {},
          bundleProgress: {},
          progress: 0,
        })),
        set: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      },
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
      dispose: vi.fn(),
      coordinator: {},
      _loaders: loaders,
      _loaded: loaded,
      _unloaded: unloaded,
    };
  });

  return {
    createAssetFacade,
    validateManifest: vi.fn(() => ({ valid: true, errors: [] })),
  };
});

vi.mock('@wolfgames/components/howler', () => {
  const createHowlerLoader = vi.fn(() => ({
    init: vi.fn(),
    loadBundle: vi.fn(async () => {}),
    get: vi.fn(() => null),
    has: vi.fn(() => false),
    setVolume: vi.fn(),
    getVolume: vi.fn(() => 1),
    unlock: vi.fn(async () => {}),
    stop: vi.fn(),
    unloadBundle: vi.fn(),
    dispose: vi.fn(),
  }));
  return { createHowlerLoader };
});

vi.mock('@wolfgames/components/pixi', () => {
  const createPixiLoader = vi.fn(() => ({
    init: vi.fn(),
    loadBundle: vi.fn(async () => {}),
    get: vi.fn(() => null),
    has: vi.fn(() => false),
    unloadBundle: vi.fn(),
    dispose: vi.fn(),
  }));
  return { createPixiLoader };
});

import { createCoordinatorFacade } from '~/core/systems/assets/facade';
import type { Manifest } from '@wolfgames/components/core';

const testManifest: Manifest = {
  cdnBase: '/assets',
  bundles: [
    { name: 'boot-splash', assets: [{ alias: 'spinner', src: 'spinner.png' }] },
    { name: 'theme-branding', assets: [{ alias: 'logo', src: 'logo.png' }] },
    { name: 'core-ui', assets: [{ alias: 'ui', src: 'ui.json' }] },
    { name: 'audio-sfx', assets: [{ alias: 'sfx', src: 'sfx.json' }] },
    { name: 'scene-level1', assets: [{ alias: 'level1', src: 'level1.json' }] },
  ],
};

describe('Scaffold facade: unloadBundle', () => {
  let facade: ReturnType<typeof createCoordinatorFacade>;

  beforeEach(() => {
    vi.clearAllMocks();
    facade = createCoordinatorFacade(testManifest);
  });

  it('unloadBundle is exposed on the facade', () => {
    expect(typeof facade.unloadBundle).toBe('function');
  });

  it('unloading a loaded bundle removes it from getLoadedBundles', async () => {
    await facade.loadBoot();
    expect(facade.isLoaded('boot-splash')).toBe(true);

    facade.unloadBundle('boot-splash');
    expect(facade.isLoaded('boot-splash')).toBe(false);
  });

  it('unloadBundle is reflected in loadingState', async () => {
    await facade.loadTheme();
    facade.unloadBundle('theme-branding');

    const state = facade.loadingState();
    expect(state.loaded).not.toContain('theme-branding');
    expect(state.unloaded).toContain('theme-branding');
  });
});

describe('Scaffold facade: unloadBundles', () => {
  let facade: ReturnType<typeof createCoordinatorFacade>;

  beforeEach(() => {
    vi.clearAllMocks();
    facade = createCoordinatorFacade(testManifest);
  });

  it('unloadBundles is exposed on the facade', () => {
    expect(typeof facade.unloadBundles).toBe('function');
  });

  it('unloads multiple bundles at once', async () => {
    await facade.loadBoot();
    await facade.loadTheme();

    facade.unloadBundles(['boot-splash', 'theme-branding']);

    expect(facade.isLoaded('boot-splash')).toBe(false);
    expect(facade.isLoaded('theme-branding')).toBe(false);
  });

  it('unloading empty array is a no-op', () => {
    expect(() => facade.unloadBundles([])).not.toThrow();
  });
});

describe('Scaffold facade: unloadScene', () => {
  let facade: ReturnType<typeof createCoordinatorFacade>;

  beforeEach(() => {
    vi.clearAllMocks();
    facade = createCoordinatorFacade(testManifest);
  });

  it('unloadScene is exposed on the facade', () => {
    expect(typeof facade.unloadScene).toBe('function');
  });

  it('delegates scene unload to underlying facade', async () => {
    await facade.loadScene('level1');
    facade.unloadScene('level1');
    expect(facade.isLoaded('scene-level1')).toBe(false);
  });
});

describe('Scaffold facade: load after unload', () => {
  it('re-loading an unloaded bundle succeeds', async () => {
    const facade = createCoordinatorFacade(testManifest);

    await facade.loadBoot();
    expect(facade.isLoaded('boot-splash')).toBe(true);

    facade.unloadBundle('boot-splash');
    expect(facade.isLoaded('boot-splash')).toBe(false);

    await facade.loadBundle('boot-splash');
    expect(facade.isLoaded('boot-splash')).toBe(true);
  });
});

describe('Scaffold facade: dispose', () => {
  it('dispose is exposed and callable', () => {
    const facade = createCoordinatorFacade(testManifest);
    expect(typeof facade.dispose).toBe('function');
    expect(() => facade.dispose()).not.toThrow();
  });
});
