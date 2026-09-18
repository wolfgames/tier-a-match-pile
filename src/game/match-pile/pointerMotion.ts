// what_in: a Pixi container (already pivoted to its own centre by its owner) + the screen Y its
//          centre rests at.
// what_out: `killMotionTweens` / `bounceIn` / `settle` / `pressIn` — the shared scale+lift motion
//           vocabulary for PLAY and the settings button, so both read as the same tactile system
//           instead of two different animation styles.
// why_here: shared because ctaButton.ts and settingsButton.ts need IDENTICAL hover/press motion,
//           not two hand-tuned copies that drift apart over time.
import gsap from 'gsap';
import type { Container } from 'pixi.js';

/** Stops whatever's currently driving scale/position — call before starting a new motion state
 * so two competing tweens (e.g. idle pulse + hover bounce) never fight over the same properties. */
export function killMotionTweens(container: Container): void {
  gsap.killTweensOf(container.scale);
  gsap.killTweensOf(container);
}

/** Quick pop into an elevated pose and HOLD it there (no repeat) — the Hover state's "bounce",
 * not a continuous animation. `back.out` gives the small overshoot that reads as a pop. */
export function bounceIn(container: Container, restY: number, scale: number, lift: number): void {
  killMotionTweens(container);
  gsap.to(container.scale, { x: scale, y: scale, duration: 0.2, ease: 'back.out(1.8)', overwrite: 'auto' });
  gsap.to(container, { y: restY - lift, duration: 0.2, ease: 'back.out(1.8)', overwrite: 'auto' });
}

/** Eases back to the neutral resting pose (scale 1, restY) — Default. `onSettled` fires once
 * this finishes, so the caller can resume its idle loop only once nothing else is animating it. */
export function settle(container: Container, restY: number, onSettled?: () => void): void {
  killMotionTweens(container);
  gsap.to(container.scale, { x: 1, y: 1, duration: 0.22, ease: 'sine.out', overwrite: 'auto' });
  gsap.to(container, { y: restY, duration: 0.22, ease: 'sine.out', overwrite: 'auto', onComplete: onSettled });
}

/** Shrinks and drops slightly — Pressed, paired with the caller's own inset-bevel face repaint. */
export function pressIn(container: Container, restY: number, scale: number, drop: number): void {
  killMotionTweens(container);
  gsap.to(container.scale, { x: scale, y: scale, duration: 0.1, ease: 'sine.out', overwrite: 'auto' });
  gsap.to(container, { y: restY + drop, duration: 0.1, ease: 'sine.out', overwrite: 'auto' });
}
