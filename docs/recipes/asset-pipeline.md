# Asset Pipeline

How game media gets created, staged, published, and loaded. The game is
**CDN-first**: art ships from the CDN under content-hashed immutable names,
and the repo commits only the **lockfile** (`assets/asset-manifest.cdn.json`)
plus its typed seed (`assets/registry.ts`). Four stages:

```
GENERATE                 STAGE                      PUBLISH                        LOAD
wolf-game-kit MCP   →    assets/src/_staging/  →   bun run assets:publish     →   manifest bundles
(asset-gen batches)      rename + compress →       hash → upload immutable →      srcs = lockfile keys
                         assets/src/               verify → lockfile + registry   Pixi / Howler / DOM
```

- **Generate** — assets come from the asset-gen service via the wolf-game-kit
  MCP tools. Don't hand-draw programmer art; don't ship generation URLs.
- **Stage** — raw downloads land in `assets/src/_staging/`. Approved files get
  naming-convention names and move up into `assets/src/` (a gitignored
  working dir — the committed record of a publish is the lockfile).
- **Publish** — `bun run assets:publish` (or the `assets_publish` MCP tool):
  content-hashes everything in `assets/src/`, rewrites JSON sidecar refs,
  uploads immutable, verifies every object at the storage origin, and only
  then writes the lockfile and regenerates `assets/registry.ts`. All or
  nothing.
- **Load** — register bundles in `src/game/asset-manifest.ts` with **logical
  names** (lockfile keys — paths relative to `assets/src/`). At boot,
  `CdnManifestProvider` resolves them through the shared `AssetClient` to
  hashed CDN paths; no game code ever sees a CDN host.

> **Local fallback.** If you're iterating rapidly and the CDN round-trip slows
> you down, work locally: files in `public/assets/` with convention names —
> manifest srcs that aren't in the lockfile resolve against `localBase`
> (`/assets`) automatically. The 200KB size budget still applies. Before
> release, media moves to `assets/src/` + `assets:publish` — local mode is an
> iteration convenience, not a shipping path.

> **Changed art is a new URL.** Published filenames carry a content hash
> (`bg-forest_day-a1b2c3d4e5f6.webp`), so players can never be served a stale
> cached copy, and the publish gate fails loud — lockfile untouched — if any
> upload didn't land. Never build project-local publish scripts; the shared
> contract lives in `wolf-dev`.

## 1. Generate (wolf-game-kit MCP)

All generation goes through the `wolf-game-kit` MCP server (tools named
`mcp__wolf-game-kit__*`). MCP config is machine-local — the workspace setup /
Nucleo Studio CLI provisions it (`.mcp.json` is gitignored); the server reads
`ASSET_GEN_API_KEY` / `ASSET_GEN_HOST` from your environment (see
`.env.example`).

### Discover first

Never hardcode IDs — style presets and process templates differ per environment.

```
list_style_presets        # pick a presetId from THIS environment
list_process_templates    # transparent-raster, styled-sprite-sheet, sfx-audio-sprite, dialog-audio-sprite, …
list_models               # model catalog + input contracts
```

When you pass a style preset, `styleContext.imageRole` is **required**
(baseline roles: `backgrounds`, `uiElements`, `gameplayProps`,
`gameplayTiles`, `hosts`). Without a role the provider rejects the request.

### Batch first

Many assets = ONE batch, ONE poll loop. Not N single calls.

```
create_asset_gen_batch {
  projectId,
  items: [ { kind: "pipeline", steps: [...] },   # one pipeline item per asset
           ... N items ... ]
}
get_asset_gen_status { batchId, projectId }       # poll ~every 1.5s until isTerminal
```

- Poll the **batch** (`isTerminal: true`), not N individual jobs.
- Enqueue limit is 100 items/hr per key; polls are cheap (10k/hr). Budget
  batches accordingly.
- Failed items: retry via the batch retry, not a fresh batch.

### Transparent sprites

