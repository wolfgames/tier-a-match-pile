/**
 * Match Pile — geometric-exposure spec (tier-a-build-v4, Part A).
 *
 * board/exposure.ts is the new production tap-acceptance geometry: a tile is tappable once
 * enough of its own on-screen bounding box is left uncovered by tiles painted above it (real
 * screen position/z-order), replacing the old abstract grid-cell/layer rule (rules/isExposed.ts,
 * unchanged, still used internally by rate.ts/solve.ts/generate.ts) for the real player-input
 * path. These tests exercise the pure geometry directly, independent of Pixi/rendering.
 */
import { describe, it, expect } from "vitest";
import { exposedFraction, isGeometricallyExposed, MIN_EXPOSED_AREA_FRACTION, type TileRect } from "~/game/match-pile/board/exposure";

describe("board/exposure — bounding-box coverage geometry", () => {
  it("a lone tile with no overlapping rects is fully exposed", () => {
    const rects: TileRect[] = [{ id: "a", x: 0, y: 0, w: 40, h: 40, zIndex: 0 }];
    expect(exposedFraction(rects, "a")).toBe(1);
    expect(isGeometricallyExposed(rects, "a")).toBe(true);
  });

  it("an unknown id has zero exposure", () => {
    const rects: TileRect[] = [{ id: "a", x: 0, y: 0, w: 40, h: 40, zIndex: 0 }];
    expect(exposedFraction(rects, "missing")).toBe(0);
    expect(isGeometricallyExposed(rects, "missing")).toBe(false);
  });

  it("a tile fully covered by an identical, higher-zIndex rect is not exposed", () => {
    const rects: TileRect[] = [
      { id: "bottom", x: 0, y: 0, w: 40, h: 40, zIndex: 0 },
      { id: "top", x: 0, y: 0, w: 40, h: 40, zIndex: 1 },
    ];
    expect(exposedFraction(rects, "bottom")).toBe(0);
    expect(isGeometricallyExposed(rects, "bottom")).toBe(false);
    // The covering tile itself is unaffected — nothing is painted above it.
    expect(exposedFraction(rects, "top")).toBe(1);
  });

  it("a lower-zIndex overlapping rect does NOT count as covering (only strictly-higher zIndex covers)", () => {
    const rects: TileRect[] = [
      { id: "target", x: 0, y: 0, w: 40, h: 40, zIndex: 1 },
      { id: "below", x: 0, y: 0, w: 40, h: 40, zIndex: 0 },
    ];
    expect(exposedFraction(rects, "target")).toBe(1);
    expect(isGeometricallyExposed(rects, "target")).toBe(true);
  });

  it("a ~50%-overlapping higher tile leaves roughly half exposed, and clears the tunable threshold", () => {
    // "top" is offset by half its own width along x, so it covers the right half of "bottom"'s
    // box and leaves the left half genuinely visible.
    const rects: TileRect[] = [
      { id: "bottom", x: 0, y: 0, w: 40, h: 40, zIndex: 0 },
      { id: "top", x: 20, y: 0, w: 40, h: 40, zIndex: 1 },
    ];
    const frac = exposedFraction(rects, "bottom");
    expect(frac).toBeGreaterThanOrEqual(0.3);
    expect(frac).toBeLessThanOrEqual(0.6);
    expect(isGeometricallyExposed(rects, "bottom")).toBe(true);
  });

  it("a sliver overlap below MIN_EXPOSED_AREA_FRACTION is geometrically real but not tappable", () => {
    // "top" covers all but a thin strip at the very edge of "bottom" — real, non-zero exposure,
    // but too small to be a reliable touch target.
    const rects: TileRect[] = [
      { id: "bottom", x: 0, y: 0, w: 40, h: 40, zIndex: 0 },
      { id: "top", x: 8, y: 0, w: 40, h: 40, zIndex: 1 },
    ];
    const frac = exposedFraction(rects, "bottom");
    expect(frac).toBeGreaterThan(0);
    expect(frac).toBeLessThan(MIN_EXPOSED_AREA_FRACTION);
    expect(isGeometricallyExposed(rects, "bottom")).toBe(false);
  });

  it("multiple partial coverers can jointly cover a tile that no single one covers alone", () => {
    // Two higher tiles, each covering one half of "bottom" (left half + right half) — together
    // they cover the whole box even though neither alone would.
    const rects: TileRect[] = [
      { id: "bottom", x: 0, y: 0, w: 40, h: 40, zIndex: 0 },
      { id: "left-half", x: -20, y: 0, w: 40, h: 40, zIndex: 1 },
      { id: "right-half", x: 20, y: 0, w: 40, h: 40, zIndex: 1 },
    ];
    expect(exposedFraction(rects, "bottom")).toBe(0);
    expect(isGeometricallyExposed(rects, "bottom")).toBe(false);
  });
});

