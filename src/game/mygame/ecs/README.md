# mygame × Adobe ECS (`@adobe/data`)

The game's runtime state is an `@adobe/data` ECS database: observable,
Inspector-visible, agent-drivable, and headlessly testable. This game is a
**Zuma-style bubble shooter** — a chain of coloured balls marches along a fixed
spiral toward a central door; a cannon fires balls into the chain, three-or-more
of a colour pop. Because the chain moves **every frame with no input**, this is a
**real-time** game: it runs the per-frame schedule, not the turn-based path.

```
 REAL-TIME (this game)
 engine.onFrame(realDt) → startFixedStepLoop → stepWorld(db, FIXED_DT)
                                                 │  advanceTime({dt}); run SYSTEM_ORDER
   pointer → submitFire({angle})   ────────────▶│  (inputSystem drains pendingFires → fire)
                ┌────────────────── @adobe/data ECS database ──────────────────┐
 pure systems   │  resources:  score · phase · won · headT · speed · chainCount │
 (systems/*)    │              level · colorsInLevel · elapsedMs · frameDeltaMs │
      ▲         │              rng · hopperCurrent · hopperNext · pendingFires  │
      │snapshot │  entities:   Ball (chainIndex, color, position, spriteKey)    │
      │         │              Projectile (color, position, velocity, spriteKey)│
      │         │  transactions: startLevel · advanceChain · fire · insertBall ·│
      │         │                popRange · advanceProjectiles · submitFire · … │
 readStateFromEcs└────▲────────────────────────────┬───────────────────────────┘
      │               │                            │ db.observe.resources.* / .resources.*
 readChain /          │                            ▼
 readProjectiles      │                       DOM screens read ECS directly
   (snapshots)        │                       setActiveDb(db)  → Inspector (dev)
```

The world is **app-scoped** (`world.ts` → `getGameWorld()`): it outlives any one
screen, so the results screen reads the final score straight from ECS. There is
no signals "clipboard" — ECS is the single source of truth.

## Cadence: real-time, fixed-timestep

The chain advances continuously, so the engine clock drives `stepWorld(db, dt)`
each frame: it injects `dt` (`advanceTime`) then runs `SYSTEM_ORDER`. Input is
modelled as **intent** — the renderer queues a `pendingFires` shot (`submitFire`) that
`inputSystem` drains next step and resolves via the `fire` transaction, keeping
input on the deterministic timeline.

### Fixed timestep — feed the sim a constant `dt`

Continuous integration (the chain march, projectile motion) is only stable and
**deterministic** at a *fixed* `dt`. Don't pass raw frame deltas into
`stepWorld`. Accumulate real time and spend it in fixed steps — the classic "Fix
Your Timestep" accumulator, in `engine/fixedStep.ts`:

```ts
const engine = createTickerEngine();
const stopSim = startFixedStepLoop(engine, (dt) => stepWorld(db, dt));
const stopRender = engine.onFrame(() => render()); // paint latest ECS state
```

This decouples sim rate from framerate (60fps and 144fps agree), caps catch-up
after a stall (spiral-of-death guard), and keeps `stepWorld(db, FIXED_DT)`
replayable in a headless test — the same reason the whole sim stays testable
(see `tests/unit/schedule.test.ts`).

## The rectangular spiral path

`bubble/path.ts` builds a **rectangular** spiral of exactly two loops (`LOOPS`)
from orthogonal corner points, then dives to a door opening just above the
centre. It's stored as a polyline with cumulative arc length. Distance along it
is a single scalar `t`: `t = 0` is the ENTRY (outer top-left corner),
`t = PATH_LENGTH` is the DOOR (near centre; the chain is lost if the front
reaches it). Ball `i`'s position is `posAt(headT − i·BALL_SPACING)` — one `headT`
resource drives the entire chain, so the march is a single scalar advance per
step. The renderer strokes the same `PATH_POINTS`, so the groove on screen is
exactly the line the balls travel.

## Insert & pop (slip-back)

