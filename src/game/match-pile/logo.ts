// what_in: a container + a target box size + a stroke colour.
// what_out: `drawWolfMark` — the Wolf Games "W" zig-zag mark (reference: three angled strokes
//           forming a W), drawn as a single thick-stroked polyline. Code-drawn, not generated
//           art — the mark is simple enough to vectorise directly and this avoids an asset-gen
//           round-trip for a logotype glyph.
// why_here: used by board/chrome.ts's in-game header. The start screen no longer draws its own
//           approximation of the Wolf wordmark — it renders the real template-amino branding
//           sprite (atlas-branding-wolf.json, frame `logo-wide-small`) instead; see
//           screens/startViewScene.ts.
import { Container, Graphics } from 'pixi.js';

/** Draws the W zig-zag into `c`, sized to fit a `size`×`size` box, stroked in `hex`. */
export function drawWolfMark(c: Container, size: number, hex: number): void {
  const g = new Graphics();
  const top = size * 0.15;
  const bottom = size * 0.85;
  const mid = size * 0.35;
  g.moveTo(0, top)
    .lineTo(size * 0.25, bottom)
    .lineTo(size * 0.5, mid)
    .lineTo(size * 0.75, bottom)
    .lineTo(size, top)
    .stroke({ width: size * 0.14, color: hex, cap: 'round', join: 'round' });
  c.addChild(g);
}
