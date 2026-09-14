# Best Practices

Rules for building games in this project. Read before writing code. For anti-patterns and common mistakes, see [guardrails.md](guardrails.md).

---

## Naming Conventions

### Files

| Type | Convention | Example |
|------|-----------|---------|
| Source files | `kebab-case.ts` | `sprite-button.ts`, `game-controller.ts` |
| Component files | `PascalCase.tsx` | `GameScreen.tsx`, `LoadingScreen.tsx` |
| Type/interface files | `kebab-case.ts` | `types.ts`, `defaults.ts` |
| Test files | `*.test.ts` | `progress.test.ts` |
| Module folders | `kebab-case/` | `sprite-button/`, `level-completion/` |
| Asset files | `{category}-{name}[_{variant}].{ext}` | `piece-dot.png`, `ui-button_play.png` |

See [naming-convention.md](../guides/naming-convention.md) for the full asset naming spec.

### Code

| Type | Convention | Example |
|------|-----------|---------|
| Classes | `PascalCase` | `SpriteButton`, `GameAudioManager` |
| Interfaces/Types | `PascalCase` | `GameTuning`, `SoundDefinition` |
| Functions | `camelCase` | `createProgressService()`, `loadBundle()` |
| Factory functions | `create*()` | `createCatalogService()`, `createContentLoader()` |
| Constants | `UPPER_SNAKE_CASE` | `GAME_DEFAULTS`, `SOUND_CLICK` |
| Signals | `camelCase` | `score()`, `currentLevel()` |
| Hooks | `use*()` | `useTuning()`, `useAssets()` |
| Event handlers | `on*` / `handle*` | `onTileRotated`, `handleResize` |
| Boolean variables | `is*` / `has*` / `should*` | `isPlaying`, `hasProgress` |

---

## Rendering Pipeline

All gameplay renders on the GPU via **Canvas/WebGL/WebGPU** — never DOM.

| Layer | Renderer | What goes here |
|-------|----------|---------------|
| **GPU canvas** | Pixi.js (or Phaser/Three.js) | All game visuals: sprites, tiles, particles, text, shapes, VFX |
| **DOM overlay** | Solid.js | Screen shells (loading, start, results), settings menu, dev tools |

Pixi auto-negotiates the best backend: **WebGPU → WebGL 2 → WebGL 1 → Canvas 2D**. You don't choose — Pixi picks the fastest available on the device.

### Renderer commitment

The renderer is declared once in `src/core/config.ts`:

```typescript
engine: 'pixi'  // 'pixi' | 'phaser' | 'three'
```

This is set at project kickoff and never changed. One renderer per game. No mixing Pixi + Phaser, no second `<canvas>`, no raw Canvas 2D API alongside the renderer.

### What's DOM vs what's GPU

| Element | Where | Why |
|---------|-------|-----|
| Loading screen, start screen, results | DOM (Solid.js) | Needs HTML/CSS layout, accessibility, fonts before GPU init |
| Settings menu, pause overlay | DOM (Solid.js) | UI chrome that sits above the game |
| Game board, tiles, sprites, characters | GPU (Pixi) | Performance, batching, scene graph |
| Score, timer, HUD during gameplay | GPU (Pixi) | Must be in the scene graph for consistent rendering |
| Particles, VFX, animations | GPU (Pixi + GSAP) | 60fps requires GPU pipeline |
| Debug tools (TuningPanel) | DOM (Solid.js) | Dev-only, not shipped |

**Rule of thumb:** Once `initGpu()` fires and the game screen is active, everything visible is on the GPU canvas. DOM is for screen shells and menus only.

---

## Project Structure: What to Touch

```
src/
  core/         ← DO NOT EDIT. Framework shell. Managed upstream.
  game/         ← Your game. This is where you work.
    config.ts       ← Game identity, fonts, screen wiring
    state.ts        ← Game state signals (score, level, etc.)
    asset-manifest.ts ← Bundle definitions
    screens/        ← Solid.js screen shells (DOM is OK here)
    mygame/         ← Game logic + Pixi rendering (NO DOM here)
    audio/          ← Sound definitions
    tuning/         ← Live-tunable parameters
```

**`src/core/` is read-only.** It's the scaffold framework. If you need something from core changed, that's a game-components PR.

**Shared modules live upstream in `@wolfgames/components`.** Anything reusable across games belongs in that package, not in local source. Game-specific code stays in `src/game/`. To add a shared module, open a PR in [wolfgames/game-components](https://github.com/wolfgames/game-components).

**`src/game/mygame/` is yours.** Game controllers, engine classes, renderers — all Pixi, all GPU.

---

## Assets

### Where they come from and where they live

Game media is **generated via the wolf-game-kit MCP and served from the CDN
by default** — see [asset-pipeline.md](../recipes/asset-pipeline.md) for the
full generate → stage → publish → load workflow. Compressed sources are
staged in `assets/src/` (gitignored) and published with
`bun run assets:publish` — the committed record is the lockfile
(`assets/asset-manifest.cdn.json`) + `assets/registry.ts`. Game media is
never committed to `public/assets/`.

`public/assets/` holds the committed exceptions — fonts, favicon, VFX config
JSON, small proxy/placeholder art — plus size-budgeted local-mode iteration
assets when you're working without the MCP or iterating rapidly (served at
`/assets/` in dev; moved to the CDN before release).

| File type | Naming convention | Example |
|---|---|---|
| Spritesheet atlas | `{name}.json` + `{name}.png` | `atlas-tiles-mygame.json`, `atlas-tiles-mygame.png` |
| Standalone image | `{descriptive-name}.png` | `tile-blocker-ice-128.png` |
| Audio sprite | `music-{name}.json` + `.mp3`/`.ogg` | `music-mygame-theme.json` |
| VFX atlas | `vfx-{name}.json` + `.png` | `vfx-blast.json`, `vfx-blast.png` |

