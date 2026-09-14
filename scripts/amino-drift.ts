#!/usr/bin/env bun
// amino-drift.ts — Detect local modifications to amino-owned paths
//
// Usage: bun scripts/amino-drift.ts
//
// Compares amino-owned paths in the current repo against amino/main.
// Reports any files that differ. Exits non-zero if drift is found.

import { execSync } from "node:child_process";

const AMINO_PATHS = [
  "src/core/",
  "src/modules/",
  "vite.config.ts",
  "tsconfig.json",
  "vitest.config.ts",
  "biome.json",
  ".gitattributes",
];

function git(args: string): string {
  return execSync(`git ${args}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function run(): void {
  const remote = process.env.AMINO_REMOTE || "amino";
  const branch = process.env.AMINO_BRANCH || "main";
  const ref = `${remote}/${branch}`;

  // Ensure remote exists
  try {
    git(`remote get-url ${remote}`);
  } catch {
    console.error(`[drift] Amino remote "${remote}" not found.`);
    console.error("[drift] Run 'bun run amino:sync' first, or add it manually:");
    console.error(`[drift]   git remote add ${remote} git@github.com:wolfgames/template-amino.git`);
    process.exit(1);
  }

  console.log(`[drift] Fetching ${ref}...`);
  execSync(`git fetch ${remote}`, { stdio: ["pipe", "pipe", "pipe"] });

  console.log("[drift] Comparing amino-owned paths against upstream...\n");

  const drifted: string[] = [];

  for (const syncPath of AMINO_PATHS) {
    try {
      const diff = git(`diff ${ref} -- ${syncPath}`);
      if (diff) {
        // Get list of changed files for this path
        const files = git(`diff --name-only ${ref} -- ${syncPath}`);
        for (const file of files.split("\n").filter(Boolean)) {
          drifted.push(file);
          console.log(`[drift]   modified: ${file}`);
        }
      }
    } catch {
      // Path may not exist in amino — skip
    }
  }

  console.log("");

  if (drifted.length === 0) {
    console.log("[drift] No drift detected. Amino-owned paths match upstream.");
  } else {
    console.log(`[drift] ${drifted.length} file(s) differ from upstream.`);
    console.log("[drift] Run 'bun run amino:sync' to overwrite with upstream versions,");
    console.log("[drift] or review the diffs with: git diff amino/main -- <path>");
    process.exit(1);
  }
}

run();
