# Architecture

The Amino 3-tier architecture: **core** (reusable platform), **modules** (shared building blocks), and **game** (specific implementation).

---

## Why Three Tiers?

The architecture solves: **how do you build many games without rebuilding infrastructure each time?**

| Layer | Rate of change | Purpose |
|-------|---------------|---------|
| **Core** (`src/core/`) | Almost never | Runtime infrastructure every game needs |
| **Modules** (`@wolfgames/components`) | Per package release | Reusable building blocks shared across games — shipped via the npm package, not local source |
| **Game** (`src/game/`) | Constantly | Domain-specific logic, content, and configuration |

### Dependency Rules

Dependencies only flow downward. Enforced by convention, not tooling.

```
core/    → no deps on @wolfgames/components or game/
modules  → live upstream in @wolfgames/components, consumed via package imports
game/    → can import from core/ + @wolfgames/components
app.tsx  → wires everything (core + components + game)
```

---

## Architecture Diagram

```
                                    ┌─────────────────┐
                                    │     app.tsx      │
                                    └────────┬────────┘
                                             │
        ┌────────────────────────────────────┼────────────────────────────────────┐
        ▼                                    ▼                                    ▼
┌─────────────────────────┐  ┌─────────────────────────────┐  ┌────────────────────────────┐
│  CORE  (src/core/)      │  │  MODULES                    │  │  GAME  (src/game/)         │
│                         │  │  (@wolfgames/components)    │  │                            │
│  DO NOT EDIT             │  │                             │  │                            │
│                         │  │  Primitives:                │  │  Config:                   │
│  Providers:             │  │    sprite-button            │  │    identity, manifest,     │
│    GlobalBoundary       │  │    dialogue-box             │  │    config, state, tuning   │
│    TuningProvider       │  │    character-sprite         │  │                            │
│    PauseProvider        │  │    progress-bar             │  │  Screens:                  │
│    ManifestProvider     │  │                             │  │    Loading → Start →       │
│    AssetProvider        │  │  Logic:                     │  │    Game → Results          │
│    ScreenProvider       │  │    level-completion         │  │                            │
│    AudioProvider        │  │    progress (factory)       │  │  Audio:                    │
│                         │  │    catalog (factory)        │  │    GameAudioManager        │
│  Systems:               │  │    loader (factory)         │  │                            │
│    Assets, Screens,     │  │                             │  │  Game Logic:               │
│    Tuning, Audio,       │  │  Prefabs:                   │  │    mygame/                 │
│    Errors, Pause, VFX   │  │    avatar-popup             │  │                            │
└─────────────────────────┘  └─────────────────────────────┘  └────────────────────────────┘
         ▲                              ▲         │                    │         │
         │           can import ────────┘         │   can import ─────┘         │
         │              can import ────────────────┘                             │
         │                                              can import ──────────────┘
         └── ZERO dependencies on modules/ or game/
```

---

## Provider Initialization Order

The provider stack in `app.tsx` is a **dependency-ordered initialization sequence**. Changing the order can break the application.

```
Position  Provider               Tier    Rationale
────────  ────────────────────   ─────   ──────────────────────────────────────────
1         GlobalBoundary         Core    Must wrap everything to catch errors
2         TuningProvider         Core    All systems below may read tuning values
3         AnalyticsProvider      Game    Needs tuning; must be above screens
4         FeatureFlagProvider    Game    May depend on analytics context
5         ViewportModeWrapper    Core    Reads viewport tuning
6         PauseProvider          Core    Available during data loading
7         ManifestProvider       Core    Resolves game data (CDN/local/inject)
8         AssetProvider          Core    Depends on manifest for bundle loading
9         ScreenProvider         Core    Depends on all above providers
10        ScreenRenderer         Core    Renders the current screen component
```

### Hook Availability

| Hook | Description | Available Below |
|------|-------------|-----------------|
| `useTuning<S,G>()` | Typed config access | TuningProvider |
| `useManifest()` | Game data and manifest | ManifestProvider |
| `useAssets()` | Asset coordinator | AssetProvider |
| `useScreen()` | Navigation | ScreenProvider |
| `usePause()` | Pause state | PauseProvider |
| `useAudio()` | Volume controls | AudioProvider |
| `useAnalytics()` | Event tracking | AnalyticsProvider |
| `useFeatureFlags()` | Feature flags | FeatureFlagProvider |

