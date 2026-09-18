// what_in: the start screen's Pixi root container + viewport size + the coordinator/audio deps +
//          an onPlay callback + the settings-panel open/close state (owned by startView.ts, since
//          this function fully rebuilds the tree on every call and can't hold its own state).
// what_out: `paintStartScene` — builds the whole cover-screen visual tree: top header row (real
//           template logo sprite + Pixi settings control), a hero title card + PLAY vertically
//           centred on the viewport as one group, and an instruction line — 100% Pixi, no DOM.
// why_here: COVER-SCREEN REPAIR pass — replaced the hand-drawn wordmark with the real
//           atlas-branding-wolf `logo-wide-small` sprite, replaced the DOM/Pixi settings bridge
//           with a fully Pixi settings icon + popover, and replaced the fixed-offset layout chain
//           with a viewport-height-driven centering formula for the card+PLAY group (see the
//           `groupTop` comment below) — every prior pass kept nudging fixed pixel offsets instead
//           of deriving position from the viewport, which is what actually made every "closer to
//           the reference" fix look arbitrary from one pass to the next.
//
// POLISH pass (tier-a-build-v4): added a one-time fade-in entrance (`opts.animateEntrance` —
// startView.ts only sets this on the very first paint, never on a resize/theme repaint, so the
// screen doesn't re-fade every time the window resizes) and a handful of purely decorative
// background chips reusing gameplay tiles' own visual recipe (see `addDecorTiles` below). The
// background's ambient motion goes through `@wolfgames/components`'s catalog `motion-presets`
// module (`applyMotion`) rather than a hand-rolled tween — component-reuse.md requires the catalog
// check before hand-rolling a new visual/motion primitive, and this is the same composable
// breathe+drift recipe `dynamic-background`'s `kenBurns` layer motion is built from, just applied
// to a plain Container instead of a full-bleed Sprite layer (which is all `dynamic-background`
// itself supports — it needs one texture per layer, not a handful of small chip containers).
import { Container, Graphics, Text } from 'pixi.js';
import gsap from 'gsap';
import { applyMotion, type MotionCleanup } from '@wolfgames/components/modules/logic/motion-presets';
import { paint, shape, shadowOf, fitText } from '../inspector';
import { paletteHexFor, type PaletteKey } from '../palette';
import { drawSoftShadow } from '../surface';
import { initCtaButton } from '../ctaButton';
import { initSettingsButton } from '../settingsButton';
import { buildSettingsPanel, type SettingsPanelAudio } from '../settingsPanel';
import { drawMatchIcon, type MatchShape } from '../matchIcons';
import { LEGEND_COPY } from '../board/legend';
import { FONTS } from '../typography';
import { getGameWorld } from '../world';
import type { AssetCoordinatorFacade } from '~/core/systems/assets';

const SETTINGS_SIZE = 40;
const BTN_W_MAX = 260;
const BTN_H = 72;
const CARD_W_RATIO = 0.86;
const CARD_H = 172;

export interface StartSceneOptions {
  onPlay: () => void;
  coordinator: AssetCoordinatorFacade;
  audio?: SettingsPanelAudio;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  /** SFX pass — fired for the settings popover's own row taps (Music/Sound toggles), the same
   * button-tap sound every other standard control on this screen plays. PLAY/settings-icon taps
   * are wrapped by the caller (startView.ts) directly, since those callbacks originate there. */
  onButtonTap?: () => void;
  /** True only for the very first paint (startView.ts tracks this) — a resize or theme-toggle
   * repaint rebuilds this whole tree from scratch too, and replaying the entrance fade every time
   * the window resizes would read as a bug, not polish. */
  animateEntrance: boolean;
}

/** Alpha 0→1 with an upward settle, staggered per element via `delay`. `liftPx = 0` for the PLAY
 * button specifically — it starts its own continuous idle pulse on `.y` immediately
 * (ctaIdlePulse.ts), and a second tween on the same property would just fight that one; an
 * alpha-only fade has no such conflict. No-ops entirely when `opts.animateEntrance` is false.
 * `duration`/`liftPx` default to the original subtle values; the logo/settings/title-card entrance
 * is deliberately more pronounced (see their call sites) per the "increase the fade-in" request —
 * a longer duration and a taller lift read as a more noticeable entrance without becoming a slide. */
