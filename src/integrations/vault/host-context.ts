/**
 * Generic Vault host/session metadata — partner/site/vault id, config version,
 * cohort, anonymous + distinct id — snapshotted from the latest context.
 * Analytics attribution only; never game content state, and never an
 * entitlement signal (the underlying context is unauthenticated).
 */

export type { VaultHostFields } from '@wolfgames/client';
export { latestVaultContext, vaultHostFields } from '@wolfgames/client';
