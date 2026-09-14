#!/usr/bin/env bun
// amino-release.ts — Bump amino version and create a git tag
//
// Usage: bun scripts/amino-release.ts <major|minor|patch>

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type BumpType = "major" | "minor" | "patch";

export function validateBumpType(input: string): BumpType | null {
  if (input === "major" || input === "minor" || input === "patch") return input;
  return null;
}

export function bumpVersion(current: string, type: BumpType): string {
  const [major, minor, patch] = current.split(".").map(Number);
  const bumped = {
    major: [major + 1, 0, 0],
    minor: [major, minor + 1, 0],
    patch: [major, minor, patch + 1],
  }[type];
  return bumped.join(".");
}

export function assertCleanWorkingTree(cwd: string): void {
  try {
    execSync("git diff --quiet", { cwd, stdio: "pipe" });
    execSync("git diff --cached --quiet", { cwd, stdio: "pipe" });
  } catch {
    throw new Error("Working tree has uncommitted changes. Commit or stash first.");
  }
}

export function bumpAminoVersion(type: BumpType, root: string): string {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const current = pkg.amino?.version || "0.0.0";
  const newVersion = bumpVersion(current, type);
  pkg.amino = pkg.amino || {};
  pkg.amino.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  return newVersion;
}

export function generateChangelog(version: string, cwd: string): void {
  const changelogPath = path.join(cwd, "CHANGELOG.md");
  const date = new Date().toISOString().slice(0, 10);

  // Find previous amino tag
  let prevTag = "";
  try {
    prevTag = execSync('git describe --tags --abbrev=0 --match "amino-v*" HEAD', {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    // No previous tag — include all commits
  }

  const range = prevTag ? `${prevTag}..HEAD` : "HEAD";
  let log = "";
  try {
    log = execSync(`git log ${range} --pretty=format:"- %s (%h)" --no-merges`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    log = "- Initial release";
  }

  const entry = `## ${version} (${date})\n\n${log}\n`;
  const existing = existsSync(changelogPath) ? readFileSync(changelogPath, "utf-8") : "";
  const header = existing.startsWith("# Changelog") ? "" : "# Changelog\n\n";
  const content = existing
    ? existing.replace(/^(# Changelog\n\n)/, `$1${entry}\n`)
    : `${header}${entry}\n`;

  writeFileSync(changelogPath, content);
  console.log(`[release] Updated CHANGELOG.md`);
}

export function commitAndTag(version: string, cwd: string): void {
  execSync("git add package.json CHANGELOG.md", { cwd, stdio: "pipe" });
  execSync(`git commit -m "chore: release amino v${version}"`, { cwd, stdio: "pipe" });
  const tagName = `amino-v${version}`;
  execSync(`git tag -a "${tagName}" -m "Amino release v${version}"`, { cwd, stdio: "pipe" });
}

if (import.meta.main) {
  const bumpInput = process.argv[2] || "";
  const bumpType = validateBumpType(bumpInput);

  if (!bumpType) {
    console.error("[release] Usage: amino-release.ts <major|minor|patch>");
    process.exit(1);
  }

  const root = process.cwd();

  assertCleanWorkingTree(root);

  const newVersion = bumpAminoVersion(bumpType, root);
  const tagName = `amino-v${newVersion}`;

  console.log(`[release] Bumped amino version to ${newVersion} (${bumpType})`);

  generateChangelog(newVersion, root);
  commitAndTag(newVersion, root);

  console.log(`[release] Created tag: ${tagName}`);

  if (bumpType === "major") {
    console.log("");
    console.log("[release] WARNING: MAJOR VERSION BUMP — downstream games need a full merge (not selective checkout).");
    console.log("[release]    Games should run: git fetch amino && git merge amino/main");
    console.log("");
  }

  console.log("[release] Next steps:");
  console.log(`[release]   1. Push the commit: git push`);
  console.log(`[release]   2. Push the tag:    git push origin ${tagName}`);
  console.log("[release]   (A GitHub Release will be created automatically when the tag is pushed.)");
}
