// Tier A contract â browser half (U1 U3 U4 U4b U5 U6 U7 U8 U9 incl. wireframe placement, U9b U12 N2 N5 N6 N8 N9). Runs on real Chrome.
//   bunx playwright test --config tests/e2e/playwright.config.ts tests/e2e/ui-contract.spec.ts
import { chromium, expect, type Page, test } from '@playwright/test';
// Node ESM requires the attribute for a JSON module; Playwright runs this file through Node.
import tokens from '../../src/game/match-pile/brand.tokens.json' with { type: 'json' };

test.use({ channel: 'chrome', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

type Rect = { x: number; y: number; w: number; h: number };
type Node = { label: string; role: string; visible: boolean; interactive: boolean; bounds: Rect; colors: string[]; shadow: string | null; text: boolean; parent: (Rect & { radius: number }) | null; overflow: boolean };
type Probe = { viewport: { w: number; h: number }; safeBottom: number; nodes: Node[] };
type Dbg = {
  feel(): { legendVisible: boolean; hintVisible: boolean; hintEnabled: boolean; levelIndex: number; phase: string; theme: string; lastFx: { event: string; targetLabel: string; t: number } | null; lastSubmitT: number | null; ftueTarget: string | null; ftueCopy: string | null };
  ui(): Probe;
  loadLevel(n: number): void; solve(): void; fail(): void; setTheme(t: 'light' | 'dark'): void;
  /** play one correct move through the real input path; returns the label of the acted-on element */
  playCorrectMove(): Promise<string>;
};
declare global { interface Window { __GAME_DEBUG__?: Dbg } }

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 430, height: 727 }, { width: 1280, height: 800 }];
const SLOTS = ['slot-settings', 'slot-brand', 'slot-profile', 'slot-partner', 'slot-game-type', 'slot-sub-type', 'slot-challenge', 'slot-score',
  'slot-info', 'slot-board', 'slot-legend', 'slot-powerups', 'slot-action', 'slot-partner-banner'];
/** U9 vertical spine (one slot per row) and the two meta columns. */
const SPINE = ['slot-partner', 'slot-info', 'slot-board', 'slot-legend', 'slot-powerups', 'slot-action', 'slot-partner-banner'];
const LEFT_COL = ['slot-partner', 'slot-game-type', 'slot-sub-type'];
const RIGHT_COL = ['slot-challenge', 'slot-score'];
const ACCENT_OK = new Set(['cta', 'selected', 'active', 'celebration']);

const enter = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: /play/i }).click({ timeout: 20_000 });
  await page.waitForFunction(() => typeof window.__GAME_DEBUG__?.ui === 'function', null, { timeout: 20_000 });
  await page.waitForTimeout(800);
};
const feel = (p: Page) => p.evaluate(() => window.__GAME_DEBUG__!.feel());
const ui = (p: Page) => p.evaluate(() => window.__GAME_DEBUG__!.ui());
const sample = async <T>(p: Page, fn: () => T, total: number, step = 100) => {
  const out: T[] = [];
  for (let t = 0; t < total; t += step) { out.push(await p.evaluate(fn)); await p.waitForTimeout(step); }
  return out;
};
const overlaps = (a: Node, b: Node) =>
  a.bounds.x < b.bounds.x + b.bounds.w && b.bounds.x < a.bounds.x + a.bounds.w &&
  a.bounds.y < b.bounds.y + b.bounds.h && b.bounds.y < a.bounds.y + a.bounds.h;

test('U1 â legend visible during play, board-wide', async ({ page }) => {
  await enter(page);
  expect((await feel(page)).legendVisible).toBe(true);
  const u = await ui(page);
  const legend = u.nodes.find((n) => n.label === 'slot-legend')!;
  const board = u.nodes.find((n) => n.label === 'slot-board')!;
  expect(legend.visible).toBe(true);
  expect(legend.bounds.w).toBeGreaterThanOrEqual(board.bounds.w * 0.9);
});

test('U3 / U4 â hint hidden on FTUE, present and enabled after', async ({ page }) => {
  await enter(page);
  const f = await feel(page);
  expect(f.levelIndex).toBe(1);
  expect(f.hintVisible).toBe(false);
  await page.evaluate(() => window.__GAME_DEBUG__!.loadLevel(4));
  await page.waitForTimeout(300);
  const r = await feel(page);
  expect(r.hintVisible && r.hintEnabled).toBe(true);
  expect((await ui(page)).nodes.find((n) => n.label === 'hint')?.visible).toBe(true);
});

