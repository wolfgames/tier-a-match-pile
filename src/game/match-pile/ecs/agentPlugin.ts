// what_in: a GameDatabase (app-scoped world) + level indices / tile ids from a caller.
// what_out: the bot/test/MCP surface — `gameAgentPlugin` (AgenticService: phase/score/tray
//           states, pick/hint/restart actions) plus the plain debug-harness functions
//           (loadLevel/solve/fail/restart/getState) `window.__GAME_DEBUG__` and Playwright call.
// why_here: ecs-gameplay.md — "keep the AgenticService current; it is the bot, test, and MCP surface."
import { Schema } from '@adobe/data/schema';
import { AgenticService } from '@adobe/data/service';
import { Database, Observe } from '~/core/systems/ecs';
import { gamePlugin, type GameDatabase } from './plugin';
import { applyTap } from './applyTap';
import { getLevel } from '../services/levels';
import { solve as solveSearch } from '../solver/solve';
import type { PileState } from '../rules/types';

const phaseSchema = { type: 'string', enum: ['playing', 'won', 'lost'] } as const satisfies Schema;
const pickParams = { type: 'object', required: ['tileId'], properties: { tileId: { type: 'string' } } } as const satisfies Schema;

export function createGameAgentService(db: GameDatabase): AgenticService {
  const tick = Observe.withMap(db.observe.resources.pile, (p) => p.phase);
  const canPick = Observe.withMap(tick, (p) => p === 'playing');
  return AgenticService.create({
    interface: {
      role: { type: 'state', schema: { type: 'string' }, description: 'Role and objective' },
      phase: { type: 'state', schema: phaseSchema, description: 'Current run phase' },
      score: { type: 'state', schema: { type: 'integer' }, description: 'Score once the run ends' },
      tilesRemaining: { type: 'state', schema: { type: 'integer' }, description: 'Objects left in the pile' },
      pick: { type: 'action', description: 'Pick an exposed tile by id', parameters: [pickParams] },
      hint: { type: 'action', description: 'Spend the one hint for this level', parameters: [] },
      restart: { type: 'action', description: 'Restart the current level from its pristine puzzle', parameters: [] },
    },
    implementation: {
      role: Observe.fromConstant('Pick exposed tiles by id; three identical types auto-clear.'),
      phase: tick,
      score: db.observe.resources.score,
      tilesRemaining: Observe.withMap(db.observe.resources.pile, (p) => p.tiles.length),
      pick: async (input: { tileId: string }) => {
        applyTap(db, input.tileId, Date.now());
      },
      hint: async () => {
        db.transactions.useHint();
      },
      restart: async () => {
        restart(db, Date.now());
      },
    },
    conditional: { pick: canPick },
  });
}

export const gameAgentPlugin = Database.Plugin.create({
  extends: gamePlugin,
  services: { agent: (db): AgenticService => createGameAgentService(db as GameDatabase) },
});
export type GameAgentDatabase = Database.Plugin.ToDatabase<typeof gameAgentPlugin>;
export function createGameAgentWorld(): GameAgentDatabase {
  return Database.create(gameAgentPlugin) as GameAgentDatabase;
}

// ── Debug/e2e harness — window.__GAME_DEBUG__ calls these directly ──────────

export function loadLevel(db: GameDatabase, levelIndex: number, now: number = Date.now()): void {
  const data = getLevel(levelIndex);
  db.transactions.loadLevel({ levelIndex: data.levelIndex, puzzle: data.puzzle, tier: data.tier, now });
}

export function solve(db: GameDatabase, now: number = Date.now()): void {
  const pile = db.resources.pile;
  if (pile.phase !== 'playing') return;
  const results = solveSearch(pile, { limit: 1 });
  if (results.length === 0) return;
  const final = results[0];
  db.transactions.finishInstant({ next: final, movesUsed: final.picks.length, now });
}

export function fail(db: GameDatabase, now: number = Date.now()): void {
  const pile = db.resources.pile;
  const tray = Array.from({ length: 7 }, (_, i) => `__debug-fail-${i}`);
  const next: PileState = { tiles: pile.tiles, tray, cleared: pile.cleared, orders: pile.orders, phase: 'lost' };
  db.transactions.stampFx({ event: 'miss', targetLabel: 'slot-board', t: now });
  db.transactions.finishInstant({ next, movesUsed: db.resources.movesUsed, now });
  db.transactions.stampFx({ event: 'lose', targetLabel: 'slot-board', t: now });
}

export function restart(db: GameDatabase, now: number = Date.now()): void {
  const { levelIndex, tier, currentPuzzle } = db.resources;
  db.transactions.loadLevel({ levelIndex, puzzle: currentPuzzle, tier, now });
}

export function getState(db: GameDatabase) {
  return {
    levelIndex: db.resources.levelIndex,
    phase: db.resources.pile.phase,
    score: db.resources.score,
    stars: db.resources.stars,
    tray: db.resources.pile.tray,
    tilesRemaining: db.resources.pile.tiles.length,
  };
}

/** Plays a real winning triple through the caller's own tap function (the real input path). */
export async function playCorrectMove(db: GameDatabase, tap: (tileId: string) => void): Promise<string> {
  const results = solveSearch(db.resources.pile, { limit: 1 });
  if (results.length === 0 || results[0].picks.length < 3) {
    throw new Error('playCorrectMove: no solvable triple from the current pile');
  }
  const [p0, p1, p2] = results[0].picks;
  tap(p0);
  tap(p1);
  tap(p2);
  return `tile-${p2}`;
}
