import { createSignal, createRoot } from 'solid-js';

export interface PauseState {
  paused: () => boolean;
  setPaused: (paused: boolean) => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
}

function createPauseState(): PauseState {
  const [paused, setPaused] = createSignal(false);

  return {
    paused,
    setPaused,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    toggle: () => setPaused((p) => !p),
  };
}

// Singleton pause state
export const pauseState = createRoot(createPauseState);
