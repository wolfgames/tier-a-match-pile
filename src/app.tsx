import { parseEnvironment } from '@wolfgames/client';
import {
  AnalyticsProvider,
  DevOnly,
  GameConfigProvider,
  useAnalyticsService,
  DesignBleed,
  GameShell,
  ViewportProvider,
  ViewportToggle,
} from '@wolfgames/components/solid';
import { onCleanup, onMount, type ParentComponent } from 'solid-js';
import {
  AssetProvider,
  CdnManifestProvider,
  FeatureFlagProvider,
  GlobalBoundary,
  getResolvedPlayerId,
  initPauseKeyboard,
  PauseProvider,
  ScreenProvider,
  ScreenRenderer,
  setupGlobalErrorHandlers,
  TuningProvider,
} from '~/core';
import { initSentry } from '~/core/lib/sentry';
import { defaultGameData, gameConfig } from '~/game';
import { manifest } from '~/game/asset-manifest';
import { GAME_DEFAULTS } from '~/game/tuning';
import './app.css';
import { Show } from 'solid-js';
import { Inspector } from '~/core/dev/inspector';
import { activeDb } from '~/core/systems/ecs/DbBridge';
import { createExampleWorld } from '~/core/systems/ecs/ExamplePlugin';
import '~/game/setup/flags'; // registers flag config at module load
import { useAssetCoordinator } from '~/core/systems/assets';
import { EmbedHook } from '~/game/EmbedHook';
import { GameSettingsMenu } from '~/game/screens/components/GameSettingsMenu';
import { createLoadingTracker } from '~/game/setup/loading-tracker';
import { createSessionTracker } from '~/game/setup/session-tracker';
import { AttractGate, EmbedProvider } from '~/integrations/embed';
import { VaultHostBridge } from '~/integrations/vault';

const environment = parseEnvironment(import.meta.env.VITE_APP_ENV);

/** Reset progress and reload the page */
const handleResetProgress = () => {
  window.location.reload();
};

/** Wires session lifecycle events (start, pause, resume, end) */
function SessionTrackerBridge() {
  const service = useAnalyticsService();
  const cleanup = createSessionTracker(service, gameConfig.initialScreen);
  onCleanup(cleanup);
  return null;
}

/** Wires loading events (start, complete, abandon) to asset coordinator */
function LoadingTrackerBridge() {
  const service = useAnalyticsService();
  const coordinator = useAssetCoordinator();
  const cleanup = createLoadingTracker(service, coordinator.loadingStateSignal);
  onCleanup(cleanup);
  return null;
}

const TuningViewportBridge: ParentComponent = (props) => (
  <ViewportProvider autoFill>{props.children}</ViewportProvider>
);

// Example ECS database — shown in Inspector when no game is active
const exampleDB = createExampleWorld();

export default function App() {
  onMount(async () => {
    // Initialize error tracking
    /* The loader is a thunk, not the factory: a static import of
     * `createSentryClient` here would drag @sentry/browser back into the entry
     * chunk. See SentryClientLoader in ~/core/lib/sentry. */
    initSentry(environment, () => import('~/game/lib/sentry-client'));

    // Setup global error handlers
    setupGlobalErrorHandlers();

    // Initialize pause keyboard (spacebar)
    initPauseKeyboard();
  });

  return (
    <EmbedProvider>
      <GameConfigProvider debug>
        <AnalyticsProvider userId={getResolvedPlayerId() ?? undefined}>
          <SessionTrackerBridge />
          <GlobalBoundary>
            <TuningProvider gameDefaults={GAME_DEFAULTS}>
              <DevOnly>
                <Show when={activeDb()} fallback={<Inspector db={exampleDB} />}>
                  {(db) => <Inspector db={db()} />}
                </Show>
              </DevOnly>
              <FeatureFlagProvider>
                <TuningViewportBridge>
                  {/* The three scaling layers, composed: the viewport frame, the
                      renderer host (frame-sized, outside the DOM transform), and
                      the one design transform every screen below is authored
                      against. See @wolfgames/components docs/standards/components.md
                      §9.7 — and §9.2b for why the renderer cannot live inside the
                      transform. GameShell also puts `pointer-events-none` on the
                      design root, because the canvas is now a sibling underneath
                      the DOM layer: left interactive, this layer absorbs every tap
                      and the game renders perfectly while responding to nothing.
                      Each fully-DOM screen opts back in on its own root. */}
                  <GameShell>
                    {/* Viewport Toggle - dev only; self-positions via Portal */}
                    <DevOnly>
                      <ViewportToggle />
                    </DevOnly>
                    <PauseProvider>
                      <CdnManifestProvider
                        manifest={manifest}
                        defaultGameData={defaultGameData}
                      >
                        <AssetProvider>
                          <LoadingTrackerBridge />
                          <ScreenProvider
                            options={{
                              initialScreen: gameConfig.initialScreen,
                              screenAssets: gameConfig.screenAssets,
                            }}
                          >
                            {/* Corner chrome belongs on the edge of the VIEW, not
                                the edge of the canvas. `position: fixed` does not
                                do that here — a transformed ancestor becomes the
                                containing block for fixed descendants, so `fixed`
                                inside the design root pins to the 390×844 canvas
                                and a tablet preset strands the cog well inside the
                                real edge. DesignBleed is the frame box expressed
                                in design coordinates.

                                Inside ScreenProvider so the menu can hide itself
                                on the `game` screen, where the in-game Pixi panel
                                owns settings (ENG-4127). */}
                            <DesignBleed zIndex={9999}>
                              {/* `pointer-events: auto` per control: the bleed
                                  layer spans the whole frame and deliberately
                                  takes no events, or it would eat every tap meant
                                  for the game below. */}
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '8px',
                                  right: '8px',
                                  'pointer-events': 'auto',
                                }}
                              >
                                <GameSettingsMenu
                                  onResetProgress={handleResetProgress}
                                />
                              </div>
                            </DesignBleed>
                            {/* Generic Vault Player runtime; inert outside a Vault. Content
                                forks pass Daily-Editions handling via its onContext / catalog
                                props (see src/integrations/vault/README.md). Must stay inside
                                ScreenProvider — it reads useScreen() to hold `ready` until the
                                first non-loading screen. */}
                            <VaultHostBridge />
                            <AttractGate
                              hook={(engage) => <EmbedHook engage={engage} />}
                            >
                              <ScreenRenderer screens={gameConfig.screens} />
                            </AttractGate>
                          </ScreenProvider>
                        </AssetProvider>
                      </CdnManifestProvider>
                    </PauseProvider>
                  </GameShell>
                </TuningViewportBridge>
              </FeatureFlagProvider>
            </TuningProvider>
          </GlobalBoundary>
        </AnalyticsProvider>
      </GameConfigProvider>
    </EmbedProvider>
  );
}
