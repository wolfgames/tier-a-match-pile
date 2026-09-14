/* Type-only, so this file has no runtime path — static or dynamic — to
 * `@sentry/browser`. Types are erased at build; the SDK itself is reached only
 * through the `SentryClientLoader` the game hands to `initSentry`. */
import type { ErrorEvent } from '@sentry/browser';
import { Environment } from '@wolfgames/client';

type SentryBrowser = typeof import('@sentry/browser');

/** The exact Sentry surface this module calls, and nothing more. */
export interface SentryApi {
  getClient: SentryBrowser['getClient'];
  withScope: SentryBrowser['withScope'];
  captureException: SentryBrowser['captureException'];
  setUser: SentryBrowser['setUser'];
  setContext: SentryBrowser['setContext'];
  addBreadcrumb: SentryBrowser['addBreadcrumb'];
}

export interface SentryClientOptions {
  dsn: string;
  environment: string;
  /** Runs on every outbound event; return null to drop it. */
  beforeSend: (event: ErrorEvent) => ErrorEvent | null;
}

/**
 * How this module reaches the SDK: a thunk the game supplies, which core
 * awaits inside `loadSentry`.
 *
 * It is a *loader*, not a factory, and that distinction is the whole bundle
 * win. The integration list lives in game space (`~/game/lib/sentry-client`),
 * which is where a per-game decision belongs — but if the caller imported
 * `createSentryClient` statically to pass it in, `@sentry/browser` would be
 * pulled straight back into the entry chunk and the 435KB -> 95KB split would
 * evaporate. Passing `() => import(...)` keeps the dynamic boundary intact.
 *
 * Core declares the shape; the game conforms to it. Same direction as
 * `registerFlagConfig` — and it keeps core free of any `~/game` import, which
 * biome forbids.
 */
export type SentryClientLoader = () => Promise<{
  createSentryClient: (options: SentryClientOptions) => SentryApi;
}>;

const SENTRY_DSN =
  'https://2dca8e7bdb35416abee59ca40bb0f887@o4509084313976832.ingest.us.sentry.io/4510839538384896';

interface SentryConfig {
  enabled: boolean;
  dsn: string;
  environment: Environment;
}

export interface SentryUserContext {
  userId: string;
  email?: string;
  sessionId: string;
}

type ErrorTracker = (params: {
  error_type: string;
  user_id: string;
  session_id: string;
}) => void;

/* Anything reported before the deferred load resolves. Bounded so a crash
 * loop during boot cannot grow this without limit. */
type PendingEvent =
  | { kind: 'exception'; error: Error; context?: Record<string, unknown> }
  | { kind: 'breadcrumb'; message: string; data?: Record<string, unknown> }
  | { kind: 'user'; id: string };

const PENDING_LIMIT = 50;

let api: SentryApi | null = null;
/* False until `initSentry` schedules a load. While it is false the SDK is
 * never coming — a disabled environment, or `initSentry` was never called —
 * so reports must not queue: nothing would ever drain them, and the array
 * would pin up to PENDING_LIMIT Errors for the life of the page. */
let scheduled = false;
let pending: PendingEvent[] = [];
let pendingPostHog: {
  tracker: ErrorTracker;
  userContext: SentryUserContext;
} | null = null;
let errorTracker: ErrorTracker | null = null;
let userId: string | null = null;
let sessionId: string | null = null;

function getSentryConfig(environment: Environment): SentryConfig {
  const dsn = import.meta.env.VITE_SENTRY_DSN || SENTRY_DSN;

  const enabledEnvironments: Environment[] = [
    Environment.QA,
    Environment.Staging,
    Environment.Production,
  ];
  const enabled = enabledEnvironments.includes(environment);

  return {
    enabled: enabled && Boolean(dsn),
    dsn,
    environment,
  };
}

function enqueue(event: PendingEvent): void {
  /* No load pending, so log and drop instead of queueing forever. This is the
   * dev/Development path, and it is what callers used to get from the old
   * `console.warn('[Sentry not initialized]', ...)` fallback. */
  if (!scheduled) {
    if (event.kind === 'exception') {
      console.warn('[Sentry not initialized]', event.error, event.context);
    }
    return;
  }

  if (pending.length >= PENDING_LIMIT) {
    /* Exceptions outrank breadcrumbs: drop the oldest breadcrumb to make room
     * rather than losing the crash report that follows a burst of them. */
    if (event.kind === 'exception') {
      const oldest = pending.findIndex((e) => e.kind === 'breadcrumb');
      if (oldest === -1) return;
      pending.splice(oldest, 1);
    } else {
      return;
    }
  }

  pending.push(event);
}

/* Sentry is diagnostics, not gameplay, so it has no claim on the boot window.
 * Waiting for `load` and then for an idle slot keeps its parse and init off
 * the critical path; the buffer above means errors thrown in the meantime are
 * still delivered. The 5s timeout is the escape hatch for a page that never
 * goes idle. */
function whenIdle(run: () => void): void {
  const schedule = () => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 5000 });
    } else {
      setTimeout(run, 2000);
    }
  };

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule, { once: true });
  }
}

function flushPending(): void {
  if (!api) return;

  if (pendingPostHog) {
    const { tracker, userContext } = pendingPostHog;
    pendingPostHog = null;
    connectSentryToPostHog(tracker, userContext);
  }

  const queued = pending;
  pending = [];

  for (const event of queued) {
    switch (event.kind) {
      case 'exception':
        captureException(event.error, event.context);
        break;
      case 'breadcrumb':
        addBreadcrumb(event.message, event.data);
        break;
      case 'user':
        setUser(event.id);
        break;
    }
  }
}

