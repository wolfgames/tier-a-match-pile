/**
 * Start Screen View — Pixi mode
 *
 * Composes the start screen from three @wolfgames/components primitives:
 *   DynamicBackground  — parallax / Ken Burns background layer
 *   SpriteLogoTitle    — logo slot with optional ambient motion
 *   SpriteButton       — interactive Play button with hover/press GSAP
 *
 * Proxy assets are the same ones used in the component workshop
 * (screen-title-dynamic story). Swap them for real atlas textures when art
 * is ready — everything else (layout, animations, events) stays the same.
 */

import { Application, Assets, Container, type Ticker, type Texture } from 'pixi.js';
import gsap from 'gsap';
import { DESIGN_CANVAS } from '@wolfgames/components/core';
import { DesignLayer, trackHostBox } from '@wolfgames/components/pixi';
import { DynamicBackground } from '@wolfgames/components/modules/primitives/dynamic-background';
import { SpriteLogoTitle } from '@wolfgames/components/modules/primitives/sprite-logo-title';
import { SpriteButton } from '@wolfgames/components/modules/primitives/sprite-button';
import { MOTION_PRESETS } from '@wolfgames/components/modules/logic/motion-presets';
import { createPixiBackdrop } from '../../screens/PixiBackdrop';
import type { PixiLoader } from '~/core/systems/assets';
import type {
  StartScreenDeps,
  StartScreenController,
  SetupStartScreen,
} from '~/game/mygame-contract';
import type { GameTuning } from '~/game/tuning/types';

// Workshop proxy assets — same images the component workshop uses.
// Imported via the `modules-src/*` export (raw package src/) because the proxy
// image files are not shipped in the package's compiled `dist/`. The `modules/*`
// export only exposes each module's index.js, so a `modules/.../proxy/*.png`
// import fails to resolve in a clean dev server and build.
import titleLogoUrl from '@wolfgames/components/modules-src/primitives/sprite-logo-title/proxy/placeholder-title.png?url';
import btnMetalUrl from '@wolfgames/components/modules-src/primitives/sprite-button/proxy/slice-metal-small.png?url';
import bgUrl from '@wolfgames/components/modules-src/primitives/dynamic-background/proxy/bg-spaceship-sm.jpg?url';

/* Layout is design px on the library standard canvas (DESIGN_CANVAS, 390×844).
   Converted from the old local 430×932 canvas by the ENG-3804 rule: absolute
   positions scale by s = 844/932 ≈ 0.9056, bottom-anchored positions keep their
   bottom offset, and the scale math itself now lives in the one place that owns
   it. See docs/standards/components.md §9. */
const LOGO_Y = 163;             // 180 × s — logo centre from canvas top
const BTN_Y = DESIGN_CANVAS.height - 152; // unchanged 152 px from the bottom
const LOGO_WIDTH = 308;         // 340 × s
const BUTTON_WIDTH = 217;       // 240 × s
const BUTTON_HEIGHT = 67;       // 74 × s
const BUTTON_FONT_SIZE = 24;    // 26 × s

