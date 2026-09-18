// what_in: a single Tile + its cell size + a precomputed geometric-exposure verdict (from
//          board/exposure.ts, via boardRenderer.ts) + the current theme + a tap callback.
// what_out: one `tile-<id>` Pixi node, scattered/rotated within its cell for a "freeform pile"
//           look, with real interactivity/z-order for whichever tiles are geometrically exposed.
// why_here: board/ per A6/A9; the piece face is a neutral raised chip with the item's Pixi vector
//           icon (matchIcons.ts — shape + stable colour) on top, not a food-themed drawing —
//           the same icon+colour identity board pieces, Orders cards, and Slots Row all share.
import { Container, Graphics } from 'pixi.js';
import type { Tile } from '../rules/types';
import { paint, shadowOf } from '../inspector';
import { paletteHexFor, type ThemeName } from '../palette';
import { drawSoftShadow } from '../surface';
import { drawMatchIconFor } from '../matchIcons';

/**
 * SCATTER-FILL pass (tier-a-build-v4, Part B): tile size used to be a flat 40px regardless of
 * grid density, so a coarse band (e.g. veryHard's 7x7) left visible gaps between same-size
 * neighbors even before jitter — a big part of "looks sparse/gridded, not a scattered heap." Tile
 * size now scales with cell size so neighbors physically overlap before jitter is applied,
 * clamped to a sane on-screen range. RATIO=1.0 (was 0.62): an un-jittered tile's edge lands right
 * at its cell's edge, so any jitter at all now produces real overlap. Tuned empirically
 * (Monte-Carlo board-area coverage, tests/unit/game/coverage.test.ts) against the retuned
 * TIER_CONFIG tile counts — changing one without the other requires re-verifying both.
 */
const TILE_SIZE_CELL_RATIO = 1.0;
const MIN_TILE_SIZE = 26;
/** Raised from 56: at RATIO=1.0, easy's 4x4 grid (largest cells) would otherwise want an
 * ~80-100px tile — legible, but this caps how oversized "bigger cell = bigger tile" is allowed
 * to get relative to the ~400px board column. */
const MAX_TILE_SIZE = 72;

/** Legacy flat size, kept only as the fallback when a caller has no real cell size yet (e.g. a
 * 0x0 layout before the board slot has measured). Production sync always goes through
 * `tileSizeFor`. */
export const TILE_SIZE = 40;

/** Single source of truth for a tile's on-screen size — shared by buildTile's drawn Graphics and
 * boardRenderer's exposure-geometry TileRect.w/h, so "how big it's drawn" and "what covers what"
 * can never drift apart (same contract tileLayoutFor already keeps for position/rotation). */
export function tileSizeFor(cellW: number, cellH: number): number {
  const cell = Math.min(cellW, cellH);
  if (!(cell > 0)) return TILE_SIZE;
  return Math.min(MAX_TILE_SIZE, Math.max(MIN_TILE_SIZE, cell * TILE_SIZE_CELL_RATIO));
}

/** Deterministic string hash → [0,1), so a tile's scatter offset is stable across re-renders. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface TileLayout {
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  /** Paint order for Pixi's `zIndex` (board layer has `sortableChildren = true`) — `tile.layer`
   * dominates (real grid-stack order), with a tiny deterministic per-id fraction (< the smallest
   * possible layer gap of 1) so same-layer, different-cell ties never depend on child-array
   * insertion order/sort stability. Feed this same value into board/exposure.ts#TileRect.zIndex
   * so the coverage calc and Pixi's actual paint order can never disagree. */
  readonly zIndex: number;
}

/** SCATTER-FILL pass: jitter amplitude as a fraction of cell size. Raised from 0.3 (±15% of cell
 * size — tiles mostly stayed inside their own cell) to 1.0 (±50% — a tile's center can now reach
 * its own cell's edge, routinely spilling into a neighbor). A real "scattered heap" needs
 * cross-cell overlap, not just per-cell noise. The board-bounds clamp below keeps this safe at
 * the edges regardless of amplitude. */
const JITTER_COEFF = 1.0;

