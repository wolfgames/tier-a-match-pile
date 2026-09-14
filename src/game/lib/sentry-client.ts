/**
 * The only module that imports `@sentry/browser`, and it does so statically.
 *
 * A destructure of a dynamically imported namespace is a namespace access, and
 * rollup will not shake across one — so the old inline
 * `await import('@sentry/browser')` in core/lib/sentry.ts emitted the entire
 * barrel (replay, feedback, tracing, profiling, every vendor flag adapter):
 * 455,006 bytes raw, 83% of it unused. Static named imports here keep only the
 * list below — 78,126 bytes, measured in this repo build-to-build.
 *
 * The dynamic boundary is now the `SentryClientLoader` thunk the game hands to
 * `initSentry` (see src/app.tsx: `() => import('~/game/lib/sentry-client')`),
 * not an import inside core. Core never names this module.
 *
 * So: never import `@sentry/browser` anywhere else, and never call
 * `Sentry.init()` — `init()` reaches `getDefaultIntegrations()`, which names
 * every integration in one array and re-anchors the whole barrel. A new
 * integration means a static import here plus an entry in the array below.
 */
import {
  addBreadcrumb,
  BrowserClient,
  breadcrumbsIntegration,
  captureException,
  dedupeIntegration,
  defaultStackParser,
  eventFiltersIntegration,
  functionToStringIntegration,
  getClient,
  globalHandlersIntegration,
  httpContextIntegration,
  linkedErrorsIntegration,
  makeFetchTransport,
  setContext,
  setCurrentClient,
  setUser,
  withScope,
} from '@sentry/browser';
import type { SentryApi, SentryClientOptions } from '~/core/lib/sentry';

/**
 * Build the client, bind it to the current scope, and hand back the call
 * surface. Replaces `Sentry.init()` — see the file header for why.
 */
export function createSentryClient(options: SentryClientOptions): SentryApi {
  const client = new BrowserClient({
    dsn: options.dsn,
    environment: options.environment,
    stackParser: defaultStackParser,
    transport: makeFetchTransport,
    sendDefaultPii: false,
    beforeSend: options.beforeSend,

    /* Crash reporting only — the default list for an amino game. Each
     * omission is deliberate:
     *
     *   browserTracingIntegration   pulls @sentry/browser-utils and installs
     *     fetch/xhr/history/PerformanceObserver instrumentation at init. Its
     *     page-load and navigation spans say nothing about a single-page
     *     canvas game that never navigates.
     *   browserApiErrorsIntegration wraps setTimeout, setInterval,
     *     requestAnimationFrame and addEventListener to attach stack context.
     *     That is a per-callback cost inside a 60fps GSAP loop, and
     *     globalHandlersIntegration already catches what it would report.
     *   replay / feedback / profiling  not wanted by default, and replay
     *     drags in rrweb. A game that needs one adds the static import here
     *     and an entry in this array — that is the only cost.
     */
    integrations: [
      eventFiltersIntegration(),
      functionToStringIntegration(),
      breadcrumbsIntegration(),
      globalHandlersIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
      httpContextIntegration(),
    ],
  });

  /* What `init()` did implicitly: bind the client to the current scope so the
   * top-level helpers below route to it, then let the integrations install
   * their hooks. Order matters — `init()` expects to find itself on the
   * scope. */
  setCurrentClient(client);
  client.init();

  return {
    getClient,
    withScope,
    captureException,
    setUser,
    setContext,
    addBreadcrumb,
  };
}
