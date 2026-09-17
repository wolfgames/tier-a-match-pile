// Architecture oracle (A1âA9) â import graph + write sites, by source scan. No new deps.
// ponytail: regex over files; swap for dependency-cruiser if a game defeats it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import tokens from '~/game/match-pile/brand.tokens.json';

const ROOT = 'src/game/match-pile';
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
const src = (p: string) => (p === '<none>' ? '' : readFileSync(p, 'utf8'));
const imports = (p: string) => [...src(p).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
// node:path.relative/join use the OS separator (backslash on Windows) — every check below is a
// forward-slash regex/prefix/suffix test, so normalize once here rather than at each call site.
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');
const under = (p: string, d: string) => rel(p).startsWith(d);
const all = existsSync(ROOT) ? files(ROOT) : [];
const each = (xs: string[]) => (xs.length ? xs : ['<none>']);

describe('A1 â rules/, solver/, generator/ are pure', () => {
  it.each(each(all.filter((p) => /^(rules|solver|generator)\//.test(rel(p)))))('%s', (p) => {
    for (const i of imports(p)) expect(i, `${p} imports ${i}`).not.toMatch(/pixi|solid|@adobe\/data|gsap|howler|\.\.\/(ecs|screens|board|fx|hud)/);
    expect(src(p)).not.toMatch(/\b(window|document|Date\.now|performance\.now|localStorage)\b/);
    if (!/generator\//.test(rel(p))) expect(src(p)).not.toMatch(/Math\.random/);
  });
});

describe('A2 â authoritative writes only in ecs/transactions', () => {
  it.each(each(all.filter((p) => !under(p, 'ecs/transactions') && !/\.test\./.test(p))))('%s', (p) => {
    expect(src(p), `${p} writes store.resources outside a transaction`).not.toMatch(/store\.resources\.\w+\s*=/);
  });
});

describe('A3 â transactions are deterministic and call rules/', () => {
  it.each(each(all.filter((p) => under(p, 'ecs/transactions'))))('%s', (p) => {
    expect(src(p)).not.toMatch(/Date\.now|performance\.now|Math\.random/);
  });
});

describe('A4 â gameController.ts composes and wires only', () => {
  const ctl = all.find((p) => p.endsWith('gameController.ts'));
  it('exists', () => expect(ctl, 'screens/gameController.ts missing').toBeDefined());
  it('â¤ 150 non-blank lines', () => {
    expect(src(ctl!).split('\n').filter((l) => l.trim() !== '').length).toBeLessThanOrEqual(150);
  });
  it('imports only ecs public api, screens/board/fx/hud/input/audio/analytics/tutorial adapters, feel, inspector', () => {
    for (const i of imports(ctl!)) expect(i, `controller imports ${i}`).not.toMatch(/\/(rules|solver|generator|data)\//);
    expect(src(ctl!)).not.toMatch(/store\.resources|new (Graphics|Sprite|Text)\(|gsap\.(to|from|timeline)\(|JSON\.parse/);
  });
});

describe('A5 â no file > 150 lines, no banned dirs, header comment', () => {
  it.each(each(all))('%s', (p) => {
    const s = src(p);
    expect(s.split('\n').filter((l) => l.trim()).length, `${p} > 150 lines: split by concern`).toBeLessThanOrEqual(150);
    expect(rel(p)).not.toMatch(/\/(utils|helpers|misc|common)\//);
    if (!p.endsWith('index.ts')) expect(s.trimStart().startsWith('//') || s.trimStart().startsWith('/*'), `${p} has no header`).toBe(true);
  });
});

describe('A6 â feedback goes through the registry; time goes through gsap', () => {
  it.each(each(all.filter((p) => /\/(board|fx|screens|hud|input|tutorial)\//.test(rel(p)))))('%s', (p) => {
    expect(src(p)).not.toMatch(/setTimeout|setInterval/);
  });
});

describe('A7 â colours and fonts only from palette.ts / typography.ts', () => {
  it.each(each(all.filter((p) => !/(^|\/)(palette|typography)\.ts$/.test(rel(p)))))('%s', (p) => {
    const fonts = ['Arial', 'sans-serif', 'Montserrat', 'Rubik', ...Object.values(tokens.type).filter((v): v is string => typeof v === 'string')];
    expect(src(p)).not.toMatch(new RegExp(`#[0-9a-fA-F]{6}\\b|0x[0-9a-fA-F]{6}\\b|['"](${fonts.join('|')})['"]`));
  });
});

describe('A8 â runtime levels only via services/levels.ts', () => {
  it.each(each(all.filter((p) => !under(p, 'services') && !under(p, 'data') && !/\.test\./.test(p))))('%s', (p) => {
    for (const i of imports(p)) expect(i, `${p} imports level data directly`).not.toMatch(/\/data\/(ftueLevels|levels-match-pile)/);
  });
});

describe('A9 â no registry row without code, no tutorial overlay file', () => {
  // ponytail: a row is "wired" when its event name is quoted somewhere outside feel.ts/tests; tighten to a dispatch() grep if a game games this.
  const rows = [...src(all.find((p) => rel(p) === 'feel.ts') ?? '<none>').matchAll(/^\s{2}(\w+):\s*\{\s*tween/gm)].map((m) => m[1]);
  const code = all.filter((p) => rel(p) !== 'feel.ts').map(src).join('\n');
  it.each(each(rows))('registry row "%s" is dispatched from code', (ev) => {
    expect(code, `${ev} is declared in feedbackRegistry but never dispatched`).toMatch(new RegExp(`['"\`]${ev}['"\`]`));
  });
  it('tutorial/hand.ts does not exist (U12: emphasise the real control)', () => {
    expect(existsSync(join(ROOT, 'tutorial/hand.ts'))).toBe(false);
  });
  it('gameController.ts keeps â¥ 20 lines of headroom under the 150 gate', () => {
    const ctl = all.find((p) => rel(p) === 'screens/gameController.ts');
    const n = src(ctl ?? '<none>').split('\n').filter((l) => l.trim()).length;
    expect(n, 'controller non-blank lines').toBeLessThanOrEqual(130);
  });
});
