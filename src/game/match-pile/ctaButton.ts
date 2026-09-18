// what_in: a container + geometry + a palette + a label string + a tap callback.
// what_out: `initCtaButton` — a full interactive-state CTA (Default / Hover / Pressed / Disabled /
//           Selected) matching the element-guide image literally: Default is a near-white,
//           barely-there surface; Hover shifts to a pale tinted surface; only Pressed is the
//           vivid `primary` fill. Motion follows a strict priority — Pressed > Hover > Idle >
//           Default — via `armMotion()` (call once the caller has positioned the container).
// why_here: shared by startView.ts (PLAY) — the only CTA today, but the state machine is generic
//           (w/h/radius/label are all parameters) so a future second CTA reuses it instead of
//           re-deriving the same five states.
//
// State visuals (element-guide image, CTA row):
//   Default  — exact `#4C4C11` fill (task-specified dark-olive literal, see CTA_DEFAULT_FILL
//              below) with a white label, raised bevel (light-top/dark-bottom hairlines) + a
//              below-page drop shadow (brand-cta's own "0 4px 8px" numbers) — reads as a real
//              raised pill, not a flat rectangle.
//   Hover    — `secondary` fill (pale tint), same raised bevel, slightly deeper shadow, plus a
//              quick scale/lift "pop" (pointerMotion.ts's `bounceIn`).
//   Pressed  — `primary` fill (vivid), REVERSED bevel (dark-top/light-bottom — "pressed in"),
//              a much smaller residual shadow, a crisp `accent` ring (a stroke, never a blurred
//              glow), and the container itself shrinks + drops (`pressIn`).
//   Disabled — greyed out (`panel`), reduced alpha, non-interactive, no bevel/shadow/motion.
//   Selected — persistent accent ring over the Default fill (brand-cta-selected).
import { Container, Graphics, Text } from 'pixi.js';
import { paint, shadowOf, shape } from './inspector';
import { drawSoftShadow } from './surface';
import { drawPillBevel } from './bevelSurface';
import { bestTextColorOn, type PaletteKey } from './palette';
import { killMotionTweens, bounceIn, settle, pressIn } from './pointerMotion';
import { startCtaIdlePulse } from './ctaIdlePulse';

/** Exact hex the task specified for the CTA's Default (resting) fill — a deliberate, narrowly-
 * scoped literal for this one element (mirrors board/chrome.ts's `TIMER_COLOR` precedent), not a
 * proposal to change the shared `panel` token globally. Hover/Pressed keep reading from the
 * palette (`secondary`/`primary`) — only Default's fill+label are pinned to this spec. */
const CTA_DEFAULT_FILL = 0x4c4c11;

export interface CtaButtonOptions {
  w: number;
  h: number;
  radius: number;
  label: string;
  fontFamily: string;
  fontSize: number;
  palette: Record<PaletteKey, number>;
  onTap: () => void;
  accessibleTitle: string;
}

export interface CtaButtonHandle {
  container: Container;
  setDisabled: (disabled: boolean) => void;
  setSelected: (selected: boolean) => void;
  /** Call once the caller has set the container's final resting position — starts the idle pulse
   * and arms hover/press motion around that Y (the button doesn't know its own screen position
   * until the caller places it, so motion can't safely start any earlier). */
  armMotion: (restY: number) => void;
}

type Visual = 'default' | 'hover' | 'pressed' | 'disabled';

