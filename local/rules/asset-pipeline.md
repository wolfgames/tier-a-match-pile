---
description: Game media comes from the asset-gen MCP and ships from the CDN by default; local assets are a sanctioned fallback for rapid iteration only
alwaysApply: true
---

# Assets: asset-gen MCP + CDN by default

**Game media is never committed to the repo (CDN-first).** Art ships from the
CDN under content-hashed immutable names; the repo commits only the lockfile
(`assets/asset-manifest.cdn.json`) and its typed seed (`assets/registry.ts`). Committed `public/` exceptions: fonts, favicon,
tuning/VFX config JSON, and the boot chrome the template already ships
(existing files only, never new ones).

## Default path: generate via MCP, publish, serve from CDN

Full guide: `docs/recipes/asset-pipeline.md`.

1. **Generate** — all generation goes through the wolf-game-kit MCP
   (`mcp__wolf-game-kit__*`). Discover first (`list_style_presets`,
   `list_process_templates`; never hardcode preset ids; pass
   `styleContext.imageRole` with any preset). Many assets = ONE
   `create_asset_gen_batch` with N `kind:"pipeline"` items, then poll
   `get_asset_gen_status {batchId, projectId}` until `isTerminal`. Transparent
   sprites ONLY via the `transparent-raster` process template — never magenta
   plates, never `chroma_key`. Audio via `generate_sfx` / `generate_music` /
   `generate_tts` + the audio-sprite process templates. VFX via `generate_vfx`.
2. **Stage** — download results into `assets/src/_staging/`, rename per
   `docs/guides/naming-convention.md`, compress (webp for images, ~100–150KB
   backgrounds, ~150KB per music track), move approved files up into
   `assets/src/`. Pixi-loaded atlas JSON goes under `assets/src/json-data/`;
   DOM atlases and audio-sprite JSON stay at the top level (`assets/README.md`
   has the rule).
3. **Publish** — `bun run assets:publish` (CLI) or the `assets_publish` MCP
   tool: hashes everything in `assets/src/`, rewrites sidecar refs, uploads
   immutable, verifies at the storage origin, then writes the lockfile and
   regenerates `assets/registry.ts` — commit both. Assets land under the
   `projectId` from `wolf-game-kit.json` — it must equal the game's Nucleo
   `gameSlug`; if it's still the placeholder `mygame`, stop and set the real
   id first (`docs/factory/newgame.md`, Step 1). Never build project-local
   publish scripts — the shared contract lives in `wolf-dev`.
4. **Load** — register bundles in `src/game/asset-manifest.ts` with lockfile
   keys as `src` values (paths relative to `assets/src/`). CdnManifestProvider
   resolves them at boot; never scatter `media.<env>.wolf.games` URLs through
   `src/` (`check:assets` enforces this).

Asset-gen result `cdnUrl`s are opaque provenance URLs: download from them,
never reference them at runtime. Publish preserves logical names — the
lockfile maps them to the hashed CDN filenames.

## Local fallback (sanctioned, temporary)

Use local assets only when (a) the wolf-game-kit MCP is not available in your
setup, or (b) you're iterating rapidly and a CDN round-trip would slow the
loop down:

- Files go in `public/assets/` with naming-convention names; manifest srcs
  not in the lockfile resolve against `localBase` (`/assets`) automatically.
- The 200KB size budget still applies (`check:assets`) — heavier media goes
  to `assets/src/` + `assets:publish` even during iteration.
- Before release, local media moves to `assets/src/` and the CDN. Local mode
  is an iteration convenience, not a shipping path.

## If the MCP tools are missing

**If `mcp__wolf-game-kit__*` tools are absent or `ASSET_GEN_HOST` /
`ASSET_GEN_API_KEY` are unset, generation is blocked. That is a setup problem
to surface, not to code around.**

1. Tell the user plainly what is missing and how to fix it: MCP config is
   machine-local (provisioned by the workspace setup / Nucleo Studio CLI —
   `.mcp.json` is gitignored); the env vars go in the environment per
   `.env.example` (get a key via the setup guide linked in README).
2. Then wait for them — or use the local fallback above if they prefer.
   Do NOT substitute: no procedurally generated or code-drawn art or audio
   (no Pixi `Graphics` / Canvas stand-ins, no WebAudio/oscillator SFX, no
   data-URI media), no images pulled from the web, no new "proxy" files
   (that exception covers only art the template already ships). Don't land
   code that references assets that don't exist yet.
3. Temporary placeholders are allowed only if the user explicitly approves
   after being told, and each one must be flagged for replacement. Shipped
   placeholders are a guardrail violation (`docs/standards/guardrails.md`).

Validate: `bun run check:assets` and `bun run check:manifest` (also run by
pre-commit). After a publish, `bun run assets:verify` confirms every lockfile
entry exists at the storage origin.
