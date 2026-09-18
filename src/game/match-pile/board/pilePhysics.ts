// what_in: per-tile spawn/remove/wake lifecycle events (from boardRenderer.ts#sync, which owns
//          the logical tile set) + a per-frame `dt` (from the controller's own ticker).
// what_out: `PilePhysics` — a tiny, isolated presentation-only simulation: each tracked tile gets
//           a bounding-circle body (x/y/vx/vy/rotation/angularVelocity/sleeping) that gravity,
//           soft board-bounds, and cheap circle-separation settle into a loose "pile" look.
// why_here: PILE-PHYSICS prototype (tier-a-build-v4) — "make the pile feel physical, loose, and
//           satisfying instead of sitting in completely static positions" (Match Factory-inspired).
//           Deliberately NOT realistic and NOT a general physics framework: no broad-phase grid,
//           no polygon collision, no persistent constraint solver — see the tuning knobs below for
//           the full behavioural surface. Pure plain-data/math, no Pixi import (same posture as
//           board/exposure.ts) — "do not make game rules depend on physical coordinates" cuts both
//           ways: this file doesn't know about Containers, and rules/ecs/ never import it.
//
// ARCHITECTURE: logical game state (rules/ecs — typeId, matches, orders) is completely unaware
// this file exists. boardRenderer.ts is the ONLY caller: it still owns the true tile set (from
// `db.resources.pile`) and still destroys/rebuilds tile Containers exactly as before on every
// sync (R-EXPOSURE's existing contract — exposure/tap-acceptance recomputed on every pile change
// is unchanged). This module only supplies WHERE each still-alive tile's Container should sit
// this frame, as an offset from its existing deterministic scatter position (board/tiles.ts
// #tileLayoutFor) rather than a full free-fall across the whole board — bounded so it reads as
// "the pile is alive," never as pieces relocating across the board or fighting the scatter look
// the R-EXPOSURE/SCATTER-FILL passes already tuned.

/** Every tunable in one place, per the "centralize these as tuning constants" ask. Deliberately
 * conservative starting values — low gravity/bounce, medium/high damping, fast settle. */
export interface PhysicsTuning {
  /** Downward acceleration, px/s². */
  gravity: number;
  /** Restitution (0-1) on a board-edge or piece-to-piece contact — how much rebound velocity
   * survives a collision. Low = soft/dead, not bouncy-ball-like. */
  bounce: number;
  /** Per-second linear velocity decay rate (applied as `v *= max(0, 1 - linearDamping*dt)` each
   * step) — higher = faster settle. */
  linearDamping: number;
  /** Same as `linearDamping`, for `angularVelocity`. */
  angularDamping: number;
  /** Max radians a body's rotation may drift from its original scatter rotation (board/tiles.ts
   * #tileLayoutFor's `rot`) in either direction — keeps "pieces may slightly rotate when
   * colliding" from ever spinning a piece into an unrecognisable orientation. */
  maxRotation: number;
  /** Below this speed (px/s) AND `sleepAngularThreshold` (rad/s), a body is eligible to sleep. */
  sleepVelocityThreshold: number;
  sleepAngularThreshold: number;
  /** Safety net: force-sleep a body that's been awake this many seconds regardless of speed —
   * "avoid endless jitter" even if some edge case keeps re-exciting a body. */
  settleTimeoutS: number;
  /** Radius (px) used to find "nearby" bodies for two distinct events: (1) waking sleeping
   * neighbours around a just-removed piece's last position (the "unsupported pieces fall into the
   * gap" behaviour), and (2) rippling a press's `neighborImpulse` to bodies around the pressed
   * tile. Shared rather than split into two knobs — both are "how far does this event's
   * influence reach," and the level-tuning brief only calls for one radius per profile. */
  wakeRadius: number;
  /** Spawn behaviour — how far above its rest position a tile starts (px), max extra random spawn
   * rotation (radians) on top of its scatter rotation, and max random horizontal spawn speed
   * (px/s). All deliberately small — "avoid chaotic explosions", "settle quickly". */
  spawnDropPx: number;
  spawnJitterRot: number;
  spawnMaxVX: number;
  /** Collision radius = `(tileSize / 2) * collisionRadiusRatio`. Below 1 so piled pieces overlap
   * a little at their corners (real square chips piled loosely do this) rather than sitting in
   * perfectly padded circles — "use the simplest approach that creates a convincing pile." */
  collisionRadiusRatio: number;
  /** LEVEL-TUNING pass: speed (px/s) given to a tile's OWN velocity the instant it's pressed
   * (`PilePhysics#press`, driven by a `pointerdown` — fires immediately, independent of whether
   * the eventual tap resolves as a valid move). This is the primary felt movement on Level 1. */
  pressImpulse: number;
  /** Speed (px/s) rippled to bodies within `wakeRadius` of a pressed tile — "nearby pieces may
   * receive a very small push." Independent of `pressImpulse` so a press can feel strong on the
   * pressed tile itself while barely nudging its neighbours (or vice versa). */
  neighborImpulse: number;
  /** One-time speed (px/s) given to a body the instant `wakeNear` wakes it, directed toward the
   * vacated point — makes a removal's "pile collapses into the gap" read as an immediate
   * rearrangement rather than waiting on gravity alone to slowly discover the opening. Near-zero
   * keeps a removal to "a very small local adjustment" (Level 1); a real value makes it visible
   * (Level 2+). */
  collapseStrength: number;
}

