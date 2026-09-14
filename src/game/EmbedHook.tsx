import type { AttractEngage } from '~/integrations/embed';

export interface EmbedHookProps {
  engage: AttractEngage;
}

/**
 * Placeholder hook UI for embedded mode. Replace with a real attract
 * interaction (e.g. a single-tap mini-question) for your game.
 */
export function EmbedHook(props: EmbedHookProps) {
  return (
    <div class="flex h-full w-full items-center justify-center bg-black text-white">
      <button
        type="button"
        class="rounded bg-white px-4 py-2 text-black"
        onClick={() =>
          props.engage({ score: 0, correct: 1, hookId: 'placeholder' })
        }
      >
        Tap to play
      </button>
    </div>
  );
}
