/**
 * Generic Vault Player runtime — every Vault-launched game reports this,
 * whether or not it offers Daily Editions. Renders nothing, no-ops standalone.
 *
 *   Vault -> Game: context         (sent on the iframe `load`, then re-sent on
 *                                   the game's *first inbound message* —
 *                                   whichever it is, not `ready` specifically —
 *                                   and again on every later selection)
 *   Game -> Vault: content_catalog (optional scheduling metadata)  ┐ startVaultRuntime
 *   Game -> Vault: ready           (first non-loading screen — see below)  ┘ in order
 *   ... gameplay ...
 *   Game -> Vault: play_ended      (session exit only, never completion)
 *
 * `startVaultRuntime` sends `ready` synchronously and the Vault may reveal the
 * iframe the moment it arrives, so the runtime is held until the first
 * non-`loading` screen — `ready` means "the player can see and interact",
 * firing it during `loading` shows a still-booting game. It starts once; a
 * later `results -> game` revisit must not restart it. Holding the runtime is
 * safe: the Vault re-sends `context` on the first inbound message (see above),
 * so a delayed start costs a delayed context, never a dropped one.
 *
 * The SDK keeps a single active runtime: mount once, and route content handling
 * through the `onContext` / `catalog` props rather than a second call.
 *
 * Context is **unauthenticated**; never gate entitlement on it. `play_ended`
 * fires on session exit (`beforeunload`, plus SPA cleanup below), never on
 * completion — that is `reportContentCompleted`, at the game's own boundary.
 */
import {
  inVault,
  reportPlayEnded,
  startVaultRuntime,
  type ScheduledContentMetadata,
  type VaultGameContext,
} from '@wolfgames/client';
import { createEffect, onCleanup } from 'solid-js';
import { useScreen } from '~/core/systems/screens';

export interface VaultHostBridgeProps {
  /**
   * Handle a resolved Vault context (`content:{type:'default'}` or
   * `{type:'content', contentId}`), mapping the selection onto game content.
   * Identical re-sends are ignored. Omit for lifecycle-only (template default).
   */
  onContext?: (context: VaultGameContext) => void;
  /**
   * Temporary scheduling metadata (`{contentId, availableFrom}[]`), sent as
   * `content_catalog` before `ready`. The Vault owns all selection and pacing.
   */
  catalog?: readonly ScheduledContentMetadata[];
}

/**
 * Wires the Vault runtime, once, on the first non-loading screen. Mount inside
 * `<ScreenProvider>` — it reads `useScreen()` to time `ready`. Inert outside a
 * Vault.
 */
export function VaultHostBridge(props: VaultHostBridgeProps = {}) {
  // Read the screen before the Vault guard so the `<ScreenProvider>` requirement
  // is enforced everywhere (dev, CI, standalone) — not only on a live Vault
  // launch, where a mis-mount would otherwise first surface as a thrown error.
  const { current } = useScreen();

  if (!inVault()) return null;

  let started = false;
  let stop: (() => void) | null = null;

  // Hold `ready` (and the whole runtime) until the game is genuinely playable.
  createEffect(() => {
    const screen = current();
    if (started || screen === 'loading') return;
    started = true;
    stop = startVaultRuntime({
      onContext: (context) => {
        if (import.meta.env.DEV) {
          console.log('[Vault] context', context);
        }
        props.onContext?.(context);
      },
      catalog: props.catalog,
    });
  });

  // The SDK's runtime only registers `beforeunload`, which iOS Safari routinely
  // skips (tab close, app switch, bfcache). `pagehide` fires in those cases, so
  // report the exit here too. `reportPlayEnded` is idempotent — it closes over a
  // `playEndedSent` flag, so the double-fire with `beforeunload` sends once.
  const onPageHide = () => {
    reportPlayEnded();
  };
  window.addEventListener('pagehide', onPageHide);

  onCleanup(() => {
    window.removeEventListener('pagehide', onPageHide);
    reportPlayEnded();
    stop?.();
  });

  return null;
}