export function initCtaButton(opts: CtaButtonOptions): CtaButtonHandle {
  const { w, h, radius, palette } = opts;
  const btn = new Container();
  btn.label = 'cta-play';
  btn.accessible = true;
  btn.accessibleTitle = opts.accessibleTitle;
  btn.eventMode = 'static';
  // Pivot at the button's own centre (not the default top-left) — hover/press/idle motion scales
  // this container, and scaling around a corner reads as the button growing lopsidedly toward
  // one edge instead of a clean, symmetric pop. Callers position by centre point, not top-left.
  btn.pivot.set(w / 2, h / 2);

  let selected = false;
  let disabled = false;
  let restY = 0;

  const buildLabel = (fill: number, alpha: number): Text => {
    const t = new Text({ text: opts.label, style: { fontFamily: opts.fontFamily, fontSize: opts.fontSize, fontWeight: '700', fill } });
    t.label = 'text-cta-label';
    t.anchor.set(0.5);
    t.position.set(w / 2, h / 2);
    t.alpha = alpha;
    return t;
  };

  const render = (visual: Visual) => {
    btn.removeChildren().forEach((c) => c.destroy());
    if (visual === 'disabled') {
      btn.addChild(new Graphics().roundRect(0, 0, w, h, radius).fill(palette.panel));
      paint(btn, `#${palette.panel.toString(16).padStart(6, '0')}`);
      btn.addChild(buildLabel(palette.text, 0.4));
      shape(btn, radius);
      return;
    }

    const fillHex = visual === 'pressed' ? palette.primary : visual === 'hover' ? palette.secondary : CTA_DEFAULT_FILL;
    const raised = visual !== 'pressed';
    // Outer drop shadow: brand-cta's own "0 4px 8px" numbers at rest, a touch deeper on hover
    // (lifted feedback), collapsed to almost nothing when pressed (the button has sunk into the
    // page, so it can't also be casting a tall shadow above it).
    if (visual === 'pressed') drawSoftShadow(btn, w, h, radius, 0, 1, 2, 0.12, palette.text);
    else if (visual === 'hover') drawSoftShadow(btn, w, h, radius, 0, 6, 8, 0.16, palette.text);
    else drawSoftShadow(btn, w, h, radius, 0, 4, 8, 0.15, palette.text);

    const face = new Graphics().roundRect(0, 0, w, h, radius).fill(fillHex);
    btn.addChild(face);
    paint(btn, `#${fillHex.toString(16).padStart(6, '0')}`);
    // Bevel: light hairline near the top edge + dark hairline near the bottom when raised
    // (Default/Hover); reversed when pressed — the "obvious, not just a colour swap" pressed-in
    // cue the flat single-fill version never had.
    drawPillBevel(face, w, h, 0xffffff, palette.text, raised);
    shadowOf(btn, visual === 'pressed' ? 'brand-cta-pressed' : 'brand-cta');
    if (visual === 'pressed' || selected) {
      const ring = new Graphics().roundRect(1, 1, w - 2, h - 2, radius - 1).stroke({ width: 2, color: palette.accent, alpha: 0.9 });
      btn.addChild(ring);
      if (selected && visual !== 'pressed') shadowOf(btn, 'brand-cta-selected');
    }
    // Default's label is pinned to white (the task's exact spec) rather than the computed
    // `bestTextColorOn` — it happens to agree here (0x4C4C11 is dark), but a literal is the
    // honest statement of "this was specified," not "this was derived."
    const labelColor = visual === 'pressed' ? palette.onPrimary : visual === 'hover' ? bestTextColorOn(fillHex, palette) : 0xffffff;
    btn.addChild(buildLabel(labelColor, 1));
    shape(btn, radius);
  };

  render('default');

  // Visual state transitions only — NOT where onTap fires. Rebuilding `btn`'s children inside
  // `render('pressed')` on pointerdown apparently invalidates Pixi's hit-test tracking for the
  // matching release (a manual `pointerup` handler here never fired — verified live, the button
  // visibly went to the Pressed fill but the screen never navigated). `pointertap` is Pixi's own
  // synthesized tap event and fires reliably regardless of what happened to the target's
  // children in between — bind the actual action to that instead.
  //
  // Motion priority (Pressed > Hover > Idle > Default): every handler kills whatever motion is
  // currently running (inside bounceIn/settle/pressIn) before starting its own, so exactly one
  // tween ever owns scale/position; `settle`'s `onSettled` only resumes the idle loop once the
  // button has actually finished easing back to rest, never mid-transition.
  btn.on('pointerover', () => { if (!disabled) { render('hover'); bounceIn(btn, restY, 1.06, 4); } });
  btn.on('pointerout', () => { if (!disabled) { render('default'); settle(btn, restY, () => startCtaIdlePulse(btn, restY)); } });
  btn.on('pointerdown', () => { if (!disabled) { render('pressed'); pressIn(btn, restY, 0.97, 2); } });
  btn.on('pointerup', () => { if (!disabled) { render('hover'); bounceIn(btn, restY, 1.06, 4); } });
  btn.on('pointerupoutside', () => { if (!disabled) { render('default'); settle(btn, restY, () => startCtaIdlePulse(btn, restY)); } });
  btn.on('pointertap', () => { if (!disabled) opts.onTap(); });

  return {
    container: btn,
    setDisabled(v: boolean) {
      disabled = v;
      btn.eventMode = v ? 'none' : 'static';
      if (v) killMotionTweens(btn);
      render(v ? 'disabled' : 'default');
    },
    setSelected(v: boolean) {
      selected = v;
      render('default');
    },
    armMotion(y: number) {
      restY = y;
      startCtaIdlePulse(btn, restY);
    },
  };
}
