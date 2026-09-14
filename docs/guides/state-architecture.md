# State Architecture — Where State Lives and Why

Applicable to any game built on this scaffold; examples below use a generic tile-clearing game ("mygame").

The template ships a pre-wired, **app-scoped** ECS world in `src/game/mygame/ecs/` (plugin, snapshot readers, agent service), held by `src/game/mygame/world.ts` and connected in the game controller. Put state in the plugin from move one — you extend a working world, you don't retrofit one.

> Deep reference for the runtime seam (schedule, systems, engine, fixed-step, matter.js bridge): [`src/game/mygame/ecs/README.md`](../../src/game/mygame/ecs/README.md).

---

## The one rule: ECS is the single source of truth

Game state lives in the `@adobe/data` ECS database. **There is no signals "clipboard."** DOM screens read ECS directly (or through a resource observable); game logic writes ECS through transactions. One copy, one write path.

- **Write:** only via `db.transactions.*`, composed inside turn functions and systems. Synchronous and deterministic — seeds/timestamps passed as args, never `Math.random()`/`Date.now()` inside.
- **Read:** `db.resources.score` (direct) or `db.observe.resources.score(cb)` (reactive). The same observable feeds a SolidJS signal when a DOM screen wants JSX reactivity.
- **Survives across screens:** the world is **app-scoped** (`world.ts` → `getGameWorld()`), so the results screen reads the final score straight from ECS. There is no "gap" to bridge between screens.

**SolidJS signals are a DOM bridge, not a state store.** Mirror an ECS resource into a signal only for JSX reactivity, or hold genuinely un-ECS-able data (deeply nested level config). Never write game state to a signal — write to ECS and let the observable propagate.

---

## Match the update cadence to the game — per-frame is supported, not required

Both cadences write the **same** ECS through the **same** transactions. Pick per piece of state: *does it change when no event occurs?*

| Cadence | Use for | How it updates | Frame loop? |
|---|---|---|---|
| **Turn-based** (default) | tap / match / trivia / card | ECS updates **only on player interaction** — input calls `applyTap(db, {col,row})` synchronously; observers repaint | **No** |
| **Real-time** (opt-in) | action / physics / animation-driven | engine clock drives `stepWorld(db, dt)` → `advanceTime({dt})` → `SYSTEM_ORDER`, fed a **fixed** `dt` | Yes |

