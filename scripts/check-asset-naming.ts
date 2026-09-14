#!/usr/bin/env bun
/**
 * Asset pipeline checks. Exits 1 on any violation.
 *
 * 1. Naming — filenames in public/assets/ AND assets/src/ must follow the naming
 *    convention (docs/guides/naming-convention.md, naming-convention.schema.json).
 *    assets/src/_staging/ (raw downloads) and markdown docs are skipped.
 * 2. Size budget — game media over 200KB must NOT live in public/assets/; it belongs
 *    in assets/src/ and on the CDN (docs/recipes/asset-pipeline.md). Exempt: fonts/,
 *    vfx/, proxy/, cdn/, favicon*.
 * 3. No hardcoded CDN hosts — src/** must not contain media.<env>.wolf.games URLs.
 *    URLs resolve through CdnManifestProvider; no source file may know CDN hosts.
 *
 * Usage:
 *   bun run scripts/check-asset-naming.ts           # validate, exit 1 if invalid
 *   bun run scripts/check-asset-naming.ts --suggest # print suggested renames
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ASSETS_DIR = join(ROOT, "public", "assets");
const ASSETS_SRC_DIR = join(ROOT, "assets", "src");
const SRC_DIR = join(ROOT, "src");

// Raw asset pattern: {category}-{name}[_{variant}].{ext}
const RAW_REGEX =
  /^(piece|exit|character|bg|item|prop|ui|vfx|sfx|music)-([a-z0-9]+(?:_[a-z0-9]+)*)(_[a-z0-9]+)?\.([a-zA-Z0-9]+)$/;
const RAW_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "wav",
  "mp3",
  "webm",
  "ogg",
  "m4a",
  "woff",
  "woff2",
  "ttf",
  "otf",
]);

// Packed output patterns (basename only)
const PACKED_PATTERNS: RegExp[] = [
  /^atlas-[a-z0-9]+(-[a-z0-9]+)*\.json$/,
  /^atlas-[a-z0-9]+(-[a-z0-9]+)*\.(png|jpg|jpeg|webp|gif)$/,
  /^sfx-[a-z0-9]+(-[a-z0-9]+)*\.json$/,
  /^sfx-[a-z0-9]+(-[a-z0-9]+)*\.(mp3|webm|ogg|wav|m4a)$/,
  /^music-[a-z0-9]+(-[a-z0-9]+)*\.json$/,
  /^music-[a-z0-9]+(-[a-z0-9]+)*\.(mp3|webm|ogg|m4a)$/,
  /^vfx-[a-z0-9_-]+\.json$/,
];

// Subpath exceptions: under vfx/ allow simple-name files (e.g. effects/default.json, white-circle.png)
const VFX_SUBPATH_BASENAME = /^[a-z0-9_-]+\.(json|png|jpg|jpeg|webp|gif|svg)$/;
// Fonts in fonts/ subfolder (e.g. Baloo-Regular.woff2) - allow common font naming
const FONTS_BASENAME = /^[a-zA-Z0-9_-]+\.(woff2?|ttf|otf)$/;

// ---- Size budget (public/assets only) ----
// Heavy game media belongs on the CDN, not in the bundle. 200KB threshold.
const MAX_PUBLIC_MEDIA_BYTES = 200 * 1024;
// Exempt subtrees/files: bundled by design (fonts, core vfx, proxy/placeholder art, favicon).
// cdn/ is `wolf-dev assets hydrate` output — build input for a frozen bundle, never
// committed, and large on purpose.
const SIZE_EXEMPT_DIRS = ["fonts/", "vfx/", "proxy/", "cdn/"];
const SIZE_EXEMPT_BASENAME = /^favicon/i;
// "Game media" = images/audio/video. JSON (tuning/config) is not counted.
const MEDIA_EXTENSIONS =
  /\.(png|jpg|jpeg|webp|gif|avif|svg|mp3|wav|webm|ogg|m4a|aac|flac|mp4|mov)$/i;

// ---- Hardcoded CDN host scan (src/ only) ----
// media.wolf.games or media.<env>.wolf.games anywhere in src/** is a bug: URLs
// resolve through CdnManifestProvider + the shared AssetClient, so no source
// file may know a CDN host.
const CDN_HOST_RE = /media\.(?:[a-z0-9-]+\.)?wolf\.games/;
const TEXT_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|html|md)$/i;

function isPackedBasename(basename: string): boolean {
  return PACKED_PATTERNS.some((re) => re.test(basename));
}

function isRawBasename(basename: string): boolean {
  const m = basename.match(RAW_REGEX);
  if (!m) return false;
  const ext = m[4]!.toLowerCase();
  return RAW_EXTENSIONS.has(ext);
}

function suggestRawRename(basename: string): string {
  const lower = basename.toLowerCase();
  const lastDot = lower.lastIndexOf(".");
  const ext = lastDot >= 0 ? lower.slice(lastDot) : "";
  const namePart = lastDot >= 0 ? lower.slice(0, lastDot) : lower;
  // Replace spaces/special with underscore, collapse multiple underscores/hyphens
  const cleaned = namePart
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/-+/g, "-")
    .replace(/^_|_$/g, "");
  if (!/^[a-z]/.test(cleaned)) return `ui-${cleaned}${ext}`;
  if (!/-/.test(cleaned) && !/_/.test(cleaned)) return `ui-${cleaned}${ext}`;
  return cleaned + ext;
}

function collectFiles(
  dir: string,
  baseDir: string,
  skipDirs: Set<string> = new Set(),
): { relPath: string; basename: string; fullPath: string }[] {
  const out: { relPath: string; basename: string; fullPath: string }[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // skip .gitkeep, .git, etc.
    const full = join(dir, e.name);
    // Prefix checks below compare against forward-slash paths; relative() yields
    // native separators, so cdn/ fonts/ vfx/ proxy/ would not match on Windows.
    const rel = relative(baseDir, full).replaceAll("\\", "/");
    if (e.isDirectory()) {
      if (skipDirs.has(e.name)) continue;
      out.push(...collectFiles(full, baseDir, skipDirs));
    } else {
      out.push({ relPath: rel, basename: e.name, fullPath: full });
    }
  }
  return out;
}

interface NamingViolation {
  relPath: string;
  basename: string;
  suggested?: string;
}

/** Naming-convention validation for one assets root. */
function checkNaming(
  files: { relPath: string; basename: string }[],
  suggest: boolean,
  allowSubpathExceptions: boolean,
): NamingViolation[] {
  const invalid: NamingViolation[] = [];
  for (const { relPath, basename } of files) {
    if (basename.toLowerCase().endsWith(".md")) continue; // docs (e.g. assets/README.md)
    if (isPackedBasename(basename)) continue;
    if (isRawBasename(basename)) continue;
    if (allowSubpathExceptions) {
      // vfx subpath (e.g. vfx/effects/default.json)
      if (relPath.startsWith("vfx/") && VFX_SUBPATH_BASENAME.test(basename)) continue;
      // fonts subfolder
      if (relPath.startsWith("fonts/") && FONTS_BASENAME.test(basename)) continue;
      // proxy/ placeholder art ships from @wolfgames/components with its own
      // names (e.g. jungle-ytoonk.png, character.unmasked.png) — exempt from the
      // category convention, still subject to the size budget.
      if (relPath.startsWith("proxy/")) continue;
      // cdn/ holds hydrate output under content-hashed names, which cannot match
      // the category convention.
      if (relPath.startsWith("cdn/")) continue;
    }
    invalid.push({
      relPath,
      basename,
      suggested: suggest ? suggestRawRename(basename) : undefined,
    });
  }
  return invalid;
}

