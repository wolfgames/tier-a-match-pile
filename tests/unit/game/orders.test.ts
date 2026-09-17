/**
 * Match Pile — Orders system spec.
 *
 * Orders is a required core system per docs/GAME-DESIGN.md#orders and
 * tier-a/REFERENCE_MATRIX.json (R-ORDERS-WIN, R-ORDER-DATA, R-ORDER-PROGRESS,
 * R-ORDER-QTY-MULTIPLE3, R-ORDER-BURIED, R-DISTRACTOR-VALID).
 *
 * Field-name note: the Order shape's third field is `collectedQty` (see
 * src/game/match-pile/rules/types.ts#Order), not the `progress` name used in
 * this file's original red-phase draft — `collectedQty` is what the build
 * brief authoritatively specified for the implementation pass, so these
 * fixtures were updated in place to match the shipped shape rather than left
 * pointing at a field that was never implemented.
 *
 * R-ORDER-BURIED is generator-side (Order-aware placement) and is
 * INTENTIONALLY left red — deferred to a future "Progression" pass per the
 * build brief; this file does not implement or touch the generator.
 */

import { describe, it, expect } from "vitest";
import { step } from "~/game/match-pile/rules/step";
import { isValid } from "~/game/match-pile/rules/isValid";
import type { PileState, Tile } from "~/game/match-pile/rules/types";

function makeTile(id: string, typeId: string, col: number, row: number, layer: number): Tile {
  return { id, typeId, col, row, layer };
}

