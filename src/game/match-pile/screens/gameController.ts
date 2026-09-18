// what_in: GameControllerDeps (coordinator, tuning, audio, goto) from GameScreen.tsx.
// what_out: setupGame — mounts the Pixi board, wires taps to the rules engine via
//           board/resolve.ts, and routes to results on a terminal phase.
// why_here: gameController.ts composes and wires only (A4) — logic lives in board/fx/hud/
//           tutorial adapters; this file just assembles them.
//
// SCREEN-REBUILD pass: dropped the hint/powerups row and the legend row entirely (explicit
// removal ask — both sat between the board and the Slots Row; the instruction card, `slot-info`,
// is the one place FTUE/permanent copy appears now). Settings is a fully-Pixi tactile button +
// popover (settingsButton.ts/settingsPanel.ts, same components the start screen uses), wired to
// the real audio system via `deps.audio` — no DOM anywhere on this screen.
import { Application, type Container, type Text } from 'pixi.js';
import gsap from 'gsap';
import type { GameController, GameControllerDeps, SetupGame } from '~/game/game-contract';
import { getGameWorld } from '../world';
import { paletteHexFor } from '../palette';
import { buildLayout, type Slots } from '../board/layout';
import { initChromeOnce, paintChrome, initTimerOnce, paintTimer, type ChromeHandle } from '../board/chrome';
import { paintInstructionBar } from '../board/instructionBar';
import { paintTray, matchedTraySlotCenters } from '../board/tray';
import { paintOrdersHud } from '../board/ordersHud';
import { buildSettingsPanel } from '../settingsPanel';
import { BoardRenderer } from '../board/boardRenderer';
import { physicsTuningForLevel } from '../board/pilePhysics';
import { resolveTap } from '../board/resolve';
import { Fx } from '../fx/fx';
import { getAudioManager, type MatchPileAudioManager } from '../audio/manager';
import { applyGlowHighlight, clearGlowHighlight, applyTimerPulse, clearTimerPulse } from '../tutorial/highlight';
import { stepsFor, activeGuidedTileIdsForLevel1, type FtueGate } from '../tutorial/steps';
import { level3TargetTileId } from '../tutorial/level3';
import { FTUE_LEVEL_COUNT } from '../services/levels';
import { loadLevel as loadLevelAgent } from '../ecs/agentPlugin';
import { fontsReady } from '../fontsReady';
import { registerDebugContext } from '../debug';
import { LEGEND_COPY } from '../board/legend';
import { buildLeaderboardPanel } from '../board/leaderboardPanel';
import { getStored, setStored } from '~/core/utils/storage';

/** No persisted best-time/leaderboard backend exists in this project — this is the actual
 * fastest completed run THIS browser has ever recorded, via the same localStorage helper the
 * audio settings already use (~/core/utils/storage), never a fabricated placeholder. */
const BEST_TIME_KEY = 'match-pile:best-time-ms';

type Deps = GameControllerDeps & { goto?: (screen: string) => void };

type ActiveHighlight = { kind: 'glow'; overlay: Container } | { kind: 'timer'; text: Text };

/** Kills any tween targeting `c` or a descendant (and each one's `.scale`) — needed before a
 * DARK-MODE rebuild destroys `slots.root`: chrome's settings button can have a live hover/press
 * tween (pointerMotion.ts) mid-flight, and destroying its container out from under a running GSAP
 * tween is exactly the "kill before destroy" guardrail violation this avoids. */
function killTweensRecursive(c: Container): void {
  gsap.killTweensOf(c);
  gsap.killTweensOf(c.scale);
  for (const child of c.children) killTweensRecursive(child as Container);
}