test('U8 â a correct move is celebrated at its element within 120 ms of submit', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => window.__GAME_DEBUG__!.loadLevel(4));
  const target = await page.evaluate(() => window.__GAME_DEBUG__!.playCorrectMove());
  await page.waitForTimeout(200);
  const f = await feel(page);
  expect(f.lastFx?.event).toMatch(/correct|partial|win/);
  expect(f.lastFx?.targetLabel).toBe(target);
  expect(f.lastFx!.t - f.lastSubmitT!).toBeLessThanOrEqual(120);
});

for (const vp of VIEWPORTS) {
  test(`U9 â layout slots in order, contained, no overlap, 44px targets @${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await enter(page);
    await page.evaluate(() => window.__GAME_DEBUG__!.loadLevel(4));
    await page.waitForTimeout(400);
    const u = await ui(page);
    const by = Object.fromEntries(u.nodes.map((n) => [n.label, n]));
    for (const s of SLOTS) expect(by[s]?.visible && by[s].bounds.h > 0 && by[s].bounds.w > 0, `${s} missing or collapsed`).toBe(true);
    const asc = (ids: string[], what: string) => { const ys = ids.map((s) => by[s].bounds.y); expect([...ys].sort((a, b) => a - b), what).toEqual(ys); };
    asc(SPINE, 'spine order'); asc(LEFT_COL, 'left column order'); asc(RIGHT_COL, 'right column order');
    // U9 horizontal placement (wireframe): column = the 430px-max centred layout column.
    const board = by['slot-board'].bounds; const colX = board.x; const vw = board.w; const cx = (b: { x: number; w: number }) => b.x + b.w / 2 - colX;
    const L = (s: string) => by[s].bounds.x - colX; const R = (s: string) => by[s].bounds.x + by[s].bounds.w - colX;
    expect(L('slot-settings'), 'settings left').toBeLessThanOrEqual(0.08 * vw);
    expect(Math.abs(cx(by['slot-brand'].bounds) - vw / 2), 'brand centred').toBeLessThanOrEqual(0.06 * vw);
    expect(by['slot-brand'].bounds.w, 'brand width').toBeGreaterThanOrEqual(0.3 * vw);
    expect(R('slot-profile'), 'profile right').toBeGreaterThanOrEqual(0.92 * vw);
    expect(Math.abs(by['slot-settings'].bounds.y - by['slot-profile'].bounds.y), 'head row aligned').toBeLessThanOrEqual(8);
    for (const s of LEFT_COL) { expect(L(s), `${s} left col`).toBeLessThanOrEqual(0.08 * vw); expect(R(s), `${s} left col right edge`).toBeLessThanOrEqual(0.66 * vw); }
    for (const s of RIGHT_COL) { expect(L(s), `${s} right col`).toBeGreaterThanOrEqual(0.62 * vw); expect(R(s), `${s} right col right edge`).toBeGreaterThanOrEqual(0.92 * vw); }
    expect(by['slot-partner'].bounds.y, 'meta below head').toBeGreaterThanOrEqual(by['slot-settings'].bounds.y + by['slot-settings'].bounds.h - 1);
    expect(by['slot-challenge'].bounds.y, 'challenge in meta band').toBeGreaterThanOrEqual(by['slot-partner'].bounds.y - 4);
    expect(by['slot-challenge'].bounds.y, 'challenge in meta band').toBeLessThanOrEqual(by['slot-sub-type'].bounds.y + by['slot-sub-type'].bounds.h);
    for (const s of ['slot-info', 'slot-board', 'slot-legend', 'slot-powerups', 'slot-partner-banner']) expect(by[s].bounds.w, `${s} full width`).toBeGreaterThanOrEqual(0.9 * vw);
    expect(by['slot-info'].bounds.y, 'info below meta').toBeGreaterThanOrEqual(Math.max(by['slot-sub-type'].bounds.y + by['slot-sub-type'].bounds.h, by['slot-score'].bounds.y + by['slot-score'].bounds.h) - 1);
    expect(by['slot-action'].bounds.w, 'action narrower').toBeLessThanOrEqual(0.8 * vw);
    expect(Math.abs(cx(by['slot-action'].bounds) - vw / 2), 'action centred').toBeLessThanOrEqual(0.06 * vw);
    for (const n of u.nodes.filter((n) => n.visible && (n.role === 'slot' || n.interactive))) {
      expect(n.bounds.x, `${n.label} left`).toBeGreaterThanOrEqual(-1);
      expect(n.bounds.y, `${n.label} top`).toBeGreaterThanOrEqual(-1);
      expect(n.bounds.x + n.bounds.w, `${n.label} right`).toBeLessThanOrEqual(u.viewport.w + 1);
      expect(n.bounds.y + n.bounds.h, `${n.label} bottom`).toBeLessThanOrEqual(u.viewport.h - u.safeBottom + 1);
    }
    const inter = u.nodes.filter((n) => n.visible && n.interactive && n.role !== 'tile');
    for (const n of inter) expect(Math.min(n.bounds.w, n.bounds.h), `${n.label} tap target`).toBeGreaterThanOrEqual(44);
    for (let i = 0; i < inter.length; i++) for (let j = i + 1; j < inter.length; j++)
      expect(overlaps(inter[i], inter[j]), `${inter[i].label} overlaps ${inter[j].label}`).toBe(false);
    expect(u.nodes.filter((n) => n.interactive && n.role === 'other'), 'unlabelled interactive node').toEqual([]);
  });
}

test('N2 / N5 â accent only on cta/selected/active/celebration, never as a cta shadow; watermark background on game', async ({ page }) => {
  await enter(page);
  const accent = tokens.light.accent.toLowerCase();
  const u = await ui(page);
  for (const n of u.nodes.filter((n) => n.colors.includes(accent))) expect(ACCENT_OK.has(n.role), `${n.label} (${n.role}) uses accent`).toBe(true);
  for (const n of u.nodes.filter((n) => n.role === 'cta' && n.visible)) expect(n.shadow, `${n.label} shadow`).not.toBe('accent-glow');
  expect(u.nodes.find((n) => n.label === 'watermark')?.visible).toBe(true);
});

/** U9b / N10 â no text escapes its rounded container. Runs on start, game and results. */
const textFits = (u: Probe, where: string) => {
  for (const n of u.nodes.filter((n) => n.visible && n.text && n.parent)) {
    const p = n.parent!; const inset = p.radius * 0.3;
    expect(n.overflow, `${where}: ${n.label} overflows (DOM scroll box)`).toBe(false);
    expect(n.bounds.x, `${where}: ${n.label} left of ${p.x}`).toBeGreaterThanOrEqual(p.x + inset - 1);
    expect(n.bounds.y, `${where}: ${n.label} above`).toBeGreaterThanOrEqual(p.y + inset - 1);
    expect(n.bounds.x + n.bounds.w, `${where}: ${n.label} right`).toBeLessThanOrEqual(p.x + p.w - inset + 1);
    expect(n.bounds.y + n.bounds.h, `${where}: ${n.label} below`).toBeLessThanOrEqual(p.y + p.h - inset + 1);
  }
};
/** U4b / N9 â the tenant is visible: its logo sits in slot-brand, primary + secondary are painted somewhere. */
const tenantVisible = (u: Probe, where: string) => {
  const brand = u.nodes.find((n) => n.label === 'slot-brand');
  expect(brand?.visible, `${where}: slot-brand`).toBe(true);
  const logo = u.nodes.find((n) => n.role === 'mark' && n.visible && brand && overlaps(n, brand));
  expect(logo, `${where}: no tenant logo (role mark) inside slot-brand`).toBeDefined();
  for (const k of ['primary', 'secondary'] as const) {
    const hex = tokens.light[k].toLowerCase();
    expect(u.nodes.some((n) => n.visible && n.colors.includes(hex)), `${where}: ${k} ${hex} painted nowhere`).toBe(true);
  }
};
for (const vp of VIEWPORTS) for (const theme of ['light', 'dark'] as const) {
  test(`U9b / U4b â text fits, tenant visible on start + game + results @${vp.width}x${vp.height} ${theme}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__GAME_DEBUG__?.ui === 'function', null, { timeout: 20_000 });
    await page.evaluate((t) => window.__GAME_DEBUG__!.setTheme(t), theme);
    await page.waitForTimeout(600);
    let u = await ui(page); textFits(u, 'start'); tenantVisible(u, 'start');
    await page.getByRole('button', { name: /play/i }).click({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__GAME_DEBUG__!.loadLevel(4));
    await page.waitForTimeout(400);
    u = await ui(page); textFits(u, 'game'); tenantVisible(u, 'game');
    await page.evaluate(() => window.__GAME_DEBUG__!.solve());
    await page.waitForTimeout(2600);
    u = await ui(page); textFits(u, 'results');
  });
}

