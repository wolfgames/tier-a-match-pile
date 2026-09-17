// what_in: the tapped tile id + wall-clock `now` (sampled by the caller — controller/debug).
// what_out: dispatches the resolved fx event name + writes the result via `commitPick`.
// why_here: ecs-gameplay.md's turn shape — "read state → run pure rules → write via
//           transactions" as a plain function, shared by the real input path, the FTUE
//           prescribed-input replay, and the debug `playCorrectMove` harness.
import type { GameDatabase } from './plugin';
import { step } from '../rules/step';
import { isTapAllowedDuringGate, isStep1CompleteForLevel1 } from '../tutorial/steps';
import { level3DemoTypes } from '../tutorial/level3';
import type { GameEvent } from '../feel';

export interface TapResult {
  event: GameEvent;
  blocked: boolean;
  cleared: boolean;
  phase: 'playing' | 'won' | 'lost';
}

export function applyTap(db: GameDatabase, tileId: string, now: number): TapResult {
  const pile = db.resources.pile;

  // Defensive guard (in addition to step()'s own R-TERMINAL phase check): refuse the tap
  // outright if the Timer has already reached 0, covering a theoretical same-frame race
  // between an incoming tap and a not-yet-processed tickTimer call. This is the single
  // place this check lives — not step()/tickTimer, which stay Timer-unaware.
  if (db.resources.timerRemainingMs <= 0) {
    return { event: 'invalid', blocked: true, cleared: false, phase: pile.phase };
  }

  // R-FTUE-GATE: only Level 1's Step 1 and Level 3's demo restrict which taps resolve (to
  // specific tiles). 'awaitingFirstTap' does not lock the board — there's no Continue button.
  // Captured once, up front: docs/scoring-system.md's scoring must judge this tap's own
  // eligibility by the gate it started in, never by a gate transition the tap itself triggers
  // below (a 'step1' guided tap that hands off to 'awaitingFirstTap' must NOT score as if it
  // were already ungated).
  const gate = db.resources.ftueGate;
  if (!isTapAllowedDuringGate(db.resources.levelIndex, gate, tileId, pile.tiles)) {
    db.transactions.scoreTapOutcome({ accepted: false, cleared: false, gateAtTapStart: gate, now });
    return { event: 'invalid', blocked: true, cleared: false, phase: pile.phase };
  }

  const before = pile.cleared;
  const next = step(pile, tileId);

  if (next === pile) {
    db.transactions.scoreTapOutcome({ accepted: false, cleared: false, gateAtTapStart: gate, now });
    return { event: 'invalid', blocked: true, cleared: false, phase: pile.phase };
  }

  const cleared = next.cleared > before;
  let committed = next;

  // Resolve any FTUE gate transition BEFORE committing the pile, so the repaint the pile
  // commit triggers (below) already reflects the final gate for this tap — no stale extra
  // frame with the old instruction/highlight still showing.
  if (gate === 'awaitingFirstTap') {
    // The player's own first tap (Level 1's Orders step / Level 2's Timer step) dismisses the
    // instruction and starts the Timer — the same tap this function is already resolving
    // normally below. No Continue button.
    db.transactions.clearFtueGate({ now });
  } else if (gate === 'step1' && cleared && isStep1CompleteForLevel1(next.tiles.map((t) => t.id))) {
    // Both of Level 1's guided triples have now resolved — hand off to the Orders step.
    db.transactions.setFtueGate({ gate: 'awaitingFirstTap' });
  } else if (gate === 'level3Demo' && cleared) {
    // The player's tap on the highlighted "A" just completed the non-adjacent A|A|A match
    // through the normal `step()` resolution above, leaving the scripted "B" alone in the tray.
    // B was never a real pick — just Slots Row scaffolding for the demo — so it's dropped here
    // before committing rather than lingering as an uncollectable tray entry. Dismiss the
    // instruction and start the Timer the same way Level 1/2 do.
    const types = level3DemoTypes();
    const bIndex = types ? next.tray.indexOf(types.bType) : -1;
    if (bIndex !== -1) {
      committed = { ...next, tray: [...next.tray.slice(0, bIndex), ...next.tray.slice(bIndex + 1)] };
    }
    db.transactions.clearFtueGate({ now });
  }

  db.transactions.scoreTapOutcome({ accepted: true, cleared, gateAtTapStart: gate, now });
  db.transactions.commitPick({ next: committed, now });

  let event: GameEvent;
  if (next.phase === 'won') event = 'win';
  else if (next.phase === 'lost') event = 'lose';
  else if (cleared) event = 'correct';
  else event = 'partial';

  return { event, blocked: false, cleared, phase: next.phase };
}
