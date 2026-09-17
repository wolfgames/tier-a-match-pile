#!/usr/bin/env bun
/**
 * Content pipeline step 4 (NOT run by this phase): copy the built level
 * pack into assets/src/ so a later CDN-asset phase can publish it via
 * `bun run assets:publish` (see local/rules/asset-pipeline.md — DOM/JSON
 * config data lives alongside other assets-src content, hashed and
 * published like any other asset).
 *
 * Deliberately NOT executed as part of the content-pipeline phase: assets/
 * is out of scope here. This script only becomes runnable once the
 * asset-publish phase owns assets/src/ for this game.
 *
 * Run (later phase only): `bun run content/scripts/publish-pack.ts`
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve(
  import.meta.dir,
  "../../src/game/match-pile/data/levels-match-pile.json"
);
const DEST_DIR = resolve(import.meta.dir, "../../assets/src");
const DEST_PATH = resolve(DEST_DIR, "data-levels-match-pile.json");

function run(): void {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(
      `publish-pack: ${SOURCE_PATH} does not exist — run build-pack.ts first`
    );
  }

  mkdirSync(DEST_DIR, { recursive: true });
  copyFileSync(SOURCE_PATH, DEST_PATH);

  console.log(`publish-pack: copied ${SOURCE_PATH} -> ${DEST_PATH}`);
  console.log(
    "publish-pack: next step (not run here) is `bun run assets:publish` to hash, " +
      "upload, and register this file in the CDN manifest lockfile."
  );
}

run();
