#!/usr/bin/env bun
// amino-rollback.ts — Revert the most recent amino sync commit
//
// Usage: bun scripts/amino-rollback.ts
//
// Safety: only acts if the latest commit matches the amino sync pattern.

import { execSync } from "node:child_process";

const SYNC_PATTERN = /^chore: sync amino to /;

function git(args: string): string {
  return execSync(`git ${args}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function run(): void {
  const message = git("log -1 --format=%s");

  if (!SYNC_PATTERN.test(message)) {
    console.error("[rollback] Latest commit is not an amino sync:");
    console.error(`[rollback]   "${message}"`);
    console.error("[rollback] Aborting — nothing to rollback.");
    process.exit(1);
  }

  const short = git("rev-parse --short HEAD");
  console.log(`[rollback] Reverting amino sync commit ${short}...`);

  execSync("git revert HEAD --no-edit", { stdio: "inherit" });

  console.log("[rollback] Amino sync reverted successfully.");
}

run();
