// Error severity levels
export type ErrorSeverity = 'fatal' | 'error' | 'warning';

// Error context
export interface ErrorContext {
  screen?: string;
  userId?: string;
  sessionId?: string;
  engineState?: Record<string, unknown>;
  assetState?: {
    loaded: string[];
    pending: string[];
  };
  timestamp: string;
  extra?: Record<string, unknown>;
}

// Normalized error event
export interface ErrorEvent {
  error: Error;
  context: ErrorContext;
  severity: ErrorSeverity;
  handled: boolean;
}

// Error reporter interface
export interface ErrorReporter {
  capture(error: Error, context?: Partial<ErrorContext>, severity?: ErrorSeverity): void;
  setUser(userId: string): void;
  setScreen(screen: string): void;
  addBreadcrumb(message: string, data?: Record<string, unknown>): void;
}

// Boundary fallback props
export interface BoundaryFallbackProps {
  error: Error;
  retry: () => void;
  navigate?: (screen: string) => void;
}
