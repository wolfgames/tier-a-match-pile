// what_in: `slot-powerups` container + a tap callback.
// what_out: `initHintOnce` — the U4 hint button (line-icon lightbulb, N7 style, soft-push
//           circle), built once; `updateHint` — shows/hides/greys it per `hintVisibility()`.
// why_here: U4 requires a hint button always present (after FTUE) on the gameplay page; the
//           `slot-powerups` container existed in layout.ts but nothing ever drew a button into
//           it (see build-status notes). Only one powerup exists (`UX-POWERUPS-DESCOPE` —
//           shuffle/undo/hammer/+1-slot are out of MVP scope), so this row holds hint alone.
import { Container, Graphics } from 'pixi.js';
import { paint, shadowOf, shape } from '../inspector';
import { paletteHex } from '../palette';
import { paintSurface } from '../surface';

const SIZE = 44;

/** N7 line-icon lightbulb: circle bulb + two short "base" strokes, 1.5px, in `text` colour. */
function drawLightbulbGlyph(c: Container): void {
  const g = new Graphics();
  g.circle(SIZE / 2, SIZE / 2 - 3, 9).stroke({ width: 1.5, color: paletteHex.text });
  g.moveTo(SIZE / 2 - 4, SIZE / 2 + 7).lineTo(SIZE / 2 + 4, SIZE / 2 + 7).stroke({ width: 1.5, color: paletteHex.text });
  g.moveTo(SIZE / 2 - 3, SIZE / 2 + 11).lineTo(SIZE / 2 + 3, SIZE / 2 + 11).stroke({ width: 1.5, color: paletteHex.text });
  c.addChild(g);
}

/** Built once — the icon's own visuals never change, only visibility/alpha/interactivity. */
export function initHintOnce(powerupsSlot: Container, onTap: () => void): Container {
  const hint = new Container();
  hint.label = 'hint';
  hint.position.set(0, 6);
  paintSurface(hint, SIZE, SIZE, SIZE / 2, paletteHex.panel, 'soft-push');
  drawLightbulbGlyph(hint);
  hint.accessible = true;
  hint.accessibleTitle = 'Hint';
  hint.on('pointertap', onTap);
  powerupsSlot.addChild(hint);
  return hint;
}

/** Re-registers paint()/shadowOf()/shape() on every call since they key off `c.label`, which
 * never changes here — cheap, and keeps the inspector bookkeeping correct even though the
 * visuals themselves are static. */
function reregister(hint: Container): void {
  paint(hint, `#${paletteHex.panel.toString(16).padStart(6, '0')}`);
  shadowOf(hint, 'soft-push');
  shape(hint, SIZE / 2);
}

/** U3/U4: hidden outside real play / during FTUE; greyed (dimmed + non-interactive) once spent. */
export function updateHint(hint: Container, visible: boolean, enabled: boolean): void {
  hint.visible = visible;
  if (!visible) return;
  hint.alpha = enabled ? 1 : 0.4;
  hint.eventMode = enabled ? 'static' : 'none';
  reregister(hint);
}
