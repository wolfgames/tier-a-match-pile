// what_in: viewport width/height (from the Pixi renderer, resize-driven).
// what_out: the 14 U9 slot containers, positioned per the gameplay-layout-wireframe
//           (head row, two meta columns, info/board/legend/powerups/action rows, banner),
//           plus one additive `slot-orders` (V1 Orders HUD, not part of the U9 contract).
// why_here: ux-contract.md §U9 — every slot is required, visible, and placed by formula;
//           ui-contract.spec asserts these exact bounds relationships.
//
// CARD-STACK pass (Mahjong-reference restructure): every U9-asserted x/y/w ratio is untouched —
// only the visual grouping changed. The head row + both meta columns now sit on ONE unified
// header card (`headerCard`, a plain decorative panel, not a `slot-*` — never asserted by
// ui-contract.spec) instead of each having its own separate pill/panel. `slot-orders` moved from
// between info and board to between board and legend — it is documented as additive/V1, not part
// of the official U9 ordering, so this is free to change; it now matches the reference's
// board → goal-card → controls stacking (and the user's explicit ask to put it "below the
// gameplay board").
// catalog: considered hud-display, tile-grid (both assume their own internal layout grid) —
//          this slot geometry is exact-pixel and game-specific, so a plain rounded panel via
//          the contract's own paint()/shape() drawer hooks is the direct fit; none promoted.
import { Container, Graphics } from 'pixi.js';
import { paletteHex } from '../palette';
import { paintSurface } from '../surface';

const COLUMN_MAX = 430;
/** Head-row icon button size — chrome.ts's icon glyphs are drawn to match this exactly. */
export const HEAD_H = 44;
const META_LINE_H = 22;
/** The Mahjong-reference "instruction bar" — this is `slot-info` (U9: "one-line objective; FTUE
 * copy lands here"), now always non-empty (see gameController.ts#infoText) and styled as a
 * prominent pill, not bare text. */
const INFO_H = 44;
/** Per-line height for the Orders HUD (one line per active Order). */
export const ORDERS_LINE_H = 22;
/** Hard cap on simultaneously-rendered Order lines — matches rules/deriveOrders.ts#MAX_ORDERS (the
 * level-based Orders-count curve introduced in the progression tuning pass now reaches 5-6 Orders
 * at level 15+/25+; this was previously capped at the old flat per-band max of 4, which would have
 * clipped/overflowed the HUD slot for those levels — raised to match, not a broader HUD rewrite. */
export const ORDERS_MAX_LINES = 6;
/** Card padding top+bottom around the Orders lines (ordersHud.ts paints inside this). */
const ORDERS_PAD = 20;
const ORDERS_H = ORDERS_LINE_H * ORDERS_MAX_LINES + ORDERS_PAD;
/** Legend is deliberately small/secondary now that `slot-info` carries the prominent
 * always-visible instruction — U1 only requires it stay visible, not prominent. */
const LEGEND_H = 28;
const POWERUPS_H = 56;
const ACTION_H = 64;
/** A footer strip, not a banner — light card + coloured text/link, not a solid brand-colour bar. */
export const BANNER_H = 44;
const BOARD_MIN_H = 160;

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
  partner: Container;
  gameType: Container;
  subType: Container;
  challenge: Container;
  score: Container;
  timer: Container;
  info: Container;
  orders: Container;
  board: Container;
  legend: Container;
  powerups: Container;
  action: Container;
  banner: Container;
}

function slot(label: string): Container {
  const c = new Container();
  c.label = label;
  return c;
}

