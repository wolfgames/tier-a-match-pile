import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/** webServer's cwd defaults to this config's own directory, which has no index.html. */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * E2E config.
 *
 * webServer: `nucleo dev` (what `bun run dev` runs) REJECTS `--strictPort`, so the suite serves
 * a *built* bundle with `vite preview` instead. That is also the honest target: the ui-contract
 * and lazy-assets specs assert lazy bundle loading and CDN paths, which only behave like
 * production after a real build. `--strictPort` is safe on preview, so a stale server on the
 * port fails loudly instead of serving the wrong app.
 *
 * `channel: 'chrome'` + `--autoplay-policy=no-user-gesture-required` are mandatory: bundled
 * Chromium has no MP3 decoder and Howler hangs waiting for it (docs/guides/troubleshooting.md).
 */
const port = Number(process.env.E2E_PORT ?? 5199);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL,
    channel: 'chrome',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    // The gate builds once and sets TIER_A_PREBUILT; a lone run still builds for itself.
    command: `${process.env.TIER_A_PREBUILT ? '' : 'bunx vite build && '}bunx vite preview --port ${port} --strictPort`,
    cwd: repoRoot,
    url: baseURL,
    // never reuse: a stale preview from another game on the port makes the suite test the wrong game
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
