// what_in: `slot-board` container + the ECS database + a tap callback.
// what_out: keeps one `tile-<id>` view per remaining tile in sync with `db.resources.pile`
//           (turn-based — repaints on the `pile` resource, no per-frame loop).
// why_here: renderers.md — a renderer projects ECS state, never holds it.
//
// R-EXPOSURE (geometric-exposure pass, tier-a-build-v4): grid size is derived once per level
// from the PRISTINE puzzle (`db.resources.currentPuzzle`, set once by loadLevel and never
// mutated afterward) — never from the live, shrinking `pile.tiles`, and never from
// `layer.width`/`.height` (a Pixi Container's size is derived from its children's bounds, so
// once tile views are added it stops being a fixed reference at all). Two real bugs were fixed
// getting here, both from computing the grid off something that changes mid-level:
//   1. Off `layer.width`/`.height`: adding tile views (positioned near/past the panel edge by
//      jitter/deep stacking) grew the container's measured bounds, which grew next repaint's
//      cell size, which shifted every tile again — compounding on every tap.
//   2. Off the live `pile.tiles`: as tiles get cleared, `max(col/row)` over the *remaining* set
//      can shrink (if the tiles holding the extreme column/row were just cleared), shrinking the
//      computed grid — and every remaining tile jumped to fit the new, smaller grid.
// The pristine puzzle never changes during play, so deriving from it is stable for the entire
// level. It's combined with `TIER_CONFIG[tier].cols/rows` via `Math.max` in both directions: a
// tier's tuned grid can be bigger than what one specific seed's tiles happen to use (preserves
// the intended board-coverage target rather than shrinking on an unlucky roll), and a puzzle's
// actual content can need more than the tier's current config specifies (the original bug this
// whole derivation replaced — e.g. FTUE Level 1's hand-authored puzzle places a tile at col:4
// while TIER_CONFIG.easy is only 4 wide, cols 0-3) — `Math.max` covers both directions at once.
// `cellH`/`cellW` are derived from the board slot's real measured width/height (was a flat `60`
// constant unrelated to layout) — a hard prerequisite for genuine 85-100% board-area coverage
// (see generator/objectTypes.ts). Every remaining tile is now interactive (not just the
// grid-topmost one): reachability is decided geometrically (board/exposure.ts) from each tile's
// real on-screen position/z-order, computed here via board/tiles.ts#tileLayoutFor so the exposure
// calc and the actual Pixi paint order can never disagree. `layer.sortableChildren = true` +
// per-tile `zIndex` let Pixi's own topmost-wins hit-testing route overlapping taps correctly for
// free.
import type { Container } from 'pixi.js';
import type { GameDatabase } from '../ecs/plugin';
import { buildTile, tileLayoutFor, tileSizeFor } from './tiles';
import { isGeometricallyExposed, type TileRect } from './exposure';
import { TIER_CONFIG } from '../generator/objectTypes';
import type { ThemeName } from '../palette';

export interface BoardRendererOptions {
  layer: Container;
  /** Fixed board panel size (layout.ts#Slots.boardWidth/boardHeight) — NOT `layer.width`/
   * `.height`, which are derived from child bounds and would grow once tile views (positioned
   * near/past the panel edge by jitter/deep stacking) are added as children, compounding the
   * board size on every subsequent repaint. */
  boardWidth: number;
  boardHeight: number;
  db: GameDatabase;
  onTap: (id: string) => void;
  getTheme: () => ThemeName;
}

export class BoardRenderer {
  private views = new Map<string, Container>();
  private unobserve: (() => void) | null = null;

  constructor(private opts: BoardRendererOptions) {
    this.opts.layer.eventMode = 'passive';
    this.opts.layer.sortableChildren = true;
    this.unobserve = opts.db.observe.resources.pile(() => this.sync());
  }

  private sync(): void {
    const { layer, boardWidth, boardHeight, db, onTap, getTheme } = this.opts;
    const state = db.resources.pile;
    // Derived from the PRISTINE puzzle (stable for the whole level) combined with the tier's
    // configured minimum — see the R-EXPOSURE note above for why both are needed.
    const pristineTiles = db.resources.currentPuzzle.tiles;
    const config = TIER_CONFIG[db.resources.tier];
    const cols = Math.max(config.cols, pristineTiles.reduce((max, t) => Math.max(max, t.col), 0) + 1);
    const rows = Math.max(config.rows, pristineTiles.reduce((max, t) => Math.max(max, t.row), 0) + 1);
    const cellW = boardWidth && cols ? boardWidth / cols : 60;
    const cellH = boardHeight && rows ? boardHeight / rows : 60;

    const live = new Set(state.tiles.map((t) => t.id));
    for (const [id, view] of this.views) {
      if (!live.has(id)) {
        view.destroy({ children: true });
        this.views.delete(id);
      }
    }
    // Every remaining tile's on-screen coverage can change whenever any other tile is picked
    // (removing whatever was covering it), so exposed/covered tiles are rebuilt each sync (cheap:
    // a couple hundred tiles per level at most, and this only runs on a `pile` change, never
    // per-frame).
    for (const [, view] of this.views) view.destroy({ children: true });
    this.views.clear();

    // Placement order matches intended visual stacking (lowest layer first, deterministic tie-
    // break by id) — cosmetic belt-and-suspenders alongside the real ordering guarantee, which is
    // each tile's explicit `zIndex` (see tiles.ts#tileLayoutFor) on this now-`sortableChildren`
    // layer.
    const ordered = [...state.tiles].sort((a, b) => a.layer - b.layer || (a.id < b.id ? -1 : 1));

    const safeCellW = cellW || 60;
    const safeCellH = cellH || 60;
    // Single source of truth for on-screen tile size this sync (tiles.ts#tileSizeFor) — fed into
    // both the real Pixi node (buildTile) and the exposure-geometry TileRect.w/h below, so "how
    // big it's drawn" and "what covers what" can never drift apart.
    const tileSize = tileSizeFor(safeCellW, safeCellH);
    const layouts = new Map(
      ordered.map((tile) => [tile.id, tileLayoutFor(tile, safeCellW, safeCellH, boardWidth, boardHeight)]),
    );
    const rects: TileRect[] = ordered.map((tile) => {
      const l = layouts.get(tile.id)!;
      return { id: tile.id, x: l.x, y: l.y, w: tileSize, h: tileSize, rotation: l.rot, zIndex: l.zIndex };
    });

    for (const tile of ordered) {
      const layout = layouts.get(tile.id)!;
      const exposed = isGeometricallyExposed(rects, tile.id);
      const view = buildTile(tile, layout, tileSize, exposed, getTheme(), onTap);
      layer.addChild(view);
      this.views.set(tile.id, view);
    }
  }

  getViewByLabel(label: string): Container | undefined {
    for (const view of this.views.values()) if (view.label === label) return view;
    return undefined;
  }

  destroy(): void {
    this.unobserve?.();
    for (const view of this.views.values()) view.destroy({ children: true });
    this.views.clear();
  }
}
