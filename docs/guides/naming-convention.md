# Asset Naming Convention

Standard naming rules for raw asset files before they're packed into atlases or audio sprites.

## Overview

Consistent naming makes assets discoverable, sortable, and automatable. All raw assets should follow this convention before being processed by TexturePacker, audio sprite tools, or other pipelines.

## The Pattern

```
{category}-{name}[_{variant}].{ext}
```

| Part | Required | Description |
|------|:--------:|-------------|
| `category` | Yes | Asset type prefix (see categories below) |
| `-` | Yes | Separator between category and name |
| `name` | Yes | Descriptive name, lowercase, underscores for spaces |
| `_variant` | No | Optional suffix for variations |
| `.ext` | Yes | File extension |

## Categories

| Prefix | Description | Examples |
|--------|-------------|----------|
| `piece-` | Game pieces/blocks | `piece-dot.png`, `piece-i2_h.png` |
| `exit-` | Exit points, goals | `exit-red.png`, `exit-closed.png` |
| `character-` | Character sprites | `character-marty_idle.png` |
| `bg-` | Backgrounds | `bg-warehouse_interior_a.png` |
| `item-` | Collectibles, icons | `item-hot_cocoa.png` |
| `prop-` | Stage props | `prop-truck.png`, `prop-grid_6x6.png` |
| `ui-` | UI elements | `ui-button_play.png` |
| `vfx-` | Visual effects | `vfx-confetti.png` |
| `sfx-` | Sound effects | `sfx-piece_slide_a.wav` |
| `music-` | Background music | `music-chapter_a.mp3` |

## Common Variant Suffixes

| Suffix | Meaning | Example |
|--------|---------|---------|
| `_h`, `_v` | Horizontal/vertical orientation | `piece-i2_h.png` |
| `_a`, `_b`, `_c` | Variations of same type | `sfx-delivered_a.wav` |
| `_idle`, `_talking`, `_thinking` | Character states | `character-marty_idle.png` |
| `_back`, `_fill` | UI component parts | `ui-progress_bar_back.png` |
| `_2x3`, `_6x6` | Dimensions | `piece-rect_2x3.png` |

## Complete Examples

### Pieces (game blocks)
```
piece-dot.png
piece-i2_h.png
piece-i2_v.png
piece-i3_h.png
piece-i3_v.png
piece-i4_h.png
piece-i4_v.png
piece-l.png
piece-j.png
piece-t.png
piece-o.png
piece-s.png
piece-z.png
piece-rect_2x3.png
```

### Exits
```
exit-red.png
exit-blue.png
exit-yellow.png
exit-green.png
exit-closed.png
```

### Characters
```
character-marty_idle.png
character-marty_talking.png
character-marty_thinking.png
character-marty_surprised.png
```

### Backgrounds
```
bg-warehouse_interior_a.png
bg-warehouse_interior_b.png
bg-loading_dock.png
bg-county_fishtown.png
bg-county_annarbor.png
```

### Items (shippable icons)
```
item-string_lights.png
item-hot_cocoa.png
item-signage.png
item-sound_equipment.png
item-medical_gear.png
```

### Props
```
prop-truck.png
prop-truck_door.png
prop-grid_6x6.png
```

### UI Elements
```
ui-button_play.png
ui-button_start.png
ui-button_next.png
ui-button_restart.png
ui-button_eraser.png
ui-progress_bar_back.png
ui-progress_bar_fill.png
ui-move_counter.png
ui-dialogue_popup.png
ui-chapter_interstitial.png
ui-slide_indicator.png
ui-title.png
```

### VFX
```
vfx-confetti.png
vfx-slide_particle.png
vfx-exit_particle.png
vfx-collision_wobble.png
```

### SFX
```
sfx-piece_slide_a.wav
sfx-piece_slide_b.wav
sfx-piece_slide_c.wav
sfx-piece_slide_d.wav
sfx-piece_slide_e.wav
sfx-delivered_a.wav
sfx-delivered_b.wav
sfx-delivered_c.wav
sfx-level_complete.wav
sfx-chapter_complete.wav
sfx-truck_departure.wav
sfx-button_click.wav
sfx-eraser_use.wav
sfx-clue_revealed.wav
```

### Music
```
music-chapter_a.mp3
music-chapter_b.mp3
music-chapter_c.mp3
music-chapter_d.mp3
music-chapter_e.mp3
```

## Rules Summary

1. **Always lowercase** - No capital letters anywhere
2. **Hyphens separate category from name** - `category-name`
3. **Underscores for multi-word names** - `hot_cocoa`, not `hot-cocoa` or `hotCocoa`
4. **Underscores for variants** - `_idle`, `_h`, `_a`
5. **No spaces or special characters** - Only `a-z`, `0-9`, `-`, `_`
6. **Be descriptive** - `warehouse_interior_a` over `bg1`

## Adding New Categories

If a new asset type doesn't fit existing categories:

1. Choose a short, clear prefix (3-10 chars)
2. Document it in this file
3. Use consistently across all assets of that type

## Validation

Asset filenames are validated against this convention by a script. Use it in CI or before committing new assets.

```bash
# Check for non-conforming files (exits 1 if any invalid)
bun run check:assets

# Show suggested renames for invalid filenames
bun run check:assets --suggest
```

- **Machine-readable spec:** [naming-convention.schema.json](naming-convention.schema.json) — pattern regex, category list, packed-output patterns. Use this for tooling or generators.
- **Manifest alignment:** See [Manifest contract](../recipes/manifest-contract.md) for how raw and packed asset names map to manifest bundles and paths.

## Related

- [Asset Pipeline](../recipes/asset-pipeline.md) - How assets are packed and loaded
- [Audio Setup](../recipes/audio-setup.md) - Audio-specific details
