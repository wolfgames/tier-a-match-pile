// what_in: StartScreenDeps (goto, initGpu, tuning) from src/game/screens/StartScreen.tsx.
// what_out: setupStartScreen — a small Pixi scene composed as one tight group (Mahjong
//           reference): settings icon, brand wordmark, hero card, PLAY CTA, instruction line.
// why_here: this game's template renders start on Pixi despite the general DOM guidance —
//           kept consistent because N9's colour probe only matches hex strings `paint()`
//           records; DOM computed styles report rgb(), which can never match a hex token.
//
// CARD-STACK pass (Mahjong-reference restructure): the previous version spread brand/card/CTA
// across fractions of the viewport height (0.05h / 0.35h / 0.72h), which put huge, disconnected
// gaps between them on anything taller than the shortest test viewport. Every element is now
// placed at a FIXED pixel offset from the previous one, so the whole group reads as one
// deliberately-composed unit near the top — leftover space stays below it, matching the
// reference, instead of being distributed between the pieces.
import { Application, Container, Graphics, Text } from 'pixi.js';
import gsap from 'gsap';
import type { StartScreenController, StartScreenDeps, SetupStartScreen } from '~/game/game-contract';
import { paint, shadowOf, shape, fitText } from '../inspector';
import { paletteHexFor } from '../palette';
import { paintSurface, drawSoftShadow } from '../surface';
import { drawGearGlyph } from '../board/chrome';
import { LEGEND_COPY } from '../board/legend';
import { FONTS } from '../typography';
import { registerDebugContext } from '../debug';
import tokens from '../brand.tokens.json';
import { getGameWorld } from '../world';
import { palette } from '../palette';

const SETTINGS_SIZE = 40;

