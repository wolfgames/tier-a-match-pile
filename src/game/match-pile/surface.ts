// what_in: a Pixi container + a target rect (w, h, radius) + a fill colour + an optional
//          SHADOWS recipe name.
// what_out: `paintSurface()` — draws the recipe as a real, visible soft shadow (never drawn
//           before this file existed) behind a flat rounded-rect face, then registers
//           paint()/shape()/shadowOf() so the existing UX-contract inspector probe keeps working.
//           `drawSoftShadow()` is exported separately for callers with a custom face (tiles.ts).
// why_here: inspector.ts's `shadowOf()` only ever recorded a label→recipe-name mapping for the
//           test probe — nothing in the codebase actually painted the brand-contract SHADOWS
//           recipes, so every panel/card/button was flat with zero depth. brand-contract.md's own
//           spec ("Pixi via a blur baked once per surface size into a cached RenderTexture, drawn
//           as two tinted Sprites under the face — never a hard offset slab, never a live filter")
//           is approximated here with stacked, low-alpha rounded rects instead of an actual
//           RenderTexture bake: no Pixi filter, no per-frame cost, no renderer reference to thread
//           through every drawer, built once at panel-construction time.
import { Container, Graphics } from 'pixi.js';
import { paint, shadowOf, shape } from './inspector';
import { SHADOWS } from './typography';
import { paletteHexFor, type ThemeName } from './palette';

/** Named recipes with a numeric {x,y,blur,opacity,color} shape — the ones this file can paint
 * directly. `brand-cta*` recipes describe a DOM box-shadow stack instead; CTA callers translate
 * their own offset (see startView.ts / ResultsScreen.tsx) rather than reading SHADOWS for those. */
type OffsetRecipe = { x: number; y: number; blur: number; opacity: number; color: string };

const RING_COUNT = 4;
/** Hard cap on how far any shadow spreads, regardless of the recipe's own `blur` — the
 * reference is a tight, controlled neumorphic-lite treatment, not a diffuse floating halo. */
const MAX_BLUR = 8;

function isOffsetRecipe(v: unknown): v is OffsetRecipe {
  return !!v && typeof (v as OffsetRecipe).x === 'number' && typeof (v as OffsetRecipe).blur === 'number';
}

function shadowColorHex(colorKey: string, theme: ThemeName): number {
  const p = paletteHexFor(theme);
  return colorKey === 'accent' ? p.accent : p.text;
}

/** Stacked low-alpha rounded rects, offset toward (x, y) and growing outward by `blur` — a
 * cheap "soft blur" with no Pixi filter and no per-frame cost.
 *
 * FIX (was the "large blurry halo" bug): alpha-blended layers compound — drawing N overlapping
 * fills does NOT average to the target opacity, it approaches 1-(1-a)^N. The previous version
 * gave the innermost ring `opacity` directly (on top of 3 more layers already under it), so the
 * area right at the shape's edge rendered far darker than the recipe's own `opacity` value. Every
 * ring now uses the SAME small per-layer alpha, solved so the fully-overlapped region (right at
 * the edge, where all N rings stack) compounds to exactly `opacity` — never more — and the
 * outermost ring (where only one ring reaches) is proportionally faint, giving a real gradient
 * instead of a solid dark blob. */
export function drawSoftShadow(
  target: Container,
  w: number,
  h: number,
  radius: number,
  x: number,
  y: number,
  blur: number,
  opacity: number,
  hex: number,
): void {
  const b = Math.min(blur, MAX_BLUR);
  if (b <= 0 || opacity <= 0) return;
  const layerAlpha = 1 - (1 - opacity) ** (1 / RING_COUNT);
  const g = new Graphics();
  for (let i = RING_COUNT; i >= 1; i--) {
    const spread = (b / RING_COUNT) * i;
    g.roundRect(x - spread, y - spread, w + spread * 2, h + spread * 2, Math.max(0, radius + spread)).fill({ color: hex, alpha: layerAlpha });
  }
  target.addChild(g);
}

/**
 * Draws a real soft-shadow + flat rounded-rect face for `c`, and registers the drawer
 * bookkeeping (`paint`/`shape`/`shadowOf`) the inspector already expects. `visualRecipe` picks
 * which SHADOWS entry to render; `registerAs` lets a caller register a different recipe name for
 * the contract probe than the one actually painted (e.g. a CTA paints like `soft-push` but must
 * register as `brand-cta` for N2's "never a shadow on a cta" check).
 */
export function paintSurface(
  c: Container,
  w: number,
  h: number,
  radius: number,
  fillHex: number,
  visualRecipe?: keyof typeof SHADOWS,
  theme: ThemeName = 'light',
  registerAs?: string,
): void {
  if (visualRecipe) {
    const recipe = SHADOWS[visualRecipe];
    if (isOffsetRecipe(recipe)) {
      drawSoftShadow(c, w, h, radius, recipe.x, recipe.y, recipe.blur, recipe.opacity, shadowColorHex(recipe.color, theme));
    }
  }
  const face = new Graphics().roundRect(0, 0, w, h, radius).fill(fillHex);
  c.addChild(face);
  paint(c, `#${fillHex.toString(16).padStart(6, '0')}`);
  shape(c, radius);
  if (visualRecipe || registerAs) shadowOf(c, registerAs ?? visualRecipe!);
}
