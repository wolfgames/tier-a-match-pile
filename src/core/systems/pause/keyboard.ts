import { pauseState } from './state';

let initialized = false;

export function initPauseKeyboard(): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      pauseState.toggle();
    }
  });
}

export function cleanupPauseKeyboard(): void {
  // Note: For full cleanup, would need to store the handler reference
  // For now, keyboard listener persists for app lifetime
  initialized = false;
}
