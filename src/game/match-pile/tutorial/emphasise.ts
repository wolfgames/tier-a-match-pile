// what_in: the real Pixi node an FTUE step names.
// what_out: applies the accent-highlight shadow recipe + a 1.15 tap-bounce to it.
// why_here: U12 — emphasise the real control, never an overlay glyph; no tutorial/hand.ts.
import gsap from 'gsap';
import type { Container } from 'pixi.js';
import { shadowOf } from '../inspector';

export function emphasise(node: Container): void {
  if (node.destroyed) return;
  shadowOf(node, 'accent-highlight');
  gsap.killTweensOf(node.scale);
  gsap.fromTo(
    node.scale,
    { x: 1, y: 1 },
    {
      x: 1.15,
      y: 1.15,
      duration: 0.5,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      overwrite: 'auto',
      // A turn-based repaint can destroy this exact tile view (a clear/rebuild) while the
      // infinite yoyo is still ticking — killing on destroy avoids writing into a null scale.
      onUpdate: function onUpdate() {
        if (node.destroyed) this.kill();
      },
    },
  );
}

export function clearEmphasis(node: Container): void {
  if (node.destroyed) return; // the yoyo tween's own onUpdate guard already killed itself
  gsap.killTweensOf(node.scale);
  node.scale.set(1, 1);
}