function fadeInEntrance(node: Container, animate: boolean, delay: number, duration = 0.45, liftPx = 10): void {
  if (!animate) return;
  // Target the node's OWN resting alpha (e.g. the instruction line's permanent 0.5), never a bare
  // 1 — some elements are deliberately translucent at rest and this must land there, not override it.
  const targetAlpha = node.alpha;
  const targetY = node.y;
  node.alpha = 0;
  if (liftPx) node.y = targetY + liftPx;
  gsap.to(node, { alpha: targetAlpha, y: targetY, duration, delay, ease: 'sine.out' });
}

// DECOR — a handful of small, low-alpha chips using gameplay tiles' own visual recipe
// (board/tiles.ts#buildTile: a raised rounded chip + a matchIcons.ts vector icon on top), so the
// cover screen reads as "the same game" behind the UI rather than a generic marketing backdrop.
// Purely decorative: no typeId, no gameplay meaning, never tappable. Placed only inside the two
// open bands above the hero card and below the instruction line (paintStartScene computes those
// bounds from the same viewport-driven layout numbers as the card/PLAY group, so this can never
// overlap them regardless of viewport size) — "around the edges", never the centre.
const DECOR_SPECS: ReadonlyArray<{ shape: MatchShape; colorKey: PaletteKey }> = [
  { shape: 'circle', colorKey: 'primary' },
  { shape: 'star', colorKey: 'accent' },
  { shape: 'diamond', colorKey: 'secondary' },
  { shape: 'hexagon', colorKey: 'text' },
  { shape: 'triangle', colorKey: 'primary' },
  { shape: 'cross', colorKey: 'accent' },
  { shape: 'circle', colorKey: 'secondary' },
  { shape: 'hexagon', colorKey: 'primary' },
  { shape: 'triangle', colorKey: 'text' },
];

/** 0.13 read as "not noticeable" — raised to 0.3, still clearly secondary to the foreground UI
 * (whose text/surfaces are all full alpha) but now actually visible as a background layer. */
const DECOR_ALPHA = 0.3;

/** Cover-screen-only settings icon (passed as `drawIcon` below) — the in-game header's settings
 * button keeps board/chrome.ts's default `drawGearGlyph` untouched. That default draws two
 * stroked circles + six radial tooth lines; at this button's on-screen size the overlapping thin
 * strokes anti-alias into a fuzzy, "pixelated" blob, and the teeth reach almost to the button's own
 * edge. This is a single filled polygon (a real vector gear silhouette, poly + a circular cutout
 * via Pixi's `cut()`) instead of a bundle of thin strokes — crisp at any size — and it's sized to
 * ~60% of the button instead of ~80%, so it reads as a small icon inside a button rather than a
 * shape that nearly fills it. */
function drawCoverSettingsIcon(c: Container, size: number, colorHex: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const iconD = size * 0.6;
  const teeth = 8;
  const outerR = iconD * 0.5;
  const innerR = iconD * 0.34;
  const holeR = iconD * 0.19;
  const step = (Math.PI * 2) / teeth;
  const toothHalf = step * 0.24;
  const pts: number[] = [];
  for (let i = 0; i < teeth; i++) {
    const mid = -Math.PI / 2 + i * step;
    pts.push(cx + Math.cos(mid - toothHalf) * outerR, cy + Math.sin(mid - toothHalf) * outerR);
    pts.push(cx + Math.cos(mid + toothHalf) * outerR, cy + Math.sin(mid + toothHalf) * outerR);
    pts.push(cx + Math.cos(mid + step / 2) * innerR, cy + Math.sin(mid + step / 2) * innerR);
  }
  // Pixi's `cut()` subtracts the CURRENT active path from the LAST fill/stroke INSTRUCTION — it
  // has to come after a `.fill()` on the outer shape, not before it. Calling `cut()` before any
  // fill exists is a no-op that just resets the active path (`_initNextPathLocation`), which was
  // exactly why this rendered no icon at all: the poly+circle path got discarded before `.fill()`
  // ever ran. Correct order (per pixi.js's own `pixijs-scene-graphics` skill): shape → fill →
  // hole-shape → cut.
  const g = new Graphics();
  g.poly(pts).fill(colorHex);
  g.circle(cx, cy, holeR).cut();
  c.addChild(g);
}

function buildDecorTile(size: number, spec: { shape: MatchShape; colorKey: PaletteKey }, palette: Record<PaletteKey, number>): Container {
  const c = new Container();
  c.addChild(new Graphics().roundRect(-size / 2, -size / 2, size, size, size * 0.22).fill(palette.panel));
  c.addChild(drawMatchIcon(spec.shape, size, palette[spec.colorKey]));
  c.alpha = DECOR_ALPHA;
  return c;
}

