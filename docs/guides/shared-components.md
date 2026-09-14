# Reusable Modules Guide

How to use shared building blocks from `@wolfgames/components`.

> **Modules now live upstream.** Shared primitives, prefabs, and logic ship via the `@wolfgames/components` npm package — they are no longer in this repo's `src/modules/`. Import them as `@wolfgames/components/modules/<category>/<name>`. The full catalog is at `node_modules/@wolfgames/components/src/modules/catalog.json` (fallback: `INDEX.md` next to it).
>
> **To add or modify a shared module**, open a PR in [wolfgames/game-components](https://github.com/wolfgames/game-components), release a new version, and bump the dep here. For dev iteration without publishing, use the `VITE_COMPONENTS_LOCAL=1 VITE_COMPONENTS_SOURCE=1` toggles documented in [`.env.example`](../../.env.example).
>
> The rest of this guide describes the structure and contract that applies to shared modules in the upstream repo (and to game-specific composition here).

> **Design authority**: See [architecture.md](../core/architecture.md) for tier definitions, contracts, and extension rules.

---

## The Three Tiers

```
src/core/                    Platform infrastructure (DO NOT EDIT)
                                 Hooks, providers, asset loading, audio base, viewport config

@wolfgames/components        Reusable building blocks (GAME-AGNOSTIC, lives upstream)
  modules/primitives/            Single-purpose visual components (PIXI.Container)
  modules/logic/                 Pure logic factories (no rendering)
  modules/prefabs/               Composed from primitives
  modules/dom/                   Solid screen shells

src/game/                    Game-specific code (VOLATILE — replaced when forking)
  [gamename]/                    Game logic, screens, audio, config
```

### The required catalog check

Triggers on the artifact, not the word "component": any HUD, button, menu,
screen, background, popup, progress bar, timer, overlay, dialogue box, or
character display starts with this check, and the task output states which
modules were considered and why none fit before any new code.

1. Read `node_modules/@wolfgames/components/src/modules/catalog.json` — one
   record per module (~80) with `surface`, `tags`, `oneLineDescription`,
   `packageImport` and `readmePath`. Older packages only ship `INDEX.md`
   next to it; read that instead.
2. Read the closest matches' `README.md` (`readmePath`): usage, config
   table, variants. Check `surface` against where the code will live.
3. Fallback: `grep -Ri "<keywords>" node_modules/@wolfgames/components/src/modules/`,
   or run the `amino-component-discovery` skill.

A PreToolUse gate enforces this in Claude Code: the first write that adds a
Pixi/DOM construction or a new screen under `src/game/` is blocked until the
catalog has been read, or the code carries
`// catalog: considered <id>, <id> — none fit: <reason>`.

### Where Does My Code Go?

```
Is it game logic specific to one game?
  YES → src/game/[gamename]/

Does an upstream module already cover it (check the catalog above)?
  YES → import it; wrap with game config in src/game/[gamename]/ if needed

Is it a genuinely new, game-agnostic pattern?
  YES → follow the component-authoring flow: incubate here, promote to
        wolfgames/game-components once a second game needs it (see
        "Adding a New Module" below)

Is it a framework-level concern (asset loading, screen routing, audio engine)?
  YES → src/core/ (requires admin mode)
```

### Decision Examples

| Component | Where | Why |
|-----------|-------|-----|
| Button with hover/press animations | `modules/primitives/sprite-button/` | Every game needs interactive buttons |
| Progress bar with milestone dots | `modules/primitives/progress-bar/` | Generic UI, font passed as param |
| Character sprite container | `modules/primitives/character-sprite/` | Generic pattern, sprite map passed as config |
| Avatar circle + speech bubble popup | `modules/prefabs/avatar-popup/` | Composes character-sprite + dialogue-box |
| Level completion state machine | `modules/logic/level-completion/` | Every game has completion flow |
| Progress persistence service | `modules/logic/progress/` | Every game needs save/load |
| Road tile rotation logic | `game/[gamename]/` | Game-specific puzzle mechanic |
| Chapter generation service | `game/[gamename]/` | Game-specific content pipeline |

### Rules

1. **Modules never import from `game/`** — they accept config through constructor params or factory config
2. **Primitives are independent** — they don't import from other primitives
3. **Prefabs compose primitives** — that's their purpose
4. **Logic modules use factory pattern** — `create*()` returns a typed interface
5. **All game-specific values are parameters** — atlas names, fonts, colors, sprite maps

---

## Module Catalog

### Primitives

#### SpriteButton

Interactive Pixi button with hover/press GSAP animations, optional text label, 9-slice support.

**Import:** `import { SpriteButton } from '@wolfgames/components/modules/primitives/sprite-button'`

**Usage:**
```typescript
const btn = new SpriteButton(gpuLoader, {
  atlasName: 'my_atlas',
  spriteName: 'button.png',
  label: 'Play',
  onClick: () => goto('game'),
  use9Slice: true,
  nineSliceBorders: { leftWidth: 12, topHeight: 12, rightWidth: 12, bottomHeight: 12 },
});
```

**Game wrapper needed?** No — fully config-driven, use directly.

---

#### ProgressBar

Animated progress bar with milestone dots, smooth fill animation, optional label.

**Import:** `import { ProgressBar } from '@wolfgames/components/modules/primitives/progress-bar'`

**Config params:**
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `width` | `number` | `280` | Bar width in pixels |
| `height` | `number` | `36` | Bar height in pixels |
| `fontFamily` | `string` | `'sans-serif'` | Font for label text |
| `themeColor` | `number` | `0x27ae60` | Fill color |
| `showLabel` | `boolean` | `true` | Show "3 / 10" label |

**Usage:**
```typescript
const bar = new ProgressBar(gpuLoader, atlasName, {
  width: 320,
  height: 36,
  fontFamily: GAME_FONT_FAMILY,
  themeColor: 0x007eff,
});
bar.setProgress(3, 10);       // 3 of 10 complete, animated
bar.setProgress(3, 10, false); // instant (no animation)
bar.setTheme(0xff0000);       // change fill color
```

**Game wrapper needed?** Optional — can pass `fontFamily` directly or create a wrapper.

---

#### CharacterSprite

Generic character sprite container with configurable type mapping and base size.

**Import:** `import { CharacterSprite } from '@wolfgames/components/modules/primitives/character-sprite'`

**Config params:**
| Param | Type | Notes |
|-------|------|-------|
| `type` | `T extends string` | Character identifier |
| `spriteMap` | `Record<T, string>` | Type → sprite frame name |
| `atlasName` | `string` | Texture atlas name |
| `baseSize` | `{ width, height }` | Base sprite dimensions for scaling |

**Game wrapper pattern:**
```typescript
// src/game/mygame/core/MyCharacter.ts
import { CharacterSprite } from '@wolfgames/components/modules/primitives/character-sprite';

type MyCharacterType = 'hero' | 'sidekick';

export class MyCharacter extends CharacterSprite<MyCharacterType> {
  constructor(type: MyCharacterType, gpuLoader: PixiLoader, scale = 1) {
    super(gpuLoader, {
      type,
      spriteMap: { hero: 'hero.png', sidekick: 'sidekick.png' },
      atlasName: getAtlasName(),
      baseSize: { width: 200, height: 220 },
    }, scale);
  }
}
```

**Game wrapper needed?** Yes — you need to provide your character types and sprite mapping.

---

#### DialogueBox

9-slice sprite dialogue box with auto-sizing text, responsive positioning.

**Import:** `import { DialogueBox } from '@wolfgames/components/modules/primitives/dialogue-box'`

**Config params:**
| Param | Type | Notes |
|-------|------|-------|
| `atlasName` | `string` | Texture atlas |
| `spriteName` | `string` | 9-slice sprite frame (e.g. `'dialogue.png'`) |
| `fontFamily` | `string` | Font for text content |
| `positioning` | `DialogueBoxPositioning` | Bottom padding, max width, width % |

**Game wrapper pattern:**
```typescript
// src/game/mygame/ui/MyDialogueBox.ts
import { DialogueBox as SharedDialogueBox } from '@wolfgames/components/modules/primitives/dialogue-box';

export class MyDialogueBox extends SharedDialogueBox {
  constructor(gpuLoader: PixiLoader, screenWidth: number, screenHeight: number) {
    super(gpuLoader, {
      atlasName: 'my_atlas',
      spriteName: 'speech_bubble.png',
      fontFamily: MY_FONT,
      positioning: { dialogueBottomPadding: 40, dialogueMaxWidth: 600, dialogueWidthPercent: 0.9 },
    }, screenWidth, screenHeight);
  }
}
```

**Game wrapper needed?** Yes — needs atlas, sprite, font, and positioning config.

---

### Prefabs

#### AvatarPopup

Circular character avatar with speech bubble popup. Auto-dismisses on timer or tap. GSAP animations. Composes CharacterSprite and DialogueBox primitives.

**Import:** `import { AvatarPopup } from '@wolfgames/components/modules/prefabs/avatar-popup'`

**Config params:**
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `atlasName` | `string` | — | Texture atlas |
| `characterSpriteName` | `string` | — | Character sprite frame |
| `dialogueSpriteName` | `string` | — | Dialogue 9-slice sprite frame |
| `characterBaseSize` | `{ width, height }` | — | For head-crop scaling |
| `fontFamily` | `string` | `'sans-serif'` | Text font |
| `circleSize` | `number` | `64` | Avatar circle diameter |
| `dialogWidth` | `number` | `280` | Speech bubble width |

**Game wrapper pattern:**
```typescript
export class MyPopup extends AvatarPopup {
  constructor(gpuLoader: PixiLoader) {
    super(gpuLoader, {
      atlasName: 'my_atlas',
      characterSpriteName: 'npc_head.png',
      dialogueSpriteName: 'bubble.png',
      characterBaseSize: { width: 200, height: 220 },
      fontFamily: MY_FONT,
    });
  }
}
```

**Game wrapper needed?** Yes — needs character sprite and atlas config.

---

### Logic Modules

#### LevelCompletionController

State machine for level completion flow: `playing → completing → complete`. Event-driven, configurable timers.

**Import:** `import { createLevelCompletionController } from '@wolfgames/components/modules/logic/level-completion'`

**Usage:**
```typescript
const controller = createLevelCompletionController({
  events: {
    onCompletionStart: (clue, levelNumber) => showOverlay(clue),
    onClueTimerEnd: () => showContinueButton(),
    onCompletionEnd: () => loadNextLevel(),
    onLevelComplete: ({ levelId, moves, durationMs }) => trackAnalytics(levelId),
  },
  celebrationDuration: 500,
  clueDuration: 3000,
});

controller.startCompletion(levelId, moveCount, elapsedMs, clueText);
controller.continue();
controller.reset();
```

**Game wrapper needed?** No — fully config-driven via events object.

---

#### Progress Service

Versioned localStorage persistence with typed progress shapes.

**Import:** `import { createProgressService } from '@wolfgames/components/modules/logic/progress'`

**Usage:**
```typescript
const progress = createProgressService<MyProgress>({
  key: 'mygame_progress',
  version: 1,
  defaults: { version: 1, score: 0, level: 1 },
});

progress.load();
progress.save({ ...data });
progress.clear();
```

---

#### Catalog Service

Ordered content navigation (chapters, levels, etc.).

**Import:** `import { createCatalogService } from '@wolfgames/components/modules/logic/catalog'`

**Usage:**
```typescript
const catalog = createCatalogService<ChapterEntry>({
  fetchIndex: () => fetch('/api/chapters').then(r => r.json()),
  fallbackEntries: [{ id: 'fallback', url: 'default.json' }],
});

await catalog.init();
catalog.current();
catalog.next();
```

---

#### Content Loader

Typed fetch + transform pipeline.

**Import:** `import { createContentLoader } from '@wolfgames/components/modules/logic/loader'`

---

## New Game Integration Checklist

When starting a new game, go through each module and decide whether to adopt it:

### Required Setup

- [ ] Create `src/game/config/fonts.ts` with `GAME_FONT_FAMILY`
- [ ] Prepare sprite atlas with UI sprites (buttons, dialogue boxes, etc.)

### Module Adoption

| Module | Need It? | Action |
|--------|----------|--------|
| **SpriteButton** | Any interactive buttons in Pixi? | Use directly, pass atlas + sprite name |
| **ProgressBar** | Show level/chapter progress? | Use directly or wrap, pass `fontFamily` |
| **CharacterSprite** | Display character sprites? | Create wrapper with your character types and sprite map |
| **DialogueBox** | In-game dialogue or text popups? | Create wrapper with your atlas, font, positioning |
| **AvatarPopup** | Character head + speech bubble? | Create wrapper with your character sprite config |
| **LevelCompletionController** | Level-based game with completion flow? | Use directly, wire your events |
| **Progress Service** | Save/load game progress? | Use directly with your progress type |
| **Catalog Service** | Navigate ordered content? | Use directly with your entry type |
| **Content Loader** | Fetch + transform remote data? | Use directly with your types |

### Wrapper Template

For visual modules that need a game wrapper:

```typescript
// src/game/[gamename]/ui/MyComponent.ts
import { SharedComponent } from '@wolfgames/components/modules/primitives/shared-component';
import type { PixiLoader } from '~/core/systems/assets';
import { GAME_FONT_FAMILY } from '~/game/config/fonts';

export class MyComponent extends SharedComponent {
  constructor(gpuLoader: PixiLoader) {
    super(gpuLoader, {
      atlasName: getAtlasName(),
      fontFamily: GAME_FONT_FAMILY,
      // ... other game config
    });
  }
}
```

---

## Adding a New Module

### When to Create One

Create a module when:
- You're building something the next game would also need
- The component has zero game-specific imports (or can be parameterized to remove them)
- It's a UI pattern (buttons, popups, progress indicators) or a game flow pattern (completion, scoring)

### Step-by-Step

New shared modules are authored in the
[wolfgames/game-components](https://github.com/wolfgames/game-components)
repo, not here — this repo no longer has a `src/modules/` tier. The flow
(cortex `component-authoring` rule has the full version):

1. **Incubate in your game** — build it under `src/game/[gamename]/` with the
   standard module shape (`index.ts`, `defaults.ts`, `tuning.ts`,
   `renderers/pixi.ts`), keeping game-specific values as config params.
2. **Promote when a second game needs it** — open a PR in game-components
   moving it to `src/modules/<category>/<name>/`, run `bun run sync:manifests`
   there (generates `component.manifest.yml`), release, and bump the dep here.
3. For dev iteration against a local game-components checkout, use the
   `VITE_COMPONENTS_LOCAL=1` / `VITE_COMPONENTS_SOURCE=1` toggles from
   [`.env.example`](../../.env.example).

### Naming Conventions

| Type | Location | Naming |
|------|----------|--------|
| Visual primitive | `modules/primitives/<kebab-case>/` | Generic name (`sprite-button`, not `city-button`) |
| Visual prefab | `modules/prefabs/<kebab-case>/` | Generic name (`avatar-popup`) |
| Logic module | `modules/logic/<kebab-case>/` | Generic name (`level-completion`) |
| Game wrapper | `game/[gamename]/core/` or `game/[gamename]/ui/` | Game-specific name (`Character`, `CluePopup`) |
| Config interface | Same file as component | `ComponentNameConfig` |

---

## Related

- [Architecture (design authority)](../core/architecture.md) — Tier contracts and extension rules
- [Writing a Module](../modules/writing-a-module.md) — Detailed module authoring guide
- [Animation Cookbook](animation-cookbook.md) — GSAP patterns used by modules