/** Level 1 / tutorial profile — "should NOT behave like a loose pile." Gravity is a hair above
 * zero (not exactly 0, so a press's upward pop still settles back down instead of drifting
 * forever), damping is very high, rotation range is tiny, and collapse/neighbour impulses are
 * minimal so a removal only ever produces "a very small local adjustment." Press is the one
 * deliberately noticeable value — it's the PRIMARY source of felt movement on this level. */
export const LEVEL_1_PHYSICS: PhysicsTuning = {
  gravity: 12,
  bounce: 0.05,
  linearDamping: 9,
  angularDamping: 10,
  maxRotation: 0.04,
  sleepVelocityThreshold: 8,
  sleepAngularThreshold: 0.08,
  settleTimeoutS: 1.2,
  wakeRadius: 40,
  spawnDropPx: 4,
  spawnJitterRot: 0.03,
  spawnMaxVX: 4,
  collisionRadiusRatio: 0.88,
  pressImpulse: 55,
  neighborImpulse: 10,
  collapseStrength: 4,
};

/** Level 2+ profile — the fuller Match Factory-inspired pile: clearly stronger gravity, lower
 * damping (so contacts/settling read as real motion, not instant snaps), more rotation range, a
 * stronger neighbour ripple and collapse pull, and a wider wake radius so a removal visibly
 * reorganises more of the pile, not just its immediate contacts. This is also the fallback/
 * default profile for any caller that doesn't pick a level-specific one. */
export const STANDARD_PHYSICS: PhysicsTuning = {
  gravity: 420,
  bounce: 0.18,
  linearDamping: 3.5,
  angularDamping: 4,
  maxRotation: 0.26,
  sleepVelocityThreshold: 6,
  sleepAngularThreshold: 0.05,
  settleTimeoutS: 2.5,
  wakeRadius: 90,
  spawnDropPx: 18,
  spawnJitterRot: 0.12,
  spawnMaxVX: 20,
  collisionRadiusRatio: 0.88,
  pressImpulse: 70,
  neighborImpulse: 40,
  collapseStrength: 60,
};

/** LEVEL-TUNING pass: one physics implementation (`PilePhysics`), intensity chosen per level via
 * this single switch — never a forked/duplicated simulation. Level 1 is the tutorial-stable
 * profile; everything from Level 2 on uses the fuller pile behaviour. `<= 1` also covers
 * `levelIndex === 0` (before the very first level finishes loading) defensively. */
export function physicsTuningForLevel(levelIndex: number): PhysicsTuning {
  return levelIndex <= 1 ? LEVEL_1_PHYSICS : STANDARD_PHYSICS;
}

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  angularVelocity: number;
  /** The scatter-formula anchor (board/tiles.ts#tileLayoutFor output) — rotation is clamped
   * around `restRotation`, and bounds clamping still uses the live board panel size, not this. */
  restRotation: number;
  radius: number;
  sleeping: boolean;
  /** Seconds this body has been continuously awake — the `settleTimeoutS` safety net. */
  awakeFor: number;
}

