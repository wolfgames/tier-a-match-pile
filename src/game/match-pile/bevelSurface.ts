// what_in: a Graphics already holding a flat pill or circle face + that face's box/radius + a
//          light and dark ink colour (both palette-sourced by the caller — no literal hex here).
// what_out: `drawPillBevel` / `drawCircleBevel` — a thin highlight line/arc near one edge and a
//           thin shade line/arc near the opposite edge, `raised` (light-top/dark-bottom) or
//           reversed for `pressed` (dark-top/light-bottom) — a cheap, non-filter approximation of
//           brand-contract.md's `brand-cta` bevel/shade recipe (a CSS inset box-shadow pair),
//           since Pixi has no native inset shadow.
// why_here: shared by ctaButton.ts (PLAY, a pill) and settingsButton.ts (a circle) so both
//           controls read as the same tactile UI system instead of two different-looking states.
import type { Graphics } from 'pixi.js';

/** Pill (fully-rounded rect, `radius = h/2`): a straight line along the flat portion of the top
 * and bottom edges (the only part a CSS `inset 0 1px 0` bevel would actually show on a pill). */
export function drawPillBevel(g: Graphics, w: number, h: number, lightHex: number, darkHex: number, raised: boolean): void {
  const capInset = Math.max(h * 0.4, 8);
  if (w - capInset * 2 <= 0) return;
  const inset = 1.5;
  const topColor = raised ? lightHex : darkHex;
  const bottomColor = raised ? darkHex : lightHex;
  g.moveTo(capInset, inset).lineTo(w - capInset, inset).stroke({ width: 1.25, color: topColor, alpha: 0.4, cap: 'round' });
  g.moveTo(capInset, h - inset).lineTo(w - capInset, h - inset).stroke({ width: 1.25, color: bottomColor, alpha: 0.28, cap: 'round' });
}

/** Circle: a top arc and a bottom arc (a straight line has no equivalent "flat edge" on a circle,
 * so the bevel is drawn as two opposing arcs instead). */
export function drawCircleBevel(g: Graphics, cx: number, cy: number, r: number, lightHex: number, darkHex: number, raised: boolean): void {
  const rr = Math.max(0, r - 1.25);
  const topColor = raised ? lightHex : darkHex;
  const bottomColor = raised ? darkHex : lightHex;
  g.arc(cx, cy, rr, -Math.PI * 0.85, -Math.PI * 0.15).stroke({ width: 1.25, color: topColor, alpha: 0.45 });
  g.arc(cx, cy, rr, Math.PI * 0.15, Math.PI * 0.85).stroke({ width: 1.25, color: bottomColor, alpha: 0.3 });
}
