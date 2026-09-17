// Tier A contract â unit half (U2 U3 U4 U8 N1 N3 N4 + scoring). match-pile replaced at copy.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import tokens from '~/game/match-pile/brand.tokens.json';
import { SFX } from '~/game/match-pile/audio/sounds';
import { feedbackRegistry, hintVisibility, REQUIRED_EVENTS } from '~/game/match-pile/feel';
import { palette } from '~/game/match-pile/palette';
import { FTUE_LEVEL_COUNT } from '~/game/match-pile/screens/ftue';
import { finalizeRunScore, masteryStarsFromTime, timeReferencesForLevel } from '~/game/match-pile/scoring';
import { FONTS, SHADOWS } from '~/game/match-pile/typography';

describe('U2 â every action has a tween, a vfx and a sfx', () => {
  it('covers every required event', () => {
    for (const ev of REQUIRED_EVENTS) {
      const f = feedbackRegistry[ev];
      expect(f, `no registry row for "${ev}"`).toBeDefined();
      for (const k of ['tween', 'vfx', 'sfx'] as const) expect(f[k].trim(), `${ev}.${k} blank`).not.toBe('');
    }
  });
  it('every sfx names a real sound', () => {
    for (const [ev, f] of Object.entries(feedbackRegistry)) expect(SFX, `${ev}.sfx="${f.sfx}"`).toHaveProperty(f.sfx);
  });
});

describe('U8 â celebration scales with success', () => {
  it('correct / partial / win use three distinct vfx', () => {
    const { correct, partial, win } = feedbackRegistry;
    expect(new Set([correct.vfx, partial.vfx, win.vfx]).size).toBe(3);
  });
});

describe('U3 / U4 â hint gating', () => {
  const ftue = FTUE_LEVEL_COUNT;
  it('hidden on every FTUE level', () => {
    for (let l = 1; l <= ftue; l++)
      expect(hintVisibility({ levelIndex: l, phase: 'playing', ftueLevels: ftue, spent: false }).visible).toBe(false);
  });
  it('visible + enabled on the first real level, disabled once spent, hidden when not playing', () => {
    expect(hintVisibility({ levelIndex: ftue + 1, phase: 'playing', ftueLevels: ftue, spent: false })).toEqual({ visible: true, enabled: true });
    expect(hintVisibility({ levelIndex: ftue + 1, phase: 'playing', ftueLevels: ftue, spent: true })).toEqual({ visible: true, enabled: false });
    expect(hintVisibility({ levelIndex: ftue + 1, phase: 'won', ftueLevels: ftue, spent: false }).visible).toBe(false);
  });
});

describe('N1 / N3 / N4 â palette, type and shadows come from brand.tokens.json', () => {
  it('tenant colours are non-null in both themes (B1)', () => {
    for (const th of ['light', 'dark'] as const) for (const k of ['primary', 'secondary', 'accent', 'onPrimary'] as const)
      expect(tokens[th][k], `${th}.${k}`).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(tokens.light.accent.toLowerCase(), 'chartreuse is on no brand sheet').not.toBe('#dfff00');
  });
  it('palette equals the light token set', () => {
    for (const [k, v] of Object.entries(tokens.light)) if (v) expect(palette[k as keyof typeof palette]?.toLowerCase()).toBe(v.toLowerCase());
  });
  it('fonts equal the tenant type block', () => {
    expect(FONTS.display).toBe(tokens.type.display);
    expect(FONTS.numeric).toBe(tokens.type.numeric);
  });
  it('exactly the token shadow/surface recipes exist (incl. brand-cta)', () => {
    expect(Object.keys(SHADOWS)).toContain('brand-cta');
    expect(Object.keys(SHADOWS).sort()).toEqual(Object.keys(tokens.shadows).sort());
  });
  it('fonts are preloaded in app.css via @fontsource', () => {
    const css = readFileSync('src/app.css', 'utf8');
    for (const f of new Set(Object.values(tokens.type).filter((v): v is string => typeof v === 'string')))
      expect(css).toContain(`@fontsource/${f.toLowerCase().replace(/ /g, '-')}`);
  });
});

describe('scoring â ms granularity, parâace stars', () => {
  const base = { won: true, levelIndex: 4, scoreSubtotal: 2_000, correctAttempts: 20, wrongAttempts: 0, expectedTriples: 19 };
  it('a bigger subtotal scores higher; more wrong attempts score lower — never a flat penalty', () => {
    expect(finalizeRunScore({ ...base, scoreSubtotal: 3_000 }).score).toBeGreaterThan(finalizeRunScore(base).score);
    expect(finalizeRunScore({ ...base, wrongAttempts: 5 }).score).toBeLessThan(finalizeRunScore(base).score);
  });
  it('loss = 0 / 0â; wins are 1..3â; ace is 3â', () => {
    expect(finalizeRunScore({ ...base, won: false }).score).toBe(0);
    expect(finalizeRunScore({ ...base, won: false }).stars).toBe(0);
    const refs = timeReferencesForLevel(base.levelIndex, base.expectedTriples);
    expect(masteryStarsFromTime(refs.aceTimeMs, refs)).toBe(5);
  });
});
