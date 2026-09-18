// what_in: viewport width/height (from the Pixi renderer, resize-driven).
// what_out: the gameplay-screen slot containers, positioned per the required vertical structure:
//           header (settings / logo / leaderboard) → level-info card → instruction card →
//           Orders row → playable area → Slots row. Playable-area height/position is derived
//           from the viewport, not accumulated fixed offsets — see the `boardY` comment below.
// why_here: layout.ts owns structure only (A5) — content is painted by chrome.ts/ordersHud.ts/
//           tray.ts/boardRenderer.ts against the containers this returns.
//
// SCREEN-REBUILD pass: dropped `slot-legend` (the "TAP MATCHING ITEMS..." row) and
// `slot-powerups` (the hint icon row) — both sat between the board and the Slots Row and were
// explicitly called out for removal; the instruction card (`slot-info`) is the ONE place that
// copy appears now, not duplicated below the board too. Also dropped the footer/banner strip —
// not part of the requested hierarchy, and the freed space goes to the playable area instead
// (the explicit "make it the dominant visual region" ask). The old five-line meta block (partner/
// game-type/sub-type/challenge/score) is replaced by one compact `levelCard` (level + timer +
// score) per "LEVEL INFORMATION CARD" in the required structure.
import { Container, Graphics } from 'pixi.js';
import { paletteHexFor, FTUE_HIGHLIGHT_HEX, type ThemeName } from '../palette';
import { paintSurface, drawSoftShadow } from '../surface';
import { paint, shape, shadowOf } from '../inspector';

const COLUMN_MAX = 430;
/** Head-row icon button size — chrome.ts's settings/leaderboard controls match this exactly. */
export const HEAD_H = 44;
/** The instruction bar — U9 "one-line objective; FTUE copy lands here", always non-empty
 * (see gameController.ts#infoText). */
const INFO_H = 44;
/** Compact level/session card: level label + Timer + Score, one row. */
const LEVEL_CARD_H = 72;
/** Orders row height — must match board/ordersHud.ts#ORDER_CARD_H (individual cards, no shared
 * row background — each Order paints its own card). */
const ORDERS_H = 66;
/** Slots Row (tray) height. */
const ACTION_H = 64;
const BOARD_MIN_H = 220;
/** Gap either side of the playable area (Orders → board, board → Slots). */
const BOARD_GAP = 16;

export interface Slots {
  root: Container;
  vw: number;
  vh: number;
  /** Fixed board panel width/height in px — the authoritative board-area size for cell-sizing
   * math (board/boardRenderer.ts). Never read `slots.board.width`/`.height` for this: Pixi
   * Container dimensions are derived from child bounds, and once tile views are added as
   * children, a tile positioned near/past the panel edge (jitter + deep-stack layer offset)
   * silently grows the container's measured size — which would then grow next sync's computed
   * cell size too, compounding on every repaint ("the board expands while playing"). */
  boardWidth: number;
  boardHeight: number;
  settings: Container;
  brand: Container;
  profile: Container;
  levelCard: Container;
  levelLabel: Container;
  timer: Container;
  score: Container;
  info: Container;
  /** Dedicated dynamic-content child of `info` — the ONLY thing `paintInstructionBar` ever
   * touches, via a bare `removeChildren()`. `info` itself holds only this plus its own
   * background (shadow+face) and must never be cleared directly. */
  infoContent: Container;
  orders: Container;
  board: Container;
  action: Container;
  /** Dedicated dynamic-content child of `action` — the ONLY thing `paintTray` ever touches, via
   * a bare `removeChildren()`. Same reasoning as `infoContent`. */
  actionContent: Container;
  /** Hides/shows the instruction card and shifts Orders + the board up by the freed height (or
   * back down) to fill the gap — post-FTUE levels have no instruction copy to show (see
   * gameController.ts#infoText) and get that vertical space back instead of an empty blue bar.
   * Idempotent (sets absolute positions, not relative deltas) — safe to call every repaint. */
  setInstructionsVisible: (visible: boolean) => void;
}

function slot(label: string): Container {
  const c = new Container();
  c.label = label;
  return c;
}

