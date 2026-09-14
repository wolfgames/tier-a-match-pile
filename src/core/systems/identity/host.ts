/** Resolves the player-data-service origin for the current environment. */

import { Environment, parseEnvironment } from '@wolfgames/client';
import { resolveVaultHostOrigin } from './tokenBridge';

/**
 * Local has no dedicated backend, so it shares the dev host.
 *
 * Duplicates the platform's `env*HostMap` pattern
 * (`@wolfgames/shared/modules/config/env-hosts`), which has no
 * `envPlayerDataHostMap` yet; this will likely move there and become an import.
 */
const HOST_BY_ENVIRONMENT: Record<Environment, string> = {
  [Environment.Production]: 'player-data.production.wolf.games',
  [Environment.Staging]: 'player-data.staging.wolf.games',
  [Environment.QA]: 'player-data.qa.wolf.games',
  [Environment.Development]: 'player-data.dev.wolf.games',
  [Environment.Local]: 'player-data.dev.wolf.games',
};

/** `VITE_PLAYER_DATA_HOST` (a bare host or full origin) overrides the map. */
export function resolvePlayerDataHost(): string {
  const override = import.meta.env.VITE_PLAYER_DATA_HOST;
  if (typeof override === 'string' && override.trim() !== '') {
    return override.includes('://') ? override : `https://${override}`;
  }
  const env = parseEnvironment(import.meta.env.VITE_APP_ENV);
  return `https://${HOST_BY_ENVIRONMENT[env]}`;
}

/**
 * Whether it's worth calling the backend at all.
 * For example, when we're testing locally we don't want to call the backend
 * because it puts error-spam in the console that can trip up an agent.
 */
export function isBackendConfigured(): boolean {
  const override = import.meta.env.VITE_PLAYER_DATA_HOST;
  if (typeof override === 'string' && override.trim() !== '') return true;
  // Embedded on the shelf: a bridged session is worth an identify() even in Local.
  if (resolveVaultHostOrigin() !== null) return true;
  return parseEnvironment(import.meta.env.VITE_APP_ENV) !== Environment.Local;
}
