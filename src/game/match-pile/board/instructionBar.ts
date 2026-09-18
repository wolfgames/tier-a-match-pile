// what_in: `slots.infoContent` (layout.ts's dedicated dynamic-content child of the pre-painted
//          instruction pill — never the pill container itself) + the current FTUE/fallback copy.
// what_out: `paintInstructionBar` — writes (and rewrites) the one line of copy the instruction
//           card shows. The card's own pill background is painted once by layout.ts, onto the
//           PARENT container (`slots.info`) — this function never touches that parent.
// why_here: board/ per A5 — content, not structure (layout.ts owns the pill; this owns the text).
//           Also keeps gameController.ts free of a direct `new Text(` (A4 — compose and wire only).
import type { Container } from 'pixi.js';
import { Text } from 'pixi.js';
import { fitText } from '../inspector';
import { FONTS } from '../typography';

/** Bare `removeChildren()` — safe and idempotent regardless of prior call count, because `slot`
 * (`slots.infoContent`) is a dedicated container that only ever holds this function's own text,
 * nothing else, ever. An indexed `removeChildren(2)` here previously assumed the *parent*
 * (`slots.info`, which layout.ts paints with exactly 2 background children) was safe to clear
 * "from index 2 onward" — but Pixi's `removeChildren(beginIndex, endIndex)` only treats an EMPTY
 * range as a valid no-op when the container has ZERO children total (childrenHelperMixin.js);
 * with `info` sitting at exactly 2 children (nothing yet added beyond the background), that call
 * threw a RangeError on every first paint. Clearing a container that never holds background
 * content removes the whole class of bug, not just this one instance of it. Text is pinned to
 * white — the pill itself now carries the `#0056D6` guidance-blue (layout.ts, via the same
 * `FTUE_HIGHLIGHT_HEX` token), so the previous `bestTextColorOn`/blue-on-pale-yellow contrast
 * logic no longer applies: white-on-blue is the fixed pair, not a computed one. */
export function paintInstructionBar(slot: Container, text: string, maxWidth: number): void {
  slot.removeChildren().forEach((c) => c.destroy());
  const t = new Text({
    text,
    style: { fontFamily: FONTS.body, fontSize: 14, fontWeight: '700', fill: 0xffffff },
  });
  t.label = 'text-info';
  t.position.set(14, 22);
  t.anchor.set(0, 0.5);
  slot.addChild(t);
  fitText(t, maxWidth - 28);
}
