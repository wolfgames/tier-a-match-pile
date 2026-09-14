import type { Accessor } from 'solid-js';
import type { Store } from 'solid-js/store';

// ============================================
// SCAFFOLD TUNING TYPES
// ============================================

export interface EngineConfig {
  targetFps: number;
  antialias: boolean;
  backgroundAlpha: number;
  resolution: number;
}

export interface DebugConfig {
  showFps: boolean;
  showHitboxes: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'none';
}

export interface AnimationDefaults {
  defaultDuration: number;
  defaultEasing: string;
  transitionDuration: number;
  transitionType: 'fade' | 'slide' | 'none';
}

export interface AudioConfig {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  fadeInDuration: number;
  fadeOutDuration: number;
}

export interface PerformanceConfig {
  maxParticles: number;
  spritePoolSize: number;
  enableCulling: boolean;
}

export interface ScreensConfig {
  loadingMinDuration: number;
  loadingFadeOut: number;
}

export interface TuningPanelConfig {
  position: 'left' | 'center' | 'right';
}

import type { ViewportMode, ViewportConfig } from '@wolfgames/components/core';
export type { ViewportMode, ViewportConfig };

export interface ScaffoldTuning {
  version: string;
  engine: EngineConfig;
  debug: DebugConfig;
  animation: AnimationDefaults;
  audio: AudioConfig;
  performance: PerformanceConfig;
  screens: ScreensConfig;
  tuningPanel: TuningPanelConfig;
  viewport: ViewportConfig;
}

// ============================================
// GAME TUNING BASE TYPE
// ============================================

export interface GameTuningBase {
  version: string;
}

// ============================================
// TUNING STATE TYPES
// ============================================

export type TuningSource = 'local' | 'localStorage';

export interface TuningLoadResult<T> {
  data: T;
  source: TuningSource;
}

export interface TuningState<S extends ScaffoldTuning, G extends GameTuningBase> {
  // Stores for fine-grained reactivity - access paths directly (e.g., tuning.game.grid.tileSize)
  // Only effects that access specific paths will re-run when those paths change
  scaffold: Store<S>;
  game: Store<G>;
  isLoaded: Accessor<boolean>;
  loadError: Accessor<string | null>;
  source: Accessor<{ scaffold: TuningSource; game: TuningSource }>;

  // Default values
  scaffoldDefaults: S;
  gameDefaults: G;

  // Mutators
  setScaffoldPath: (path: string, value: unknown) => void;
  setGamePath: (path: string, value: unknown) => void;
  /** Apply overrides without saving to localStorage (for URL params) */
  applyGameOverrides: (overrides: Record<string, unknown>) => void;

  // Actions
  load: () => Promise<void>;
  save: () => void;
  reset: () => void;
  /** Reset a specific path to its default value */
  resetPath: (path: string, isScaffold: boolean) => void;
  exportJson: () => string;
  importJson: (json: string) => boolean;
}

// ============================================
// TWEAKPANE BINDING TYPES
// ============================================

export type BindingType = 'number' | 'boolean' | 'string' | 'color' | 'select' | 'range';

export interface BindingMeta {
  type: BindingType;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, unknown>;
  folder?: string;
  order?: number;
}

// ============================================
// DEFAULT VALUES
// ============================================

export const SCAFFOLD_DEFAULTS: ScaffoldTuning = {
  version: '1.0.0',
  engine: {
    targetFps: 60,
    antialias: true,
    backgroundAlpha: 1.0,
    resolution: 1,
  },
  debug: {
    showFps: false,
    showHitboxes: false,
    logLevel: 'warn',
  },
  animation: {
    defaultDuration: 300,
    defaultEasing: 'power2.out',
    transitionDuration: 300,
    transitionType: 'fade',
  },
  audio: {
    masterVolume: 0.5,
    musicVolume: 0.8,
    sfxVolume: 1.0,
    fadeInDuration: 500,
    fadeOutDuration: 300,
  },
  performance: {
    maxParticles: 1000,
    spritePoolSize: 100,
    enableCulling: true,
  },
  screens: {
    loadingMinDuration: 500,
    loadingFadeOut: 300,
  },
  tuningPanel: {
    position: 'left',
  },
  viewport: {
    mode: 'small',
  },
};
