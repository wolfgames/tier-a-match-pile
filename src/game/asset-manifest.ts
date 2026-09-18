/**
 * Asset manifest — single source for bundle list and paths.
 *
 * This file is intentionally free of runtime imports (no Solid.js, no ~/core)
 * so it can be imported by CLI scripts (scripts/check-manifest.ts) running
 * under plain Bun without the Vite/app dependency graph.
 *
 * cdnBase and localBase are static placeholders here. At boot,
 * CdnManifestProvider resolves srcs against the committed lockfile: published
 * srcs become content-hashed CDN paths, unpublished srcs (the bundled boot
 * chrome below) stay on localBase. Published srcs are lockfile keys — paths
 * relative to assets/src/, so GPU-loaded atlas JSON keeps its json-data/
 * prefix while audio/DOM JSON is top-level (see assets/README.md).
 *
 * Types are imported directly from @wolfgames/components/core — this is the
 * single source of truth for the manifest schema.
 *
 * Bundle naming determines which loader handles the assets:
 *
 *   boot-*   → DOM only   — splash screen assets
 *   theme-*  → DOM only   — branding/logo (loading screen, pre-GPU)
 *   scene-*  → GPU (Pixi) — game spritesheets, backgrounds, tiles, characters
 *   core-*   → GPU (Pixi) — in-game UI atlases
 *   fx-*     → GPU (Pixi) — particles, effects, VFX spritesheets
 *   audio-*  → Howler     — sound effects, music
 *
 * Game atlases MUST use scene-* or core-* to be accessible via Pixi
 * (createSprite, getTexture, hasSheet). Using theme-* for game atlases
 * will silently fail — Pixi never sees them.
 *
 * Bundle names must match [a-z][a-z0-9-]* — only lowercase, digits, hyphens.
 * NO underscores. Asset file paths can have underscores; bundle names cannot.
 *
 * For single-asset GPU bundles, set alias = bundle name so Pixi lookups work:
 *   { name: 'scene-tiles', assets: [{ alias: 'scene-tiles', src: 'json-data/atlas-tiles.json' }] }
 *   → gpuLoader.createSprite('scene-tiles', 'frame-name.png')
 */

import type { Manifest } from '@wolfgames/components/core';

export const LOCAL_ASSET_PATH = '/assets';

export const manifest: Manifest = {
  cdnBase: LOCAL_ASSET_PATH,
  localBase: LOCAL_ASSET_PATH,
  bundles: [
    // Micro-bundle: lightweight hero image loaded first so ContentLoader
    // can mount before the rest of the heavy assets finish.
    {
      name: 'boot-splash',
      assets: [
        { alias: 'splash-hero', src: 'bg-splash.webp' },
        // Optional game-specific loader bar image. Remove if not used.
        // { alias: 'loader-bar', src: 'loader-bar.webp' },
      ],
    },

    // DOM — branding logo shown on loading screen (pre-GPU)
    {
      name: 'theme-branding',
      assets: [{ alias: 'atlas-branding-wolf', src: 'atlas-branding-wolf.json' }],
    },

    // GPU — same branding atlas, loadable by Pixi (createSprite/getTexture/hasSheet — theme-*
    // bundles are DOM-only and invisible to Pixi, see the header note above). Distinct alias
    // required (aliases are unique across all bundles); same underlying file. Used by the
    // match-pile start screen's Pixi-rendered logo (frame `logo-wide-small`).
    {
      name: 'core-branding',
      assets: [{ alias: 'core-branding', src: 'atlas-branding-wolf.json' }],
    },

    // GPU — in-game settings panel chrome (button plates, close icon, row
    // icons) for the catalog options-menu overlay.
    // ART TODO (ENG-4127): demo art via the local-assets fallback; regenerate
    // through the asset pipeline and publish before any release.
    {
      name: 'core-settings',
      assets: [{ alias: 'core-settings', src: 'atlas-settings-ui.json' }],
    },

    // ── Match Pile (GPU) ────────────────────────────────────────────────────
    // ART TODO (tier-a Phase 2): the board currently renders with placeholder
    // colour-coded Pixi Graphics discs — no GPU bundles yet. Once the object-pool
    // tile art and celebration fx are generated and published (see
    // tier-a/ASSET_SET.json + tier-a-assets-v4), add the real `scene-*`/`fx-*`
    // bundles here and load them in the controller. See the asset-pipeline rule.
    //
    // When adding bundles for your game, use the appropriate prefix:
    //
    //   scene-*  → GPU spritesheets, backgrounds, tiles
    //   core-*   → GPU in-game UI atlases
    //   fx-*     → GPU particles, effects, VFX
    //   audio-*  → Howler sound effects and music
    //   data-*   → JSON config files
    //   boot-*   → DOM pre-engine splash assets
    //
    // Examples (GPU atlas JSON keeps its json-data/ prefix; audio JSON is top-level):
    //   { name: 'scene-tiles-match-pile', assets: [{ alias: 'scene-tiles-match-pile', src: 'json-data/atlas-tiles-match-pile.json' }] },
    //   { name: 'fx-blast', assets: [{ alias: 'fx-blast', src: 'json-data/vfx-blast.json' }] },

    // ── Match Pile (Audio) ──────────────────────────────────────────────────
    // SFX + BGM pass — audio-* bundles load via the Howler loader (loadAudio(),
    // called from screens/startView.ts's PLAY handler). `alias` must equal the
    // bundle `name`: coordinator.audio.play(channel, sprite) looks the Howl up
    // by that same string (see audio/manager.ts's SFX_CHANNEL/MUSIC_CHANNEL).
    {
      name: 'audio-sfx-match-pile',
      assets: [{ alias: 'audio-sfx-match-pile', src: 'sfx-match-pile.json' }],
    },
    {
      name: 'audio-music-match-pile',
      assets: [{ alias: 'audio-music-match-pile', src: 'music-match-pile.json' }],
    },
  ],
};
