import { captureException, setUser as setSentryUser, addBreadcrumb as addSentryBreadcrumb } from '../../lib/sentry';
import type { ErrorContext, ErrorSeverity, ErrorReporter } from './types';

// Dedupe rapid-fire errors
const recentErrors = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5000;

function getErrorKey(error: Error): string {
  return `${error.name}:${error.message}`;
}

function shouldReport(error: Error): boolean {
  const key = getErrorKey(error);
  const lastSeen = recentErrors.get(key);
  const now = Date.now();

  if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
    return false;
  }

  recentErrors.set(key, now);

  // Clean old entries
  for (const [k, time] of recentErrors) {
    if (now - time > DEDUPE_WINDOW_MS) {
      recentErrors.delete(k);
    }
  }

  return true;
}

// Current context state
let currentScreen = 'unknown';
let currentUserId: string | undefined;
let sessionId = crypto.randomUUID();

function buildContext(partial?: Partial<ErrorContext>): ErrorContext {
  return {
    screen: currentScreen,
    userId: currentUserId,
    sessionId,
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

export const errorReporter: ErrorReporter = {
  capture(error: Error, context?: Partial<ErrorContext>, severity: ErrorSeverity = 'error') {
    if (!shouldReport(error)) return;

    const fullContext = buildContext(context);

    // Console in dev
    if (import.meta.env.DEV) {
      console.error(`[${severity.toUpperCase()}]`, error, fullContext);
    }

    // Sentry for stack traces and crash reporting
    captureException(error, {
      ...fullContext,
      severity,
    });
  },

  setUser(userId: string) {
    currentUserId = userId;
    setSentryUser(userId);
  },

  setScreen(screen: string) {
    currentScreen = screen;
    addSentryBreadcrumb(`Screen: ${screen}`);
  },

  addBreadcrumb(message: string, data?: Record<string, unknown>) {
    addSentryBreadcrumb(message, data);
  },
};

// Global error handlers
export function setupGlobalErrorHandlers() {
  // Unhandled exceptions
  window.addEventListener('error', (event) => {
    errorReporter.capture(
      event.error ?? new Error(event.message),
      { extra: { filename: event.filename, lineno: event.lineno } },
      'fatal'
    );
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));

    errorReporter.capture(error, {}, 'error');
  });
}
