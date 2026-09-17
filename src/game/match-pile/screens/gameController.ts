// what_in: GameControllerDeps (coordinator, tuning, goto) from GameScreen.tsx.
// what_out: setupGame — mounts the Pixi board, wires taps to the rules engine via
//           board/resolve.ts, and routes to results on a terminal phase.
// why_here: gameController.ts composes and wires only (A4) — logic lives in board/fx/hud/
//           tutorial adapters; this file just assembles them.
import { Application, type Container, type Text } from 'pixi.js';
import gsap from 'gsap';
import type { GameController, GameControllerDeps, SetupGame } from '~/game/game-contract';
import { getGameWorld } from '../world';
import { paletteHexFor } from '../palette';
import { buildLayout, type Slots } from '../board/layout';
import { initChromeOnce, paintChrome, initTimerOnce, paintTimer } from '../board/chrome';
import { paintTray } from '../board/tray';
import { paintOrdersHud } from '../board/ordersHud';
import { paintLegendOnce, LEGEND_COPY } from '../board/legend';
import { initHintOnce, updateHint } from '../board/hint';
import { BoardRenderer } from '../board/boardRenderer';
import { resolveTap } from '../board/resolve';
import { Fx } from '../fx/fx';
import { emphasise, clearEmphasis } from '../tutorial/emphasise';
import { stepsFor, activeGuidedTileIdsForLevel1, type FtueGate } from '../tutorial/steps';
import { level3TargetTileId } from '../tutorial/level3';
import { FTUE_LEVEL_COUNT } from '../services/levels';
import { hintVisibility } from '../feel';
import { loadLevel as loadLevelAgent } from '../ecs/agentPlugin';
import { registerDebugContext } from '../debug';

type Deps = GameControllerDeps & { goto?: (screen: string) => void };

