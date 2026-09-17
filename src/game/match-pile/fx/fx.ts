// what_in: a Pixi stage layer + the feedback event name + the (x, y) of the acted-on node.
// what_out: `celebrate()` — the VFX half of every feedbackRegistry row (U2/U8), scaled to
//           magnitude (single pop → cascade → cascade+centre burst on a full clear). `tick(dt)`
//           is driven by the controller's own ticker — Fx never owns a frame loop itself.
// why_here: fx/ per the build slice plan; catalog: used particle-burst
//           (@wolfgames/components/modules/primitives/particle-burst) — a typed-array pool
//           with exactly the burst/cascade presets U8 asks for; no hand-rolled Graphics burst.
import type { Container } from 'pixi.js';
import { ParticleBurst } from '@wolfgames/components/modules/primitives/particle-burst';
import { paletteHex } from '../palette';
import type { GameEvent } from '../feel';

export class Fx {
  private vfx: ParticleBurst;

  constructor(layer: Container) {
    this.vfx = new ParticleBurst();
    layer.addChild(this.vfx);
  }

  tick(dt: number): void {
    this.vfx.tick(dt);
  }

  celebrate(event: GameEvent, x: number, y: number): void {
    const colors = [paletteHex.accent, paletteHex.primary, paletteHex.secondary];
    if (event === 'correct') this.vfx.burst(x, y, { count: 24, colors });
    else if (event === 'partial') this.vfx.cascade(x, y, { count: 18, colors });
    else if (event === 'win') {
      this.vfx.burst(x, y, { count: 60, colors });
      this.vfx.cascade(x, y, { count: 40, colors });
    } else if (event === 'hint') this.vfx.burst(x, y, { count: 14, colors: [paletteHex.accent] });
  }

  destroy(): void {
    this.vfx.destroy({ children: true });
  }
}
