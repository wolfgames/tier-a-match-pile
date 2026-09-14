# Game Design — Spiral Pop

> Source of truth for the game's design. Agents read this before building. The
> canonical, framework-free rules + tuning live in
> [`src/game/mygame/bubble/`](../src/game/mygame/bubble/) (`config.ts`,
> `path.ts`, `levels.ts`, `rng.ts`); the ECS model in
> [`src/game/mygame/ecs/`](../src/game/mygame/ecs/). If this doc and the code
> disagree, the code wins for exact numbers and this doc wins for the loop and
> intent.

## The Game in One Sentence

A Zuma-style bubble shooter: a chain of coloured balls spirals toward a hole at
the centre, and a cannon in the middle fires balls into it — match three or more
of a colour to pop them and clear the chain before it reaches the hole.

## Core Game Loop

```
Chain of coloured balls slides in from the entry and spirals toward the door
        ↓
Cannon at the centre aims at the pointer; the hopper shows the loaded colour
        ↓
Tap / click  →  fire the loaded ball outward into the chain
        ↓
The ball wedges in between the two nearest balls, pushing the chain apart
        ↓
3+ of a colour touch  →  they pop and fade  →  the gap closes (chain pulls back
toward the entry until a ball stops it), and matches cascade
        ↓
Chain emptied  →  level cleared  →  next level (faster).   Front ball reaches
the door  →  game over.
```

## Rules

- **The chain.** One continuous line of balls travels a fixed inward spiral from
  the ENTRY (outer, top-left) to the DOOR (centre). It marches on its own every
  frame — the whole game is a race against that march. A single scalar `headT`
  (arc distance of the front ball) drives the entire chain; ball `i` sits one
  ball-spacing behind ball `i−1`.
- **The cannon & hopper.** A fixed cannon at the centre rotates to aim at the
  pointer. It fires the colour in `hopperCurrent`; `hopperNext` is shown queued
  behind it. Firing rolls the hopper (current ← next, next ← a fresh seeded
  draw).
- **Firing & insertion.** A shot flies straight outward along the aim angle. When
  it comes within just over one ball-diameter of a chain ball, it inserts at the
  nearest seam — between the two closest balls — pushing the rest of the chain
  back by one slot.
- **Matching & popping.** If the insertion makes a run of **three or more** of
  the same colour, that run pops and fades. The gap closes: everything behind is
  pulled forward toward the entry until it meets the ball ahead. Newly-formed
  adjacencies are re-checked, so pops **cascade**; pre-existing runs elsewhere
  are left alone.
- **Win / lose.** Clear every ball in the chain to win the level. If the front
  ball reaches the door, the level is lost. Either way the run ends and hands off
  to the results screen (on the final level, a win ends the game).

## Levels & Difficulty

Five levels, defined in [`bubble/levels.ts`](../src/game/mygame/bubble/levels.ts).
The ramp starts **slow** and widens over time:

| Level | Colours | Chain length | March speed | Feel |
|---|---|---|---|---|
| 1 | 3 | 22 | 16 px/s | Gentle intro — lots of time to aim. |
| 2 | 4 | 30 | 24 px/s | A fourth colour; fewer easy matches. |
| 3 | 4 | 38 | 32 px/s | Longer chain, less breathing room. |
| 4 | 5 | 46 | 40 px/s | Full palette; planning matters. |
| 5 | 5 | 54 | 50 px/s | Longest and fastest — the finale. |

Each level has a fixed `seed`, so its colour sequence (chain + hopper draws) is
**deterministic and replayable** — no `Math.random`. Score carries across levels
within a run.

## Screens & Flow

The template's four screens map cleanly onto the game:

| Screen | What the player sees / does |
|---|---|
| Loading | Boot/brand chrome while assets warm up. |
| Start | Title card **Spiral Pop** and a play button. |
| Game | The spiral track, the marching chain, the aiming cannon, and the HUD (level / score / balls remaining). This is the whole game. |
| Results | Final score (read straight from ECS) and a replay option. |

Valid screen IDs remain `loading`, `start`, `game`, `results`.

## Art Style Spec

**Current state: placeholder art.** Every ball, shot, and the cannon render as
flat tinted Pixi `Graphics` shapes (a circle per colour index, a barrel + base
for the cannon), the spiral as a stroked groove. This is the sanctioned
placeholder pass — the game is fully playable before any art exists. Each
placeholder is flagged `ART TODO` in the code.

Target look for the art pass (keep it simple and readable):

- **Balls:** one crisp bubble sprite per colour index (see `COLORS` in
  [`bubble/config.ts`](../src/game/mygame/bubble/config.ts)) — glossy, high
  chroma, distinct hues that read at a glance and are colour-blind-safe.
- **Track:** a shallow carved groove/channel the balls sit in, so the spiral
  reads as a physical path into the hole.
- **Cannon:** a central rotating shooter with a visible loaded colour and a
  next-up chip.
- **Background:** a calm, low-contrast field so the bright balls pop.

Detection-friendly, high-contrast, no text baked into sprites.

## Assets Needed

Generate via the wolf-game-kit MCP, stage in `assets/src/`, and publish — see
[`local/rules/asset-pipeline.md`](../local/rules/asset-pipeline.md). Do not
commit game media to the repo. Until generated, the placeholder Graphics stand in.

| Asset | Type | Status | Notes |
|---|---|---|---|
| bubble sprites (one per colour) | atlas | needed | `scene-bubbles`; alias per colour index |
| cannon + hopper | atlas / sprites | needed | rotating base, barrel, loaded-colour chip |
| spiral track / groove | image or 9-slice | optional | can stay a stroked groove |
| background | image | optional | low-contrast field |
| pop / shoot / clear SFX | audio | needed | `sfx-shoot`, `sfx-clear`, `sfx-lose` (referenced by the controller) |

## Data Contract

- [`bubble/config.ts`](../src/game/mygame/bubble/config.ts) — design box, ball
  geometry, projectile speed, insert distance, `MATCH_MIN`, `POINTS_PER_BALL`,
  and the `COLORS` palette (colour index → tint).
- [`bubble/path.ts`](../src/game/mygame/bubble/path.ts) — the spiral: `posAt(t)`,
  `PATH_POINTS`, `PATH_LENGTH`, `ENTRY`, `DOOR`.
- [`bubble/levels.ts`](../src/game/mygame/bubble/levels.ts) — `LEVELS`,
  `LEVEL_COUNT`, `levelFor(index)`.
- ECS model, transactions, and systems — see
  [`src/game/mygame/ecs/README.md`](../src/game/mygame/ecs/README.md).

## Quality Bar

- **Instantly playable** — the first chain is on screen and firing feels good
  from the first tap.
- **Fair** — the march starts slow; the player always has time to read colours
  and aim. Cascades reward planning, not luck.
- **Deterministic** — same level seed → same colour sequence, so runs are
  reproducible and headlessly testable (`tests/unit/schedule.test.ts`).
- **Ship quality** — snappy pops, a satisfying cascade, and clear win/lose
  feedback are what turn "shoot the ball" into a game.
