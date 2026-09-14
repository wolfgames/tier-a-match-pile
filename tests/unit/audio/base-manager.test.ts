import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock audioState so the musicEnabled() gate is a plain value under the node
// test env (the solid-js server build makes real signals non-reactive).
const { musicState } = vi.hoisted(() => ({ musicState: { enabled: true } }));

vi.mock('~/core/systems/audio/state', () => ({
  audioState: { musicEnabled: () => musicState.enabled },
}));

import type { AudioLoader } from '~/core/systems/assets/loaders/audio';
import { BaseAudioManager } from '~/core/systems/audio/base-manager';
import type { SoundDefinition } from '~/core/systems/audio/types';

class TestAudioManager extends BaseAudioManager {}

function createMockLoader() {
  return {
    play: vi.fn(() => 42),
    stop: vi.fn(),
    setMasterVolume: vi.fn(),
  } satisfies AudioLoader;
}

describe('BaseAudioManager.startMusic', () => {
  beforeEach(() => {
    musicState.enabled = true;
  });

  it('forwards loop:true from the track to the loader', () => {
    const loader = createMockLoader();
    const manager = new TestAudioManager(loader);
    const track: SoundDefinition = {
      channel: 'audio-music',
      sprite: 'bed',
      loop: true,
    };

    manager.startMusic(track);

    expect(loader.play).toHaveBeenCalledWith(
      'audio-music',
      'bed',
      expect.objectContaining({ loop: true }),
    );
  });

  it('leaves loop unset for a track with no loop flag (one-shot preserved)', () => {
    const loader = createMockLoader();
    const manager = new TestAudioManager(loader);
    const track: SoundDefinition = { channel: 'audio-music', sprite: 'sting' };

    manager.startMusic(track);

    const opts = loader.play.mock.calls[0]?.[2];
    expect(opts?.loop).toBeUndefined();
  });

  it('does not play when music is disabled', () => {
    musicState.enabled = false;
    const loader = createMockLoader();
    const manager = new TestAudioManager(loader);

    manager.startMusic({ channel: 'audio-music', sprite: 'bed', loop: true });

    expect(loader.play).not.toHaveBeenCalled();
  });
});
