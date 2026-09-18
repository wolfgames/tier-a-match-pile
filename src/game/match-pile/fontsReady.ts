// what_in: FONTS (typography.ts) — the tenant type block's actual family name(s).
// what_out: `fontsReady` — resolves once every weight this game's Pixi Text nodes request has
//           actually been fetched/decoded by the browser.
// why_here: canvas/WebGL text (Pixi) does not trigger a @font-face fetch the way DOM text layout
//           does. @fontsource's CSS `@import` in app.css declares the faces, but nothing forces
//           the browser to fetch them until something asks for a specific family+weight — so any
//           Pixi Text created before that finishes silently falls back to the platform default
//           font (this is why brand text looked wrong: it usually wasn't Montserrat at all).
//           The weights list must track what board/chrome.ts, board/legend.ts,
//           board/ordersHud.ts, ctaButton.ts, board/tiles.ts and startView.ts actually request.
import { FONTS } from './typography';

const WEIGHTS = [400, 600, 700, 800];

export const fontsReady: Promise<void> = Promise.all(
  WEIGHTS.map((w) => document.fonts.load(`${w} 16px ${FONTS.display}`)),
)
  .then(() => document.fonts.ready)
  .then(() => undefined);
