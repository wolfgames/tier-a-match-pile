// Cheap end-to-end proof that services/levels.ts#getLevel() actually attaches
// valid, satisfiable Orders to real content at load time (the "actual
// blocker" this build pass exists to fix — see rules/deriveOrders.ts). One
// FTUE level (zero-distractor exception) + one pack level (subset selection,
// distractor left over). Intentionally minimal per the build brief — not a
// broader suite.
import { describe, expect, it } from 'vitest';
import { getLevel } from '~/game/match-pile/services/levels';
import { isValidOrder } from '~/game/match-pile/rules/orders';
import { step } from '~/game/match-pile/rules/step';
import { ORDER_QTY_RANGE, MAX_ORDERS, ORDER_COUNT_LEVEL_RANGES, orderCountForLevel } from '~/game/match-pile/rules/deriveOrders';
import { TIER_CONFIG } from '~/game/match-pile/generator/objectTypes';
import { createGameWorld } from '~/game/match-pile/ecs/plugin';
import { loadLevel } from '~/game/match-pile/ecs/agentPlugin';
import { FTUE_LEVEL_COUNT, bandForLevel } from '~/game/match-pile/services/levelSequence';
import type { Tier } from '~/game/match-pile/rules/types';

/** True if `levelIndex` is a real Easy level immediately following Hard/VeryHard in the actual
 * BAND_SEQUENCE — used to double-check the "Easy-relief" levels used in the worked-example tests
 * below are genuinely relief levels, not just assumed to be (see build report: the brief's own
 * hypothesized levels 8/22 turned out to be hard/medium, not Easy-relief, once checked against
 * the real BAND_SEQUENCE). */
function bandForLevelInRelief(levelIndex: number): boolean {
  const band = bandForLevel(levelIndex);
  const prev = bandForLevel(levelIndex - 1);
  return band === 'easy' && (prev === 'hard' || prev === 'veryHard');
}

describe('Orders integration — getLevel() derives real, satisfiable Orders', () => {
  it.each([
    { levelIndex: 1, ftue: true },
    { levelIndex: 10, ftue: false },
  ])('level $levelIndex: valid on-board-bounded Orders whose recorded solution wins', ({ levelIndex, ftue }) => {
    const { puzzle, solution } = getLevel(levelIndex);

    expect(puzzle.orders.length).toBeGreaterThan(0);

    const onBoardCounts = new Map<string, number>();
    for (const tile of puzzle.tiles) {
      onBoardCounts.set(tile.typeId, (onBoardCounts.get(tile.typeId) ?? 0) + 1);
    }
    for (const order of puzzle.orders) {
      expect(isValidOrder(order)).toBe(true);
      expect(order.requiredQty).toBeLessThanOrEqual(onBoardCounts.get(order.itemTypeId) ?? 0);
    }

    // Replay the level's own recorded solution through the real step() and
    // confirm it actually reaches 'won' (stopping as soon as it does, since a
    // subset Order set can be satisfied before the full solution is spent).
    let state = puzzle;
    for (const tileId of solution) {
      if (state.phase === 'won') break;
      state = step(state, tileId);
    }
    expect(state.phase).toBe('won');

    const orderedTypes = new Set(puzzle.orders.map((o) => o.itemTypeId));
    const distinctTypes = new Set(puzzle.tiles.map((t) => t.typeId));
    if (ftue) {
      // FTUE Level 1 exception: zero distractors — every distinct type is an Order.
      expect(orderedTypes.size).toBe(distinctTypes.size);
    } else {
      // Non-FTUE: winning must not require the whole pile — at least one
      // distinct type present was never an Order (a genuine distractor).
      const hasDistractorType = [...distinctTypes].some((t) => !orderedTypes.has(t));
      expect(hasDistractorType).toBe(true);
    }
  });
});

describe('Order quantities — conservative, band-keyed, never absurd (fixes the "0/90" bug)', () => {
  // Spans multiple bands/relief transitions and both sides of ORDER_COUNT_FLOOR_LEVEL (5).
  const levels = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 22, 28, 30, 32, 33, 38];

  it.each(levels)('level %d: every Order requiredQty is within its band range and never exceeds on-board copies', (levelIndex) => {
    const { puzzle, tier } = getLevel(levelIndex);
    const { minQty, maxQty } = ORDER_QTY_RANGE[tier];

    const onBoardCounts = new Map<string, number>();
    for (const tile of puzzle.tiles) onBoardCounts.set(tile.typeId, (onBoardCounts.get(tile.typeId) ?? 0) + 1);

    for (const order of puzzle.orders) {
      expect(isValidOrder(order)).toBe(true);
      const onBoard = onBoardCounts.get(order.itemTypeId) ?? 0;
      expect(order.requiredQty, `level ${levelIndex} order ${order.itemTypeId} requiredQty ${order.requiredQty} must not exceed on-board ${onBoard}`).toBeLessThanOrEqual(onBoard);
      // The band range is a ceiling on "reasonable ask" only when the board actually has that
      // many copies — when on-board supply is thin, requiredQty legitimately clamps below
      // minQty (see rules/deriveOrders.ts#pickRequiredQty's doc comment).
      if (onBoard >= minQty) {
        expect(order.requiredQty, `level ${levelIndex} order ${order.itemTypeId} requiredQty ${order.requiredQty} below band min ${minQty}`).toBeGreaterThanOrEqual(minQty);
      }
      expect(order.requiredQty, `level ${levelIndex} order ${order.itemTypeId} requiredQty ${order.requiredQty} above band max ${maxQty}`).toBeLessThanOrEqual(maxQty);
      expect(order.requiredQty % 3, 'requiredQty must be a multiple of MATCH_SIZE (3)').toBe(0);
    }
  });
});