export function buildLayout(stage: Container, vw0: number, vh0: number, safeBottom: number): Slots {
  const vw = Math.min(COLUMN_MAX, vw0);
  const colX = (vw0 - vw) / 2;
  const root = new Container();
  root.position.set(colX, 0);
  stage.addChild(root);

  // GLOBAL VISUAL RULE: a full light page background, first — everything else stacks on it.
  // (Also belt-and-suspenders alongside the Pixi Application's own backgroundColor.)
  const page = new Graphics().rect(0, 0, vw0, vh0).fill(paletteHex.base);
  page.position.set(-colX, 0);
  root.addChild(page);

  let y = 10;
  const settings = slot('slot-settings');
  settings.position.set(0.04 * vw, y);
  const profile = slot('slot-profile');
  profile.position.set(0.92 * vw - HEAD_H, y);
  const brand = slot('slot-brand');
  brand.position.set(vw * 0.5 - vw * 0.16, y);
  y += HEAD_H + 10;

  const metaTop = y;
  const partner = slot('slot-partner');
  partner.position.set(0.04 * vw, metaTop);
  const gameType = slot('slot-game-type');
  gameType.position.set(0.04 * vw, metaTop + META_LINE_H);
  const subType = slot('slot-sub-type');
  subType.position.set(0.04 * vw, metaTop + META_LINE_H * 2);
  const challenge = slot('slot-challenge');
  challenge.position.set(0.64 * vw, metaTop);
  const score = slot('slot-score');
  score.position.set(0.64 * vw, metaTop + META_LINE_H);
  // Third line of the right meta column — the left column (partner/gameType/subType) already
  // reserves 3 lines of height here, so this adds the Timer without perturbing any of the
  // existing U9 bounds relationships (same additive pattern as slot-orders below).
  const timer = slot('slot-timer');
  timer.position.set(0.64 * vw, metaTop + META_LINE_H * 2);
  y = metaTop + META_LINE_H * 3;

  // ONE unified header card behind settings/brand/profile + both meta columns (Mahjong
  // reference: gear, logo, level/score pills all read as one rounded container, not five
  // separate pills). Purely decorative — not a `slot-*`, never asserted by ui-contract.spec.
  const headerCardH = y - 10 + 14;
  const headerCard = new Container();
  headerCard.label = 'card-header';
  headerCard.position.set(0.02 * vw, 4);
  paintSurface(headerCard, vw * 0.96, headerCardH, 20, paletteHex.panel, 'soft-push');
  root.addChild(headerCard);
  y += 14;

  // Instruction bar (Mahjong's ever-visible teal bar) — this IS `slot-info` (U9: "one-line
  // objective; FTUE copy lands here"), now always non-empty (gameController.ts#infoText falls
  // back to the permanent rule reminder outside FTUE) and styled as a real pill, not bare text.
  const info = slot('slot-info');
  info.position.set(0.04 * vw, y);
  y += INFO_H + 10;

  // Anchor everything below the board against where the footer actually starts — not `vh0`
  // directly, which ignored the footer's own reserved space and could overlap it on shorter
  // viewports (the fixed rows below board, ORDERS_H+LEGEND_H+POWERUPS_H+ACTION_H plus their
  // gaps, don't shrink, so treating the full vh0 as available double-counted that space).
  const bannerTop = vh0 - BANNER_H - safeBottom - 6;
  const belowBoardH = 12 + ORDERS_H + 10 + LEGEND_H + 8 + POWERUPS_H + 8 + ACTION_H + 8;
  const remaining = Math.max(BOARD_MIN_H, bannerTop - y - belowBoardH);
  const board = slot('slot-board');
  board.position.set(0, y);
  y += remaining + 12;

  // Orders (goal/progress) card — moved from between info and board to below the board,
  // matching the reference's board → goal-card stacking and the user's explicit placement ask.
  // Additive V1 slot, not part of the official U9 ordering (free to move).
  const orders = slot('slot-orders');
  orders.position.set(0.04 * vw, y);
  y += ORDERS_H + 10;

  const legend = slot('slot-legend');
  legend.position.set(0.04 * vw, y);
  y += LEGEND_H + 8;

  const powerups = slot('slot-powerups');
  powerups.position.set(0.04 * vw, y);
  y += POWERUPS_H + 8;

  const action = slot('slot-action');
  action.position.set(vw * 0.1, y);
  y += ACTION_H + 8;

  const banner = slot('slot-partner-banner');
  banner.position.set(0.02 * vw, bannerTop);

  for (const c of [settings, brand, profile, partner, gameType, subType, challenge, score, timer, info, orders, board, legend, powerups, action, banner]) {
    root.addChild(c);
  }
  // Settings/profile/brand sit ON the header card now — chrome.ts draws them unfilled (a thin
  // outline circle / plain wordmark), matching the reference's icons-on-one-card look instead of
  // each having its own separate pill.
  // Instruction bar: filled, secondary-tinted pill — the most prominent text element after the
  // board itself.
  paintSurface(info, vw * 0.92, INFO_H, 14, paletteHex.secondary, 'soft-push');
  // Board: recessed (deep-emboss) so the play surface reads as a distinct, inset area —
  // separated from the raised HUD chrome around it, not just a same-plane rectangle.
  paintSurface(board, vw, remaining, 20, paletteHex.base, 'deep-emboss');
  // Orders/legend/powerups: same neutral panel treatment — real content (order lines / legend
  // copy / hint icon) painted on top by gameController.ts and its board/ helpers.
  paintSurface(orders, vw * 0.92, ORDERS_H, 16, paletteHex.panel, 'soft-push');
  paintSurface(legend, vw * 0.92, LEGEND_H, 10, paletteHex.panel, 'deep-emboss');
  paintSurface(powerups, vw * 0.92, POWERUPS_H, 12, paletteHex.panel, 'deep-emboss');
  // Action (tray) row: raised — this is the input surface, it should read as tactile/pressable.
  paintSurface(action, vw * 0.8, ACTION_H, 16, paletteHex.secondary, 'soft-push');
  // Footer: a light card now (was a solid brand-primary bar) — chrome.ts paints the tenant
  // link as coloured text/logo on top, matching the reference's light, understated footer.
  paintSurface(banner, vw * 0.96, BANNER_H, 16, paletteHex.panel, 'soft-push');

  return { root, vw, vh: vh0, boardWidth: vw, boardHeight: remaining, settings, brand, profile, partner, gameType, subType, challenge, score, timer, info, orders, board, legend, powerups, action, banner };
}
