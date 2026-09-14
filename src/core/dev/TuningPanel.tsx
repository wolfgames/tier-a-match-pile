import { onMount, onCleanup, Show, createEffect, createSignal, untrack } from 'solid-js';
import type { Pane } from 'tweakpane';
import { useTuning } from '../systems/tuning/context';
import { bindTuningToPane, addPresetControls } from './bindings';
import type { ScaffoldTuning, GameTuningBase } from '../systems/tuning/types';
import { useGameConfig } from '@wolfgames/components/solid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PaneInstance = Pane & any;

// Global keyboard listener for backtick toggle (import.meta.env.DEV is a Vite build-time constant)
const [isPanelOpen, setIsPanelOpen] = createSignal(false);

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') {
      e.preventDefault();
      setIsPanelOpen((prev) => !prev);
    }
  });
}

export { isPanelOpen, setIsPanelOpen };

export default function TuningPanel<G extends GameTuningBase = GameTuningBase>() {
  let containerRef: HTMLDivElement | undefined;
  let pane: PaneInstance | undefined;
  const tuning = useTuning<ScaffoldTuning, G>();
  const config = useGameConfig();

  // Get position from tuning state, with fallback
  const getPosition = () => tuning.scaffold.tuningPanel?.position || 'left';

  // Position classes for left, center, right
  const positionClasses = {
    left: 'top-0 left-0 bottom-0',
    center: 'top-0 left-1/2 -translate-x-1/2 bottom-0',
    right: 'top-0 right-0 bottom-0',
  };

  onMount(async () => {
    if (config.isProduction() || !containerRef) return;

    const { Pane } = await import('tweakpane');

    pane = new Pane({
      container: containerRef,
      title: 'Tuning',
    });

    let hasInitialized = false;

    // Wait for tuning to load before binding (only once)
    createEffect(() => {
      const isLoaded = tuning.isLoaded();

      if (isLoaded && pane && !hasInitialized) {
        hasInitialized = true;

        // Use untrack to prevent re-running when tuning values change
        untrack(() => {
          // Show load source info
          const source = tuning.source();
          pane.addBinding(
            { source: `Scaffold: ${source.scaffold}, Game: ${source.game}` },
            'source',
            { label: 'Loaded from', disabled: true }
          );

          // Bind tuning values
          bindTuningToPane(pane, tuning, {
            onChange: () => {
              // Auto-save on change
              tuning.save();
            },
          });

          // Add preset controls
          addPresetControls(pane, tuning);
        });
      }
    });
  });

  onCleanup(() => {
    pane?.dispose();
  });

  return (
    <Show when={!config.isProduction()}>
      <div
        class={`fixed z-[9999] flex flex-col ${positionClasses[getPosition()]}`}
        style={{
          display: isPanelOpen() ? 'flex' : 'none',
          'max-height': '100vh',
        }}
      >
        <div
          ref={containerRef}
          class="overflow-y-auto flex-1"
          style={{ 'max-height': 'calc(100vh - 24px)' }}
        />
        <div class="text-xs text-gray-400 px-2 py-1 text-left">
          Press ` to toggle
        </div>
      </div>
    </Show>
  );
}
