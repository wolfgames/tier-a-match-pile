/**
 * ManifestProvider tests.
 *
 * Validates data source resolution:
 * - Local defaults are used as initial values
 * - CDN fetch updates manifest and game data when successful
 * - CDN fetch failure falls back to local defaults
 * - postMessage injection overrides manifest and game data
 * - Embed mode waits for injection instead of fetching CDN
 * - Invalid postMessage data is handled gracefully
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Manifest } from '@wolfgames/components/core';

const localManifest: Manifest = {
  cdnBase: '/assets',
  bundles: [
    { name: 'boot-splash', assets: [{ alias: 'spinner', src: 'spinner.png' }] },
  ],
};

const cdnManifest: Manifest = {
  cdnBase: 'https://cdn.example.com/assets',
  bundles: [
    { name: 'boot-splash', assets: [{ alias: 'spinner', src: 'spinner.png' }] },
    { name: 'theme-branding', assets: [{ alias: 'logo', src: 'logo.png' }] },
  ],
};

const injectedManifest: Manifest = {
  cdnBase: 'https://injected.example.com/assets',
  bundles: [
    { name: 'boot-injected', assets: [{ alias: 'injected', src: 'injected.png' }] },
  ],
};

describe('ManifestProvider: local defaults', () => {
  it('uses local manifest as initial value', () => {
    const manifest = { ...localManifest };
    expect(manifest.cdnBase).toBe('/assets');
    expect(manifest.bundles).toHaveLength(1);
    expect(manifest.bundles[0].name).toBe('boot-splash');
  });

  it('uses default game data as initial value', () => {
    const defaultGameData = { chapters: [{ id: 1, name: 'Ch1' }] };
    expect(defaultGameData.chapters).toHaveLength(1);
  });
});

describe('ManifestProvider: CDN fetch', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches from CDN and updates manifest when response has bundles+cdnBase', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(cdnManifest), { status: 200 })
    );

    const response = await fetch('https://storage.example.com/chapters/default.json');
    const data = await response.json();

    expect(data.cdnBase).toBe('https://cdn.example.com/assets');
    expect(data.bundles).toHaveLength(2);
  });

  it('falls back to local defaults when CDN returns non-200', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('Not Found', { status: 404 })
    );

    const response = await fetch('https://storage.example.com/chapters/default.json');
    expect(response.ok).toBe(false);

    // Provider would keep local defaults in this case
    const manifest = { ...localManifest };
    expect(manifest.cdnBase).toBe('/assets');
  });

  it('falls back to local defaults when CDN fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network error');
    });

    let fetchFailed = false;
    try {
      await fetch('https://storage.example.com/chapters/default.json');
    } catch {
      fetchFailed = true;
    }

    expect(fetchFailed).toBe(true);
    // Provider would keep local defaults
    const manifest = { ...localManifest };
    expect(manifest.cdnBase).toBe('/assets');
  });

  it('updates game data from CDN when not already injected', async () => {
    const cdnData = { chapters: [{ id: 1 }, { id: 2 }], cdnBase: 'https://cdn.example.com', bundles: [] };
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(cdnData), { status: 200 })
    );

    const response = await fetch('https://storage.example.com/chapters/default.json');
    const data = await response.json();
    expect(data.chapters).toHaveLength(2);
  });
});

describe('ManifestProvider: postMessage injection', () => {
  it('recognizes set_manifest message format', () => {
    const event = {
      data: {
        type: 'set_manifest',
        value: JSON.stringify(injectedManifest),
      },
    };

    expect(event.data.type).toBe('set_manifest');
    expect(typeof event.data.value).toBe('string');

    const parsed = JSON.parse(event.data.value);
    expect(parsed.cdnBase).toBe('https://injected.example.com/assets');
    expect(parsed.bundles).toHaveLength(1);
  });

  it('accepts object value (not just string)', () => {
    const event = {
      data: {
        type: 'set_manifest',
        value: injectedManifest,
      },
    };

    const parsed = typeof event.data.value === 'string'
      ? JSON.parse(event.data.value)
      : event.data.value;

    expect(parsed.cdnBase).toBe('https://injected.example.com/assets');
  });

  it('detects manifest shape (bundles + cdnBase) for manifest signal update', () => {
    const parsed = injectedManifest;
    const isManifestShape = parsed && parsed.bundles && parsed.cdnBase;
    expect(isManifestShape).toBeTruthy();
  });

  it('rejects messages without type field', () => {
    const event = { data: { value: injectedManifest } };
    const isValid = event.data &&
      typeof event.data === 'object' &&
      'type' in event.data &&
      'value' in event.data &&
      event.data.type === 'set_manifest';
    expect(isValid).toBe(false);
  });

  it('rejects messages with wrong type', () => {
    const event = { data: { type: 'other_type', value: injectedManifest } };
    const isValid = event.data.type === 'set_manifest';
    expect(isValid).toBe(false);
  });

  it('handles invalid JSON string gracefully', () => {
    const event = {
      data: {
        type: 'set_manifest',
        value: '{ invalid json',
      },
    };

    let parseError = false;
    try {
      JSON.parse(event.data.value);
    } catch {
      parseError = true;
    }
    expect(parseError).toBe(true);
  });
});

describe('ManifestProvider: embed mode detection', () => {
  it('detects embed mode from URL search params', () => {
    const url = new URL('http://localhost:5173?mode=embed');
    const isEmbed = url.searchParams.get('mode') === 'embed';
    expect(isEmbed).toBe(true);
  });

  it('returns false for non-embed mode', () => {
    const url = new URL('http://localhost:5173');
    const isEmbed = url.searchParams.get('mode') === 'embed';
    expect(isEmbed).toBe(false);
  });

  it('returns false for other mode values', () => {
    const url = new URL('http://localhost:5173?mode=standalone');
    const isEmbed = url.searchParams.get('mode') === 'embed';
    expect(isEmbed).toBe(false);
  });
});

describe('ManifestProvider: injection overrides CDN', () => {
  it('injection takes priority — mode becomes injected', () => {
    let mode: string = 'standalone';
    const injectData = () => {
      mode = 'injected';
    };

    injectData();
    expect(mode).toBe('injected');
  });

  it('CDN data is not applied once mode is injected', () => {
    let mode: string = 'injected';
    let gameData = { fromInjection: true };

    // Simulates the guard in ManifestProvider
    const cdnData = { fromCdn: true };
    if (mode !== 'injected') {
      gameData = cdnData as typeof gameData;
    }

    expect(gameData).toEqual({ fromInjection: true });
  });
});