/** Rotation range in radians (full spread of the ±half-range below) — unchanged from the
 * original geometric-exposure pass; not implicated in the sparse/chunked complaint, kept as-is. */
const ROTATION_RANGE = 0.35;

const LAYER_Y_OFFSET = 3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Single source of truth for a tile's on-screen position/rotation/paint-order — shared by the
 * real Pixi node (buildTile) and the geometric exposure calc (boardRenderer.ts), so "where it's
 * drawn" and "what covers what" can never drift apart.
 *
 * `boardWidth`/`boardHeight` (the fixed board panel size, layout.ts#Slots.boardWidth/boardHeight)
 * clamp the final jittered position so no tile ever renders outside the board panel —
 * non-negotiable per the density/scatter brief. Clamp margin = the tile's own half-diagonal (safe
 * for any rotation up to 45°, well past the actual ~±10° range), so the worst-case rotated corner
 * still lands inside the panel. */
export function tileLayoutFor(
  tile: Tile,
  cellW: number,
  cellH: number,
  boardWidth = 0,
  boardHeight = 0,
): TileLayout {
  const tileSize = tileSizeFor(cellW, cellH);
  const jx = (hash01(`${tile.id}x`) - 0.5) * cellW * JITTER_COEFF;
  const jy = (hash01(`${tile.id}y`) - 0.5) * cellH * JITTER_COEFF;
  const rot = (hash01(`${tile.id}r`) - 0.5) * ROTATION_RANGE;
  let x = tile.col * cellW + cellW / 2 + jx;
  let y = tile.row * cellH + cellH / 2 + jy + tile.layer * LAYER_Y_OFFSET;

  const margin = tileSize * Math.SQRT1_2;
  if (boardWidth > 0 && boardWidth >= margin * 2) {
    x = clamp(x, margin, boardWidth - margin);
  }
  if (boardHeight > 0 && boardHeight >= margin * 2) {
    y = clamp(y, margin, boardHeight - margin);
  }

  const zIndex = tile.layer + hash01(`${tile.id}z`) * 0.0001;
  return { x, y, rot, zIndex };
}

export function buildTile(
  tile: Tile,
  layout: TileLayout,
  size: number,
  exposed: boolean,
  theme: ThemeName,
  onTap: (id: string) => void,
): Container {
  const c = new Container();
  c.label = `tile-${tile.id}`;
  c.position.set(layout.x, layout.y);
  c.rotation = layout.rot;
  c.zIndex = layout.zIndex;

  const palette = paletteHexFor(theme);
  // Neutral raised chip — the icon (matchIcons.ts) carries the item's colour identity, not the
  // chip itself, so a piece's colour never competes with or gets muddied by a second background
  // tint.
  drawSoftShadow(c, size, size, 8, -size / 2 - 3, -size / 2 - 3, 6, 0.12, palette.text);
  const g = new Graphics().roundRect(-size / 2, -size / 2, size, size, 8).fill(palette.panel);
  // Labelled so tutorial/highlight.ts can hug this exact solid body — `getLocalBounds()` on `c`
  // itself would include the soft-shadow Graphics above (drawn wider than the tile face).
  g.label = 'tile-face';
  c.addChild(g);
  paint(c, `#${palette.panel.toString(16).padStart(6, '0')}`);
  shadowOf(c, 'soft-push');

  const icon = drawMatchIconFor(tile.typeId, size);
  c.addChild(icon);

  // R-EXPOSURE (geometric-exposure pass): interactivity/alpha now reflect real on-screen
  // coverage (board/exposure.ts), not the abstract grid-cell/layer rule — a tile behind another
  // is tappable directly the moment enough of it is visibly uncovered. See rules/isExposed.ts's
  // doc comment for the full before/after and why the old rule stays put as an internal tool.
  c.alpha = exposed ? 1 : 0.55;
  c.eventMode = exposed ? 'static' : 'none';
  if (exposed) {
    c.accessible = true;
    c.accessibleTitle = `${tile.typeId.replace(/-/g, ' ')} tile`;
    c.on('pointertap', () => onTap(tile.id));
  }
  return c;
}
