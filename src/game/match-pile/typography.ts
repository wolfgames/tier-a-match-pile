// what_in: brand.tokens.json type + shadows blocks.
// what_out: `FONTS` (display/body/numeric family names) and `SHADOWS` (named recipes,
//           incl. brand-cta/-pressed/-selected) — the only source of font/shadow values.
// why_here: N3/N4 (feel.test) requires FONTS === tenant type block and SHADOWS keys ===
//           tokens.shadows keys exactly; A7 forbids literal font names elsewhere.
import tokens from './brand.tokens.json';

export const FONTS: { display: string; body: string; numeric: string } = { ...tokens.type };

export type ShadowRecipe = (typeof tokens.shadows)[keyof typeof tokens.shadows];
export const SHADOWS: Record<string, ShadowRecipe> = { ...tokens.shadows };