test('U12 â FTUE emphasises the named control itself; nothing floats over the board', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => window.__GAME_DEBUG__!.loadLevel(1));
  await page.waitForTimeout(600);
  const f = await feel(page);
  expect(f.ftueCopy, 'level 1 has FTUE copy').toBeTruthy();
  expect(f.ftueTarget, 'level 1 step names a target').toBeTruthy();
  const u = await ui(page);
  expect(u.nodes.filter((n) => n.role === 'tutorial-overlay'), 'no tutorial overlay node').toEqual([]);
  const target = u.nodes.find((n) => n.label === f.ftueTarget);
  expect(target?.visible, `target ${f.ftueTarget} visible`).toBe(true);
  expect(target?.shadow, 'target carries accent-highlight').toBe('accent-highlight');
  const info = u.nodes.find((n) => n.label === 'slot-info');
  expect(info?.visible, 'copy lives in slot-info').toBe(true);
});

test.describe('audio â default autoplay policy (first-load state is exercised, not disabled)', () => {
  /* A worker-scoped `test.use({ launchOptions })` inside a describe is rejected by Playwright
     ("forces a new worker") and takes the whole file down with it, so this case launches its own
     Chrome with the DEFAULT autoplay policy â no --autoplay-policy flag â and asserts exactly what
     it asserted before: the start screen renders and no page error escapes. */
  test('start renders, first tap unlocks, no unhandled rejection', async ({ baseURL }) => {
    const browser = await chromium.launch({ channel: 'chrome' });
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    try {
      await enter(page);
      expect((await feel(page)).phase).toBeTruthy();
      expect(errors, 'page errors under default autoplay').toEqual([]);
    } finally {
      await context.close();
      await browser.close();
    }
  });
});

