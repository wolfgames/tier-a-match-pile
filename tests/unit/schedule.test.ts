/**
 * Headless tests for the bubble shooter's deterministic sim
 * (src/game/mygame/ecs/*). The payoff of the determinism seam: the whole game
 * runs with no engine and no screen. Seed a level, queue a shot as intent, pump
 * exact fixed frames, and assert the resulting ECS state. Because `dt`, input,
 * and RNG are all injected/seeded (never wall-clock / native events /
 * Math.random), every outcome here is reproducible.
 */

import { describe, expect, it } from 'vitest';
import { BALL_SPACING, CENTER, POINTS_PER_BALL } from '~/game/mygame/bubble/config';
import { PATH_LENGTH } from '~/game/mygame/bubble/path';
import { createGameWorld } from '~/game/mygame/ecs/gamePlugin';
import { readChain, readProjectiles } from '~/game/mygame/ecs/readStateFromEcs';
import { stepWorld } from '~/game/mygame/ecs/schedule';

const DT = 1000 / 60; // one 60fps frame, in ms

/** Start a small, fully-controlled level. */
function startTestLevel(
  db: ReturnType<typeof createGameWorld>,
  over: Partial<{ colors: number; chainLength: number; speed: number; seed: number }> = {},
) {
  db.transactions.startLevel({
    level: 0,
    colors: over.colors ?? 3,
    chainLength: over.chainLength ?? 6,
    speed: over.speed ?? 1,
    seed: over.seed ?? 1337,
  });
}

describe('startLevel', () => {
  it('builds the chain and sets play state', () => {
    const db = createGameWorld();
    startTestLevel(db, { chainLength: 6 });

    expect(db.resources.phase).toBe('playing');
    expect(db.resources.chainCount).toBe(6);
    expect(readChain(db)).toHaveLength(6);
    expect(db.resources.headT).toBe(0);
    // Chain indices are contiguous 0..n-1.
    expect(readChain(db).map((b) => b.chainIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('is deterministic — same seed → same colours', () => {
    const a = createGameWorld();
    const b = createGameWorld();
    startTestLevel(a, { seed: 42 });
    startTestLevel(b, { seed: 42 });
    expect(readChain(a).map((x) => x.color)).toEqual(readChain(b).map((x) => x.color));
  });
});

describe('chain march', () => {
  it('advances headT by speed·dt each step', () => {
    const db = createGameWorld();
    startTestLevel(db, { speed: 60 });
    stepWorld(db, DT); // 1/60 s at 60 px/s → +1 px
    expect(db.resources.headT).toBeCloseTo(1, 5);
  });

  it('loses the level when the front ball reaches the door', () => {
    const db = createGameWorld();
    startTestLevel(db, { speed: 1 });
    // Jump the head to the door in one big (deterministic) step.
    db.transactions.advanceChain({ dtSec: PATH_LENGTH + 10 });
    expect(db.resources.phase).toBe('lost');
  });
});

describe('input as intent', () => {
  it('drains a queued shot and spawns a moving projectile', () => {
    const db = createGameWorld();
    startTestLevel(db);

    db.transactions.submitFire({ angle: 0 });
    expect(db.resources.pendingFires).toHaveLength(1);

    stepWorld(db, DT);
    expect(db.resources.pendingFires).toHaveLength(0); // drained by inputSystem
    const shots = readProjectiles(db);
    expect(shots).toHaveLength(1);
    // Spawned at the cannon, moving outward (+x for angle 0).
    expect(shots[0].velocity[0]).toBeGreaterThan(0);

    const x0 = readProjectiles(db)[0].position[0];
    stepWorld(db, DT);
    expect(readProjectiles(db)[0].position[0]).toBeGreaterThan(x0);
  });

  it('drains every queued shot in one step (unlimited fire rate)', () => {
    const db = createGameWorld();
    startTestLevel(db);
    db.transactions.submitFire({ angle: 0 });
    db.transactions.submitFire({ angle: Math.PI });
    expect(db.resources.pendingFires).toHaveLength(2);
    stepWorld(db, DT);
    expect(db.resources.pendingFires).toHaveLength(0);
    expect(readProjectiles(db)).toHaveLength(2); // both fired, no coalescing
  });

  it('rolls the hopper on fire (deterministic draw)', () => {
    const db = createGameWorld();
    startTestLevel(db);
    const nextBefore = db.resources.hopperNext;
    db.transactions.submitFire({ angle: 0 });
    stepWorld(db, DT);
    // current ← previous next.
    expect(db.resources.hopperCurrent).toBe(nextBefore);
  });
});

describe('insert + pop transactions', () => {
  it('insertBall shifts trailing indices and grows the chain', () => {
    const db = createGameWorld();
    startTestLevel(db, { chainLength: 4 });
    db.transactions.insertBall({ atIndex: 2, color: 0 });
    expect(db.resources.chainCount).toBe(5);
    expect(readChain(db).map((b) => b.chainIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('popRange removes a run, closes the gap, and scores', () => {
    const db = createGameWorld();
    startTestLevel(db, { chainLength: 6 });
    db.transactions.popRange({ start: 2, count: 3 });
    expect(db.resources.chainCount).toBe(3);
    expect(db.resources.score).toBe(3 * POINTS_PER_BALL);
    expect(readChain(db).map((b) => b.chainIndex)).toEqual([0, 1, 2]);
  });

  it('popRange slips the chain back toward the entry by the popped length', () => {
    const db = createGameWorld();
    startTestLevel(db, { chainLength: 6, speed: 100 });
    db.transactions.advanceChain({ dtSec: 3 }); // headT → 300
    const before = db.resources.headT;
    db.transactions.popRange({ start: 1, count: 3 });
    expect(db.resources.headT).toBeCloseTo(before - 3 * BALL_SPACING, 5);
  });
});

describe('collision through the full schedule', () => {
  it('a shot into a same-colour chain inserts, pops the run, and wins', () => {
    const db = createGameWorld();
    // colours:1 → every ball is colour 0, so any insertion completes a run and
    // the whole chain pops. speed:1 keeps drift negligible during the shot.
    startTestLevel(db, { colors: 1, chainLength: 5, speed: 1, seed: 7 });
    // Spread the chain out along the track so balls have distinct positions.
    db.transactions.advanceChain({ dtSec: 5 * BALL_SPACING });

    // Aim from the cannon at a mid-chain ball and fire.
    const target = readChain(db)[2];
    const angle = Math.atan2(target.position[1] - CENTER[1], target.position[0] - CENTER[0]);
    db.transactions.submitFire({ angle });

    let steps = 0;
    while (db.resources.phase === 'playing' && steps < 240) {
      stepWorld(db, DT);
      steps++;
    }

    expect(db.resources.score).toBeGreaterThan(0); // a run popped
    expect(db.resources.chainCount).toBe(0);
    expect(db.resources.phase).toBe('won');
    expect(db.resources.won).toBe(true);
  });
});