describe('Order count progression — orderCountForLevel() replaces the old level-5 floor/per-band-range scheme', () => {
  it(`levels 2 through 40 (spanning every band and several relief transitions) never exceed MAX_ORDERS (${MAX_ORDERS})`, () => {
    for (let levelIndex = 2; levelIndex <= 40; levelIndex++) {
      const { puzzle, tier } = getLevel(levelIndex);
      expect(puzzle.orders.length, `level ${levelIndex} (${tier}) has ${puzzle.orders.length} Orders`).toBeLessThanOrEqual(MAX_ORDERS);
    }
  });

  it('levels 2 through 60 never fall below their level-range minimum, PROVIDED the board actually has enough distinct on-board types to support it', () => {
    // A known, disclosed content-availability limit (see build report): an Order needs a
    // distinct on-board type, so a level whose generator RNG happens to land on fewer distinct
    // types than its own level-range floor requires (TIER_CONFIG.easy.minTypes is 3 — unchanged/
    // out of scope this pass — vs. e.g. a floor of 4 from level 20 on) cannot reach that floor no
    // matter what deriveOrders does; that is a board-content ceiling, not a bug in
    // orderCountForLevel. Whenever the board DOES have enough distinct types, the floor must hold.
    for (let levelIndex = 2; levelIndex <= 60; levelIndex++) {
      const { puzzle, tier } = getLevel(levelIndex);
      const range = ORDER_COUNT_LEVEL_RANGES.find((r) => levelIndex >= r.minLevel && levelIndex <= r.maxLevel)!;
      const distinctOnBoardTypes = new Set(puzzle.tiles.map((t) => t.typeId)).size;
      if (distinctOnBoardTypes >= range.min) {
        expect(
          puzzle.orders.length,
          `level ${levelIndex} (${tier}) has ${puzzle.orders.length} Orders (range min ${range.min}) with ${distinctOnBoardTypes} distinct on-board types available — should have reached the floor`,
        ).toBeGreaterThanOrEqual(range.min);
      }
    }
  });

  it('boundary spot-checks: level-range minimum holds exactly at every table edge (4→5, 9→10, 14→15, 19→20, 24→25)', () => {
    // orderCountForLevel is pure over (levelIndex, band) — check both sides of each boundary
    // directly against the table, independent of which band a real level happens to land on.
    expect(orderCountForLevel(9, 'easy')).toBe(2); // still in [2,9] range, low end
    expect(orderCountForLevel(10, 'easy')).toBe(3); // [10,14] range floors at 3, even for Easy
    expect(orderCountForLevel(14, 'easy')).toBe(3);
    expect(orderCountForLevel(15, 'easy')).toBe(3); // [15,19] range also floors at 3
    expect(orderCountForLevel(19, 'easy')).toBe(3);
    expect(orderCountForLevel(20, 'easy')).toBe(4); // [20,24] range floors at 4
    expect(orderCountForLevel(24, 'easy')).toBe(4);
    expect(orderCountForLevel(25, 'easy')).toBe(4); // [25,+inf) range also floors at 4
  });

  it('worked examples from the build brief, corrected against the REAL Easy-relief levels (BAND_SEQUENCE puts Easy-relief at 9/12/21, not 8/12/22 as hypothesized — see build report)', () => {
    // Level 9: real Easy-relief level inside the [2,9] range (levels 2-9) -> low end -> 2.
    expect(bandForLevelInRelief(9)).toBe(true);
    expect(orderCountForLevel(9, 'easy')).toBe(2);

    // Level 12: real Easy-relief level inside the [3,4] range (levels 10-14) -> level min wins -> 3, not 2.
    expect(bandForLevelInRelief(12)).toBe(true);
    expect(orderCountForLevel(12, 'easy')).toBe(3);

    // Level 21: real Easy-relief level inside the [4,5] range (levels 20-24) -> level min wins -> 4.
    expect(bandForLevelInRelief(21)).toBe(true);
    expect(orderCountForLevel(21, 'easy')).toBe(4);
  });

  it('a relief level (Easy right after Hard/VeryHard) still respects its OWN level floor even though it reads "easier" than its predecessor', () => {
    // Level 27 (Easy-relief, immediately after Level 26 veryHard) sits in the [4,6] range (level
    // 25+) — its Order count must still be >= 4, never regressing to an earlier range's lower
    // floor just because the band "feels easier" than the VeryHard level right before it. (Level
    // 24 is also a real relief level in this vicinity, but its particular generated board landed
    // on only 3 distinct on-board types for this seed — below its own floor of 4 regardless of
    // band, a disclosed content-availability limit unrelated to relief behavior; see build
    // report. Level 27 isolates the relief-vs-floor behavior this test targets.)
    expect(bandForLevelInRelief(27)).toBe(true);
    const relief = getLevel(27);
    const predecessor = getLevel(26);
    expect(bandForLevel(26)).toBe('veryHard');
    expect(relief.puzzle.orders.length).toBeGreaterThanOrEqual(4);
    // "Easier" relative to its immediate predecessor is fine and expected; only the absolute
    // per-level floor is a hard requirement.
    expect(relief.puzzle.orders.length).toBeLessThanOrEqual(predecessor.puzzle.orders.length);
  });
});

