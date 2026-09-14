import { expect, test } from '@playwright/test';

/**
 * Smoke tests: the game boots, a screen renders, and nothing crashes.
 * Run with `bun run test:e2e` (starts the dev server automatically).
 */
test.describe('smoke', () => {
  test('app loads and root is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app')).toBeVisible({ timeout: 15_000 });
  });

  test('loading completes and main content appears', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app')).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    // Start screen: DOM with h1 + Play button (no canvas). Game screen: Pixi canvas.
    await expect(
      page
        .locator('#app canvas:not([class*="tp-"])')
        .or(page.locator('#app h1'))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('embedded (?wolfHost=) boots without blanking', async ({ page }) => {
    // Invalid host exercises identity's fallback path; the app must still render, never blank.
    await page.goto('/?wolfHost=https%3A%2F%2Fexample.invalid');
    await expect(page.locator('#app')).toBeVisible({ timeout: 15_000 });
    await expect(
      page
        .locator('#app canvas:not([class*="tp-"])')
        .or(page.locator('#app h1'))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('no unhandled console errors during load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      const url = msg.location().url ?? '';
      // identity falls back when the player-data backend is unreachable/CORS-blocked;
      // its CORS + net::ERR_FAILED lines are expected.
      const isBackendUnreachable =
        text.includes('player-data') ||
        url.includes('player-data') ||
        text.includes('net::ERR_FAILED');
      if (
        !text.includes('ResizeObserver') &&
        !text.includes('favicon') &&
        !isBackendUnreachable
      ) {
        errors.push(text);
      }
    });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    expect(errors).toEqual([]);
  });
});