/** Deterministic per-string [0,1) hash — same technique board/tiles.ts uses for its own scatter
 * jitter, duplicated locally (not exported there) so this module stays Pixi/tiles.ts-independent. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export class PilePhysics {
  private bodies = new Map<string, Body>();

  constructor(private tuning: PhysicsTuning = STANDARD_PHYSICS) {}

  has(id: string): boolean {
    return this.bodies.has(id);
  }

  /** Drops every tracked body — call when a new level's puzzle loads, so a reused id (unlikely,
   * but not guaranteed impossible across levels) never inherits a stale pose from the last one. */
  reset(): void {
    this.bodies.clear();
  }

  /** Spawns a body a little above `restX/restY` with a small random extra rotation and a tiny
   * random horizontal nudge — "pieces can start with slightly different Y positions... let
   * gravity settle them into the pile." Idempotent-guarded by the caller (`has()`), not here. */
  spawn(id: string, restX: number, restY: number, restRotation: number, radius: number): void {
    const t = this.tuning;
    const rx = hash01(`${id}:dy`);
    const rvx = hash01(`${id}:vx`) - 0.5;
    const rrot = hash01(`${id}:rot`) - 0.5;
    this.bodies.set(id, {
      x: restX,
      y: restY - t.spawnDropPx * (0.4 + rx * 0.6),
      vx: rvx * 2 * t.spawnMaxVX,
      vy: 0,
      rotation: restRotation + rrot * 2 * t.spawnJitterRot,
      angularVelocity: 0,
      restRotation,
      radius,
      sleeping: false,
      awakeFor: 0,
    });
  }

  /** Stops simulating `id` and returns its last pose (for `wakeNear`) — call the instant a tile
   * leaves the logical pile (matched/collected); the caller (boardRenderer.ts) already destroys
   * its Container in the same pass, so "stop simulating that piece" falls out of this for free. */
  remove(id: string): { x: number; y: number } | null {
    const b = this.bodies.get(id);
    this.bodies.delete(id);
    return b ? { x: b.x, y: b.y } : null;
  }

  /** Wakes every sleeping body within `wakeRadius` of `(x, y)` and gives each a one-time nudge
   * toward that point, scaled by `collapseStrength` — the "nearby/unsupported pieces wake up and
   * fall into the newly-created space" behaviour, triggered once per removal. Level 1's near-zero
   * `collapseStrength` makes this "wake but barely move" (gravity there is also near-zero); Level
   * 2+'s larger value makes the collapse read as an immediate pull, not just eventual gravity. */
  wakeNear(x: number, y: number): void {
    const t = this.tuning;
    const r2 = t.wakeRadius * t.wakeRadius;
    for (const b of this.bodies.values()) {
      if (!b.sleeping) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      b.sleeping = false;
      b.awakeFor = 0;
      const dist = Math.sqrt(d2) || 1;
      b.vx += (-dx / dist) * t.collapseStrength;
      b.vy += (-dy / dist) * t.collapseStrength;
    }
  }

  /** A tile was pressed (`pointerdown` — fires immediately, before any tap resolves as valid or
   * not, so this never depends on/affects logical matching state). Wakes it, gives it a small
   * "physical response" impulse plus a slight rotation kick, and ripples a smaller impulse
   * outward to nearby bodies (waking sleeping ones too) — "press → small physical response → tiny
   * neighbour reaction → quick settle." The direction is hashed from the id + current pose rather
   * than `Math.random()`, so repeated presses on the same resting tile don't look identical every
   * time, without reaching for real randomness in what is still deterministic-leaning code. */
  press(id: string): void {
    const b = this.bodies.get(id);
    if (!b) return;
    const t = this.tuning;
    b.sleeping = false;
    b.awakeFor = 0;
    const angle = hash01(`${id}:press:${b.x.toFixed(1)}:${b.y.toFixed(1)}`) * Math.PI * 2;
    b.vx += Math.cos(angle) * t.pressImpulse;
    // Slight upward bias (`- t.pressImpulse * 0.3`) so a press reads as a little "pop", not just a
    // sideways shove.
    b.vy += Math.sin(angle) * t.pressImpulse - t.pressImpulse * 0.3;
    b.angularVelocity += (hash01(`${id}:press:rot`) - 0.5) * t.pressImpulse * 0.02;

    const r2 = t.wakeRadius * t.wakeRadius;
    for (const other of this.bodies.values()) {
      if (other === b) continue;
      const dx = other.x - b.x;
      const dy = other.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      other.sleeping = false;
      other.awakeFor = 0;
      const dist = Math.sqrt(d2) || 1;
      other.vx += (dx / dist) * t.neighborImpulse;
      other.vy += (dy / dist) * t.neighborImpulse;
    }
  }

  isSleeping(id: string): boolean {
    return this.bodies.get(id)?.sleeping ?? true;
  }

  getPose(id: string): { x: number; y: number; rotation: number } | null {
    const b = this.bodies.get(id);
    return b ? { x: b.x, y: b.y, rotation: b.rotation } : null;
  }

  /** Advances every AWAKE body by `dt` seconds within `bounds` (the board panel's own w/h, in the
   * same local space board/tiles.ts already positions tiles in) — sleeping bodies cost nothing
   * here (skipped in every pass below), which is the "sleeping pieces require almost no per-frame
   * work" requirement. Order: gravity+integrate → cheap pairwise circle separation (awake vs ALL,
   * so landing on a sleeping neighbour still pushes the falling piece correctly) → soft bounds
   * clamp with a little bounce → rotation clamp → sleep check. No broad-phase partitioning: at
   * this game's scale (a level's live tile count tops out in the dozens, and it only shrinks) a
   * plain O(awake × total) pass is cheap — the same "couple hundred tiles at most" cost this
   * codebase already accepts for exposure recompute (board/exposure.ts) on every pile change. */
  step(dt: number, bounds: { width: number; height: number }): void {
    const t = this.tuning;
    const awake = [...this.bodies.values()].filter((b) => !b.sleeping);
    if (awake.length === 0) return;

    for (const b of awake) {
      b.vy += t.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rotation += b.angularVelocity * dt;
      const linDecay = Math.max(0, 1 - t.linearDamping * dt);
      b.vx *= linDecay;
      b.vy *= linDecay;
      b.angularVelocity *= Math.max(0, 1 - t.angularDamping * dt);
    }

    for (const a of awake) {
      for (const b of this.bodies.values()) {
        if (a === b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = a.radius + b.radius;
        if (dist >= minDist) continue;
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        // Only `a` (the awake one driving this pass) moves — a cheap approximation of mutual
        // separation, not a symmetric solve; `b` gets its own turn in the outer loop if it's
        // also awake. Good enough for "pieces don't visually occupy the same space."
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        const rel = a.vx * nx + a.vy * ny;
        if (rel < 0) {
          a.vx -= (1 + t.bounce) * rel * nx;
          a.vy -= (1 + t.bounce) * rel * ny;
        }
        // A tiny deterministic-ish nudge so a stack of contacts doesn't all rotate identically —
        // small enough to stay well inside the maxRotation clamp below.
        a.angularVelocity += (hash01(`${a.x.toFixed(1)}:${b.x.toFixed(1)}:${a.y.toFixed(1)}`) - 0.5) * 0.02;
      }
    }

    for (const b of awake) {
      const minX = b.radius;
      const maxX = bounds.width - b.radius;
      const minY = b.radius;
      const maxY = bounds.height - b.radius;
      if (minX <= maxX) {
        if (b.x < minX) { b.x = minX; b.vx = Math.abs(b.vx) * t.bounce; }
        else if (b.x > maxX) { b.x = maxX; b.vx = -Math.abs(b.vx) * t.bounce; }
      }
      if (minY <= maxY) {
        if (b.y < minY) { b.y = minY; b.vy = Math.abs(b.vy) * t.bounce; }
        else if (b.y > maxY) { b.y = maxY; b.vy = -Math.abs(b.vy) * t.bounce; }
      }
      const maxRot = b.restRotation + t.maxRotation;
      const minRot = b.restRotation - t.maxRotation;
      if (b.rotation > maxRot) { b.rotation = maxRot; b.angularVelocity = 0; }
      else if (b.rotation < minRot) { b.rotation = minRot; b.angularVelocity = 0; }
    }

    for (const b of awake) {
      b.awakeFor += dt;
      const slow = b.vx * b.vx + b.vy * b.vy < t.sleepVelocityThreshold * t.sleepVelocityThreshold
        && Math.abs(b.angularVelocity) < t.sleepAngularThreshold;
      if (slow || b.awakeFor >= t.settleTimeoutS) {
        b.sleeping = true;
        b.vx = 0;
        b.vy = 0;
        b.angularVelocity = 0;
        b.awakeFor = 0;
      }
    }
  }
}
