// what_in: `slot-orders` container + the pile's live `orders` array (rules/types.ts#Order)
//          + the live `tray` (readonly string[]).
// what_out: `paintOrdersHud` — one line per active Order (humanized item name +
//           an *effective* progress count that includes copies currently sitting in the
//           Slots Row, not just `collectedQty`), checkmarked + accent-tinted once satisfied.
// why_here: the Orders rules/state system is already correct (rules/orders.ts,
//           rules/winFail.ts, rules/deriveOrders.ts) but nothing renders it — this is the
//           additive V1 HUD closing that gap. Rendering-layer only; no rules logic here.
//           `collectedQty` (rules/orders.ts#advanceOrders) only advances on a completed
//           triple, by design (R-ORDER-PROGRESS) — that's the correct win-condition state
//           and is untouched. But a player expects the counter to move the instant they tap
//           a matching item, not just when the 3rd copy lands — so the HUD displays
//           `collectedQty + (copies of this order's itemTypeId currently in the tray)`,
//           capped at requiredQty, purely as a presentation-layer computation. This never
//           changes win/lose logic: the moment the 3rd copy actually lands, `step()` clears
//           the tray and `collectedQty` itself advances by MATCH_SIZE, so the displayed
//           number is continuous across that transition (2/3 -> 3/3 ✓), not a separate
//           number that resets.
// catalog: considered progress-bar, search-objects-panel, screen-hud/screen-hud-dom (catalog
//          INDEX.md) — progress-bar and screen-hud model a single 0..1/goal value, not an
//          arbitrary-count list of independently-tracked quantities; search-objects-panel
//          requires a sprite-atlas-backed evidence list config we have no atlas for (Match
//          Pile Orders are plain typeId strings, no per-item sprite). None fit a variable
//          N-row "label current/required" live list — plain Pixi Text/Graphics used instead,
//          matching the existing chrome.ts text-line pattern for this same repaint group.
import { Container, Text } from 'pixi.js';
import type { Order } from '../rules/types';
import { fitText } from '../inspector';
import { paletteHex } from '../palette';
import { FONTS } from '../typography';
import { ORDERS_LINE_H } from './layout';

const humanName = (typeId: string): string => typeId.replace(/-/g, ' ').toUpperCase();
/** Inset from the card's own edges (layout.ts paints the card as `slot.children[0]`, kept below —
 * see the `removeChildren(1)` note). */
const PAD_X = 14;
const PAD_Y = 12;

/** Repaints `slot` with one line per Order — caller re-invokes this on every `pile` change.
 * `removeChildren(1)` (not `removeChildren()`) — child 0 is the card background layout.ts
 * paints once at init; clearing it every repaint would leave the Orders card with no surface. */
export function paintOrdersHud(slot: Container, orders: readonly Order[], tray: readonly string[], maxWidth: number): void {
  slot.removeChildren(1).forEach((c) => c.destroy());
  orders.forEach((order, i) => {
    const inTray = tray.reduce((n, typeId) => (typeId === order.itemTypeId ? n + 1 : n), 0);
    const effective = Math.min(order.requiredQty, order.collectedQty + inTray);
    const done = effective >= order.requiredQty;
    const text = `${humanName(order.itemTypeId)}  ${effective}/${order.requiredQty}${done ? ' ✓' : ''}`;
    // Bigger + bolder than before — this is a primary "immediately scannable" readout, not a
    // secondary label (typography pass: distinct weight/size from legend/meta text).
    const t = new Text({
      text,
      style: { fontFamily: FONTS.body, fontSize: 16, fontWeight: '700', fill: done ? paletteHex.accent : paletteHex.text },
    });
    t.label = `text-order-${order.itemTypeId}`;
    t.position.set(PAD_X, PAD_Y + i * ORDERS_LINE_H);
    slot.addChild(t);
    fitText(t, maxWidth - PAD_X * 2);
  });
}
