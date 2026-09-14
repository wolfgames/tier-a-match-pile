import { describe, it, expect, vi } from 'vitest';

vi.mock('solid-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('solid-js')>();
  return { ...actual };
});

import { AttractGate, type AttractEngage } from '~/integrations/embed/attract';

describe('AttractGate', () => {
  it('exports a component function', () => {
    expect(typeof AttractGate).toBe('function');
  });

  it('AttractEngage type accepts an EmbedOutcome payload', () => {
    const fn: AttractEngage = (_outcome) => {
      // Compile-time check only
    };
    fn({ score: 0, correct: 0, hookId: 'h' });
    expect(fn).toBeDefined();
  });
});
