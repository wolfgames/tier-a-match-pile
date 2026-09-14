import { createSignal, onMount, Show } from 'solid-js';
import { useAssetCoordinator } from '../systems/assets';

interface LogoProps {
  class?: string;
}

export function Logo(props: LogoProps) {
  const coordinator = useAssetCoordinator();
  const [src, setSrc] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      // Get logo from branding atlas
      const url = await coordinator.dom.getFrameURL('atlas-branding-wolf', 'logo-wide-small');
      setSrc(url);
    } catch (e) {
      console.warn('Logo not loaded yet');
    }
  });

  return (
    <Show when={src()}>
      <img src={src()!} alt="Logo" class={props.class} />
    </Show>
  );
}
