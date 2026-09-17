/**
 * Match Pile — rules engine spec (red phase).
 *
 * Tests each rule id in tier-a/REFERENCE_MATRIX.json against:
 *  - `reference.ts` (the test author's independent oracle, importable today)
 *  - the production `rules`/`solver`/`generator` barrels (do not exist yet —
 *    these imports are expected to fail to resolve until the implementer
 *    creates `~/game/match-pile/rules/index.ts`, `~/game/match-pile/solver/
 *    index.ts`, and `~/game/match-pile/generator/index.ts`).
 *
 * See tier-a/evidence/red/*.txt for the recorded red-phase run.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  TRAY_SIZE,
  MATCH_SIZE,
  type PileState,
  type Tile,
  type Order,
} from "~/game/match-pile/rules/types";
import {
  referenceStep,
  referenceIsValid,
  referenceIsExposed,
} from "~/game/match-pile/rules/reference";
// Production modules — do not exist yet at authoring time (red phase).
import { step, isValid, isExposed, rate } from "~/game/match-pile/rules";
import { generate } from "~/game/match-pile/generator";
import { solve, replay, explain } from "~/game/match-pile/solver";

function makeTile(
  id: string,
  typeId: string,
  col: number,
  row: number,
  layer: number
): Tile {
  return { id, typeId, col, row, layer };
}

/**
 * generator/ and solver/ are out of scope for the Orders build pass (see
 * R-ORDER-BURIED — Order-aware generation is deferred to a future
 * "Progression" pass) and are left untouched, so `generate()` still returns
 * puzzles with no `orders` of their own. Under R-ORDERS-WIN, a PileState
 * with zero configured Orders can never reach 'won' (see
 * rules/orders.ts#ordersSatisfied's deliberate zero-Orders guard) — so
 * exercising generator/solver solvability now requires attaching Orders.
 * This builds one Order per distinct type already present in `state.tiles`,
 * each requiring that type's full on-board count (always a multiple of
 * MATCH_SIZE by the generator's own triple-based construction) — i.e. the
 * puzzle is fully "ordered", so it is won exactly when it would have been
 * fully cleared under the old R-WIN semantics. This keeps R-GEN-SOLVABLE /
 * R-HINT exercising real solve()/explain() behavior instead of drifting to
 * vacuously-true assertions once explain()/solve() can no longer reach
 * 'won' at all.
 */
function ordersForFullClear(state: PileState): Order[] {
  const totals = new Map<string, number>();
  for (const tile of state.tiles) {
    totals.set(tile.typeId, (totals.get(tile.typeId) ?? 0) + 1);
  }
  return Array.from(totals.entries()).map(([itemTypeId, requiredQty]) => ({
    itemTypeId,
    requiredQty,
    collectedQty: 0,
  }));
}

// ---------------------------------------------------------------------------
// Shared fast-check arbitraries: small, valid, non-terminal PileStates on a
// 3x3x3 grid with a 4-letter type alphabet, plus a pick id that is sometimes
// a real tile id (exposed or not) and sometimes garbage.
// ---------------------------------------------------------------------------

const TYPE_IDS = ["A", "B", "C", "D"] as const;

const positionsArb = fc.uniqueArray(
  fc.record({
    col: fc.integer({ min: 0, max: 2 }),
    row: fc.integer({ min: 0, max: 2 }),
    layer: fc.integer({ min: 0, max: 2 }),
  }),
  { selector: (p) => `${p.col},${p.row},${p.layer}`, minLength: 1, maxLength: 9 }
);

const tilesArb: fc.Arbitrary<Tile[]> = positionsArb.chain((positions) =>
  fc
    .array(fc.constantFrom(...TYPE_IDS), {
      minLength: positions.length,
      maxLength: positions.length,
    })
    .map((typeIds) =>
      positions.map((p, i) => makeTile(`t${i}`, typeIds[i], p.col, p.row, p.layer))
    )
);

// Tray subset: no typeId at count >= MATCH_SIZE, length < TRAY_SIZE (non-terminal).
const trayArb: fc.Arbitrary<string[]> = fc
  .record({ A: fc.integer({ min: 0, max: 2 }), B: fc.integer({ min: 0, max: 2 }), C: fc.integer({ min: 0, max: 2 }), D: fc.integer({ min: 0, max: 2 }) })
  .map((counts) => {
    const tray: string[] = [];
    for (const typeId of TYPE_IDS) {
      for (let i = 0; i < counts[typeId]; i++) tray.push(typeId);
    }
    return tray;
  })
  .filter((tray) => tray.length <= 6);

