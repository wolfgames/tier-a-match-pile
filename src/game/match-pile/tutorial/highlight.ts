// what_in: the real Pixi node an FTUE step names — a tile view, the Slots Row, the Orders HUD,
//          or the Timer's own Text.
// what_out: a blue (FTUE_HIGHLIGHT_HEX, palette.ts) glow-outline pulse for tile/row targets, and
//          a colour pulse straight on the Timer's own text fill — replaces tutorial/emphasise.ts's
//          scale-only pulse (VFX pass).
// why_here: tutorial/ — emphasise the real control, never an overlay glyph (U12); no tutorial/hand.ts.
// catalog: considered primitives/hotspot (fade-in FILL overlay — would obscure tile/row content)
//          and primitives/ambilight (glow behind an atlas sprite frame — these targets are hand-
//          drawn Graphics, not atlas sprites). Neither fits an outline-only glow around an
//          arbitrary Container's own bounds. A small layered-stroke Graphics glow is hand-rolled
//          instead (guardrail-safe: strokes only, no BlurFilter).
import gsap from 'gsap';
import { Container, Graphics, type Text } from 'pixi.js';
import { shadowOf } from '../inspector';
import { FTUE_HIGHLIGHT_HEX } from '../palette';

const GLOW_LAYERS = [
  { pad: 11, width: 9, alpha: 0.07 },
  { pad: 7, width: 7, alpha: 0.14 },
  { pad: 3, width: 5, alpha: 0.28 },
  { pad: 0, width: 3, alpha: 0.95 },
] as const;

function drawGlow(x: number, y: number, w: number, h: number): Graphics {
  const g = new Graphics();
  const radius = Math.min(16, Math.min(w, h) * 0.3);
  for (const layer of GLOW_LAYERS) {
    g.roundRect(x - layer.pad, y - layer.pad, w + layer.pad * 2, h + layer.pad * 2, radius + layer.pad)
      .stroke({ width: layer.width, color: FTUE_HIGHLIGHT_HEX, alpha: layer.alpha });
  }
  g.eventMode = 'none';
  return g;
}

/** `node.getLocalBounds()` includes any drop-shadow Graphics drawn wider than the actual solid
 * body (board/tiles.ts's hand-drawn tiles, or anything painted via surface.ts#paintSurface —
 * tray slots, cards, panels), which is why a highlight used to read as a larger rectangle around
 * the shape rather than hugging it. `tile-face` (tiles.ts) and `surface-face` (surface.ts) are
 * the exact solid-body Graphics in each case — use whichever is present; targets with neither
 * (Orders HUD row, etc.) fall back to the container's own bounds. */
function preciseBounds(node: Container): { x: number; y: number; width: number; height: number } {
  const face = node.children.find((c) => c.label === 'tile-face' || c.label === 'surface-face');
  return face ? face.getLocalBounds() : node.getLocalBounds();
}

/** Blue outline-glow pulse around `node`'s own precise bounds — one per tile, or one around a
 * whole row (Slots Row / Orders HUD). Added as `node`'s own last child so it always tracks the
 * target's position for free; a stroke only, never a fill, so the target's own content stays
 * fully readable underneath. Returns the overlay so the caller can clear it later. */
export function applyGlowHighlight(node: Container): Container {
  shadowOf(node, 'accent-highlight');
  const b = preciseBounds(node);
  const glow = drawGlow(b.x, b.y, b.width, b.height);
  node.addChild(glow);
  gsap.killTweensOf(glow);
  gsap.fromTo(
    glow,
    { alpha: 0.55 },
    {
      alpha: 1,
      duration: 0.55,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      overwrite: 'auto',
      onUpdate: function onUpdate() { if (glow.destroyed) this.kill(); },
    },
  );
  return glow;
}

export function clearGlowHighlight(glow: Container): void {
  if (glow.destroyed) return;
  gsap.killTweensOf(glow);
  glow.parent?.removeChild(glow);
  glow.destroy();
}

const timerBaseFill = new WeakMap<Text, number>();
const timerProxies = new WeakMap<Text, { t: number }>();

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** FTUE 2's Timer highlight is a colour pulse on the text itself (not a glow ring) — the Timer
 * is a single small label, not a boxed control. Re-triggering on an already-pulsing text is
 * idempotent: the per-text proxy in `timerProxies` lets `killTweensOf` find and replace the
 * prior tween instead of stacking a second one underneath it. */
export function applyTimerPulse(text: Text): void {
  shadowOf(text, 'accent-highlight');
  if (!timerBaseFill.has(text)) timerBaseFill.set(text, text.style.fill as number);
  const base = timerBaseFill.get(text)!;
  let proxy = timerProxies.get(text);
  if (!proxy) {
    proxy = { t: 0 };
    timerProxies.set(text, proxy);
  }
  gsap.killTweensOf(proxy);
  gsap.to(proxy, {
    t: 1,
    duration: 0.5,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
    overwrite: 'auto',
    onUpdate: () => {
      if (text.destroyed) { gsap.killTweensOf(proxy); return; }
      text.style.fill = lerpColor(base, FTUE_HIGHLIGHT_HEX, proxy!.t);
    },
  });
}

export function clearTimerPulse(text: Text): void {
  if (text.destroyed) return;
  const proxy = timerProxies.get(text);
  if (proxy) gsap.killTweensOf(proxy);
  const base = timerBaseFill.get(text);
  if (base !== undefined) text.style.fill = base;
}
