# assets/ — CDN-first game assets

The game's art lives on the CDN, not in the repo. This folder holds the
committed record of what's published and a gitignored working area:

- `asset-manifest.cdn.json` — the **lockfile**: logical name → content-hashed
  CDN filename. Written by `bun run assets:publish` only after every upload is
  verified at the storage origin. Committed. Absent until the first publish —
  its presence is what flips a release to `assetMode: "cdn"`.
- `registry.ts` — codegen'd typed seed (`assetSeed`) regenerated on every
  publish. Committed. `CdnManifestProvider` bakes it in as the synchronous
  boot seed, so the game renders even if manifest fetches fail.
- `src/` — **gitignored working copy, empty by default.** Drop hand-authored
  files here (or fetch current art with `assets pull`, once it ships), then
  `bun run assets:publish`. Raw asset-gen downloads can stage in
  `src/_staging/` before being renamed to convention.

## Layout rules inside `src/`

- Lockfile keys are paths relative to `src/` (`ui/ui-mute.png` — the basename
  still needs its category prefix, per the naming convention). Manifest bundle
  `src` values must use the same logical names.
- **Pixi-loaded atlas JSON goes under `src/json-data/`** — publish rewrites its
  `meta.image` relative to the JSON's own URL (`../assets/<hashed>`), which is
  how Pixi resolves it.
- **DOM-loaded atlases and audio-sprite JSON stay outside `json-data/`** —
  their refs rewrite relative to the manifest `cdnBase` (`assets/<hashed>`),
  which is how the components loaders resolve them.
- Filenames follow `docs/guides/naming-convention.md` (`bun run check:assets`).

Boot chrome (splash, Wolf branding, fonts, favicon, core VFX) stays bundled in
`public/assets/` and never goes through this pipeline — see
`docs/recipes/asset-pipeline.md`.
