/**
 * Game Controller — a Zuma-style bubble shooter (Pixi).
 *
 * Real-time (guardrail: the ball chain marches every frame with no input, so
 * this runs the per-frame schedule, NOT the turn-based path). ECS is the single
 * source of truth — the chain, the shots, score, phase — and the renderer is a
 * pure projection of it. The sim advances on a FIXED timestep
 * (`startFixedStepLoop` → `stepWorld` → `SYSTEM_ORDER`) so it's deterministic and
 * framerate-independent; the renderer paints the latest ECS state each frame.
 *
 * The loop per level:
 *   • A chain of coloured balls slides in from the entry and spirals toward the
 *     door at the centre.
 *   • A cannon at the centre aims at the pointer; a tap fires the loaded colour
 *     outward into the chain (input as intent → `submitFire`; `inputSystem`
 *     drains it next step).
 *   • The shot inserts between the two nearest balls; three-or-more of a colour
 *     pop, the gap closes, and matches cascade.
 *   • Clear the chain → next level (speed ramps up). Front ball reaches the
 *     door → the level is lost. Either terminal state hands off to results.
 *
 * Rendering: a fixed design box (DESIGN_W×DESIGN_H) scaled to fit the viewport
 * ("contain"). ART TODO: every ball / shot / cannon is a placeholder Pixi
 * Graphics shape tinted by colour index — no art exists yet (the user approved
 * placeholders). Swap these for generated bubble sprites (one alias per colour
 * index, see COLORS in bubble/config.ts) via the asset-pipeline rule.
 *
 * Lifecycle (world owned by world.ts, never disposed here):
 *   init:    getGameWorld() → build Pixi → start the fixed-step loop → startLevel(0)
 *   destroy: destroyed flag → stop loop → engine.destroy → kill tweens →
 *            renderer teardown → setActiveInspectorActions([])
 */

