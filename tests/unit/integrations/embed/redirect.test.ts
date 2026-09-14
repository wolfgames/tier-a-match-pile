import { describe, it, expect } from 'vitest';
import { buildOutcomeUrl } from '~/integrations/embed/redirect';

describe('buildOutcomeUrl', () => {
  it('appends score, c, hookId as query params', () => {
    const url = buildOutcomeUrl('https://x.test/r', {
      score: 42,
      correct: 1,
      hookId: 'h1',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('score')).toBe('42');
    expect(parsed.searchParams.get('c')).toBe('1');
    expect(parsed.searchParams.get('hookId')).toBe('h1');
  });

  it('preserves existing query params on clickUrl', () => {
    const url = buildOutcomeUrl('https://x.test/r?existing=1', {
      score: 0,
      correct: 0,
      hookId: 'h2',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('existing')).toBe('1');
    expect(parsed.searchParams.get('score')).toBe('0');
  });

  it('handles clickUrl with trailing "?"', () => {
    const url = buildOutcomeUrl('https://x.test/r?', {
      score: 1,
      correct: 1,
      hookId: 'h1',
    });
    expect(url).toContain('score=1');
    expect(url).toContain('c=1');
    expect(url).toContain('hookId=h1');
  });
});
