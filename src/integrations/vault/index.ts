export { VaultHostBridge, type VaultHostBridgeProps } from './host-bridge';
export {
  latestVaultContext,
  vaultHostFields,
  type VaultHostFields,
} from './host-context';

// SDK content/lifecycle primitives a game-specific consumer needs, alongside
// the <VaultHostBridge> onContext / catalog props.
export {
  inVault,
  reportContentCompleted,
  reportGameCompleted,
} from '@wolfgames/client';
export type {
  ScheduledContentMetadata,
  VaultGameContext,
} from '@wolfgames/client';
