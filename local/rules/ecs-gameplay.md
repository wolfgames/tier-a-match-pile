---
description: Gameplay state lives in the ECS database (@adobe/data) — the template ships a pre-wired world
alwaysApply: true
---

# Gameplay: ECS is the source of truth

**Game state lives in the ECS database (`@adobe/data/ecs`), from the first feature.** The template ships a pre-wired, **app-scoped** world in `src/game/mygame/ecs/` (plugin, snapshot adapter, agent surface) held by `src/game/mygame/world.ts` and connected in the game controller — extend it, don't route around it.

The invariants:

- **Write only via transactions** (`db.transactions.*`). Synchronous, deterministic: seeds passed in as args, never `Math.random()`/`Date.now()` inside, no Pixi imports, no DOM reads.
- **Turn logic = plain typed functions**: read state via `readStateFromEcs(db)` → run pure rules → write via transactions → return animation metadata for the controller to animate with GSAP. Prefer plain functions over the plugin `actions:` block — the block is a valid `@adobe/data` pattern, but a shared resolver called from the controller, `inputSystem`, and the agent surface types best as a plain export (the `actions:` generic gives external callers no arg/return typing).
- **ECS is the single source of truth — no signals clipboard.** DOM screens read ECS directly (`getGameWorld().resources.*` or a resource observable); game logic writes ECS via transactions. One copy, one write path.
- **World is app-scoped.** `world.ts` (`getGameWorld()`) owns the world and the `setActiveDb` binding so state survives across screens (the results screen reads the final score from ECS). Lifecycle: init = `getGameWorld()` → `resetGame()` (→ `engine.onFrame(dt => stepWorld(db, dt))` only for real-time games); destroy = (stop frame loop → `engine.destroy()` if used) → renderer teardown → `setActiveInspectorActions([])`. The world persists — a screen unmount never disposes it. Wrong teardown order fires `stepWorld`/observers into destroyed renderers.
- **Match the update cadence to the game — per-frame is supported, not required.**
  - **Turn-based games (tap / match / trivia / ClearPop-style): update ECS only on player interaction.** Resolve the turn synchronously on input via the shared `applyTap` turn function; observers repaint. **No frame loop — do not put a turn-based game on `stepWorld`.** This is the default the template ships.
  - **Real-time / action / physics games: use the per-frame schedule.** The engine clock drives `stepWorld(db, dt)` each frame (`schedule.ts`): `advanceTime({ dt })` then every system in `SYSTEM_ORDER`. Systems are pure `db => void` functions (`ecs/systems/`) — read state, write via transactions, no Pixi/DOM/wall-clock. The scheduler, `systems/`, and engine seam are provided for exactly this — add movement/spawn/timer systems there rather than reaching for raw `requestAnimationFrame`/`setInterval`. The template ships a working example: `movementSystem` (velocity) + `orbitSystem` (orbital rotation) integrating Mover/Orbiter bodies.
- **Feed the sim a *fixed* `dt`.** Continuous integration (velocity, orbit, any physics engine) is only stable and deterministic at a constant step. Don't pass raw frame deltas to `stepWorld` — accumulate real time and spend it in fixed steps via `startFixedStepLoop(engine, dt => stepWorld(db, dt))` (`engine/fixedStep.ts`, the "Fix Your Timestep" accumulator: framerate-independent, spiral-of-death clamp, render `alpha`). Turn-based games don't need it.
- **External physics engines (matter.js, etc.) plug in as one per-frame system**, not a second source of truth: (1) push pending ECS→engine changes, (2) step the engine with the fixed `dt` (`Matter.Engine.update(engine, FIXED_DT)`), (3) write body positions/angles back into ECS components. ECS stays authoritative; the solver is a per-step delegate.
- **Determinism holds either way.** No `Math.random()`/`Date.now()` in transactions, turn functions, or systems. For per-frame games, `dt` and input arrive as injected resources (`frameDeltaMs`, `pendingTap`), so `stepWorld(db, FIXED_DT)` replays exactly in headless tests. For turn-based games, `applyTap(db, {col,row})` is already fully deterministic and headlessly testable.
- **Input as intent (real-time only).** When a game runs a frame loop, the renderer queues a `pendingTap` (`submitIntent`) instead of resolving the turn itself; `inputSystem` drains it next frame via `applyTap`, keeping input on the deterministic timeline. Turn-based games skip the queue and call `applyTap` directly on input.
- **Engine-agnostic sim.** The simulation never imports an engine. When a frame clock is needed, it enters through the `EngineHandle` seam (`engine/`, default `createTickerEngine` over `gsap.ticker`); swap in a Pixi/Three/Phaser clock without touching ECS. No raw `requestAnimationFrame` in game code — go through the engine seam.
- Keep the AgenticService (`agentPlugin.ts`) states/actions current — it is the bot, test, and MCP surface, and the headless regression suite drives the game through it. `applyTap` is the shared turn resolver for input, `inputSystem`, and the agent surface.

Entity conventions: archetypes + F32/I32/Vec2 schemas for numbers, inline `as const` for strings/bools, always include `spriteKey` (Inspector naming). The dev Inspector (backtick) shows the live world; register dev buttons via `setActiveInspectorActions`.

The upstream `@adobe/data` skills (`adobe-data-ai`) do teach the `actions:` block and one-transaction-per-action — the latter to keep undo/redo one step per operation. This template opts out of undo/redo, so multiple transactions per turn function are fine and a shared plain-function resolver is preferred. Where those skills disagree with this rule, this rule and `src/game/mygame/ecs/README.md` win for this repo; everything else in `adobe-data-ai` (systems-only-for-real-time, tail→head row iteration when destroying/migrating, honest typing with no casts) applies as written.

Full guide: `docs/guides/state-architecture.md`.
