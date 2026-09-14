import { createMemo, createSignal, onMount } from 'solid-js';
import { ContentLoader } from '@wolfgames/components/modules/prefabs/screen-content-loader';
import { useScreen } from '~/core/systems/screens';
import { useAssets, useLoadingState } from '~/core/systems/assets';
import { useManifest } from '@wolfgames/components/solid';
import { useTuning, type ScaffoldTuning } from '~/core';
import type { GameTuning } from '~/game/tuning';
import { gameConfig } from '~/game/config';
import { useGameTracking } from '~/game/setup/tracking';

export function LoadingScreen() {
  const { goto } = useScreen();
  const assets = useAssets();
  const loadingState = useLoadingState();
  const { manifest } = useManifest();
  const tuning = useTuning<ScaffoldTuning, GameTuning>();
  const { trackStartScreenSkipped } = useGameTracking();

  const m = manifest();
  const bundlesByPrefix = (prefix: string) =>
    m.bundles.filter((b) => b.name.startsWith(prefix)).map((b) => b.name);

  // boot-splash: needed for loading animation. Other boot-* bundles (e.g. boot-ui)
  // are title-screen assets — background-load them when skipping to avoid blocking.
  const splashBundles = m.bundles
    .filter((b) => b.name.startsWith('boot-splash'))
    .map((b) => b.name);
  const titleBootBundles = m.bundles
    .filter((b) => b.name.startsWith('boot-') && !b.name.startsWith('boot-splash'))
    .map((b) => b.name);
  const themeBundles = bundlesByPrefix('theme-');
  const coreBundles = bundlesByPrefix('core-');
  const audioBundles = bundlesByPrefix('audio-');

  type SkipSource = 'config' | 'dev_mode' | 'url_param';

  const resolveSkipSource = (): SkipSource | null => {
    if (gameConfig.skipStartScreen) return 'config';
    if (tuning.game.devMode?.skipStartScreen) return 'dev_mode';
    const params = new URLSearchParams(window.location.search);
    if (params.get('screen') === 'game') return 'url_param';
    return null;
  };

  const skipSource = resolveSkipSource();
  const skipToGame = skipSource !== null;

  // When skipping: block on splash + theme + core + audio; title boot assets load in background.
  // When not skipping: block only on splash + theme (start screen loads the rest).
  const targetBundles = skipToGame
    ? [...splashBundles, ...themeBundles, ...coreBundles, ...audioBundles]
    : [...splashBundles, ...themeBundles];

  /* progress: 0–1 across all target bundles */
  const progress = createMemo(() => {
    const s = loadingState();
    if (targetBundles.length === 0) return 1;
    let sum = 0;
    for (const name of targetBundles) {
      if (s.loaded.includes(name)) sum += 1;
      else if (s.loading.includes(name)) sum += 0.5;
    }
    return sum / targetBundles.length;
  });

  const splashAsset = m.bundles
    .find((b) => b.name === 'boot-splash')
    ?.assets.find((a) => (a as { alias?: string }).alias === 'splash-hero');

  /* heroUrl becomes non-null once boot-splash resolves */
  const heroUrl = createMemo<string | null>(() => {
    const s = loadingState();
    if (!splashBundles.some((b) => s.loaded.includes(b))) return null;
    if (!splashAsset) return null;
    // A manifest swapped in at runtime may arrive without cdnBase, and an
    // undefined base reads as the literal string in the join below.
    const base = splashAsset.base ?? m.cdnBase ?? m.localBase ?? '/assets';
    return `${base}/${splashAsset.src}`;
  });

  const [shouldExit, setShouldExit] = createSignal(false);

  onMount(async () => {
    try {
      if (skipToGame) {
        trackStartScreenSkipped({ skip_source: skipSource });
        // Load splash + theme blocking; title boot bundles load in background (never rendered).
        for (const name of titleBootBundles) assets.backgroundLoadBundle(name);
        await assets.loadBoot();
        await assets.loadTheme();
        assets.unlockAudio();
        await assets.initGpu();
        await assets.loadCore();
        try {
          await assets.loadAudio();
        } catch (err) {
          console.warn('Audio loading failed:', err);
        }
        await new Promise((r) => setTimeout(r, 300));
      } else {
        await assets.loadBoot();
        await assets.loadTheme();
        await new Promise((r) => setTimeout(r, 500));
      }
      setShouldExit(true);
    } catch (err) {
      console.error('Failed to load initial assets:', err);
    }
  });

  /* ContentLoader roots itself at `position: absolute; inset: 0` — it fills
     whatever box the host gives it. Unwrapped inside the design root that box is
     the 390x844 canvas, so the splash painted a column with bands down both sides
     of any phone shorter than the canvas ratio. The `design-box-span` wrapper is
     the frame box, and ContentLoader's own `inset: 0` then resolves against it.
     `pointer-events-auto` opts this fully-DOM screen back in, since GameShell
     passes events through for the gameplay screen's canvas.
     See @wolfgames/components docs/standards/components.md §9.5.2. */
  return (
    <div class="design-box-span pointer-events-auto">
    <ContentLoader
      heroUrl={heroUrl()}
      progress={progress}
      exitSignal={shouldExit}
      onExitComplete={() => goto(skipToGame ? 'game' : 'start')}
      bgColor="#1a1a2e"
      enterAnimation="rise"
      heroAmbient="gentle"
      exitAnimation="fade"
    />
    </div>
  );
}
