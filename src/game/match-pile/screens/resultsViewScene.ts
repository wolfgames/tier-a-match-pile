// what_in: the results screen's Pixi root container + viewport size + the coordinator + the run's
//          final, frozen state (won/score/stars) + navigation callbacks. `paintResultsScene` never
//          reads game state itself (renderers.md/A5 — content composed from data handed in); the
//          caller (resultsView.ts) reads it once from the ECS world.
// what_out: `paintResultsScene` — builds the whole results-screen visual tree: header logo, a
//           card (headline, animated score count-up, star row, primary CTA + Main Menu) — 100%
//           Pixi, no DOM. Returns a cleanup function the caller MUST hold and call before the
//           next repaint tears this tree down (see the cleanup note below).
// why_here: RESULTS→PIXI conversion (tier-a-build-v4) — this screen was DOM (ResultsScreen.tsx);
//           converted to keep this game's UI on one renderer end-to-end and reuse the cover
//           screen's own Pixi UI kit (ctaButton.ts, matchIcons.ts's star glyph, outlineButton.ts)
//           instead of a parallel DOM implementation. Mirrors startViewScene.ts's architecture
//           (same header logo treatment, same soft-push card language, same "animate only on
//           first paint" fix — see `animate` below).
import { Container, Graphics, Text } from 'pixi.js';
import gsap from 'gsap';
import { paint, shape, shadowOf } from '../inspector';
import { paletteHexFor } from '../palette';
import { drawSoftShadow } from '../surface';
import { initCtaButton } from '../ctaButton';
import { initOutlineButton } from '../outlineButton';
import { drawMatchIcon } from '../matchIcons';
import { FONTS } from '../typography';
import { getGameWorld } from '../world';
import type { AssetCoordinatorFacade } from '~/core/systems/assets';

const LOGO_TARGET_H = 22;
const CARD_RADIUS = 24;
// Was 440 (then-tuned so the card's bottom padding stayed visually symmetric with the top).
// -84 for the removed hero badge's own footprint (its 72px circle + 20px gap) minus the 8px kept
// as the new top padding (36→44) — the same bottom-padding-matches-top intent, recomputed for
// one less element instead of also shrinking every other gap.
const CARD_H = 356;
const STAR_COUNT = 5;
const STAR_SIZE = 48;
const STAR_GAP = 6;
const BTN_H = 52;
const MENU_BTN_H = 44;
/** Results-screen override for the tenant's bright yellow/lime primary+accent tokens (#DFFF00) —
 * used here (only) for the score value, filled stars, and the Main Menu text/outline, per spec.
 * Scoped to this file via a local const rather than editing brand.tokens.json, which would also
 * recolor the cover screen's PLAY button and board tiles. */
const RESULTS_ACCENT_HEX = 0x4c4c11;

export interface ResultsSceneOptions {
  coordinator: AssetCoordinatorFacade;
  won: boolean;
  score: number;
  stars: number;
  onTryAgain: () => void;
  onNextLevel: () => void;
  onMainMenu: () => void;
  /** True only for the very first paint — a resize repaint rebuilds this same tree from scratch
   * (this function's own top-of-function teardown) and must not replay the hero pop/score
   * count-up/star stagger every time, or resizing the window would look like a bug. Same fix as
   * startViewScene.ts's `animateEntrance`. */
  animate: boolean;
  /** SFX pass — fired for the CTA (Next Level/Try Again) and Main Menu button taps, the same
   * button-tap sound every other standard control uses. */
  onButtonTap?: () => void;
  /** SFX pass — fired exactly when an EARNED star's pop-in tween starts (never for an unfilled
   * slot), with its 0-based index so the caller can play an ascending-pitch clip per star. */
  onStarReveal?: (index: number) => void;
}

/** Returns a cleanup that kills every tween this paint started, including the score count-up
 * (which tweens a plain `{v}` proxy object, not a Pixi display object — a recursive
 * `gsap.killTweensOf` walk over `root`'s children would never reach it). The CALLER must call
 * this returned cleanup — and only after that, clear `root`'s children — before the next repaint,
 * and on destroy. This function does not clear `root` itself: unlike startViewScene.ts's
 * self-contained teardown (safe there because a plain child-tween kill is enough), this screen's
 * tweens include that off-tree proxy object, so the order (kill tweens, kept by the caller across
 * calls in a closure, THEN destroy children) has to be the caller's responsibility. */