// One Order per generated entry: itemTypeId drawn from the same small type
// alphabet as tiles/tray (so some overlap with real board typeIds happens
// naturally), requiredQty a small positive multiple of MATCH_SIZE (1-3
// triples' worth — enough to exercise both "satisfied" and "not yet"
// without inflating run time), collectedQty any valid value in
// [0, requiredQty] (including already-satisfied, to exercise R-ORDERS-WIN's
// "won implies satisfied" isValid check on freshly-generated states too).
const orderArb: fc.Arbitrary<Order> = fc
  .record({
    itemTypeId: fc.constantFrom(...TYPE_IDS),
    requiredMultiple: fc.integer({ min: 1, max: 3 }),
  })
  .chain(({ itemTypeId, requiredMultiple }) => {
    const requiredQty = requiredMultiple * MATCH_SIZE;
    return fc.integer({ min: 0, max: requiredQty }).map(
      (collectedQty): Order => ({ itemTypeId, requiredQty, collectedQty }),
    );
  });

// 0-2 Orders per state: small enough to keep the 2000-run parity property
// fast, but enough to exercise "no Orders configured" (R-ORDERS-WIN's
// zero-Orders guard), a single Order, and multiple Orders sharing/not
// sharing a typeId.
const ordersArb: fc.Arbitrary<Order[]> = fc.array(orderArb, { minLength: 0, maxLength: 2 });

const pileStateArb: fc.Arbitrary<PileState> = fc
  .tuple(tilesArb, trayArb, ordersArb)
  .map(([tiles, tray, orders]) => ({
    tiles,
    tray,
    cleared: 0,
    phase: "playing" as const,
    orders,
  }));

const stateAndPickArb = pileStateArb.chain((state) =>
  fc
    .oneof(
      { weight: 2, arbitrary: fc.constantFrom(...state.tiles.map((t) => t.id)) },
      { weight: 1, arbitrary: fc.constant("nonexistent") }
    )
    .map((pickId) => ({ state, pickId }))
);

