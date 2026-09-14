/**
 * createTickerEngine — the default frame source, over `gsap.ticker`.
 *
 * GSAP owns the frame loop across this template (guardrail: no raw
 * `requestAnimationFrame`). `gsap.ticker` fires once per animation frame and
 * hands us the delta in ms, which is exactly the `dt` `stepWorld` wants. This is
 * the engine used by the DOM placeholder; a Pixi game swaps in an engine backed
 * by `app.ticker` with the identical `EngineHandle` shape.
 */

import { gsap } from 'gsap';
import type { EngineHandle, FrameCallback } from './types';

export function createTickerEngine(): EngineHandle {
  const callbacks = new Set<FrameCallback>();

  // gsap.ticker callback args: (time, deltaTime, frame, elapsed). deltaTime is
  // the ms since the last tick — the injected `dt`.
  const tick = (_time: number, deltaTime: number): void => {
    for (const cb of callbacks) cb(deltaTime);
  };
  gsap.ticker.add(tick);

  return {
    onFrame(cb: FrameCallback): () => void {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    },
    destroy(): void {
      gsap.ticker.remove(tick);
      callbacks.clear();
    },
  };
}
