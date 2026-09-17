#!/usr/bin/env bun
/**
 * Content pipeline step 3/3: bucket validated/deduped/rated candidates into
 * a final 30-level pack (>=10 easy / >=12 medium / >=8 hard) and write the
 * shipped data files.
 *
 * Run: `bun run content/scripts/build-pack.ts`
 *
 * Bucketing: a level's shipped `tier` MUST equal the tier `generate()` was
 * actually called with for that seed — tests/unit/game/solvability.test.ts
 * (D3, the fixed content-oracle harness, copied in verbatim by a later
 * build phase) regenerates the first 10 shipped levels via
 * `generate({seed, tier: level.tier})` and asserts the result deep-equals
 * the stored puzzle. Since `tier` controls grid size and the type pool
 * inside `generate()`, relabeling a level into a different tier than it was
 * generated with (e.g. by a global difficulty-score band) makes it
 * impossible to regenerate — a real bug an earlier pass here shipped.
 *
 * So selection happens WITHIN each tier's own candidate pool: from the
 * ~1/3 of survivors that were generated with `tier:'easy'`, pick the 10 best
 * by `rate()`'s difficultyScore (spread evenly across that pool's own score
 * range, not just its easiest edge); same for medium (12) and hard (8).
 * `rate()` still drives which candidates are chosen and their in-tier
 * ordering — it just never reassigns a puzzle to a tier it wasn't generated
 * with. The final 30 are assembled as three BLOCKS in tier order (all easy,
 * then all medium, then all hard, each block sorted ascending by score) —
 * D1's "difficulty never inverts by more than one tier per adjacent pair"
 * is satisfied trivially by construction, since there are no cross-tier
 * jumps except the two block boundaries.
 *
 * Writes:
 *  - src/game/match-pile/data/levels-match-pile.json
 *  - src/game/match-pile/data/ftueLevels.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Tier } from "../../src/game/match-pile/rules";
import { buildFtueLevels } from "../library/selectFtue";
import type { LevelRecord } from "../library/types";
import type { ValidationReport, ValidatedCandidate } from "./validate";

const REPORT_PATH = resolve(import.meta.dir, "../reports/validation.json");
const LEVELS_JSON_PATH = resolve(
  import.meta.dir,
  "../../src/game/match-pile/data/levels-match-pile.json"
);
const FTUE_TS_PATH = resolve(import.meta.dir, "../../src/game/match-pile/data/ftueLevels.ts");
const FTUE_JSON_PATH = resolve(import.meta.dir, "../../src/game/match-pile/data/ftueLevels.json");

const BUCKET_SIZES: ReadonlyArray<{ tier: Tier; count: number }> = [
  { tier: "easy", count: 10 },
  { tier: "medium", count: 12 },
  { tier: "hard", count: 8 },
];
const TOTAL_LEVELS = BUCKET_SIZES.reduce((sum, b) => sum + b.count, 0);

export interface BuildPackResult {
  readonly levels: LevelRecord[];
  readonly tierHistogram: Record<Tier, number>;
}

/**
 * Picks `count` items from `list` spread evenly across its full index
 * range (not just the front) — so a tier's selection represents that
 * band's actual spread rather than clustering at its easiest edge.
 */
function pickEvenlySpaced<T>(list: readonly T[], count: number): T[] {
  if (count >= list.length) return [...list];
  if (count <= 0) return [];

  const indices = new Set<number>();
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i * (list.length - 1)) / Math.max(count - 1, 1));
    indices.add(idx);
  }
  // Floor-rounding can collide on small bands; backfill any gap from the
  // nearest unused index so the result always has exactly `count` items.
  let filler = 0;
  while (indices.size < count && filler < list.length) {
    indices.add(filler);
    filler += 1;
  }

  return Array.from(indices)
    .sort((a, b) => a - b)
    .map((idx) => list[idx]);
}

