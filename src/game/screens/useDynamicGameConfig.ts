import { createEffect, createResource } from 'solid-js';
import { useConfigState, useSignal } from '@wolfgames/components/solid';
import { GetDynamicDataClientCommand } from '@wolfgames/client';
import { registry } from '../../../schemas/registry';
import { applyDynamicGameConfig, type ResolvedGameConfig } from '~/game/match-pile/config/dynamicGameConfig';

const ENTRY_KEY = 'default';

/**
 * Boot-time DynamicData resolution for Match Pile's progression/difficulty/scoring/content
 * config (schemas/registry.ts). Mirrors the one existing `@wolfgames/client` command-execution
 * pattern in this repo (src/core/systems/assets/cdn-manifest-provider.tsx: useConfigState() ->
 * useSignal(gameKit) -> createResource -> kit.execute(...)).
 *
 * Fire-and-forget: mounted once from GameScreen.tsx, applies the resolved config (or silently
 * keeps today's hardcoded defaults on any failure — same fail-open posture as
 * CdnManifestProvider) via `applyDynamicGameConfig`, which mutates the existing config constants
 * in place. No DynamicData schema is registered/deployed yet (see schemas/registry.ts), so this
 * currently always resolves to `defaultData` — i.e. no behavior change until the schemas are
 * registered and populated.
 */
export function useDynamicGameConfig(): void {
  const configState = useConfigState();
  const gameKit = useSignal(configState.gameKit);

  const [resolved] = createResource(gameKit, async (kit): Promise<ResolvedGameConfig | null> => {
    try {
      const { promise } = kit.execute(new GetDynamicDataClientCommand(registry));
      const client = await promise;
      const [difficulty, scoring, content] = await Promise.all([
        client.getEntry('match-pile-difficulty', ENTRY_KEY, { fallbackToDefault: true }),
        client.getEntry('match-pile-scoring', ENTRY_KEY, { fallbackToDefault: true }),
        client.getEntry('match-pile-content', ENTRY_KEY, { fallbackToDefault: true }),
      ]);
      return { difficulty, scoring, content };
    } catch (error) {
      // Same fail-open posture as CdnManifestProvider: a resolver problem must not brick boot —
      // the config constants keep their compiled-in defaults.
      console.warn('[useDynamicGameConfig] DynamicData unavailable — using local defaults.', error);
      return null;
    }
  });

  createEffect(() => {
    const data = resolved();
    if (data) applyDynamicGameConfig(data);
  });
}
