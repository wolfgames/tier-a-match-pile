#!/usr/bin/env bun
// amino-verify.ts — Run verification checks after an amino sync
//
// Usage: bun scripts/amino-verify.ts
//
// Runs typecheck, lint, and build sequentially. Exits non-zero on first failure.

import { execSync } from "node:child_process";

interface Step {
  name: string;
  command: string;
}

const STEPS: Step[] = [
  { name: "Typecheck", command: "bun run tsc --noEmit" },
  { name: "Lint", command: "bun run biome check ." },
  { name: "Build", command: "bun run build" },
];

function run(): void {
  console.log("[verify] Running post-sync verification...\n");

  for (const step of STEPS) {
    console.log(`[verify] ${step.name}...`);
    try {
      execSync(step.command, { cwd: process.cwd(), stdio: "inherit" });
      console.log(`[verify] ${step.name} ✓\n`);
    } catch {
      console.error(`\n[verify] ${step.name} FAILED.`);
      console.error("[verify] Fix the issue above, then re-run: bun run amino:verify");
      process.exit(1);
    }
  }

  console.log("[verify] All checks passed.");
}

run();
