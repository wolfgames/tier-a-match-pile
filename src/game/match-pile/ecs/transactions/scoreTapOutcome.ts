// what_in: the outcome of one already-resolved tap (`accepted`/`cleared`, from ecs/applyTap.ts)
//          + the FTUE gate value captured at the START of that tap (before any gate transition
//          it itself triggered) + `now`.
// what_out: updates streak/correct-wrong counts/time-efficiency subtotal per
//           docs/scoring-system.md's Match Pile event semantics. A no-op once the run is no
//           longer 'playing' — the final Score must freeze at the terminal tap, not keep
//           accumulating from any later (defensive/duplicate) call.
// why_here: A2/A3 write-site rule; called from ecs/applyTap.ts for every tap that isn't the
//           defensive timer-already-expired guard, right before commitPick.
import type { GameStore } from '../store';
import type { FtueGate } from '../../tutorial/steps';
import { scoreForSuccessfulTriple, accuracyMultiplier } from '../../scoring/templateScoring';

export function scoreTapOutcome(
  store: GameStore,
  { accepted, cleared, gateAtTapStart, now }: { accepted: boolean; cleared: boolean; gateAtTapStart: FtueGate; now: number },
): void {
  if (store.resources.pile.phase !== 'playing') return;

  // Only Level 3's preloaded Slots Row demo is excluded — this pass's FTUE-handling
  // requirement calls out specifically "scripted/preloaded L3 Slots Row state," not Level 1's
  // guided taps. 'step1' restricts WHICH tile is tappable, but the player still performs 3 real
  // taps on real tiles to clear each triple — Level 1's board is exactly its 2 guided triples
  // (no distractors, services/levels.ts), so excluding 'step1' here would make Level 1
  // permanently unscoreable (its only successful actions happen while the gate is still
  // 'step1' — the level often wins on the very tap that clears the second guided triple, before
  // any gate transition). 'awaitingFirstTap' was never excluded either — same reasoning, it's
  // the player's own real first move, just also dismissing the instruction.
  if (gateAtTapStart === 'level3Demo') return;

  if (!accepted) {
    // 'step1' restricts taps to one specific guided triple at a time, a restriction the player
    // has no way to know in advance (any of Level 1's 6 tiles looks equally tappable to them).
    // A rejection here reflects that temporary tutorial ordering, not a genuine illegal-tile
    // mistake — it must not cost accuracy or the streak, or the score would effectively depend
    // on which tile the player happened to guess first, not on whether they complete the match.
    if (gateAtTapStart !== 'step1') {
      store.resources.wrongAttempts += 1;
      store.resources.streak = 0;
    }
    return;
  }

  store.resources.correctAttempts += 1;
  if (!cleared) return; // valid partial selection — accepted, but no successful action yet.

  // `gameplayStartedAtMs` is 0 ("not started") for the whole of Level 1's 'step1' phase — it
  // only gets set by clearFtueGate, which for Level 1 fires after BOTH guided triples clear
  // (isStep1CompleteForLevel1), i.e. strictly after the first triple this baseline is needed
  // for. Without the `startedAtMs` fallback (set unconditionally at loadLevel, gate or no gate),
  // that first triple's `cycleMs` would be measured against epoch 0 — millions of ms — collapsing
  // time_points to ~0 and making Level 1's first completed match appear to not score at all.
  const previousAtMs = store.resources.lastSuccessAtMs ?? (store.resources.gameplayStartedAtMs || store.resources.startedAtMs);
  const cycleMs = Math.max(0, now - previousAtMs);
  const nextStreak = store.resources.streak + 1;
  store.resources.streak = nextStreak;
  store.resources.bestStreak = Math.max(store.resources.bestStreak, nextStreak);
  store.resources.scoreSubtotal += scoreForSuccessfulTriple({ cycleMs, streakLengthAfter: nextStreak });
  store.resources.lastSuccessAtMs = now;

  // Live HUD score: updated on every completed triple (Order-relevant or distractor — both are
  // a "successful action" per docs/scoring-system.md), so the on-screen SCORE ticks up as the
  // player plays rather than staying at 0 until the run ends. This is a running preview using
  // the accuracy multiplier as it stands *right now* — ecs/transactions/commitPick.ts and
  // finishInstant.ts overwrite it with the true frozen value (which also folds in the pace
  // multiplier and the loss-is-0 rule) the moment the run reaches a terminal phase.
  store.resources.score = Math.round(
    store.resources.scoreSubtotal * accuracyMultiplier(store.resources.correctAttempts, store.resources.wrongAttempts),
  );
}