describe("board/exposure — rotation-aware coverage (root-cause regression for 'visibly-exposed tiles wrongly un-tappable')", () => {
  // ROOT CAUSE proof: two identically-positioned, identically-sized rects (one covering the
  // other) used to always compute to "fully covered" (exposedFraction 0) regardless of rotation,
  // because the old code treated every rect as an unrotated axis-aligned box. A real rendered
  // tile at ~±10° rotation (board/tiles.ts#tileLayoutFor) is visibly smaller than its own
  // unrotated bounding box everywhere except at the diagonal corners — so a covering tile that's
  // actually rotated leaves real, visible slivers of the target uncovered that the old math
  // always called "covered."
  it("a same-position/same-size covering tile that is UNROTATED fully covers the target (baseline, matches pre-fix behavior)", () => {
    const rects: TileRect[] = [
      { id: "bottom", x: 0, y: 0, w: 40, h: 40, rotation: 0, zIndex: 0 },
      { id: "top", x: 0, y: 0, w: 40, h: 40, rotation: 0, zIndex: 1 },
    ];
    expect(exposedFraction(rects, "bottom")).toBe(0);
    expect(isGeometricallyExposed(rects, "bottom")).toBe(false);
  });

  it("a same-position/same-size covering tile that IS rotated leaves the target's corners genuinely more visible than the unrotated case (rotation raises measured exposure)", () => {
    const rotated: TileRect[] = [
      { id: "bottom", x: 0, y: 0, w: 40, h: 40, rotation: 0, zIndex: 0 },
      { id: "top", x: 0, y: 0, w: 40, h: 40, rotation: Math.PI / 4, zIndex: 1 },
    ];
    const unrotated: TileRect[] = [
      { id: "bottom", x: 0, y: 0, w: 40, h: 40, rotation: 0, zIndex: 0 },
      { id: "top", x: 0, y: 0, w: 40, h: 40, rotation: 0, zIndex: 1 },
    ];
    // A 45°-rotated square's footprint is a diamond that doesn't reach its own bounding box's
    // corners — real, visible area outside the diamond but inside the target's own box, which the
    // old rotation-blind math always called "covered" (see the unrotated baseline test above).
    expect(exposedFraction(rotated, "bottom")).toBeGreaterThan(exposedFraction(unrotated, "bottom"));
  });

  it("R-EXPOSURE-GEOMETRIC root-cause proof — a tile the OLD rotation-blind math called un-tappable is CORRECTLY tappable once the covering tile's real rotation is accounted for", () => {
    // A same-cell-stack-like pair: "top" is offset from "bottom" (not perfectly concentric, same
    // as real jittered same-cell tiles) and rotated ~45°. Values pinned by direct computation
    // (see build report) — this is the concrete "old said covered, real geometry says exposed
    // enough to tap" case the fix targets, using only synthetic rects (no real gameplay needed).
    const withRealRotation: TileRect[] = [
      { id: "bottom", x: 0, y: 0, w: 40, h: 40, rotation: 0, zIndex: 0 },
      { id: "top", x: 9, y: 2, w: 40, h: 40, rotation: Math.PI / 4, zIndex: 1 },
    ];
    const treatedAsUnrotated: TileRect[] = [
      { id: "bottom", x: 0, y: 0, w: 40, h: 40, rotation: 0, zIndex: 0 },
      { id: "top", x: 9, y: 2, w: 40, h: 40, rotation: 0, zIndex: 1 },
    ];
    // OLD behavior (covering tile's real rotation ignored): below the tappable threshold.
    expect(isGeometricallyExposed(treatedAsUnrotated, "bottom")).toBe(false);
    // NEW behavior (covering tile's real ~45° rotation accounted for): correctly tappable — the
    // exact regression this pass fixes.
    expect(isGeometricallyExposed(withRealRotation, "bottom")).toBe(true);
  });

  it("two tiles rotated by the IDENTICAL amount, at the same position/size, still fully cover each other — the fix doesn't overcorrect into 'everything is tappable'", () => {
    const rects: TileRect[] = [
      { id: "bottom", x: 0, y: 0, w: 40, h: 40, rotation: 0.3, zIndex: 0 },
      { id: "top", x: 0, y: 0, w: 40, h: 40, rotation: 0.3, zIndex: 1 },
    ];
    expect(exposedFraction(rects, "bottom")).toBe(0);
    expect(isGeometricallyExposed(rects, "bottom")).toBe(false);
  });
});
