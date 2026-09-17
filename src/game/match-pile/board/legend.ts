// what_in: `slot-legend` container (already painted by layout.ts's `paintSurface`).
// what_out: `paintLegendOnce` — the U1 rules legend, one short line, painted once at init.
// why_here: U1 requires the legend visible in every gameplay phase; the slot existed in
//           layout.ts but nothing ever drew content into it (see build-status notes).
import { Container, Text } from 'pixi.js';
import { fitText } from '../inspector';
import { paletteHex } from '../palette';
import { FONTS } from '../typography';

/** Exported so gameController.ts can reuse the same copy as the `slot-info` instruction bar's
 * permanent fallback outside FTUE (Mahjong reference: the instruction bar is never empty). */
export const LEGEND_COPY = 'TAP MATCHING ITEMS · CLEAR SETS OF 3';

/** The legend never changes — build its one Text node once, matching `initChromeOnce`'s pattern. */
export function paintLegendOnce(slot: Container, maxWidth: number): void {
  const t = new Text({
    text: LEGEND_COPY,
    style: { fontFamily: FONTS.body, fontSize: 12, fill: paletteHex.text, fontWeight: '600' },
  });
  t.label = 'legend-text';
  t.position.set(12, 8);
  slot.addChild(t);
  fitText(t, maxWidth - 24);
}