export function buildLayout(stage: Container, vw0: number, vh0: number, safeBottom: number, theme: ThemeName): Slots {
  const paletteHex = paletteHexFor(theme);
  const vw = Math.min(COLUMN_MAX, vw0);
  const colX = (vw0 - vw) / 2;
  const root = new Container();
  root.position.set(colX, 0);
  stage.addChild(root);

  // GLOBAL VISUAL RULE: a full light page background, first — everything else stacks on it.
  const page = new Graphics().rect(0, 0, vw0, vh0).fill(paletteHex.base);
  page.position.set(-colX, 0);
  root.addChild(page);

  // ── Header row: settings (left) — logo (centre) — leaderboard/status (right) ──────────────
  let y = 10;
  const settings = slot('slot-settings');
  settings.position.set(0.04 * vw + HEAD_H / 2, y + HEAD_H / 2);
  const profile = slot('slot-profile');
  profile.position.set(0.92 * vw - HEAD_H / 2, y + HEAD_H / 2);
  const brand = slot('slot-brand');
  brand.position.set(vw * 0.5, y + HEAD_H / 2);
  y += HEAD_H + 12;

  // ── Level information card: level label + Score on one row, Timer prominent below ─────────
  const levelCard = slot('card-level-info');
  levelCard.position.set(0.04 * vw, y);
  const cardW = vw * 0.92;
  const levelLabel = slot('slot-level-label');
  levelLabel.position.set(16, 18);
  const score = slot('slot-score');
  score.position.set(cardW - 16, 18);
  const timer = slot('slot-timer');
  timer.position.set(cardW / 2, 48);
  y += LEVEL_CARD_H + 12;

  // ── Instruction card ───────────────────────────────────────────────────────────────────────
  const info = slot('slot-info');
  info.position.set(0.04 * vw, y);
  y += INFO_H + 14;

  // ── Orders row (full width — ordersHud.ts centres the card group itself) ─────────────────
  const orders = slot('slot-orders');
  orders.position.set(0, y);
  y += ORDERS_H;
  const ordersBottom = y;

  // ── Slots Row: anchored from the BOTTOM (independent of board height), full-width so its
  // centring formula (board/tray.ts#startXFor) resolves against the real viewport, not a
  // hand-tuned fraction of it. ──────────────────────────────────────────────────────────────
  const slotsBottom = vh0 - safeBottom - 12;
  const slotsTop = slotsBottom - ACTION_H;
  const action = slot('slot-action');
  action.position.set(0, slotsTop);

  // ── Playable area: fills (and is centred within) the gap between Orders and Slots — not an
  // accumulated fixed offset. `availableH` is the real leftover space on THIS viewport; capping
  // `boardH` at `vw * 1.4` keeps an unusually tall viewport from stretching the board into an
  // ungainly aspect ratio, centring it in the remaining slack instead. ─────────────────────────
  const availableTop = ordersBottom + BOARD_GAP;
  const availableBottom = slotsTop - BOARD_GAP;
  const availableH = Math.max(BOARD_MIN_H, availableBottom - availableTop);
  const boardH = Math.min(availableH, vw * 1.4);
  const boardY = availableTop + (availableH - boardH) / 2;
  const board = slot('slot-board');
  board.position.set(0, boardY);

  // Rigid up-shift by exactly the instruction card's own footprint (height + the gap after it) —
  // orders/board keep their own sizes, they just start higher, closing the gap the hidden card
  // leaves behind. Captured as plain numbers (not re-derived from live `.position.y` reads) so
  // repeated calls stay idempotent regardless of call order.
  const instructionShift = INFO_H + 14;
  const ordersY = orders.position.y;
  const setInstructionsVisible = (visible: boolean): void => {
    info.visible = visible;
    orders.position.y = visible ? ordersY : ordersY - instructionShift;
    board.position.y = visible ? boardY : boardY - instructionShift;
  };

  for (const c of [settings, brand, profile, levelCard, info, orders, board, action]) {
    root.addChild(c);
  }

  // Instruction bar: filled, secondary-tinted pill. `infoContent` is a dedicated child added
  // AFTER the background paint (so it's never buried under the face) — the ONLY container
  // paintInstructionBar ever clears, via a bare `removeChildren()`. A bare `removeChildren()`
  // directly on `info` would throw the instant `info` has exactly its 2 background children and
  // nothing else yet (Pixi's own removeChildren only treats an EMPTY range as valid on a
  // container with ZERO children total — see childrenHelperMixin.js — so "nothing new to
  // remove" on an otherwise-populated container is not a safe no-op, contrary to what an indexed
  // `removeChildren(2)` here previously assumed).
  // Pill fill is the exact `#0056D6` guidance-blue (FTUE_HIGHLIGHT_HEX) with white text
  // (instructionBar.ts) — a deliberate, scoped pair for this one element, not a change to the
  // shared `secondary` token (still read by CTA/settings hover fill elsewhere).
  paintSurface(info, vw * 0.92, INFO_H, 14, FTUE_HIGHLIGHT_HEX, 'soft-push');
  const infoContent = new Container();
  infoContent.label = 'info-content';
  info.addChild(infoContent);
  // Level card: neutral raised surface — painted BEFORE levelLabel/timer/score are attached
  // below. `paintSurface` always APPENDS its shadow+face graphics to whatever children a
  // container already has; attaching them first (as an earlier pass here did) put the solid
  // face on top of the text, hiding it completely. Every other slot's content is added later, at
  // runtime, by which point its own paintSurface call has long since run — this is the one slot
  // whose content containers exist from layout time, so it needs the explicit ordering.
  paintSurface(levelCard, vw * 0.92, LEVEL_CARD_H, 18, paletteHex.panel, 'soft-push');
  levelCard.addChild(levelLabel);
  levelCard.addChild(timer);
  levelCard.addChild(score);
  // Board: recessed (deep-emboss) so the play surface reads as a distinct, inset area.
  paintSurface(board, vw, boardH, 20, paletteHex.base, 'deep-emboss');
  // Slots Row card — a near-symmetric shadow (not `paintSurface`'s default one-sided `soft-push`
  // bias) so the card's own visual weight doesn't skew the perceived centre of the slots inside
  // it (the same class of illusion fixed for the start screen's hero card).
  drawSoftShadow(action, vw, ACTION_H, 16, 0, 3, 10, 0.12, paletteHex.text);
  action.addChild(new Graphics().roundRect(0, 0, vw, ACTION_H, 16).fill(paletteHex.secondary));
  paint(action, `#${paletteHex.secondary.toString(16).padStart(6, '0')}`);
  shape(action, 16);
  shadowOf(action, 'soft-push');
  // Dedicated dynamic-content child, added after the background above — same reasoning as
  // `infoContent`. `paintTray` clears only this, via a bare `removeChildren()`.
  const actionContent = new Container();
  actionContent.label = 'action-content';
  action.addChild(actionContent);

  return {
    root,
    vw,
    vh: vh0,
    boardWidth: vw,
    boardHeight: boardH,
    settings,
    brand,
    profile,
    levelCard,
    levelLabel,
    timer,
    score,
    info,
    infoContent,
    orders,
    board,
    action,
    actionContent,
    setInstructionsVisible,
  };
}
