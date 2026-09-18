// what_in: geometry + a label + a stroke/text colour + a tap callback.
// what_out: `initOutlineButton` — a lightweight bordered/ghost button (transparent fill, coloured
//           stroke + text) for a secondary, lower-emphasis action. Same shared hover/press motion
//           vocabulary as ctaButton.ts/settingsButton.ts (pointerMotion.ts), but a simpler flat
//           outline face — no bevel, no drop shadow, no idle pulse — since this is never the
//           primary CTA.
// why_here: RESULTS→PIXI conversion (tier-a-build-v4) — the Results screen's "Main Menu" action
//           needs an outlined secondary button, which nothing in this game's Pixi UI kit provides
//           yet (ctaButton.ts is deliberately a solid-fill primary CTA). Composed entirely from
//           existing primitives (Graphics stroke + Text + pointerMotion.ts), not new art —
//           incubated here per component-authoring.md until (if ever) it proves reusable
//           elsewhere.
import { Container, Graphics, Text } from 'pixi.js';
import { killMotionTweens, bounceIn, settle, pressIn } from './pointerMotion';

export interface OutlineButtonOptions {
  w: number;
  h: number;
  label: string;
  fontFamily: string;
  fontSize: number;
  /** Stroke + label colour — resting and hover state; Pressed dims both via alpha rather than a
   * second colour, since this button has no fill to swap. */
  colorHex: number;
  onTap: () => void;
  accessibleTitle: string;
}

export interface OutlineButtonHandle {
  container: Container;
  /** Same contract as ctaButton.ts/settingsButton.ts's `armMotion` — call once the caller has
   * positioned this container; the button doesn't know its own resting Y before that. */
  armMotion: (restY: number) => void;
}

export function initOutlineButton(opts: OutlineButtonOptions): OutlineButtonHandle {
  const { w, h, colorHex } = opts;
  const radius = h / 2;
  const btn = new Container();
  btn.label = 'btn-outline';
  btn.accessible = true;
  btn.accessibleTitle = opts.accessibleTitle;
  btn.eventMode = 'static';
  btn.pivot.set(w / 2, h / 2);

  let restY = 0;

  const render = (alpha: number) => {
    btn.removeChildren().forEach((c) => c.destroy());
    const face = new Graphics()
      .roundRect(1, 1, w - 2, h - 2, radius - 1)
      .stroke({ width: 2, color: colorHex, alpha });
    btn.addChild(face);
    const label = new Text({
      text: opts.label,
      style: { fontFamily: opts.fontFamily, fontSize: opts.fontSize, fontWeight: '700', fill: colorHex },
    });
    label.label = 'text-outline-label';
    label.anchor.set(0.5);
    label.alpha = alpha;
    label.position.set(w / 2, h / 2);
    btn.addChild(label);
  };

  render(1);
  // Same Pressed > Hover > Default priority as ctaButton.ts/settingsButton.ts — no idle pulse
  // here, this is never the screen's primary action.
  btn.on('pointerover', () => { render(1); bounceIn(btn, restY, 1.04, 2); });
  btn.on('pointerout', () => { render(1); settle(btn, restY); });
  btn.on('pointerdown', () => { render(0.6); pressIn(btn, restY, 0.96, 1); });
  btn.on('pointerup', () => { render(1); bounceIn(btn, restY, 1.04, 2); });
  btn.on('pointerupoutside', () => { render(1); settle(btn, restY); });
  btn.on('pointertap', () => opts.onTap());

  return {
    container: btn,
    armMotion(y: number) {
      restY = y;
      killMotionTweens(btn);
    },
  };
}
