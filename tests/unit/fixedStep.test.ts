/**
 * Unit tests for the fixed-timestep accumulator (engine/fixedStep.ts).
 *
 * planFixedSteps is pure — no engine, no clock — so the whole "Fix Your
 * Timestep" policy (carry, multi-step catch-up, spiral-of-death clamp, render
 * alpha) is verified here without a frame loop.
 */

import { describe, expect, it } from 'vitest';
import { planFixedSteps } from '~/game/mygame/engine/fixedStep';

const FIXED = 16; // ms, round numbers for readable assertions
const MAX = 5;

describe('planFixedSteps', () => {
  it('runs exactly one step when a full step of time arrives', () => {
    const plan = planFixedSteps(0, FIXED, FIXED, MAX);
    expect(plan.steps).toBe(1);
    expect(plan.accumulatorMs).toBe(0);
    expect(plan.alpha).toBe(0);
  });

  it('runs zero steps and carries a partial delta forward', () => {
    const plan = planFixedSteps(0, 10, FIXED, MAX);
    expect(plan.steps).toBe(0);
    expect(plan.accumulatorMs).toBe(10);
    expect(plan.alpha).toBeCloseTo(10 / 16);
  });

  it('accumulates carried remainder until it crosses a step', () => {
    const plan = planFixedSteps(10, 10, FIXED, MAX); // 20ms accumulated
    expect(plan.steps).toBe(1);
    expect(plan.accumulatorMs).toBe(4);
  });

  it('catches up with multiple steps in one frame', () => {
    const plan = planFixedSteps(0, 50, FIXED, MAX); // 50 / 16 = 3 rem 2
    expect(plan.steps).toBe(3);
    expect(plan.accumulatorMs).toBe(2);
  });

  it('clamps to maxSubSteps and drops the backlog (spiral-of-death guard)', () => {
    const plan = planFixedSteps(0, 1000, FIXED, MAX); // would be 62 steps
    expect(plan.steps).toBe(MAX);
    expect(plan.accumulatorMs).toBe(0); // backlog discarded, no runaway catch-up
    expect(plan.alpha).toBe(0);
  });

  it('is framerate-independent within the clamp: same time → same steps', () => {
    // 64ms (4 steps, under the clamp) delivered as one big frame vs four small
    // frames must run the same number of fixed steps.
    const oneBig = planFixedSteps(0, 64, FIXED, MAX);
    let acc = 0;
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const p = planFixedSteps(acc, 16, FIXED, MAX);
      total += p.steps;
      acc = p.accumulatorMs;
    }
    expect(oneBig.steps).toBe(4);
    expect(total).toBe(4);
  });
});
