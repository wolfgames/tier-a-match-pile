/**
 * systems — the ordered per-frame schedule.
 *
 * `SYSTEM_ORDER` is the single, explicit list of systems `stepWorld` runs every
 * fixed step, in sequence. Order is contract: a system may depend on state
 * written by an earlier one. Each system is `(db: GameDatabase) => void`: it
 * reads ECS, calls transactions, returns nothing. `dt` is read from
 * `resources.frameDeltaMs` (injected by `stepWorld`), never from wall-clock time.
 */

import type { GameDatabase } from '../gamePlugin';
import { chainSystem } from './chainSystem';
import { collisionSystem } from './collisionSystem';
import { inputSystem } from './inputSystem';
import { projectileSystem } from './projectileSystem';

export { inputSystem, projectileSystem, chainSystem, collisionSystem };

/**
 * Per-frame systems, in execution order:
 *   1. inputSystem      — drain the queued shot → spawn a projectile
 *   2. projectileSystem — integrate projectile motion
 *   3. chainSystem      — march the chain toward the door (+ lose check)
 *   4. collisionSystem  — insert on contact, pop matches, cascade, win check
 * Collision runs last so it sees this step's fresh positions.
 */
export const SYSTEM_ORDER: ReadonlyArray<(db: GameDatabase) => void> = [
  inputSystem,
  projectileSystem,
  chainSystem,
  collisionSystem,
];