Use the `transparent-raster` process template — generate → remove-background
in one pipeline job:

```
create_asset_gen_batch {
  projectId, processTemplateId: "transparent-raster",
  slots: { prompt: "...", stylePresetId: "<discovered>", sourceContext: "..." }
}
```

Never magenta plates, never `chroma_key`, never hand-chained
`remove_background` calls. For many sprites, one batch of N `kind:"pipeline"`
items (style-generate → remove-background per item).

### Audio

- SFX: `generate_sfx`; dialog: `generate_tts`; music: `generate_music`.
- Pack clips with the `sfx-audio-sprite` / `dialog-audio-sprite` process
  templates → a Howler-compatible audio sprite (webm + JSON sprite map with
  `urls[]`).
- Music tracks usually stay unpacked (one file per track); see load-perf
  defaults below.

### VFX and spritesheets

- `generate_vfx` → `@wolfgames/vfx` JSON config (renders through the core
  particle system).
- `pack_spritesheet` → TexturePacker-format atlas (JSON + image) from
  individual frames.

### Result URLs are provenance, not runtime URLs

`result.assets[].cdnUrl` values are opaque, uuid-mangled generation URLs.
**Download from them into `assets/src/_staging/`, never reference them from
game code or the manifest.** The `check:assets` script fails any hardcoded
`media.<env>.wolf.games` URL in `src/` for this reason.

## 2. Stage (assets/src/)

1. Download batch results into `assets/src/_staging/` (scratch space).
2. Review; discard rejects.
3. Rename approved files per
   [naming-convention.md](../guides/naming-convention.md) —
   `bg-forest_day.webp`, `character-host_idle.webp`, `sfx-mygame.json`,
   `music-mygame_a.webm`.
4. Move them up into `assets/src/`. **Placement decides sidecar rewriting:**
   Pixi-loaded atlas JSON (`scene-*`/`core-*`/`fx-*` bundles) goes under
   `assets/src/json-data/`; DOM-loaded atlases (`theme-*`) and Howler audio
   sprites stay at the top level next to their media. See
   [assets/README.md](../../assets/README.md).
5. Compress before publishing:
   - Images: **webp**. Backgrounds ~100-150KB; sprites as small as quality
     allows.
   - Music: ~150KB per track.
   - `cwebp -q 80 in.png -o bg-forest_day.webp` is a good starting point.

`assets/src/` is a gitignored working dir — after a publish, the committed
lockfile is the durable record, and every published version stays on the CDN
forever under its own hashed name (rollback is repointing the lockfile, not
re-uploading).

`bun run check:assets` validates naming in both `public/assets/` and
`assets/src/` (skipping `_staging/`).

## 3. Publish (wolf-dev assets publish)

```
bun run assets:publish            # wolf-dev assets publish
bun run assets:publish -- --dry-run   # hash + rewrite only; writes <lockfile>.dry-run, uploads nothing
bun run assets:verify             # HEAD every lockfile entry at the storage origin
```

Authenticated session required: `bun wolf-dev auth login` (check with
`bun wolf-dev auth check`). One command publishes everything under
`assets/src/`: it content-hashes each file, rewrites JSON sidecar media refs
to the hashed names, uploads with an immutable cache policy, HEAD-verifies
every object at the storage origin, and only then writes
`assets/asset-manifest.cdn.json` and regenerates `assets/registry.ts`. Commit
both. A failed upload or a stripped header aborts before the lockfile is
touched.

**Where assets land is decided by `projectId`** — the id in
`wolf-game-kit.json` (`games/<projectId>/` on the CDN). It must equal the
game's Nucleo `gameSlug`; if it's still the template placeholder `mygame`,
stop and set the real id first ([newgame checklist](../factory/newgame.md),
Step 1).

The `upload_asset` MCP tool / `bun wolf-dev upload-asset` still exists for
one-off hosting of a single file, but it does not touch the lockfile — game
art goes through `assets:publish`.

