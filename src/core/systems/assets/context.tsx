import { createContext, useContext } from 'solid-js';
import type { Accessor, ParentProps } from 'solid-js';
import type { LoadingState } from '@wolfgames/components/core';
import { useSignal } from '@wolfgames/components/solid';
import type { ProgressCallback } from './types';
import { createCoordinatorFacade } from './facade';
import type { AssetCoordinatorFacade } from './facade';
import { useManifest } from '@wolfgames/components/solid';

/**
 * Scaffold-specific asset context.
 *
 * Wraps game-components' AssetFacade (via createCoordinatorFacade) and adds
 * scaffold concerns: auto-created PixiLoader, audio unlock convenience, and
 * HowlerLoader-backed audio helpers.
 *
 * The facade's `ready` and `gpuReady` signals are managed by game-components
 * (set after loadBoot/initGpu complete). This provider bridges them into
 * Solid accessors so screens can react to phase completion.
 */
interface AssetContextValue {
  coordinator: AssetCoordinatorFacade;
  loadingState: Accessor<LoadingState>;
  ready: () => boolean;
  gpuReady: () => boolean;
  loadBundle: (name: string, onProgress?: ProgressCallback) => Promise<void>;
  backgroundLoadBundle: (name: string) => Promise<void>;
  preloadScene: (name: string) => Promise<void>;
  loadBoot: (onProgress?: ProgressCallback) => Promise<void>;
  loadCore: (onProgress?: ProgressCallback) => Promise<void>;
  loadTheme: (onProgress?: ProgressCallback) => Promise<void>;
  loadAudio: (onProgress?: ProgressCallback) => Promise<void>;
  loadScene: (name: string, onProgress?: ProgressCallback) => Promise<void>;
  initGpu: () => Promise<void>;
  unlockAudio: () => Promise<void>;
  unloadBundle: (name: string) => void;
  unloadBundles: (names: string[]) => void;
  unloadScene: (sceneName: string) => void;
}

const AssetContext = createContext<AssetContextValue>();

export function AssetProvider(props: ParentProps) {
  const { manifest } = useManifest();
  const facade = createCoordinatorFacade(manifest());

  const cdnBase = manifest().cdnBase;
  const isRemote = cdnBase.startsWith('http');
  console.log(`[Assets] ${isRemote ? 'CDN' : 'Local'}: ${cdnBase}`);

  const loadingState = useSignal(facade.loadingStateSignal);
  const ready = useSignal(facade.ready);
  const gpuReady = useSignal(facade.gpuReady);

  const value: AssetContextValue = {
    coordinator: facade,
    loadingState,
    ready,
    gpuReady,

    loadBundle: (name, onProgress?) => facade.loadBundle(name, onProgress),
    backgroundLoadBundle: (name) => facade.backgroundLoadBundle(name),
    preloadScene: (name) => facade.preloadScene(name),
    loadBoot: (onProgress?) => facade.loadBoot(onProgress),
    loadCore: (onProgress?) => facade.loadCore(onProgress),
    loadTheme: (onProgress?) => facade.loadTheme(onProgress),
    loadAudio: (onProgress?) => facade.loadAudio(onProgress),
    loadScene: (name, onProgress?) => facade.loadScene(name, onProgress),
    initGpu: () => facade.initGpu(),
    unlockAudio: () => facade.audio.unlock(),
    unloadBundle: (name) => facade.unloadBundle(name),
    unloadBundles: (names) => facade.unloadBundles(names),
    unloadScene: (sceneName) => facade.unloadScene(sceneName),
  };

  return (
    <AssetContext.Provider value={value}>
      {props.children}
    </AssetContext.Provider>
  );
}

export function useAssets() {
  const context = useContext(AssetContext);
  if (!context) {
    throw new Error('useAssets must be used within AssetProvider');
  }
  return context;
}

export function useAssetCoordinator() {
  return useAssets().coordinator;
}

export function useLoadingState() {
  return useAssets().loadingState;
}

export type { AssetCoordinatorFacade } from './facade';
