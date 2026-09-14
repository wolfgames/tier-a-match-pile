/**
 * Screen asset loading tests.
 *
 * Validates the ScreenProvider's onBeforeScreenChange and onScreenChange
 * behavior using createScreenManager directly (no Solid rendering needed):
 *
 * - Required bundles are loaded before screen transition completes
 * - Optional bundles are background-loaded (non-blocking)
 * - Bundles are unloaded when leaving a screen (if not needed by target)
 * - Shared bundles between screens are preserved across transitions
 * - Missing asset config doesn't throw
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScreenManager, type ScreenManagerOptions } from '~/core/systems/screens/manager';
import type { ScreenAssetConfig, ScreenId } from '~/core/systems/screens/types';

function createMockAssets() {
  const loaded = new Set<string>();
  return {
    loaded,
    coordinator: {
      isLoaded: vi.fn((name: string) => loaded.has(name)),
    },
    loadBundle: vi.fn(async (name: string) => { loaded.add(name); }),
    backgroundLoadBundle: vi.fn(async (name: string) => { loaded.add(name); }),
    unloadBundles: vi.fn((names: string[]) => {
      for (const n of names) loaded.delete(n);
    }),
  };
}

function buildManagerOptions(
  assets: ReturnType<typeof createMockAssets>,
  screenAssets: Partial<Record<ScreenId, ScreenAssetConfig>>,
): ScreenManagerOptions {
  return {
    initialScreen: 'loading',
    transition: { duration: 0, type: 'none' },
    screenAssets,
    onBeforeScreenChange: async (_from, _to, config) => {
      if (!config) return;
      if (config.required?.length) {
        await Promise.all(
          config.required
            .filter((b) => !assets.coordinator.isLoaded(b))
            .map((b) => assets.loadBundle(b)),
        );
      }
      if (config.optional?.length) {
        for (const name of config.optional) {
          if (!assets.coordinator.isLoaded(name)) {
            assets.backgroundLoadBundle(name);
          }
        }
      }
    },
    onScreenChange: (from, to) => {
      const getBundles = (screen: ScreenId | null): string[] => {
        if (!screen) return [];
        const config = screenAssets[screen];
        return [...(config?.required ?? []), ...(config?.optional ?? [])];
      };

      const fromBundles = getBundles(from);
      if (fromBundles.length > 0) {
        const toBundles = new Set(getBundles(to));
        const toUnload = fromBundles.filter((b) => !toBundles.has(b));
        if (toUnload.length > 0) {
          assets.unloadBundles(toUnload);
        }
      }
    },
  };
}

describe('Screen asset loading: onBeforeScreenChange', () => {
  let assets: ReturnType<typeof createMockAssets>;
  const screenAssets: Partial<Record<ScreenId, ScreenAssetConfig>> = {
    start: { required: ['theme-branding'] },
    game: { required: ['core-ui', 'scene-level1'], optional: ['audio-sfx'] },
    results: { required: ['theme-branding'] },
  };

  beforeEach(() => {
    assets = createMockAssets();
  });

  it('loads required bundles before showing the target screen', async () => {
    const manager = createScreenManager(buildManagerOptions(assets, screenAssets));

    await manager.goto('start');
    expect(assets.loadBundle).toHaveBeenCalledWith('theme-branding');
    expect(assets.loaded.has('theme-branding')).toBe(true);
  });

  it('loads all required bundles for game screen', async () => {
    const manager = createScreenManager(buildManagerOptions(assets, screenAssets));

    await manager.goto('game');
    expect(assets.loadBundle).toHaveBeenCalledWith('core-ui');
    expect(assets.loadBundle).toHaveBeenCalledWith('scene-level1');
  });

  it('background-loads optional bundles', async () => {
    const manager = createScreenManager(buildManagerOptions(assets, screenAssets));

    await manager.goto('game');
    expect(assets.backgroundLoadBundle).toHaveBeenCalledWith('audio-sfx');
  });

  it('does not re-load already loaded required bundles', async () => {
    assets.loaded.add('core-ui');
    const manager = createScreenManager(buildManagerOptions(assets, screenAssets));

    await manager.goto('game');
    expect(assets.loadBundle).not.toHaveBeenCalledWith('core-ui');
    expect(assets.loadBundle).toHaveBeenCalledWith('scene-level1');
  });

  it('does not re-load already loaded optional bundles', async () => {
    assets.loaded.add('audio-sfx');
    const manager = createScreenManager(buildManagerOptions(assets, screenAssets));

    await manager.goto('game');
    expect(assets.backgroundLoadBundle).not.toHaveBeenCalledWith('audio-sfx');
  });

  it('handles screen with no asset config gracefully', async () => {
    const manager = createScreenManager(buildManagerOptions(assets, screenAssets));

    // 'loading' has no screenAssets entry
    await expect(manager.goto('start')).resolves.toBeUndefined();
  });
});

describe('Screen asset loading: onScreenChange (unload)', () => {
  let assets: ReturnType<typeof createMockAssets>;
  const screenAssets: Partial<Record<ScreenId, ScreenAssetConfig>> = {
    start: { required: ['theme-branding'] },
    game: { required: ['core-ui', 'scene-level1'], optional: ['audio-sfx'] },
    results: { required: ['theme-branding'] },
  };

  beforeEach(() => {
    assets = createMockAssets();
  });

  it('unloads bundles when leaving a screen that the next screen does not need', async () => {
    const manager = createScreenManager(buildManagerOptions(assets, screenAssets));

    await manager.goto('game');
    assets.unloadBundles.mockClear();

    await manager.goto('results');

    expect(assets.unloadBundles).toHaveBeenCalled();
    const unloadedNames = assets.unloadBundles.mock.calls[0][0] as string[];
    expect(unloadedNames).toContain('core-ui');
    expect(unloadedNames).toContain('scene-level1');
    expect(unloadedNames).toContain('audio-sfx');
  });

  it('preserves shared bundles when transitioning between screens', async () => {
    const manager = createScreenManager(buildManagerOptions(assets, screenAssets));

    await manager.goto('start');
    assets.unloadBundles.mockClear();

    await manager.goto('results');

    // theme-branding is required by both start and results
    if (assets.unloadBundles.mock.calls.length > 0) {
      const unloadedNames = assets.unloadBundles.mock.calls[0][0] as string[];
      expect(unloadedNames).not.toContain('theme-branding');
    }
  });

  it('does not call unloadBundles when leaving a screen with no bundles', async () => {
    const manager = createScreenManager(buildManagerOptions(assets, screenAssets));

    // loading → start: loading has no bundles configured
    await manager.goto('start');
    expect(assets.unloadBundles).not.toHaveBeenCalled();
  });
});

describe('Screen transitions and asset lifecycle', () => {
  it('full lifecycle: loading → start → game → results', async () => {
    const assets = createMockAssets();
    const screenAssets: Partial<Record<ScreenId, ScreenAssetConfig>> = {
      start: { required: ['theme-branding'] },
      game: { required: ['core-ui', 'scene-level1'], optional: ['audio-sfx'] },
      results: { required: ['theme-branding', 'core-ui'] },
    };
    const manager = createScreenManager(buildManagerOptions(assets, screenAssets));

    expect(manager.current()).toBe('loading');

    // → start
    await manager.goto('start');
    expect(manager.current()).toBe('start');
    expect(assets.loaded.has('theme-branding')).toBe(true);

    // → game
    await manager.goto('game');
    expect(manager.current()).toBe('game');
    expect(assets.loaded.has('core-ui')).toBe(true);
    expect(assets.loaded.has('scene-level1')).toBe(true);

    // → results (should unload scene-level1, audio-sfx; keep core-ui, theme-branding)
    await manager.goto('results');
    expect(manager.current()).toBe('results');
    expect(assets.loaded.has('theme-branding')).toBe(true);
    expect(assets.loaded.has('core-ui')).toBe(true);
    expect(assets.loaded.has('scene-level1')).toBe(false);
  });

  it('going to same screen is a no-op', async () => {
    const assets = createMockAssets();
    const manager = createScreenManager(buildManagerOptions(assets, {
      start: { required: ['theme-branding'] },
    }));

    await manager.goto('start');
    const callCount = assets.loadBundle.mock.calls.length;

    await manager.goto('start');
    expect(assets.loadBundle.mock.calls.length).toBe(callCount);
  });
});
