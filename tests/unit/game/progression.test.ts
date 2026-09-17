/**
 * Match Pile — progression/difficulty spec.
 *
 * Per docs/GAME-DESIGN.md#progression-and-retention and
 * tier-a/REFERENCE_MATRIX.json (R-PROGRESSION-SEQUENTIAL, R-DIFFICULTY-BANDS,
 * R-DIFFICULTY-AXES, R-RELIEF-LEVEL). R-PROGRESSION-SEQUENTIAL is already
 * satisfied by the current implementation (no calendar seeding exists) — kept
 * here as a locked-in regression guard, not a red gap.
 *
 * R-DIFFICULTY-AXES correction (this pass): Timer budget and difficulty band are now two
 * fully separate axes. `TIER_CONFIG` carries density/Orders-relevant knobs only (no
 * time-budget field) — Timer budget comes from `ecs/timerConfig.ts#timerBudgetForLevel`, a
 * pure function of `levelIndex` alone. This fixes a real bug found in manual playtesting:
 * previously Timer budget was band-keyed, so a later level landing on an Easy/Medium relief
 * band got a BIGGER Timer budget again.
 */

import { describe, it, expect } from "vitest";
import { seedFor, getLevel } from "~/game/match-pile/services/levels";
import { TIER_CONFIG } from "~/game/match-pile/generator/objectTypes";
import { BAND_SEQUENCE, bandForLevel, FTUE_LEVEL_COUNT } from "~/game/match-pile/services/levelSequence";
import { TIMER_CURVE, timerBudgetForLevel } from "~/game/match-pile/ecs/timerConfig";

describe("Progression / difficulty (mixed red/green — see file header)", () => {
  it("R-PROGRESSION-SEQUENTIAL (already green — locked-in regression guard) — seedFor() is a pure function of level index only, no calendar/date input", () => {
    expect(seedFor.length).toBe(1); // single (levelIndex) parameter, no Date/clock parameter
    expect(seedFor(5)).toBe(seedFor(5)); // same index -> same seed, deterministically
    expect(seedFor(5)).not.toBe(seedFor(6));
  });

  it("R-DIFFICULTY-BANDS (already green) — difficulty bands include Easy, Medium, Hard, and Very Hard", () => {
    const bands = Object.keys(TIER_CONFIG);
    expect(bands).toEqual(expect.arrayContaining(["easy", "medium", "hard", "veryHard"]));
  });

  it("R-DIFFICULTY-AXES (corrected this pass) — TIER_CONFIG carries density knobs only, NEVER a time-budget field", () => {
    // Timer budget used to be band-keyed (a bug: relief bands got a bigger Timer budget
    // again). It is now driven purely by levelIndex via timerBudgetForLevel() — band config
    // must not carry a time axis at all, or the two axes could drift back together.
    for (const tier of Object.values(TIER_CONFIG)) {
      expect(tier, "tier config must not carry a timeBudgetMs field — Timer is levelIndex-driven now").not.toHaveProperty(
        "timeBudgetMs",
      );
    }
  });

  it("R-RELIEF-LEVEL (red) — a level-sequence helper enforces Easy-after-Hard/Very-Hard", async () => {
    const sequenceModule = await import("~/game/match-pile/services/levelSequence").catch(() => null);
    expect(sequenceModule, "services/levelSequence (or equivalent relief-level logic) does not exist yet").not.toBeNull();
  });
});

