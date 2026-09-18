// what_in: the built `Slots` + live game facts (level, score) + the coordinator (for the real
//          logo sprite) + a settings-tap callback.
// what_out: `initChromeOnce` (settings button, real Wolf Games logo, leaderboard/status chip —
//           built once) and `paintChrome` (level card content, re-rendered on every repaint by
//           the caller, which already clears those slots first) plus the Timer helpers
//           (initTimerOnce/paintTimer/formatTimerMs).
// why_here: layout.ts is structure-only; this is content, kept in its own file per A5.
//
// SCREEN-REBUILD pass: settings is now the SAME fully-Pixi tactile button used on the start
// screen (settingsButton.ts — raised/hover/pressed, real functionality via a caller-supplied
// onTap), not the old decorative outline-circle icon. The brand mark is the real template-amino
// sprite (atlas-branding-wolf.json, frame `logo-wide-small`), not a drawn wordmark — same asset,
// same loading path as the start screen. The old partner/game-type/sub-type/challenge/score
// five-line meta block is gone — replaced by one compact level card (level label + Score one
// row, Timer prominent below). Each of levelLabel/timer/score is its own STABLE child container
// (layout.ts), individually cleared and repainted — never `levelCard.removeChildren()` directly,
// which would also destroy those three persistent containers instead of just their text.
import { Container, Graphics, Text } from 'pixi.js';
import type { AssetCoordinatorFacade } from '~/core/systems/assets';
import { HEAD_H, type Slots } from './layout';
import { paint, fitText } from '../inspector';
import { paletteHexFor, type ThemeName } from '../palette';
import { paintSurface } from '../surface';
import { initSettingsButton, type SettingsButtonHandle } from '../settingsButton';
import { FONTS } from '../typography';

const PROFILE_W = HEAD_H * 1.35;
const LOGO_TARGET_H = 22;
/** Exact hex the task specified for the Timer text — a deliberate, narrowly-scoped literal (one
 * piece of text), not a proposal to change the shared `text` token globally (that would ripple
 * through every other drawer that reads `palette.text`, well beyond this screen's Timer). */
const TIMER_COLOR = 0x4c4c11;

/** N7 line-icon gear glyph, 1.5px stroke — reused by settingsButton.ts as its default icon.
 * DARK-MODE pass: takes `colorHex` explicitly now (was hardcoded to the static light-only
 * `paletteHex.text`, so the gameplay header's settings icon silently stayed light even in dark
 * mode) — settingsButton.ts's default `drawIcon` wrapper forwards its own live, theme-resolved
 * colour straight through. */
export function drawGearGlyph(c: Container, size: number, colorHex: number): void {
  const g = new Graphics();
  const cx = size / 2;
  const cy = size / 2;
  g.circle(cx, cy, size * 0.16).stroke({ width: 1.5, color: colorHex });
  g.circle(cx, cy, size * 0.3).stroke({ width: 1.5, color: colorHex });
  const teeth = 6;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * size * 0.3;
    const y1 = cy + Math.sin(a) * size * 0.3;
    const x2 = cx + Math.cos(a) * size * 0.4;
    const y2 = cy + Math.sin(a) * size * 0.4;
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.5, color: colorHex });
  }
  c.addChild(g);
}

export interface ChromeHandle {
  settings: SettingsButtonHandle;
  /** The leaderboard chip's dedicated dynamic-content container — holds ONLY the level/best
   * text, nothing else, ever. `paintChrome` clears it with a bare `removeChildren()` (default
   * range = the whole array, so it's correct regardless of how many children happen to be in it)
   * instead of a `slots.root.children.find(label)` lookup + a hard-coded "background is children
   * 0-1" index. A label lookup risks matching the wrong node if anything else ever shares that
   * label (that's exactly what broke `removeChildren(2)` here before this fix — layout.ts's own
   * `slots.profile` anchor container carries the SAME `'slot-profile'` label and sat earlier in
   * `root.children`, so `.find()` silently returned that empty, never-painted container instead
   * of this chip); returning the real reference removes the lookup, and the class of bug, entirely. */
  profileContent: Container;
}

/** Built once: settings button (real Pixi tactile control), the real Wolf Games logo sprite, and
 * the leaderboard/status chip. Returns handles so the caller (gameController.ts) can wire the
 * settings tap and hand `profileContent` straight to `paintChrome` — no by-label lookup, no
 * assumptions about background child count. */
