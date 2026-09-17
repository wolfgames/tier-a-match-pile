// what_in: the built `Slots` + live game facts (level, tier, score, theme).
// what_out: `initChromeOnce` (settings/profile icons, tenant mark, watermark — built once) and
//           `paintChrome` (partner/game-type/sub-type/challenge/score/info text — re-rendered
//           on every repaint by the caller, which already clears those slots first).
// why_here: layout.ts is structure-only; this is content, kept in its own file per A5.
import { Container, Graphics, Text } from 'pixi.js';
import { HEAD_H, BANNER_H, type Slots } from './layout';
import { paint, fitText } from '../inspector';
import { paletteHex } from '../palette';
import { paintSurface } from '../surface';
import { FONTS } from '../typography';
import tokens from '../brand.tokens.json';
import { getGameWorld } from '../world';

function label(parent: Container, name: string, text: string, size: number, color: number, maxWidth: number, weight: '400' | '600' | '700' | '800' = '400'): Text {
  const t = new Text({ text, style: { fontFamily: FONTS.body, fontSize: size, fill: color, fontWeight: weight } });
  t.label = name;
  parent.addChild(t);
  fitText(t, maxWidth);
  return t;
}

/** Small filled pill badge (Mahjong reference: "LESSON 1" / "TILES LEFT 24") — replaces bare
 * text for the meta-right column so level/score read as distinct chips, not floating labels. */
function pill(parent: Container, name: string, text: string, fillHex: number, textHex: number, maxWidth: number): void {
  const c = new Container();
  c.label = name;
  const t = new Text({ text, style: { fontFamily: FONTS.body, fontSize: 11, fontWeight: '700', fill: textHex } });
  const padX = 10;
  const w = Math.min(maxWidth, t.width + padX * 2);
  const h = 20;
  // "compact raised card/pill" in the surface vocabulary — subtle now that the shadow math is
  // capped/corrected (surface.ts), not the flat/no-depth look a bare fill would give.
  paintSurface(c, w, h, h / 2, fillHex, 'soft-push');
  t.position.set(padX, h / 2);
  t.anchor.set(0, 0.5);
  fitText(t, w - padX * 2);
  c.addChild(t);
  parent.addChild(c);
}

/** N7 line-icon glyphs, 1.5px stroke in `text` — drawn ON TOP of the already-painted soft-push
 * circle (layout.ts), never re-filling it, so the panel's real shadow/tint stays visible. */
export function drawGearGlyph(c: Container, size: number): void {
  const g = new Graphics();
  const cx = size / 2;
  const cy = size / 2;
  g.circle(cx, cy, size * 0.16).stroke({ width: 1.5, color: paletteHex.text });
  g.circle(cx, cy, size * 0.3).stroke({ width: 1.5, color: paletteHex.text });
  const teeth = 6;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * size * 0.3;
    const y1 = cy + Math.sin(a) * size * 0.3;
    const x2 = cx + Math.cos(a) * size * 0.4;
    const y2 = cy + Math.sin(a) * size * 0.4;
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.5, color: paletteHex.text });
  }
  c.addChild(g);
}

/** Leaderboard/profile glyph: three ascending bars — reads clearly at icon scale. */
function drawLeaderboardGlyph(c: Container, size: number): void {
  const g = new Graphics();
  const barW = size * 0.14;
  const gap = size * 0.08;
  const baseY = size * 0.72;
  const heights = [size * 0.22, size * 0.36, size * 0.28];
  let x = size * 0.24;
  for (const h of heights) {
    g.roundRect(x, baseY - h, barW, h, barW * 0.3).stroke({ width: 1.5, color: paletteHex.text });
    x += barW + gap;
  }
  c.addChild(g);
}

const GLYPHS: Record<string, (c: Container, size: number) => void> = {
  'icon-settings': drawGearGlyph,
  'icon-profile': drawLeaderboardGlyph,
};

/** Sits on the unified header card (layout.ts's `card-header`) now, not its own separate pill —
 * a thin outline circle (matching the reference's plain gear/trophy icons), not a filled panel. */
function icon(parent: Container, name: string, size: number): void {
  const c = new Container();
  c.label = name;
  c.eventMode = 'static';
  c.accessible = true;
  c.accessibleTitle = name.replace(/-/g, ' ');
  const ring = new Graphics().circle(size / 2, size / 2, size / 2 - 1).stroke({ width: 1.5, color: paletteHex.text, alpha: 0.35 });
  c.addChild(ring);
  GLYPHS[name]?.(c, size);
  paint(c, `#${paletteHex.text.toString(16).padStart(6, '0')}`);
  c.on('pointertap', () => getGameWorld().transactions.stampFx({ event: 'button', targetLabel: name, t: Date.now() }));
  parent.addChild(c);
}

/** Tenant wordmark (role `mark`) inside slot-brand + a soft board watermark tile (N2/N9).
 * Static — built once. Plain coloured text, no pill/fill — "logo/brand element, not a red CTA
 * pill" (the previous solid-primary chip read as a button, not a brand mark). */
