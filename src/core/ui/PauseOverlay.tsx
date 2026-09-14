import { Show } from 'solid-js';
import { usePause } from '../systems/pause';

interface PauseOverlayProps {
  class?: string;
}

export function PauseOverlay(props: PauseOverlayProps) {
  const { paused } = usePause();

  return (
    <Show when={paused()}>
      <div
        class={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 ${props.class ?? ''}`}
      >
        <div class="text-center text-white">
          <h2 class="text-4xl font-bold mb-4">PAUSED</h2>
          <p class="text-gray-400">Press SPACE to resume</p>
        </div>
      </div>
    </Show>
  );
}
