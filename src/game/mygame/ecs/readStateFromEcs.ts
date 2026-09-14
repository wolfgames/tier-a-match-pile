/**
 * readStateFromEcs — plain snapshots of the bubble world for pure logic,
 * systems, the renderer, and tests.
 *
 * ECS is the source of truth; consumers read a plain object so they never touch
 * the database internals. The parameter is a structural `EcsStateSource`,
 * satisfied by both the live `Database` and a transaction `store`, so the same
 * readers work inside systems, tests, and the renderer.
 */

import type { Entity } from '~/core/systems/ecs';
import type { GamePhase } from './gamePlugin';

/** One chain bead. */
export interface BallState {
  entity: Entity;
  chainIndex: number;
  color: number;
  position: [number, number];
}

/** One ball in flight. */
export interface ProjectileState {
  entity: Entity;
  color: number;
  position: [number, number];
  velocity: [number, number];
}

/** Whole-world snapshot. */
export interface GameSnapshot {
  level: number;
  colorsInLevel: number;
  speed: number;
  headT: number;
  chainCount: number;
  score: number;
  phase: GamePhase;
  won: boolean;
  hopperCurrent: number;
  hopperNext: number;
  balls: BallState[];
  projectiles: ProjectileState[];
}

/**
 * Minimal read surface a snapshot needs. The @adobe/data `Database` and
 * transaction `store` both satisfy it structurally. `select` is intentionally
 * widened so this adapter stays decoupled from the exact database generics.
 */
export interface EcsStateSource {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select(include: readonly any[]): readonly Entity[];
  read(entity: Entity): unknown;
  readonly resources: {
    readonly level: number;
    readonly colorsInLevel: number;
    readonly speed: number;
    readonly headT: number;
    readonly chainCount: number;
    readonly score: number;
    readonly phase: GamePhase;
    readonly won: boolean;
    readonly hopperCurrent: number;
    readonly hopperNext: number;
  };
}

/** The chain, ordered front→back (ascending chainIndex). */
export function readChain(source: EcsStateSource): BallState[] {
  const balls: BallState[] = [];
  for (const entity of source.select(['chainIndex'])) {
    const b = source.read(entity) as
      | { chainIndex: number; color: number; position: [number, number] }
      | null;
    if (!b) continue;
    balls.push({
      entity,
      chainIndex: b.chainIndex,
      color: b.color,
      position: [b.position[0], b.position[1]],
    });
  }
  balls.sort((a, b) => a.chainIndex - b.chainIndex);
  return balls;
}

/** Every ball currently in flight. */
export function readProjectiles(source: EcsStateSource): ProjectileState[] {
  const shots: ProjectileState[] = [];
  for (const entity of source.select(['velocity'])) {
    const p = source.read(entity) as
      | { color: number; position: [number, number]; velocity: [number, number] }
      | null;
    if (!p) continue;
    shots.push({
      entity,
      color: p.color,
      position: [p.position[0], p.position[1]],
      velocity: [p.velocity[0], p.velocity[1]],
    });
  }
  return shots;
}

/** Rebuild a full snapshot from the current ECS state. */
export function readStateFromEcs(source: EcsStateSource): GameSnapshot {
  return {
    level: source.resources.level,
    colorsInLevel: source.resources.colorsInLevel,
    speed: source.resources.speed,
    headT: source.resources.headT,
    chainCount: source.resources.chainCount,
    score: source.resources.score,
    phase: source.resources.phase,
    won: source.resources.won,
    hopperCurrent: source.resources.hopperCurrent,
    hopperNext: source.resources.hopperNext,
    balls: readChain(source),
    projectiles: readProjectiles(source),
  };
}
