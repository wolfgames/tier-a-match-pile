/**
 * Game contract validation.
 *
 * Ensures the active game module (match-pile) exports functions that satisfy
 * the contract types required by the scaffold screens.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@wolfgames/components/solid', () => ({
  Spinner: () => null,
  ProgressBar: () => null,
  useSignal: (s: { get: () => unknown }) => s.get,
}));

vi.mock('solid-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('solid-js')>();
  return { ...actual };
});

import { setupGame, setupStartScreen } from '~/game/match-pile';
import type { SetupGame, SetupStartScreen } from '~/game/game-contract';

describe('game contract', () => {
  it('exports setupGame matching SetupGame signature', () => {
    expect(typeof setupGame).toBe('function');

    const _typeCheck: SetupGame = setupGame;
    expect(_typeCheck).toBe(setupGame);
  });

  it('exports setupStartScreen matching SetupStartScreen signature', () => {
    expect(typeof setupStartScreen).toBe('function');

    const _typeCheck: SetupStartScreen = setupStartScreen;
    expect(_typeCheck).toBe(setupStartScreen);
  });
});