/** `topBand`/`bottomBand`/`centerBand` are [start, end] Y ranges already known to sit outside the
 * card/CTA faces themselves. `centerBand` is the gap between the card's bottom edge and the CTA's
 * top edge (`cardGap` in paintStartScene) — real open space right in the middle of the screen
 * (the whole card+CTA group is vertically centred on the viewport), not a see-through area behind
 * the card: the card and CTA are both fully opaque, so tiles never actually render "through" them
 * regardless of z-order, they just need a real gap to sit in, which this one is. A band shorter
 * than a tile's minimum size (e.g. a very short viewport) is simply skipped — decorative tiles
 * never shrink to fit; they disappear instead, which is the correct "stay out of the way" behaviour.
 *
 * Returns the `MotionCleanup` for the whole-group ambient motion (or null if no tile fit in any
 * band) — the caller must hold onto this and call it before the next repaint tears this tree down
 * (`applyMotion` runs its own `gsap.ticker` callback, which `gsap.killTweensOf` does not touch; not
 * cleaning it up would leave it writing into a destroyed Container every frame after a resize
 * repaint — the same "kill before destroy" guardrail a raw tween would need). */
function addDecorTiles(
  root: Container,
  w: number,
  h: number,
  palette: Record<PaletteKey, number>,
  topBand: readonly [number, number],
  centerBand: readonly [number, number],
  bottomBand: readonly [number, number],
): MotionCleanup | null {
  const decor = new Container();
  decor.label = 'decor-tiles';
  // Pivot on the viewport's own centre so the whole-group ambient zoom below scales symmetrically
  // around the middle of the screen — Pixi containers otherwise scale around their local (0,0),
  // which for a group spanning the full viewport height would read as "zooming from the top-left
  // corner", not a centred camera zoom. (Position mirrors the pivot, so at scale=1 every child
  // still renders at the exact absolute coordinates `place()` below gives it.)
  decor.pivot.set(w / 2, h / 2);
  decor.position.set(w / 2, h / 2);

  const place = (xf: number, band: readonly [number, number], spec: (typeof DECOR_SPECS)[number]) => {
    const bandH = band[1] - band[0];
    if (bandH < 40) return;
    const size = Math.max(26, Math.min(46, bandH * 0.68));
    const tile = buildDecorTile(size, spec, palette);
    tile.position.set(w * xf, band[0] + bandH / 2);
    tile.rotation = (xf < 0.5 ? -1 : 1) * 0.12;
    decor.addChild(tile);
  };
  // Three per band, nine total — a centred one in each band is safe: `topBand`/`bottomBand` sit
  // outside the header/card/CTA/instruction group entirely, and `centerBand` is the open gap
  // between the card and CTA faces (see doc comment above), so none of the three ever collides
  // with the logo, settings icon, card, or CTA.
  place(0.1, topBand, DECOR_SPECS[0]);
  place(0.5, topBand, DECOR_SPECS[1]);
  place(0.9, topBand, DECOR_SPECS[2]);
  place(0.1, centerBand, DECOR_SPECS[3]);
  place(0.5, centerBand, DECOR_SPECS[4]);
  place(0.9, centerBand, DECOR_SPECS[5]);
  place(0.1, bottomBand, DECOR_SPECS[6]);
  place(0.5, bottomBand, DECOR_SPECS[7]);
  place(0.9, bottomBand, DECOR_SPECS[8]);
  root.addChild(decor);
  root.setChildIndex(decor, 1);
  if (decor.children.length === 0) return null;

  // Whole-group ambient "zoom" — a slow scale breathe (the zoom) composed with a slow positional
  // drift (the pan), via the shared `motion-presets` tool. This is the same recipe
  // `dynamic-background`'s `kenBurns` layer motion is built from (see this file's header comment),
  // applied to the whole chip group at once so all four decorative tiles move together as one
  // living background layer instead of four independently pulsing icons.
  return applyMotion(decor, {
    breathe: { amount: 0.06, period: 9 },
    drift: { amplitudeX: 18, amplitudeY: 14, periodX: 12, periodY: 15, phaseX: 0.4 },
  });
}

/** The decorative background's `applyMotion` cleanup, held across repaints — see `addDecorTiles`'s
 * doc comment for why this can't just be a local variable. `stopStartSceneAmbient` is called both
 * at the top of every repaint (before the old tree is destroyed) and from startView.ts's
 * `destroy()` (in case the screen is torn down without one final repaint). */
let decorCleanup: MotionCleanup | null = null;

export function stopStartSceneAmbient(): void {
  decorCleanup?.();
  decorCleanup = null;
}