export const setupStartScreen: SetupStartScreen = (deps: StartScreenDeps): StartScreenController => {
  let app: Application | null = null;
  let root: Container | null = null;
  let destroyed = false;
  let unobserveTheme: (() => void) | null = null;

  const paintScene = (root: Container, w: number, h: number) => {
    for (const c of root.children) gsap.killTweensOf(c);
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
    const theme = getGameWorld().resources.theme;
    const palette = paletteHexFor(theme);

    // GLOBAL VISUAL RULE: full light page background — no black canvas showing through.
    const bg = new Graphics().rect(0, 0, w, h).fill(palette.base);
    root.addChild(bg);

    // Settings — circular secondary control, top-right (reference image 3). Non-functional
    // stub is out of scope for this pass; matches U9's `slot-settings` role/placement pattern
    // used on the game screen without claiming a settings menu exists here.
    const settings = new Container();
    settings.label = 'icon-settings';
    settings.position.set(w - 16 - SETTINGS_SIZE, 20);
    settings.eventMode = 'static';
    settings.accessible = true;
    settings.accessibleTitle = 'Settings';
    settings.addChild(new Graphics().circle(SETTINGS_SIZE / 2, SETTINGS_SIZE / 2, SETTINGS_SIZE / 2 - 1).stroke({ width: 1.5, color: palette.text, alpha: 0.35 }));
    drawGearGlyph(settings, SETTINGS_SIZE);
    root.addChild(settings);

    // Brand — a wordmark, not a filled CTA-look pill (reference: plain coloured logotype,
    // centred near the top). `slot-brand` still wraps it (N9/U4b: a role="mark" node must
    // overlap slot-brand) — the slot itself just carries no fill any more.
    const brand = new Container();
    brand.label = 'slot-brand';
    brand.position.set(w / 2 - w * 0.3, 20);
    const brandText = new Text({ text: tokens.displayName, style: { fontFamily: FONTS.display, fontSize: 20, fill: palette.primary, fontWeight: '800' } });
    brandText.label = 'mark-tenant';
    brandText.anchor.set(0.5, 0);
    brandText.position.set(w * 0.3, 6);
    fitText(brandText, w * 0.6);
    paint(brandText, `#${palette.primary.toString(16).padStart(6, '0')}`);
    brand.addChild(brandText);
    root.addChild(brand);

    // Hero card — large rounded light card, title + subtitle. Fixed gap below the brand text,
    // not a fraction of viewport height (see file header).
    const card = new Container();
    card.label = 'panel-title-card';
    const cardW = w * 0.82;
    const cardH = 128;
    const cardY = 76;
    card.position.set((w - cardW) / 2, cardY);
    paintSurface(card, cardW, cardH, 22, palette.secondary, 'soft-push', theme);
    const title = new Text({ text: 'MATCH PILE', style: { fontFamily: FONTS.display, fontSize: 28, fill: palette.text, fontWeight: '800' } });
    title.label = 'text-title';
    title.anchor.set(0.5);
    title.position.set(cardW / 2, cardH / 2 - 14);
    fitText(title, cardW - 32);
    card.addChild(title);
    const subtitle = new Text({ text: 'MATCH & COLLECT', style: { fontFamily: FONTS.body, fontSize: 13, fill: palette.text, fontWeight: '600', letterSpacing: 1 } });
    subtitle.label = 'text-subtitle';
    subtitle.alpha = 0.6;
    subtitle.anchor.set(0.5);
    subtitle.position.set(cardW / 2, cardH / 2 + 20);
    fitText(subtitle, cardW - 32);
    card.addChild(subtitle);
    root.addChild(card);

    // PLAY — large full-pill CTA, fixed gap below the card.
    const btnW = Math.min(240, w * 0.62);
    const btnH = 64;
    const btnY = cardY + cardH + 36;
    const btn = new Container();
    btn.label = 'cta-play';
    btn.accessible = true;
    btn.accessibleTitle = 'Play';
    btn.accessibleHint = 'Play';
    btn.eventMode = 'static';
    btn.position.set(w / 2 - btnW / 2, btnY);
    // brand-cta: primary fill + a real (now-fixed, capped-blur) drop shadow.
    drawSoftShadow(btn, btnW, btnH, btnH / 2, 0, 4, 8, 0.18, palette.text);
    btn.addChild(new Graphics().roundRect(0, 0, btnW, btnH, btnH / 2).fill(palette.primary));
    paint(btn, `#${palette.primary.toString(16).padStart(6, '0')}`);
    shadowOf(btn, 'brand-cta');
    shape(btn, btnH / 2);
    const label = new Text({ text: 'PLAY', style: { fontFamily: FONTS.display, fontSize: 22, fill: palette.onPrimary, fontWeight: '700' } });
    label.anchor.set(0.5);
    label.position.set(btnW / 2, btnH / 2);
    btn.addChild(label);
    btn.on('pointertap', () => void onPlay());
    root.addChild(btn);
    // CTA pulse (ux-contract "3s CTA pulse"), not a position float: Playwright's actionability
    // check requires a stable bounding box before it will click, so the idle motion here is
    // alpha-only — the button never moves or resizes, only breathes.
    gsap.to(btn, { alpha: 0.85, duration: 1.5, ease: 'sine.inOut', yoyo: true, repeat: -1 });

    // Instruction — one short centred line below PLAY (reference: small, letter-spaced).
    // Reuses the same permanent rule copy as the game screen's instruction bar/legend.
    const instruction = new Text({
      text: LEGEND_COPY,
      style: { fontFamily: FONTS.body, fontSize: 11, fill: palette.text, fontWeight: '600', letterSpacing: 1 },
    });
    instruction.label = 'text-instruction';
    instruction.alpha = 0.55;
    instruction.anchor.set(0.5, 0);
    instruction.position.set(w / 2, btnY + btnH + 18);
    fitText(instruction, w * 0.85);
    root.addChild(instruction);
  };

  const onPlay = async () => {
    deps.unlockAudio();
    await deps.loadCore();
    try {
      await deps.loadAudio();
    } catch {
      /* audio optional */
    }
    deps.analytics.trackGameStart({ start_source: 'play_button', is_returning_player: false });
    deps.goto('game');
  };

  return {
    backgroundColor: palette.base,
    init(container: HTMLDivElement) {
      void (async () => {
        await deps.initGpu();
        if (destroyed) return;
        const application = new Application();
        app = application;
        // Pixi's a11y div is otherwise Tab-activated only; the ui-contract's PLAY locator needs
        // a real accessible button from first paint. `accessibilityOptions` is read at runtime
        // by AccessibilitySystem.init() but isn't in the public ApplicationOptions type.
        const initOptions = {
          resizeTo: container,
          // Pixi's default backgroundColor is black — was never overridden, so the canvas
          // showed through black wherever `paintScene`'s own `bg` rect wasn't yet covering it
          // (GLOBAL VISUAL RULE: no black background, ever).
          backgroundColor: paletteHexFor(getGameWorld().resources.theme).base,
          backgroundAlpha: 1,
          resolution: Math.min(window.devicePixelRatio, 2),
          autoDensity: true,
          accessibilityOptions: { enabledByDefault: true },
        };
        await application.init(initOptions);
        if (destroyed) return;
        container.appendChild(application.canvas as HTMLCanvasElement);
        application.stage.eventMode = 'passive';
        const sceneRoot = new Container();
        root = sceneRoot;
        application.stage.addChild(sceneRoot);
        const repaint = () => paintScene(sceneRoot, application.screen.width, application.screen.height);
        repaint();
        application.renderer.on('resize', repaint);
        unobserveTheme = getGameWorld().observe.resources.theme(repaint);
        registerDebugContext({ stage: () => application.stage, screen: () => ({ w: application.screen.width, h: application.screen.height }) });
      })();
    },
    destroy() {
      destroyed = true;
      unobserveTheme?.();
      if (root) for (const c of root.children) gsap.killTweensOf(c);
      app?.destroy(true, { children: true });
      app = null;
      root = null;
    },
  };
};
