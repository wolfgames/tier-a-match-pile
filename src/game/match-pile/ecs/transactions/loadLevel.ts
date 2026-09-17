// what_in: a puzzle (from services/levels.ts) + the wall-clock `now` the caller sampled.
// what_out: resets every per-run resource so the level starts clean.
// why_here: A2/A3 — the only place `pile`/`currentPuzzle`/run counters may be written for a
//           fresh level; deterministic (`now` is injected, never sampled from the clock in here).
import type { GameStore } from '../store';
import type { PileState, Tier } from '../../rules/types';
import { timerBudgetForLevel } from '../timerConfig';
import { initialFtueGate } from '../../tutorial/steps';
import { seedLevel3Demo } from '../../tutorial/level3';

export function loadLevel(
  store: GameStore,
  { levelIndex, puzzle, tier, now }: { levelIndex: number; puzzle: PileState; tier: Tier; now: number },
): void {
  store.resources.levelIndex = levelIndex;
  store.resources.tier = tier;
  const gate = initialFtueGate(levelIndex);
  // R-FTUE-GATE (Level 3): the live `pile` starts pre-seeded into the scripted `A | A | B`
  // Slots Row state; `currentPuzzle` stays the true pristine puzzle (board/boardRenderer.ts
  // derives the grid size from it) so density/population are untouched.
  store.resources.pile = gate === 'level3Demo' ? seedLevel3Demo(puzzle) : puzzle;
  store.resources.currentPuzzle = puzzle;
  store.resources.movesUsed = 0;
  store.resources.hintsUsed = 0;
  store.resources.hintSpent = false;
  store.resources.startedAtMs = now;
  store.resources.solveMs = 0;
  store.resources.score = 0;
  store.resources.stars = 0;
  store.resources.lastFx = null;
  store.resources.lastSubmitT = null;
  store.resources.streak = 0;
  store.resources.bestStreak = 0;
  store.resources.correctAttempts = 0;
  store.resources.wrongAttempts = 0;
  store.resources.scoreSubtotal = 0;
  store.resources.lastSuccessAtMs = null;
  // R-DIFFICULTY-AXES: Timer budget is now purely a function of `levelIndex`
  // (timerBudgetForLevel), fully decoupled from difficulty `tier`/band — a relief band
  // (Easy after Hard/VeryHard) must NOT regain a bigger Timer budget just because the band
  // changed, so this deliberately never looks at `tier`.
  const budgetMs = timerBudgetForLevel(levelIndex);
  store.resources.timerBudgetMs = budgetMs;
  store.resources.timerRemainingMs = budgetMs;
  // R-TIMER-PAUSE (Levels 1/2/3 FTUE, V1): a gated level starts paused — the Timer only starts
  // once ecs/transactions/clearFtueGate.ts fires, which ecs/applyTap.ts triggers on the
  // player's own first/completing tap while gated (no Continue button). Every other level keeps
  // the original "start the instant gameplay becomes active" behavior.
  store.resources.ftueGate = gate;
  store.resources.timerRunning = gate === 'none';
  // docs/scoring-system.md: an ungated level's gameplay activates immediately, same instant as
  // the Timer above. A gated level (1/2/3) leaves this at 0 ("not started yet") until
  // ecs/transactions/clearFtueGate.ts fires on the player's own first real tap.
  store.resources.gameplayStartedAtMs = gate === 'none' ? now : 0;
}
