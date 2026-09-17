// what_in: the Pixi stage (+ optional DOM root) and the renderer's screen size.
// what_out: `ui()` â a flat list of labelled nodes with role, bounds, visibility, style tokens.
// why_here: the UX contract (U1, U4, U9, N2) is asserted against this projection, not screenshots.
//           Every game-owned interactive node MUST set `label` and `roleOf` MUST know it.
// Contract: tier-a-generation-v4/references/ux-contract.md Â§U9
import type { Container } from 'pixi.js';

// Pixi v8 dropped public worldAlpha â multiply alpha up the parent chain.
const wAlpha = (c: { alpha: number; parent: unknown }): number => { let a = 1; let n: { alpha: number; parent: unknown } | null = c; while (n) { a *= n.alpha; n = n.parent as typeof n; } return a; };

export type Role =
  | 'slot' | 'board' | 'tile' | 'legend' | 'hud' | 'cta' | 'selected' | 'active'
  | 'celebration' | 'background' | 'grid' | 'body-text' | 'icon' | 'mark' | 'tutorial-overlay' | 'other';

export interface UiNode {
  label: string;
  role: Role;
  visible: boolean;
  interactive: boolean;
  bounds: { x: number; y: number; w: number; h: number };
  alpha: number;
  /** hex strings the node was drawn with, when the drawer registered them via `paint()` */
  colors: string[];
  /** shadow recipe name the drawer registered via `shadowOf()` (N2/N4) */
  shadow: string | null;
  /** true for Pixi `Text` / DOM text-bearing elements â U9b measures these */
  text: boolean;
  /** parent's bounds + registered corner radius, for U9b text-fit */
  parent: { x: number; y: number; w: number; h: number; radius: number } | null;
  /** DOM only: true when scrollWidth/Height exceed the client box */
  overflow: boolean;
  layer: 'pixi' | 'dom';
}

export interface UiProbe {
  viewport: { w: number; h: number };
  safeBottom: number;
  nodes: UiNode[];
}

const colorsByLabel = new Map<string, Set<string>>();
/** Call from every drawer: `paint(container, palette.accent)`. Lets N2 check accent placement. */
export const paint = (c: Container, ...hex: string[]) => {
  const set = colorsByLabel.get(c.label) ?? new Set();
  for (const h of hex) set.add(h.toLowerCase());
  colorsByLabel.set(c.label, set);
};

const shadowByLabel = new Map<string, string>();
/** Call when applying a SHADOWS recipe: `shadowOf(node, 'brand-cta')`. N2 forbids `accent-glow` on a cta. */
export const shadowOf = (c: Container, name: string) => { shadowByLabel.set(c.label, name); };

const radiusByLabel = new Map<string, number>();
/** Call from every rounded-panel drawer: `shape(panel, radius)`. U9b insets text-fit by radius Ã 0.3. */
export const shape = (c: Container, radius: number) => { radiusByLabel.set(c.label, radius); };

/** Shrink-to-fit: scale a Text down until it fits `maxWidth` (never up). Titles must use this. */
export const fitText = (t: Container & { width: number; scale: { set(v: number): void } }, maxWidth: number) => {
  if (t.width > maxWidth) t.scale.set(maxWidth / t.width);
};

/** Role from label prefix. Extend per game; unknown interactive labels fail the e2e. */
export const roleOf = (label: string): Role => {
  const p = label.split('-')[0];
  if (label.startsWith('slot-')) return 'slot';
  const map: Record<string, Role> = {
    board: 'board', tile: 'tile', legend: 'legend', hud: 'hud', cta: 'cta', hint: 'cta',
    selected: 'selected', active: 'active', fx: 'celebration', star: 'celebration',
    bg: 'background', watermark: 'background', grid: 'grid', text: 'body-text',
    icon: 'icon', mark: 'mark', tutorial: 'tutorial-overlay',
  };
  return map[p] ?? 'other';
};

export const createInspector = (stage: Container, screen: () => { w: number; h: number }, dom?: ParentNode) => {
  const walk = (c: Container, out: UiNode[]) => {
    if (c.label && c.label !== '') {
      const b = c.getBounds();
      out.push({
        label: c.label,
        role: roleOf(c.label),
        visible: c.visible && wAlpha(c) > 0.02 && b.width > 0 && b.height > 0,
        interactive: c.eventMode === 'static' || c.eventMode === 'dynamic',
        bounds: { x: b.x, y: b.y, w: b.width, h: b.height },
        alpha: wAlpha(c),
        colors: [...(colorsByLabel.get(c.label) ?? [])],
        shadow: shadowByLabel.get(c.label) ?? null,
        text: 'text' in c && typeof (c as { text?: unknown }).text === 'string',
        parent: c.parent ? (() => { const pb = c.parent.getBounds(); return { x: pb.x, y: pb.y, w: pb.width, h: pb.height, radius: radiusByLabel.get(c.parent.label) ?? 0 }; })() : null,
        overflow: false,
        layer: 'pixi',
      });
    }
    for (const ch of c.children) walk(ch as Container, out);
  };
  const domNodes = (): UiNode[] =>
    Array.from(dom?.querySelectorAll<HTMLElement>('[data-ui]') ?? []).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        label: el.dataset.ui!,
        role: roleOf(el.dataset.ui!),
        visible: cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && Number(cs.opacity) > 0.02,
        interactive: el.tagName === 'BUTTON' || el.getAttribute('role') === 'button',
        bounds: { x: r.x, y: r.y, w: r.width, h: r.height },
        alpha: Number(cs.opacity),
        colors: [cs.backgroundColor, cs.color],
        shadow: el.dataset.shadow ?? null,
        text: el.childElementCount === 0 && (el.textContent ?? '').trim() !== '',
        parent: el.parentElement ? (() => { const pr = el.parentElement!.getBoundingClientRect(); return { x: pr.x, y: pr.y, w: pr.width, h: pr.height, radius: parseFloat(getComputedStyle(el.parentElement!).borderTopLeftRadius) || 0 }; })() : null,
        overflow: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
        layer: 'dom',
      };
    });
  return {
    ui: (): UiProbe => {
      const nodes: UiNode[] = [];
      walk(stage, nodes);
      const safe = Number(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom') || 0);
      return { viewport: screen(), safeBottom: safe, nodes: [...nodes, ...domNodes()] };
    },
  };
};
