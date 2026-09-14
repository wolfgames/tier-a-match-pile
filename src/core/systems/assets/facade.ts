/**
 * Thin scaffold wrapper over game-components' createAssetFacade.
 *
 * createAssetFacade owns the coordinator, the DOM loader, the loading-phase
 * methods, the ready/gpuReady signals, and — as of @wolfgames/components
 * 0.1.33 — lazy GPU init: initGpu() dynamically imports Pixi
 * (@wolfgames/components/pixi) on first call, so Pixi stays out of the eager
 * entry bundle. This wrapper only adds scaffold-specific concerns:
 * - a Howler-backed `audio` convenience API (play / stop / setMasterVolume / unlock)
 * - a `getGpuLoader()` accessor
 *
 * IMPORTANT: Pixi must never be imported as a *value* in this module (only
 * `import type`), or it gets pinned back into the eager graph. The single
 * runtime path to Pixi is createAssetFacade.initGpu()'s dynamic import.
 */

import {
  createAssetFacade,
  type Manifest,
  type LoadingState,
  type Signal,
} from '@wolfgames/components/core';
import { createHowlerLoader } from '@wolfgames/components/howler';
import type { PixiLoader } from '@wolfgames/components/pixi';
import type { Howl } from 'howler';
import type { ProgressCallback } from './types';

type LoaderType = 'dom' | 'gpu' | 'audio';

export interface AssetCoordinatorFacade {
  loadingState(): LoadingState;
  loadingStateSignal: Signal<LoadingState>;
  ready: Signal<boolean>;
  gpuReady: Signal<boolean>;
  isLoaded(bundleName: string): boolean;
  dom: {
    getFrameURL(atlasAlias: string, frameName: string): Promise<string>;
  };
  loadBundle(name: string, onProgress?: ProgressCallback): Promise<void>;
  backgroundLoadBundle(name: string): Promise<void>;
  preloadScene(name: string): Promise<void>;
  loadBoot(onProgress?: ProgressCallback): Promise<void>;
  loadCore(onProgress?: ProgressCallback): Promise<void>;
  loadTheme(onProgress?: ProgressCallback): Promise<void>;
  loadAudio(onProgress?: ProgressCallback): Promise<void>;
  loadScene(name: string, onProgress?: ProgressCallback): Promise<void>;
  initGpu(): Promise<void>;
  unloadBundle(name: string): void;
  unloadBundles(names: string[]): void;
  unloadScene(sceneName: string): void;
  audio: {
    play(channel: string, sprite?: string, opts?: { volume?: number; loop?: boolean }): number;
    stop(channel: string, id?: number): void;
    setMasterVolume(volume: number): void;
    unlock(): Promise<void>;
  };
  getLoader<T = unknown>(type: LoaderType): T | null;
  getGpuLoader(): PixiLoader | null;
  dispose(): void;
}

export function createCoordinatorFacade(manifest: Manifest): AssetCoordinatorFacade {
  const howlerLoader = createHowlerLoader();

  // createAssetFacade creates its own DOM loader and owns lazy GPU init; we
  // only inject the audio (Howler) loader.
  const facade = createAssetFacade({
    manifest,
    loaders: { audio: howlerLoader },
  });

  return {
    loadingState: facade.loadingState,
    loadingStateSignal: facade.loadingStateSignal,
    ready: facade.ready,
    gpuReady: facade.gpuReady,
    isLoaded: (name) => facade.isLoaded(name),
    dom: {
      getFrameURL: (atlasAlias, frameName) => facade.dom.getFrameURL(atlasAlias, frameName),
    },

    loadBundle: (name, onProgress) => facade.loadBundle(name, onProgress),
    backgroundLoadBundle: (name) => facade.backgroundLoadBundle(name),
    preloadScene: (name) => facade.preloadScene(name),
    loadBoot: (onProgress) => facade.loadBoot(onProgress),
    loadCore: (onProgress) => facade.loadCore(onProgress),
    loadTheme: (onProgress) => facade.loadTheme(onProgress),
    loadAudio: (onProgress) => facade.loadAudio(onProgress),
    loadScene: (name, onProgress) => facade.loadScene(name, onProgress),

    // No argument → createAssetFacade dynamically imports Pixi on first call.
    initGpu: () => facade.initGpu(),

    unloadBundle: (name) => facade.unloadBundle(name),
    unloadBundles: (names) => facade.unloadBundles(names),
    unloadScene: (sceneName) => facade.unloadScene(sceneName),

    audio: {
      play(channel, sprite, opts) {
        const howl = howlerLoader.get(channel) as Howl | null;
        if (!howl) return -1;
        if (opts?.volume != null) howl.volume(opts.volume);
        const id = howl.play(sprite);
        if (opts?.loop != null) howl.loop(opts.loop, id);
        return id;
      },
      stop(channel, id) {
        howlerLoader.stop(channel, id);
      },
      setMasterVolume(volume) {
        howlerLoader.setVolume(volume);
      },
      unlock() {
        return howlerLoader.unlock();
      },
    },

    getLoader: <T = unknown>(type: LoaderType) => facade.getLoader(type) as T | null,
    getGpuLoader: () => facade.getLoader<PixiLoader>('gpu'),
    dispose: () => facade.dispose(),
  };
}
