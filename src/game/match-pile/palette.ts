// what_in: brand.tokens.json (tenant colours merged in by tier-a/init.sh).
// what_out: `palette` — the light token set, hex strings + Pixi numbers; `paletteFor(theme)`
//           for runtime light/dark lookups.
// why_here: N1/N3 (feel.test) requires palette === tokens.light; A7 forbids inline hex
//           anywhere else in src/game/match-pile — every drawer imports from here.
import tokens from './brand.tokens.json';

export type ThemeName = 'light' | 'dark';
export type PaletteKey = keyof typeof tokens.light;

/** Hex string palette — pinned to the light token set (N1/N3). */
export const palette: Record<PaletteKey, string> = { ...tokens.light };

/** Pixi wants 0xRRGGBB numbers; derive them once instead of parsing per-draw. */
export const paletteHex: Record<PaletteKey, number> = Object.fromEntries(
  Object.entries(tokens.light).map(([k, v]) => [k, Number.parseInt(v.slice(1), 16)]),
) as Record<PaletteKey, number>;

/** Runtime theme lookup (dark mode) — light/dark share the same key set. */
export function paletteFor(theme: ThemeName): Record<PaletteKey, string> {
  return theme === 'dark' ? { ...tokens.dark } : { ...tokens.light };
}

/** Pixi numbers for the given theme. */
export function paletteHexFor(theme: ThemeName): Record<PaletteKey, number> {
  const t = paletteFor(theme);
  return Object.fromEntries(
    Object.entries(t).map(([k, v]) => [k, Number.parseInt((v as string).slice(1), 16)]),
  ) as Record<PaletteKey, number>;
}

/** WCAG-ish relative luminance (sRGB, no gamma-correct linearisation — close enough for a
 * light/dark text pick, not a contrast-ratio compliance claim). */
function relativeLuminance(hex: number): number {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Picks readable text colour for an arbitrary fill: `onPrimary` is only guaranteed to contrast
 * with `primary` — the token schema has no `onSecondary`/`onAccent`. This was invisible under
 * the McDonald's sheet (secondary was a near-white cream, `text` always read fine on it) and
 * became a real illegible-text bug the moment a tenant's `secondary` is dark (Wolf's teal
 * `#008C99`) — `MATCH PILE` on the start-screen hero card, the instruction bar, and the score
 * pill all sat dark-text-on-dark. Every call site that paints text on a *dynamically chosen*
 * fill (not always `primary`/`base`/`panel`) must route the text colour through this instead of
 * assuming `text` or `onPrimary`.
 */
export function bestTextColorOn(fillHex: number, palette: Record<PaletteKey, number>): number {
  return relativeLuminance(fillHex) > 0.55 ? palette.text : 0xffffff;
}

/** Fixed FTUE guidance blue (VFX pass, docs/GAME-DESIGN.md#ftue) — a UX signal colour, not a
 * tenant brand token: unlike primary/secondary/accent it must never shift per tenant sheet, so
 * it lives here rather than in brand.tokens.json. Tutorial highlight/pulse use only. */
export const FTUE_HIGHLIGHT_HEX = 0x0056d6;

/** Fixed teal (VFX pass) for "this progressed one of my Orders" feedback — an Order-match ring,
 * and the win celebration. Also a fixed UX signal colour, not a tenant brand token: distinct from
 * FTUE_HIGHLIGHT_HEX's guidance blue so the two moments never read as the same signal. */
export const ORDER_PROGRESS_HEX = 0x008c99;