function tenantMark(slots: Slots): void {
  const mark = new Container();
  mark.label = 'mark-tenant';
  // Not `slots.brand.width` — the slot has no pre-painted background any more (it's a plain
  // wordmark on the header card now), so it would measure 0 before this text is even added.
  const w = slots.vw * 0.32;
  const t = label(mark, 'text-brand-name', tokens.displayName, 18, paletteHex.primary, w, '800');
  t.anchor.set(0.5, 0.5);
  t.position.set(w / 2, HEAD_H / 2);
  paint(mark, `#${paletteHex.primary.toString(16).padStart(6, '0')}`);
  slots.brand.addChild(mark);

  const watermark = new Container();
  watermark.label = 'watermark';
  watermark.alpha = tokens.watermark.alpha;
  const wg = new Graphics().roundRect(0, 0, tokens.watermark.tile, tokens.watermark.tile, 12).fill(paletteHex.primary);
  watermark.addChild(wg);
  paint(watermark, `#${paletteHex.primary.toString(16).padStart(6, '0')}`);
  watermark.position.set(slots.board.width - tokens.watermark.tile - 8, 8);
  slots.board.addChildAt(watermark, 0);
}

/** Footer (`slot-partner-banner`) never had any content painted into it — layout.ts only ever
 * drew its background. A clean, light footer (tenant wordmark + link label as coloured text),
 * not the previous solid brand-colour bar competing with gameplay. Static — built once. */
function paintFooterOnce(slots: Slots): void {
  const w = slots.banner.width || 100;
  const nameT = label(slots.banner, 'text-partner-banner', tokens.displayName, 13, paletteHex.primary, w * 0.5, '800');
  nameT.position.set(16, BANNER_H / 2);
  nameT.anchor.set(0, 0.5);
  const linkLabel = tokens.link.replace(/^https?:\/\//, '');
  const linkT = label(slots.banner, 'text-partner-link', linkLabel, 11, paletteHex.text, w * 0.4, '600');
  linkT.alpha = 0.6;
  linkT.position.set(w - 16, BANNER_H / 2);
  linkT.anchor.set(1, 0.5);
  paint(slots.banner, `#${paletteHex.primary.toString(16).padStart(6, '0')}`);
}

/** Chrome that never changes for the life of the game screen — call exactly once. */
export function initChromeOnce(slots: Slots): void {
  icon(slots.settings, 'icon-settings', HEAD_H);
  icon(slots.profile, 'icon-profile', HEAD_H);
  tenantMark(slots);
  paintFooterOnce(slots);
}

// catalog: considered primitives/countdown-timer (dt-based countdown, urgency color/pulse —
// closest name/description match) — its `update(dt)` drives its own internal `remaining`
// clock, which would be a second, independently-drifting Timer alongside ECS's
// `timerRemainingMs`/`tickTimer` (ecs-state.md "ECS is the source of truth" / R-TIMER-BUDGET);
// using it display-only via `reset()` alone would silently drop its actual differentiator
// (urgency pulse) and add nothing over plain Text. Plain Pixi Text used instead, matching the
// existing chrome.ts text-line pattern for this same head-row repaint group (same reasoning
// ordersHud.ts already recorded for its own catalog check).

/** MM:SS, always zero-padded (e.g. `05:00`). `remainingMs` is rounded up to the nearest second. */
export function formatTimerMs(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Creates the persistent Timer text once — never rebuilt per frame (guardrail: no per-frame allocation). */
export function initTimerOnce(slots: Slots, initialRemainingMs: number): Text {
  const t = new Text({
    text: formatTimerMs(initialRemainingMs),
    style: { fontFamily: FONTS.body, fontSize: 14, fill: paletteHex.text },
  });
  t.label = 'text-timer';
  slots.timer.addChild(t);
  return t;
}

/** Updates the Timer text's content only — called every ticker frame from gameController.ts. */
export function paintTimer(text: Text, remainingMs: number): void {
  const next = formatTimerMs(remainingMs);
  if (text.text !== next) text.text = next;
}

/** Chrome that reflects live state — the caller clears these slots before every call
 * (gameController.ts's repaint() — `slot-info` uses `removeChildren(1)` since layout.ts already
 * painted its pill background once; the others have no persistent background to preserve).
 *
 * TYPOGRAPHY pass: distinct weight/size per role instead of near-uniform small text —
 * `gameType` is the real title (bold, largest of the meta block), `partner`/`subType` are small
 * secondary labels, `challenge`/`score` are pill badges (Mahjong reference: "LESSON 1" /
 * "TILES LEFT 24"), and the instruction bar (`info`) is bold and inset inside its own pill. */
export function paintChrome(slots: Slots, facts: { levelIndex: number; tier: string; challengeLabel: string; score: number; infoText: string }): void {
  label(slots.partner, 'text-partner', tokens.displayName, 10, paletteHex.text, slots.vw * 0.6, '600').alpha = 0.7;
  label(slots.gameType, 'text-game-type', 'MATCH PILE', 20, paletteHex.text, slots.vw * 0.6, '800');
  label(slots.subType, 'text-sub-type', `${facts.tier.toUpperCase()} EDITION`, 11, paletteHex.text, slots.vw * 0.6).alpha = 0.7;
  pill(slots.challenge, 'pill-challenge', facts.challengeLabel, paletteHex.accent, paletteHex.text, slots.vw * 0.3);
  // NOT paletteHex.panel/base — both are cool greys too close to the header card's own panel
  // tint to read as a separate chip (confirmed invisible via a live screenshot even after
  // switching panel→base). `secondary` (cream) is a real hue shift, not just a shade.
  pill(slots.score, 'pill-score', `SCORE ${facts.score}`, paletteHex.secondary, paletteHex.text, slots.vw * 0.3);
  const info = label(slots.info, 'text-info', facts.infoText, 14, paletteHex.text, slots.vw * 0.92 - 28, '700');
  info.position.set(14, 22);
  info.anchor.set(0, 0.5);
}
