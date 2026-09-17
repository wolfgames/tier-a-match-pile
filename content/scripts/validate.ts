#!/usr/bin/env bun
/**
 * Content pipeline step 2/3: validate, rate, and dedupe raw candidates.
 *
 * Run: `bun run content/scripts/validate.ts`
 *
 * Reads content/seeds/match-pile.json, runs validateLevel() on each, rates
 * survivors with rate(), dedupes via canonicalKey(), and writes the funnel
 * + surviving candidates to content/reports/validation.json.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { rate } from "../../src/game/match-pile/rules";
import { validateLevel } from "../library/validate";
import { canonicalKey } from "../library/dedupe";
import type { SeedCandidate } from "../library/types";

const INPUT_PATH = resolve(import.meta.dir, "../seeds/match-pile.json");
const OUTPUT_PATH = resolve(import.meta.dir, "../reports/validation.json");

export interface ValidatedCandidate extends SeedCandidate {
  readonly difficultyScore: number;
  readonly canonicalKey: string;
}

export interface ValidationReport {
  readonly funnel: {
    readonly generated: number;
    readonly valid: number;
    readonly deduped: number;
  };
  readonly rejections: ReadonlyArray<{ seed: number; tier: string; reason: string }>;
  readonly survivors: ValidatedCandidate[];
}

export function runValidation(candidates: readonly SeedCandidate[]): ValidationReport {
  const rejections: Array<{ seed: number; tier: string; reason: string }> = [];
  const valid: ValidatedCandidate[] = [];

  for (const candidate of candidates) {
    const result = validateLevel(candidate.puzzle);
    if (!result.ok) {
      rejections.push({ seed: candidate.seed, tier: candidate.tier, reason: result.reason ?? "unknown" });
      continue;
    }
    valid.push({
      ...candidate,
      difficultyScore: rate(candidate.puzzle),
      canonicalKey: canonicalKey(candidate.puzzle),
    });
  }

  const seenKeys = new Set<string>();
  const deduped: ValidatedCandidate[] = [];
  for (const candidate of valid) {
    if (seenKeys.has(candidate.canonicalKey)) continue;
    seenKeys.add(candidate.canonicalKey);
    deduped.push(candidate);
  }

  return {
    funnel: {
      generated: candidates.length,
      valid: valid.length,
      deduped: deduped.length,
    },
    rejections,
    survivors: deduped,
  };
}

function run(): void {
  const raw = readFileSync(INPUT_PATH, "utf-8");
  const candidates: SeedCandidate[] = JSON.parse(raw);

  const report = runValidation(candidates);

  mkdirSync(resolve(import.meta.dir, "../reports"), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(
    `validate: generated=${report.funnel.generated} valid=${report.funnel.valid} deduped=${report.funnel.deduped} -> ${OUTPUT_PATH}`
  );
}

run();
