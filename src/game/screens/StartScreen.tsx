import { onMount, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useRendererHost } from '@wolfgames/components/solid';
import { useScreen, type ScreenId } from '~/core/systems/screens';
import { useAssets } from '~/core/systems/assets';
import { useAudio } from '~/core/systems/audio';
import { useTuning, type ScaffoldTuning } from '~/core';
import { useGameTracking } from '~/game/setup/tracking';

import type { GameTuning } from '~/game/tuning';

// Game-specific start screen — swap this import for a different game
import { setupStartScreen } from '~/game/match-pile/screens/startView';

export default function StartScreen() {
  const { goto } = useScreen();
  const { coordinator, initGpu, unlockAudio, loadCore, loadAudio, loadBundle } = useAssets();
  const audio = useAudio();
  const tuning = useTuning<ScaffoldTuning, GameTuning>();
  const { trackGameStart } = useGameTracking();
  let containerRef: HTMLDivElement | undefined;
  // Frame-sized mount outside the DOM design transform — see components.md §9.2b.
  const rendererHost = useRendererHost();

  // Setup game-specific start screen controller
  const startScreen = setupStartScreen({
    goto: (screen) => { void goto(screen as ScreenId); },
    coordinator,
    initGpu,
    unlockAudio,
    loadCore,
    loadAudio,
    loadBundle,
    tuning,
    analytics: { trackGameStart },
    audio: {
      volume: audio.volume,
      setVolume: audio.setVolume,
      musicEnabled: audio.musicEnabled,
      toggleMusic: audio.toggleMusic,
    },
  });

  onMount(() => {
    if (containerRef) startScreen.init(containerRef);
  });

  onCleanup(() => startScreen.destroy());

  return (
    // `design-box-span` spans the frame box, not the 390×844 canvas: `fixed
    // inset-0` under the design root resolves to the canvas, which stops ~33 real
    // px short on each side of a 375×667 screen.
    //
    // NO `pointer-events-auto` here: this screen's only UI is Pixi (the PLAY
    // button is a SpriteButton), so the root must stay pass-through or it covers
    // the canvas and swallows the tap — the game renders perfectly and PLAY does
    // nothing. Caught by elementFromPoint at 375×667. A screen that adds DOM
    // chrome opts back in on the chrome element, not on this root.
    //
    // No background-color: the Pixi canvas is portalled out to the frame-sized
    // renderer host and now sits *underneath* this root, so painting the root
    // opaque would mask the scene out of the letterbox entirely. The renderer
    // applies startScreen.backgroundColor instead.
    <div class="design-box-span">
      {/* Pixi canvas container — portalled to the renderer host so Pixi renders
          1:1 with the screen instead of being handed a design-canvas CSS box and
          magnified. Show guards the first render, before the host ref lands. */}
      <Show when={rendererHost()}>
        {(host) => (
          <Portal mount={host()}>
            <div ref={containerRef} class="absolute inset-0" />
          </Portal>
        )}
      </Show>

      {/* DOM UI Layer removed, Pixi SpriteButton handles play now */}
    </div>
  );
}
