// what_in: `slot-action` container + the current tray (typeIds held, insertion order).
// what_out: the game's input surface for this genre — the 7-slot tray display (fills as
//           tiles are picked; a completed triple visibly drains back out).
// why_here: U9 slot-action — "the game's input surface" when there's no separate submit CTA;
//           for Match Pile, the tray itself is that surface.
import { Container } from 'pixi.js';
import { paint } from '../inspector';
import { paletteHexFor, type ThemeName } from '../palette';
import { paintSurface } from '../surface';
import { TRAY_SIZE } from '../rules/types';
import { OBJECT_TYPE_POOL } from '../generator/objectTypes';

const SLOT_SIZE = 36;
const GAP = 8;
const TINT_KEYS = ['primary', 'secondary', 'accent', 'text'] as const;

/** `removeChildren(1)` (not `removeChildren()`) — child 0 is the card background layout.ts
 * paints once at init; a full clear here destroyed it on the very first repaint, leaving the
 * 7 slot squares floating with no surrounding card (their own per-slot panels are unaffected —
 * each is rebuilt fresh below — this is only about the row's own outer card). */
export function paintTray(slot: Container, tray: readonly string[], theme: ThemeName, slotWidth: number): void {
  slot.removeChildren(1).forEach((c) => c.destroy({ children: true }));
  const palette = paletteHexFor(theme);
  const totalW = TRAY_SIZE * SLOT_SIZE + (TRAY_SIZE - 1) * GAP;
  // slotWidth is passed in rather than read from `slot.width` — clearing children above already
  // zeroed the container's own measured bounds, so a post-clear read would always be 0.
  const startX = slotWidth > totalW ? (slotWidth - totalW) / 2 : 0;
  for (let i = 0; i < TRAY_SIZE; i++) {
    const x = startX + i * (SLOT_SIZE + GAP);
    const typeId = tray[i];
    const g = new Container();
    g.label = `tray-slot-${i}`;
    g.position.set(x, 4);
    if (typeId) {
      // Filled: raised (soft-push) — a collected item sitting tactilely above the tray surface.
      const hex = palette[TINT_KEYS[Math.max(0, OBJECT_TYPE_POOL.indexOf(typeId as (typeof OBJECT_TYPE_POOL)[number])) % TINT_KEYS.length]];
      paintSurface(g, SLOT_SIZE, SLOT_SIZE, 8, hex, 'soft-push', theme);
    } else {
      // Empty: recessed (deep-emboss) — an open slot waiting to be filled, per the reference
      // sheet's grid treatment (empty cells sit inset, filled cells sit raised).
      paintSurface(g, SLOT_SIZE, SLOT_SIZE, 8, palette.panel, 'deep-emboss', theme);
    }
    slot.addChild(g);
  }
  paint(slot, `#${palette.panel.toString(16).padStart(6, '0')}`);
}