## 4. Load (manifest)

### Registering bundles

```typescript
// src/game/asset-manifest.ts
export const manifest: Manifest = {
  cdnBase: '/assets',   // placeholder — CdnManifestProvider resolves the real base at boot
  localBase: '/assets',
  bundles: [
    { name: 'scene-tiles-mygame', assets: [{ alias: 'scene-tiles-mygame', src: 'json-data/atlas-tiles-mygame.json' }] },
    { name: 'audio-sfx-mygame',   assets: [{ alias: 'audio-sfx-mygame',   src: 'sfx-mygame.json' }] },
  ],
};
```

`src` values are **lockfile keys** — the file's path relative to
`assets/src/` (so a Pixi atlas staged at `assets/src/json-data/…` keeps its
`json-data/` prefix). At boot, `CdnManifestProvider` swaps published srcs for
their content-hashed CDN paths and sets `cdnBase` from the shared
`AssetClient`; srcs not in the lockfile (bundled chrome, local-mode files)
fall back to `localBase`. Nothing in this file changes per environment (see
[manifest-contract.md](manifest-contract.md)).

### Bundle prefix → loader

The asset system infers the loader from the bundle name prefix:

| Prefix | Loader | Use for |
|--------|--------|---------|
| `boot-` | DOM | Minimal assets for the loading screen |
| `theme-` | DOM | Branding, logos (pre-GPU) |
| `scene-` | GPU (Pixi) | Game spritesheets, backgrounds, tiles, characters |
| `core-` | GPU (Pixi) | In-game UI atlases |
| `fx-` | GPU (Pixi) | Particles, effects, VFX spritesheets |
| `audio-` | Howler | Sound effects and music |
| `data-` | DOM | JSON config files |

Game atlases MUST use `scene-*` or `core-*` — `theme-*` bundles never reach
Pixi and fail silently. Bundle names match `[a-z][a-z0-9-]*` (no underscores).

### Loading in code

```typescript
await coordinator.loadBundle('scene-tiles-mygame');

const gpuLoader = coordinator.getGpuLoader() as PixiLoader;
if (gpuLoader.hasSheet('scene-tiles-mygame')) {
  const sprite = gpuLoader.createSprite('scene-tiles-mygame', 'road_straight.webp');
  const texture = gpuLoader.getTexture('scene-tiles-mygame', 'landmark_hospital.webp');
}
```

### Load-perf defaults

- **Music: one bundle per track.** Register `audio-music-mygame-1`, `-2`, …
  separately; load track 1 before gameplay, load the rest idle-time after
  first interaction. One fat music bundle blocks boot on the slowest
  download.
- **Per-scene atlases stay out of the boot manifest.** Load them on scene
  entry (screen `screenAssets` config or an explicit `loadBundle`), not up
  front.
- **Unload between levels.** Textures don't GC —
  `coordinator.unloadBundle()` before loading the next scene's bundle.

## Making spritesheets (TexturePacker settings)

Prefer `pack_spritesheet` (asset-gen). If packing locally with TexturePacker,
use:

| Setting | Value |
|---------|-------|
| Data Format | JSON (Hash) |
| Texture Format | PNG (convert to webp before staging) |
| Max Size | 2048 x 2048 (or 4096 for retina) |
| Algorithm | MaxRects |
| Trim Mode | Trim |
| Extrude | 1px (prevents bleeding) |

Atlas output names follow the packed convention: `atlas-{name}.json` +
`atlas-{name}.webp`.

**Sprite naming inside the atlas:** descriptive frame names
(`road_straight.png`, `character_walk_01.png`, `ui_button.png`); animation
frames numbered.

## 9-Slice sprites

For UI elements that scale without distorting corners (buttons, panels,
dialogue boxes):

1. Design with clear corner regions that shouldn't stretch.
2. Export as a single sprite in an atlas; note the border sizes.