A shot inserts at the nearest seam (`collisionSystem` → `insertBall`), which
renumbers trailing `chainIndex`es by +1 and reprojects every ball from `headT`.
`popRange` deletes a run, renumbers the survivors, **and drops `headT` by the run
length** so the whole chain slips back toward the entry — recoiling into the
balls still coming in — then reprojects. Scores `count · POINTS`. Both keep
position a pure function of `headT`+`chainIndex`; the renderer eases each ball
view toward its new slot, so the shift and the slip-back animate. Matches cascade
only at the newly-formed adjacency, so pre-existing runs elsewhere are left alone
(true Zuma behaviour). Clearing the chain wins; `headT ≥ PATH_LENGTH` loses.

## Files

| File | Role |
|------|------|
| `gamePlugin.ts` | The data model: components, resources, archetypes, computed, all transactions + `createGameWorld()`. |
| `readStateFromEcs.ts` | Structural adapter: `readChain` (balls, front→back), `readProjectiles`, and `readStateFromEcs` (full `GameSnapshot`) for systems, the renderer, and tests. |
| `schedule.ts` | `stepWorld(db, dt)` — the per-frame tick: inject `dt` via `advanceTime`, then run every system in `SYSTEM_ORDER`. |
| `systems/` | Per-frame systems (`db => void`) + `SYSTEM_ORDER`: `inputSystem` → `projectileSystem` → `chainSystem` → `collisionSystem`. |
| `../bubble/` | Pure, framework-free sim constants (`config.ts`), the spiral (`path.ts`), the seeded LCG (`rng.ts`), and the difficulty ramp (`levels.ts`). No Pixi. |
| `../engine/` | The engine seam: `EngineHandle` (`onFrame`/`destroy`), `createTickerEngine()` (gsap.ticker clock), and `startFixedStepLoop` / `planFixedSteps` (`fixedStep.ts`). Swap the clock for a Pixi/Three/Phaser one without touching the sim. |
| `../world.ts` | `getGameWorld()` — the app-scoped world singleton (owns `setActiveDb`). Screens and the controller read it; they never create/destroy it. |
| `agentPlugin.ts` | `gameAgentPlugin` + `createGameAgentWorld()` — an `AgenticService` exposing states (phase, score, chain, hopper) + the conditional `fire`/`start` actions for bots/tests/MCP. |

> `SYSTEM_ORDER` is a flat list — the simplest correct ordering, and all this
> game needs. Order is contract: `collisionSystem` runs last so it sees the fresh
> positions the projectile and chain systems wrote this step. Plugin property
> order is runtime-enforced (wrong order throws): `imports` → `extends` →
> `services` → `components` → `resources` → `archetypes` → `indexes` →
> `computed` → `transactions` → `actions` → `systems`.

## Invariants

- **Write only via transactions.** Nothing mutates entities or resources
  directly; systems compose transactions.
- **ONE source of truth: ECS.** No signals clipboard. DOM screens read ECS
  directly (`getGameWorld().resources.*` or a resource observable); game logic
  writes ECS via transactions. One copy, one write path.
- **Deterministic.** No `Math.random()` / `Date.now()` inside transactions or
  systems. `dt` and input arrive as injected resources (`frameDeltaMs`,
  `pendingFires`), and colour draws come from a seeded LCG held in the `rng`
  resource — so `stepWorld(db, FIXED_DT)` replays exactly.
- **Input as intent.** The renderer enqueues a `pendingFires` shot (`submitFire`) rather
  than firing directly; `inputSystem` drains it next step via the `fire`
  transaction (which also rolls the hopper from `rng`).
- **Engine-agnostic sim.** The simulation never imports an engine. The clock
  enters through the `EngineHandle` seam (`engine/`); swap `createTickerEngine`
  for a Pixi/Three/Phaser clock without touching ECS. No raw
  `requestAnimationFrame` in game code.
- **Transactions are observable, direct `db.store` writes are not.** Route
  anything the HUD/DOM reacts to (score, phase, chainCount) through
  `db.transactions.*`.
- **Spawn/despawn inside a system iterates archetype rows tail→head**, or spreads
  the selection before deleting (`[...store.select(...)]`) — deleting while
  iterating a live selection skips entities. `startLevel`/`popRange` follow this.
- **World lifetime is app-scoped.** `world.ts` owns it and the Inspector binding;
  a screen unmount tears down the renderer but never the world.
- **Teardown order:** stop the frame loop (`stopSim`/`stopRender`) →
  `engine.destroy()` → kill GSAP tweens → renderer teardown →
  `setActiveInspectorActions([])`. `stepWorld` and the render callback must never
  fire into a destroyed renderer. The world persists.
