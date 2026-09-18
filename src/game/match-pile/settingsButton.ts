// what_in: a target diameter + a palette + a tap callback.
// what_out: `initSettingsButton` — a compact circular control with the SAME raised/hover/pressed
//           surface and motion language as ctaButton.ts's PLAY (bevel + shadow + bounce/recess,
//           not a flat single fill or a static icon).
// why_here: this screen's settings control is 100% Pixi (no DOM) — `onTap` is wired by the caller
//           to open/close settingsPanel.ts's popover, not any DOM component.
import { Container, Graphics } from 'pixi.js';
import { paint, shadowOf, shape } from './inspector';
import { drawSoftShadow } from './surface';
import { drawCircleBevel } from './bevelSurface';
import { drawGearGlyph } from './board/chrome';
import { killMotionTweens, bounceIn, settle, pressIn } from './pointerMotion';
import type { PaletteKey } from './palette';

export interface SettingsButtonOptions {
  size: number;
  palette: Record<PaletteKey, number>;
  accessibleTitle: string;
  onTap: () => void;
  /** Overrides the default gear icon (board/chrome.ts#drawGearGlyph). Lets one specific caller
   * swap in its own icon rendering without touching every `initSettingsButton` consumer.
   * `colorHex` is the caller's live, theme-resolved `palette.text`, forwarded straight through to
   * whichever icon fn runs (default or override) — DARK-MODE pass: `drawGearGlyph` used to ignore
   * this and read the fixed light-only palette internally; both are theme-correct now. */
  drawIcon?: (c: Container, size: number, colorHex: number) => void;
}

export interface SettingsButtonHandle {
  container: Container;
  /** Same contract as ctaButton.ts's `armMotion` — call once the caller has positioned this
   * container; the button doesn't know its own resting Y before that. */
  armMotion: (restY: number) => void;
}

type Visual = 'default' | 'hover' | 'pressed';

export function initSettingsButton(opts: SettingsButtonOptions): SettingsButtonHandle {
  const { size, palette } = opts;
  const r = size / 2;
  const btn = new Container();
  btn.label = 'icon-settings';
  btn.accessible = true;
  btn.accessibleTitle = opts.accessibleTitle;
  btn.eventMode = 'static';
  btn.pivot.set(r, r);

  let restY = 0;

  const render = (visual: Visual) => {
    btn.removeChildren().forEach((c) => c.destroy());
    const raised = visual !== 'pressed';
    const fillHex = visual === 'pressed' ? palette.secondary : palette.panel;
    if (visual === 'pressed') drawSoftShadow(btn, size, size, r, 0, 1, 2, 0.1, palette.text);
    else if (visual === 'hover') drawSoftShadow(btn, size, size, r, 0, 5, 6, 0.15, palette.text);
    else drawSoftShadow(btn, size, size, r, 0, 3, 6, 0.13, palette.text);

    const face = new Graphics().circle(r, r, r).fill(fillHex);
    btn.addChild(face);
    paint(btn, `#${fillHex.toString(16).padStart(6, '0')}`);
    drawCircleBevel(face, r, r, r, 0xffffff, palette.text, raised);
    (opts.drawIcon ?? drawGearGlyph)(btn, size, palette.text);
    shadowOf(btn, visual === 'pressed' ? 'deep-emboss' : 'soft-push');
    shape(btn, r);
  };

  render('default');
  // Same Pressed > Hover > Idle(none here) > Default priority as PLAY — see ctaButton.ts.
  btn.on('pointerover', () => { render('hover'); bounceIn(btn, restY, 1.08, 3); });
  btn.on('pointerout', () => { render('default'); settle(btn, restY); });
  btn.on('pointerdown', () => { render('pressed'); pressIn(btn, restY, 0.94, 2); });
  btn.on('pointerup', () => { render('hover'); bounceIn(btn, restY, 1.08, 3); });
  btn.on('pointerupoutside', () => { render('default'); settle(btn, restY); });
  btn.on('pointertap', () => opts.onTap());

  return {
    container: btn,
    armMotion(y: number) {
      restY = y;
      killMotionTweens(btn);
    },
  };
}
