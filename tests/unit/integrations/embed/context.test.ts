import { describe, it, expect } from 'vitest';
import { parseEmbedContext } from '~/integrations/embed/context';

describe('parseEmbedContext', () => {
  it('returns standalone when no search params present', () => {
    const ctx = parseEmbedContext('');
    expect(ctx.mode).toBe('standalone');
    expect(ctx.bundleId).toBeNull();
    expect(ctx.hookId).toBeNull();
    expect(ctx.clickUrl).toBeNull();
  });

  it('returns standalone when mode is missing or not "embedded"', () => {
    const ctx = parseEmbedContext('?bundleId=abc&hookId=h1');
    expect(ctx.mode).toBe('standalone');
  });

  it('returns embedded with all params when mode=embedded', () => {
    const ctx = parseEmbedContext(
      '?mode=embedded&bundleId=abc&hookId=h1&clickUrl=https://x.test/r?',
    );
    expect(ctx.mode).toBe('embedded');
    expect(ctx.bundleId).toBe('abc');
    expect(ctx.hookId).toBe('h1');
    expect(ctx.clickUrl).toBe('https://x.test/r?');
  });

  it('treats macro-style unresolved clickUrl as null', () => {
    const ctx = parseEmbedContext(
      '?mode=embedded&bundleId=abc&hookId=h1&clickUrl=%25%25CLICK_URL%25%25',
    );
    expect(ctx.clickUrl).toBeNull();
  });
});
