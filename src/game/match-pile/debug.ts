// what_in: whichever screen is mounted registers its Pixi stage + viewport getter here.
// what_out: installs `window.__GAME_DEBUG__` (feel/ui/loadLevel/solve/fail/restart/getState/
//           playCorrectMove/setTheme) — the browser contract's only way in (never a screenshot).
// why_here: ux-contract.md — the world is app-scoped (world.ts), so `db()` works from any
//           screen; only the Pixi stage reference changes as screens mount/unmount.
import { Container } from 'pixi.js';
import { createInspector } from './inspector';
import { hintVisibility, type FeelProbe } from './feel';
import { getGameWorld } from './world';
import { FTUE_LEVEL_COUNT } from './services/levels';
import { stepsFor } from './tutorial/steps';
import * as agent from './ecs/agentPlugin';

interface DebugContext {
  stage: () => Container;
  screen: () => { w: number; h: number };
  tap?: (id: string) => void;
}

let ctx: DebugContext | null = null;

function feel(): FeelProbe {
  const db = getGameWorld();
  const levelIndex = db.resources.levelIndex;
  const phase = db.resources.pile.phase;
  const hv = hintVisibility({ levelIndex, phase, ftueLevels: FTUE_LEVEL_COUNT, spent: db.resources.hintSpent });
  const inFtue = levelIndex >= 1 && levelIndex <= FTUE_LEVEL_COUNT && phase === 'playing';
  const step = inFtue ? stepsFor(levelIndex)[0] : undefined;
  return {
    legendVisible: true,
    hintVisible: hv.visible,
    hintEnabled: hv.enabled,
    levelIndex,
    phase,
    theme: db.resources.theme,
    lastFx: db.resources.lastFx,
    lastSubmitT: db.resources.lastSubmitT,
    ftueTarget: step?.target ?? null,
    ftueCopy: step?.copy ?? null,
  };
}

/** Called by each screen's init() — merges in whatever it can provide. */
export function registerDebugContext(partial: Partial<DebugContext>): void {
  ctx = { ...ctx, ...partial } as DebugContext;
  install();
}

/** A screen's own Pixi app can be destroyed (e.g. leaving the game screen for results) without
 *  ever re-registering — walking a destroyed Container (or reading a destroyed Application's
 *  `.screen`) throws, so both fall back to something safe instead of crashing the probe. */
const emptyStage = new Container();
function liveStage(): Container {
  try {
    const s = ctx?.stage();
    return s && !s.destroyed ? s : emptyStage;
  } catch {
    return emptyStage;
  }
}

function liveScreen(): { w: number; h: number } {
  try {
    return ctx?.screen() ?? { w: window.innerWidth, h: window.innerHeight };
  } catch {
    return { w: window.innerWidth, h: window.innerHeight };
  }
}

function install(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __GAME_DEBUG__: unknown }).__GAME_DEBUG__ = {
    feel,
    ui: () => createInspector(liveStage(), liveScreen, document).ui(),
    loadLevel: (n: number) => agent.loadLevel(getGameWorld(), n),
    solve: () => agent.solve(getGameWorld()),
    fail: () => agent.fail(getGameWorld()),
    restart: () => agent.restart(getGameWorld()),
    getState: () => agent.getState(getGameWorld()),
    setTheme: (t: 'light' | 'dark') => getGameWorld().transactions.setTheme({ theme: t }),
    playCorrectMove: () => agent.playCorrectMove(getGameWorld(), (id) => ctx?.tap?.(id)),
  };
}
