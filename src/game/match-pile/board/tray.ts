// what_in: `slot-action` container + the current tray (typeIds held, insertion order).
// what_out: the game's input surface for this genre — the 7-slot tray display (fills as
//           tiles are picked; a completed triple visibly drains back out). Each filled slot shows
//           the SAME Pixi vector icon + colour (matchIcons.ts) as the board piece it came from —
//           item identity carries through from board to Slots Row, not a generic tinted block.
// why_here: U9 slot-action — "the game's input surface" when there's no separate submit CTA;
//           for Match Pile, the tray itself is that surface.
import { Container } from 'pixi.js';
import { paint } from '../inspector';
import { paletteHexFor, type ThemeName } from '../palette';
import { paintSurface } from '../surface';
import { drawMatchIconFor } from '../matchIcons';
import { TRAY_SIZE } from '../rules/types';

/** Default/desired slot size+gap — what the row looks like whenever there's enough room. Never
 * exceeded; `slotMetricsFor` only ever shrinks these, matching the "normal viewport should still
 * look close to the current size, only shrink as needed" brief. */
const DEFAULT_SLOT_SIZE = 36;
const DEFAULT_GAP = 8;

/** RESPONSIVE-SLOTS pass: the row used to assume it always had `TRAY_SIZE * DEFAULT_SLOT_SIZE +
 * (TRAY_SIZE-1) * DEFAULT_GAP` (300px) of width, which overflowed the Slots Row card on narrower
 * viewports (`slotWidth` — `slots.vw`, layout.ts — going below ~300px). Size and gap now shrink
 * TOGETHER by the same ratio whenever the default layout wouldn't fit, so the row always fits
 * exactly within `availableWidth` with no clipping/overflow while keeping the same size-to-gap
 * proportions (equal spacing preserved, just smaller). Shared by `paintTray` and the VFX position
 * helpers below — both MUST agree on the actual on-screen slot geometry, or a completed match
 * would fly to a stale (pre-shrink) position. */
function slotMetricsFor(availableWidth: number): { size: number; gap: number } {
  const desiredTotal = TRAY_SIZE * DEFAULT_SLOT_SIZE + (TRAY_SIZE - 1) * DEFAULT_GAP;
  if (availableWidth <= 0 || desiredTotal <= availableWidth) {
    return { size: DEFAULT_SLOT_SIZE, gap: DEFAULT_GAP };
  }
  const scale = availableWidth / desiredTotal;
  return { size: DEFAULT_SLOT_SIZE * scale, gap: DEFAULT_GAP * scale };
}

// slotWidth is passed in rather than read from `slot.width` — paintTray's own removeChildren
// call zeroes the container's measured bounds first, so a post-clear read would always be 0.
function startXFor(slotWidth: number, size: number, gap: number): number {
  const totalW = TRAY_SIZE * size + (TRAY_SIZE - 1) * gap;
  return slotWidth > totalW ? (slotWidth - totalW) / 2 : 0;
}

/** Slot index → its centre point in `slot-action`'s own local space. Pure layout math (index →
 * position is fixed regardless of content) so VFX can target a slot without the live per-slot
 * Container, which paintTray fully destroys/rebuilds on every repaint. */
export function traySlotLocalCenter(index: number, slotWidth: number): { x: number; y: number } {
  const { size, gap } = slotMetricsFor(slotWidth);
  return { x: startXFor(slotWidth, size, gap) + index * (size + gap) + size / 2, y: 4 + size / 2 };
}

/** Centre points of the (MATCH_SIZE) slots a just-completed triple occupied, derived from the
 * tray *before* the pick that completed it — rules/step.ts appends the pick, counts occurrences,
 * then clears, so the picked copy's own slot is always `preTray.length`. Pure position lookup,
 * not gameplay authority: the real clear already happened via ecs/applyTap.ts by the time a
 * caller has `preTray` to pass in. */
export function matchedTraySlotCenters(
  preTray: readonly string[],
  typeId: string,
  slotWidth: number,
): Array<{ x: number; y: number }> {
  const indices = preTray.reduce<number[]>((acc, t, i) => (t === typeId ? [...acc, i] : acc), []);
  indices.push(preTray.length);
  return indices.map((i) => traySlotLocalCenter(i, slotWidth));
}

/** `slot` must be `slots.actionContent` (layout.ts's dedicated dynamic-content child of the
 * Slots Row card), never `slots.action` itself (the card, which also carries the background
 * shadow+face layout.ts paints once). A bare `removeChildren()` is safe here specifically
 * because `actionContent` only ever holds this function's own 7 tray-slot containers — an
 * indexed `removeChildren(2)` on the CARD (assuming "background is always children 0/1") threw a
 * RangeError the instant the card had exactly 2 children and nothing else yet: Pixi's
 * `removeChildren(beginIndex, endIndex)` only treats an empty range as a valid no-op when the
 * container has ZERO children total (childrenHelperMixin.js), not merely "nothing past
 * beginIndex" on an otherwise-populated container. */
export function paintTray(slot: Container, tray: readonly string[], theme: ThemeName, slotWidth: number): void {
  slot.removeChildren().forEach((c) => c.destroy({ children: true }));
  const palette = paletteHexFor(theme);
  const { size, gap } = slotMetricsFor(slotWidth);
  const startX = startXFor(slotWidth, size, gap);
  for (let i = 0; i < TRAY_SIZE; i++) {
    const x = startX + i * (size + gap);
    const typeId = tray[i];
    const g = new Container();
    g.label = `tray-slot-${i}`;
    g.position.set(x, 4);
    if (typeId) {
      // Filled: raised (soft-push) neutral chip + the item's own icon — same identity as the
      // board piece and its Orders card, never a generic tinted block.
      paintSurface(g, size, size, 8, palette.panel, 'soft-push', theme);
      const icon = drawMatchIconFor(typeId, size);
      icon.position.set(size / 2, size / 2);
      g.addChild(icon);
    } else {
      // Empty: recessed (deep-emboss) — an open slot waiting to be filled, per the reference
      // sheet's grid treatment (empty cells sit inset, filled cells sit raised).
      paintSurface(g, size, size, 8, palette.panel, 'deep-emboss', theme);
    }
    slot.addChild(g);
  }
  paint(slot, `#${palette.panel.toString(16).padStart(6, '0')}`);
}
