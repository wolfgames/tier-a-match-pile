/**
 * Registry of wired tuning paths.
 *
 * Add a path here when you wire it up in a createEffect.
 * Paths not in this list will appear RED in Tweakpane.
 */

// Game tuning paths that are wired to reactive effects
export const WIRED_GAME_PATHS = new Set([
  // Theme - used at level load in GameScreen.tsx and StartScreen.tsx
  'theme.tileTheme',

  // Grid - all wired in GameScreen.tsx
  'grid.tileSize',
  'grid.padding',
  'grid.cellGap',
  'grid.nineSlice.leftWidth',
  'grid.nineSlice.topHeight',
  'grid.nineSlice.rightWidth',
  'grid.nineSlice.bottomHeight',
  'grid.vfx.rotateAlpha',
  'grid.vfx.rotateSizePercent',
  // NOT WIRED: grid.defaultGridSize (requires level reload)

  // Visuals - wired
  'visuals.backgroundColor',

  // Animation - wired in GameScreen.tsx
  'animation.tileRotateDuration',
  'animation.tileRotateEasing',
  // NOT WIRED: animation.connectionPulseDuration, animation.levelCompleteDelay

  // Completion Paint - wired in GameScreen.tsx
  'completionPaint.staggerDelay',
  'completionPaint.tileDuration',
  'completionPaint.easing',
  'completionPaint.blastSizePercent',

  // Level Transition - applied on level load (not live-wired)
  'levelTransition.startDelay',
  'levelTransition.elementDuration',
  'levelTransition.diagonalStagger',
  'levelTransition.elementStagger',
  'levelTransition.elementEasing',
  'levelTransition.backgroundEasing',
  'levelTransition.animateBackground',

  // Generator - requires manual regeneration (regenerateLevel button)
  'generator.width',
  'generator.height',
  'generator.exitPoints',
  'generator.pointsSpacing',
  'generator.sidePushRadius',
  'generator.sidePushFactor',
  'generator.wriggleFactor',
  'generator.wriggleDistanceMagnifier',
  'generator.wriggleExtent',
  'generator.wriggleExtentChaosFactor',
  'generator.wrigglePasses',

  // Scoring - not wired (game logic)
  // NOT WIRED: scoring.*

  // Difficulty - not wired (requires level generation)
  // NOT WIRED: difficulty.*

  // Sprites - not wired yet
  // NOT WIRED: sprites.*

  // Screens - used at mount only
  // NOT WIRED: screens.*
]);

// Scaffold tuning paths that are wired
export const WIRED_SCAFFOLD_PATHS = new Set([
  // Engine - used at app init
  'engine.antialias',
  'engine.backgroundAlpha',
  'engine.targetFps',
  'engine.resolution',

  // Audio - wired in audio system
  'audio.masterVolume',
  'audio.musicVolume',
  'audio.sfxVolume',
  'audio.fadeInDuration',
  'audio.fadeOutDuration',

  // Screens - used in transitions
  'screens.loadingMinDuration',
  'screens.loadingFadeOut',

  // Debug - partially wired
  'debug.showFps',
  'debug.logLevel',
  // NOT WIRED: debug.showHitboxes

  // Animation - used in transitions
  'animation.defaultDuration',
  'animation.transitionDuration',
  'animation.transitionType',
  // NOT WIRED: animation.defaultEasing

  // Performance - used at init
  'performance.maxParticles',
  'performance.spritePoolSize',
  'performance.enableCulling',

  // Tuning Panel - wired in TuningPanel.tsx
  'tuningPanel.position',
]);

/**
 * Check if a game tuning path is wired to reactive effects
 */
export function isGamePathWired(path: string): boolean {
  return WIRED_GAME_PATHS.has(path);
}

/**
 * Check if a scaffold tuning path is wired to reactive effects
 */
export function isScaffoldPathWired(path: string): boolean {
  return WIRED_SCAFFOLD_PATHS.has(path);
}

/**
 * Check if any children of a path prefix are wired.
 * Returns true if at least one path starting with the prefix is wired.
 */
export function areAllChildrenWired(pathPrefix: string, isScaffold: boolean): boolean {
  const paths = isScaffold ? WIRED_SCAFFOLD_PATHS : WIRED_GAME_PATHS;
  const prefix = pathPrefix + '.';

  // Check if any wired path starts with this prefix
  for (const wiredPath of paths) {
    if (wiredPath.startsWith(prefix) || wiredPath === pathPrefix) {
      return true;
    }
  }

  return false;
}