/** Files over the budget in public/assets/ that should live on the CDN instead. */
function checkPublicSizes(
  files: { relPath: string; basename: string; fullPath: string }[],
): { relPath: string; bytes: number }[] {
  const oversized: { relPath: string; bytes: number }[] = [];
  for (const { relPath, basename, fullPath } of files) {
    if (SIZE_EXEMPT_DIRS.some((d) => relPath.startsWith(d))) continue;
    if (SIZE_EXEMPT_BASENAME.test(basename)) continue;
    if (!MEDIA_EXTENSIONS.test(basename)) continue;
    const bytes = statSync(fullPath).size;
    if (bytes > MAX_PUBLIC_MEDIA_BYTES) oversized.push({ relPath, bytes });
  }
  return oversized;
}

/** Hardcoded media.<env>.wolf.games URLs anywhere in src/** except the manifest. */
function checkHardcodedCdnHosts(): { relPath: string; line: number; text: string }[] {
  const hits: { relPath: string; line: number; text: string }[] = [];
  const files = collectFiles(SRC_DIR, ROOT, new Set(["node_modules"]));
  for (const { relPath, basename, fullPath } of files) {
    if (!TEXT_FILE_RE.test(basename)) continue;
    const content = readFileSync(fullPath, "utf8");
    if (!CDN_HOST_RE.test(content)) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (CDN_HOST_RE.test(lines[i]!)) {
        hits.push({ relPath, line: i + 1, text: lines[i]!.trim() });
      }
    }
  }
  return hits;
}