export const setupStartScreen: SetupStartScreen = (deps: StartScreenDeps): StartScreenController => {
  let app:           Application       | null = null;
  let bg:            DynamicBackground | null = null;
  let logo:          SpriteLogoTitle   | null = null;
  let playBtn:       SpriteButton      | null = null;
  let root:          DesignLayer       | null = null;
  let cleanupResize: (() => void)      | null = null;

  return {
    backgroundColor: '#0d1117',

    init(container: HTMLDivElement) {
      let loading = false;

      const onPlay = async () => {
        if (loading) return;
        loading = true;
        const tl = gsap.timeline({
          onComplete: async () => {
            deps.unlockAudio();
            await deps.loadCore();
            try { await deps.loadAudio(); } catch { /* audio optional */ }
            deps.analytics.trackGameStart({ start_source: 'play_button', is_returning_player: false });
            deps.goto('game');
          },
        });
        if (logo)    tl.to(logo,    { alpha: 0, y: logo.y - 60,    duration: 0.35, ease: 'power2.in' }, 0);
        if (playBtn) tl.to(playBtn, { alpha: 0, y: playBtn.y + 60, duration: 0.3,  ease: 'power2.in' }, 0.05);
        if (bg)      tl.to(bg,      { alpha: 0, duration: 0.5,     ease: 'power2.in' }, 0.1);
      };

      void (async () => {
        try {

        await deps.initGpu();

        app = new Application();
        await app.init({
          resizeTo:        container,
          backgroundAlpha: 0,
          resolution:      Math.min(window.devicePixelRatio, 2),
          autoDensity:     true,
        });
        if (!app) return;
        
        const backdrop = createPixiBackdrop({
          app,
          container,
          zIndex: 0
        });

        // Load proxy textures (same ones the component workshop uses)
        const [bgTex, logoTex, btnTex] = await Promise.all([
          Assets.load<Texture>(bgUrl),
          Assets.load<Texture>(titleLogoUrl),
          Assets.load<Texture>(btnMetalUrl),
        ]);

        // ── DynamicBackground ──────────────────────────────────────────────
        bg = new DynamicBackground({
          width:  app.screen.width,
          height: app.screen.height,
          layers: [{
            texture: bgTex,
            depth: 0.2,
            motion: { type: 'kenBurns', zoom: 0.08, panX: 30, panY: 20, period: 20 },
          }],
        });
        bg.alpha = 0;
        app.stage.addChild(bg as any);

        // ── Design-scale root and layers ───────────────────────────────────
        // Children below are positioned in design px on the 390×844 canvas;
        // the layer owns the one transform that maps them onto the screen.
        root = new DesignLayer();
        app.stage.addChild(root);

        // Explicit layer setup to prevent interaction bugs
        const backgroundLayer = new Container();
        backgroundLayer.eventMode = 'none'; // Kills all pointer events, saving CPU

        const uiLayer = new Container();
        uiLayer.eventMode = 'passive';      // Allows events to "pass through" to interactive children

        root.addChild(backgroundLayer);
        root.addChild(uiLayer);

        const gpuLoader = deps.coordinator.getLoader<PixiLoader>('gpu')!;
        const sc = (deps.tuning.game as GameTuning).startScreen;

        // ── SpriteLogoTitle ────────────────────────────────────────────────
        logo = new SpriteLogoTitle({
          source: { type: 'sprite', texture: logoTex },
          width: LOGO_WIDTH,
          motion: MOTION_PRESETS[sc.logoMotion],
        });
        logo.x = DESIGN_CANVAS.width / 2;
        logo.y = LOGO_Y + 45; // offset below for entrance rise
        logo.alpha = 0;
        backgroundLayer.addChild(logo as any);

        // ── SpriteButton ───────────────────────────────────────────────────
        playBtn = new SpriteButton(gpuLoader, {
          texture: btnTex,
          use9Slice: true,
          // 9-slice borders are texture-space, not design-space — unchanged.
          nineSliceBorders: { leftWidth: 12, topHeight: 12, rightWidth: 12, bottomHeight: 12 },
          width:  BUTTON_WIDTH,
          height: BUTTON_HEIGHT,
          label: 'PLAY',
          labelStyle: { fontSize: BUTTON_FONT_SIZE, fontWeight: 'bold', fill: 0xffffff },
          onClick: () => { void onPlay(); },
          idleMotion: sc.buttonMotion,
        });
        playBtn.x = DESIGN_CANVAS.width / 2;
        playBtn.y = BTN_Y + 72; // offset below for entrance rise
        playBtn.alpha = 0;
        uiLayer.addChild(playBtn as any);

        // ── Entrance animation ─────────────────────────────────────────────
        const tl = gsap.timeline();
        tl.to(bg,      { alpha: 1, duration: 0.8, ease: 'power2.out' }, 0);
        tl.to(logo,    { alpha: 1, y: LOGO_Y, duration: 0.55, ease: 'power3.out' }, 0.25);
        tl.to(playBtn, { alpha: 1, y: BTN_Y,  duration: 0.45, ease: 'power3.out' }, 0.45);

        // ── Ticker + resize ────────────────────────────────────────────────
        app.ticker.add((ticker: Ticker) => bg?.tick(ticker.deltaMS / 1000));

        /* trackHostBox observes the container element, so it catches the frame
           tweening between viewport presets — which Pixi's own `resizeTo`
           (window-resize based) misses. The background is `fluid`: it takes the
           raw box, not the design canvas. */
        cleanupResize = trackHostBox(app, container, [root], (w, h) => {
          bg?.resize(w, h);
        });

        } catch (err) {
          console.error('[startView] init failed:', err);
        }
      })();
    },

    destroy() {
      cleanupResize?.();
      cleanupResize = null;
      gsap.killTweensOf(logo);
      gsap.killTweensOf(playBtn);
      gsap.killTweensOf(bg);
      logo?.destroy();    logo    = null;
      playBtn?.destroy(); playBtn = null;
      bg?.destroy();      bg      = null;
      root?.destroy({ children: true }); root = null;
      
      if (app) {
        if (app.canvas && app.canvas.parentNode) {
          app.canvas.parentNode.removeChild(app.canvas);
        }
        app.destroy(true, { children: true }); 
        app = null;
      }
    },
  };
};