describe("Match Pile rules — reference & production spec", () => {
  it("R-EXPOSURE — a tile is selectable iff no remaining tile shares its cell at a higher layer", () => {
    const state: PileState = {
      tiles: [
        makeTile("bottom", "A", 0, 0, 0),
        makeTile("top", "B", 0, 0, 1),
        makeTile("lone", "C", 1, 1, 0),
      ],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    expect(referenceIsExposed(state, "top")).toBe(true);
    expect(referenceIsExposed(state, "bottom")).toBe(false);
    expect(referenceIsExposed(state, "lone")).toBe(true);
    expect(referenceIsExposed(state, "missing")).toBe(false);

    fc.assert(
      fc.property(tilesArb, (tiles) => {
        const s: PileState = { tiles, tray: [], cleared: 0, phase: "playing", orders: [] };
        const topmostByCell = new Map<string, Tile>();
        for (const t of tiles) {
          const key = `${t.col},${t.row}`;
          const current = topmostByCell.get(key);
          if (!current || t.layer > current.layer) {
            topmostByCell.set(key, t);
          }
        }
        const expectedExposedIds = new Set(
          Array.from(topmostByCell.values()).map((t) => t.id)
        );
        for (const t of tiles) {
          expect(referenceIsExposed(s, t.id)).toBe(expectedExposedIds.has(t.id));
        }
      }),
      { numRuns: 500 }
    );
  });

  it("R-MATCH-SIZE — three identical typeIds present in the tray trigger a clear", () => {
    const state: PileState = {
      tiles: [
        makeTile("a1", "A", 0, 0, 0),
        makeTile("a2", "A", 1, 0, 0),
        makeTile("a3", "A", 2, 0, 0),
      ],
      tray: ["A", "A"],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    const next = referenceStep(state, "a3");
    expect(next.tray).toEqual([]);
    expect(next.cleared).toBe(3);
  });

  it("R-AUTOCLEAR — the triple clears immediately on the inserting pick, leaving other tray items untouched", () => {
    const state: PileState = {
      tiles: [
        makeTile("a1", "A", 0, 0, 0),
        makeTile("a2", "A", 1, 0, 0),
        makeTile("a3", "A", 2, 0, 0),
      ],
      tray: ["A", "A", "B"],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    const next = referenceStep(state, "a3");
    expect(next.tray).toEqual(["B"]);
    expect(next.cleared).toBe(3);
    expect(next.phase).toBe("playing");
  });

  it("R-TRAY-SIZE — TRAY_SIZE constant is 7", () => {
    expect(TRAY_SIZE).toBe(7);
  });

  it("R-FAIL — a pick that fills the tray to 7 with no completable triple ends the run as lost", () => {
    const state: PileState = {
      tiles: [
        makeTile("a1", "A", 0, 0, 0),
        makeTile("b1", "B", 1, 0, 0),
        makeTile("c1", "C", 2, 0, 0),
        makeTile("d1", "D", 3, 0, 0),
      ],
      tray: ["A", "B", "C", "D", "A", "B"],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    const next = referenceStep(state, "c1");
    expect(next.tray.length).toBe(7);
    expect(next.phase).toBe("lost");
  });

  // R-WIN ("pile empty ⇒ won") is SUPERSEDED by R-ORDERS-WIN — see
  // tier-a/REFERENCE_MATRIX.json. Per docs/GAME-DESIGN.md#core-loop, emptying
  // the pile is no longer required (or sufficient) to win; a level wins once
  // every Order is satisfied, whether or not distractor tiles remain. The
  // fixture below was rewritten in place (not silently kept passing under
  // the old meaning) to prove the gap during the red phase; it is now
  // implemented and green.
  it("R-ORDERS-WIN — a level wins once all Orders are satisfied, even with distractor tiles remaining", () => {
    const state: PileState = {
      tiles: [
        makeTile("a1", "A", 0, 0, 0),
        makeTile("a2", "A", 1, 0, 0),
        makeTile("a3", "A", 2, 0, 0),
        // Distractor tiles: not part of any Order, and deliberately left on
        // the board after the Order-completing pick below.
        makeTile("distractor1", "Z", 3, 0, 0),
        makeTile("distractor2", "Z", 4, 0, 0),
      ],
      tray: ["A", "A"],
      cleared: 0,
      phase: "playing",
      orders: [{ itemTypeId: "A", requiredQty: 3, collectedQty: 0 }],
    };
    const next = step(state, "a3");
    // The Order for "A" (qty 3) is now fully satisfied by this pick.
    expect(next.tiles.some((t) => t.typeId === "Z")).toBe(true); // distractors remain
    expect(next.phase).toBe("won");
  });

  // R-EXPOSURE is SUPERSEDED, for production tap-acceptance only, by the geometric-exposure
  // pass (tier-a-build-v4): tiles are visually scattered/rotated within their cell, so a tile
  // "covered" under the old abstract grid-cell/layer rule is often still partially, genuinely
  // visible on screen, and real players can tap that sliver directly. The real reachability
  // decision moved to the render layer (board/exposure.ts + board/boardRenderer.ts +
  // board/tiles.ts, using each tile's actual on-screen bounding box and Pixi's own topmost-wins
  // hit-testing) — see rules/isExposed.ts's doc comment for the full rationale. `step()` itself
  // (and `referenceStep`, in lockstep) no longer enforces the old rule at all: it now only
  // requires the picked id to still exist in `state.tiles` and the run to still be 'playing'.
  // `isExposed`/`referenceIsExposed` themselves are UNCHANGED (still the strict grid rule
  // `rate.ts`/`solve.ts`/`generate.ts` keep using internally) — this test proves the two have
  // intentionally diverged: a grid-covered tile is `isExposed() === false` but `step()` no
  // longer refuses to pick it.
  it("R-EXPOSURE (production tap-acceptance, geometric-exposure pass) — step() picks a grid-covered tile directly instead of no-op'ing", () => {
    const state: PileState = {
      tiles: [
        makeTile("bottom", "A", 0, 0, 0),
        makeTile("top", "B", 0, 0, 1),
      ],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    // The old grid rule still says "bottom" is covered — that rule didn't change.
    expect(isExposed(state, "bottom")).toBe(false);
    expect(referenceIsExposed(state, "bottom")).toBe(false);

    // But production step() (and referenceStep, in lockstep) now honors the pick anyway: the
    // render layer is trusted to have already decided "bottom" was visibly reachable.
    const next = step(state, "bottom");
    expect(next).not.toBe(state);
    expect(next.tiles.map((t) => t.id)).toEqual(["top"]);
    expect(next.tray).toEqual(["A"]);

    const refNext = referenceStep(state, "bottom");
    expect(next).toEqual(refNext);
  });

  it("R-TERMINAL — step() on a won or lost state returns that same state unchanged", () => {
    const wonState: PileState = {
      tiles: [],
      tray: ["A"],
      cleared: 3,
      phase: "won",
      orders: [{ itemTypeId: "Z", requiredQty: 3, collectedQty: 3 }],
    };
    expect(referenceStep(wonState, "anything")).toEqual(wonState);

    const lostState: PileState = {
      tiles: [makeTile("x", "A", 0, 0, 0)],
      tray: ["A", "B", "C", "D", "A", "B", "C"],
      cleared: 0,
      orders: [],
      phase: "lost",
    };
    expect(referenceStep(lostState, "x")).toEqual(lostState);
    expect(referenceStep(lostState, "nonexistent")).toEqual(lostState);
  });

  // R-NO-TIMER ("no countdown timer, ever") is SUPERSEDED by R-TIMER-BUDGET /
  // R-TIMER-FAIL / R-TIMER-PAUSE — see tier-a/REFERENCE_MATRIX.json and
  // docs/GAME-DESIGN.md#timer. The old assertion that PileState must forever
  // have exactly 4 fields is retired rather than silently kept green (it
  // would actively block the Orders field PileState needs). Timer itself is
  // wall-clock/real-time driven and is expected to live as an ECS resource
  // outside PileState, not as a PileState field — see tests/unit/game/timer.test.ts
  // for the actual red coverage of the Timer system.
  it("R-TIMER-PAUSE (red — Timer not implemented) — a Timer/tick module exists for the ECS layer", async () => {
    const timerModule = await import("~/game/match-pile/ecs/transactions/tickTimer").catch(
      () => null,
    );
    expect(timerModule, "ecs/transactions/tickTimer does not exist yet").not.toBeNull();
  });

  it("R-HINT (seed=7) explain() only ever names an exposed tile", () => {
    const { puzzle: rawPuzzle, solution } = generate({ seed: 7, tier: "easy" });
    const puzzle: PileState = { ...rawPuzzle, orders: ordersForFullClear(rawPuzzle) };
    let state: PileState = puzzle;
    const checkpoints: PileState[] = [state];
    for (const pickId of solution.slice(0, 3)) {
      state = step(state, pickId);
      checkpoints.push(state);
    }
    for (const checkpointState of checkpoints) {
      const hint = explain(checkpointState);
      if (hint !== null) {
        expect(checkpointState.tiles.some((t) => t.id === hint)).toBe(true);
        expect(referenceIsExposed(checkpointState, hint)).toBe(true);
      }
    }
  });

  it("R-GEN-SOLVABLE (seed=42) generates a solvable easy puzzle", () => {
    // Mirrors tests/unit/game/solvability.test.ts (D2, copied verbatim by the
    // build phase): solve() returns terminal states satisfying isValid();
    // replay() takes a *pick-id array* and returns a boolean. See
    // ordersForFullClear's doc comment above for why an Order set is
    // attached here rather than calling solve()/replay() on the generator's
    // raw (Orders-less) puzzle directly.
    const generated = generate({ seed: 42, tier: "easy" });
    const puzzle: PileState = { ...generated.puzzle, orders: ordersForFullClear(generated.puzzle) };
    const solutions = solve(puzzle, { limit: 1 });
    expect(solutions.length).toBeGreaterThanOrEqual(1);
    expect(isValid(solutions[0])).toBe(true);
    expect(solutions[0].phase).toBe("won");
    expect(replay(puzzle, solutions[0].picks)).toBe(true);
    // The generator's own recorded solution (proof of solvability by
    // construction) must also replay cleanly.
    expect(replay(puzzle, generated.solution)).toBe(true);
  });

  it("R-GEN-DETERMINISTIC (seed=42) same seed+tier reproduces the same puzzle", () => {
    const first = generate({ seed: 42, tier: "medium" });
    const second = generate({ seed: 42, tier: "medium" });
    expect(second).toEqual(first);

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }),
        fc.constantFrom("easy", "medium", "hard"),
        (seed, tier) => {
          const a = generate({ seed, tier });
          const b = generate({ seed, tier });
          expect(a).toEqual(b);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("R-FAIL (seed=1) a losing pick sequence reaches phase lost", () => {
    // seed=1 identifies this fixture: a hand-constructed, fully deterministic
    // scenario (8 tiles, 7 distinct typeIds among the first 7 picks, single
    // layer — all exposed) that is guaranteed to never complete a triple, so
    // picking 7 of the 8 tiles in insertion order fills the tray to
    // TRAY_SIZE while the pile is NOT yet empty (tile "h" is deliberately
    // left unpicked) — this isolates R-FAIL from R-WIN. The original fixture
    // picked all 7 tiles in the pile, which emptied it on the same
    // transition that filled the tray, colliding with R-WIN's documented
    // (and separately tested, see R-WIN above) precedence over R-FAIL —
    // fixed per tier-a-research-v4 same-pass correction, not a rule change.
    let state: PileState = {
      tiles: [
        makeTile("a", "A", 0, 0, 0),
        makeTile("b", "B", 1, 0, 0),
        makeTile("c", "C", 2, 0, 0),
        makeTile("d", "D", 3, 0, 0),
        makeTile("e", "E", 4, 0, 0),
        makeTile("f", "F", 5, 0, 0),
        makeTile("g", "G", 6, 0, 0),
        makeTile("h", "H", 7, 0, 0),
      ],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    for (const id of ["a", "b", "c", "d", "e", "f", "g"]) {
      state = step(state, id);
    }
    expect(state.tiles).toEqual([makeTile("h", "H", 7, 0, 0)]);
    expect(state.phase).toBe("lost");
  });

  it("parity — referenceStep matches production step across randomly generated legal and illegal picks", () => {
    fc.assert(
      fc.property(stateAndPickArb, ({ state, pickId }) => {
        const expected = referenceStep(state, pickId);
        const actual = step(state, pickId);
        expect(actual).toEqual(expected);
      }),
      { numRuns: 2000 }
    );
  });

  it("invariants — production step preserves rules invariants across a random walk, including terminal absorption (R-TERMINAL)", () => {
    fc.assert(
      fc.property(
        pileStateArb,
        fc.array(fc.boolean(), { minLength: 10, maxLength: 20 }),
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 20, maxLength: 20 }),
        (initialState, useGarbageFlags, pickIndexes) => {
          let state: PileState = initialState;
          let terminalSeen = false;
          let terminalSnapshot: PileState | null = null;

          for (let i = 0; i < useGarbageFlags.length; i++) {
            const useGarbage = useGarbageFlags[i];
            const pickId =
              !useGarbage && state.tiles.length > 0
                ? state.tiles[pickIndexes[i] % state.tiles.length].id
                : "nonexistent";

            state = step(state, pickId);

            if (terminalSeen) {
              expect(state).toEqual(terminalSnapshot);
              continue;
            }

            expect(isValid(state)).toBe(true);
            expect(referenceIsValid(state)).toBe(true);

            const ids = state.tiles.map((t) => t.id);
            expect(new Set(ids).size).toBe(ids.length);
            expect(state.tray.length).toBeLessThanOrEqual(TRAY_SIZE);
            expect(state.cleared % MATCH_SIZE).toBe(0);

            if (state.phase !== "playing") {
              terminalSeen = true;
              terminalSnapshot = state;
            }
          }
        }
      ),
      { numRuns: 300 }
    );
  });

  // -------------------------------------------------------------------------
  // Mutation-testing gap-fill (tier-a-research-v4 §4: bunx stryker run
  // tier-a/stryker.conf.json, ≥90% killed, survivors touching terminal state,
  // solution validation, or scoring must get a new test). The tests above
  // only ever exercise isValid()/isExposed()/step()/rate() indirectly through
  // legitimate play (reference parity + a random walk over *valid* states),
  // so several defensive branches — especially isValid()'s negative cases —
  // were never covered. These tests call the production functions directly,
  // including with deliberately INVALID states, to close those gaps.
  //
  // A few surviving mutants were investigated and are true equivalents given
  // this codebase's real invariants (documented at each site below) and are
  // intentionally left unfixed — no test, however constructed, can observe a
  // difference without also breaking on the unmutated code.
  // -------------------------------------------------------------------------

  it("isExposed — returns false for a tile id absent from state.tiles (direct call, not only reachable via step())", () => {
    // step() already filters out unknown ids via its own `!picked` guard
    // before ever calling isExposed(), so isExposed's *own* `!target` guard
    // (isExposed.ts line 12) is otherwise never exercised by any test that
    // only calls step(). Call it directly.
    const state: PileState = {
      tiles: [makeTile("only", "A", 0, 0, 0)],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    expect(isExposed(state, "nonexistent")).toBe(false);
  });

  it("isValid — rejects a state with duplicate tile ids", () => {
    const state: PileState = {
      tiles: [
        makeTile("dup", "A", 0, 0, 0),
        makeTile("dup", "B", 1, 1, 0),
      ],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    expect(isValid(state)).toBe(false);
  });

  it("isValid — rejects a state with two different tiles at the same (col,row,layer)", () => {
    const state: PileState = {
      tiles: [
        makeTile("one", "A", 0, 0, 0),
        makeTile("two", "B", 0, 0, 0),
      ],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    expect(isValid(state)).toBe(false);
  });

  it("isValid — rejects a tray longer than TRAY_SIZE", () => {
    const state: PileState = {
      tiles: [],
      tray: ["A", "A", "B", "B", "C", "C", "D", "D"],
      cleared: 0,
      phase: "won",
      orders: [{ itemTypeId: "A", requiredQty: 3, collectedQty: 3 }],
    };
    expect(state.tray.length).toBeGreaterThan(TRAY_SIZE);
    expect(isValid(state)).toBe(false);
  });

  it("isValid — rejects a tray holding a typeId at exactly MATCH_SIZE copies (the clear boundary)", () => {
    const state: PileState = {
      tiles: [],
      tray: ["A", "A", "A"],
      cleared: 0,
      phase: "won",
      orders: [{ itemTypeId: "A", requiredQty: 3, collectedQty: 3 }],
    };
    expect(isValid(state)).toBe(false);
  });

  it("isValid — rejects a negative cleared count and a positive cleared count that isn't a multiple of MATCH_SIZE", () => {
    const negative: PileState = {
      tiles: [makeTile("t0", "A", 0, 0, 0)],
      tray: [],
      cleared: -3,
      phase: "playing",
      orders: [],
    };
    expect(isValid(negative)).toBe(false);

    const nonMultiple: PileState = {
      tiles: [makeTile("t0", "A", 0, 0, 0)],
      tray: [],
      cleared: 1,
      phase: "playing",
      orders: [],
    };
    expect(isValid(nonMultiple)).toBe(false);
  });

  // R-ORDERS-WIN supersedes R-WIN: the old invariant here ("an empty pile's
  // phase must be 'won'") assumed pile-empty implied won, which is no longer
  // true — a level can empty its pile while Orders remain unsatisfied, and
  // that state is now a legal (if currently unreachable in practice without
  // a Timer/generator forcing the issue) "nothing left to pick, still
  // playing" state, not an invalid one. The replacement invariant instead
  // ties 'won' to Orders satisfaction directly: 'won' now REQUIRES every
  // Order to be satisfied (see isValid.ts), regardless of pile contents.
  it("isValid — accepts an empty pile with phase 'playing' when Orders are not yet satisfied", () => {
    const state: PileState = {
      tiles: [],
      tray: [],
      cleared: 3,
      phase: "playing",
      orders: [{ itemTypeId: "A", requiredQty: 6, collectedQty: 3 }],
    };
    expect(isValid(state)).toBe(true);
  });

  it("isValid — rejects phase 'won' when Orders are not satisfied (including zero configured Orders)", () => {
    const unsatisfied: PileState = {
      tiles: [],
      tray: [],
      cleared: 3,
      phase: "won",
      orders: [{ itemTypeId: "A", requiredQty: 6, collectedQty: 3 }],
    };
    expect(isValid(unsatisfied)).toBe(false);

    // R-ORDERS-WIN's zero-Orders guard: 'won' with no Orders configured at
    // all must also be rejected — there is nothing to have satisfied.
    const noOrders: PileState = { tiles: [], tray: [], cleared: 0, phase: "won", orders: [] };
    expect(isValid(noOrders)).toBe(false);
  });

  it("isValid — rejects phase 'playing' with a full (TRAY_SIZE) tray", () => {
    const state: PileState = {
      tiles: [makeTile("t0", "A", 0, 0, 0)],
      tray: ["A", "B", "C", "D", "E", "F", "G"],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    expect(state.tray.length).toBe(TRAY_SIZE);
    expect(isValid(state)).toBe(false);
  });

  it("step — auto-clear removes exactly MATCH_SIZE occurrences of the picked type, preserving other entries and leaving extras behind", () => {
    // Deliberately pre-loads the tray with 3 copies of "A" plus a "B" before
    // the triggering pick inserts a 4th "A" — a state isValid() would reject
    // (real play never reaches 3+ of one type pre-pick, since auto-clear
    // fires the instant the 3rd lands), but step() performs no such
    // precondition check itself. This is the only way to force the
    // removeFirstN counter past its boundary (remaining > 0 vs >= 0, and
    // -= 1 vs += 1) — under real invariants trayWithPick can never hold more
    // than MATCH_SIZE copies of any type, so that boundary is otherwise
    // unreachable by any legitimately-reached state.
    //
    // Carries a single Order for "A" so the pick's autoclear satisfies it —
    // this preserves the fixture's original intent (this pick ends the run
    // as 'won') under R-ORDERS-WIN, where an emptied pile alone no longer
    // wins.
    const state: PileState = {
      tiles: [makeTile("pick", "A", 0, 0, 0)],
      tray: ["A", "A", "A", "B"],
      cleared: 0,
      phase: "playing",
      orders: [{ itemTypeId: "A", requiredQty: 3, collectedQty: 0 }],
    };
    const next = step(state, "pick");
    expect(next.tray).toEqual(["B", "A"]);
    expect(next.cleared).toBe(3);
    expect(next.phase).toBe("won");
  });

  // rate() has no exported sub-steps (occupancy/branching/fail-penalty are
  // internal locals), so range/comparison assertions alone leave its
  // arithmetic and the naive walk's tie-break ordering almost entirely
  // unconstrained — a mutation can flip an operator or a comparison and
  // still land "some number in [0,1]" or "hard > easy". Each fixture below
  // is instead pinned to an exact expected value, independently hand-traced
  // through the documented naive-walk algorithm (rate.ts's own doc comment)
  // and cross-checked by direct execution — see the values inline. Being
  // exact makes every one of these sensitive to: which tile the tie-break
  // picks each step, the +1/-1 and >/>= boundaries in the occupancy and
  // branching accumulators, the 0.5/0.3/0.2 weights and their sign, and the
  // >0 ternary guards (including the branchingSamples===0 edge case, which
  // only the empty-puzzle fixture below reaches).

  it("rate — a single already-exposed tile: one naive-walk step, no clears, wins", () => {
    // 1 iteration: distinctExposedTypes=1, preInsertOccupancy=1, the pick
    // empties the pile (phase -> 'won'). occupancyScore=1/7, branchingScore=
    // 1/10, failPenalty=0. rate = (1/7)*0.5 + (1/10)*0.3 + 0*0.2.
    const state: PileState = {
      tiles: [makeTile("only", "A", 0, 0, 0)],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    expect(rate(state)).toBeCloseTo((1 / 7) * 0.5 + 0.1 * 0.3, 10);
  });

  it("rate — an already-cleared (empty) puzzle scores exactly 0 (branchingSamples===0 edge case)", () => {
    // The naive-walk loop never enters (tiles.length is already 0), so
    // maxTrayOccupancy/branchingSum/branchingSamples all stay 0 and the
    // `branchingSamples > 0 ? ... : 0` ternary must take its false branch —
    // the only fixture in this suite where that guard is actually false,
    // rather than vacuously true. Forcing the ternary's condition to `true`
    // here evaluates 0/0 (NaN) instead, which fails toBe(0).
    const state: PileState = { tiles: [], tray: [], cleared: 0, phase: "won", orders: [] };
    expect(rate(state)).toBe(0);
  });

  it("rate — a shallow, 2-type, single-layer puzzle that fully clears via the naive walk", () => {
    // Two exposed triples, single layer, distinct cells. Hand-traced pick
    // order (lowest col, tie-broken by lowest row, per rate.ts's own
    // selection loop): A(0,0), B(0,1), A(1,0), B(1,1), A(2,0) [clears the
    // 3rd A], B(2,1) [clears the 3rd B, pile empties -> won].
    // maxTrayOccupancy peaks at 5 (right before the first clear).
    // branchingSum = 2+2+2+2+2+1 = 11 over 6 samples -> avgBranching = 11/6.
    // occupancyScore = 5/7, branchingScore = (11/6)/10, failPenalty = 0.
    const easy: PileState = {
      tiles: [
        makeTile("a0", "A", 0, 0, 0),
        makeTile("a1", "A", 1, 0, 0),
        makeTile("a2", "A", 2, 0, 0),
        makeTile("b0", "B", 0, 1, 0),
        makeTile("b1", "B", 1, 1, 0),
        makeTile("b2", "B", 2, 1, 0),
      ],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    const expected = (5 / 7) * 0.5 + (11 / 6 / 10) * 0.3 + 0 * 0.2;
    expect(rate(easy)).toBeCloseTo(expected, 10);
  });

  it("rate — a deep, 8-type, single-layer puzzle the naive walk fails to clear (fail penalty fires)", () => {
    // 8 distinct singleton types, single layer, distinct cells: no triple
    // can ever complete, so the walk fills the tray to TRAY_SIZE over 7
    // picks (branchingSum = 8+7+6+5+4+3+2 = 35 over 7 samples) and the 7th
    // pick's resolution declares the run 'lost' with the 8th tile still in
    // the pile — the loop then exits on the phase check.
    // occupancyScore = 7/7 = 1, branchingScore = (35/7)/10 = 0.5,
    // failPenalty = 1.
    const hardTypes = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const hard: PileState = {
      tiles: hardTypes.map((typeId, i) => makeTile(`h${i}`, typeId, i, 0, 0)),
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    const expected = 1 * 0.5 + (35 / 7 / 10) * 0.3 + 1 * 0.2;
    expect(rate(hard)).toBeCloseTo(expected, 10);
    // Sanity cross-check on the two hand-traced fixtures above: the failing,
    // maximally-occluded shape should still score higher than the shallow,
    // fully-clearable one.
    const easyScore =
      (5 / 7) * 0.5 + (11 / 6 / 10) * 0.3 + 0 * 0.2;
    expect(rate(hard)).toBeGreaterThan(easyScore);
  });

  it("rate — a 2-layer stack: the naive walk must use isExposed(), not the raw tile list", () => {
    // Two tiles at the SAME cell, different layers: "top" (layer 1) covers
    // "bot" (layer 0). At the puzzle's initial state only "top" is exposed —
    // if rate.ts's inner loop used the raw `state.tiles` instead of
    // `state.tiles.filter(tile => isExposed(state, tile.id))`, it would treat
    // BOTH tiles as candidates on iteration 1, and since they share the same
    // (col,row) the tie-break comparator (line 59) never prefers either one
    // strictly, so array order would pick "bot" first — a tile step() will
    // actually refuse (not exposed), making step() no-op forever and the walk
    // never progress. That failure mode is wildly different from the
    // hand-traced result below, so this fixture kills the isExposed-filter
    // mutant along with several of the loop's occupancy/branching mutants.
    //
    // Iteration 1: exposed=[top] only. distinctExposedTypes=1 (Z).
    // preInsertOccupancy=0+1=1. step() removes top, tray=['Z'] (no clear,
    // only 1 copy), remaining tiles=[bot] -> phase stays 'playing'.
    // Iteration 2: bot is now topmost at its cell -> exposed=[bot].
    // distinctExposedTypes=1 (Y). preInsertOccupancy=1+1=2. step() removes
    // bot, tray=['Z','Y'] (no clear), tiles=[] -> phase 'won'. Loop exits.
    // maxTrayOccupancy=2, avgBranching=(1+1)/2=1, failPenalty=0.
    const state: PileState = {
      tiles: [
        makeTile("bot", "Y", 0, 0, 0),
        makeTile("top", "Z", 0, 0, 1),
      ],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    const expected = (2 / 7) * 0.5 + (1 / 10) * 0.3 + 0 * 0.2;
    expect(rate(state)).toBeCloseTo(expected, 10);
  });

  it("rate — three simultaneously-exposed tiles exercise the full lowest-col-then-lowest-row tie-break", () => {
    // Three single-layer tiles at distinct cells, chosen so no two
    // comparisons in the tie-break (`tile.col < pick.col || (tile.col ===
    // pick.col && tile.row < pick.row)`) are redundant: p3 has the lowest
    // col (must win outright regardless of row); p1/p2 share a column and
    // differ only by row (must be broken on the row clause specifically).
    // Hand-traced naive order: p3 (col 0) first, then p2 (col 1, row 2 <
    // row 5), then p1 (col 1, row 5) last.
    // Iter1: exposed={p1,p2,p3}, distinct types {P,Q}=2. pick p3(Q).
    //   preInsertOccupancy=0+1=1. tray=['Q'].
    // Iter2: exposed={p1,p2}, distinct types {P}=1. pick p2(P).
    //   preInsertOccupancy=1+1=2. tray=['Q','P'].
    // Iter3: exposed={p1}, distinct types {P}=1. pick p1(P).
    //   preInsertOccupancy=2+1=3. tray=['Q','P','P'] (only 2 P's total, no
    //   clear). tiles=[] -> 'won'.
    // maxTrayOccupancy=3, branchingSum=2+1+1=4 over 3 samples -> 4/3,
    // failPenalty=0.
    const state: PileState = {
      tiles: [
        makeTile("p1", "P", 1, 5, 0),
        makeTile("p2", "P", 1, 2, 0),
        makeTile("p3", "Q", 0, 9, 0),
      ],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    const expected = (3 / 7) * 0.5 + (4 / 3 / 10) * 0.3 + 0 * 0.2;
    expect(rate(state)).toBeCloseTo(expected, 10);
  });

  it("isExposed — two tiles at the identical (col,row,layer) each still count as exposed (strict '>' only, not '>=')", () => {
    // Not a reachable state under isValid() (which forbids duplicate
    // (col,row,layer) tuples), but isExposed() itself has no such guard — it
    // is a pure function over whatever tile list it's given. With the
    // correct strict '>' comparison, neither tile has a layer STRICTLY
    // greater than the other's (0 > 0 is false), so both remain exposed. A
    // '>=' mutant would make each tile see the other as "covering" it
    // (0 >= 0 is true), so both would incorrectly report not-exposed.
    const state: PileState = {
      tiles: [
        makeTile("twin-a", "A", 0, 0, 0),
        makeTile("twin-b", "B", 0, 0, 0),
      ],
      tray: [],
      cleared: 0,
      phase: "playing",
      orders: [],
    };
    expect(isExposed(state, "twin-a")).toBe(true);
    expect(isExposed(state, "twin-b")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Remaining mutation survivors, checked and confirmed equivalent (no test
  // can distinguish them from correct code without also failing on correct
  // code) — see tier-a/reports/mutation.json for the full list:
  //
  //  - isValid.ts's old "`if (state.tiles.length === 0) return false;` inside
  //    the `phase === 'playing'` branch" equivalence note (previously
  //    documented here) no longer applies: R-ORDERS-WIN retired both that
  //    line and the universal `tiles.length === 0 && phase !== 'won'` guard
  //    it depended on, since an empty pile with unsatisfied Orders is now a
  //    legal 'playing' state (see the "isValid — accepts an empty pile with
  //    phase 'playing'..." test above) rather than dead code to reason about.
  //  - isExposed.ts line 15 (`if (other.id === target.id) continue;`):
  //    removing the self-skip has no effect because the coverage check
  //    below it (`other.layer > target.layer`) is never true when
  //    `other === target` (a tile's layer is never strictly greater than
  //    its own layer).
  //  - step.ts line 39 (`if (!picked) { return state; }`, both the
  //    condition and the block body independently mutated): when `picked`
  //    is undefined, the very next guard (`if (!isExposed(state, tileId))
  //    return state;`) independently catches it — `isExposed` re-looks-up
  //    the same id via `state.tiles.find(...)` and returns `false` for an
  //    id that doesn't exist — so removing this earlier, redundant guard
  //    (either its condition or its body) cannot change step()'s output.
  //  - rate.ts line 65 (`if (preInsertOccupancy > maxTrayOccupancy)` ->
  //    `>=`): when the two are equal, the mutant reassigns
  //    `maxTrayOccupancy` to the exact value it already holds — a no-op
  //    assignment, unobservable by any test.
  // -------------------------------------------------------------------------
});
