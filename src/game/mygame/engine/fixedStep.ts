/**
 * fixedStep — decouple the simulation rate from the render frame rate.
 *
 * The engine seam (`createTickerEngine`) delivers *variable* real-time deltas —
 * whatever the last animation frame took. Physics and any velocity/orbit
 * integration are only stable and deterministic at a *fixed* `dt`, so we don't
 * feed real dt straight into `stepWorld`. Instead we accumulate real time and
 * spend it in fixed-size steps — the classic "Fix Your Timestep" accumulator.
 *
 * Consequences:
 *   • Physics is stable and framerate-independent (60fps and 144fps agree).
 *   • The sim stays replayable: every step sees the SAME `FIXED_DT`, so
 *     `stepWorld(db, FIXED_DT)` in a headless test reproduces the live run.
 *   • A leftover `alpha` (0..1) is exposed for the renderer to interpolate
 *     between the last two sim states, so visuals stay smooth between steps.
 *
 * Turn-based games don't use any of this — they have no loop. This is the
 * real-time path only.
 */

import type { EngineHandle } from './types';

/** One 60Hz simulation step, in ms — the default fixed timestep. */
export const DEFAULT_FIXED_DT_MS = 1000 / 60;

export interface FixedStepOptions {
  /** Simulation step size (ms). Default 1000/60 (~16.667). */
  fixedDtMs?: number;
  /**
   * Max fixed steps per render frame. Guards the "spiral of death": after a
   * stall (backgrounded tab, GC pause, debugger) the backlog is capped and the
   * excess discarded rather than trying to catch up forever. Default 5.
   */
  maxSubSteps?: number;
  /** Optional per-frame hook with the interpolation factor (0..1) for the renderer. */
  onInterpolate?: (alpha: number) => void;
}

/** The result of spending accumulated real time into fixed steps. */
export interface StepPlan {
  /** How many fixed steps to run this frame (0..maxSubSteps). */
  steps: number;
  /** Time carried into the next frame (ms), always < fixedDtMs. */
  accumulatorMs: number;
  /** Render interpolation factor: accumulatorMs / fixedDtMs, in [0, 1). */
  alpha: number;
}

/**
 * Pure accumulator math — no engine, no state, fully unit-testable. Given the
 * carried accumulator and this frame's real delta, decide how many fixed steps
 * to run and what to carry forward.
 */
export function planFixedSteps(
  accumulatorMs: number,
  realDtMs: number,
  fixedDtMs: number,
  maxSubSteps: number,
): StepPlan {
  let acc = accumulatorMs + realDtMs;
  let steps = Math.floor(acc / fixedDtMs);

  if (steps > maxSubSteps) {
    // Spiral-of-death guard: run at most maxSubSteps and drop the backlog, so a
    // long stall causes a visible time-skip rather than a runaway catch-up.
    steps = maxSubSteps;
    acc = 0;
  } else {
    acc -= steps * fixedDtMs;
  }

  return { steps, accumulatorMs: acc, alpha: acc / fixedDtMs };
}

/**
 * Drive `step(fixedDtMs)` at a fixed cadence off an engine's variable frames.
 * Returns an unsubscribe function.
 *
 *   const stop = startFixedStepLoop(engine, (dt) => stepWorld(db, dt));
 */
export function startFixedStepLoop(
  engine: EngineHandle,
  step: (fixedDtMs: number) => void,
  options?: FixedStepOptions,
): () => void {
  const fixedDtMs = options?.fixedDtMs ?? DEFAULT_FIXED_DT_MS;
  const maxSubSteps = options?.maxSubSteps ?? 5;
  let accumulatorMs = 0;

  return engine.onFrame((realDtMs) => {
    const plan = planFixedSteps(accumulatorMs, realDtMs, fixedDtMs, maxSubSteps);
    for (let i = 0; i < plan.steps; i++) step(fixedDtMs);
    accumulatorMs = plan.accumulatorMs;
    options?.onInterpolate?.(plan.alpha);
  });
}
