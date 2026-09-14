/**
 * Screen navigation payload tests — guards the batched screen swap in
 * createScreenManager (payload visible when current() changes; data cleared
 * on payload-less goto).
 */

import { describe, it, expect } from 'vitest';
import { createRoot, createComputed } from 'solid-js';
import { createScreenManager } from '~/core/systems/screens/manager';

const instant = { transition: { duration: 0, type: 'none' as const } };

describe('Screen navigation payload', () => {
  it('data() holds the new payload whenever current() updates', async () => {
    await createRoot(async (dispose) => {
      const manager = createScreenManager({ initialScreen: 'loading', ...instant });
      const observed: Array<{ screen: string; data: Record<string, unknown> }> = [];
      createComputed(() => {
        observed.push({ screen: manager.current(), data: manager.data() });
      });

      await manager.goto('game', { qteId: 'q1' });

      const gameFrames = observed.filter((f) => f.screen === 'game');
      expect(gameFrames.length).toBeGreaterThan(0);
      for (const frame of gameFrames) {
        expect(frame.data).toEqual({ qteId: 'q1' });
      }
      dispose();
    });
  });

  it('goto() without a payload clears the previous data', async () => {
    const manager = createScreenManager({ initialScreen: 'loading', ...instant });

    await manager.goto('game', { nextScreen: 'results' });
    expect(manager.data()).toEqual({ nextScreen: 'results' });

    await manager.goto('start');
    expect(manager.data()).toEqual({});
  });

  it('goto() with a payload replaces (not merges) the previous data', async () => {
    const manager = createScreenManager({ initialScreen: 'loading', ...instant });

    await manager.goto('game', { a: 1, stale: true });
    await manager.goto('results', { b: 2 });
    expect(manager.data()).toEqual({ b: 2 });
  });
});
