import { GetAssetClientCommand, type AssetClient } from '@wolfgames/client';
import type { Manifest } from '@wolfgames/components/core';
import {
  ManifestProvider,
  useConfigState,
  useGameConfig,
  useSignal,
} from '@wolfgames/components/solid';
import { createResource, Show, type ParentComponent } from 'solid-js';
import { assetSeed } from '../../../../assets/registry';
import { resolveManifestWithClient } from './cdn-manifest';

export interface CdnManifestProviderProps {
  manifest: Manifest;
  defaultGameData: unknown;
  /** CDN data path appended to the config storage URL (default: "chapters/default.json") */
  cdnPath?: string;
}

const DEFAULT_CDN_PATH = 'chapters/default.json';

/**
 * Boot bridge for CDN-first assets: obtains the initialized AssetClient,
 * resolves the manifest srcs against the lockfile, and only then mounts
 * ManifestProvider — nothing downstream resolves an asset URL before the
 * client has decided which manifest (baked seed or pinned release) is live.
 * Replaces GameManifestProvider, whose storage-config cdnBase disagrees with
 * the AssetClient's base outside deployed builds.
 */
export const CdnManifestProvider: ParentComponent<CdnManifestProviderProps> = (props) => {
  const configState = useConfigState();
  const config = useGameConfig();
  const gameKit = useSignal(configState.gameKit);

  const isFrozen = import.meta.env.VITE_IS_FROZEN === 'true';

  /* Opt-in escape hatch for local work: skip the AssetClient and render from
   * the authored manifest, so srcs resolve against `public/assets` instead of
   * the published CDN lockfile. Off by default on purpose — this template's
   * pipeline is CDN-first (see assets/README.md: the art lives on the CDN,
   * `assets/src/` is gitignored), so forcing it on in dev would 404 every
   * asset for any game that follows that pipeline. Set it only in a game that
   * keeps full local copies under `public/assets`. */
  const useLocalAssets = import.meta.env.VITE_ASSETS_LOCAL === '1';

  const [client] = createResource(gameKit, async (kit) => {
    if (useLocalAssets) return null;
    try {
      const { promise } = kit.execute(new GetAssetClientCommand(assetSeed));
      // The manifest treats names dynamically, so widen the seed-derived key union.
      return (await promise) as AssetClient<string>;
    } catch (error) {
      // Same fail-open posture as AssetClient.init(): a resolver problem must
      // not brick boot — render from the untouched local manifest instead.
      console.warn('[CdnManifestProvider] AssetClient unavailable — using local manifest.', error);
      return null;
    }
  });

  const resolved = (): Manifest => {
    const assetClient = client();
    return assetClient
      ? resolveManifestWithClient(props.manifest, assetClient)
      : props.manifest;
  };

  return (
    <Show when={client.state === 'ready'}>
      <ManifestProvider
        manifest={resolved()}
        defaultGameData={props.defaultGameData}
        fetchUrl={isFrozen ? null : config.buildDataUrl(props.cdnPath ?? DEFAULT_CDN_PATH)}
      >
        {props.children}
      </ManifestProvider>
    </Show>
  );
};
