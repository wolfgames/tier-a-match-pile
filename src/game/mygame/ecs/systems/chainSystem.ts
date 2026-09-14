/**
 * chainSystem — march the ball chain toward the door (the per-frame path).
 *
 * Order:  3 of 4 (after projectiles move; before collision reads positions)
 * Reads:  resources.frameDeltaMs, resources.speed, resources.headT
 * Writes: via advanceChain → resources.headT, every Ball's position, and the
 *         lose transition (front ball reaches the door)
 * Pure:   yes — the chain moves purely from the injected fixed `dt`, so the
 *         march is identical on every replay. This is the canonical "runs every
 *         frame even with no input" system.
 */

import type { GameDatabase } from '../gamePlugin';

export function chainSystem(db: GameDatabase): void {
  const dtSec = db.resources.frameDeltaMs / 1000;
  if (dtSec <= 0) return;
  db.transactions.advanceChain({ dtSec });
}
