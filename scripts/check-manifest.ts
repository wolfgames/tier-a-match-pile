#!/usr/bin/env bun
/**
 * Validates the game asset manifest against both:
 *  1. Shared rules from @wolfgames/components (duplicate names, alias collisions,
 *     kind/prefix consistency, asset path structure)
 *  2. Scaffold-specific rules (local extensions, reserved prefixes, path format)
 *
 * See docs/recipes/manifest-contract.md.
 *
 * Usage:
 *   bun run scripts/check-manifest.ts           # validate manifest from game config
 *   bun run scripts/check-manifest.ts --strict   # enforce strict bundle name regex
 *   bun run scripts/check-manifest.ts --path=manifest.json  # validate a JSON file
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STRICT = process.argv.includes("--strict");

// Scaffold-specific prefix list (mirrors GC KIND_TO_PREFIX)
const SCAFFOLD_PREFIXES = [
  "boot-",
  "theme-",
  "audio-",
  "data-",
  "core-",
  "scene-",
  "fx-",
];

const BUNDLE_NAME_RE = /^[a-z][a-z0-9-]*$/;

const ALLOWED_EXTENSIONS =
  /\.(json|png|jpg|jpeg|webp|gif|svg|woff|woff2|ttf|otf|webm|mp3|ogg|wav)$/i;

function isInvalidPath(p: unknown): string | null {
  if (typeof p !== "string") return "must be a string";
  if (p.startsWith("/")) return "must not have leading slash";
  if (p.includes("..")) return "must not contain ..";
  if (/^https?:\/\//i.test(p)) return "must not be absolute URL";
  if (p.trim() !== p) return "must not have leading/trailing space";
  if (p.length === 0) return "must not be empty";
  return null;
}

interface AssetDef {
  alias: string;
  src: string;
}

interface RawManifest {
  cdnBase: string;
  localBase?: string;
  bundles: {
    name: string;
    assets: AssetDef[];
    kind?: string;
  }[];
}

async function loadManifest(): Promise<RawManifest> {
  const pathArg = process.argv.find((a) => a.startsWith("--path="));
  if (pathArg) {
    const path = resolve(pathArg.slice("--path=".length));
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as RawManifest;
  }
  const { manifest } = await import("../src/game/asset-manifest.ts");
  return manifest as RawManifest;
}

async function main(): Promise<void> {
  const manifest = await loadManifest();
  const errors: string[] = [];

  // ---- Shared validation (game-components) ----
  // Import dynamically so the script works even if GC isn't installed
  // (falls back to scaffold-only checks below).
  let gcValidationRan = false;
  try {
    const { validateManifest } = await import("@wolfgames/components/core");
    if (typeof validateManifest === "function") {
      const result = validateManifest(manifest);
      if (!result.valid) {
        for (const e of result.errors) {
          errors.push(`[gc] ${e.path}: ${e.message}`);
        }
      }
      gcValidationRan = true;
    }
  } catch {
    // @wolfgames/components not available — fall through to scaffold checks
  }

  // ---- Scaffold-specific checks ----
  if (!manifest.cdnBase || typeof manifest.cdnBase !== "string") {
    errors.push("manifest.cdnBase is required and must be a string");
  }
  if (!Array.isArray(manifest.bundles)) {
    errors.push("manifest.bundles must be an array");
  }

  const seenNames = new Set<string>();
  const bundles = manifest.bundles ?? [];

  for (let i = 0; i < bundles.length; i++) {
    const b = bundles[i];
    const prefix = `manifest.bundles[${i}]`;

    if (!b || typeof b !== "object") {
      errors.push(`${prefix}: must be an object with name and assets`);
      continue;
    }
    if (!b.name || typeof b.name !== "string") {
      errors.push(`${prefix}.name: required string`);
    } else {
      // Duplicate check (also done by GC, but needed if GC is absent)
      if (!gcValidationRan && seenNames.has(b.name)) {
        errors.push(`${prefix}.name: duplicate bundle name "${b.name}"`);
      }
      seenNames.add(b.name);

      if (STRICT && !BUNDLE_NAME_RE.test(b.name)) {
        errors.push(
          `${prefix}.name: must match ^[a-z][a-z0-9-]*$ (strict mode), got "${b.name}"`,
        );
      } else if (!STRICT && !/^[a-z][a-z0-9-]*$/i.test(b.name)) {
        errors.push(
          `${prefix}.name: should be lowercase with hyphens (e.g. theme-branding), got "${b.name}"`,
        );
      }

      // Scaffold prefix recommendation
      const hasReserved = SCAFFOLD_PREFIXES.some((p) => b.name.startsWith(p));
      if (!hasReserved && !b.kind) {
        errors.push(
          `${prefix}.name: must use a reserved prefix (${SCAFFOLD_PREFIXES.join(", ")}) or set "kind"`,
        );
      }
    }

    if (!Array.isArray(b.assets)) {
      errors.push(`${prefix}.assets: must be an array of { alias, src } objects`);
    } else {
      for (let j = 0; j < b.assets.length; j++) {
        const asset = b.assets[j];
        if (!asset || typeof asset !== "object" || typeof asset.src !== "string") {
          errors.push(`${prefix}.assets[${j}]: must be { alias: string, src: string }`);
          continue;
        }
        const pathErr = isInvalidPath(asset.src);
        if (pathErr) errors.push(`${prefix}.assets[${j}].src: ${pathErr}`);
        else if (!ALLOWED_EXTENSIONS.test(asset.src)) {
          errors.push(
            `${prefix}.assets[${j}].src: unknown extension (allowed: .json, .png, .jpg, .webp, .gif, .svg, .woff2, .mp3, .webm, etc.)`,
          );
        }
        if (!asset.alias || typeof asset.alias !== "string") {
          errors.push(`${prefix}.assets[${j}].alias: required string`);
        }
      }
    }
  }

  // De-duplicate errors (GC and scaffold may flag the same thing)
  const unique = [...new Set(errors)];

  if (unique.length > 0) {
    console.error("check:manifest — Validation failed:\n");
    for (const e of unique) console.error("  " + e);
    console.error("\nSee docs/recipes/manifest-contract.md.");
    process.exit(1);
  }

  console.log(
    `check:manifest — Manifest is valid (${bundles.length} bundle${bundles.length !== 1 ? "s" : ""}).${gcValidationRan ? " [GC validation ✓]" : ""}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("check:manifest — Failed to load manifest:", err.message);
  process.exit(1);
});
