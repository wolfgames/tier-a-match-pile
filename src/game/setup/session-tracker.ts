import type { BaseAnalyticsService } from '@wolfgames/components/core';
import {
  sessionEndSchema,
  sessionPauseSchema,
  sessionResumeSchema,
  sessionStartSchema,
} from './events';

/**
 * Wires session lifecycle events to the document visibility API and beforeunload.
 * Call once at app mount. Returns a cleanup function.
 *
 * Fires automatically:
 * - session_start: once on init
 * - session_pause: when tab is hidden
 * - session_resume: when tab becomes visible again
 * - session_end: when user leaves the page
 */
export function createSessionTracker(
  service: BaseAnalyticsService,
  initialScreen: string,
): () => void {
  const trackSessionStart = service.createTracker(
    'session_start',
    sessionStartSchema,
    ['base'],
    {},
  );
  const trackSessionPause = service.createTracker(
    'session_pause',
    sessionPauseSchema,
    ['base'],
    {},
  );
  const trackSessionResume = service.createTracker(
    'session_resume',
    sessionResumeSchema,
    ['base'],
    {},
  );
  const trackSessionEnd = service.createTracker(
    'session_end',
    sessionEndSchema,
    ['base'],
    {},
  );

  let pausedAt: number | null = null;

  // Fire session_start immediately
  trackSessionStart({ entry_screen: initialScreen });

  const handleVisibilityChange = () => {
    if (document.hidden) {
      pausedAt = Date.now();
      trackSessionPause({ pause_reason: 'tab_hidden' });
    } else if (pausedAt !== null) {
      const pauseDuration = parseFloat(
        ((Date.now() - pausedAt) / 1000).toFixed(2),
      );
      trackSessionResume({
        resume_reason: 'tab_visible',
        pause_duration: pauseDuration,
      });
      pausedAt = null;
    }
  };

  const handleBeforeUnload = () => {
    trackSessionEnd({ session_end_reason: 'user_close' });
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}
