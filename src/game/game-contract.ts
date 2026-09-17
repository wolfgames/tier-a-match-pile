/**
 * Game Contract
 *
 * Defines the exact interfaces the active game module (`src/game/<slug>/`)
 * must export. When an LLM generates a new game, it must satisfy these types.
 *
 * `src/game/<slug>/index.ts` must export:
 *   - setupGame: (deps: GameControllerDeps) => GameController
 *   - setupStartScreen: (deps: StartScreenDeps) => StartScreenController
 *
 * Game Mode:
 *   - 'dom'  — DOM/CSS-only game. No GPU init needed, no scene or core bundles.
 *              Use this when generating games without sprite assets.
 *   - 'pixi' — PixiJS game. Requires initGpu(), expects core and scene bundles in
 *              the asset manifest. Use this when sprite/atlas assets are available.
 *
 * Pixi texture lifecycle:
 *   When calling coordinator.unloadBundle() for a scene-* bundle, ALL Pixi sprites
 *   referencing that bundle's textures MUST be removed from the stage first.
 *   Otherwise Pixi's renderer will crash with "Cannot read properties of null
 *   (reading 'alphaMode')". Pattern: kill GSAP tweens → removeChild → destroy → unloadBundle.
 */

import type { AssetCoordinatorFacade } from '~/core/systems/assets';
import type { ScaffoldTuning } from '~/core/systems/tuning/types';
import type { GameTuningBase } from '~/core/systems/tuning/types';

export type GameMode = 'dom' | 'pixi';

// ---------------------------------------------------------------------------
// Game Controller (used by GameScreen.tsx)
// ---------------------------------------------------------------------------

export interface GameControllerDeps {
  coordinator: AssetCoordinatorFacade;
  tuning: { scaffold: ScaffoldTuning; game: GameTuningBase };
  audio: unknown;
  gameData: unknown;
  analytics: unknown;
  /** Navigate to another screen (e.g. 'results' when the game ends). */
  goto?: (screen: string) => void;
}

export interface GameController {
  /** Mount the game into a container div (Pixi canvas, DOM, etc.) */
  init: (container: HTMLDivElement) => void;
  /** Tear down the game and release resources */
  destroy: () => void;
  /** Reactive accessibility text for screen readers */
  ariaText: () => string;
  /**
   * Rendering mode. When 'dom', the scaffold skips GPU init and core-* bundle
   * loading. When 'pixi', the scaffold ensures GPU is initialised before mount.
   * Defaults to 'dom' if omitted.
   */
  gameMode?: GameMode;
}

export type SetupGame = (deps: GameControllerDeps) => GameController;

// ---------------------------------------------------------------------------
// Start Screen Controller (used by StartScreen.tsx)
// ---------------------------------------------------------------------------

export interface StartScreenDeps {
  goto: (screen: string) => void;
  coordinator: AssetCoordinatorFacade;
  initGpu: () => Promise<void>;
  unlockAudio: () => void;
  loadCore: (onProgress?: (p: number) => void) => Promise<void>;
  loadAudio: (onProgress?: (p: number) => void) => Promise<void>;
  loadBundle?: (name: string, onProgress?: (p: number) => void) => Promise<void>;
  tuning: { scaffold: ScaffoldTuning; game: GameTuningBase };
  analytics: { trackGameStart: (params: { start_source: string; is_returning_player: boolean }) => void };
}

export interface StartScreenController {
  /** Mount the start screen into a container div */
  init: (container: HTMLDivElement) => void;
  /** Tear down the start screen */
  destroy: () => void;
  /** Background color for the screen wrapper */
  backgroundColor: string;
}

export type SetupStartScreen = (deps: StartScreenDeps) => StartScreenController;