test('N8 â dark theme passes the same probe', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => window.__GAME_DEBUG__!.setTheme('dark'));
  await page.waitForTimeout(400);
  expect((await feel(page)).theme).toBe('dark');
  const u = await ui(page);
  for (const s of SLOTS) expect(u.nodes.find((n) => n.label === s)?.visible, s).toBe(true);
});

test('U5 / U6 / U7 â results win: count-up, moving mark, staggered stars', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => window.__GAME_DEBUG__!.solve());
  await expect(page.locator('[data-feel="score"]')).toBeVisible({ timeout: 15_000 });
  const stars = await sample(page, () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-feel="star"]')).filter((el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return Math.hypot(m.a, m.b) > 0.5;
    }).length, 1_800, 60);
  expect(new Set(stars).size, `stars over time: ${stars}`).toBeGreaterThanOrEqual(3);
  expect(stars.at(-1)).toBe(3);
  const scores = await sample(page, () => Number((document.querySelector('[data-feel="score"]')?.textContent ?? '0').replace(/\D/g, '')), 1_600);
  expect(new Set(scores).size).toBeGreaterThanOrEqual(3);
  expect(scores.at(-1)).toBe(Math.max(...scores));
  expect(scores.at(-1)).toBeGreaterThan(0);
  const [a, b] = await sample(page, () => getComputedStyle(document.querySelector('[data-feel="mascot"]')!).transform, 900, 450);
  expect(a).not.toBe(b);
});

test('U7 â results fail: no filled stars, Try Again, mark still moves', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => window.__GAME_DEBUG__!.fail());
  await expect(page.locator('[data-feel="mascot"]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1_500);
  expect(await page.locator('[data-feel="star"][data-filled="true"]').count()).toBe(0);
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
});