See [naming-convention.md](../guides/naming-convention.md) for the full naming spec.

### Registering in the manifest

Every asset must be registered in `src/game/asset-manifest.ts` with the correct bundle prefix:

| Prefix | Loader | When to use |
|---|---|---|
| `scene-*` | GPU (Pixi) | Game spritesheets, backgrounds, tiles |
| `core-*` | GPU (Pixi) | In-game UI atlases |
| `fx-*` | GPU (Pixi) | Particles, VFX |
| `audio-*` | Howler | Sound effects, music |
| `theme-*` | DOM only | Branding/logo (pre-GPU loading screen) |
| `boot-*` | DOM only | Splash screen assets |

**Game assets MUST use `scene-*` or `core-*`.** Using `theme-*` for game sprites silently fails — Pixi never sees them.

```typescript
// ✅ Correct — GPU bundle for game sprites
{ name: 'scene-tiles', assets: [{ alias: 'scene-tiles', src: 'atlas-tiles-mygame.json' }] }

// ❌ Wrong — theme prefix won't register with Pixi
{ name: 'theme-tiles', assets: [{ alias: 'theme-tiles', src: 'atlas-tiles-mygame.json' }] }
```

### Using assets in code

```typescript
const gpuLoader = coordinator.getLoader<PixiLoader>('gpu');
const sprite = gpuLoader.createSprite('scene-gems', 'gem_circle');
const texture = gpuLoader.getTexture('scene-gems', 'gem_square');
```

---

## Modules: Use What Exists

Before writing custom rendering code, check the shared module catalog at `node_modules/@wolfgames/components/src/modules/INDEX.md`:

| Module | What it does |
|---|---|
| `PixiRenderable` | Base class — lifecycle (init/tick/resize/destroy), GSAP cleanup |
| `SpriteButton` | Interactive button with hover/press animations |
| `DialogueBox` | 9-slice speech bubble with text |
| `CharacterSprite` | Character from texture atlas |
| `ProgressBar` | Segmented bar with milestones |
| `AvatarPopup` | Avatar + speech bubble popup |
| `LevelCompletion` | State machine: playing → completing → complete |
| `Progress` | localStorage save/load |
| `Catalog` | Ordered content navigation |
| `Loader` | Fetch + transform pipeline |

Every visual module extends `PixiRenderable` and follows this structure:

```
modules/<category>/<name>/
  index.ts          ← Public API
  defaults.ts       ← Config defaults
  tuning.ts         ← Tweakpane schema
  renderers/pixi.ts ← Pixi implementation
```

If it's reusable, make it a module. If it's game-specific, keep it in `mygame/`.

---

## Game Controller Structure

Game controllers grow fast. Break them into focused pieces by responsibility:

```
game/mygame/
├── index.ts                ← Exports setupGame/setupStartScreen
├── GameController.ts       ← Thin orchestrator — wires pieces together
├── input/
│   └── InputHandler.ts     ← Pointer/touch/keyboard routing
├── state/
│   ├── GameState.ts        ← Pure game state + step() function
│   └── StateMachine.ts     ← Phase transitions (idle → playing → complete)
├── systems/
│   ├── ScoreSystem.ts      ← Scoring, combos, multipliers
│   ├── SpawnSystem.ts      ← Entity creation, object pooling
│   └── PhysicsSystem.ts    ← Collision, movement (if needed)
├── renderers/
│   ├── BoardRenderer.ts    ← Board/grid visual layout
│   ├── EntityRenderer.ts   ← Sprite creation, animation triggers
│   └── HudRenderer.ts      ← In-game score, timer, progress
└── animations/
    ├── transitions.ts      ← Screen/level transition sequences
    └── feedback.ts         ← Juice: shake, pop, particles
```

**The rule:** `GameController` should be a short orchestrator that creates systems and wires them together. If it's doing the work itself, extract a system.

| Responsibility | Extract to | Pattern |
|---|---|---|
| Touch/click handling | `InputHandler` | Translates pointer events → game actions |
| Game rules, state transitions | `GameState` / `StateMachine` | Pure functions, no rendering |
| Scoring, combos | `ScoreSystem` | Reads state, computes results |
| Spawning entities | `SpawnSystem` | Object pool + factory |
| Drawing sprites, containers | `*Renderer` | Extends `PixiRenderable`, owns visuals |
| GSAP sequences | `animations/*.ts` | Returns `Promise<void>`, awaitable |

**When to split:** If `GameController` is over ~200 lines, it's doing too much. Each system should be independently testable.

---

## Game Contract

Every game must export two functions from `src/game/mygame/index.ts`:

```typescript
setupGame: (deps: GameControllerDeps) => GameController
setupStartScreen: (deps: StartScreenDeps) => StartScreenController
```

`GameController` must have:
- `init(container: HTMLDivElement)` — mount your Pixi app
- `destroy()` — tear down everything
- `ariaText()` — accessibility text
- `gameMode: 'pixi'` — tells scaffold to init GPU

See `src/game/mygame-contract.ts` for the full types.

---

## Animation

Use **GSAP** for all animation. It auto-cleans on `PixiRenderable.destroy()`.

```typescript
// Move
gsap.to(sprite, { x: 100, y: 200, duration: 0.3, ease: 'power2.out' });

// Scale punch
gsap.fromTo(sprite.scale, { x: 1.2, y: 0.8 }, { x: 1, y: 1, duration: 0.15 });

// Sequence
gsap.to(sprite, { alpha: 0, duration: 0.2, onComplete: () => sprite.destroy() });
```

See [animation-cookbook.md](../guides/animation-cookbook.md) for more patterns.