/* Mirrors each outbound exception into PostHog. Module-scope on purpose: the
 * BrowserClient holds this for the life of the page, and it reads only
 * module-level state — declared inside `loadSentry` it would pin that frame
 * (including the imported namespace) for the same lifetime. */
function mirrorExceptionToPostHog(event: ErrorEvent): ErrorEvent {
  if (errorTracker && userId && sessionId) {
    try {
      const hasException = !!event.exception?.values?.length;
      if (!hasException) return event;

      const errorType = event.exception!.values![0]!.type ?? 'Error';
      errorTracker({
        error_type: errorType,
        user_id: userId,
        session_id: sessionId,
      });
    } catch (trackingError) {
      console.warn('[Sentry] PostHog tracking failed:', trackingError);
    }
  }

  return event;
}

let loading = false;

async function loadSentry(
  config: SentryConfig,
  loadClient: SentryClientLoader,
): Promise<void> {
  /* Two things can schedule this — the idle callback and the visibility
   * handler — and they can both fire. Loading twice would build two clients
   * and double-send the flushed queue. */
  if (loading || api) return;
  loading = true;

  try {
    /* The dynamic boundary. `loadClient` is the game's `() => import(...)`,
     * so the SDK chunk is fetched here and nowhere else. */
    const { createSentryClient } = await loadClient();

    api = createSentryClient({
      dsn: config.dsn,
      environment: config.environment,
      beforeSend: mirrorExceptionToPostHog,
    });

    flushPending();
  } catch (error) {
    /* Released so the visibility handler can retry — a failed import is often
     * a transient network problem, and the queue is still holding events. */
    loading = false;
    console.error('[Sentry] Init failed:', error);
  }
}

/**
 * Schedule Sentry initialization.
 *
 * Returns immediately — the SDK is fetched and initialized once the page has
 * loaded and the main thread is idle. Reports made before then are buffered
 * and flushed on arrival, so callers do not need to wait on this.
 */
export function initSentry(
  environment: Environment,
  loadClient: SentryClientLoader,
): void {
  const config = getSentryConfig(environment);

  if (!config.enabled || !config.dsn) {
    console.log(
      `[Sentry] Skipped -- environment: ${environment}, enabled: ${config.enabled}`,
    );
    return;
  }

  /* Required in the signature, so a game that forgets it fails typecheck
   * rather than shipping with crash reporting quietly off. This branch only
   * catches an untyped caller passing undefined, and it is an error — we are
   * past the enabled check, so this IS a reporting environment with no way to
   * report. Deliberately not merged with the log above: "disabled by
   * environment" and "misconfigured in production" must not read alike. */
  if (!loadClient) {
    console.error(
      `[Sentry] No client loader supplied in ${environment} -- crash reporting is OFF.`,
    );
    return;
  }

  scheduled = true;

  /* A crash during boot sits in `pending` until the SDK arrives, so deferring
   * trades a window of loss for the boot time. Backgrounding the tab is the
   * cheap part of that window to close: `hidden` fires long before the tab is
   * actually discarded and the page keeps running, so pulling the load forward
   * here gets the queue sent. It does NOT reliably rescue a hard close — the
   * chunk still has to download during unload, and no listener changes that. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !api && pending.length > 0) {
      void loadSentry(config, loadClient);
    }
  });

  whenIdle(() => {
    void loadSentry(config, loadClient);
  });
}

export function isSentryEnabled(): boolean {
  return api?.getClient() !== undefined;
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>,
) {
  if (!api || !isSentryEnabled()) {
    enqueue({ kind: 'exception', error, context });
    return;
  }

  api.withScope((scope) => {
    if (context) {
      scope.setContext('additional_info', context);
    }
    api!.captureException(error);
  });
}

export function setUser(id: string) {
  if (!api || !isSentryEnabled()) {
    enqueue({ kind: 'user', id });
    return;
  }
  api.setUser({ id });
}

export function addBreadcrumb(message: string, data?: Record<string, unknown>) {
  if (!api || !isSentryEnabled()) {
    enqueue({ kind: 'breadcrumb', message, data });
    return;
  }
  api.addBreadcrumb({
    message,
    data,
    level: 'info',
  });
}

/**
 * Connect PostHog tracker to Sentry.
 *
 * An unwired seam: nothing calls this. Grepping `src/` and
 * `node_modules/@wolfgames` turns up no caller here and none in
 * game-amino-sort either, and there is no `AnalyticsContext` in either repo —
 * an earlier version of this comment claimed there was. Left in place because
 * the plumbing it feeds (`beforeSend` → `errorTracker`) is real and wired; it
 * just has nobody handing it a tracker yet.
 *
 * Whoever wires it: analytics is ready well before the deferred Sentry load,
 * so the context is held in `pendingPostHog` and applied when the SDK arrives.
 */
export function connectSentryToPostHog(
  tracker: ErrorTracker,
  userContext: SentryUserContext,
): void {
  errorTracker = tracker;
  userId = userContext.userId;
  sessionId = userContext.sessionId;

  if (!api || !isSentryEnabled()) {
    pendingPostHog = { tracker, userContext };
    return;
  }

  api.setUser({
    id: userContext.userId,
    email: userContext.email || undefined,
  });

  api.setContext('session', {
    session_id: userContext.sessionId,
  });
}