export function buildPack(survivors: readonly ValidatedCandidate[]): BuildPackResult {
  if (survivors.length < TOTAL_LEVELS) {
    throw new Error(
      `build-pack: need at least ${TOTAL_LEVELS} validated survivors, got ${survivors.length}`
    );
  }

  const levels: LevelRecord[] = [];
  const tierHistogram: Record<Tier, number> = { easy: 0, medium: 0, hard: 0 };

  for (const bucket of BUCKET_SIZES) {
    // Only candidates actually generated with THIS tier are eligible — a
    // level's shipped tier must match what generate() was called with, so
    // D3's seed-regeneration check (generate({seed, tier: level.tier}))
    // reproduces the exact stored puzzle.
    const pool = survivors
      .filter((candidate) => candidate.tier === bucket.tier)
      .sort((a, b) => a.difficultyScore - b.difficultyScore);

    if (pool.length < bucket.count) {
      throw new Error(
        `build-pack: need at least ${bucket.count} validated '${bucket.tier}' survivors, got ${pool.length}`
      );
    }

    // Pick the required count spread evenly across this tier's own score
    // range (not just its easiest candidates), preserving ascending order.
    const picked = pickEvenlySpaced(pool, bucket.count);

    picked.forEach((candidate, index) => {
      levels.push({
        id: `match-pile-${bucket.tier}-${String(index + 1).padStart(2, "0")}`,
        seed: candidate.seed,
        puzzle: candidate.puzzle,
        solution: candidate.solution,
        tier: candidate.tier,
        difficultyScore: candidate.difficultyScore,
        canonicalKey: candidate.canonicalKey,
        provenance: "generated",
      });
    });

    tierHistogram[bucket.tier] = picked.length;
  }

  return { levels, tierHistogram };
}

/**
 * The data lives in ftueLevels.json (a plain array, no line-count concerns); this loader is a
 * fixed, short shim so the architecture gate's 150-line file limit never depends on pack size.
 */
const FTUE_TS_SOURCE = `// what_in: nothing.
// what_out: \`FTUE_LEVELS\`, typed — the data itself lives in the sibling \`ftueLevels.json\`
//           (GENERATED FILE — do not hand-edit; produced by content/scripts/build-pack.ts from
//           content/library/selectFtue.ts#buildFtueLevels()) so this loader stays well under
//           the 150-line architecture gate regardless of pack size.
import ftueLevelsData from './ftueLevels.json';
import type { PileState, Tier } from '../rules';

export interface FtueLevel {
  readonly id: string;
  readonly seed: number;
  readonly puzzle: PileState;
  readonly solution: readonly string[];
  readonly tier: Tier;
  readonly difficultyScore: number;
  readonly canonicalKey: string;
  readonly provenance: 'generated' | 'handcrafted';
  readonly prescribedInput: readonly string[];
}

export const FTUE_LEVELS: FtueLevel[] = ftueLevelsData as FtueLevel[];
`;

function run(): void {
  const report: ValidationReport = JSON.parse(readFileSync(REPORT_PATH, "utf-8"));
  const { levels, tierHistogram } = buildPack(report.survivors);

  const levelsPackage = {
    schemaId: "match-pile.v1",
    version: 1,
    levels,
  };

  mkdirSync(resolve(import.meta.dir, "../../src/game/match-pile/data"), { recursive: true });
  writeFileSync(LEVELS_JSON_PATH, JSON.stringify(levelsPackage, null, 2), "utf-8");

  const ftueLevels = buildFtueLevels();
  writeFileSync(FTUE_JSON_PATH, JSON.stringify(ftueLevels, null, 2) + "\n", "utf-8");
  writeFileSync(FTUE_TS_PATH, FTUE_TS_SOURCE, "utf-8");

  console.log(
    `build-pack: wrote ${levels.length} levels (easy=${tierHistogram.easy} medium=${tierHistogram.medium} hard=${tierHistogram.hard}) -> ${LEVELS_JSON_PATH}`
  );
  console.log(`build-pack: wrote ${ftueLevels.length} FTUE levels -> ${FTUE_TS_PATH}`);
}

run();
