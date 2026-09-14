import { createSignal, Show, type JSX, type ParentComponent } from 'solid-js';
import { useEmbed } from './context';
import { redirectWithOutcome, type EmbedOutcome } from './redirect';

export type AttractEngage = (outcome: EmbedOutcome) => void;

export interface AttractGateProps {
  hook: (engage: AttractEngage) => JSX.Element;
}

export const AttractGate: ParentComponent<AttractGateProps> = (props) => {
  const embed = useEmbed();
  const [engaged, setEngaged] = createSignal(false);

  if (embed.mode === 'standalone') {
    return <>{props.children}</>;
  }

  const engage: AttractEngage = (outcome) => {
    if (!embed.clickUrl) {
      console.error(
        'embed: engage() called but clickUrl is null — holding attract gate',
      );
      return;
    }
    setEngaged(true);
    redirectWithOutcome(embed.clickUrl, outcome);
  };

  return (
    <Show when={!engaged()} fallback={<>{props.children}</>}>
      {props.hook(engage)}
    </Show>
  );
};
