// what_in: the PLAY CtaButtonHandle's container (ctaButton.ts pivots it to its own centre) + the
//          Y its centre rests at.
// what_out: `startCtaIdlePulse` — a periodic scale-up + lift + settle, ~2s cadence, only while the
//           button is truly idle (ctaButton.ts kills this the moment the pointer interacts, and
//           restarts it once the pointer leaves and the button has settled back to rest).
// why_here: kept out of ctaButton.ts (which owns visual *states*, not idle motion) and out of
//           startViewScene.ts as its own single-purpose motion helper.
import gsap from 'gsap';
import type { Container } from 'pixi.js';

/** Playwright's actionability check needs a stable bounding box before it will click; a periodic
 * pulse spends most of each cycle perfectly still (only ~0.3s of the ~2s cycle animates), so a
 * click reliably lands in one of those stable windows — a continuous tween has no such window. */
export function startCtaIdlePulse(container: Container, restY: number): void {
  gsap.to(container.scale, {
    x: 1.055,
    y: 1.055,
    duration: 0.3,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
    repeatDelay: 1.4,
    overwrite: 'auto',
    onUpdate: function onUpdate() { if (container.destroyed) this.kill(); },
  });
  gsap.to(container, {
    y: restY - 4,
    duration: 0.3,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
    repeatDelay: 1.4,
    overwrite: 'auto',
    onUpdate: function onUpdate() { if (container.destroyed) this.kill(); },
  });
}