---

## Cross-Tier Contracts

### Game → Core (what game must provide)

- **`gameConfig.screens`** — `Record<ScreenId, Component>` — screen components
- **`gameConfig.initialScreen`** — `ScreenId` — starting screen
- **`manifest`** — `Manifest` — asset bundle definitions
- **`defaultGameData`** — initial game state shape
- **`GAME_DEFAULTS`** — extends `GameTuningBase` — tuning schema + defaults
- **`AnalyticsProvider`** — PostHog wrapper
- **`FeatureFlagProvider`** — feature flag wrapper

### Core → Game (what core guarantees)

- **`useTuning<S, G>()`** — Reactive scaffold + game config with persistence
- **`useManifest()`** — Game data resolution (postMessage > CDN > local)
- **`useAssets()`** — Asset loading, GPU init, audio unlock
- **`useScreen()`** — Screen navigation with transitions
- **`usePause()`** — Global pause state (spacebar, visibility)
- **`useAudio()`** — Volume/mute settings with localStorage persistence
- Error isolation via `GlobalBoundary`
- Tuning persistence: URL > runtime > localStorage > JSON > defaults

### Modules → Game (what modules guarantee)

- **Primitives** — `PIXI.Container` subclass, config-driven, no hardcoded game values
- **Logic** — `create*()` factory returning typed interface
- **Prefabs** — composed containers, may use primitives internally

---

## Extension Rules

### Adding a Core system

Must satisfy ALL of: (1) every game needs it, (2) zero game knowledge, (3) provider + hook pattern.

```
core/systems/<system-name>/
├── types.ts       # TypeScript interfaces
├── state.ts       # createSignal() / createStore()
├── context.tsx     # Provider + useXxx() hook
└── index.ts        # Public exports
```

### Adding a Module

```
Is it a visual component?
├── YES → Composed of other modules? → prefab (modules/prefabs/<name>/)
│                                    → primitive (modules/primitives/<name>/)
└── NO → Pure logic? → logic (modules/logic/<name>/)
```

**Visual module structure:**
```
modules/<category>/<name>/
├── renderers/pixi.ts   # PIXI.Container subclass
├── defaults.ts          # Default config values
├── tuning.ts            # Tweakpane bindings (green section)
└── index.ts             # Public exports
```

**Inter-category rules:**
- Primitives must NOT import from other primitives
- Prefabs CAN import from primitives
- Logic modules must NOT import from primitives or prefabs
- All modules CAN import from core

### Adding a game mode

```
game/<mode-name>/
├── core/          # Main game classes (PIXI.Container subclasses)
├── controllers/   # Input, state machines
├── types/         # Type definitions
├── data/          # Static game data
└── animations/    # GSAP animation sequences
```

---

## Component Taxonomy

| Term | Renders to | Location | Example |
|------|-----------|----------|---------|
| **Solid.js component** | DOM | `game/screens/`, `core/ui/` | `LoadingScreen`, `Button` |
| **Pixi container** | GPU canvas | `modules/*/renderers/`, `game/<mode>/` | `SpriteButton`, `ProgressBar` |
| **Logic factory** | Nothing (headless) | `modules/logic/`, `game/<mode>/` | `createProgressService()` |

| Need | Use |
|------|-----|
| Full-screen UI with HTML/CSS | Solid.js component |
| In-game visual element | Pixi container |
| Reusable behavior without visuals | Logic factory |
| Game HUD overlaying Pixi canvas | Solid.js component with absolute positioning |
| Game state (score, board, phase, bodies) | ECS — see below |

> **Signals here are core *infrastructure* state** (pause, audio volume, screen
> nav) — not game state. Game state lives in the app-scoped ECS world
> (`src/game/mygame/ecs/`, held by `world.ts`): ECS is the single source of
> truth, DOM screens read it, and signals are only a DOM bridge for JSX.
> See [../guides/state-architecture.md](../guides/state-architecture.md).

---

## Known Debt: `ScreenId`

`ScreenId` is hardcoded in core as `'loading' | 'start' | 'game' | 'results'`. This violates core's "zero game knowledge" principle. All games must provide exactly these four screens.
