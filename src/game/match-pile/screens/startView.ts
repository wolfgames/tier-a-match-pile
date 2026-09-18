// what_in: StartScreenDeps (goto, initGpu, tuning, coordinator, audio) from src/game/screens/
//          StartScreen.tsx.
// what_out: setupStartScreen — owns the Pixi Application lifecycle (init/resize/theme/destroy)
//           and the settings-popover open/closed state, and delegates all visual composition to
//           startViewScene.ts's `paintStartScene`.
// why_here: this game's template renders start on Pixi despite the general DOM guidance —
//           kept consistent because N9's colour probe only matches hex strings `paint()`
//           records; DOM computed styles report rgb(), which can never match a hex token.
import { Application, Container } from 'pixi.js';
import gsap from 'gsap';
import type { StartScreenController, StartScreenDeps, SetupStartScreen } from '~/game/game-contract';
import { paletteHexFor } from '../palette';
import { fontsReady } from '../fontsReady';
import { registerDebugContext } from '../debug';
import { getGameWorld } from '../world';
import { palette } from '../palette';
import { paintStartScene, stopStartSceneAmbient } from './startViewScene';
import { getAudioManager } from '../audio/manager';

export const setupStartScreen: SetupStartScreen = (deps: StartScreenDeps): StartScreenController => {
  let app: Application | null = null;
  let root: Container | null = null;
  let destroyed = false;
  let unobserveTheme: (() => void) | null = null;
  let settingsOpen = false;
  // Shared singleton (audio/manager.ts) — the game screen picks up whatever this screen started
  // instead of restarting it (see gameController.ts's own note). `deps.coordinator.audio` never
  // depends on a loaded bundle, but the audio-* bundles themselves only finish loading once
  // `loadBundle('audio-music-match-pile')` below resolves — a button tap before that point
  // silently no-ops (facade.audio.play returns -1 for an unloaded channel), same as any other
  // real SFX call on an unloaded bundle. Expected on a cold boot, briefly.
  const audioManager = getAudioManager(deps.coordinator.audio);

  const onPlay = async () => {
    audioManager.playButtonTap();
    deps.unlockAudio();
    await deps.loadCore();
    try {
      // NOT deps.loadAudio() — it reloads every audio-* bundle unconditionally on every call,
      // and the Howler loader has no dedup guard (loadBundle always builds a brand-new Howl and
      // overwrites the map entry). The cover screen's own early load (below) may already have
      // `audio-music-match-pile` loaded and playing by the time PLAY is tapped; reloading it here
      // would orphan that still-playing Howl instance while a second one starts — the exact
      // "music sounds like twice at once" bug. Load each bundle only if it isn't already loaded.
      if (!deps.coordinator.isLoaded('audio-sfx-match-pile')) await deps.loadBundle?.('audio-sfx-match-pile');
      if (!deps.coordinator.isLoaded('audio-music-match-pile')) await deps.loadBundle?.('audio-music-match-pile');
    } catch {
      /* audio optional */
    }
    deps.analytics.trackGameStart({ start_source: 'play_button', is_returning_player: false });
    deps.goto('game');
  };

  return {
    backgroundColor: palette.base,
    init(container: HTMLDivElement) {
      // Background-music must be audible from the cover screen, not just once gameplay starts —
      // load the audio-music bundle in parallel with everything else below (never blocks GPU
      // init/first paint) and start the loop the moment it's ready. If the player hasn't tapped
      // anything yet, the browser holds real playback until the first tap unlocks audio (Howler's
      // own default autoplay-unlock listens for that globally) — this just makes sure the loop is
      // already queued and ready to go the instant that happens.
      //
      // Guarded on isLoaded(): this screen's init() re-runs on every mount (e.g. Results ->
      // "Main Menu" -> back here), and the Howler loader rebuilds a brand-new Howl on every
      // loadBundle() call with no dedup — reloading an already-loaded bundle would orphan the
      // Howl that's already playing while a second one starts on top of it (the "sounds like
      // twice" bug). If it's already loaded, just (re)assert the loop directly — startGameplayMusic()
      // is itself idempotent and no-ops if it's already the track playing.
      if (deps.coordinator.isLoaded('audio-music-match-pile')) {
        audioManager.startGameplayMusic();
      } else {
        void deps.loadBundle?.('audio-music-match-pile')
          .then(() => { if (!destroyed) audioManager.startGameplayMusic(); })
          .catch(() => { /* music optional — SFX/gameplay must not depend on this bundle loading */ });
      }
      void (async () => {
        await deps.initGpu();
        if (destroyed) return;
        const application = new Application();
        app = application;
        // Pixi's a11y div is otherwise Tab-activated only; the ui-contract's PLAY locator needs
        // a real accessible button from first paint. `accessibilityOptions` is read at runtime
        // by AccessibilitySystem.init() but isn't in the public ApplicationOptions type.
        const initOptions = {
          resizeTo: container,
          // Pixi's default backgroundColor is black — was never overridden, so the canvas
          // showed through black wherever `paintStartScene`'s own bg rect wasn't yet covering it
          // (GLOBAL VISUAL RULE: no black background, ever).
          backgroundColor: paletteHexFor(getGameWorld().resources.theme).base,
          backgroundAlpha: 1,
          resolution: Math.min(window.devicePixelRatio, 2),
          autoDensity: true,
          accessibilityOptions: { enabledByDefault: true },
        };
        // `core-branding` is the real template-amino logo atlas (see startViewScene.ts) — must
        // finish loading before the first paint creates its Sprite.
        await Promise.all([application.init(initOptions), fontsReady, deps.loadBundle?.('core-branding')]);
        if (destroyed) return;
        container.appendChild(application.canvas as HTMLCanvasElement);
        application.stage.eventMode = 'passive';
        const sceneRoot = new Container();
        root = sceneRoot;
        application.stage.addChild(sceneRoot);
        // Only the very first paint animates in — a resize or theme-toggle repaint rebuilds this
        // same tree from scratch (paintStartScene's own top-of-function teardown) and must not
        // replay the entrance fade every time, or resizing the window would look like a bug.
        let firstPaint = true;
        const repaint = () => {
          paintStartScene(sceneRoot, application.screen.width, application.screen.height, {
            onPlay: () => void onPlay(),
            coordinator: deps.coordinator,
            audio: deps.audio,
            settingsOpen,
            onToggleSettings: () => {
              audioManager.playButtonTap();
              settingsOpen = !settingsOpen;
              repaint();
            },
            onButtonTap: () => audioManager.playButtonTap(),
            animateEntrance: firstPaint,
          });
          firstPaint = false;
        };
        // `db.observe.resources.X(fn)` replays the CURRENT value synchronously the instant it's
        // subscribed (create-observed-database.js's `observeEntity` calls `observer(...)` before
        // ever registering it) — so subscribing here already performs the first paint. A separate
        // explicit `repaint()` call before this line was the fade-in bug: it painted the animated
        // (alpha 0→1) tree first, then this subscription's synchronous replay immediately repainted
        // over it with `firstPaint` already false — all in the same tick, before the browser ever
        // rendered a frame, so the entrance tween never had a chance to actually show.
        unobserveTheme = getGameWorld().observe.resources.theme(repaint);
        application.renderer.on('resize', repaint);
        registerDebugContext({ stage: () => application.stage, screen: () => ({ w: application.screen.width, h: application.screen.height }) });
      })();
    },
    destroy() {
      destroyed = true;
      unobserveTheme?.();
      // The decorative background's ambient motion runs its own `gsap.ticker` callback (via
      // `applyMotion`, not a plain tween) — `gsap.killTweensOf` below never touches it, so it must
      // be stopped explicitly or it keeps writing into a destroyed Container every frame.
      stopStartSceneAmbient();
      if (root) for (const c of root.children) gsap.killTweensOf(c);
      app?.destroy(true, { children: true });
      app = null;
      root = null;
    },
  };
};