function main(): void {
  const suggest = process.argv.includes("--suggest");
  if (!statSync(ASSETS_DIR, { throwIfNoEntry: false })?.isDirectory()) {
    console.error("Assets directory not found:", ASSETS_DIR);
    process.exit(1);
  }

  let failed = false;

  // ---- 1. Naming: public/assets/ + assets/src/ ----
  const publicFiles = collectFiles(ASSETS_DIR, ASSETS_DIR);
  const invalid = checkNaming(publicFiles, suggest, true).map((v) => ({
    ...v,
    relPath: `public/assets/${v.relPath}`,
  }));
  if (statSync(ASSETS_SRC_DIR, { throwIfNoEntry: false })?.isDirectory()) {
    const srcFiles = collectFiles(ASSETS_SRC_DIR, ASSETS_SRC_DIR, new Set(["_staging"]));
    invalid.push(
      ...checkNaming(srcFiles, suggest, false).map((v) => ({
        ...v,
        relPath: `assets/src/${v.relPath}`,
      })),
    );
  }

  if (invalid.length > 0) {
    failed = true;
    console.error("check:assets — Non-conforming filenames:\n");
    for (const { relPath, basename, suggested } of invalid) {
      console.error(`  ${relPath}`);
      if (suggested && suggested !== basename) console.error(`    → suggest: ${suggested}`);
    }
    console.error(
      "\nSee docs/guides/naming-convention.md and docs/recipes/manifest-contract.md.\n"
    );
  }

  // ---- 2. Size budget: heavy game media must not be bundled ----
  const oversized = checkPublicSizes(publicFiles);
  if (oversized.length > 0) {
    failed = true;
    console.error(
      `check:assets — Game media over ${MAX_PUBLIC_MEDIA_BYTES / 1024}KB in public/assets/ (belongs in assets/src/ + CDN):\n`
    );
    for (const { relPath, bytes } of oversized) {
      console.error(`  public/assets/${relPath}  (${Math.round(bytes / 1024)}KB)`);
    }
    console.error(
      "\nMove to assets/src/ and publish with `bun run assets:publish`.\n" +
        "Exempt: fonts/, vfx/, proxy/, cdn/, favicon*. See docs/recipes/asset-pipeline.md.\n"
    );
  }

  // ---- 3. No hardcoded CDN hosts in src/ ----
  const hardcoded = checkHardcodedCdnHosts();
  if (hardcoded.length > 0) {
    failed = true;
    console.error("check:assets — Hardcoded CDN hosts in src/ (route through the manifest cdnBase):\n");
    for (const { relPath, line, text } of hardcoded) {
      console.error(`  ${relPath}:${line}  ${text}`);
    }
    console.error(
      "\nURLs resolve through CdnManifestProvider — no source file may know CDN hosts.\n"
    );
  }

  if (!failed) {
    console.log("check:assets — All asset checks passed (naming, size budget, no hardcoded CDN hosts).");
    process.exit(0);
  }
  process.exit(1);
}

main();
