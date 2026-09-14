# Writing a Module

Step-by-step guide to authoring a new shared module.

> **Shared modules live in [`wolfgames/game-components`](https://github.com/wolfgames/game-components), not in this repo.** To add a new shared primitive, prefab, or logic module, open a PR there following the structure below. Once merged and released, bump `@wolfgames/components` here and import via `@wolfgames/components/modules/<category>/<name>`.
>
> File paths in this guide are relative to **game-components**, not template-amino — e.g. `src/modules/primitives/<name>/` means `game-components/src/modules/primitives/<name>/`. The same shape applies regardless of which game-components branch you're on.
>
> For local iteration without publishing, use the vite-only `VITE_COMPONENTS_LOCAL=1 VITE_COMPONENTS_SOURCE=1` toggles documented in [`.env.example`](../../.env.example) to point this repo's vite at your sibling `game-components/` checkout.

## Prerequisites

- Understand the [Module System Overview](./index.md)
- Know the 3-tier architecture: `core/ → @wolfgames/components → game/`
- Your module must be game-agnostic (reusable across projects)

---

## Step 1: Choose a Category

Decide which category your module belongs to:

| Category | Criteria | Examples |
|----------|----------|---------|
| **Primitive** | Single-purpose visual component, no deps on other modules | sprite-button, dialogue-box, progress-bar, character-sprite |
| **Logic** | Pure logic, no rendering, exposes factory functions | level-completion, progress, catalog, loader |
| **Prefab** | Assembles multiple primitives and/or logic modules | avatar-popup |

**Decision tree:**

```
Does it render anything?
  +-- No  --> logic/
  +-- Yes
        +-- Does it compose other modules?
              +-- No  --> primitives/
              +-- Yes --> prefabs/
```

---

## Step 2: Create the Folder Structure

For a visual module (primitive or prefab):

```
mkdir -p src/modules/primitives/health-bar/renderers
```

For a logic module:

```
mkdir -p src/modules/logic/health-bar
```

---

## Step 3: Implement the Module

### Visual modules

Create the renderer at `renderers/pixi.ts`:

```typescript
// src/modules/primitives/health-bar/renderers/pixi.ts
import { Graphics } from 'pixi.js';
import { PixiRenderable } from '~/modules/primitives/_base';
import { HEALTH_BAR_DEFAULTS } from '../defaults';

export interface HealthBarConfig {
  /** Maximum health value */
  maxHealth: number;
  /** Current health value */
  currentHealth: number;
  /** Bar width in pixels */
  width?: number;
  /** Bar height in pixels */
  height?: number;
  /** Fill color when healthy */
  healthyColor?: number;
  /** Fill color when critical */
  criticalColor?: number;
  /** Threshold below which critical color is used (0-1) */
  criticalThreshold?: number;
}

export class HealthBar extends PixiRenderable {
  private bg: Graphics;
  private fill: Graphics;
  private config: Required<HealthBarConfig>;

  constructor(userConfig: HealthBarConfig) {
    super('health-bar');

    this.config = {
      width: HEALTH_BAR_DEFAULTS.width,
      height: HEALTH_BAR_DEFAULTS.height,
      healthyColor: HEALTH_BAR_DEFAULTS.healthyColor,
      criticalColor: HEALTH_BAR_DEFAULTS.criticalColor,
      criticalThreshold: HEALTH_BAR_DEFAULTS.criticalThreshold,
      ...userConfig,
    };

    this.bg = new Graphics();
    this.fill = new Graphics();
    this.addChild(this.bg, this.fill);

    this.draw();
  }

  setHealth(value: number) {
    this.config.currentHealth = Math.max(0, Math.min(value, this.config.maxHealth));
    this.draw();
  }

  private draw() {
    const { width, height, maxHealth, currentHealth, healthyColor, criticalColor, criticalThreshold } = this.config;
    const ratio = currentHealth / maxHealth;
    const color = ratio <= criticalThreshold ? criticalColor : healthyColor;

    this.bg.clear().rect(0, 0, width, height).fill({ color: 0x333333 });
    this.fill.clear().rect(0, 0, width * ratio, height).fill({ color });
  }
}
```

### Logic modules

Create the factory function at `index.ts`:

```typescript
// src/modules/logic/score-tracker/index.ts
export interface ScoreTrackerConfig {
  /** Starting score */
  initialScore?: number;
  /** Score multiplier */
  multiplier?: number;
}

export interface ScoreTracker {
  current: () => number;
  add: (points: number) => number;
  reset: () => void;
}

export function createScoreTracker(config: ScoreTrackerConfig = {}): ScoreTracker {
  const { initialScore = 0, multiplier = 1 } = config;
  let score = initialScore;

  return {
    current: () => score,
    add: (points: number) => { score += points * multiplier; return score; },
    reset: () => { score = initialScore; },
  };
}
```

---

## Step 4: Create the Barrel `index.ts`

The barrel export is the public API for your module. Everything consumers need should be exported from here.

```typescript
// src/modules/primitives/health-bar/index.ts

// Pixi.js renderer (default)
export { HealthBar, type HealthBarConfig } from './renderers/pixi';

// Shared defaults & tuning
export { HEALTH_BAR_DEFAULTS } from './defaults';
export { healthBarTuning } from './tuning';
```

---

## Step 5: Extract Defaults into `defaults.ts`

Pull all magic numbers into a single, documented defaults object:

```typescript
// src/modules/primitives/health-bar/defaults.ts

export const HEALTH_BAR_DEFAULTS = {
  /** Bar width in pixels */
  width: 200,
  /** Bar height in pixels */
  height: 20,
  /** Fill color when healthy (green) */
  healthyColor: 0x44cc44,
  /** Fill color when critical (red) */
  criticalColor: 0xcc4444,
  /** Ratio threshold below which critical color applies */
  criticalThreshold: 0.25,
  /** Animation duration for fill transitions (seconds) */
  fillDuration: 0.3,
  /** Animation easing */
  fillEase: 'power2.out',
  /** Border radius */
  borderRadius: 4,
};
```

Guidelines for defaults:
- Every numeric literal or color constant should be here, not inline
- Use JSDoc comments to explain each value
- Keep defaults flat (single-level object) when possible
- Name the export `<MODULE_NAME>_DEFAULTS` in SCREAMING_SNAKE_CASE

---

## Step 6: Create `tuning.ts` with Tweakpane Schema

The tuning schema makes your module's parameters appear in the [Tuning Panel](../core/entry-points.md) under the green **Modules** section.

```typescript
// src/modules/primitives/health-bar/tuning.ts
import { HEALTH_BAR_DEFAULTS } from './defaults';

export const healthBarTuning = {
  name: 'Health Bar',
  defaults: HEALTH_BAR_DEFAULTS,
  schema: {
    width: { type: 'number', min: 50, max: 500, step: 10 },
    height: { type: 'number', min: 5, max: 50, step: 1 },
    criticalThreshold: { type: 'number', min: 0, max: 1, step: 0.05 },
    fillDuration: { type: 'number', min: 0, max: 1, step: 0.01 },
    borderRadius: { type: 'number', min: 0, max: 20, step: 1 },
  },
} as const;
```

Schema field types:

| Type | Tweakpane Control | Properties |
|------|-------------------|------------|
| `number` | Slider | `min`, `max`, `step` |
| `string` | Text input | -- |
| `boolean` | Checkbox | -- |

The `name` field is displayed in the panel. The `defaults` object provides initial values. The `schema` object maps parameter keys to Tweakpane control definitions. Only parameters you want editable in the panel need to appear in the schema -- not every key from defaults needs an entry.

---

## Step 7: For Visual Modules, Add `renderers/pixi.ts`

If your module renders anything, the Pixi.js implementation goes in `renderers/pixi.ts`. This is covered in Step 3 above.

Convention:
- The primary renderer is always `renderers/pixi.ts`
- Optional alternative renderers: `renderers/phaser.ts`, `renderers/three.ts`
- The renderer imports from `../defaults` for default values
- The renderer class extends `PixiRenderable` from `~/modules/primitives/_base`

---

## Step 8: Register in `src/modules/INDEX.md`

Add your module to the appropriate category table in `src/modules/INDEX.md`:

```markdown
## Primitives

| Module | What it does | Path |
|--------|-------------|------|
| health-bar | Animated health/HP bar with critical state | primitives/health-bar/ |
```

This keeps the source-level registry up to date for other developers.

---

## Worked Example: Health Bar Primitive

Putting it all together, creating a hypothetical `health-bar` primitive:

### Final file tree

```
src/modules/primitives/health-bar/
  index.ts              -- barrel: exports HealthBar, defaults, tuning
  defaults.ts           -- HEALTH_BAR_DEFAULTS (width, height, colors, thresholds)
  tuning.ts             -- healthBarTuning schema for Tweakpane
  renderers/
    pixi.ts             -- HealthBar class extending PixiRenderable
```

### Import from game code

```typescript
import { HealthBar, HEALTH_BAR_DEFAULTS } from '~/modules/primitives/health-bar';

const bar = new HealthBar({
  maxHealth: 100,
  currentHealth: 75,
  width: 300,
});
stage.addChild(bar);

// Later, update health
bar.setHealth(42);
```

### Result in Tuning Panel

The health bar automatically appears:

```
+-----------------------------+
| v Modules        (green)   |
|   > Sprite Button           |
|   > Dialogue Box            |
|   > Progress Bar            |
|   > Health Bar     <-- new  |
|   > Level Completion        |
+-----------------------------+
```

---

## Reference: Existing Module Examples

Use these as templates when writing your own modules:

| Pattern | Example Module | Key File |
|---------|---------------|----------|
| Primitive (visual) | sprite-button | `src/modules/primitives/sprite-button/` |
| Primitive (defaults) | sprite-button | `src/modules/primitives/sprite-button/defaults.ts` |
| Primitive (tuning) | sprite-button | `src/modules/primitives/sprite-button/tuning.ts` |
| Logic (factory) | progress | `src/modules/logic/progress/index.ts` |
| Logic (state machine) | level-completion | `src/modules/logic/level-completion/index.ts` |
| Logic (fetch pipeline) | loader | `src/modules/logic/loader/index.ts` |
| Prefab (composed) | avatar-popup | `src/modules/prefabs/avatar-popup/` |

---

## Related Documentation

- [Module System Overview](./index.md) -- Architecture, categories, and inventory
