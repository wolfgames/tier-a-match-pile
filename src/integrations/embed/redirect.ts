export interface EmbedOutcome {
  score: number;
  correct: 0 | 1;
  hookId: string;
}

export function buildOutcomeUrl(clickUrl: string, outcome: EmbedOutcome): string {
  const url = new URL(clickUrl);
  url.searchParams.set('score', String(outcome.score));
  url.searchParams.set('c', String(outcome.correct));
  url.searchParams.set('hookId', outcome.hookId);
  return url.toString();
}

export function redirectWithOutcome(clickUrl: string, outcome: EmbedOutcome): void {
  const target = buildOutcomeUrl(clickUrl, outcome);
  if (typeof window === 'undefined') return;
  // top-level navigation so SafeFrame hosts unwind the iframe
  (window.top ?? window).location.href = target;
}
