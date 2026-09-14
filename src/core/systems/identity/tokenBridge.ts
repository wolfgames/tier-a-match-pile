/**
 * Vault token bridge: when a game is embedded on the Wolf shelf, the shelf
 * passes its origin via `?wolfHost=` so the game borrows the shelf's session
 * instead of minting a fresh guest per iframe.
 */

import { BridgedTokenStore, type TokenStore } from '@wolfgames/client';

/**
 * The `?wolfHost=` origin, validated not trusted — these messages carry bearer
 * tokens, so only a concrete http(s) origin is honored; anything else → `null`.
 */
export function validateHostOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.origin;
}

export function resolveVaultHostOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('wolfHost');
  return validateHostOrigin(raw);
}

/** `BridgedTokenStore` when embedded, `undefined` when standalone (SDK default). */
export function resolveBridgedTokenStore(): TokenStore | undefined {
  const hostOrigin = resolveVaultHostOrigin();
  if (!hostOrigin) return undefined;
  return new BridgedTokenStore({ hostOrigin });
}
