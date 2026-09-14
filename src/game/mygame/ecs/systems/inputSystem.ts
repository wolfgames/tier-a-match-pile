/**
 * inputSystem — drain the queued shot and fire it.
 *
 * Order:  1 of 4 (first — the projectile it spawns is moved and tested later
 *         this same step by the projectile and collision systems)
 * Reads:  resources.pendingFires
 * Writes: via fire → spawns a Projectile, rolls the hopper
 * Pure:   yes — no Date.now/Math.random/Pixi/DOM. Input arrives as an intent
 *         resource, not a native event ("input as intent"), which is what makes
 *         the whole sim steppable in a headless test.
 */

import type { GameDatabase } from '../gamePlugin';

export function inputSystem(db: GameDatabase): void {
  const queued = db.resources.pendingFires;
  if (queued.length === 0) return;
  // Snapshot then clear before resolving — a shot never re-reads its own
  // trigger. Firing is unlimited: every tap queued this frame is fired.
  db.transactions.clearFire();
  for (const intent of queued) db.transactions.fire({ angle: intent.angle });
}
