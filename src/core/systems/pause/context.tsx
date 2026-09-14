import { createContext, useContext, onMount, onCleanup, type ParentProps } from 'solid-js';
import { pauseState, type PauseState } from './state';
import { initPauseKeyboard } from './keyboard';

const PauseContext = createContext<PauseState>();

interface PauseProviderProps extends ParentProps {
  enableKeyboard?: boolean;
}

export function PauseProvider(props: PauseProviderProps) {
  onMount(() => {
    if (props.enableKeyboard !== false) {
      initPauseKeyboard();
    }
  });

  return (
    <PauseContext.Provider value={pauseState}>
      {props.children}
    </PauseContext.Provider>
  );
}

export function usePause(): PauseState {
  const context = useContext(PauseContext);
  if (!context) {
    // Fall back to singleton if used outside provider
    return pauseState;
  }
  return context;
}
