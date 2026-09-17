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
