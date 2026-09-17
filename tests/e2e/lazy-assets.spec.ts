// Asset oracle (C1âC5): CDN-only, lazy per screen, no 404s, no raw png/wav. Real Chrome.
import { expect, test } from '@playwright/test';
import { assetSeed } from '../../assets/registry';

test.use({ channel: 'chrome', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

const media = /\.(png|webp|jpg|jpeg|gif|svg|json|mp3|webm|ogg|m4a|wav|woff2?)(\?|$)/i;
const cdnHost = new URL(Object.values(assetSeed.files)[0] as string).host;

test('lazy loading per screen boundary, CDN only, compressed only, zero failures', async ({ page }) => {
  const reqs: { url: string; when: string; status?: number }[] = [];
  let phase = 'boot';
  page.on('request', (r) => { if (media.test(r.url())) reqs.push({ url: r.url(), when: phase }); });
  page.on('response', (r) => { const q = reqs.find((x) => x.url === r.url() && x.status === undefined); if (q) q.status = r.status(); });

  await page.goto('/');
  await page.getByRole('button', { name: /play/i }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const bootReqs = reqs.filter((r) => r.when === 'boot');

  phase = 'game';
  await page.getByRole('button', { name: /play/i }).click();
  await page.waitForFunction(() => typeof window.__GAME_DEBUG__?.ui === 'function', null, { timeout: 20_000 });
  await page.waitForTimeout(1_000);
  const gameReqs = reqs.filter((r) => r.when === 'game');

  phase = 'results';
  await page.evaluate(() => window.__GAME_DEBUG__!.solve());
  await page.locator('[data-feel="score"]').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1_500);
  const resultsReqs = reqs.filter((r) => r.when === 'results');

  // C1 no failures
  expect(reqs.filter((r) => r.status && r.status >= 400).map((r) => r.url)).toEqual([]);
  // C2 CDN only (boot chrome in /public is the one allowed local set)
  for (const r of reqs) expect(new URL(r.url).host === cdnHost || r.url.includes('/assets/boot-'), `non-CDN ${r.url}`).toBe(true);
  // C3 compressed formats only
  for (const r of reqs) expect(r.url, `uncompressed ${r.url}`).not.toMatch(/\.(png|jpe?g|wav)(\?|$)/i);
  // C4 lazy: game scene assets are not fetched at boot; results-only assets not before results
  expect(bootReqs.filter((r) => /scene-game|atlas-board|sfx-game/.test(r.url))).toEqual([]);
  expect([...bootReqs, ...gameReqs].filter((r) => /scene-results|fx-celebrat/.test(r.url))).toEqual([]);
  expect(gameReqs.length + resultsReqs.length, 'game/results bundles actually load').toBeGreaterThan(0);
  // C5 no duplicate fetch of the same URL
  const urls = reqs.map((r) => r.url);
  expect(new Set(urls).size).toBe(urls.length);
});