describe("Orders system", () => {
  it("R-ORDERS-WIN — a level wins once all Orders are satisfied, even with distractor tiles remaining", () => {
    const state: PileState = {
      tiles: [
        makeTile("a1", "A", 0, 0, 0),
        makeTile("a2", "A", 1, 0, 0),
        makeTile("a3", "A", 2, 0, 0),
        makeTile("distractor1", "Z", 3, 0, 0),
        makeTile("distractor2", "Z", 4, 0, 0),
      ],
      tray: ["A", "A"],
      cleared: 0,
      phase: "playing",
      orders: [{ itemTypeId: "A", requiredQty: 3, collectedQty: 0 }],
    };
    const next = step(state, "a3");
    expect(next.tiles.some((t) => t.typeId === "Z")).toBe(true); // distractors remain
    expect(next.phase).toBe("won");
  });

  it("R-ORDER-DATA — an orders module exposes a data shape with itemTypeId/requiredQty/collectedQty", async () => {
    const ordersModule = await import("~/game/match-pile/rules/orders").catch(() => null);
    expect(ordersModule, "rules/orders module does not exist").not.toBeNull();
    // Non-vacuous: exercise the shape via the module's own advanceOrders,
    // rather than only checking the module resolves.
    const { advanceOrders } = ordersModule as typeof import("~/game/match-pile/rules/orders");
    const advanced = advanceOrders([{ itemTypeId: "A", requiredQty: 3, collectedQty: 0 }], "A");
    expect(advanced[0]).toEqual({ itemTypeId: "A", requiredQty: 3, collectedQty: 3 });
  });

  it("R-ORDER-PROGRESS — completing a matching triple advances that Order's collectedQty by MATCH_SIZE (3), capped at requiredQty", () => {
    const state: PileState = {
      tiles: [
        makeTile("a1", "A", 0, 0, 0),
        makeTile("a2", "A", 1, 0, 0),
        makeTile("a3", "A", 2, 0, 0),
      ],
      tray: ["A", "A"],
      cleared: 0,
      phase: "playing",
      orders: [{ itemTypeId: "A", requiredQty: 3, collectedQty: 0 }],
    };
    const next = step(state, "a3");
    expect(next.orders[0]?.collectedQty).toBe(3);
  });

  it("R-ORDER-QTY-MULTIPLE3 — a validator rejects an Order whose requiredQty is not a multiple of 3", async () => {
    const { isValidOrder } = await import("~/game/match-pile/rules/orders");
    // Non-multiple-of-3 requiredQty is rejected...
    expect(isValidOrder({ itemTypeId: "A", requiredQty: 4, collectedQty: 0 })).toBe(false);
    // ...while a real positive multiple of 3 is accepted.
    expect(isValidOrder({ itemTypeId: "A", requiredQty: 3, collectedQty: 0 })).toBe(true);

    // Also exercised at the PileState level, per the build brief's
    // instruction that this validation lives in isValid()/referenceIsValid().
    const state: PileState = {
      tiles: [makeTile("a1", "A", 0, 0, 0)],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [{ itemTypeId: "A", requiredQty: 4, collectedQty: 0 }],
    };
    expect(isValid(state)).toBe(false);
  });

  it("R-ORDER-BURIED — the generator can place an Order-relevant tile at a non-zero (covered) layer", async () => {
    const generatorOrders = await import("~/game/match-pile/generator/objectTypes").then(
      (m) => (m as unknown as { ORDER_AWARE_PLACEMENT?: unknown }).ORDER_AWARE_PLACEMENT,
    ).catch(() => undefined);
    // Deliberately still RED — Order-aware generation is out of scope for
    // this pass (deferred to a future "Progression" pass); the generator has
    // no Order-aware placement concept yet, so this named export does not
    // exist.
    expect(generatorOrders, "generator Order-aware placement does not exist yet").toBeDefined();
  });

  it("multi-Order — satisfying one of two Orders keeps phase 'playing' while the other is outstanding", () => {
    const state: PileState = {
      tiles: [
        makeTile("a1", "A", 0, 0, 0),
        makeTile("a2", "A", 1, 0, 0),
        makeTile("a3", "A", 2, 0, 0),
        makeTile("b1", "B", 3, 0, 0),
        makeTile("b2", "B", 4, 0, 0),
        makeTile("b3", "B", 5, 0, 0),
      ],
      tray: ["A", "A"],
      cleared: 0,
      phase: "playing",
      orders: [
        { itemTypeId: "A", requiredQty: 3, collectedQty: 0 },
        { itemTypeId: "B", requiredQty: 3, collectedQty: 0 },
      ],
    };
    const afterA = step(state, "a3");
    expect(afterA.orders.find((o) => o.itemTypeId === "A")?.collectedQty).toBe(3);
    expect(afterA.orders.find((o) => o.itemTypeId === "B")?.collectedQty).toBe(0);
    expect(afterA.phase).toBe("playing");
  });

  it("multi-Order — completing the second/final Order flips phase to 'won', even with distractor tiles left on the board", () => {
    let state: PileState = {
      tiles: [
        makeTile("a1", "A", 0, 0, 0),
        makeTile("a2", "A", 1, 0, 0),
        makeTile("a3", "A", 2, 0, 0),
        makeTile("b1", "B", 3, 0, 0),
        makeTile("b2", "B", 4, 0, 0),
        makeTile("b3", "B", 5, 0, 0),
        makeTile("z1", "Z", 6, 0, 0),
        makeTile("z2", "Z", 7, 0, 0),
      ],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [
        { itemTypeId: "A", requiredQty: 3, collectedQty: 0 },
        { itemTypeId: "B", requiredQty: 3, collectedQty: 0 },
      ],
    };
    for (const id of ["a1", "a2", "a3"]) state = step(state, id);
    expect(state.phase).toBe("playing"); // one Order down, one still outstanding
    for (const id of ["b1", "b2", "b3"]) state = step(state, id);
    expect(state.orders.every((o) => o.collectedQty >= o.requiredQty)).toBe(true);
    expect(state.phase).toBe("won");
    // R-DISTRACTOR-VALID-adjacent: the never-picked Z distractors are still on the board.
    expect(state.tiles.some((t) => t.typeId === "Z")).toBe(true);
  });

  it("R-DISTRACTOR-VALID (already green — locked-in regression guard) — a distractor triple (matching no Order) still auto-clears normally", () => {
    const state: PileState = {
      tiles: [makeTile("z1", "Z", 0, 0, 0), makeTile("z2", "Z", 1, 0, 0), makeTile("z3", "Z", 2, 0, 0)],
      tray: ["Z", "Z"],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    const next = step(state, "z3");
    expect(next.cleared).toBe(3);
    expect(next.tray).toEqual([]);
  });
});
