import { batch, createSignal } from 'solid-js';
import type { ScreenId, ScreenAssetConfig, TransitionState, TransitionConfig } from './types';
import { DEFAULT_TRANSITION } from './types';

export interface ScreenManagerOptions {
  initialScreen?: ScreenId;
  transition?: TransitionConfig;
  screenAssets?: Partial<Record<ScreenId, ScreenAssetConfig>>;
  onScreenChange?: (from: ScreenId | null, to: ScreenId) => void;
  /** Called before transition to load required bundles. Awaited before screen switch. */
  onBeforeScreenChange?: (from: ScreenId, to: ScreenId, config?: ScreenAssetConfig) => Promise<void>;
}

export function createScreenManager(options: ScreenManagerOptions = {}) {
  const [current, setCurrent] = createSignal<ScreenId>(options.initialScreen ?? 'loading');
  const [previous, setPrevious] = createSignal<ScreenId | null>(null);
  const [transition, setTransition] = createSignal<TransitionState>('idle');
  const [data, setData] = createSignal<Record<string, unknown>>({});

  const transitionConfig = options.transition ?? DEFAULT_TRANSITION;

  let transitionPromise: Promise<void> | null = null;

  async function goto(screen: ScreenId, screenData?: Record<string, unknown>): Promise<void> {
    // Wait for any in-progress transition
    if (transitionPromise) {
      await transitionPromise;
    }

    const from = current();
    if (from === screen) return;

    transitionPromise = performTransition(from, screen, screenData);
    await transitionPromise;
    transitionPromise = null;
  }

  function switchScreen(
    from: ScreenId,
    to: ScreenId,
    screenData?: Record<string, unknown>
  ): void {
    batch(() => {
      setPrevious(from);
      setCurrent(to);
      setData(screenData ?? {});
    });
    options.onScreenChange?.(from, to);
  }

  async function performTransition(
    from: ScreenId,
    to: ScreenId,
    screenData?: Record<string, unknown>
  ): Promise<void> {
    const { duration, type } = transitionConfig;
    const assetConfig = options.screenAssets?.[to];

    if (type === 'none' || duration === 0) {
      await options.onBeforeScreenChange?.(from, to, assetConfig);
      switchScreen(from, to, screenData);
      return;
    }

    // Transition out
    setTransition('out');
    await sleep(duration);

    // Load required assets for target screen before switching
    await options.onBeforeScreenChange?.(from, to, assetConfig);

    switchScreen(from, to, screenData);

    // Transition in
    setTransition('in');
    await sleep(duration);

    // Done
    setTransition('idle');
  }

  async function back(): Promise<void> {
    const prev = previous();
    if (prev) {
      await goto(prev);
    }
  }

  function getTransitionClass(): string {
    const state = transition();
    const { type } = transitionConfig;

    if (state === 'idle') return 'opacity-100';

    if (type === 'fade') {
      return state === 'out' ? 'opacity-0' : 'opacity-100';
    }

    if (type === 'slide') {
      return state === 'out'
        ? 'translate-x-full opacity-0'
        : 'translate-x-0 opacity-100';
    }

    return '';
  }

  return {
    current,
    previous,
    transition,
    data,
    goto,
    back,
    getTransitionClass,
    transitionConfig,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ScreenManager = ReturnType<typeof createScreenManager>;
