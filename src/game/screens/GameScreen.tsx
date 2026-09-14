import { onMount, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useRendererHost } from '@wolfgames/components/solid';

import { useAssets } from '~/core/systems/assets';
import { PauseOverlay, useTuning, type ScaffoldTuning } from '~/core';
import { Logo } from '~/core/ui/Logo';
import { useAudio } from '~/core/systems/audio';
import { useScreen } from '~/core/systems/screens';
import { useGameTracking } from '~/game/setup/tracking';

import type { GameTuning } from '~/game/tuning';
import { useGameData } from '~/game/screens/useGameData';

// Game-specific controller — swap this import for a different game
import { setupGame } from '~/game/mygame/screens/gameController';

export default function GameScreen() {
  const { coordinator } = useAssets();
  const tuning = useTuning<ScaffoldTuning, GameTuning>();
  const audio = useAudio();
  const gameData = useGameData();
  const { service: analytics } = useGameTracking();
  const { goto } = useScreen();
  let containerRef: HTMLDivElement | undefined;
  // Frame-sized mount outside the DOM design transform — see components.md §9.2b.
  const rendererHost = useRendererHost();

  // Setup game-specific controller (creates signals & effects in reactive context)
  const controller = setupGame({
    coordinator,
    tuning,
    audio,
    gameData,
    analytics,
    goto: (screen: string) => void goto(screen as never),
  });

  onMount(() => {
    if (containerRef) controller.init(containerRef);
  });

  onCleanup(() => controller.destroy());

  /* Where the controller's container lives depends on how it renders.
     A 'pixi' controller must draw on the frame-sized renderer host, outside the
     design transform: parented inside it, the canvas gets a 390x844 CSS box on
     every device, renders magnified, and its backdrop can never reach the
     letterbox (components.md §9.2b). A 'dom' controller is the opposite — its
     elements are authored in design px and belong inside the transform. */
  const isPixi = controller.gameMode === 'pixi';

  /* The root below uses `design-box-span`, not `fixed inset-0`: under the design
     root, `fixed` resolves to the canvas rather than the frame box.

     No `bg-black`, and no `pointer-events-auto` when a renderer is drawing — both
     deliberate. An opaque canvas-sized root would paint straight over the canvas
     that now sits underneath it, and an interactive one would swallow every tap
     meant for it. A 'dom' controller has no canvas underneath to reach, so it
     takes its events back and keeps a backdrop. */
  return (
    <>
    <div
      class="design-box-span"
      classList={{ 'pointer-events-auto': !isPixi, 'bg-black': !isPixi }}
    >
      {/* Engine container. Portalled to the renderer host for a 'pixi'
          controller so Pixi renders 1:1 with the screen; kept in the scaled tree
          for a 'dom' one, where design px is exactly what is wanted. */}
      <Show
        when={isPixi && rendererHost()}
        fallback={<div ref={containerRef} class="absolute inset-0" />}
      >
        {(host) => (
          <Portal mount={host()}>
            <div
              ref={containerRef}
              class="absolute inset-0"
              style={{ 'pointer-events': 'auto' }}
            />
          </Portal>
        )}
      </Show>

      {/* Accessibility: Screen reader announcements */}
      <div
        class="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {controller.ariaText()}
      </div>

      {/* Wolf Games logo at bottom center */}
      <div class="absolute bottom-8 left-1/2 -translate-x-1/2">
        <Logo />
      </div>
    </div>

    {/* Pause overlay, a SIBLING of the root above rather than a child, which is
        load-bearing. `src/core/` is upstream-managed and its root is
        `fixed inset-0`: under the design transform that pins to the 390x844
        canvas and leaves bands, and as a modal scrim it also has to take pointer
        events back. Both are corrected from here through its `class` prop instead
        of editing the scaffold — `.design-box-span` resets right/bottom precisely
        so it can be combined with an `inset-0` that cannot be removed.

        As a child it would land at left:-33 instead of 0. The utility offsets by
        the bleed measured from the design root, and `position: absolute` makes the
        spanning root above a containing block, so nesting it inside that root
        applies the offset twice. ScreenRenderer's wrapper is unpositioned, so as a
        sibling the containing block is the design root and the offset applies
        once. A full-bleed layer *inside* a spanning root wants plain
        `absolute inset-0` instead. See components.md §9.5.2. */}
    <PauseOverlay class="design-box-span pointer-events-auto" />
    </>
  );
}