export const setupGame: SetupGame = (rawDeps): GameController => {
  const deps = rawDeps as Deps;
  let app: Application | null = null;
  let slots: Slots | null = null;
  let chrome: ChromeHandle | null = null;
  let board: BoardRenderer | null = null;
  let fx: Fx | null = null;
  let audioManager: MatchPileAudioManager | null = null;
  let timerText: Text | null = null;
  let highlighted: ActiveHighlight[] = [];
  let unobservePile: (() => void) | null = null;
  let unobserveTheme: (() => void) | null = null;
  let destroyed = false;
  let settingsOpen = false;
  let settingsPanelContainer: Container | null = null;
  let leaderboardOpen = false;
  let leaderboardPanelContainer: Container | null = null;
  let bestTimeRecorded = false;

  // Resolves a Step's `target` label to the real node it names — a tile view (owned by
  // BoardRenderer) or a chrome slot (owned by layout.ts) — so the highlight always targets the
  // real control, never an overlay glyph (tutorial/highlight.ts).
  // 'slot-timer' and 'slot-action' are handled directly in the highlight loop below (each needs
  // more than "find the one node"), so they're not resolved here.
  const resolveTarget = (label: string): Container | undefined => {
    if (label.startsWith('tile-')) return board?.getViewByLabel(label);
    if (label === 'slot-orders') return slots?.orders;
    return undefined;
  };

  const infoText = (levelIndex: number, gate: FtueGate): string => {
    if (levelIndex > FTUE_LEVEL_COUNT) return '';
    const steps = stepsFor(levelIndex);
    if (gate === 'step1') return steps[0]?.copy ?? '';
    if (gate === 'awaitingFirstTap' || gate === 'level3Demo') return steps[steps.length - 1]?.copy ?? '';
    return LEGEND_COPY;
  };

  const closeSettingsPanel = () => {
    settingsPanelContainer?.destroy({ children: true });
    settingsPanelContainer = null;
  };

  const openSettingsPanel = () => {
    if (!slots || !app) return;
    const panel = buildSettingsPanel(
      () => getGameWorld().resources.theme,
      deps.audio,
      () => getGameWorld().transactions.setTheme({ theme: getGameWorld().resources.theme === 'dark' ? 'light' : 'dark' }),
      () => audioManager?.playButtonTap(),
    );
    // Left safe margin, anchored below the settings button's own bottom edge — not the right
    // side (that was the previous, wrong position). Clamped so it can never overflow the
    // viewport on a narrow screen.
    const leftMargin = 16;
    const maxX = app.screen.width - panel.container.width - 12;
    const x = Math.max(0, Math.min(leftMargin, maxX));
    panel.container.position.set(x, slots.settings.y + 32);
    app.stage.addChild(panel.container);
    settingsPanelContainer = panel.container;
  };

  const handleSettingsTap = () => {
    audioManager?.playButtonTap();
    settingsOpen = !settingsOpen;
    if (settingsOpen) openSettingsPanel();
    else closeSettingsPanel();
  };

  const closeLeaderboardPanel = () => {
    leaderboardPanelContainer?.destroy({ children: true });
    leaderboardPanelContainer = null;
  };

  const openLeaderboardPanel = () => {
    if (!slots || !app) return;
    const db = getGameWorld();
    const theme = getGameWorld().resources.theme;
    const panel = buildLeaderboardPanel(paletteHexFor(theme), db.resources.levelIndex, getStored<number | null>(BEST_TIME_KEY, null));
    // Anchored to the top-right control, clamped so it never overflows either edge.
    const rightMargin = 12;
    const x = Math.max(12, Math.min(slots.profile.x - panel.width / 2, app.screen.width - panel.width - rightMargin));
    panel.position.set(x, slots.settings.y + 32);
    app.stage.addChild(panel);
    leaderboardPanelContainer = panel;
  };

  const handleProfileTap = () => {
    audioManager?.playButtonTap();
    leaderboardOpen = !leaderboardOpen;
    if (leaderboardOpen) openLeaderboardPanel();
    else closeLeaderboardPanel();
  };

  const repaint = () => {
    if (!slots || !chrome || !app || destroyed) return;
    const db = getGameWorld();
    const gate = db.resources.ftueGate;
    paintChrome(chrome, slots, { levelIndex: db.resources.levelIndex, score: db.resources.score }, db.resources.theme);
    // Post-FTUE levels have no instruction copy (infoText returns '' past FTUE_LEVEL_COUNT) — an
    // empty blue bar sitting there does nothing, so hide it and give Orders/the board that
    // vertical space back instead.
    const showInstructions = db.resources.levelIndex <= FTUE_LEVEL_COUNT;
    slots.setInstructionsVisible(showInstructions);
    if (showInstructions) paintInstructionBar(slots.infoContent, infoText(db.resources.levelIndex, gate), slots.vw * 0.92);
    paintTray(slots.actionContent, db.resources.pile.tray, db.resources.theme, slots.vw);
    paintOrdersHud(
      slots.orders,
      db.resources.pile.orders,
      db.resources.pile.tray,
      slots.vw,
      db.resources.levelIndex,
      db.resources.theme,
      (node, x, y) => {
        fx?.orderComplete(node, x, y);
        audioManager?.playOrderComplete();
      },
    );

    for (const h of highlighted) (h.kind === 'glow' ? clearGlowHighlight(h.overlay) : clearTimerPulse(h.text));
    highlighted = [];
    const playing = db.resources.pile.phase === 'playing';
    let labels: string[] = [];
    if (playing && db.resources.levelIndex <= FTUE_LEVEL_COUNT) {
      const steps = stepsFor(db.resources.levelIndex);
      if (gate === 'step1') {
        const remaining = db.resources.pile.tiles.map((t) => t.id);
        labels = activeGuidedTileIdsForLevel1(remaining).map((id) => `tile-${id}`);
      } else if (gate === 'awaitingFirstTap') {
        const step = steps[steps.length - 1];
        labels = step ? [step.target] : [];
      } else if (gate === 'level3Demo') {
        const step = steps[0];
        const remainingIds = db.resources.pile.tiles.map((t) => t.id);
        const targetId = level3TargetTileId(remainingIds);
        labels = [...(step ? [step.target] : []), ...(targetId ? [`tile-${targetId}`] : [])];
      }
    }
    for (const label of labels) {
      if (label === 'slot-timer') {
        // FTUE 2: font-colour pulse (applyTimerPulse) PLUS a glow outline hugging the Timer
        // text's own bounds (the same layered-stroke treatment tiles/slots use) so the Timer
        // reads as visibly outlined/boxed, not just recoloured — both clear together below.
        if (timerText) { applyTimerPulse(timerText); highlighted.push({ kind: 'timer', text: timerText }); }
        highlighted.push({ kind: 'glow', overlay: applyGlowHighlight(slots.timer) });
        continue;
      }
      if (label === 'slot-action') {
        // FTUE 3: one glow PER slot (actionContent's live `tray-slot-<i>` children — always all
        // TRAY_SIZE of them, filled or empty), not one highlight around the whole row — teaches
        // "the row is individual spaces," not "the row is one thing."
        for (const slotView of slots.actionContent.children) {
          highlighted.push({ kind: 'glow', overlay: applyGlowHighlight(slotView) });
        }
        continue;
      }
      const node = resolveTarget(label);
      if (node) highlighted.push({ kind: 'glow', overlay: applyGlowHighlight(node) });
    }

    // Win keeps its fireworks (started from handleTap, below) on screen for longer than a plain
    // loss before handing off to Results — VFX pass.
    if (db.resources.pile.phase === 'won') {
      // Persist the actual fastest completed run (once per win — `repaint` re-fires on any pile
      // observe, not just the winning tap) — see BEST_TIME_KEY note above.
      if (!bestTimeRecorded) {
        bestTimeRecorded = true;
        const prevBest = getStored<number | null>(BEST_TIME_KEY, null);
        if (prevBest == null || db.resources.solveMs < prevBest) setStored(BEST_TIME_KEY, db.resources.solveMs);
      }
      gsap.delayedCall(1.9, () => !destroyed && deps.goto?.('results'));
    } else if (db.resources.pile.phase === 'lost') {
      gsap.delayedCall(0.9, () => !destroyed && deps.goto?.('results'));
    } else {
      bestTimeRecorded = false;
    }
  };

  const handleTap = (id: string) => {
    if (!slots || !board) return;
    const db = getGameWorld();
    const tapPos = (board.getViewByLabel(`tile-${id}`) ?? slots.board).getGlobalPosition();
    const tappedTypeId = db.resources.pile.tiles.find((t) => t.id === id)?.typeId;
    const preTray = db.resources.pile.tray;
    const preOrders = db.resources.pile.orders;
    const result = resolveTap(db, id, Date.now());
    if (result.event === 'invalid') return;
    fx?.tapFeedback(tapPos.x, tapPos.y);
    audioManager?.playTileClick();
    if (result.event === 'correct' && tappedTypeId) {
      const trayPos = slots.action.getGlobalPosition();
      const positions = matchedTraySlotCenters(preTray, tappedTypeId, slots.action.width)
        .map((c) => ({ x: trayPos.x + c.x, y: trayPos.y + c.y }));
      // Read-only lookup against already-committed Order state (no rules/ import, no duplicated
      // gameplay logic) — an Order is "active" for this typeId if one exists and wasn't already
      // satisfied before this pick, matching rules/orders.ts#advanceOrders's own cap semantics.
      const contributesToOrder = preOrders.some((o) => o.itemTypeId === tappedTypeId && o.collectedQty < o.requiredQty);
      if (contributesToOrder) fx?.matchComplete(positions, () => audioManager?.playMatchOrder());
      else { fx?.matchDiscard(positions); audioManager?.playMatchDiscard(); }
    } else if (result.event === 'win' && app) {
      audioManager?.playWinCelebration();
      fx?.winFireworks(app.screen.width, app.screen.height, (wave) => audioManager?.playWinBurst(wave));
    }
  };

  return {
    gameMode: 'pixi',
    init(container: HTMLDivElement) {
      const db = getGameWorld();
      if (db.resources.levelIndex === 0) loadLevelAgent(db, 1, Date.now());
      const application = new Application();
      app = application;
      const initOptions = {
        resizeTo: container,
        backgroundColor: paletteHexFor(db.resources.theme).base,
        backgroundAlpha: 1,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
        accessibilityOptions: { enabledByDefault: true },
      };
      // DARK-MODE pass: the visual tree (slots/chrome/board) bakes its palette in at construction
      // time — layout.ts/chrome.ts paint their backgrounds ONCE, they don't re-read the theme on
      // every repaint the way paintChrome/paintTray/paintOrdersHud already do. A theme change has
      // to tear this down and rebuild it fresh, same as startViewScene.ts's full-repaint pattern.
      // Shared by the initial build below and the theme-observer's rebuild — never two slightly
      // different copies of the same construction.
      const buildScene = () => {
        slots = buildLayout(application.stage, application.screen.width, application.screen.height, 0, db.resources.theme);
        chrome = initChromeOnce(slots, deps.coordinator, handleSettingsTap, handleProfileTap, db.resources.theme);
        timerText = initTimerOnce(slots, db.resources.timerRemainingMs);
        board = new BoardRenderer({
          layer: slots.board,
          boardWidth: slots.boardWidth,
          boardHeight: slots.boardHeight,
          db,
          onTap: handleTap,
          getTheme: () => db.resources.theme,
          // LEVEL-TUNING pass: Level 1 stays tutorial-stable (near-static, press is the only real
          // felt movement); Level 2+ gets the fuller loose-pile behaviour. One physics
          // implementation either way — only the tuning profile changes.
          physicsTuning: physicsTuningForLevel(db.resources.levelIndex),
        });
      };
      void Promise.all([application.init(initOptions), fontsReady])
        .then(() => {
          if (destroyed) return;
          container.appendChild(application.canvas as HTMLCanvasElement);
          application.stage.eventMode = 'passive';
          buildScene();
          fx = new Fx(application.stage);
          // Shared singleton (audio/manager.ts) — the cover screen may already have this loop
          // running ("must sound since the cover screen"); startGameplayMusic() is idempotent
          // and no-ops if so, instead of stopping and replaying it from 0.
          audioManager = getAudioManager(deps.coordinator.audio);
          audioManager.startGameplayMusic();
          application.ticker.add((t) => {
            fx?.tick(t.deltaMS / 1000);
            // PILE-PHYSICS prototype — presentation-only settle/pile simulation; reads via the
            // outer `board` closure variable, so it always targets whichever BoardRenderer
            // currently exists (correct across a theme-triggered rebuild too, same as `fx`/
            // `timerText` below).
            board?.tick(t.deltaMS / 1000);
            db.transactions.tickTimer({ dtMs: t.deltaMS });
            if (timerText) paintTimer(timerText, db.resources.timerRemainingMs);
          });
          unobservePile = db.observe.resources.pile(repaint);
          // Rebuilds the whole static visual tree (see `buildScene`'s doc comment) on a theme
          // change. `db.observe.resources.theme(fn)` replays the CURRENT value synchronously the
          // instant it's subscribed (confirmed: @adobe/data's observeEntity calls the observer
          // before registering it) — that first call reports the SAME theme `buildScene()` above
          // just used, so it's skipped; without the guard every screen load would immediately
          // tear down and rebuild the scene it just built. Re-opens whichever popover was open
          // (their own palette is stale otherwise — both are added to `app.stage` directly,
          // outside `slots.root`, so they survive the rebuild untouched unless refreshed here).
          let skipFirstThemeReplay = true;
          unobserveTheme = db.observe.resources.theme(() => {
            if (skipFirstThemeReplay) { skipFirstThemeReplay = false; return; }
            if (destroyed || !slots) return;
            const wasSettingsOpen = settingsOpen;
            const wasLeaderboardOpen = leaderboardOpen;
            closeSettingsPanel();
            closeLeaderboardPanel();
            for (const h of highlighted) (h.kind === 'glow' ? clearGlowHighlight(h.overlay) : clearTimerPulse(h.text));
            highlighted = [];
            board?.destroy();
            killTweensRecursive(slots.root);
            slots.root.destroy({ children: true });
            buildScene();
            repaint();
            if (wasSettingsOpen) { settingsOpen = true; openSettingsPanel(); }
            if (wasLeaderboardOpen) { leaderboardOpen = true; openLeaderboardPanel(); }
          });
          registerDebugContext({
            stage: () => application.stage,
            screen: () => ({ w: application.screen.width, h: application.screen.height }),
            tap: handleTap,
          });
        });
    },
    destroy() {
      destroyed = true;
      unobservePile?.();
      unobserveTheme?.();
      closeSettingsPanel();
      closeLeaderboardPanel();
      board?.destroy();
      fx?.destroy();
      audioManager?.stopMusic();
      app?.destroy(true, { children: true });
      app = null;
      slots = null;
      chrome = null;
      board = null;
      fx = null;
      audioManager = null;
      timerText = null;
      highlighted = [];
    },
    ariaText: () => 'Match Pile',
  };
};