import gsap from 'gsap';
import { Application, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import { createSignal } from 'solid-js';

import { setActiveInspectorActions } from '~/core/systems/ecs';
import type { GameController, GameControllerDeps, SetupGame } from '~/game/mygame-contract';
import type { Entity } from '~/core/systems/ecs';
import { BALL_RADIUS, CENTER, COLORS, DESIGN_H, DESIGN_W } from '../bubble/config';
import { LEVEL_COUNT, levelFor } from '../bubble/levels';
import { DOOR, PATH_POINTS } from '../bubble/path';
import { createTickerEngine, startFixedStepLoop } from '../engine';
import type { EngineHandle } from '../engine';
import type { GameDatabase, GamePhase } from '../ecs/gamePlugin';
import { readChain, readProjectiles } from '../ecs/readStateFromEcs';
import { stepWorld } from '../ecs/schedule';
import { getGameWorld } from '../world';
import { createSettingsOverlay, type SettingsOverlayHandle } from './settingsOverlay';

// ── Palette ──────────────────────────────────────────────────────────────────
const BG = '#0e1220';
const TRACK_STROKE = 0x2a3350;
const TRACK_WIDTH = BALL_RADIUS * 2 + 8;
const DOOR_FILL = 0x05060c;
const CANNON_BASE = 0x354063;
const CANNON_BARREL = 0x8895c0;
const HUD_FILL = '#e8ecf8';
const SHOT_RADIUS = BALL_RADIUS * 0.9;
/** Delay (s) before advancing after a level is cleared, so the last pop reads. */
const LEVEL_END_PAUSE = 0.9;
/**
 * Smoothing rate for ball views easing toward their ECS slot (per second). The
 * chain march moves slots a few px/frame so the ease tracks it tightly; discrete
 * jumps (a shot wedging in, the chain slipping back after a pop) animate as the
 * view catches up. Higher = snappier.
 */
const SMOOTH_K = 22;
/** Cap the per-frame ease step so a tab-away stall doesn't teleport balls. */
const MAX_FRAME_SEC = 0.05;
/** A new ball this close to a just-inserted shot flew in from it (wedge-in). */
const WEDGE_SEED_DIST = 220;

/** Deps optionally carry `goto` (GameScreen injects it) for the results hop. */
type Deps = GameControllerDeps & { goto?: (screen: string) => void };

/** One placeholder ball/shot view — a tinted circle. */
interface Dot {
  container: Container;
  body: Graphics;
  popping: boolean;
}

/** The impact point closest to `target` within WEDGE_SEED_DIST, or null. */
function nearestImpact(
  impacts: Array<{ x: number; y: number }>,
  target: readonly [number, number],
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = WEDGE_SEED_DIST * WEDGE_SEED_DIST;
  for (const p of impacts) {
    const d = (p.x - target[0]) ** 2 + (p.y - target[1]) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export const setupGame: SetupGame = (rawDeps: GameControllerDeps): GameController => {
  const deps = rawDeps as Deps;
  const [ariaText, setAriaText] = createSignal('Loading…');

  let app: Application | null = null;
  let db: GameDatabase | null = null;
  let engine: EngineHandle | null = null;
  let stopSim: (() => void) | null = null;
  let stopRender: (() => void) | null = null;
  let destroyed = false;
  let initPromise: Promise<void> | null = null;

  // Stage layers (design space).
  let root: Container | null = null;
  let trackLayer: Container | null = null;
  let ballLayer: Container | null = null;
  let shotLayer: Container | null = null;
  let cannon: Container | null = null;
  let barrel: Graphics | null = null;
  let hopperCurrentDot: Graphics | null = null;
  let hopperNextDot: Graphics | null = null;
  let hud: Text | null = null;
  let banner: Text | null = null;

  const ballViews = new Map<Entity, Dot>();
  const shotViews = new Map<Entity, Dot>();

  // In-game settings (catalog settings-menu, ENG-4127). While open the sim is
  // frozen — the chain must not march while the player is in a menu.
  let settings: SettingsOverlayHandle | null = null;
  let settingsOpen = false;

  /** Aim angle (radians, design space) the cannon points along; also the fire angle. */
  let aimAngle = -Math.PI / 2;
  /** Guard so a terminal phase only triggers one transition. */
  let handledPhase: GamePhase | null = null;
  let levelIndex = 0;

  const tint = (colorIndex: number): number => COLORS[colorIndex % COLORS.length];

  // ── View helpers ─────────────────────────────────────────────────────────
  const makeDot = (layer: Container, colorIndex: number, radius: number, x: number, y: number): Dot => {
    const container = new Container();
    container.position.set(x, y);
    // ART TODO: placeholder — a flat tinted circle with a highlight. Replace with
    // a generated bubble sprite keyed by colour index (COLORS in bubble/config).
    const body = new Graphics()
      .circle(0, 0, radius)
      .fill(tint(colorIndex))
      .stroke({ width: 2, color: 0x000000, alpha: 0.25 });
    body.circle(-radius * 0.32, -radius * 0.32, radius * 0.26).fill({ color: 0xffffff, alpha: 0.4 });
    container.addChild(body);
    layer.addChild(container);
    return { container, body, popping: false };
  };

  /** Quick scale pop as a ball wedges into the chain (shot, no match). */
  const popIn = (dot: Dot) => {
    dot.container.scale.set(0.5);
    gsap.to(dot.container.scale, { x: 1, y: 1, duration: 0.18, ease: 'back.out(2)', overwrite: 'auto' });
  };

  /** Pop-and-fade a removed ball, then destroy its view. */
  const popDot = (dot: Dot) => {
    if (dot.popping) return;
    dot.popping = true;
    dot.container.eventMode = 'none';
    gsap.killTweensOf(dot.container);
    gsap.killTweensOf(dot.container.scale);
    gsap.to(dot.container.scale, { x: 1.5, y: 1.5, duration: 0.22, ease: 'power2.out' });
    gsap.to(dot.container, {
      alpha: 0,
      duration: 0.22,
      ease: 'power2.out',
      onComplete: () => dot.container.destroy({ children: true }),
    });
  };

  const destroyDot = (dot: Dot) => {
    gsap.killTweensOf(dot.container);
    gsap.killTweensOf(dot.container.scale);
    dot.container.destroy({ children: true });
  };

  // ── Per-frame render (projection of ECS, with view easing) ─────────────────
  const render = (dtMs: number) => {
    if (!db || destroyed) return;
    const dtSec = Math.min(dtMs / 1000, MAX_FRAME_SEC);
    const ease = 1 - Math.exp(-SMOOTH_K * dtSec); // exponential smoothing factor

    // Projectiles first — capture where any shot vanished this frame so a new
    // ball can fly in from that impact point (the wedge-in animation).
    const shots = readProjectiles(db);
    const liveShots = new Set<Entity>();
    for (const s of shots) {
      liveShots.add(s.entity);
      let view = shotViews.get(s.entity);
      if (!view) {
        view = makeDot(shotLayer as Container, s.color, SHOT_RADIUS, s.position[0], s.position[1]);
        shotViews.set(s.entity, view);
      }
      view.container.position.set(s.position[0], s.position[1]); // shots track exactly
    }
    const impacts: Array<{ x: number; y: number }> = [];
    for (const [entity, view] of shotViews) {
      if (!liveShots.has(entity)) {
        impacts.push({ x: view.container.x, y: view.container.y });
        destroyDot(view); // inserted into the chain or left the field
        shotViews.delete(entity);
      }
    }

    // Balls — reconcile the chain against the live views, easing each toward its
    // ECS slot so shifts (insert) and the pop recoil (slip back to entry) animate.
    const chain = readChain(db);
    const liveBalls = new Set<Entity>();
    for (const b of chain) {
      liveBalls.add(b.entity);
      let view = ballViews.get(b.entity);
      if (!view) {
        // New ball: if it appeared next to a just-vanished shot, seed it there so
        // it slides in from the impact and pops into the seam.
        const seed = nearestImpact(impacts, b.position);
        const from = seed ?? { x: b.position[0], y: b.position[1] };
        view = makeDot(ballLayer as Container, b.color, BALL_RADIUS, from.x, from.y);
        ballViews.set(b.entity, view);
        if (seed) popIn(view);
      }
      if (view.popping) continue;
      // Ease toward the slot the sim wrote (tracks the march; animates jumps).
      view.container.x += (b.position[0] - view.container.x) * ease;
      view.container.y += (b.position[1] - view.container.y) * ease;
    }
    for (const [entity, view] of ballViews) {
      if (!liveBalls.has(entity)) {
        popDot(view); // popped or cleared → fade out
        ballViews.delete(entity);
      }
    }

    // Cannon + hopper.
    if (barrel) barrel.rotation = aimAngle;
    if (hopperCurrentDot) hopperCurrentDot.tint = tint(db.resources.hopperCurrent);
    if (hopperNextDot) hopperNextDot.tint = tint(db.resources.hopperNext);

    // HUD.
    if (hud) {
      hud.text = `LEVEL ${levelFor(levelIndex).label} / ${LEVEL_COUNT}    SCORE ${db.resources.score}    BALLS ${db.resources.chainCount}`;
    }

    // Terminal transitions (won → next level or results; lost → results).
    handlePhase(db.resources.phase);
  };

  const handlePhase = (phase: GamePhase) => {
    if (phase === 'playing' || phase === handledPhase) return;
    handledPhase = phase;

    if (phase === 'won') {
      tryPlay('sfx-clear');
      const next = levelIndex + 1;
      if (next < LEVEL_COUNT) {
        showBanner(`LEVEL ${levelFor(levelIndex).label} CLEARED`);
        setAriaText(`Level ${levelFor(levelIndex).label} cleared.`);
        gsap.delayedCall(LEVEL_END_PAUSE, () => {
          if (destroyed) return;
          levelIndex = next;
          startCurrentLevel(true);
        });
      } else {
        showBanner('YOU WIN!');
        setAriaText('You cleared the final level.');
        gsap.delayedCall(LEVEL_END_PAUSE, () => {
          if (!destroyed) deps.goto?.('results');
        });
      }
    } else if (phase === 'lost') {
      tryPlay('sfx-lose');
      showBanner('GAME OVER');
      setAriaText('The chain reached the door. Game over.');
      gsap.delayedCall(LEVEL_END_PAUSE, () => {
        if (!destroyed) deps.goto?.('results');
      });
    }
  };

  const showBanner = (text: string) => {
    if (!banner) return;
    banner.text = text;
    banner.alpha = 0;
    banner.scale.set(0.7);
    gsap.to(banner, { alpha: 1, duration: 0.3, overwrite: 'auto' });
    gsap.to(banner.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(1.7)', overwrite: 'auto' });
  };

  /** Start (or restart) the current level via the ECS transaction. */
  const startCurrentLevel = (carryScore: boolean) => {
    if (!db) return;
    const cfg = levelFor(levelIndex);
    handledPhase = null;
    if (banner) banner.alpha = 0;
    db.transactions.startLevel({
      level: levelIndex,
      colors: cfg.colors,
      chainLength: cfg.chainLength,
      speed: cfg.speed,
      seed: cfg.seed,
      carryScore,
    });
    setAriaText(`Level ${cfg.label}. Aim the cannon and tap to fire.`);
  };

  /** Play a sound if the audio bundle provides it; silently no-op otherwise. */
  const tryPlay = (channel: string) => {
    try {
      (deps.coordinator.audio as { play: (c: string) => void } | undefined)?.play(channel);
    } catch {
      /* audio optional */
    }
  };

  // ── Input (input as intent) ────────────────────────────────────────────────
  const updateAim = (e: FederatedPointerEvent) => {
    if (!root) return;
    const p = root.toLocal(e.global);
    aimAngle = Math.atan2(p.y - CENTER[1], p.x - CENTER[0]);
    if (barrel) barrel.rotation = aimAngle;
  };

  const fire = () => {
    if (!db || db.resources.phase !== 'playing') return;
    db.transactions.submitFire({ angle: aimAngle });
    tryPlay('sfx-shoot');
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  const layout = () => {
    if (!app || !root) return;
    const w = app.screen.width;
    const h = app.screen.height;
    const scale = Math.min(w / DESIGN_W, h / DESIGN_H);
    root.scale.set(scale);
    root.position.set((w - DESIGN_W * scale) / 2, (h - DESIGN_H * scale) / 2);
  };

  // ── Scene construction ─────────────────────────────────────────────────────
  const buildScene = (stage: Container) => {
    root = new Container();
    stage.addChild(root);

    // Full-box input catcher (aim on move, fire on tap).
    const inputPlane = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: 0x000000, alpha: 0.001 });
    inputPlane.eventMode = 'static';
    inputPlane.on('pointermove', updateAim);
    inputPlane.on('pointertap', (e: FederatedPointerEvent) => {
      updateAim(e);
      fire();
    });
    root.addChild(inputPlane);

    // Track groove — stroke the sampled spiral polyline (the exact ball path).
    trackLayer = new Container();
    root.addChild(trackLayer);
    const groove = new Graphics();
    groove.moveTo(PATH_POINTS[0].x, PATH_POINTS[0].y);
    for (let i = 1; i < PATH_POINTS.length; i++) groove.lineTo(PATH_POINTS[i].x, PATH_POINTS[i].y);
    groove.stroke({ width: TRACK_WIDTH, color: TRACK_STROKE, cap: 'round', join: 'round', alpha: 0.55 });
    trackLayer.addChild(groove);
    // The door (where the chain is lost) — a dark hole at the spiral's inner end,
    // just above the central cannon.
    const door = new Graphics().circle(DOOR.x, DOOR.y, BALL_RADIUS * 1.4).fill(DOOR_FILL);
    trackLayer.addChild(door);

    // Balls under shots so an incoming shot reads as "on top" until it inserts.
    ballLayer = new Container();
    shotLayer = new Container();
    root.addChild(ballLayer, shotLayer);

    // Cannon at the centre.
    cannon = new Container();
    cannon.position.set(CENTER[0], CENTER[1]);
    barrel = new Graphics()
      .roundRect(0, -8, BALL_RADIUS * 2.4, 16, 6)
      .fill(CANNON_BARREL); // points along +x; rotated to aimAngle
    barrel.rotation = aimAngle;
    const base = new Graphics().circle(0, 0, BALL_RADIUS * 1.5).fill(CANNON_BASE).stroke({ width: 3, color: 0x1a2036 });
    // Hopper chips: loaded colour on the base, next queued beside it.
    hopperCurrentDot = new Graphics().circle(0, 0, BALL_RADIUS * 0.8).fill(0xffffff);
    hopperNextDot = new Graphics().circle(BALL_RADIUS * 1.9, 0, BALL_RADIUS * 0.5).fill(0xffffff);
    hopperNextDot.alpha = 0.85;
    cannon.addChild(barrel, base, hopperCurrentDot, hopperNextDot);
    root.addChild(cannon);

    // HUD (top-left).
    hud = new Text({
      text: '',
      style: { fill: HUD_FILL, fontFamily: 'Arial, sans-serif', fontSize: 24, fontWeight: '700' },
    });
    hud.position.set(20, 16);
    root.addChild(hud);

    // Centre banner (level cleared / win / game over).
    banner = new Text({
      text: '',
      style: { fill: HUD_FILL, fontFamily: 'Arial, sans-serif', fontSize: 64, fontWeight: '800', align: 'center' },
    });
    banner.anchor.set(0.5);
    banner.position.set(DESIGN_W / 2, DESIGN_H * 0.28);
    banner.alpha = 0;
    root.addChild(banner);
  };

  /**
   * The settings menu (gear, scrim, panel) mounts into `root` after every game
   * layer, so its scrim covers the input plane while the panel is up.
   */
  const buildSettings = () => {
    if (!root) return;
    const gpu = deps.coordinator.getGpuLoader();
    if (!gpu) return;

    settings = createSettingsOverlay({
      layer: root,
      loader: gpu,
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      audio: deps.audio,
      onRestart: () => startCurrentLevel(false),
      onHome: () => deps.goto?.('start'),
      onOpenChange: (open) => {
        settingsOpen = open;
      },
    });
  };

  return {
    gameMode: 'pixi',

    init(container: HTMLDivElement) {
      // 1. App-scoped ECS world — single source of truth.
      db = getGameWorld();

      // 2. Pixi renderer.
      const application = new Application();
      app = application;
      initPromise = application
        .init({
          resizeTo: container,
          background: BG,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio, 2),
          autoDensity: true,
        })
        .then(async () => {
          if (destroyed || !db) return;
          container.appendChild(application.canvas as HTMLCanvasElement);
          application.stage.eventMode = 'static';

          buildScene(application.stage);
          layout();
          application.renderer.on('resize', layout);

          // Settings chrome — idempotent if the start screen's loadCore already
          // fetched it; covers the direct-to-game dev entry too.
          await deps.coordinator.loadBundle('core-settings');
          if (destroyed) return;
          buildSettings();

          // 3. Start the level, then drive the fixed-step sim + per-frame render.
          startCurrentLevel(false);

          engine = createTickerEngine();
          stopSim = startFixedStepLoop(engine, (dt) => {
            // Frozen while the settings panel is up — menus must not cost lives.
            if (db && !destroyed && !settingsOpen) stepWorld(db, dt);
          });
          stopRender = engine.onFrame((dt) => render(dt));

          // Dev/bot surface — restart level and skip to next.
          setActiveInspectorActions([
            {
              id: 'restart-level',
              label: () => '↻ Restart level',
              run: () => startCurrentLevel(false),
            },
            {
              id: 'next-level',
              label: () => '▸ Next level',
              run: () => {
                if (levelIndex + 1 < LEVEL_COUNT) {
                  levelIndex += 1;
                  startCurrentLevel(true);
                }
              },
            },
          ]);
        });
    },

    destroy() {
      destroyed = true;
      stopSim?.();
      stopRender?.();
      stopSim = stopRender = null;
      engine?.destroy();
      engine = null;

      // Settings first — the menu kills its own tweens before the app goes.
      settings?.destroy();
      settings = null;

      for (const view of ballViews.values()) destroyDot(view);
      for (const view of shotViews.values()) destroyDot(view);
      ballViews.clear();
      shotViews.clear();
      if (banner) gsap.killTweensOf(banner);

      const teardown = () => {
        app?.destroy(true, { children: true });
        app = null;
        root = trackLayer = ballLayer = shotLayer = cannon = null;
        barrel = hopperCurrentDot = hopperNextDot = null;
        hud = banner = null;
        setActiveInspectorActions([]);
        db = null;
      };
      void (initPromise ? initPromise.then(teardown, teardown) : teardown());
    },

    ariaText,
  };
};
