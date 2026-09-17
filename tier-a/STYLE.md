# Match Pile — Phase 2 style decision

## Preset

`superflat` (House Style - SuperFlat), role `gameplayProps` only.

## Why

Decorative scope is the 24-item food/packaging object pool (`piece-*`, see
`ASSET_SET.json`). Direction requested: McDonald's red/yellow/cream palette,
clean rounded casual-mobile presentation, simple highly-readable shapes,
playful-but-polished commercial look, strong silhouette readability.

Design references reviewed (qualitative direction only — see note below):
the McDonald's mobile UI brand sheet's own "Game Grid Elements" section
(flat solid red/yellow rounded squares, no gradient/painterly rendering) and
its iconography row (thin flat line glyphs); and three Wolf 50-games
screenshots (Mahjong Solitaire start + gameplay, Color Fill) — all bold flat
rounded squircles with a single centered high-contrast icon/pip, zero
painterly shading.

`superflat`'s `gameplayProps` style spec matches this directly: "hybrid of
rigid geometry and rounded volumes... external corners universally
softened... flat matte colors... two-tone flat shading... isolated on pure
white background," with the preset's own stated charm ratio "Utility 95% /
Charm 5% — maximized for readability, scalability, modular UI layering."
That is a better match than a painterly/semi-realistic preset for a 24-item
pool that must read correctly at 26–72px tile sizes (`board/tiles.ts`
`tileSizeFor`).

**Note on references:** the McDonald's brand sheet and 50-games screenshots
were supplied as pasted images in chat with no accessible file path or URL,
so they could not be registered as `referenceAssets` on a style preset or
passed via `additionalReferences`/`referenceImageUrls` to any `generate_*`
call. They informed the preset choice and prompt wording below qualitatively;
Asset Gen is not conditioned on their literal pixels.

## Scope — decorative only

Only the `piece-*` tile art (24 rows), `sfx-*` (11 rows), and `music-*`
(3 rows) in `ASSET_SET.json` go through `generate_*`. Everything else is
code/token-driven and must not be generated:

- UI chrome (settings/profile icons, hint icon, orders HUD text) — code-drawn
  per `brand-contract.md` N7, already implemented as plain Pixi
  Graphics/Text in `board/chrome.ts` / `board/ordersHud.ts`.
- Palette, typography, shadows — `palette.ts`/`typography.ts`, generated from
  `brand.tokens.json`, never touched by asset generation.
- Celebration VFX — `fx/fx.ts` uses the catalog `ParticleBurst` primitive
  (procedural Pixi `Graphics`, tinted from `paletteHex`); no `fx-*` sprite
  exists or is needed.
- Results stars / mascot slot — currently a Unicode glyph + emoji in
  `ResultsScreen.tsx`; out of scope for Phase 2 (a Build-phase code item, not
  an asset-gen item — see gap note in build-status, not tracked here).

## Tenant mark / watermark

`mark-mcdonalds` / `mark-mcdonalds-arches` remain required rows (seeded by
`tier-a/init.sh` from `TENANT.json`). Open decision, not resolved by this
file: whether these should be `generate_*` output (as `tier-a-build-v4`/
`init.sh` literally instruct) or sourced from an authentic McDonald's logo
asset via `upload_asset`, given the trademark-accuracy risk of a generated
logo. Not run in this pass — see status log.

## Prompt direction for the 24 `piece-*` items

Single subject per image, centered, isolated on white/transparent, ¾ or
straight-on hero framing, thick clean silhouette, bold flat fills using the
McDonald's palette family (`#DA291C` red, `#FFC72C` gold/yellow, `#FBF6E0`
cream, plus true-to-life food colors where the item itself isn't
brand-colored), soft single contact shadow, no text/logos/watermarks baked
into the art (tenant identity is layered separately, per N1/N9), legible at
small tile sizes (~26–72px on-screen per `tileSizeFor`).
