// what_in: nothing — plain schema defaults.
// what_out: the resources schema object, split out so `GameStore` (store.ts) can be typed
//           without circularly importing the resolved plugin type.
// why_here: importing `GameStore` from plugin.ts inside a transaction file that plugin.ts
//           itself imports creates a TS circular-type error; this file has zero deps on
//           plugin.ts or any transaction.
import type { PileState, Tier } from '../rules/types';
import type { FxStamp } from './types';
import { TIMER_TUNING } from './timerConfig';

// `orders: []` is a minimum type-fix, not a design claim: EMPTY_PILE (phase
// 'won', nothing configured) was never a valid, isValid()-checked state
// before Orders existed either — R-ORDERS-WIN's own invariant ('won' implies
// ordersSatisfied()) makes that pre-existing quirk visible now, but nothing
// at runtime calls isValid(EMPTY_PILE), so it's left as-is here.
export const EMPTY_PILE: PileState = { tiles: [], tray: [], cleared: 0, orders: [], phase: 'won' };

export const resources = {
  levelIndex: { default: 0 as number },
  tier: { default: 'easy' as Tier },
  pile: { default: EMPTY_PILE as PileState },
  currentPuzzle: { default: EMPTY_PILE as PileState },
  movesUsed: { default: 0 as number },
  hintsUsed: { default: 0 as number },
  hintSpent: { default: false as boolean },
  startedAtMs: { default: 0 as number },
  solveMs: { default: 0 as number },
  score: { default: 0 as number },
  stars: { default: 0 as number },
  theme: { default: 'light' as 'light' | 'dark' },
  lastFx: { default: null as FxStamp | null },
  lastSubmitT: { default: null as number | null },
  /** R-TIMER-BUDGET: total countdown budget for the current run, in milliseconds. */
  timerBudgetMs: { default: TIMER_TUNING.defaultBudgetMs as number },
  /** R-TIMER-BUDGET: milliseconds remaining. Reaches 0 at most once per run (R-TIMER-FAIL). */
  timerRemainingMs: { default: TIMER_TUNING.defaultBudgetMs as number },
  /** R-TIMER-PAUSE: whether the countdown is actively decrementing. */
  timerRunning: { default: false as boolean },
  /** R-FTUE-GATE (Levels 1/2/3, V1): 'step1' (Level 1) — teach tap-3-identical, only the
   * prescribed triple is tappable, Timer paused. 'awaitingFirstTap' (Level 1's Orders step /
   * Level 2's Timer step) — an instruction is shown and the Timer stays paused, but the board
   * is NOT locked; the player's own next tap dismisses it (no Continue button). 'level3Demo'
   * (Level 3) — the Slots Row is seeded with a scripted `A | A | B` state, Timer paused, only
   * the remaining "A" tiles are tappable. 'none' — normal gameplay (every other level defaults
   * here). */
  ftueGate: { default: 'none' as 'none' | 'step1' | 'awaitingFirstTap' | 'level3Demo' },
  /** docs/scoring-system.md — the moment normal gameplay activates (same instant `timerRunning`
   * first flips true: immediately at `loadLevel` for an ungated level, or at `clearFtueGate` for
   * a Level 1/2/3 that loaded gated). 0 means "not started yet" (still gated). Cycle-time (t) for
   * a run's first successful triple is measured from here, never from `loadLevel`'s `now` —
   * that would fold FTUE instruction-viewing time into time-efficiency scoring. */
  gameplayStartedAtMs: { default: 0 as number },
  /** docs/scoring-system.md §3 — current consecutive successful-triple streak length. Reset to
   * 0 by a wrong attempt; untouched by valid partial picks, distractor picks/triples, or any
   * tap resolved while the FTUE gate is 'step1'/'level3Demo' (scripted, not real player input). */
  streak: { default: 0 as number },
  /** Highest `streak` reached this run — informational (Results breakdown / Inspector), never
   * itself an input to the score formula. */
  bestStreak: { default: 0 as number },
  /** docs/scoring-system.md §4 — count of accepted, rules-legal gameplay taps this run (the
   * accuracy multiplier's "correct" term). Never incremented for a tap resolved during a
   * scripted FTUE gate ('step1'/'level3Demo'). */
  correctAttempts: { default: 0 as number },
  /** docs/scoring-system.md §4 — count of rejected, illegal/not-selectable gameplay taps this
   * run (the accuracy multiplier's "wrong" term). Never a direct point penalty — see
   * R-SCORE-NO-PENALTY. */
  wrongAttempts: { default: 0 as number },
  /** Running sum of `time_points(t) × streakStep(streak)` across every successful triple this
   * run — the pre-accuracy/pre-pace subtotal docs/scoring-system.md's "Scoring flow" builds up
   * to, then multiplies at run end. Frozen (no longer written) once `pile.phase !== 'playing'`. */
  scoreSubtotal: { default: 0 as number },
  /** Wall-clock `now` of the previous successful triple this run (docs/scoring-system.md §2's
   * cycle-time baseline). `null` before the run's first successful triple, at which point
   * `gameplayStartedAtMs` is used instead — see ecs/transactions/scoreTapOutcome.ts. */
  lastSuccessAtMs: { default: null as number | null },
};
