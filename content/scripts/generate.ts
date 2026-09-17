#!/usr/bin/env bun
/**
 * Content pipeline step 1/3: generate raw candidates across all 3 tiers.
 *
 * Run: `bun run content/scripts/generate.ts`
 *
 * Writes content/seeds/match-pile.json — an array of
 * { seed, tier, puzzle, solution } candidates for the validate step to
 * consume. Seeds 0..199, tier = ['easy','medium','hard'][seed % 3].
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generate } from "../../src/game/match-pile/generator";
import type { Tier } from "../../src/game/match-pile/rules";
import type { SeedCandidate } from "../library/types";

const SEED_COUNT = 200;
const TIERS: readonly Tier[] = ["easy", "medium", "hard"];
const OUTPUT_PATH = resolve(import.meta.dir, "../seeds/match-pile.json");

function run(): void {
  const candidates: SeedCandidate[] = [];
  let failures = 0;

  for (let seed = 0; seed < SEED_COUNT; seed++) {
    const tier = TIERS[seed % TIERS.length];
    const generated = generate({ seed, tier });
    if (!generated) {
      failures += 1;
      continue;
    }
    candidates.push({
      seed,
      tier,
      puzzle: generated.puzzle,
      solution: generated.solution,
    });
  }

  mkdirSync(resolve(import.meta.dir, "../seeds"), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(candidates, null, 2), "utf-8");

  console.log(
    `generate: wrote ${candidates.length} candidates (${failures} generator failures) to ${OUTPUT_PATH}`
  );
}

run();