describe('Object-type variety visibly increases across bands (TIER_CONFIG retune)', () => {
  it('average distinct on-board typeId count strictly increases easy < medium < hard < veryHard (averaged over levels 16-45, past ramp convergence)', () => {
    // TIER_CONFIG's minTypes/maxTypes ranges overlap slightly at the edges by design (easy 3-5,
    // medium 4-6, hard 5-7, veryHard 6-8 — matches the brief's ~4/~5/~6/~7-8 targets), so a
    // SINGLE level's distinct-type count can occasionally tie/invert across adjacent bands (RNG
    // variance) — average over many levels per band instead, the same approach
    // coverage.test.ts's own "tile counts climb monotonically with band on average" test uses.
    const order: Tier[] = ['easy', 'medium', 'hard', 'veryHard'];
    const sums = new Map<Tier, { total: number; n: number }>();
    for (const tier of order) sums.set(tier, { total: 0, n: 0 });
    for (let levelIndex = 16; levelIndex <= 45; levelIndex++) {
      const { puzzle, tier } = getLevel(levelIndex);
      const distinct = new Set(puzzle.tiles.map((t) => t.typeId)).size;
      const entry = sums.get(tier)!;
      entry.total += distinct;
      entry.n += 1;
    }
    const averages = order.map((tier) => {
      const { total, n } = sums.get(tier)!;
      expect(n, `no sampled levels landed on ${tier} in range`).toBeGreaterThan(0);
      return total / n;
    });
    for (let i = 1; i < averages.length; i++) {
      expect(averages[i], `${order[i]} (${averages[i].toFixed(2)} avg types) should have more distinct types than ${order[i - 1]} (${averages[i - 1].toFixed(2)} avg types)`).toBeGreaterThan(
        averages[i - 1],
      );
    }
  });

  it('every eligible on-board type has enough copies (>= MATCH_SIZE) to ever be pickable to completion', () => {
    for (const levelIndex of [4, 6, 8, 14, 28, 30, 32, 38]) {
      const { puzzle } = getLevel(levelIndex);
      const counts = new Map<string, number>();
      for (const tile of puzzle.tiles) counts.set(tile.typeId, (counts.get(tile.typeId) ?? 0) + 1);
      for (const [typeId, count] of counts) {
        expect(count, `level ${levelIndex} type ${typeId} has only ${count} on-board copies`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('Determinism — same level index twice produces identical tiles/orders (generate() ramp path included)', () => {
  it.each([4, 8, 14, 28, 38])('level %d: getLevel() called twice is byte-identical', (levelIndex) => {
    const a = getLevel(levelIndex);
    const b = getLevel(levelIndex);
    expect(a.puzzle).toEqual(b.puzzle);
    expect(a.tier).toBe(b.tier);
    expect(a.solution).toEqual(b.solution);
  });
});

describe('Game boots headlessly across FTUE + representative post-FTUE levels', () => {
  it.each([1, 2, 3, 4, 6, 8, 14, 28, 38])('createGameWorld() + loadLevel(%d) succeeds and produces a playable pile', (levelIndex) => {
    const db = createGameWorld();
    expect(() => loadLevel(db, levelIndex, 0)).not.toThrow();
    expect(db.resources.pile.tiles.length).toBeGreaterThan(0);
    expect(db.resources.pile.orders.length).toBeGreaterThan(0);
    expect(db.resources.pile.phase).toBe('playing');
  });

  it('FTUE_LEVEL_COUNT is 3 (sanity check the boot sweep above actually spans the FTUE/generated boundary)', () => {
    expect(FTUE_LEVEL_COUNT).toBe(3);
    expect(TIER_CONFIG.easy.cols).toBeGreaterThan(0); // touches TIER_CONFIG so this file fails loudly if the import ever breaks
  });
});
