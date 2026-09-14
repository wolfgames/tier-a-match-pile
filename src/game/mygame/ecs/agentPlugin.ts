/**
 * agentPlugin — the game world plus an `AgenticService` (@adobe/data/service).
 *
 * Extends the base `gamePlugin` with a `services.agent` that exposes the bubble
 * shooter as observable **states** (score, phase, level, the chain, the hopper)
 * and conditionally available **actions** (fire, start). Any agent runtime (MCP,
 * an LLM loop, an in-app bot, a test harness) can read the states and call
 * `db.services.agent.execute(action, input)` to drive the game headlessly.
 *
 * `fire` follows the game's "input as intent" rule: it queues a shot via
 * `submitFire`, which the per-frame `inputSystem` drains on the next
 * `stepWorld`. A headless driver fires, then pumps fixed steps to resolve it —
 * exactly what the live loop does.
 *
 * Nullable states MUST use `Schema.Nullable(schema)` — a bare `nullable: true`
 * on a schema is silently ignored.
 */

import { Schema } from '@adobe/data/schema';
import { AgenticService } from '@adobe/data/service';
import { Database, Observe } from '~/core/systems/ecs';
import { type GameDatabase, gamePlugin } from './gamePlugin';
import { readChain } from './readStateFromEcs';

const roleText =
  'You are playing a Zuma-style bubble shooter. A chain of coloured balls ' +
  'spirals toward the door at the centre; a cannon in the centre fires the ' +
  'colour in `hopperCurrent`. Call `fire` ({ angle }) — angle in radians from ' +
  'the centre — to shoot into the chain. Land three or more of a colour to pop ' +
  'them. Clear the whole chain to win; if the front ball reaches the door you ' +
  'lose. Read `chain` for every ball (chainIndex, color, x, y).';

// ── Schemas (JSON Schema, kept loose so agents see structure without rigidity) ──

const phaseSchema = {
  type: 'string',
  enum: ['idle', 'playing', 'won', 'lost'],
} as const satisfies Schema;

const ballSchema = {
  type: 'object',
  required: ['chainIndex', 'color', 'x', 'y'],
  properties: {
    chainIndex: { type: 'integer' },
    color: { type: 'integer' },
    x: { type: 'number' },
    y: { type: 'number' },
  },
} as const satisfies Schema;

const chainSchema = {
  type: 'array',
  items: ballSchema,
} as const satisfies Schema;

const fireParamSchema = {
  type: 'object',
  required: ['angle'],
  properties: {
    angle: { type: 'number', description: 'Launch angle in radians from the centre.' },
  },
} as const satisfies Schema;

const startParamSchema = {
  type: 'object',
  required: ['level'],
  properties: {
    level: { type: 'integer', minimum: 0, description: '0-based level index.' },
  },
} as const satisfies Schema;

/** A compact, agent-friendly view of the chain (no ECS internals). */
function chainSummary(db: GameDatabase) {
  return readChain(db).map((b) => ({
    chainIndex: b.chainIndex,
    color: b.color,
    x: b.position[0],
    y: b.position[1],
  }));
}

export function createGameAgentService(db: GameDatabase): AgenticService {
  const phase = db.observe.resources.phase;

  // Recompute the chain view whenever a turn-relevant resource changes. These
  // resources are stateful (emit current value on subscribe) and every step /
  // shot / pop touches at least one of them.
  const tick = Observe.fromProperties({
    score: db.observe.resources.score,
    chainCount: db.observe.resources.chainCount,
    headT: db.observe.resources.headT,
    phase: db.observe.resources.phase,
  });
  const chain = Observe.withMap(tick, () => chainSummary(db));

  const canFire = Observe.withMap(phase, (p) => p === 'playing');

  return AgenticService.create({
    interface: {
      role: { type: 'state', schema: { type: 'string' }, description: 'Role and objective' },
      phase: { type: 'state', schema: phaseSchema, description: 'Current game phase' },
      score: { type: 'state', schema: { type: 'integer' }, description: 'Points scored this run' },
      level: { type: 'state', schema: { type: 'integer' }, description: 'Current level index (0-based)' },
      chainCount: { type: 'state', schema: { type: 'integer' }, description: 'Balls remaining in the chain' },
      won: { type: 'state', schema: { type: 'boolean' }, description: 'Whether the chain was cleared' },
      hopperCurrent: { type: 'state', schema: { type: 'integer' }, description: 'Colour index loaded to fire next' },
      hopperNext: { type: 'state', schema: { type: 'integer' }, description: 'Colour index queued behind it' },
      chain: { type: 'state', schema: chainSchema, description: 'Every ball in the chain' },
      fire: {
        type: 'action',
        description: 'Queue a shot of the loaded colour along `angle` (radians from the centre)',
        parameters: [fireParamSchema],
      },
      start: {
        type: 'action',
        description: 'Not wired to full level configs — restarts using the current level resources',
        parameters: [startParamSchema],
      },
    },
    implementation: {
      role: Observe.fromConstant(roleText),
      phase,
      score: db.observe.resources.score,
      level: db.observe.resources.level,
      chainCount: db.observe.resources.chainCount,
      won: db.observe.resources.won,
      hopperCurrent: db.observe.resources.hopperCurrent,
      hopperNext: db.observe.resources.hopperNext,
      chain,
      fire: async (input: { angle: number }) => {
        db.transactions.submitFire({ angle: input.angle });
      },
      start: async (input: { level: number }) => {
        // Re-seed the current level's chain deterministically. Full per-level
        // configs live in bubble/levels.ts; the controller wires those. Here we
        // reuse whatever colour/length/speed resources are set, with the given
        // level tag, so the agent can reset a run headlessly.
        db.transactions.startLevel({
          level: input.level,
          colors: db.resources.colorsInLevel,
          chainLength: db.resources.chainCount,
          speed: db.resources.speed,
          seed: (input.level + 1) * 1013904223,
        });
      },
    },
    conditional: {
      // `fire` is only offered while a run is live — execute() returns an
      // ActionError outside of that.
      fire: canFire,
    },
  });
}

// ── Plugin (base + agent service) ───────────────────────────────────────────

export const gameAgentPlugin = Database.Plugin.create({
  extends: gamePlugin,
  services: {
    agent: (db): AgenticService => createGameAgentService(db as GameDatabase),
  },
});

export type GameAgentPlugin = typeof gameAgentPlugin;
export type GameAgentDatabase = Database.Plugin.ToDatabase<GameAgentPlugin>;

/** Create a game ECS world *with* the agent service registered. */
export function createGameAgentWorld(): GameAgentDatabase {
  return Database.create(gameAgentPlugin) as GameAgentDatabase;
}
