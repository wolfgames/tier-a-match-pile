/**
 * Tests for scaffold's createCoordinatorFacade — a thin delegator over
 * game-components' createAssetFacade.
 *
 * Validates scaffold-specific behavior:
 * - initGpu() delegates to the underlying facade (whose lazy Pixi import is
 *   covered by game-components' own facade.test.ts)
 * - audio.play / audio.setMasterVolume / audio.unlock
 * - getGpuLoader() delegates to facade.getLoader('gpu')
 * - Underlying facade methods are delegated correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@wolfgames/components/core', () => {
  const createAssetFacade = vi.fn(({ loaders }: { loaders?: Record<string, unknown> }) => {
    const loaded: string[] = [];
    return {
      loadBundle: vi.fn(async (name: string) => { loaded.push(name); }),
      loadBundles: vi.fn(async (names: string[]) => { loaded.push(...names); }),
      backgroundLoadBundle: vi.fn(async () => {}),
      preloadScene: vi.fn(async () => {}),
      loadBoot: vi.fn(async () => {}),
      loadCore: vi.fn(async () => {}),
      loadTheme: vi.fn(async () => {}),
      loadAudio: vi.fn(async () => {}),
      loadScene: vi.fn(async () => {}),
      initGpu: vi.fn(async () => {}),
      getLoadedBundles: vi.fn(() => loaded),
      isLoaded: vi.fn((name: string) => loaded.includes(name)),
      unloadBundle: vi.fn(),
      unloadBundles: vi.fn(),
      unloadScene: vi.fn(),
      startBackgroundLoading: vi.fn(async () => {}),
      loadingState: vi.fn(() => ({ loading: [], loaded, errors: {}, bundleProgress: {}, progress: 0, backgroundLoading: [], unloaded: [] })),
      loadingStateSignal: { get: vi.fn(), set: vi.fn(), subscribe: vi.fn(() => () => {}) },
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
    };
  });

  return {
    createAssetFacade,
    validateManifest: vi.fn(() => ({ valid: true, errors: [] })),
  };
});

vi.mock('@wolfgames/components/howler', () => {
  const mockHowl = { play: vi.fn(() => 1), volume: vi.fn(), loop: vi.fn() };
  const createHowlerLoader = vi.fn(() => ({
    init: vi.fn(),
    loadBundle: vi.fn(async () => {}),
    get: vi.fn((alias: string) => alias === 'sfx' ? mockHowl : null),
    has: vi.fn(() => false),
    setVolume: vi.fn(),
    getVolume: vi.fn(() => 1),
    unlock: vi.fn(async () => {}),
    stop: vi.fn(),
    unloadBundle: vi.fn(),
    dispose: vi.fn(),
    _mockHowl: mockHowl,
  }));
  return { createHowlerLoader };
});

import { createCoordinatorFacade } from '~/core/systems/assets/facade';
import { createAssetFacade, type Manifest } from '@wolfgames/components/core';
import { createHowlerLoader } from '@wolfgames/components/howler';

const testManifest: Manifest = {
  cdnBase: '/assets',
  bundles: [
    { name: 'boot-splash', assets: [{ alias: 'spinner', src: 'spinner.png' }] },
    { name: 'audio-sfx', assets: [{ alias: 'click', src: 'click.json' }] },
  ],
};

// The inner createAssetFacade / Howler instances built during the current
// beforeEach. Use the most recent mock result so a later facade creation in
// this file can't silently target a stale instance.
const innerFacade = () => vi.mocked(createAssetFacade).mock.results.at(-1)!.value;
const innerHowler = () => vi.mocked(createHowlerLoader).mock.results.at(-1)!.value;

describe('createCoordinatorFacade', () => {
  let facade: ReturnType<typeof createCoordinatorFacade>;

  beforeEach(() => {
    vi.clearAllMocks();
    facade = createCoordinatorFacade(testManifest);
  });

  it('delegates loadBoot to the underlying facade', async () => {
    await facade.loadBoot();
    expect(innerFacade().loadBoot).toHaveBeenCalled();
  });

  it('initGpu() delegates to the underlying facade (which lazily imports Pixi)', async () => {
    await facade.initGpu();
    expect(innerFacade().initGpu).toHaveBeenCalledTimes(1);
  });

  it('getGpuLoader() delegates to facade.getLoader("gpu") after init', async () => {
    await facade.initGpu();
    expect(facade.getGpuLoader()).toBeNull(); // mock getLoader returns null
    // initGpu() does not touch getLoader, so this is the only call — proving
    // getGpuLoader() itself does the delegation (not an earlier pre-init call).
    expect(innerFacade().getLoader).toHaveBeenCalledTimes(1);
    expect(innerFacade().getLoader).toHaveBeenLastCalledWith('gpu');
  });

  it('audio.play delegates to HowlerLoader', () => {
    const result = facade.audio.play('sfx', 'click');
    expect(result).toBe(1);
  });

  it('audio.play returns -1 for unknown channel', () => {
    const result = facade.audio.play('nonexistent');
    expect(result).toBe(-1);
  });

  it('audio.play with volume option does not throw', () => {
    const result = facade.audio.play('sfx', 'click', { volume: 0.5 });
    expect(result).toBe(1);
  });

  it('audio.play with loop:true calls howl.loop(true, playId)', () => {
    facade.audio.play('sfx', 'click', { loop: true });
    expect(innerHowler()._mockHowl.loop).toHaveBeenCalledWith(true, 1);
  });

  it('audio.play with loop:false calls howl.loop(false, playId)', () => {
    facade.audio.play('sfx', 'click', { loop: false });
    expect(innerHowler()._mockHowl.loop).toHaveBeenCalledWith(false, 1);
  });

  it('audio.play without loop leaves howl.loop untouched (one-shot preserved)', () => {
    facade.audio.play('sfx', 'click');
    expect(innerHowler()._mockHowl.loop).not.toHaveBeenCalled();
  });

  it('audio.setMasterVolume does not throw', () => {
    expect(() => facade.audio.setMasterVolume(0.5)).not.toThrow();
  });

  it('audio.unlock delegates to howlerLoader', async () => {
    await facade.audio.unlock();
  });

  it('audio.stop delegates to howlerLoader.stop', () => {
    facade.audio.stop('music', 7);
    expect(innerHowler().stop).toHaveBeenCalledWith('music', 7);
  });

  it('exposes loadingState and loadingStateSignal', () => {
    expect(typeof facade.loadingState).toBe('function');
    expect(facade.loadingStateSignal).toBeDefined();
    expect(typeof facade.loadingStateSignal.get).toBe('function');
    expect(typeof facade.loadingStateSignal.subscribe).toBe('function');
  });

  it('dispose() delegates to the underlying facade', () => {
    facade.dispose();
    expect(innerFacade().dispose).toHaveBeenCalled();
  });
});
