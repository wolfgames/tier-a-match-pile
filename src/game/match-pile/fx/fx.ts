// what_in: a Pixi stage layer + positions gameController.ts derives from getGlobalPosition()/
//          tray layout math (board/tray.ts) — Fx never reads ECS itself.
// what_out: every gameplay VFX beat — tap feedback, Order-match vs discard, Order-complete
//           sparkle+spin, win fireworks, hint burst. `tick(dt)` is driven by the controller's own
//           ticker — Fx never owns a frame loop itself.
// why_here: fx/ per the build slice plan; catalog: particle-burst (sparkle bursts) and
//           cta-radar-ping (every expanding ring), reused as-is. The bounce/merge/discard dot
//           animations have no catalog match — hand-rolled Graphics (src/game/AGENTS.md gate).
import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';
import { ParticleBurst } from '@wolfgames/components/modules/primitives/particle-burst';
import { CtaRadarPing } from '@wolfgames/components/modules/primitives/cta-radar-ping';
import { paletteHex, ORDER_PROGRESS_HEX } from '../palette';

const CELEBRATE_COLORS = [paletteHex.accent, paletteHex.primary, paletteHex.secondary];
// Order-match + win celebration share one fixed identity colour (ORDER_PROGRESS_HEX, palette.ts)
// as the dominant hue (repeated, not an even split) — "this is going toward a goal." Discard is
// muted/neutral on purpose — never a failure colour, just lower visual importance.
const ORDER_COLORS = [ORDER_PROGRESS_HEX, ORDER_PROGRESS_HEX, paletteHex.accent];
const WIN_COLORS = [ORDER_PROGRESS_HEX, ORDER_PROGRESS_HEX, paletteHex.accent, paletteHex.primary];
const DISCARD_COLORS = [paletteHex.text];

export class Fx {
  private vfx: ParticleBurst;
  private overlay: Container;
  private destroyed = false;
  private pending: gsap.core.Tween[] = [];

  constructor(layer: Container) {
    this.vfx = new ParticleBurst();
    this.overlay = new Container();
    layer.addChild(this.vfx);
    layer.addChild(this.overlay);
  }

  tick(dt: number): void {
    this.vfx.tick(dt);
  }

  private schedule(delay: number, fn: () => void): void {
    this.pending.push(gsap.delayedCall(delay, () => { if (!this.destroyed) fn(); }));
  }

  /** One single-shot ring, `cta-radar-ping` given an `interval` far longer than `duration` so it
   * never spawns a second pulse of its own. */
  private ring(x: number, y: number, color: number, baseRadius: number, endScale: number, duration: number, strokeWidth: number): void {
    const ping = new CtaRadarPing({ color, baseRadius, startScale: 0.3, endScale, strokeWidth, duration, interval: 999, initialDelay: 0 });
    ping.position.set(x, y);
    this.overlay.addChild(ping);
    ping.start();
    this.schedule(duration + 0.05, () => { if (!ping.destroyed) ping.destroy(); });
  }

  hintBurst(x: number, y: number): void {
    this.vfx.burst(x, y, { count: 14, colors: [paletteHex.accent] });
  }

  /** Every accepted tile tap — a bounce pop (scale overshoot then settle) plus a ring expanding
   * outward from the same centre and fading. Both play on a stand-in at the tapped tile's
   * position: BoardRenderer destroys/rebuilds the real tile synchronously before any frame
   * renders, so tweening it directly would never actually paint. */
  tapFeedback(x: number, y: number): void {
    const bounce = new Graphics().circle(0, 0, 12).fill(paletteHex.accent);
    bounce.position.set(x, y);
    bounce.scale.set(0.4);
    this.overlay.addChild(bounce);
    gsap.to(bounce.scale, { x: 1, y: 1, duration: 0.26, ease: 'back.out(3)' });
    gsap.to(bounce, { alpha: 0, duration: 0.2, delay: 0.18, ease: 'power1.in', onComplete: () => { if (!bounce.destroyed) bounce.destroy(); } });
    this.ring(x, y, paletteHex.accent, 8, 2.6, 0.32, 2);
  }

  /** A completed triple that progresses an active Order — matched slots converge to their
   * centroid, which then pops a sparkle burst + one expanding ring in ORDER_PROGRESS_HEX.
   * `onRing` (audio hook) fires at the same moment the ring/burst starts, not at call time —
   * the merge converge tween runs for 0.22s first. */
  matchComplete(positions: Array<{ x: number; y: number }>, onRing?: () => void): void {
    if (positions.length === 0) return;
    const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;
    for (const pos of positions) {
      const dot = new Graphics().circle(0, 0, 7).fill(ORDER_PROGRESS_HEX);
      dot.position.set(pos.x, pos.y);
      this.overlay.addChild(dot);
      gsap.to(dot, { x: cx, y: cy, alpha: 0, duration: 0.22, ease: 'power2.in', onComplete: () => { if (!dot.destroyed) dot.destroy(); } });
      gsap.to(dot.scale, { x: 0.4, y: 0.4, duration: 0.22, ease: 'power2.in' });
    }
    this.schedule(0.2, () => {
      this.vfx.burst(cx, cy, { count: 22, colors: ORDER_COLORS });
      this.ring(cx, cy, ORDER_PROGRESS_HEX, 14, 3.2, 0.45, 3);
      onRing?.();
    });
  }