export function paintResultsScene(root: Container, w: number, h: number, opts: ResultsSceneOptions): () => void {
  const tweens: gsap.core.Tween[] = [];
  const theme = getGameWorld().resources.theme;
  const palette = paletteHexFor(theme);

  root.addChild(new Graphics().rect(0, 0, w, h).fill(palette.base));

  // Header logo — the real template-amino branding sprite, same treatment as
  // startViewScene.ts/board/chrome.ts (never redrawn with text/vector primitives).
  const headerY = Math.max(20, Math.min(h * 0.04, 32));
  const gpu = opts.coordinator.getGpuLoader?.();
  const logoSprite = gpu?.createSprite('core-branding', 'logo-wide-small') ?? null;
  if (logoSprite) {
    const scale = LOGO_TARGET_H / logoSprite.texture.height;
    logoSprite.scale.set(scale);
    logoSprite.tint = palette.text;
    logoSprite.anchor.set(0.5, 0);
    logoSprite.label = 'slot-brand';
    logoSprite.position.set(w / 2, headerY);
    root.addChild(logoSprite);
  }

  // Hero card — a fixed content budget (CARD_H), vertically centred in the space below the
  // header (clamped so it never rides up under it on a short viewport) — same centring approach
  // startViewScene.ts uses for its own card+PLAY group.
  const cardW = Math.min(320, w * 0.88);
  const headerBottom = headerY + LOGO_TARGET_H + 20;
  const cardY = Math.max(headerBottom, (h - CARD_H) / 2);
  const cardX = (w - cardW) / 2;

  const card = new Container();
  card.label = 'panel-results-card';
  card.position.set(cardX, cardY);
  drawSoftShadow(card, cardW, CARD_H, CARD_RADIUS, 0, 3, 10, 0.13, palette.text);
  card.addChild(new Graphics().roundRect(0, 0, cardW, CARD_H, CARD_RADIUS).fill(palette.panel));
  paint(card, `#${palette.panel.toString(16).padStart(6, '0')}`);
  shape(card, CARD_RADIUS);
  shadowOf(card, 'soft-push');
  root.addChild(card);

  // Decorative hero badge (a plain filled circle) removed per spec — no replacement decoration.
  // Top padding bumped from 36 to 44 (a tiny adjustment, not a re-layout) since the headline is
  // now the card's first element; every spacing below it (headline→score→stars→buttons) is
  // untouched.
  let y = 44;

  const headline = new Text({
    text: opts.won ? 'Pile Cleared!' : 'Tray Full — Try Again',
    style: { fontFamily: FONTS.display, fontSize: 20, fontWeight: '700', fill: palette.text },
  });
  headline.label = 'text-headline';
  headline.anchor.set(0.5, 0);
  headline.position.set(cardW / 2, y);
  card.addChild(headline);
  y += 32;

  // Score — animated count-up (U5), same timing as the DOM screen this replaces: delayed well
  // past the star stagger below so it's still visibly progressing during its own sampling window.
  const scoreText = new Text({
    text: opts.animate ? '0' : `${opts.score}`,
    style: { fontFamily: FONTS.numeric, fontSize: 40, fontWeight: '700', fill: RESULTS_ACCENT_HEX },
  });
  scoreText.label = 'text-score';
  scoreText.anchor.set(0.5, 0);
  scoreText.position.set(cardW / 2, y);
  card.addChild(scoreText);
  if (opts.animate) {
    const counter = { v: 0 };
    tweens.push(
      gsap.to(counter, {
        v: opts.score,
        duration: 2.5,
        delay: 1.5,
        ease: 'power2.out',
        onUpdate: () => { scoreText.text = `${Math.round(counter.v)}`; },
      }),
    );
  }
  y += 56;

  // Star row — the SAME vector star glyph matchIcons.ts draws for match pieces, not a new
  // drawing. Filled (accent) only when won; dim (low-alpha text) otherwise — matches the DOM
  // screen's `won && i < stars` condition exactly (all dim on a loss, regardless of `stars`).
  const rowW = STAR_COUNT * STAR_SIZE + (STAR_COUNT - 1) * STAR_GAP;
  const starsRow = new Container();
  starsRow.position.set(cardW / 2 - rowW / 2 + STAR_SIZE / 2, y);
  for (let i = 0; i < STAR_COUNT; i++) {
    const filled = opts.won && i < opts.stars;
    const star = drawMatchIcon('star', STAR_SIZE, filled ? RESULTS_ACCENT_HEX : palette.text);
    if (!filled) star.alpha = 0.2;
    star.position.set(i * (STAR_SIZE + STAR_GAP), STAR_SIZE / 2);
    starsRow.addChild(star);
    if (opts.animate && opts.won) {
      star.scale.set(0);
      tweens.push(gsap.to(star.scale, {
        x: 1, y: 1, duration: 0.18, delay: 0.5 + i * 0.18, ease: 'back.out(1.7)',
        // Only earned slots get a chime — this same tween also pops in the dim, unearned slots
        // (a pre-existing quirk of the `opts.animate && opts.won` guard above, unrelated to this
        // SFX pass and left as-is), so the audio gate has to be `filled`, not the tween's own gate.
        onStart: () => { if (filled) opts.onStarReveal?.(i); },
      }));
    }
  }
  card.addChild(starsRow);
  y += STAR_SIZE + 30;

  // Primary CTA — the SAME component the cover screen's PLAY button uses.
  const cta = initCtaButton({
    w: cardW - 56,
    h: BTN_H,
    radius: BTN_H / 2,
    label: opts.won ? 'Next Level' : 'Try Again',
    fontFamily: FONTS.display,
    fontSize: 16,
    palette,
    accessibleTitle: opts.won ? 'Next Level' : 'Try Again',
    onTap: () => { opts.onButtonTap?.(); (opts.won ? opts.onNextLevel : opts.onTryAgain)(); },
  });
  const ctaCenterY = y + BTN_H / 2;
  cta.container.position.set(cardW / 2, ctaCenterY);
  card.addChild(cta.container);
  cta.armMotion(ctaCenterY);
  y += BTN_H + 12;

  // Main Menu — outline/ghost secondary action, exact `#4C4C11` per spec.
  const menu = initOutlineButton({
    w: cardW - 96,
    h: MENU_BTN_H,
    label: 'Main Menu',
    fontFamily: FONTS.display,
    fontSize: 14,
    colorHex: RESULTS_ACCENT_HEX,
    accessibleTitle: 'Main Menu',
    onTap: () => { opts.onButtonTap?.(); opts.onMainMenu(); },
  });
  const menuCenterY = y + MENU_BTN_H / 2;
  menu.container.position.set(cardW / 2, menuCenterY);
  card.addChild(menu.container);
  menu.armMotion(menuCenterY);

  return () => tweens.forEach((t) => t.kill());
}
