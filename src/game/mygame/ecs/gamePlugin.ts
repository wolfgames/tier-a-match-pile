/**
 * gamePlugin — the bubble shooter's ECS world (@adobe/data).
 *
 * A Zuma-style game: a chain of coloured balls marches along a fixed spiral
 * track (`../bubble/path.ts`) toward the door at the centre. A cannon at the
 * centre fires coloured balls into the chain; three-or-more of a colour pop,
 * the gap closes, and cascades chain. Clear the chain to win the level; if the
 * front ball reaches the door, the level is lost.
 *
 * ECS is the **source of truth** (guardrail: game state lives in ECS, not
 * signals). This is a **real-time** game — the chain moves every frame with no
 * input — so it runs on the per-frame schedule (`schedule.ts` → `SYSTEM_ORDER`)
 * driven by a fixed-timestep loop. All state changes go through transactions;
 * the systems (`systems/`) call them each fixed step. Determinism holds: `dt`
 * and input arrive as injected resources, and randomness comes from a seeded LCG
 * held in the `rng` resource — never `Math.random()`/`Date.now()`.
 *
 * Plugin property order is runtime-enforced:
 *   extends → services → components → resources → archetypes → computed →
 *   transactions → actions → systems
 *
 * Two entity kinds, selected disjointly:
 *   • Ball       — a chain bead. Has `chainIndex` (Projectile does not).
 *   • Projectile — a ball in flight. Has `velocity` (Ball does not).
 * Both carry `position`/`color`/`spriteKey`, so never select on those alone.
 */

import { Database, type Entity, F32, I32, Observe, Vec2 } from '~/core/systems/ecs';
import { BALL_SPACING, CENTER, POINTS_PER_BALL, PROJECTILE_SPEED } from '../bubble/config';
import { PATH_LENGTH, posAt } from '../bubble/path';
import { nextColor } from '../bubble/rng';

/** Lifecycle of a single level. */
export type GamePhase = 'idle' | 'playing' | 'won' | 'lost';

/** A queued cannon shot awaiting the input system (input as intent). */
export interface FireIntent {
  /** Launch angle in radians (design space, atan2(dy, dx) from the cannon). */
  angle: number;
}

/**
 * Reproject every ball's position from the current `headT` and its `chainIndex`.
 * The single-`headT` model means position is always a pure function of the two,
 * so any structural change (march, insert, pop-and-recoil) just re-derives them.
 */