**Do not put a turn-based game on a frame loop.** The starter this guide describes is turn-based, so it is event-driven and runs no scheduler. Real-time games opt into the per-frame path documented in [Real-Time Games](#real-time-games--the-per-frame-path) below.

---

## The App-Scoped World (`world.ts`)

`getGameWorld()` returns the one shared `GameDatabase`; it also owns the Inspector binding (`setActiveDb`). Screens and the controller **read** it — they never create or dispose it.

```typescript
// GameController.init()
db = getGameWorld();
db.transactions.resetGame({ cols: 3, rows: 3, moves: 12 });   // start a fresh run
// … observe resources → HUD / aria; register Inspector actions

// GameController.destroy()
// (real-time games first: stop the frame loop → engine.destroy())
unobserve();                       // observers off before the UI dies
setActiveInspectorActions([]);     // clear dev surfaces
// the world PERSISTS — never dispose it here; results screen still reads it
```

`disposeGameWorld()` exists for a full app teardown, not for a screen unmount. The old per-screen "create DB in init / destroy in destroy" model — and the signals clipboard that bridged the gap between them — is gone.

---

## Decision Table

| State | Where | Why |
|-------|-------|-----|
| Score, moves, level, stars, phase | ECS resource | Source of truth, Inspector visible, observable |
| Board cells (blocks, obstacles, powerups) | ECS entities | Source of truth, Inspector shows every cell |
| Velocity, angle, orbit (real-time bodies) | ECS components | Integrated per frame by systems (see below) |
| Stars, blocker count | ECS computed | Derived from score / entity counts |
| Coins, lives (meta-progression) | ECS resource | Survives across screens via the app-scoped world |
| Level config (complex nested object) | SolidJS signal / store | Too complex for ECS schemas; DOM reads it |
| RNG state | Closure variable | Stateful, unobservable, passed into turn functions/systems as a seed |
| Board copy during animation | Closure variable | Ephemeral working copy while GSAP animates |

---

## Plugin Structure

The plugin is the single definition of what exists in the game world. Properties **must** appear in this exact order (runtime-enforced — wrong order throws): `imports` → `extends` → `services` → `components` → `resources` → `archetypes` → `indexes` → `computed` → `transactions` → `actions` → `systems`. Most games use only a handful; `imports` (the deep-`combine` typing escape hatch) and `indexes` (sorted/filtered entity queries) are optional but keep their slots when present.

```typescript
const gamePlugin = Database.Plugin.create({
  components: { ... },     // per-entity data (position, velocity, spriteKey, …)
  resources: { ... },      // global state (score, moves, phase, elapsedMs, frameDeltaMs, pendingTap)
  archetypes: { ... },     // entity templates (Tile; Mover/Orbiter for real-time)
  computed: {
    stars: ...,            // derived from score + thresholds
  },
  transactions: {
    resetGame: ...,        // start/restart a run
    addScore: ...,         // resource mutations
    advanceTime: ...,      // inject dt (real-time)
    submitIntent: ...,     // queue input as intent (real-time)
    // integrateMovers / integrateOrbiters — per-frame integration (real-time)
  },
  systems: {
    game_initialize: { create: () => {} },  // init-only for the turn-based starter; real-time games add per-frame systems here
  },
});
```

There is no `actions:` block — turn logic lives in plain typed functions (next section).

---

## Turn Functions — Turn Logic (both cadences)

A turn function encapsulates one turn: read a snapshot, run pure rules, write results through transactions, return animation metadata. `applyTap` is the **shared turn resolver** — called directly by turn-based input, by `inputSystem` in real-time games, and by the agent surface.

```typescript
export function applyTap(db: GameDatabase, args: { col: number; row: number }) {
  const state = readStateFromEcs(db);          // 1. snapshot
  const ruling = evaluateTap(state, args);     // 2. pure rule
  if (!ruling.valid) return { ...ruling };
  db.transactions.clearTile({ col, row });     // 3. write via transactions
  db.transactions.addScore(ruling.points);
  return { ...ruling };                        // 4. metadata for the controller/GSAP
}
```

These are plain exported functions, **not** entries in the plugin's `actions:` block. The block is a valid `@adobe/data` pattern (an *inline*-defined action even types its own `db`), but a **shared** resolver called from the controller, `inputSystem`, and the agent surface types best as a plain export — the `actions:` generic is unconstrained, so `db.actions.executeTap(...)` gives external callers no argument/return typing. Transactions used inside the turn function stay fully typed. See `src/game/mygame/ecs/gamePlugin.ts`.

The controller stays thin: call the turn function, then animate from the returned metadata (GSAP), then let observers repaint the HUD.

### Sanctioned variant: whole-snapshot reducer

For games whose rules are already a pure reducer over one immutable snapshot — especially with **undo** (card games, turn-based puzzles) — keep the whole state in one resource and let transactions call the reducer: read the `board` resource, run the pure rule, commit the new snapshot, re-project entities from it. Illegal moves return the identical snapshot object, so `after === before` no-op detection works for free, and undo is a stack of past snapshots.

---

## Computed — Derived State

Values that depend on other state, auto-updating when dependencies change:

```typescript
computed: {
  stars: (db) => Observe.withMap(
    db.observe.resources.score,
    (score) => calcStarsEarned(score, thresholds),
  ),
},
```

No manual recompute after every move. Note: a DOM screen that needs a derived value reactively should read the **computed observable** (or a resource written in a transaction) — mirror it into a signal only for JSX ergonomics.

---

## Real-Time Games — the per-frame path

Opt in only when state changes **without** an event (velocity, orbit, physics). The pieces (all under `src/game/mygame/`):

| Piece | Role |
|---|---|
| `ecs/schedule.ts` — `stepWorld(db, dt)` | One tick: `advanceTime({dt})` then every system in `SYSTEM_ORDER`. |
| `ecs/systems/` | Pure `db => void` systems + `SYSTEM_ORDER`. Ships `inputSystem`, `movementSystem`, `orbitSystem`. |
| `engine/` — `createTickerEngine()` | The frame-clock seam (`EngineHandle`) over `gsap.ticker`. The sim never imports an engine; no raw `requestAnimationFrame`. |
| `engine/fixedStep.ts` — `startFixedStepLoop` | The "Fix Your Timestep" accumulator: variable frame deltas → N steps of a **fixed** `dt`, spiral-of-death clamp, render `alpha`. |

```typescript
const engine = createTickerEngine();
const stop = startFixedStepLoop(engine, (dt) => stepWorld(db, dt));  // fixed dt in → stable, replayable
```

**Input as intent.** A real-time game does not resolve a turn inside the pointer callback — it queues one: `db.transactions.submitIntent({ col, row })`. Next frame `inputSystem` drains `pendingTap` via `applyTap`, keeping input on the deterministic timeline. Turn-based games skip the queue and call `applyTap` directly.

**External physics engines (matter.js, etc.)** plug in as one per-frame system, not a second source of truth: (1) push pending ECS→engine changes, (2) step with the fixed `dt` (`Matter.Engine.update(engine, FIXED_DT)`), (3) write body positions/angles back into ECS. Full detail in [`ecs/README.md`](../../src/game/mygame/ecs/README.md).

**Determinism holds either way.** `dt` and input arrive as injected resources (`frameDeltaMs`, `pendingTap`), so `stepWorld(db, FIXED_DT)` replays exactly in a headless test — the same reason `applyTap(db, {col,row})` is reproducible on its own.

### Writing from a system — observable vs hot-path

Only **committed transactions notify observers** — direct `db.store` column writes do not. So anything the HUD/DOM must react to (score, lives, phase) goes through `db.transactions.*`; reserve direct in-place column writes (`col.set(i, …)`) for the hot per-row work (position/velocity integration) that runs on every entity every frame and has no observer. The template's `movementSystem`/`orbitSystem` integrate through transactions for clarity — drop to direct column writes only when a profiler says per-entity transaction overhead matters.

### Spawning/despawning inside a system — iterate tail→head

This is about **archetype storage rows** (the packed column slots), not game-board positions. An entity that merely *moves* keeps its id, its row, and its archetype — you update its position component and nothing is destroyed. But when a per-frame system **destroys or archetype-migrates** rows while scanning them (bullets expiring, entities dying, a component added/removed), the table hole-fills by moving the tail row into the gap, invalidating a forward cursor. Iterate `rowCount-1 → 0` so removals come off the tail. A `db.transactions.*` call *mid-scan* migrates rows too — snapshot the ids you'll act on before dispatching inside a per-frame loop.

> **System ordering as the graph grows.** `SYSTEM_ORDER` is a flat list — the simplest correct ordering, and all this starter needs. Upstream `@adobe/data` orders systems by declared `schedule: { before, after }` dependencies; reach for that shape once the graph branches. The `engine/` seam (swap the clock for Pixi/Three) and the fixed-step accumulator sit on top of whichever ordering you use.

---

## Data Flow

```
TURN-BASED (default)                         REAL-TIME (opt-in)
User tap                                     engine.onFrame(realDt)
  └─ applyTap(db, {col,row})                   └─ startFixedStepLoop → stepWorld(db, FIXED_DT)
       ├─ readStateFromEcs()  (snapshot)            ├─ advanceTime({dt})
       ├─ evaluateTap()       (pure rule)           └─ SYSTEM_ORDER:
       ├─ db.transactions.*   (write)                    ├─ inputSystem   (drain pendingTap → applyTap)
       └─ return metadata     (GSAP)                     ├─ movementSystem (integrate velocity)
                                                         └─ orbitSystem    (integrate orbit)
  ↓                                            ↓
db.observe.resources.* → HUD / aria / DOM screens (read ECS; never a second write path)
computed.* auto-update · setActiveDb(db) → Inspector (dev)
```

---

## What Stays Out of ECS

- **Ephemeral animation state** — tween targets, particle lifetimes. GSAP owns these.
- **RNG closures** — the seeded RNG object is stateful and unobservable; keep it in a closure and pass it into turn functions/systems.
- **Complex nested config** — ECS components are flat; deeply nested level/config data is simpler as a signal/store or plain object.

---

## Foot-guns

- **Teardown order**: (real-time: stop frame loop → `engine.destroy()`) → renderer/DOM teardown → observers off → `setActiveInspectorActions([])`. The world **persists** — a screen unmount never disposes it. Observers must never fire into a destroyed renderer.
- **Feed the sim a fixed `dt`** — never raw frame deltas; continuous integration is only stable and replayable at a constant step. Use `startFixedStepLoop`.
- **Transactions and systems are deterministic** — no `Math.random()`/`Date.now()` inside; seeds/`dt`/input arrive as args or injected resources.
- **F32/I32/Vec2 namespace schemas for numbers, inline `as const` for strings/booleans** — use I32 (signed) when values can go negative, even transiently.
- **Give entities a `spriteKey` component** — the Inspector derives display names from `spriteKey`/`key`/`name`.
- **Nullable states need `Schema.Nullable(schema)`** — a bare `nullable: true` is silently ignored.
- **No-op = same reference** — pure rules return the identical object for illegal moves so `after === before` checks work.
- **Clear-and-rebuild: spread before delete** — `for (const e of [...store.select([...])]) store.delete(e)`; deleting while iterating a live selection skips entities.
- **Bots pace with `gsap.delayedCall`, never `setTimeout`** — so auto-play respects pause and the game clock.
- **ONE write path**: game logic writes ECS; DOM reads it. No parallel controller callbacks writing a second copy of the same value into signals.

---

## Conversion Order (migrating an older signals-based game)

New games built from this template skip this — the world is already wired. For an existing game that grew up on signals:

1. **Add ECS infrastructure** — copy `src/game/mygame/ecs/` + `world.ts` from the template, add the `@adobe/data` dep.
2. **Observation layer** — mirror board state as entities; see it in the Inspector.
3. **Resources** — move score/moves/level/phase from signals to ECS resources.
4. **Turn functions** — wrap turn logic in plain typed functions over transactions; thin the controller.
5. **Computed** — derived state (stars, blocker count) auto-updates.
6. **Read path** — point DOM screens at ECS (direct or via a resource observable); delete the signals clipboard and any per-screen DB create/destroy.
7. **Cadence** — if the game is real-time, add systems + the fixed-step loop; otherwise leave it event-driven.

Each step ships independently. The game works at every stage.