export const setupGame: SetupGame = (rawDeps): GameController => {
  const deps = rawDeps as Deps;
  let app: Application | null = null;
  let slots: Slots | null = null;
  let board: BoardRenderer | null = null;
  let fx: Fx | null = null;
  let timerText: Text | null = null;
  let hintIcon: Container | null = null;
  let emphasised: Container[] = [];
  let level3AlphaNodes: Container[] = [];
  let unobservePile: (() => void) | null = null;
  let destroyed = false;

  // Resolves a Step's `target` label to the real node it names — a tile view (owned by
  // BoardRenderer) or a chrome slot (owned by layout.ts) — so emphasise() always highlights the
  // real control, never an overlay glyph (tutorial/emphasise.ts).
  const resolveTarget = (label: string): Container | undefined => {
    if (label.startsWith('tile-')) return board?.getViewByLabel(label);
    if (label === 'slot-orders') return slots?.orders;
    if (label === 'slot-timer') return slots?.timer;
    if (label === 'slot-action') return slots?.action;
    return undefined;
  };

  // Level 3's remaining "A" tiles get an extra alpha pulse on top of the shared emphasise()
  // scale pulse: its board is dense (~35 tiles) and only 4 placeholder tint colors are reused
  // across the whole object pool, so a same-tint neighbor can make a scale-only pulse hard to
  // spot. Guardrail-compliant (tint/alpha, not filters); kept local to gameController.ts rather
  // than added to tutorial/emphasise.ts so Level 1/2's already-working highlight is untouched.
  const pulseTargetAlpha = (node: Container): void => {
    if (node.destroyed) return;
    gsap.killTweensOf(node, 'alpha');
    gsap.fromTo(node, { alpha: 1 }, {
      alpha: 0.45,
      duration: 0.4,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      overwrite: 'auto',
      onUpdate: function onUpdate() { if (node.destroyed) this.kill(); },
    });
  };

  const clearTargetAlpha = (node: Container): void => {
    if (node.destroyed) return;
    gsap.killTweensOf(node, 'alpha');
    node.alpha = 1;
  };

  const infoText = (levelIndex: number, gate: FtueGate): string => {
    if (levelIndex > FTUE_LEVEL_COUNT) return '';
    const steps = stepsFor(levelIndex);
    if (gate === 'step1') return steps[0]?.copy ?? '';
    // 'awaitingFirstTap'/'level3Demo' are each their level's last (only) step — Level 1's
    // Orders step, Level 2's Timer step, or Level 3's Slots Row step — dismissed by the
    // player's own next/completing tap, not a Continue button.
    if (gate === 'awaitingFirstTap' || gate === 'level3Demo') return steps[steps.length - 1]?.copy ?? '';
    // gate 'none' (every FTUE level has dismissed its instruction by now, or this level was
    // never gated): the instruction bar (Mahjong reference) is never empty — falls back to the
    // same permanent rule reminder as the legend, display-only, no FTUE/gate state touched.
    return LEGEND_COPY;
  };

  const repaint = () => {
    if (!slots || !app || destroyed) return;
    const db = getGameWorld();
    const gate = db.resources.ftueGate;
    // `slots.info` uses removeChildren(1): index 0 is the pill background layout.ts painted
    // once — clearing it every repaint would leave the instruction bar with no surface.
    slots.info.removeChildren(1).forEach((c) => c.destroy());
    for (const s of [slots.score, slots.challenge, slots.gameType, slots.subType]) s.removeChildren().forEach((c) => c.destroy());
    paintChrome(slots, {
      levelIndex: db.resources.levelIndex,
      tier: db.resources.tier,
      challengeLabel: `LEVEL ${db.resources.levelIndex}`,
      score: db.resources.score,
      infoText: infoText(db.resources.levelIndex, gate),
    });
    paintTray(slots.action, db.resources.pile.tray, db.resources.theme, slots.vw * 0.8);
    paintOrdersHud(slots.orders, db.resources.pile.orders, db.resources.pile.tray, slots.vw * 0.92);
    if (hintIcon) {
      const hv = hintVisibility({
        levelIndex: db.resources.levelIndex,
        phase: db.resources.pile.phase,
        ftueLevels: FTUE_LEVEL_COUNT,
        spent: db.resources.hintSpent,
      });
      updateHint(hintIcon, hv.visible, hv.enabled);
    }

    for (const node of emphasised) clearEmphasis(node);
    emphasised = [];
    const playing = db.resources.pile.phase === 'playing';
    let labels: string[] = [];
    let level3TileLabels: string[] = [];
    if (playing && db.resources.levelIndex <= FTUE_LEVEL_COUNT) {
      const steps = stepsFor(db.resources.levelIndex);
      if (gate === 'step1') {
        // Sequential, not simultaneous: only the currently-active triple is highlighted —
        // the same set ecs/applyTap.ts is allowing taps on. Switches to the second triple the
        // moment the first has fully cleared from the pile.
        const remaining = db.resources.pile.tiles.map((t) => t.id);
        labels = activeGuidedTileIdsForLevel1(remaining).map((id) => `tile-${id}`);
      } else if (gate === 'awaitingFirstTap') {
        const step = steps[steps.length - 1];
        labels = step ? [step.target] : [];
      } else if (gate === 'level3Demo') {
        // Slots Row itself (steps[0].target = 'slot-action') stays emphasised the whole time,
        // plus Level 3's single reserved target tile (tutorial/level3.ts) — the same tile
        // ecs/applyTap.ts's tap-gating allows, guaranteed exposed by construction (content-
        // pipeline-validated), not guessed from the board's own exposure state.
        const step = steps[0];
        const remainingIds = db.resources.pile.tiles.map((t) => t.id);
        const targetId = level3TargetTileId(remainingIds);
        level3TileLabels = targetId ? [`tile-${targetId}`] : [];
        labels = [...(step ? [step.target] : []), ...level3TileLabels];
      }
    }
    const level3TargetNodes: Container[] = [];
    for (const label of labels) {
      const node = resolveTarget(label);
      if (node) {
        emphasise(node);
        emphasised.push(node);
        if (level3TileLabels.includes(label)) level3TargetNodes.push(node);
      }
    }
    for (const node of level3AlphaNodes) if (!level3TargetNodes.includes(node)) clearTargetAlpha(node);
    for (const node of level3TargetNodes) if (!level3AlphaNodes.includes(node)) pulseTargetAlpha(node);
    level3AlphaNodes = level3TargetNodes;

    if (db.resources.pile.phase !== 'playing') gsap.delayedCall(0.9, () => !destroyed && deps.goto?.('results'));
  };

  const handleTap = (id: string) => {
    if (!slots || !board) return;
    const result = resolveTap(getGameWorld(), id, Date.now());
    const p = slots.board.getGlobalPosition();
    fx?.celebrate(result.event, p.x + slots.board.width / 2, p.y + slots.board.height / 2);
  };

  // U4/U8: hint dispatches from feedbackRegistry like every other event — same
  // stampFx + celebrate pattern as handleTap, just sourced from the powerups row instead of a tile.
  const handleHintTap = () => {
    if (!slots || !hintIcon || hintIcon.eventMode === 'none') return;
    const db = getGameWorld();
    db.transactions.useHint();
    db.transactions.stampFx({ event: 'hint', targetLabel: 'hint', t: Date.now() });
    const p = hintIcon.getGlobalPosition();
    fx?.celebrate('hint', p.x, p.y);
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
        // Pixi's Application default backgroundColor is black — was never overridden, so every
        // gap between panels rendered as a black void behind the light chrome (GLOBAL VISUAL
        // RULE: no large black gameplay background). paintScene/paintLayout always paint a full
        // light background on top of this anyway; this is the correct clear colour underneath it.
        backgroundColor: paletteHexFor(db.resources.theme).base,
        backgroundAlpha: 1,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
        // Pixi's a11y div is otherwise Tab-activated only (see startView.ts); read at runtime
        // by AccessibilitySystem.init() but not in the public ApplicationOptions type.
        accessibilityOptions: { enabledByDefault: true },
      };
      void application
        .init(initOptions)
        .then(() => {
          if (destroyed) return;
          container.appendChild(application.canvas as HTMLCanvasElement);
          application.stage.eventMode = 'passive';
          slots = buildLayout(application.stage, application.screen.width, application.screen.height, 0);
          initChromeOnce(slots);
          timerText = initTimerOnce(slots, db.resources.timerRemainingMs);
          paintLegendOnce(slots.legend, slots.vw * 0.92);
          hintIcon = initHintOnce(slots.powerups, handleHintTap);
          board = new BoardRenderer({
            layer: slots.board,
            boardWidth: slots.boardWidth,
            boardHeight: slots.boardHeight,
            db,
            onTap: handleTap,
            getTheme: () => db.resources.theme,
          });
          fx = new Fx(application.stage);
          application.ticker.add((t) => {
            fx?.tick(t.deltaMS / 1000);
            // Timer: single per-frame drive of the countdown (ecs-gameplay.md "match the
            // cadence to the game" — a deliberate, minimal V1 choice, not a general real-time
            // engine seam). `timerRemainingMs` is its own resource, not `pile`, so it does not
            // flow through the `pile`-driven `repaint()` above — repaint the text here instead.
            db.transactions.tickTimer({ dtMs: t.deltaMS });
            if (timerText) paintTimer(timerText, db.resources.timerRemainingMs);
          });
          unobservePile = db.observe.resources.pile(repaint);
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
      board?.destroy();
      fx?.destroy();
      app?.destroy(true, { children: true });
      app = null;
      slots = null;
      board = null;
      fx = null;
      timerText = null;
      hintIcon = null;
      emphasised = [];
      level3AlphaNodes = [];
    },
    ariaText: () => 'Match Pile',
  };
};
