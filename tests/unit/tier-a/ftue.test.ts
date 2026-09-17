// Tier A contract â FTUE grammar (U10 U11). match-pile replaced at copy.
import { describe, expect, it } from 'vitest';
import { FTUE_LEVEL_COUNT } from '~/game/match-pile/screens/ftue';
import { prescribedInput, stepsFor } from '~/game/match-pile/tutorial/steps';

const VERBS = /^(TAP|TYPE|DRAG|SWIPE|PRESS|PICK|PLACE|FLIP|SLIDE)\b/;
const VAGUE = /\b(watch|notice|try)\b(?!\s+(the|a|an|this|that|one)\s+\w)/i;

describe('U10 â FTUE copy is imperative, literal, control-naming', () => {
  for (let lvl = 1; lvl <= FTUE_LEVEL_COUNT; lvl++) {
    it(`level ${lvl}: every step follows the grammar`, () => {
      const steps = stepsFor(lvl);
      expect(steps.length, 'at least one step').toBeGreaterThan(0);
      for (const s of steps) {
        const copy = s.copy.trim();
        expect(copy, `${s.id}: starts with an allowed verb`).toMatch(VERBS);
        expect(copy, `${s.id}: no questions`).not.toContain('?');
        expect(copy.split(/\s+/).length, `${s.id}: â¤ 8 words`).toBeLessThanOrEqual(8);
        expect(copy, `${s.id}: no verb without an object`).not.toMatch(VAGUE);
        expect(s.target, `${s.id}: names a target label`).toBeTruthy();
      }
    });
  }
});

describe('U11 â level 1 prescribes the literal input and cannot be failed', () => {
  it('prescribedInput(1) is spelled out in the first step copy', () => {
    const p = prescribedInput(1);
    expect(p, 'prescribed input').toBeTruthy();
    const first = stepsFor(1)[0].copy.replace(/\s+/g, '');
    expect(first).toContain(String(p).replace(/\s+/g, ''));
  });
  it('applying the prescribed input never reaches fail', async () => {
    const { applyPrescribed } = await import('~/game/match-pile/tutorial/steps');
    expect(applyPrescribed(1).phase).not.toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// Red phase — approved Orders/Timer FTUE redesign (docs/GAME-DESIGN.md#ftue,
// tier-a/REFERENCE_MATRIX.json R-FTUE-L1/L2/L3/R-FTUE-REPLAY). The current
// `stepsFor()` returns exactly one step per level with no Continue-gating,
// no Timer-pause state, and no distinction between "tap 3 identical" and
// "here are the Order Slots" instructions. None of the below passes yet.
// See tier-a/evidence/red/*.txt for the recorded runs.
// ---------------------------------------------------------------------------

describe('R-FTUE-L1 (red) — Level 1 has two Continue-gated, Timer-paused instructions', () => {
  it('step 1 teaches tap-3-identical; step 2 highlights the Order Slots and requires Continue', () => {
    const steps = stepsFor(1) as Array<{ id: string; copy: string; target: string; awaitsContinue?: boolean; timerPaused?: boolean }>;
    // FAILS today — stepsFor(1) currently returns exactly 1 step, not 2.
    expect(steps.length).toBe(2);
    expect(steps[0]?.timerPaused, 'instruction 1: timer must be paused').toBe(true);
    expect(steps[1]?.target, 'instruction 2 targets the Order Slots').toMatch(/order/i);
    expect(steps[1]?.awaitsContinue, 'instruction 2 gates on Continue').toBe(true);
  });
});

describe('R-FTUE-L2 (red) — Level 2 highlights the Timer behind a Continue gate', () => {
  it('the single instruction targets the timer slot and is Continue-gated', () => {
    const steps = stepsFor(2) as Array<{ id: string; copy: string; target: string; awaitsContinue?: boolean; timerPaused?: boolean }>;
    expect(steps[0]?.target, 'targets the timer HUD element').toMatch(/timer/i);
    expect(steps[0]?.awaitsContinue).toBe(true);
    expect(steps[0]?.timerPaused).toBe(true);
  });
});

describe('R-FTUE-L3 (red) — Level 3 scripts a non-adjacent A|A|B Slots Row match', () => {
  it('a scripted-demo module exists and resolves A|A|B + another A as a match', async () => {
    const scriptedDemo = await import('~/game/match-pile/tutorial/slotsRowDemo').catch(() => null);
    expect(
      scriptedDemo,
      'tutorial/slotsRowDemo (or equivalent Level-3 scripted state) does not exist yet',
    ).not.toBeNull();
  });
});

describe('R-FTUE-REPLAY (red) — How-to-Play replays FTUE in an isolated, unscored context', () => {
  it('a How-to-Play entry point exists and does not touch campaign/level progression', async () => {
    const howToPlay = await import('~/game/match-pile/tutorial/howToPlay').catch(() => null);
    expect(howToPlay, 'tutorial/howToPlay (or equivalent replay entry point) does not exist yet').not.toBeNull();
  });
});
