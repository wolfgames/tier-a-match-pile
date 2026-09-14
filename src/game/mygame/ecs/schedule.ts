/**
 * schedule — the per-frame world step.
 *
 * `stepWorld(db, dt)` is the one entry point the engine's frame loop calls each
 * frame (`engine.onFrame(dt => stepWorld(db, dt))`). It injects the frame's time
 * into ECS, then runs `SYSTEM_ORDER` in sequence.
 *
 * Determinism is the whole point: `dt` is passed in (from the engine, or a fixed
 * value in a test) and stored as a resource, so nothing reads wall-clock time.
 * A test can pump exact frames — `for (…) stepWorld(db, 1000/60)` — and assert
 * the outcome with no engine and no screen. See `schedule.test.ts`.
 */

import type { GameDatabase } from './gamePlugin';
import { SYSTEM_ORDER } from './systems';

/** Advance the world by one frame of `dtMs` milliseconds. */
export function stepWorld(db: GameDatabase, dtMs: number): void {
  db.transactions.advanceTime({ dt: dtMs });
  for (const system of SYSTEM_ORDER) system(db);
}
