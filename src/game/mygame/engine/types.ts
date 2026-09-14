/**
 * engine — the render-engine seam.
 *
 * The simulation (ECS) is engine-agnostic. An `EngineHandle` is the thin
 * contract every render engine implements so the controller can drive the same
 * game with any of them: it owns the frame clock and, later, the stage/canvas.
 *
 * The only method the pure-ECS loop needs today is `onFrame` — the controller
 * wires `engine.onFrame(dt => stepWorld(db, dt))` and the engine calls back once
 * per frame with the delta in milliseconds. `createTickerEngine` implements this
 * over `gsap.ticker` (DOM/default). A Pixi engine would drive it from
 * `app.ticker`, a Three engine from `requestAnimationFrame` + `THREE.Clock`,
 * a Phaser engine from its `Scene.update` — same contract, different clock.
 */

/** Called once per frame with the elapsed time since the last frame, in ms. */
export type FrameCallback = (dtMs: number) => void;

export interface EngineHandle {
  /** Subscribe to the frame loop. Returns an unsubscribe fn. */
  onFrame(cb: FrameCallback): () => void;
  /** Stop the loop and release engine resources. */
  destroy(): void;
}
