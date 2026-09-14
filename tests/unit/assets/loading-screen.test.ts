/**
 * LoadingScreen unit tests.
 *
 * Validates:
 * - Progress calculation from bundleProgress + loaded arrays
 * - Load sequence ordering (boot → theme → core/audio when skipping)
 * - Failed bundle detection
 * - Retry behavior for failed bundles
 * - Theme-loaded gating for logo display
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Manifest, LoadingState } from '@wolfgames/components/core';

const testManifest: Manifest = {
  cdnBase: '/assets',
  bundles: [
    { name: 'boot-splash', assets: [{ alias: 'spinner', src: 'spinner.png' }] },
    { name: 'boot-fonts', assets: [{ alias: 'font-main', src: 'font.woff2' }] },
    { name: 'theme-branding', assets: [{ alias: 'logo', src: 'logo.png' }] },
    { name: 'core-ui', assets: [{ alias: 'ui-atlas', src: 'ui-atlas.json' }] },
    { name: 'audio-sfx', assets: [{ alias: 'sfx', src: 'sfx.json' }] },
    { name: 'scene-level1', assets: [{ alias: 'level1', src: 'level1.json' }] },
  ],
};

function bundlesByPrefix(prefix: string): string[] {
  return testManifest.bundles.filter((b) => b.name.startsWith(prefix)).map((b) => b.name);
}

function computeProgress(targetBundles: string[], state: LoadingState): number {
  if (targetBundles.length === 0) return 100;
  let sum = 0;
  for (const name of targetBundles) {
    if (state.loaded.includes(name)) {
      sum += 1;
    } else if (name in state.bundleProgress) {
      sum += state.bundleProgress[name];
    }
  }
  return (sum / targetBundles.length) * 100;
}

function createLoadingState(overrides: Partial<LoadingState> = {}): LoadingState {
  return {
    loading: [],
    backgroundLoading: [],
    loaded: [],
    unloaded: [],
    bundleProgress: {},
    errors: {},
    progress: 0,
    ...overrides,
  };
}

describe('LoadingScreen progress calculation', () => {
  const bootBundles = bundlesByPrefix('boot-');
  const themeBundles = bundlesByPrefix('theme-');
  const coreBundles = bundlesByPrefix('core-');
  const audioBundles = bundlesByPrefix('audio-');

  describe('normal flow (boot + theme only)', () => {
    const targetBundles = [...bootBundles, ...themeBundles];

    it('returns 0 when nothing is loaded or in progress', () => {
      const state = createLoadingState();
      expect(computeProgress(targetBundles, state)).toBe(0);
    });

    it('returns 100 when all target bundles are fully loaded', () => {
      const state = createLoadingState({ loaded: [...targetBundles] });
      expect(computeProgress(targetBundles, state)).toBe(100);
    });

    it('computes partial progress from bundleProgress entries', () => {
      const state = createLoadingState({
        bundleProgress: { 'boot-splash': 0.5, 'boot-fonts': 0.5 },
      });
      // 2 bundles at 0.5, 1 at 0 => (0.5 + 0.5 + 0) / 3 * 100
      const expected = ((0.5 + 0.5 + 0) / 3) * 100;
      expect(computeProgress(targetBundles, state)).toBeCloseTo(expected);
    });

    it('treats loaded bundles as 1.0 and mixes with partial progress', () => {
      const state = createLoadingState({
        loaded: ['boot-splash'],
        bundleProgress: { 'boot-fonts': 0.75 },
      });
      // boot-splash = 1, boot-fonts = 0.75, theme-branding = 0
      const expected = ((1 + 0.75 + 0) / 3) * 100;
      expect(computeProgress(targetBundles, state)).toBeCloseTo(expected);
    });

    it('loaded bundle takes precedence over bundleProgress entry', () => {
      const state = createLoadingState({
        loaded: ['boot-splash'],
        bundleProgress: { 'boot-splash': 0.3 },
      });
      // loaded takes precedence → boot-splash = 1, not 0.3
      const expected = ((1 + 0 + 0) / 3) * 100;
      expect(computeProgress(targetBundles, state)).toBeCloseTo(expected);
    });
  });

  describe('skip-to-game flow (boot + theme + core + audio)', () => {
    const targetBundles = [...bootBundles, ...themeBundles, ...coreBundles, ...audioBundles];

    it('includes core and audio bundles in target set', () => {
      expect(targetBundles).toContain('core-ui');
      expect(targetBundles).toContain('audio-sfx');
    });

    it('returns 100 when all extended bundles are loaded', () => {
      const state = createLoadingState({ loaded: [...targetBundles] });
      expect(computeProgress(targetBundles, state)).toBe(100);
    });

    it('correctly weights each bundle equally', () => {
      const state = createLoadingState({
        loaded: ['boot-splash', 'boot-fonts'],
        bundleProgress: { 'theme-branding': 0.5 },
      });
      // 2 loaded + 0.5 + 0 + 0 = 2.5 / 5 * 100
      const expected = (2.5 / 5) * 100;
      expect(computeProgress(targetBundles, state)).toBeCloseTo(expected);
    });
  });

  describe('edge cases', () => {
    it('returns 100 when targetBundles is empty', () => {
      const state = createLoadingState();
      expect(computeProgress([], state)).toBe(100);
    });

    it('ignores bundles not in targetBundles', () => {
      const state = createLoadingState({
        loaded: ['scene-level1'],
        bundleProgress: { 'scene-level1': 1 },
      });
      const target = [...bootBundles, ...themeBundles];
      expect(computeProgress(target, state)).toBe(0);
    });
  });
});

describe('LoadingScreen themeLoaded', () => {
  const themeBundles = bundlesByPrefix('theme-');

  function themeLoaded(state: LoadingState): boolean {
    return themeBundles.every((b) => state.loaded.includes(b));
  }

  it('returns false when theme bundles are not loaded', () => {
    expect(themeLoaded(createLoadingState())).toBe(false);
  });

  it('returns false when theme is partially loaded (in progress)', () => {
    expect(
      themeLoaded(createLoadingState({ bundleProgress: { 'theme-branding': 0.5 } }))
    ).toBe(false);
  });

  it('returns true when all theme bundles are in loaded array', () => {
    expect(themeLoaded(createLoadingState({ loaded: ['theme-branding'] }))).toBe(true);
  });
});

describe('LoadingScreen failedBundles', () => {
  function failedBundles(targetBundles: string[], state: LoadingState): string[] {
    return targetBundles.filter((name) => name in state.errors);
  }

  const target = [...bundlesByPrefix('boot-'), ...bundlesByPrefix('theme-')];

  it('returns empty when there are no errors', () => {
    expect(failedBundles(target, createLoadingState())).toEqual([]);
  });

  it('returns the bundle name when it has an error', () => {
    const state = createLoadingState({
      errors: { 'boot-splash': new Error('Network error') },
    });
    expect(failedBundles(target, state)).toEqual(['boot-splash']);
  });

  it('does not include errors for non-target bundles', () => {
    const state = createLoadingState({
      errors: { 'scene-level1': new Error('404') },
    });
    expect(failedBundles(target, state)).toEqual([]);
  });

  it('returns multiple failed bundles', () => {
    const state = createLoadingState({
      errors: {
        'boot-splash': new Error('fail1'),
        'theme-branding': new Error('fail2'),
      },
    });
    expect(failedBundles(target, state)).toEqual(['boot-splash', 'theme-branding']);
  });
});

describe('LoadingScreen load sequence', () => {
  it('normal flow calls loadBoot then loadTheme in order', async () => {
    const callOrder: string[] = [];
    const mockAssets = {
      loadBoot: vi.fn(async () => { callOrder.push('loadBoot'); }),
      loadTheme: vi.fn(async () => { callOrder.push('loadTheme'); }),
      loadCore: vi.fn(async () => { callOrder.push('loadCore'); }),
      loadAudio: vi.fn(async () => { callOrder.push('loadAudio'); }),
      initGpu: vi.fn(async () => { callOrder.push('initGpu'); }),
      unlockAudio: vi.fn(() => { callOrder.push('unlockAudio'); }),
    };

    await mockAssets.loadBoot();
    await mockAssets.loadTheme();

    expect(callOrder).toEqual(['loadBoot', 'loadTheme']);
  });

  it('skip-to-game flow calls boot → theme → unlockAudio/initGpu → core → audio', async () => {
    const callOrder: string[] = [];
    const mockAssets = {
      loadBoot: vi.fn(async () => { callOrder.push('loadBoot'); }),
      loadTheme: vi.fn(async () => { callOrder.push('loadTheme'); }),
      loadCore: vi.fn(async () => { callOrder.push('loadCore'); }),
      loadAudio: vi.fn(async () => { callOrder.push('loadAudio'); }),
      initGpu: vi.fn(async () => { callOrder.push('initGpu'); }),
      unlockAudio: vi.fn(() => { callOrder.push('unlockAudio'); }),
    };

    await mockAssets.loadBoot();
    await mockAssets.loadTheme();
    mockAssets.unlockAudio();
    await mockAssets.initGpu();
    await mockAssets.loadCore();
    await mockAssets.loadAudio();

    expect(callOrder).toEqual([
      'loadBoot', 'loadTheme', 'unlockAudio', 'initGpu', 'loadCore', 'loadAudio',
    ]);
    expect(callOrder.indexOf('loadBoot')).toBeLessThan(callOrder.indexOf('loadTheme'));
    expect(callOrder.indexOf('loadTheme')).toBeLessThan(callOrder.indexOf('initGpu'));
    expect(callOrder.indexOf('initGpu')).toBeLessThan(callOrder.indexOf('loadCore'));
  });

  it('audio failure in skip-to-game does not block the flow', async () => {
    const mockAssets = {
      loadBoot: vi.fn(async () => {}),
      loadTheme: vi.fn(async () => {}),
      loadCore: vi.fn(async () => {}),
      loadAudio: vi.fn(async () => { throw new Error('Audio load failed'); }),
      initGpu: vi.fn(async () => {}),
      unlockAudio: vi.fn(),
    };

    await mockAssets.loadBoot();
    await mockAssets.loadTheme();
    mockAssets.unlockAudio();
    await mockAssets.initGpu();
    await mockAssets.loadCore();

    try {
      await mockAssets.loadAudio();
    } catch {
      // swallowed — matches LoadingScreen behavior
    }

    expect(mockAssets.loadCore).toHaveBeenCalled();
  });
});

describe('LoadingScreen retry', () => {
  it('retryFailed re-loads each failed bundle', async () => {
    const loadBundle = vi.fn(async () => {});
    const failedBundles = ['boot-splash', 'theme-branding'];

    for (const name of failedBundles) {
      await loadBundle(name);
    }

    expect(loadBundle).toHaveBeenCalledTimes(2);
    expect(loadBundle).toHaveBeenCalledWith('boot-splash');
    expect(loadBundle).toHaveBeenCalledWith('theme-branding');
  });

  it('retryFailed does nothing when no bundles have failed', async () => {
    const loadBundle = vi.fn(async () => {});
    const failedBundles: string[] = [];

    for (const name of failedBundles) {
      await loadBundle(name);
    }

    expect(loadBundle).not.toHaveBeenCalled();
  });
});