  /** A valid completed triple that does NOT progress any Order — deliberately smaller/quieter
   * than `matchComplete`, no ring/Order colour: each slot pops once then dissolves in place (no
   * converge-to-centroid) — "cleared, not toward a goal," never a failure/mistake read. */
  matchDiscard(positions: Array<{ x: number; y: number }>): void {
    if (positions.length === 0) return;
    for (const pos of positions) {
      // Spawns already at the punch-peak (1.15) — a small compression pop, then shrinks/sinks/
      // fades away in one beat, no converge step.
      const dot = new Graphics().circle(0, 0, 7).fill({ color: DISCARD_COLORS[0], alpha: 0.6 });
      dot.position.set(pos.x, pos.y);
      dot.scale.set(1.15);
      this.overlay.addChild(dot);
      gsap.to(dot.scale, { x: 0.3, y: 0.3, duration: 0.26, ease: 'power1.in' });
      gsap.to(dot, { y: pos.y + 10, alpha: 0, duration: 0.26, ease: 'power1.in', onComplete: () => { if (!dot.destroyed) dot.destroy(); } });
    }
    const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;
    this.vfx.burst(cx, cy, { count: 8, colors: DISCARD_COLORS, sizeMin: 2, sizeMax: 4, speedMin: 40, speedMax: 90, lifetime: 0.3 });
  }

  /** Sparkle + spin-and-fade for an Order card board/ordersHud.ts has already pulled out of its
   * normal repaint cycle (it would otherwise be destroyed next repaint) — self-destroys, so the
   * Order leaves the HUD only once this finishes. Any Container works (width/height/pivot/
   * position/scale/rotation/alpha/destroy are generic DisplayObject API).
   *
   * Pivot fix: Pixi applies `pivot` in the node's PRE-scale local space, but `.width`/`.height`
   * are POST-scale — centring the pivot on the scaled size put it off-centre whenever the node
   * wasn't at scale 1 (e.g. a card scaled down to fit), reading as the card orbiting rather than
   * spinning in place. `getLocalBounds()` gives the correct pre-scale space for the pivot; `cx`/
   * `cy` (the on-screen visual centre) still needs the post-scale width/height. */
  orderComplete(node: Container, x: number, y: number): void {
    const cx = x + node.width / 2;
    const cy = y + node.height / 2;
    const b = node.getLocalBounds();
    node.pivot.set(b.x + b.width / 2, b.y + b.height / 2);
    node.position.set(cx, cy);
    this.overlay.addChild(node);
    this.vfx.burst(cx, cy, { count: 20, colors: CELEBRATE_COLORS });
    gsap.to(node, { rotation: Math.PI * 2, alpha: 0, duration: 0.6, ease: 'power2.in', onComplete: () => { if (!node.destroyed) node.destroy(); } });
    gsap.to(node.scale, { x: 0.6, y: 0.6, duration: 0.6, ease: 'power2.in' });
  }

  /** Firework-style bursts across the screen in three staggered waves (was two — the extra wave
   * fills gameController.ts's longer won-phase delay before handing off to Results, ~1s more
   * than before, instead of finishing early). Killed by `destroy()` when Results swaps in.
   * `onWave` (audio hook) fires once per wave, at that wave's first burst, so a caller can play
   * one sound per wave (not one per point) without duplicating this timing table. */
  winFireworks(screenW: number, screenH: number, onWave?: (wave: number) => void): void {
    const points = [
      { x: screenW * 0.2, y: screenH * 0.3 },
      { x: screenW * 0.8, y: screenH * 0.25 },
      { x: screenW * 0.5, y: screenH * 0.5 },
      { x: screenW * 0.3, y: screenH * 0.72 },
      { x: screenW * 0.75, y: screenH * 0.65 },
    ];
    [0, 0.5, 1.0].forEach((wave, waveIndex) => {
      points.forEach((p, i) => this.schedule(wave + i * 0.1, () => this.vfx.burst(p.x, p.y, { count: 30, colors: WIN_COLORS })));
      this.schedule(wave, () => onWave?.(waveIndex));
    });
  }

  destroy(): void {
    this.destroyed = true;
    for (const t of this.pending) t.kill();
    this.pending = [];
    gsap.killTweensOf(this.overlay.children);
    this.overlay.destroy({ children: true });
    this.vfx.destroy({ children: true });
  }
}
