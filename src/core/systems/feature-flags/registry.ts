import type { FeatureFlagConfig } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let registeredConfig: FeatureFlagConfig<any> | null = null;

/**
 * Register the feature flag config for the provider to consume.
 * Call this from game setup before the provider mounts.
 */
export function registerFlagConfig<T extends object>(config: FeatureFlagConfig<T>): void {
  registeredConfig = config;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRegisteredFlagConfig(): FeatureFlagConfig<any> | null {
  return registeredConfig;
}
