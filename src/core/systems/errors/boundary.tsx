import { ErrorBoundary as SolidErrorBoundary, type ParentProps } from 'solid-js';
import { useGameTracking } from '~/game/setup/tracking';
import { errorReporter } from './reporter';
import type { ErrorSeverity } from './types';

interface BoundaryProps extends ParentProps {
  fallback: (err: Error, reset: () => void) => JSX.Element;
  onError?: (error: Error) => void;
  severity?: ErrorSeverity;
  name?: string;
}

export function Boundary(props: BoundaryProps) {
  const { trackError } = useGameTracking();

  const handleError = (error: Error, reset: () => void) => {
    errorReporter.capture(
      error,
      { extra: { boundary: props.name ?? 'unknown' } },
      props.severity ?? 'error'
    );

    trackError({
      error_type: error.name,
      user_id: 'anonymous',
      session_id: '',
    });

    props.onError?.(error);

    return props.fallback(error, reset);
  };

  return (
    <SolidErrorBoundary fallback={handleError}>
      {props.children}
    </SolidErrorBoundary>
  );
}

// Pre-configured boundary types
export function GlobalBoundary(props: ParentProps) {
  return (
    <Boundary
      name="global"
      severity="fatal"
      fallback={(error, reset) => (
        <div class="fixed inset-0 flex items-center justify-center bg-black text-white p-8">
          <div class="text-center max-w-md">
            <h1 class="text-2xl font-bold mb-4">Something went wrong</h1>
            <p class="text-gray-400 mb-6">
              We've been notified and are looking into it.
            </p>
            <button
              onClick={() => window.location.reload()}
              class="px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Reload Game
            </button>
            <p class="text-xs text-gray-600 mt-4">
              Error ID: {crypto.randomUUID().slice(0, 8)}
            </p>
          </div>
        </div>
      )}
    >
      {props.children}
    </Boundary>
  );
}

interface ScreenBoundaryProps extends ParentProps {
  onNavigate?: () => void;
}

export function ScreenBoundary(props: ScreenBoundaryProps) {
  return (
    <Boundary
      name="screen"
      severity="error"
      fallback={(error, reset) => (
        <div class="fixed inset-0 flex items-center justify-center bg-black/90 text-white p-8">
          <div class="text-center max-w-md">
            <h1 class="text-xl font-bold mb-4">Oops! Something went wrong</h1>
            <p class="text-gray-400 mb-6">
              Don't worry, your progress is safe.
            </p>
            <div class="flex gap-4 justify-center">
              <button
                onClick={reset}
                class="px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Try Again
              </button>
              {props.onNavigate && (
                <button
                  onClick={props.onNavigate}
                  class="px-6 py-3 bg-transparent border border-white rounded-lg font-medium hover:bg-white/10 transition-colors"
                >
                  Back to Menu
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    >
      {props.children}
    </Boundary>
  );
}

interface AssetBoundaryProps extends ParentProps {
  onRetry?: () => void;
  onSkip?: () => void;
}

export function AssetBoundary(props: AssetBoundaryProps) {
  return (
    <Boundary
      name="asset"
      severity="warning"
      fallback={(error, reset) => (
        <div class="fixed inset-0 flex items-center justify-center bg-black/80 text-white p-8">
          <div class="text-center max-w-md">
            <h1 class="text-lg font-bold mb-4">Having trouble loading...</h1>
            <p class="text-gray-400 mb-6">
              Check your connection and try again.
            </p>
            <div class="flex gap-4 justify-center">
              <button
                onClick={() => {
                  props.onRetry?.();
                  reset();
                }}
                class="px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Retry
              </button>
              {props.onSkip && (
                <button
                  onClick={props.onSkip}
                  class="px-6 py-3 bg-transparent border border-white rounded-lg font-medium hover:bg-white/10 transition-colors"
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    >
      {props.children}
    </Boundary>
  );
}
