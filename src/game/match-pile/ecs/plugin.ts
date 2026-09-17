// what_in: nothing at import time — the data model only.
// what_out: `gamePlugin` (resources + transactions) and `createGameWorld()`.
// why_here: ECS is the single source of truth (guardrail #9 / ecs-gameplay.md). Turn-based:
//           no per-frame systems — a tap resolves synchronously via a transaction.
// See ecs/README.md for the full write path (applyTap → commitPick → observers repaint).
import { Database, Observe } from '~/core/systems/ecs';
import { resources, EMPTY_PILE } from './resources';
import { loadLevel } from './transactions/loadLevel';
import { commitPick } from './transactions/commitPick';
import { finishInstant } from './transactions/finishInstant';
import { useHint } from './transactions/useHint';
import { setTheme } from './transactions/setTheme';
import { stampFx, stampSubmit } from './transactions/stampFx';
import { tickTimer } from './transactions/tickTimer';
import { setFtueGate } from './transactions/setFtueGate';
import { clearFtueGate } from './transactions/clearFtueGate';
import { scoreTapOutcome } from './transactions/scoreTapOutcome';

export { EMPTY_PILE };
export type { FxStamp } from './types';

export const gamePlugin = Database.Plugin.create({
  resources,
  computed: {
    /** Reactive "is the run over" flag — Inspector / agent convenience. */
    finished: (db) => Observe.withMap(db.observe.resources.pile, (p) => p.phase !== 'playing'),
  },
  transactions: {
    loadLevel,
    commitPick,
    finishInstant,
    useHint,
    setTheme,
    stampFx,
    stampSubmit,
    tickTimer,
    setFtueGate,
    clearFtueGate,
    scoreTapOutcome,
  },
});

export type GamePlugin = typeof gamePlugin;
export type GameDatabase = Database.Plugin.ToDatabase<GamePlugin>;

export function createGameWorld(): GameDatabase {
  return Database.create(gamePlugin) as GameDatabase;
}
