import type {
  BaseAnalyticsService,
  LoadingState,
  Signal,
} from '@wolfgames/components/core';
import {
  loadingAbandonSchema,
  loadingCompleteSchema,
  loadingStartSchema,
} from './events';

/**
 * Subscribes to the asset coordinator's loadingState signal and fires
 * loading_start, loading_complete, and loading_abandon events automatically.
 *
 * Returns an unsubscribe function.
 */
export function createLoadingTracker(
  service: BaseAnalyticsService,
  loadingStateSignal: Signal<LoadingState>,
): () => void {
  const trackLoadingStart = service.createTracker(
    'loading_start',
    loadingStartSchema,
    ['base'],
    {},
  );
  const trackLoadingComplete = service.createTracker(
    'loading_complete',
    loadingCompleteSchema,
    ['base'],
    {},
  );
  const trackLoadingAbandon = service.createTracker(
    'loading_abandon',
    loadingAbandonSchema,
    ['base'],
    {},
  );

  const tracked = new Map<string, number>(); // bundle name → start timestamp
  let prevLoaded = new Set<string>();
  let prevErrors = new Set<string>();

  const unsubscribe = loadingStateSignal.subscribe((state) => {
    const allLoading = [...state.loading, ...state.backgroundLoading];

    // Detect loading_start — new bundles entering loading state
    for (const name of allLoading) {
      if (!tracked.has(name)) {
        tracked.set(name, Date.now());
        trackLoadingStart({ asset_count: allLoading.length });
      }
    }

    // Detect loading_complete — bundles that moved to loaded
    for (const name of state.loaded) {
      if (!prevLoaded.has(name) && tracked.has(name)) {
        const startTime = tracked.get(name)!;
        const duration = parseFloat(
          ((Date.now() - startTime) / 1000).toFixed(2),
        );
        trackLoadingComplete({
          asset_count: state.loaded.length,
          load_duration: duration,
        });
        tracked.delete(name);
      }
    }

    // Detect loading_abandon — bundles that errored
    for (const name of Object.keys(state.errors)) {
      if (!prevErrors.has(name) && tracked.has(name)) {
        const startTime = tracked.get(name)!;
        const duration = parseFloat(
          ((Date.now() - startTime) / 1000).toFixed(2),
        );
        trackLoadingAbandon({
          assets_loaded: state.loaded.length,
          assets_total:
            state.loaded.length +
            allLoading.length +
            Object.keys(state.errors).length,
          load_duration: duration,
        });
        tracked.delete(name);
      }
    }

    prevLoaded = new Set(state.loaded);
    prevErrors = new Set(Object.keys(state.errors));
  });

  return unsubscribe;
}
