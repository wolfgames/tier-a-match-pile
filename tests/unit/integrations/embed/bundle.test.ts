import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadBundle } from '~/integrations/embed/bundle';

describe('loadBundle', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches config.json and game.json at <baseUrl>/<bundleId>/', async () => {
    const config = { foo: 1 };
    const game = { bar: 2 };
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      const body = url.endsWith('/config.json') ? config : game;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await loadBundle('abc', 'https://storage.test');

    expect(calls).toEqual([
      'https://storage.test/abc/config.json',
      'https://storage.test/abc/game.json',
    ]);
    expect(result).toEqual({ config, game });
  });

  it('strips trailing slash from baseUrl', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await loadBundle('abc', 'https://storage.test/');
    expect(calls[0]).toBe('https://storage.test/abc/config.json');
  });

  it('throws if either fetch fails', async () => {
    global.fetch = vi.fn(async (url: string) => {
      const status = url.endsWith('/config.json') ? 200 : 500;
      return new Response('{}', { status });
    }) as unknown as typeof fetch;

    await expect(loadBundle('abc', 'https://storage.test')).rejects.toThrow(
      /game\.json/,
    );
  });
});