```typescript
import { NineSliceSprite } from 'pixi.js';

const texture = gpuLoader.getTexture(atlasName, 'button.png');
const button = new NineSliceSprite({
  texture,
  leftWidth: 32,
  topHeight: 32,
  rightWidth: 32,
  bottomHeight: 32,
});
button.width = 200;  // Scales center, preserves corners
button.height = 80;
```

## Fonts

Fonts stay bundled in `public/assets/fonts/` (referenced from static CSS, not
the manifest — they never go through the CDN pipeline).

1. Place the font file in `public/assets/fonts/` (`woff2` preferred).
2. Register in `src/app.css`:

   ```css
   @font-face {
     font-family: 'MyFont';
     src: url('/assets/fonts/MyFont-Regular.woff2') format('woff2');
     font-weight: 400;
     font-style: normal;
     font-display: swap;
   }
   ```

3. Expose a constant (see `GAME_FONT_FAMILY` in `src/game/config.ts`) and use
   it in Pixi `Text` styles.

## What stays committed (and what enforces this)

Bundled in `public/` (never published to the CDN):

- `public/assets/fonts/` — referenced from static CSS
- `public/favicon.ico` — referenced from index.html
- `public/assets/vfx/` — core-managed particle config + textures
- Tuning/config JSON — small, versioned with the code
- Boot chrome (the template's splash + Wolf branding atlas) — keeps a fresh
  scaffold rendering with zero credentials and zero publishes
- Local-mode iteration assets (see the local fallback above) — allowed under
  the size budget while iterating, moved to `assets/src/` + CDN before
  release

Everything else — backgrounds, atlases, characters, audio, generated media —
is published from `assets/src/` and ships from the CDN; the repo commits only
`assets/asset-manifest.cdn.json` + `assets/registry.ts`.

Enforced by `bun run check:assets` (also run by the pre-commit hook,
alongside `check:manifest`):

1. Naming convention in `public/assets/` and `assets/src/` (skips
   `_staging/`).
2. No game media over 200KB in `public/assets/` outside `fonts/`, `vfx/`,
   `proxy/`, `favicon*` — oversized media belongs in `assets/src/` + CDN.
3. No hardcoded `media.<env>.wolf.games` URLs in `src/` (URLs resolve through
   `CdnManifestProvider`; no source file may know CDN hosts).

## Troubleshooting

### "Texture not found"
- Check the frame name matches exactly (case-sensitive).
- Verify the bundle was loaded before accessing; `hasSheet()` returns true.
- Game atlases must be in `scene-*` or `core-*` bundles (not `theme-*`).

### "Atlas not loading" / 404s after publish
- `bun run assets:verify` — HEADs every lockfile entry at the storage origin
  and names anything missing.
- The manifest `src` must be the lockfile key exactly (path relative to
  `assets/src/`, including any `json-data/` prefix). An unknown src passes
  through unhashed and can only 404 on the CDN.
- JSON sidecars reference media by filename (Pixi atlas `meta.image`, Howler
  `urls[]`) — publish rewrites those refs, and fails loudly if a referenced
  file isn't in `assets/src/`. Publish the sidecar and its media together.

### "Works locally, 404 on deploy"
- The asset was never published — it only exists in `public/assets/` (local
  fallback). Move it to `assets/src/` and `bun run assets:publish`; commit
  the lockfile + registry.

### "Sprites bleeding"
- Increase extrude to 2px when packing.
- Ensure no half-pixel positions in sprite placement.

### Publish fails immediately
- `wolf-dev CLI not found` → `bun add -d @wolfgames/dev` (needs ≥0.2.13 for
  the `assets` command group).
- Auth errors → `bun wolf-dev auth check`; sign in with
  `bun wolf-dev auth login`. MCP generation errors are separate — those use
  `ASSET_GEN_HOST` / `ASSET_GEN_API_KEY`.
- `stored Cache-Control … expected immutable` → the target game-api predates
  the immutable-header support (game-api#30); the publish failed closed and
  the lockfile was not written.
