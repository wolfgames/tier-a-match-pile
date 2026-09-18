// what_in: a palette + the current level index + a persisted best-time (ms, or null if no run
//          has ever completed yet).
// what_out: `buildLeaderboardPanel` — a small Pixi popover showing LEVEL + BEST TIME, same
//           tactile card language as the settings popover.
// why_here: the leaderboard/status control needs a real (if minimal) panel, not a decorative
//           chip that does nothing on tap — no persisted-record backend service exists in this
//           project, so "Best Time" is the actual fastest completed run this browser has ever
//           recorded (gameController.ts persists it via ~/core/utils/storage on each win), never
//           a fabricated number.
import { Container, Graphics, Text } from 'pixi.js';
import { paint, shape, shadowOf } from '../inspector';
import { drawSoftShadow } from '../surface';
import { FONTS } from '../typography';
import type { PaletteKey } from '../palette';

const PANEL_W = 160;
const PANEL_H = 76;

function formatBestMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function buildLeaderboardPanel(palette: Record<PaletteKey, number>, levelIndex: number, bestTimeMs: number | null): Container {
  const container = new Container();
  container.label = 'panel-leaderboard';
  drawSoftShadow(container, PANEL_W, PANEL_H, 16, 0, 6, 12, 0.18, palette.text);
  container.addChild(new Graphics().roundRect(0, 0, PANEL_W, PANEL_H, 16).fill(palette.panel));
  paint(container, `#${palette.panel.toString(16).padStart(6, '0')}`);
  shape(container, 16);
  shadowOf(container, 'soft-push');

  const levelText = new Text({ text: `LEVEL ${levelIndex}`, style: { fontFamily: FONTS.body, fontSize: 14, fontWeight: '700', fill: palette.text } });
  levelText.label = 'text-leaderboard-panel-level';
  levelText.anchor.set(0.5);
  levelText.position.set(PANEL_W / 2, 26);
  container.addChild(levelText);

  const bestText = new Text({
    text: `BEST ${bestTimeMs != null ? formatBestMs(bestTimeMs) : '--:--'}`,
    style: { fontFamily: FONTS.body, fontSize: 12, fontWeight: '600', fill: palette.text },
  });
  bestText.label = 'text-leaderboard-panel-best';
  bestText.alpha = 0.7;
  bestText.anchor.set(0.5);
  bestText.position.set(PANEL_W / 2, 50);
  container.addChild(bestText);

  return container;
}