describe("bandForLevel() / getLevel() — the 4-band progression sequence (Phase 1 implementation)", () => {
  it("R-RELIEF-LEVEL — every hard/veryHard entry in BAND_SEQUENCE is immediately followed by easy, including the wrap-around", () => {
    for (let i = 0; i < BAND_SEQUENCE.length; i++) {
      const band = BAND_SEQUENCE[i];
      if (band === "hard" || band === "veryHard") {
        const next = BAND_SEQUENCE[(i + 1) % BAND_SEQUENCE.length];
        expect(next, `index ${i} (${band}) must be followed by easy`).toBe("easy");
      }
    }
  });

  it("level 4 (the first post-FTUE level) maps to BAND_SEQUENCE[0] = easy", () => {
    expect(bandForLevel(4)).toBe(BAND_SEQUENCE[0]);
    expect(bandForLevel(4)).toBe("easy");
  });

  it("an early post-FTUE level and a later one produce different effective tiers, Timer budgets, and Order-type-counts", () => {
    const early = getLevel(4);
    const later = getLevel(14); // per BAND_SEQUENCE, lands on veryHard
    expect(bandForLevel(14)).toBe("veryHard");

    expect(early.tier).toBe("easy");
    expect(later.tier).toBe("veryHard");
    expect(early.tier).not.toBe(later.tier);

    // Timer budget is levelIndex-driven, NOT tier-driven — compare by levelIndex, not by tier.
    expect(timerBudgetForLevel(4)).not.toBe(timerBudgetForLevel(14));
    expect(early.puzzle.orders.length).not.toBe(later.puzzle.orders.length);
  });

  it("since every post-FTUE level is now generator-backed, tile density genuinely scales with band for representative Easy/Medium/Hard/VeryHard levels", () => {
    // Levels 4/6/8/14 land on easy/medium/hard/veryHard respectively per BAND_SEQUENCE.
    const easyLevel = getLevel(4);
    const mediumLevel = getLevel(6);
    const hardLevel = getLevel(8);
    const veryHardLevel = getLevel(14);
    expect(bandForLevel(4)).toBe("easy");
    expect(bandForLevel(6)).toBe("medium");
    expect(bandForLevel(8)).toBe("hard");
    expect(bandForLevel(14)).toBe("veryHard");

    // TIER_CONFIG ranges are non-overlapping band-to-band (easy 9-24, medium 27-54,
    // hard 57-90, veryHard 90-120), so tile counts should climb monotonically with band.
    expect(easyLevel.puzzle.tiles.length).toBeLessThan(mediumLevel.puzzle.tiles.length);
    // TILE-COUNT-FLOOR pass (tier-a-build-v4, Orders-count-curve pass): levels 6 and 8 both fall
    // in the SAME band-independent tile-count floor window (levels 5-9 -> floor 65, rounded up to
    // 66 — see generator/coverageCurve.ts#tileCountFloorForLevel) this early in the coverage ramp,
    // where medium's and hard's own ramp-calibrated counts are both still below that shared
    // floor — so they can legitimately TIE at 66 here (disclosed, by design: the floor is
    // band-independent on purpose). `<=` (not `<`) reflects that; strict separation resumes once
    // ramp-calibrated counts overtake the shared floor (see coverage.test.ts's converged-level
    // checks further out).
    expect(mediumLevel.puzzle.tiles.length).toBeLessThanOrEqual(hardLevel.puzzle.tiles.length);
    expect(hardLevel.puzzle.tiles.length).toBeLessThanOrEqual(veryHardLevel.puzzle.tiles.length);
  });

  it("getLevel() is deterministic — same level index twice produces identical output (band, budget, puzzle)", () => {
    const a = getLevel(38);
    const b = getLevel(38);
    expect(a.tier).toBe(b.tier);
    expect(a.puzzle).toEqual(b.puzzle);
    expect(a.solution).toEqual(b.solution);
  });
});

describe("timerBudgetForLevel() — Timer is a monotonic-by-levelIndex curve, fully decoupled from band", () => {
  it("is monotonic non-increasing across levels 4 through 40", () => {
    for (let levelIndex = 4; levelIndex < 40; levelIndex++) {
      expect(timerBudgetForLevel(levelIndex + 1)).toBeLessThanOrEqual(timerBudgetForLevel(levelIndex));
    }
  });

  it("does NOT increase across a real relief-band transition (hard at BAND_SEQUENCE[4] -> easy at BAND_SEQUENCE[5])", () => {
    // BAND_SEQUENCE[4] === "hard" and BAND_SEQUENCE[5] === "easy" (relief rule). With
    // FTUE_LEVEL_COUNT === 3, offset 4 -> levelIndex 8 (hard), offset 5 -> levelIndex 9 (easy).
    const hardLevelIndex = FTUE_LEVEL_COUNT + 1 + 4;
    const reliefLevelIndex = FTUE_LEVEL_COUNT + 1 + 5;
    expect(bandForLevel(hardLevelIndex)).toBe("hard");
    expect(bandForLevel(reliefLevelIndex)).toBe("easy");

    // Because timerBudgetForLevel ignores band entirely, the relief level's budget is
    // whatever the curve says for its levelIndex — never a jump back up.
    expect(timerBudgetForLevel(reliefLevelIndex)).toBeLessThanOrEqual(timerBudgetForLevel(hardLevelIndex));
  });

  it("levels 1-3 (FTUE) all return TIMER_CURVE.ftueBudgetMs (300,000ms)", () => {
    for (let levelIndex = 1; levelIndex <= FTUE_LEVEL_COUNT; levelIndex++) {
      expect(timerBudgetForLevel(levelIndex)).toBe(TIMER_CURVE.ftueBudgetMs);
      expect(timerBudgetForLevel(levelIndex)).toBe(300_000);
    }
  });

  it("never drops below the configured floor", () => {
    for (let levelIndex = 4; levelIndex <= 500; levelIndex += 7) {
      expect(timerBudgetForLevel(levelIndex)).toBeGreaterThanOrEqual(TIMER_CURVE.floorMs);
    }
  });
});
