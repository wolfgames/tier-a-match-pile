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
import gsap from 'gsap';
import type { GameDatabase } from '../ecs/plugin';
import { buildTile, tileLayoutFor, tileSizeFor } from './tiles';
import { isGeometricallyExposed, type TileRect } from './exposure';
import { TIER_CONFIG } from '../generator/objectTypes';
import type { ThemeName } from '../palette';
import { PilePhysics, STANDARD_PHYSICS, type PhysicsTuning } from './pilePhysics';

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
  /** PILE-PHYSICS — the caller picks the profile (pilePhysics.ts#physicsTuningForLevel); defaults
   * to pilePhysics.ts#STANDARD_PHYSICS if omitted. */
  physicsTuning?: PhysicsTuning;
}

export class BoardRenderer {
  private views = new Map<string, Container>();
  private unobserve: (() => void) | null = null;
  // PILE-PHYSICS prototype: presentation-only sim, keyed by tile id — completely separate from
  // `db.resources.pile` (the logical source of truth `sync()` below still reads exclusively).
  // Survives across `sync()` calls (unlike `views`, which are destroyed/rebuilt every sync per
  // the R-EXPOSURE contract) so a tile's fall/settle continues smoothly frame to frame regardless
  // of how often the logical pile repaints.
  private physics: PilePhysics;
  private physicsPuzzleRef: unknown = null;

  constructor(private opts: BoardRendererOptions) {
    this.opts.layer.eventMode = 'passive';
    this.opts.layer.sortableChildren = true;
    this.physics = new PilePhysics(opts.physicsTuning ?? STANDARD_PHYSICS);
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

    // PILE-PHYSICS: a new level's puzzle means every previous body is meaningless (different
    // tiles, different ids almost certainly) — drop them all rather than risk a reused id
    // inheriting a stale pose from the last level.
    if (db.resources.currentPuzzle !== this.physicsPuzzleRef) {
      this.physicsPuzzleRef = db.resources.currentPuzzle;
      this.physics.reset();
    }

    const live = new Set(state.tiles.map((t) => t.id));
    for (const [id, view] of this.views) {
      if (!live.has(id)) {
        // A press's scale-punch tween (see the `pointerdown` wiring below) may still be running
        // if this tile was matched moments after being pressed — kill it before destroy, same
        // "kill tweens before destroying targets" guardrail every other animated node follows.
        gsap.killTweensOf(view.scale);
        view.destroy({ children: true });
        this.views.delete(id);
        // PILE-PHYSICS: this tile just left the logical pile (matched/collected) — stop
        // simulating it, and wake any sleeping neighbours so they fall into the gap it left.
        const lastPose = this.physics.remove(id);
        if (lastPose) this.physics.wakeNear(lastPose.x, lastPose.y);
      }
    }
    // Every remaining tile's on-screen coverage can change whenever any other tile is picked
    // (removing whatever was covering it), so exposed/covered tiles are rebuilt each sync (cheap:
    // a couple hundred tiles per level at most, and this only runs on a `pile` change, never
    // per-frame).
    for (const [, view] of this.views) {
      gsap.killTweensOf(view.scale);
      view.destroy({ children: true });
    }
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

    // PILE-PHYSICS: spawn a body for any tile that doesn't have one yet — in practice only ever
    // happens on a level's first sync, since the full tile set is fixed at load and only shrinks
    // (R-EXPOSURE header note). The scatter formula's own x/y/rot becomes the body's rest anchor;
    // existing bodies are left alone here — their LIVE (possibly still-falling) pose is what gets
    // used below, not this formula.
    const radius = (tileSize / 2) * (this.opts.physicsTuning ?? STANDARD_PHYSICS).collisionRadiusRatio;
    for (const tile of ordered) {
      if (this.physics.has(tile.id)) continue;
      const l = layouts.get(tile.id)!;
      this.physics.spawn(tile.id, l.x, l.y, l.rot, radius);
    }

    // Exposure/paint-order geometry reads each tile's LIVE physics pose, not the static scatter
    // formula — so tap-acceptance always matches what's actually rendered, even mid-settle
    // (preserves the existing "exposure calc and the actual Pixi paint order can never disagree"
    // contract, just fed from a different position source).
    const rects: TileRect[] = ordered.map((tile) => {
      const pose = this.physics.getPose(tile.id)!;
      const zIndex = layouts.get(tile.id)!.zIndex;
      return { id: tile.id, x: pose.x, y: pose.y, w: tileSize, h: tileSize, rotation: pose.rotation, zIndex };
    });

    for (const tile of ordered) {
      const pose = this.physics.getPose(tile.id)!;
      const zIndex = layouts.get(tile.id)!.zIndex;
      const exposed = isGeometricallyExposed(rects, tile.id);
      const view = buildTile(tile, { x: pose.x, y: pose.y, rot: pose.rotation, zIndex }, tileSize, exposed, getTheme(), onTap);
      // PRESS-FEEDBACK pass: `pointerdown` fires immediately on touch, independent of whether the
      // eventual `pointertap` resolves as a valid move — never touches ECS/logical state, purely
      // the tile's own physics body + a quick visual compression. Gated on `exposed` to match
      // buildTile's own interactivity gating (a covered tile has `eventMode: 'none'`, so this
      // would never fire for one anyway; the explicit check just documents why). The scale punch
      // is a plain GSAP tween (physics only owns x/y/rotation — see pilePhysics.ts's header note),
      // killed before this exact view is ever destroyed (both loops above).
      if (exposed) {
        view.on('pointerdown', () => {
          this.physics.press(tile.id);
          gsap.killTweensOf(view.scale);
          gsap.to(view.scale, { x: 0.92, y: 0.92, duration: 0.06, ease: 'sine.out', yoyo: true, repeat: 1 });
        });
      }
      layer.addChild(view);
      this.views.set(tile.id, view);
    }
  }

  /** PILE-PHYSICS: advances the pile simulation by `dt` seconds and pushes the result onto
   * whichever tile views currently exist — call every frame from the controller's own ticker
   * (never a new frame loop of its own; guardrail #3). Only touches a view when its body is
   * actually awake, so a fully-settled pile costs one `Map` iteration and nothing else per frame. */
  tick(dt: number): void {
    this.physics.step(dt, { width: this.opts.boardWidth, height: this.opts.boardHeight });
    for (const [id, view] of this.views) {
      if (this.physics.isSleeping(id)) continue;
      const pose = this.physics.getPose(id);
      if (!pose) continue;
      view.position.set(pose.x, pose.y);
      view.rotation = pose.rotation;
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