function reprojectChain(store: GameStore): void {
  const headT = store.resources.headT;
  for (const e of store.select(['chainIndex'])) {
    const b = store.read(e) as { chainIndex: number } | null;
    if (!b) continue;
    const p = posAt(headT - b.chainIndex * BALL_SPACING);
    store.update(e, { position: [p.x, p.y] });
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────

export const gamePlugin = Database.Plugin.create({
  components: {
    /** Colour index into the palette (see bubble/config COLORS). Balls + projectiles. */
    color: I32.schema,
    /** Design-space anchor the renderer reads. Balls + projectiles. */
    position: Vec2.schema,
    /** Order in the chain, 0 = front (nearest the door). Ball only — the selector. */
    chainIndex: I32.schema,
    /** Linear velocity (design px/sec). Projectile only — the selector. */
    velocity: Vec2.schema,
    /** Inspector display name (getEntityName reads spriteKey/key/name). */
    spriteKey: { type: 'string', default: '' } as const,
  },
  resources: {
    /** Current level index (0-based). */
    level: { default: 0 as number },
    /** Distinct colours in play this level (prefix of the palette). */
    colorsInLevel: { default: 3 as number },
    /** Chain march speed toward the door (design px/sec). */
    speed: { default: 0 as number },
    /** Arc distance of the front ball (chainIndex 0) along the track. */
    headT: { default: 0 as number },
    /** Number of balls currently in the chain (kept in sync by transactions). */
    chainCount: { default: 0 as number },
    score: { default: 0 as number },
    phase: { default: 'idle' as GamePhase },
    won: { default: false as boolean },

    // ── Determinism seam ──────────────────────────────────────────────────
    /** Total level time (ms), accumulated one fixed step at a time. */
    elapsedMs: { default: 0 as number },
    /** Last step's delta (ms) — the injected fixed `dt` systems integrate. */
    frameDeltaMs: { default: 0 as number },
    /** Seeded PRNG state (LCG). Advanced by transactions, never Math.random(). */
    rng: { default: 0 as number },

    // ── Cannon / hopper ───────────────────────────────────────────────────
    /** Colour index loaded in the cannon (fires next). */
    hopperCurrent: { default: 0 as number },
    /** Colour index queued behind it (shown on the cannon). */
    hopperNext: { default: 0 as number },
    /**
     * Queued shots awaiting the input system (input as intent). A FIFO queue,
     * not a single slot, so firing is effectively unlimited: every tap in a
     * frame is preserved and drained next step, however fast the player clicks.
     */
    pendingFires: { default: [] as FireIntent[] },
  },
  archetypes: {
    /** A chain bead. Selected by `chainIndex`. */
    Ball: ['chainIndex', 'color', 'position', 'spriteKey'],
    /** A ball in flight. Selected by `velocity`. */
    Projectile: ['color', 'position', 'velocity', 'spriteKey'],
  },
  computed: {
    /** Reactive "is the level over" flag — handy for the Inspector / agents. */
    finished: (db) =>
      Observe.withMap(db.observe.resources.phase, (p) => p === 'won' || p === 'lost'),
  },
  transactions: {
    /**
     * Start a level: clear the board, seed the RNG, build the incoming chain
     * (front at the entry, the rest queued off-track behind it), and load the
     * hopper. All colours are drawn from the seeded LCG so the run replays.
     */
    startLevel(
      store,
      {
        level,
        colors,
        chainLength,
        speed,
        seed,
        carryScore = false,
      }: {
        level: number;
        colors: number;
        chainLength: number;
        speed: number;
        seed: number;
        /** Keep the running score (advancing to the next level) vs. reset to 0. */
        carryScore?: boolean;
      },
    ) {
      // Clear-and-rebuild: spread before delete (deleting while iterating a live
      // selection skips entities).
      for (const e of [...store.select(['chainIndex'])]) store.delete(e); // balls
      for (const e of [...store.select(['velocity'])]) store.delete(e); // projectiles

      store.resources.level = level;
      store.resources.colorsInLevel = colors;
      store.resources.speed = speed;
      store.resources.headT = 0;
      store.resources.chainCount = chainLength;
      if (!carryScore) store.resources.score = 0;
      store.resources.phase = 'playing';
      store.resources.won = false;
      store.resources.elapsedMs = 0;
      store.resources.frameDeltaMs = 0;
      store.resources.pendingFires = [];

      let rng = seed >>> 0;
      for (let i = 0; i < chainLength; i++) {
        const draw = nextColor(rng, colors);
        rng = draw.state;
        // Front (i=0) sits at the entry (t=0); each ball behind is one spacing
        // further back (negative t → clamped to the entry until it slides in).
        const t = -i * BALL_SPACING;
        const p = posAt(t);
        store.archetypes.Ball.insert({
          chainIndex: i,
          color: draw.color,
          position: [p.x, p.y],
          spriteKey: `ball-${draw.color}`,
        });
      }

      // Load the hopper from the same stream.
      const first = nextColor(rng, colors);
      rng = first.state;
      const second = nextColor(rng, colors);
      rng = second.state;
      store.resources.hopperCurrent = first.color;
      store.resources.hopperNext = second.color;
      store.resources.rng = rng;
    },

    /**
     * March the chain one fixed step: advance `headT`, reproject every ball's
     * position from its index, and lose the level if the front reaches the door.
     */
    advanceChain(store, { dtSec }: { dtSec: number }) {
      if (store.resources.phase !== 'playing') return;
      const headT = store.resources.headT + store.resources.speed * dtSec;
      store.resources.headT = headT;
      reprojectChain(store);
      if (store.resources.chainCount > 0 && headT >= PATH_LENGTH) {
        store.resources.phase = 'lost';
        store.resources.won = false;
      }
    },

    /** Enqueue a shot for the input system to fire next step (input as intent). */
    submitFire(store, { angle }: FireIntent) {
      store.resources.pendingFires = [...store.resources.pendingFires, { angle }];
    },
    /** Drop every queued shot (drained by the input system). */
    clearFire(store) {
      store.resources.pendingFires = [];
    },

    /**
     * Fire the loaded colour along `angle` from the cannon, then roll the hopper
     * (current ← next, next ← a fresh draw). Deterministic: the draw uses the
     * `rng` resource, not Math.random().
     */
    fire(store, { angle }: FireIntent) {
      if (store.resources.phase !== 'playing') return;
      const color = store.resources.hopperCurrent;
      store.archetypes.Projectile.insert({
        color,
        position: [CENTER[0], CENTER[1]],
        velocity: [Math.cos(angle) * PROJECTILE_SPEED, Math.sin(angle) * PROJECTILE_SPEED],
        spriteKey: `shot-${color}`,
      });
      const draw = nextColor(store.resources.rng, store.resources.colorsInLevel);
      store.resources.hopperCurrent = store.resources.hopperNext;
      store.resources.hopperNext = draw.color;
      store.resources.rng = draw.state;
    },

    /** Integrate every projectile by one fixed step. */
    advanceProjectiles(store, { dtSec }: { dtSec: number }) {
      for (const e of store.select(['velocity'])) {
        const p = store.read(e) as {
          position: [number, number];
          velocity: [number, number];
        } | null;
        if (!p) continue;
        store.update(e, {
          position: [p.position[0] + p.velocity[0] * dtSec, p.position[1] + p.velocity[1] * dtSec],
        });
      }
    },

    /** Remove a projectile (inserted into the chain, or left the field). */
    despawnProjectile(store, { entity }: { entity: Entity }) {
      store.delete(entity);
    },

    /**
     * Insert a new ball of `color` at `atIndex`, pushing everything behind it
     * back by one slot. Reprojects every ball from the current `headT` so the
     * newcomer and its shifted neighbours all land on their true slots — the
     * renderer then eases each view to its new target (the shot wedging in).
     */
    insertBall(store, { atIndex, color }: { atIndex: number; color: number }) {
      for (const e of store.select(['chainIndex'])) {
        const b = store.read(e) as { chainIndex: number } | null;
        if (b && b.chainIndex >= atIndex) store.update(e, { chainIndex: b.chainIndex + 1 });
      }
      const p = posAt(store.resources.headT - atIndex * BALL_SPACING);
      store.archetypes.Ball.insert({
        chainIndex: atIndex,
        color,
        position: [p.x, p.y],
        spriteKey: `ball-${color}`,
      });
      store.resources.chainCount += 1;
      reprojectChain(store);
    },

    /**
     * Pop `count` balls starting at chain index `start`, then close the gap. The
     * chain **slips back toward the entry** by the popped length (`headT` drops
     * by `count · BALL_SPACING`) so the survivors recoil toward the start and
     * re-join the balls coming in — the renderer eases each view to its new,
     * pulled-back slot. Scores `count` balls.
     */
    popRange(store, { start, count }: { start: number; count: number }) {
      const toDelete: Entity[] = [];
      for (const e of store.select(['chainIndex'])) {
        const b = store.read(e) as { chainIndex: number } | null;
        if (b && b.chainIndex >= start && b.chainIndex < start + count) toDelete.push(e);
      }
      for (const e of toDelete) store.delete(e);
      for (const e of store.select(['chainIndex'])) {
        const b = store.read(e) as { chainIndex: number } | null;
        if (b && b.chainIndex >= start + count) store.update(e, { chainIndex: b.chainIndex - count });
      }
      store.resources.chainCount = Math.max(0, store.resources.chainCount - count);
      store.resources.score += count * POINTS_PER_BALL;
      // Recoil the whole chain back toward the entry by the length just removed.
      store.resources.headT = Math.max(0, store.resources.headT - count * BALL_SPACING);
      reprojectChain(store);
    },

    /** Set the level phase. */
    setPhase(store, phase: GamePhase) {
      store.resources.phase = phase;
    },
    /** Mark the level won (phase + won together). */
    markWon(store, won: boolean) {
      store.resources.won = won;
      store.resources.phase = won ? 'won' : 'playing';
    },

    /** Inject one fixed step's time. `dt` comes from the loop, never Date.now(). */
    advanceTime(store, { dt }: { dt: number }) {
      store.resources.frameDeltaMs = dt;
      store.resources.elapsedMs += dt;
    },
  },
  systems: {
    // Init-only, no-op: consumers call `startLevel` explicitly so the world is
    // populated identically in game and in tests. The per-frame schedule lives
    // in `schedule.ts` (`stepWorld`), driven by the engine's fixed-step loop.
    game_initialize: {
      create: () => {},
    },
  },
});

export type GamePlugin = typeof gamePlugin;
export type GameDatabase = Database.Plugin.ToDatabase<GamePlugin>;
export type GameStore = Database.Plugin.ToStore<GamePlugin>;

/** Create a fresh game ECS world (base plugin, no agent service). */
export function createGameWorld(): GameDatabase {
  return Database.create(gamePlugin) as GameDatabase;
}
