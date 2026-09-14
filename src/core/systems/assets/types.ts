// Re-export manifest types from game-components (single source of truth)
export type {
  Manifest,
  Bundle as ManifestBundle,
  AssetDefinition,
  AssetType,
  BundleKind,
  LoadBundleOptions,
  LoadingState,
  BundleProgress,
  LoaderAdapter,
  LoaderType,
  OnProgress as ProgressCallback,
} from '@wolfgames/components/core';
