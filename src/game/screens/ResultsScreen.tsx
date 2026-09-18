// Results screen — thin Pixi-lifecycle shell, structurally identical to StartScreen.tsx.
// All visual composition (RESULTS→PIXI conversion, tier-a-build-v4) lives in
// ~/game/match-pile/screens/resultsView.ts / resultsViewScene.ts — this file only wires the
// renderer host + navigation, same as the start screen's own shell.
import { onMount, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useRendererHost } from '@wolfgames/components/solid';
import { useScreen, type ScreenId } from '~/core/systems/screens';
import { useAssets } from '~/core/systems/assets';

import { setupResultsScreen } from '~/game/match-pile/screens/resultsView';

export default function ResultsScreen() {
  const { goto } = useScreen();
  const { coordinator, loadBundle } = useAssets();
  let containerRef: HTMLDivElement | undefined;
  // Frame-sized mount outside the DOM design transform — see components.md §9.2b.
  const rendererHost = useRendererHost();

  const resultsScreen = setupResultsScreen({
    goto: (screen) => { void goto(screen as ScreenId); },
    coordinator,
    loadBundle,
  });

  onMount(() => {
    if (containerRef) resultsScreen.init(containerRef);
  });

  onCleanup(() => resultsScreen.destroy());

  return (
    // `design-box-span`, not `fixed inset-0` — see StartScreen.tsx's own comment (components.md
    // §9.2b): under the design root, `fixed` resolves to the canvas, stopping short on any phone
    // narrower than the design canvas ratio.
    //
    // NO `pointer-events-auto`: this screen's only UI is Pixi (CTA/Main Menu are Pixi buttons), so
    // the root must stay pass-through or it covers the canvas and swallows every tap.
    <div class="design-box-span">
      {/* Pixi canvas container — portalled to the renderer host so Pixi renders 1:1 with the
          screen instead of being handed a design-canvas CSS box and magnified. */}
      <Show when={rendererHost()}>
        {(host) => (
          <Portal mount={host()}>
            <div ref={containerRef} class="absolute inset-0" />
          </Portal>
        )}
      </Show>
    </div>
  );
}
