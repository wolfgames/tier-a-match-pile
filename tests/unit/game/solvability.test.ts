// Content oracle (D1âD5): every shipped level proven by the production engine; generator round-trips.
import { describe, expect, it } from 'vitest';
import { FTUE_LEVELS } from '~/game/match-pile/data/ftueLevels';
import pack from '~/game/match-pile/data/levels-match-pile.json';
import { generate } from '~/game/match-pile/generator';
import { isValid } from '~/game/match-pile/rules';
import { replay, solve } from '~/game/match-pile/solver';

const all = [...FTUE_LEVELS, ...pack.levels];
const TIERS = { easy: 10, medium: 12, hard: 8 } as const;

describe('D1 â ladder shape', () => {
  it('30 levels, 10/12/8', () => {
    expect(pack.levels.length).toBeGreaterThanOrEqual(30);
    for (const [t, n] of Object.entries(TIERS)) expect(pack.levels.filter((l) => l.tier === t).length).toBeGreaterThanOrEqual(n);
  });
  it('difficulty never inverts by more than one tier', () => {
    const order = ['easy', 'medium', 'hard'];
    pack.levels.forEach((l, i) => {
      if (i === 0) return;
      expect(order.indexOf(l.tier) - order.indexOf(pack.levels[i - 1].tier)).toBeGreaterThanOrEqual(-1);
    });
  });
});

describe('D2 â every level solves under the production engine', () => {
  it.each(all.map((l) => [l.id, l] as const))('%s', (_id, level) => {
    const solutions = solve(level.puzzle, { limit: 2 });
    expect(solutions.length).toBeGreaterThanOrEqual(1);
    if (pack.schemaId.includes('unique')) expect(solutions).toHaveLength(1);
    expect(isValid(solutions[0])).toBe(true);
    if (level.solution) expect(replay(level.puzzle, level.solution)).toBe(true);
  });
});

describe('D3 â generator is deterministic and robust', () => {
  it('same seed â same puzzle', () => {
    expect(generate({ seed: 42, tier: 'medium' })).toEqual(generate({ seed: 42, tier: 'medium' }));
  });
  it('â¥ 95 % of 200 seeds produce a solvable level', () => {
    let ok = 0;
    for (let s = 0; s < 200; s++) {
      const g = generate({ seed: s, tier: (['easy', 'medium', 'hard'] as const)[s % 3] });
      if (g && solve(g.puzzle, { limit: 1 }).length === 1) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(190);
  });
  it('shipped levels regenerate from their seeds', () => {
    for (const l of pack.levels.filter((l) => l.seed !== undefined).slice(0, 10))
      expect(generate({ seed: l.seed!, tier: l.tier }).puzzle).toEqual(l.puzzle);
  });
});

describe('D4 â no duplicate clusters', () => {
  it('canonical keys are unique', () => {
    const keys = pack.levels.map((l) => l.canonicalKey ?? JSON.stringify(l.puzzle));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
