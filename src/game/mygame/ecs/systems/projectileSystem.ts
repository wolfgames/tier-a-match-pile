/**
 * projectileSystem — move balls in flight (the per-frame path).
 *
 * Order:  2 of 4 (after input may have spawned a shot; before collision tests it)
 * Reads:  resources.frameDeltaMs, every Projectile's position/velocity
 * Writes: via advanceProjectiles → each Projectile's position
 * Pure:   yes — `dt` is the injected fixed step, so a shot's trajectory is
 *         identical on every replay.
 */

import type { GameDatabase } from '../gamePlugin';

export function projectileSystem(db: GameDatabase): void {
  const dtSec = db.resources.frameDeltaMs / 1000;
  if (dtSec <= 0) return;
  db.transactions.advanceProjectiles({ dtSec });
}
