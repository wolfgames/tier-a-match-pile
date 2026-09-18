// what_in: `slot-orders` container + the pile's live `orders` array (rules/types.ts#Order)
//          + the live `tray` (readonly string[]) + the viewport width + the current theme.
// what_out: `paintOrdersHud` — a horizontal row of small Order cards (icon + `current/required`
//           only, no item-name text), one per active Order, responsive to both viewport width
//           and Order count (1-6), always centred, never wrapped to a second row.
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
//           number is continuous across that transition (2/3 -> 3/3), not a separate number
//           that resets.
//
// CARD-ROW pass: replaced the old vertical "NAME  n/m" text-list (one Text line per Order) with
// individual small cards — icon (matchIcons.ts, the SAME shape+colour the board piece and Slots
// Row use for that item — deliberately unchanged by done-state; only the card background signals
// "done", never the icon's own colour, so an item's identity never drifts) + a bare count, no
// item name anywhere. Each Order's own card width comes from the responsive formula in
// `cardLayout` below (viewport width ÷ active Order count, clamped to a sane range), never a
// second row.
import { Container, Graphics, Text } from 'pixi.js';
import type { Order } from '../rules/types';
import { paint, shape } from '../inspector';
import { paletteHexFor, bestTextColorOn, type ThemeName } from '../palette';
import { drawSoftShadow } from '../surface';
import { drawMatchIconFor } from '../matchIcons';
import { FONTS } from '../typography';

const H_PAD = 16;
const GAP = 10;
// SUBTLE-REDUCTION pass: cards sized down ~14% from the original 56-84×76 range (icon/count-text
// scaled down to match) — a size tweak only, everything else (responsive 1-6 count formula,
// centring, icon+count layout, done-state colour) is untouched.
const MIN_CARD_W = 48;
const MAX_CARD_W = 72;
export const ORDER_CARD_H = 66;

// Level-scoped ("<levelIndex>:<itemTypeId>") — an itemTypeId can recur across levels (e.g. an
// order for "fries" again later), so keying on the bare typeId would make a brand-new Order
// look already-animated-out from the moment its level loads.
const animatedOnce = new Set<string>();

export type OrderCompleteHandoff = (node: Container, globalX: number, globalY: number) => void;

/** availableWidth = viewport − horizontal padding×2; cardWidth = clamp(min, that ÷ count, max);
 * the whole row (count·cardWidth + (count−1)·gap) is then centred in the viewport. */
function cardLayout(vw: number, count: number): { cardW: number; startX: number } {
  const availableWidth = vw - H_PAD * 2;
  const totalGaps = GAP * Math.max(0, count - 1);
  const cardW = Math.max(MIN_CARD_W, Math.min(MAX_CARD_W, (availableWidth - totalGaps) / Math.max(1, count)));
  const totalW = count * cardW + totalGaps;
  const startX = (vw - totalW) / 2;
  return { cardW, startX };
}

/** Repaints `slot` with one card per not-yet-celebrated Order (capped at 6 — rules/
 * deriveOrders.ts's own MAX_ORDERS already keeps live Orders at or under this, this is just a
 * hard ceiling for the row math) — caller re-invokes this on every `pile` change. The instant an
 * Order first reads as done, its card is handed to `onOrderComplete` (sparkle + spin-fade, VFX
 * pass) instead of being kept as a normal child — otherwise the next repaint's
 * `removeChildren()` would destroy it mid-animation. */
export function paintOrdersHud(
  slot: Container,
  orders: readonly Order[],
  tray: readonly string[],
  vw: number,
  levelIndex: number,
  theme: ThemeName,
  onOrderComplete?: OrderCompleteHandoff,
): void {
  slot.removeChildren().forEach((c) => c.destroy());
  const palette = paletteHexFor(theme);
  const active = orders.filter((o) => !animatedOnce.has(`${levelIndex}:${o.itemTypeId}`)).slice(0, 6);
  const { cardW, startX } = cardLayout(vw, active.length);

  active.forEach((order, i) => {
    const key = `${levelIndex}:${order.itemTypeId}`;
    const inTray = tray.reduce((n, typeId) => (typeId === order.itemTypeId ? n + 1 : n), 0);
    const effective = Math.min(order.requiredQty, order.collectedQty + inTray);
    const done = effective >= order.requiredQty;

    const card = new Container();
    card.label = `card-order-${order.itemTypeId}`;
    card.position.set(startX + i * (cardW + GAP), 0);
    const fillHex = done ? palette.accent : palette.panel;
    drawSoftShadow(card, cardW, ORDER_CARD_H, 14, -6, -6, 8, 0.1, palette.text);
    card.addChild(new Graphics().roundRect(0, 0, cardW, ORDER_CARD_H, 14).fill(fillHex));
    paint(card, `#${fillHex.toString(16).padStart(6, '0')}`);
    shape(card, 14);

    // Icon colour is the item's own stable identity, ALWAYS — never recoloured for the done
    // state (that would break "same icon+colour everywhere" for a player who's mid-collection on
    // a second copy of this same item elsewhere on screen). Done-state feedback lives in the
    // card background + count text colour only.
    const iconSize = Math.min(cardW * 0.5, 30);
    const icon = drawMatchIconFor(order.itemTypeId, iconSize);
    icon.position.set(cardW / 2, ORDER_CARD_H * 0.38);
    card.addChild(icon);

    const countText = new Text({
      text: `${effective}/${order.requiredQty}`,
      style: { fontFamily: FONTS.body, fontSize: 12, fontWeight: '700', fill: done ? bestTextColorOn(fillHex, palette) : palette.text },
    });
    countText.label = `text-order-count-${order.itemTypeId}`;
    countText.anchor.set(0.5);
    countText.position.set(cardW / 2, ORDER_CARD_H * 0.8);
    card.addChild(countText);

    slot.addChild(card);
    if (done && onOrderComplete) {
      animatedOnce.add(key);
      const g = card.getGlobalPosition();
      slot.removeChild(card);
      onOrderComplete(card, g.x, g.y);
    }
  });
}
