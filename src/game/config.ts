/**
 * Game Configuration
 *
 * Screen wiring, asset manifest, and data types.
 * Game identity (projectId, slug, CDN URLs) comes from GameConfigProvider.
 */

import { lazy, type Component } from 'solid-js';
import type { ViewportMode } from '@wolfgames/components/core';
import type { ScreenId, ScreenAssetConfig } from '~/core/systems/screens/types';
import { LoadingScreen } from './screens/LoadingScreen';

// ============================================================================
// DATA TYPES
//
// Define your game's data schema here.
// These types are used by useGameData() and the ManifestProvider.
// ============================================================================

/** Dialogue message for companion/NPC interactions */
export interface DialogueMessage {
  id: string;
  speaker?: string;
  text: string;
}

/**
 * Game data fetched from server / injected by host — the dynamic level pack
 * (services/levels.ts is the only reader; see docs/guides/state-architecture.md).
 */
export interface GameData {
  schemaId: string;
  version: number;
  levels: Array<{
    id: string;
    seed: number;
    puzzle: unknown;
    solution: readonly string[];
    tier: 'easy' | 'medium' | 'hard';
    difficultyScore: number;
  }>;
}
// ============================================================================
// SCREEN WIRING
// ============================================================================

export interface GameConfig {
  screens: {
    loading: Component;
    start: Component;
    game: Component;
    results: Component;
  };
  /** Per-screen asset requirements. The screen manager loads required bundles
   *  before showing the screen and background-loads optional bundles. */
  screenAssets?: Partial<Record<ScreenId, ScreenAssetConfig>>;
  initialScreen: 'loading' | 'start' | 'game' | 'results';
  defaultViewportMode?: ViewportMode;
  /** Skip the title/start screen and go straight from loading to gameplay.
   *  Title-screen asset bundles (e.g. boot-ui) are background-loaded rather
   *  than blocking. Intended for playable ad units where a start screen is
   *  not required. Default: false. */
  skipStartScreen?: boolean;
}

export const gameConfig: GameConfig = {
  screens: {
    loading: LoadingScreen,
    start: lazy(() => import('./screens/StartScreen')),
    game: lazy(() => import('./screens/GameScreen')),
    // Now Pixi-backed (RESULTS→PIXI conversion) — lazy like start/game so its match-pile Pixi
    // module graph doesn't ship in the eagerly-loaded main chunk.
    results: lazy(() => import('./screens/ResultsScreen')),
  },
  initialScreen: 'loading',
};
