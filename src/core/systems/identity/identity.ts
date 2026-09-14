/**
 * App-wide player-identity singleton — resolves one stable player id at boot and
 * memoizes it for the whole codebase. See `README.md` for the design.
 */

import { PlayerIdentityService } from '@wolfgames/client';
import type { PlayerIdentity } from '@wolfgames/client';
import { isBackendConfigured, resolvePlayerDataHost } from './host';
import { getOrCreateLocalPlayerId, rememberResolvedPlayerId } from './localId';
import { resolveBridgedTokenStore } from './tokenBridge';

/** How long boot waits for the backend player before falling back to a local id. */
const IDENTIFY_BUDGET_MS = 2500;

let service: PlayerIdentityService | null = null;
let resolvePromise: Promise<string> | null = null;
let resolvedId: string | null = null;

type GameSaveIdentity = Pick<PlayerIdentityService, 'identify' | 'subscribe'>;

/**
 * A no-network `PlayerIdentityService` stand-in bound to the already-resolved
 * player id (backend uuid when signed in, else the local id.
 */
export function getResolvedIdentityService(): PlayerIdentityService {
  const uuid = getResolvedPlayerId() ?? getOrCreateLocalPlayerId();
  const identity: PlayerIdentity = {
    uuid,
    gamerTag: null,
    numberTag: null,
    // Pinned `true`, not sourced from the resolved identity. Gates the SDK's
    // cross-player save-wipe; inert today (every player is anonymous — nothing
    // calls `completeSignIn`). See README "Save-wipe pin" before changing.
    isAnonymous: true,
    provider: 'guest',
  };
  const standIn: GameSaveIdentity = {
    identify: async () => identity,
    subscribe: () => () => { },
  };
  return standIn as PlayerIdentityService;
}

/** The backend session/token handle, for consumers that call the backend as this player. */
export function getPlayerIdentityService(): PlayerIdentityService {
  if (!service) {
    const host = resolvePlayerDataHost();
    const tokenStore = resolveBridgedTokenStore();
    service = new PlayerIdentityService(
      tokenStore ? { host, tokenStore } : { host },
    );
  }
  return service;
}

/** Sync accessor; `null` until {@link resolvePlayerId} has completed. */
export function getResolvedPlayerId(): string | null {
  return resolvedId;
}

/**
 * Memoized. Races the backend `identify()` against the budget; always resolves
 * to a string and never rejects. `entry-client` awaits it once before render.
 */
export function resolvePlayerId(): Promise<string> {
  if (!resolvePromise) resolvePromise = doResolvePlayerId();
  return resolvePromise;
}

async function doResolvePlayerId(): Promise<string> {
  // Local dev / no backend configured: skip the cross-origin request the
  // browser would only CORS-reject, and use a local id straight away.
  if (!isBackendConfigured()) {
    resolvedId = getOrCreateLocalPlayerId();
    return resolvedId;
  }
  try {
    const identity = await withTimeout(
      getPlayerIdentityService().identify(),
      IDENTIFY_BUDGET_MS,
    );
    resolvedId = identity.uuid;
    // Make the resolved id sticky: persist the backend uuid onto the local key
    // so a later `identify()` timeout falls back to *this* uuid, not a freshly
    // minted local one. Without this, the same player gets a different id every
    // flaky session (backend uuid ↔ local id), splitting analytics, flags, and
    // the save envelope. `getOrCreateLocalPlayerId()` below then returns it.
    rememberResolvedPlayerId(identity.uuid);
  } catch (error) {
    // Expected when the backend is unreachable/CORS-blocked, or when identify()
    // misses the budget. Fall back to the local id — which is the last-resolved
    // backend uuid if a prior session ever reached the backend (see above),
    // else a freshly minted local id.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[identity] backend player unavailable (${reason}); using local fallback id`,
    );
    resolvedId = getOrCreateLocalPlayerId();
  }
  return resolvedId;
}

/** Rejects if `promise` does not settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`identify() exceeded ${ms}ms budget`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
