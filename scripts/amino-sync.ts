#!/usr/bin/env bun
// amino-sync.ts — Pull amino template updates into a game repo (selective checkout)
//
// Usage: bun scripts/amino-sync.ts
//
// This performs a ROUTINE sync: overwrites src/core/ and src/modules/ with the
// latest amino versions. Game-owned files (src/game/, src/app.tsx, index.html)
// are never touched.
//
// For MAJOR version updates (breaking changes), use a full merge instead:
//   git fetch amino && git merge amino/main

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface SyncConfig {
  remote: string;
  url: string;
  branch: string;
  cwd: string;
}

const SYNC_PATHS = [
  "src/core/",
  "src/modules/",
  "vite.config.ts",
  "tsconfig.json",
  "vitest.config.ts",
  "biome.json",
  ".gitattributes",
];

function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

export function assertInGitRepo(cwd: string): void {
  try {
    git("rev-parse --is-inside-work-tree", cwd);
  } catch {
    throw new Error("Not inside a git repository.");
  }
}

export function assertCleanWorkingTree(cwd: string): void {
  try {
    execSync("git diff --quiet", { cwd, stdio: "pipe" });
    execSync("git diff --cached --quiet", { cwd, stdio: "pipe" });
  } catch {
    throw new Error("Working tree has uncommitted changes. Commit or stash first.");
  }
}

export function ensureAminoRemote(remote: string, url: string, cwd: string): boolean {
  try {
    git(`remote get-url ${remote}`, cwd);
    return false; // already existed
  } catch {
    console.log(`[sync] Adding amino remote: ${url}`);
    git(`remote add ${remote} ${url}`, cwd);
    return true; // newly added
  }
}

export function fetchAmino(remote: string, branch: string, cwd: string): string {
  console.log(`[sync] Fetching latest amino from ${remote}/${branch}...`);
  git(`fetch ${remote}`, cwd);
  const commit = git(`rev-parse ${remote}/${branch}`, cwd);
  const short = git(`rev-parse --short ${remote}/${branch}`, cwd);
  console.log(`[sync] Amino HEAD: ${short}`);
  return commit;
}

export function checkoutAminoPaths(
  paths: string[],
  remote: string,
  branch: string,
  cwd: string,
): Array<{ path: string; skipped: boolean }> {
  console.log("[sync] Syncing amino-owned paths...");
  const results: Array<{ path: string; skipped: boolean }> = [];
  for (const syncPath of paths) {
    try {
      git(`ls-tree -r ${remote}/${branch} -- ${syncPath}`, cwd);
      git(`checkout ${remote}/${branch} -- ${syncPath}`, cwd);
      console.log(`[sync]   + ${syncPath}`);
      results.push({ path: syncPath, skipped: false });
    } catch {
      console.log(`[sync]   skip ${syncPath} (not found in amino)`);
      results.push({ path: syncPath, skipped: true });
    }
  }
  return results;
}

export function applyAminoSyncMeta(
  gamePkgJson: string,
  aminoPkgJson: string,
  syncedAt: string,
  syncedFrom: string,
): string {
  const pkg = JSON.parse(gamePkgJson);
  const aminoPkg = JSON.parse(aminoPkgJson);
  pkg.amino = pkg.amino || {};
  pkg.amino.version = aminoPkg.amino?.version || pkg.amino.version || "0.0.0";
  pkg.amino.syncedAt = syncedAt;
  pkg.amino.syncedFrom = syncedFrom;
  return JSON.stringify(pkg, null, 2) + "\n";
}

export function updateSyncMetadata(remote: string, branch: string, commit: string, cwd: string): string {
  console.log("[sync] Updating amino sync metadata in package.json...");
  const syncDate = new Date().toISOString().slice(0, 10);
  const gamePkgPath = path.join(cwd, "package.json");
  const gamePkgJson = readFileSync(gamePkgPath, "utf-8");
  const aminoPkgJson = git(`show ${remote}/${branch}:package.json`, cwd);
  const updated = applyAminoSyncMeta(gamePkgJson, aminoPkgJson, syncDate, commit);
  writeFileSync(gamePkgPath, updated);
  const version = JSON.parse(updated).amino.version;
  return version;
}

export function commitSync(shortHash: string, version: string, cwd: string): boolean {
  execSync("git add -A", { cwd, stdio: "pipe" });
  try {
    execSync("git diff --cached --quiet", { cwd, stdio: "pipe" });
    console.log("[sync] Already up to date — no changes from amino.");
    return false;
  } catch {
    // There are staged changes — commit them
    execSync(`git commit -m "chore: sync amino to ${shortHash} (v${version})"`, {
      cwd,
      stdio: "pipe",
    });
    console.log(`[sync] Committed amino sync to ${shortHash} (v${version})`);
    return true;
  }
}

if (import.meta.main) {
  const cwd = process.cwd();
  const config: SyncConfig = {
    remote: process.env.AMINO_REMOTE || "amino",
    url: process.env.AMINO_URL || "git@github.com:wolfgames/template-amino.git",
    branch: process.env.AMINO_BRANCH || "main",
    cwd,
  };

  assertInGitRepo(config.cwd);
  assertCleanWorkingTree(config.cwd);
  ensureAminoRemote(config.remote, config.url, config.cwd);

  const commit = fetchAmino(config.remote, config.branch, config.cwd);
  const shortHash = git(`rev-parse --short ${config.remote}/${config.branch}`, config.cwd);

  checkoutAminoPaths(SYNC_PATHS, config.remote, config.branch, config.cwd);
  const version = updateSyncMetadata(config.remote, config.branch, commit, config.cwd);
  commitSync(shortHash, version, config.cwd);

  console.log(`[sync] Done! Amino synced to ${shortHash}`);
  console.log("[sync] Run 'bun run amino:verify' to check for breakage.");
}