export function initChromeOnce(
  slots: Slots,
  coordinator: AssetCoordinatorFacade,
  onSettingsTap: () => void,
  onProfileTap: () => void,
  theme: ThemeName,
): ChromeHandle {
  const paletteHex = paletteHexFor(theme);
  const settings = initSettingsButton({ size: HEAD_H, palette: paletteHex, accessibleTitle: 'Settings', onTap: onSettingsTap });
  settings.container.position.set(slots.settings.x, slots.settings.y);
  settings.armMotion(slots.settings.y);
  slots.root.addChild(settings.container);

  // Real template-amino branding sprite — NOT redrawn with text/vector primitives. Same asset,
  // same tint-for-legibility treatment as the start screen (screens/startViewScene.ts): the
  // source is a plain white silhouette, so tinting it is the intended use, not an alteration.
  const gpu = coordinator.getGpuLoader?.();
  const logoSprite = gpu?.createSprite('core-branding', 'logo-wide-small') ?? null;
  if (logoSprite) {
    const logoScale = LOGO_TARGET_H / logoSprite.texture.height;
    logoSprite.scale.set(logoScale);
    logoSprite.tint = paletteHex.text;
    logoSprite.anchor.set(0.5);
    logoSprite.label = 'mark-tenant';
    logoSprite.position.set(slots.brand.x, slots.brand.y);
    paint(logoSprite as unknown as Container, `#${paletteHex.text.toString(16).padStart(6, '0')}`);
    slots.root.addChild(logoSprite);
  }

  // Leaderboard/status — same tactile family as settings/PLAY, a rounded-square info chip that
  // opens a Pixi status popover (LEVEL + BEST TIME) on tap. Labelled distinctly from
  // `slots.profile` (layout.ts's plain position anchor, added to `root` separately and never
  // painted) — the two must never share a label; see ChromeHandle's doc comment for why.
  const profileChip = new Container();
  profileChip.label = 'chip-leaderboard';
  profileChip.position.set(slots.profile.x - PROFILE_W / 2, slots.profile.y - HEAD_H / 2);
  profileChip.eventMode = 'static';
  profileChip.accessible = true;
  profileChip.accessibleTitle = 'Status';
  paintSurface(profileChip, PROFILE_W, HEAD_H, HEAD_H * 0.28, paletteHex.panel, 'soft-push');
  // Dedicated dynamic-content container: `paintChrome` only ever touches this, via the direct
  // reference returned below — never the chip itself, so the chip's own background children are
  // structurally impossible to remove by accident, and no child-count assumption is needed.
  const profileContent = new Container();
  profileContent.label = 'profile-content';
  profileChip.addChild(profileContent);
  profileChip.on('pointerover', () => { profileChip.alpha = 0.85; });
  profileChip.on('pointerout', () => { profileChip.alpha = 1; });
  profileChip.on('pointertap', onProfileTap);
  slots.root.addChild(profileChip);

  return { settings, profileContent };
}

/** Re-painted every `pile` change: the leaderboard chip's LEVEL + BEST readout, and the level
 * card's level label + Score (each into its own dedicated dynamic-content container — see file
 * header / ChromeHandle doc comment). Every clear below is a bare `removeChildren()` — no start
 * index, no child-count assumption — because every container this touches holds ONLY dynamic
 * content and nothing else; idempotent regardless of how many times it's called in a row. */
export function paintChrome(
  chrome: ChromeHandle,
  slots: Slots,
  facts: { levelIndex: number; score: number },
  theme: ThemeName,
): void {
  const paletteHex = paletteHexFor(theme);
  chrome.profileContent.removeChildren().forEach((c) => c.destroy());
  const levelT = new Text({ text: `L${facts.levelIndex}`, style: { fontFamily: FONTS.body, fontSize: 12, fontWeight: '700', fill: paletteHex.text } });
  levelT.label = 'text-leaderboard-level';
  levelT.anchor.set(0.5);
  levelT.position.set(PROFILE_W / 2, HEAD_H * 0.36);
  chrome.profileContent.addChild(levelT);
  // No persisted best-time exists in this project yet (checked: no records/leaderboard
  // service) — an honest placeholder, not an invented stat.
  const bestT = new Text({ text: 'BEST --:--', style: { fontFamily: FONTS.body, fontSize: 9, fontWeight: '600', fill: paletteHex.text } });
  bestT.label = 'text-leaderboard-best';
  bestT.alpha = 0.6;
  bestT.anchor.set(0.5);
  bestT.position.set(PROFILE_W / 2, HEAD_H * 0.7);
  chrome.profileContent.addChild(bestT);

  slots.levelLabel.removeChildren().forEach((c) => c.destroy());
  const levelLabel = new Text({
    text: `LEVEL ${facts.levelIndex}`,
    style: { fontFamily: FONTS.body, fontSize: 13, fontWeight: '700', fill: paletteHex.text },
  });
  levelLabel.label = 'text-level-label';
  levelLabel.alpha = 0.75;
  levelLabel.anchor.set(0, 0.5);
  fitText(levelLabel, slots.vw * 0.4);
  slots.levelLabel.addChild(levelLabel);

  slots.score.removeChildren().forEach((c) => c.destroy());
  const scoreText = new Text({
    text: `${facts.score}`,
    style: { fontFamily: FONTS.body, fontSize: 15, fontWeight: '700', fill: paletteHex.text },
  });
  scoreText.label = 'text-score';
  scoreText.anchor.set(1, 0.5);
  fitText(scoreText, slots.vw * 0.3);
  slots.score.addChild(scoreText);
}

/** MM:SS, always zero-padded (e.g. `05:00`). `remainingMs` is rounded up to the nearest second. */
export function formatTimerMs(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Creates the persistent Timer text once — never rebuilt per frame (guardrail: no per-frame
 * allocation). 20px, exact `#4C4C11` — prominent within the level card, per spec. */
export function initTimerOnce(slots: Slots, initialRemainingMs: number): Text {
  const t = new Text({
    text: formatTimerMs(initialRemainingMs),
    style: { fontFamily: FONTS.body, fontSize: 20, fontWeight: '700', fill: TIMER_COLOR },
  });
  t.label = 'text-timer';
  t.anchor.set(0.5);
  slots.timer.addChild(t);
  return t;
}

/** Updates the Timer text's content only — called every ticker frame from gameController.ts. */
export function paintTimer(text: Text, remainingMs: number): void {
  const next = formatTimerMs(remainingMs);
  if (text.text !== next) text.text = next;
}
