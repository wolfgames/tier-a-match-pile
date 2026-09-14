/**
 * collisionSystem — insert shots into the chain, pop matches, cascade, win.
 *
 * Order:  4 of 4 (last — reads the fresh positions written by the projectile
 *         and chain systems this same step)
 * Reads:  the chain + projectiles (via readStateFromEcs helpers)
 * Writes: via insertBall / popRange / despawnProjectile / markWon
 * Pure:   yes — no Date.now/Math.random/Pixi/DOM. All decisions are computed
 *         from the snapshot, then applied through transactions.
 *
 * Per step: cull any projectile that has left the field; for the first
 * projectile touching the chain, insert its colour at the nearest seam, then
 * resolve matches at that seam (popping runs ≥ MATCH_MIN and cascading into the
 * newly-joined gap). Emptying the chain wins the level.
 */

import { INSERT_DIST, MATCH_MIN } from '../../bubble/config';
import { DESIGN_H, DESIGN_W } from '../../bubble/config';
import type { GameDatabase } from '../gamePlugin';
import { type BallState, readChain, readProjectiles } from '../readStateFromEcs';

const OOB_MARGIN = 60;

function dist2(a: readonly [number, number], b: readonly [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function outOfBounds(p: readonly [number, number]): boolean {
  return (
    p[0] < -OOB_MARGIN ||
    p[0] > DESIGN_W + OOB_MARGIN ||
    p[1] < -OOB_MARGIN ||
    p[1] > DESIGN_H + OOB_MARGIN
  );
}

/**
 * Pick the chain index to insert at, given the nearest ball (`best`) and where
 * the projectile struck. Compares the two neighbouring gaps and inserts into the
 * one closer to the impact, so the ball snaps in on the side it came from.
 */
function chooseInsertIndex(
  chain: BallState[],
  best: number,
  impact: readonly [number, number],
): number {
  const here = chain[best].position;
  const before = chain[best - 1]?.position; // toward the door
  const after = chain[best + 1]?.position; // toward the entry
  const midBefore: readonly [number, number] = before
    ? [(before[0] + here[0]) / 2, (before[1] + here[1]) / 2]
    : here;
  const midAfter: readonly [number, number] = after
    ? [(here[0] + after[0]) / 2, (here[1] + after[1]) / 2]
    : here;
  return dist2(impact, midBefore) <= dist2(impact, midAfter) ? best : best + 1;
}

/**
 * Pop the run at `seam` if it is long enough, then follow the cascade into the
 * gap it opens. Only the newly-formed adjacency is re-checked, so pre-existing
 * runs elsewhere in the chain are left untouched (true Zuma behaviour).
 */
function resolveMatches(db: GameDatabase, seam: number): void {
  let k = seam;
  for (;;) {
    const chain = readChain(db);
    if (k < 0 || k >= chain.length) return;
    const color = chain[k].color;
    let s = k;
    while (s - 1 >= 0 && chain[s - 1].color === color) s--;
    let e = k;
    while (e + 1 < chain.length && chain[e + 1].color === color) e++;
    const len = e - s + 1;
    if (len < MATCH_MIN) return;

    db.transactions.popRange({ start: s, count: len });
    // The gap closes: the ball formerly at e+1 is now at index s. Re-check the
    // new adjacency (s-1 | s). If we popped the front (s === 0) there is no new
    // adjacency; if nothing remains behind, we're done.
    if (s <= 0 || s >= db.resources.chainCount) return;
    k = s;
  }
}

export function collisionSystem(db: GameDatabase): void {
  if (db.resources.phase !== 'playing') return;
  const projectiles = readProjectiles(db);
  if (projectiles.length === 0) return;

  const threshold = INSERT_DIST * INSERT_DIST;
  for (const shot of projectiles) {
    if (outOfBounds(shot.position)) {
      db.transactions.despawnProjectile({ entity: shot.entity });
      continue;
    }
    const chain = readChain(db);
    if (chain.length === 0) continue;

    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < chain.length; i++) {
      const d = dist2(shot.position, chain[i].position);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0 || bestD > threshold) continue;

    const atIndex = chooseInsertIndex(chain, best, shot.position);
    db.transactions.insertBall({ atIndex, color: shot.color });
    db.transactions.despawnProjectile({ entity: shot.entity });
    resolveMatches(db, atIndex);

    if (db.resources.chainCount === 0 && db.resources.phase === 'playing') {
      db.transactions.markWon(true);
    }
    // One insertion per step keeps the seam bookkeeping simple; remaining shots
    // are re-tested next step (they've barely moved).
    return;
  }
}
