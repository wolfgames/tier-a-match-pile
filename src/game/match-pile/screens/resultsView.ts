// what_in: ResultsScreenDeps (goto, coordinator, loadBundle) from src/game/screens/ResultsScreen.tsx.
// what_out: setupResultsScreen — owns the Pixi Application lifecycle (init/resize/destroy) for the
//           end-of-run results screen; visual composition lives in resultsViewScene.ts.
// why_here: RESULTS→PIXI conversion (tier-a-build-v4) — this screen used to be DOM/Tailwind
//           (ResultsScreen.tsx). Converted so this game's UI stays on one renderer end-to-end and
//           reuses the cover screen's own Pixi UI kit instead of a parallel DOM implementation.
//           Mirrors startView.ts's structure (Application lifecycle here, painting delegated).
import { Application, Container } from 'pixi.js';
import gsap from 'gsap';
import type { ResultsScreenController, ResultsScreenDeps, SetupResultsScreen } from '~/game/game-contract';
import { paletteHexFor } from '../palette';
import { fontsReady } from '../fontsReady';
import { getGameWorld } from '../world';
import { palette } from '../palette';
import { loadLevel as agentLoadLevel } from '../ecs/agentPlugin';
import { paintResultsScene } from './resultsViewScene';
import { getAudioManager } from '../audio/manager';

export const setupResultsScreen: SetupResultsScreen = (deps: ResultsScreenDeps): ResultsScreenController => {
  let app: Application | null = null;
  let root: Container | null = null;
  let destroyed = false;
  let unobserveTheme: (() => void) | null = null;
  // Shared singleton (audio/manager.ts) — see gameController.ts's own note on why this can't be
  // a fresh instance per screen.
  const audioManager = getAudioManager(deps.coordinator.audio);
  // Hoisted (not local to init's closure) so `destroy()` can reach it — paintResultsScene's
  // tweens include an off-tree score-counter proxy object that a shallow `gsap.killTweensOf`
  // walk over `root`'s children (or even a recursive one) would never find.
  let cleanupPaint: (() => void) | null = null;
  // AUTO-ADVANCE pass: exactly one 6s timer, started only when a real Next Level action exists
  // (won === true — same availability rule the button itself uses), killed by whichever
  // navigation path fires first so auto-advance and a manual click can never both navigate.
  // gsap.delayedCall per this project's "timed game events use GSAP, not setTimeout" rule.
  let advanceTimer: gsap.core.Tween | null = null;
  let navigated = false;

  const cancelAdvanceTimer = () => {
    advanceTimer?.kill();
    advanceTimer = null;
  };

  return {
    backgroundColor: palette.base,
    init(container: HTMLDivElement) {
      void (async () => {
        if (destroyed) return;
        const application = new Application();
        app = application;
        const db = getGameWorld();
        const initOptions = {
          resizeTo: container,
          backgroundColor: paletteHexFor(db.resources.theme).base,
          backgroundAlpha: 1,
          resolution: Math.min(window.devicePixelRatio, 2),
          autoDensity: true,
          accessibilityOptions: { enabledByDefault: true },
        };
        // `core-branding` is already loaded (the start screen loads it and it's never unloaded)
        // — this is defensive, same posture as startView.ts's own `loadBundle?.(...)` call.
        await Promise.all([application.init(initOptions), fontsReady, deps.loadBundle?.('core-branding')]);
        if (destroyed) return;
        container.appendChild(application.canvas as HTMLCanvasElement);
        application.stage.eventMode = 'passive';
        const sceneRoot = new Container();
        root = sceneRoot;
        application.stage.addChild(sceneRoot);

        // Score/stars/phase are frozen by ecs/transactions/commitPick.ts (or finishInstant.ts)
        // the moment the run left 'playing' — read once, same as the DOM screen this replaces.
        const won = db.resources.pile.phase === 'won';
        const score = db.resources.score;
        const stars = db.resources.stars;

        // The SAME actions the CTA/Main Menu buttons themselves call (paintResultsScene wires
        // these straight to onTap) — auto-advance below calls `goNextLevel` directly, never a
        // second copy of the progression logic. `navigated` guards against both a manual click
        // and the timer somehow firing in the same tick (defensive; the explicit `cancelAdvanceTimer()`
        // in each path already makes that essentially impossible in a single JS thread).
        const goTryAgain = () => {
          if (navigated) return;
          navigated = true;
          cancelAdvanceTimer();
          agentLoadLevel(db, db.resources.levelIndex, Date.now());
          deps.goto('game');
        };
        const goNextLevel = () => {
          if (navigated) return;
          navigated = true;
          cancelAdvanceTimer();
          agentLoadLevel(db, db.resources.levelIndex + 1, Date.now());
          deps.goto('game');
        };
        const goMainMenu = () => {
          if (navigated) return;
          navigated = true;
          cancelAdvanceTimer();
          deps.goto('start');
        };

        let firstPaint = true;
        const repaint = () => {
          const isFirstPaint = firstPaint;
          // Kill this paint's tweens (including the off-tree score-counter proxy — see
          // resultsViewScene.ts's own doc comment) BEFORE destroying the children they target.
          cleanupPaint?.();
          sceneRoot.removeChildren().forEach((c) => c.destroy({ children: true }));
          cleanupPaint = paintResultsScene(sceneRoot, application.screen.width, application.screen.height, {
            coordinator: deps.coordinator,
            won,
            score,
            stars,
            onTryAgain: goTryAgain,
            onNextLevel: goNextLevel,
            onMainMenu: goMainMenu,
            // Only the very first paint animates in — a resize/theme repaint rebuilds the same
            // tree and must not replay the hero pop/score count-up/star stagger every time.
            animate: firstPaint,
            onButtonTap: () => audioManager.playButtonTap(),
            onStarReveal: (i) => audioManager.playStar(i),
          });
          firstPaint = false;
          // Gameplay → Results hand-off: a short reveal flourish + a BGM swap, both timed to when
          // Results first appears — never replayed on a resize/theme repaint.
          if (isFirstPaint) {
            audioManager.playResultsReveal();
            audioManager.startResultsMusic();
            // Only a real Next Level action gets auto-advance — same availability rule the
            // button itself uses (it only renders/calls onNextLevel when `won`). A lose-state
            // "Try Again" is never auto-triggered.
            if (won) advanceTimer = gsap.delayedCall(6, goNextLevel);
          }
        };
        // `db.observe.resources.theme(fn)` replays the CURRENT value synchronously the instant
        // it's subscribed (same confirmed behaviour startView.ts's own theme subscription relies
        // on) — so subscribing here already performs the first paint. A separate explicit
        // `repaint()` call before this line would double-paint on load, exactly like the cover
        // screen's earlier fade-in bug: the second, synchronous call would immediately overwrite
        // the first with `firstPaint` already false. Dark Mode (item 1) reaches this screen for
        // free — paintResultsScene already re-reads the live theme internally, so any later
        // theme change just re-fires this same `repaint`.
        unobserveTheme = db.observe.resources.theme(repaint);
        application.renderer.on('resize', repaint);
      })();
    },
    destroy() {
      destroyed = true;
      unobserveTheme?.();
      cancelAdvanceTimer();
      cleanupPaint?.();
      cleanupPaint = null;
      audioManager.stopMusic();
      if (root) for (const c of root.children) gsap.killTweensOf(c);
      app?.destroy(true, { children: true });
      app = null;
      root = null;
    },
  };
};