export function paintStartScene(root: Container, w: number, h: number, opts: StartSceneOptions): void {
  stopStartSceneAmbient();
  for (const c of root.children) gsap.killTweensOf(c);
  root.removeChildren().forEach((c) => c.destroy({ children: true }));
  const theme = getGameWorld().resources.theme;
  const palette = paletteHexFor(theme);

  // GLOBAL VISUAL RULE: full light page background — no black canvas showing through.
  root.addChild(new Graphics().rect(0, 0, w, h).fill(palette.base));

  // Header row — independently anchored near the top (not part of the centred group below),
  // gently responsive to viewport height (clamped) so it never crowds a genuinely short viewport.
  const headerY = Math.max(20, Math.min(h * 0.04, 32));

  // Logo — the real template-amino branding sprite (atlas-branding-wolf.json, frame
  // `logo-wide-small`, 121×19 source), loaded as a GPU bundle by startView.ts before this first
  // runs. NOT redrawn/approximated with text or vector primitives. The source is a plain white
  // silhouette (verified: every opaque pixel is white) — meant to be tinted per background, so
  // tinting it `text` here (for legibility on this screen's light `base`) doesn't alter the art,
  // it's the intended use of a monochrome asset, the same way board/chrome.ts tints its icons.
  const gpu = opts.coordinator.getGpuLoader?.();
  const logoSprite = gpu?.createSprite('core-branding', 'logo-wide-small') ?? null;
  let logoW = 0;
  if (logoSprite) {
    const targetH = 18;
    const scale = targetH / logoSprite.texture.height;
    logoSprite.scale.set(scale);
    logoSprite.tint = palette.text;
    logoSprite.label = 'slot-brand';
    logoW = logoSprite.width;
    logoSprite.position.set(w / 2 - logoW / 2, headerY + (SETTINGS_SIZE - targetH) / 2);
    root.addChild(logoSprite);
    // Increased entrance (longer duration, taller lift) — the logo, settings button, and title
    // card are the three elements the "increase the fade-in" pass singled out for a more
    // noticeable entrance; PLAY and the instruction line keep the original, subtler timing.
    fadeInEntrance(logoSprite, opts.animateEntrance, 0, 0.8, 22);
  }

  // Settings — the ONLY settings control on this screen, 100% Pixi (icon + popover panel), no DOM
  // anywhere. Same raised/hover/pressed tactile language as PLAY.
  const settings = initSettingsButton({
    size: SETTINGS_SIZE,
    palette,
    accessibleTitle: 'Settings',
    onTap: opts.onToggleSettings,
    drawIcon: drawCoverSettingsIcon,
  });
  settings.container.position.set(w - 16 - SETTINGS_SIZE / 2, headerY + SETTINGS_SIZE / 2);
  settings.armMotion(headerY + SETTINGS_SIZE / 2);
  root.addChild(settings.container);
  fadeInEntrance(settings.container, opts.animateEntrance, 0.08, 0.8, 22);

  // Hero card + PLAY: ONE group, centred around the viewport's own vertical midpoint — not a
  // chain of fixed offsets accumulated from the header. `groupH` is the two elements' combined
  // height plus the gap between them; `groupTop` places that whole group so its centre sits at
  // `h * 0.5`, clamped so it can never ride up under the header row on a short viewport.
  const cardW = w * CARD_W_RATIO;
  const cardGap = Math.max(90, Math.min(110, h * 0.13));
  const groupH = CARD_H + cardGap + BTN_H;
  const groupTop = Math.max(headerY + 80, h * 0.5 - groupH / 2);
  const cardY = groupTop;
  const cardRadius = Math.round(Math.min(cardW, CARD_H) * 0.2);

  // Horizontally centred by construction: `(w - cardW) / 2` on both sides is exact. Shadow is
  // deliberately near-symmetric (x offset ≈ 0) rather than a one-sided bias, which would read as
  // the card "leaning" even though the face itself sits at the exact midpoint.
  const card = new Container();
  card.label = 'panel-title-card';
  card.position.set((w - cardW) / 2, cardY);
  drawSoftShadow(card, cardW, CARD_H, cardRadius, 0, 3, 10, 0.13, palette.text);
  card.addChild(new Graphics().roundRect(0, 0, cardW, CARD_H, cardRadius).fill(palette.panel));
  paint(card, `#${palette.panel.toString(16).padStart(6, '0')}`);
  shape(card, cardRadius);
  shadowOf(card, 'soft-push');

  const title = new Text({ text: 'MATCH PILE', style: { fontFamily: FONTS.display, fontSize: 36, fill: palette.text, fontWeight: '600' } });
  title.label = 'text-title';
  title.anchor.set(0.5);
  title.position.set(cardW / 2, CARD_H / 2 - 22);
  fitText(title, cardW - 40);
  card.addChild(title);

  const subtitle = new Text({
    text: 'MATCH & COLLECT',
    style: { fontFamily: FONTS.body, fontSize: 16, fill: palette.text, fontWeight: '400', letterSpacing: 1.5 },
  });
  subtitle.label = 'text-subtitle';
  subtitle.alpha = 0.6;
  subtitle.anchor.set(0.5);
  subtitle.position.set(cardW / 2, CARD_H / 2 + 30);
  fitText(subtitle, cardW - 40);
  card.addChild(subtitle);
  root.addChild(card);
  fadeInEntrance(card, opts.animateEntrance, 0.16, 0.85, 26);

  // PLAY — full state machine (Default/Hover/Pressed/Disabled/Selected); only Pressed is the
  // vivid `primary` fill (see ctaButton.ts header — element-guide-literal). Gap below the card is
  // the SAME `cardGap` the centering formula above already accounted for.
  const btnW = Math.min(BTN_W_MAX, w * 0.68);
  const btnY = cardY + CARD_H + cardGap;
  const cta = initCtaButton({
    w: btnW,
    h: BTN_H,
    radius: BTN_H / 2,
    label: 'PLAY',
    fontFamily: FONTS.display,
    fontSize: 22,
    palette,
    accessibleTitle: 'Play',
    onTap: opts.onPlay,
  });
  // Centre-point placement, not top-left — ctaButton.ts pivots this container to its own centre.
  const btnCenterY = btnY + BTN_H / 2;
  cta.container.position.set(w / 2, btnCenterY);
  root.addChild(cta.container);
  cta.armMotion(btnCenterY);
  // liftPx=0: armMotion already owns a continuous tween on `.y` (the idle pulse) — an alpha-only
  // fade is the only kind that can't collide with it. See fadeInEntrance's own doc comment.
  fadeInEntrance(cta.container, opts.animateEntrance, 0.24, 0.45, 0);

  // Instruction — one short centred line below PLAY, reusing the same permanent rule copy as the
  // game screen's instruction bar/legend. Small, muted, clearly secondary to the CTA — and never
  // part of the centering calculation above (it hangs off PLAY's own position, not the viewport).
  const instruction = new Text({
    text: LEGEND_COPY,
    style: { fontFamily: FONTS.body, fontSize: 15, fill: palette.text, fontWeight: '400', letterSpacing: 0.5 },
  });
  instruction.label = 'text-instruction';
  instruction.alpha = 0.5;
  instruction.anchor.set(0.5, 0);
  instruction.position.set(w / 2, btnY + BTN_H + 26);
  fitText(instruction, w * 0.9);
  root.addChild(instruction);
  fadeInEntrance(instruction, opts.animateEntrance, 0.3);

  // Decorative background chips — inserted behind everything above (see addDecorTiles's own
  // `setChildIndex`), confined to the three open bands this layout already leaves: above the hero
  // card, the gap between the card and CTA (the screen's own visual centre), and below the
  // instruction line. Approximate instruction line height (~20px) padded to a full text-line's
  // worth of clearance so a chip can never sit flush against the actual text.
  const instructionBottom = btnY + BTN_H + 26 + 24;
  decorCleanup = addDecorTiles(
    root,
    w,
    h,
    palette,
    [headerY + SETTINGS_SIZE + 16, cardY - 12],
    [cardY + CARD_H, btnY],
    [instructionBottom, h - 12],
  );

  // Settings must always have priority on screen — never covered by the title card (or anything
  // else). `root.addChild` on a node that's already a child of `root` doesn't duplicate it, it
  // moves it to the end of the children array, i.e. the top of the paint order — so re-adding the
  // button here (already built above, with its position/motion/fade already wired) guarantees it
  // renders above the card/CTA/instruction/decor added since. The popover panel is built here for
  // the same reason: constructing it earlier (before the card) meant a tall panel on a short
  // viewport could render underneath the hero card instead of over it.
  root.addChild(settings.container);
  if (opts.settingsOpen && opts.audio) {
    const panel = buildSettingsPanel(
      () => theme,
      opts.audio,
      () => getGameWorld().transactions.setTheme({ theme: theme === 'dark' ? 'light' : 'dark' }),
      opts.onButtonTap,
    );
    panel.container.position.set(w - 16 - panel.container.width, headerY + SETTINGS_SIZE + 10);
    root.addChild(panel.container);
  }
}
