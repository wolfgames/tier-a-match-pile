# Game Design — Source of Truth

> Technical source of truth for the Daily/level edition of the Match Pile prototype.
> This document defines what the player does, how each mechanic behaves, and the
> current design rules agents must follow when building the game.

## The Game in One Sentence

A McDonald's-themed triple-match tile pile where the player collects and matches
overlapping objects to fulfill a set of Orders before the level's countdown Timer
runs out.

## North Star

- **The Core Verb** — Tap an exposed object, collect 3 identical objects into the
  Slots Row to clear them, and use those clears to fulfill Order requests.
- **The Hook** — Order items are buried under other objects; reading the pile,
  clearing what's in the way, and racing a visible countdown creates the tension.
- **Session Shape** — Short, single-level runs (well under the Timer's budget for
  an average clear), played back-to-back across a sequential level progression.

## Current Prototype Scope — Daily Edition / Levels

"Daily Edition" is the **player-facing name** for this mode. It is **not**
calendar/date-seeded — there is no one-puzzle-per-day behavior. It is a normal
sequential level progression: Level 1 → Level 2 → Level 3 → … Every level is
generated deterministically from its level index (seed), same as any other
level in the sequence.

### Levels

Levels are procedurally generated (deterministic, seeded — see
`tier-a/REFERENCE_MATRIX.json#R-GEN-DETERMINISTIC`, `#R-GEN-SOLVABLE`), except
for the first 3 FTUE levels, which are hand-authored/scripted (see **FTUE**
below). Levels 4+ draw from the generated sequence. Exact curve values are
**tunables** — see **Tuning Knobs**; the curve itself is proposed and approved
separately from this document, not invented here.

## Core Mechanics

### Core Loop

```
Orders posted for the level
        ↓
Player taps exposed objects in the pile → 3 identical objects auto-clear
into a completed triple in the Slots Row
        ↓
A completed triple whose type matches an Order advances that Order's progress
        ↓
All Orders satisfied → level WON
Timer reaches 0 before Orders complete → level LOST
Slots Row reaches capacity with no completable triple → level LOST
```

**Emptying the pile is not required for victory.** A level is won the moment
every Order is satisfied, regardless of how many non-Order objects remain in
the pile.

### Matches

- A match is exactly **3 identical object types** simultaneously present in the
  Slots Row — no pairs, no 4+ groups.
- A match **auto-clears instantly** the moment the 3rd copy is collected — no
  manual "confirm match" input.
- Matching **does not require adjacency or pick order** — 3 identical objects
  collected in any order, at any point, complete the match (see FTUE Level 3).
- **Distractor triples are valid successes.** Matching 3 identical objects that
  don't belong to any Order still auto-clears normally and is never treated as
  a mistake — see **Scoring Specification Boundary**.

### Playable Area

- Objects occupy a coarse (col,row) grid, stacked in layers at each cell, then
  visually scattered/rotated within their cell for a "freeform pile" look.
  **Selectability is decided geometrically, from real on-screen coverage**
  (tier-a-build-v4's geometric-exposure pass, superseding the old strict
  "topmost-at-its-cell-only" `R-EXPOSURE` reading for real play): an object
  behind another can be tapped directly the moment enough of it is genuinely
  visible on screen, without clearing whatever's grid-stacked above it first —
  a fully/near-fully covered object still cannot be tapped (a minimum
  exposed-area threshold guards against un-tappable slivers). The abstract
  strict grid rule (`rules/isExposed.ts`) is unchanged and still used
  internally by the difficulty heuristic, solver, and generator — it never
  decides what a real player can tap. See that file's doc comment and
  `board/exposure.ts` for the full mechanics.
- **Objects must never render outside the intended gameplay/board area.**
  Layout is derived from the real level's grid dimensions and the board
  container's actual measured size (both axes) — never a hardcoded grid/cell
  size, and never by clipping interactable objects.
- Distractor and Order-relevant objects **look identical** on the board. The
  player is not meant to visually distinguish them by looking at the pile —
  see **Orders** below.

### Timer

- Each level has a countdown Timer, displayed in the top HUD.
- Early levels start at **5:00** (tunable — see **Tuning Knobs**).
- Internally tracked at **millisecond resolution**.
- The Timer is **paused** during FTUE instruction states and starts only at
  each level's explicitly defined gameplay-start point (after the player
  dismisses the relevant instruction via Continue).
- Reaching **0:00 before all Orders are complete → level LOST**.

### Orders

- Orders are a required core system, displayed as **Order Cards/Slots** above
  the gameplay area.
- Each Order is data-driven and contains at minimum:
  - object/item identity (`itemTypeId`)
  - required quantity
  - remaining/progress quantity
- **Required quantities are always a multiple of `MATCH_SIZE` (3)** — an Order
  is satisfied by whole triples only.
- A completed triple whose type matches an Order advances that Order's
  progress by 3.
- The level completes once **all** Orders are satisfied.
- Order items may be **physically buried** under other objects in the pile —
  the player must clear what's on top to reach them. Not every object on the
  board needs to be cleared to win.
- Order Cards are the player's only way to know which object types matter this
  level — the pile itself gives no visual hint (see Playable Area).

### Slots Row

"Slots Row" is the player-facing name for the collection tray: the row that
holds collected-but-not-yet-matched objects (capacity 7 — unchanged from
`R-TRAY-SIZE`). Items land here in pick order, but **matching does not require
them to be adjacent or in the order they were picked** — any 3 identical
objects present in the Slots Row complete a match, wherever they sit in the
row. If the Slots Row reaches capacity with no completable triple among its
contents, the level is **LOST**.

## Progression and Retention

- Difficulty taxonomy: **Easy → Medium → Hard → Very Hard.**
- Difficulty is driven by three axes, all **tunable** and increasing across
  the sequence:
  - available time (Timer budget) **decreases**
  - amount/density of board objects **increases**
  - number and complexity of Orders **increases** (more Orders, more distinct
    requested types, larger requested quantities)
- **After every Hard or Very Hard level, the next level must be an Easy relief
  level** before difficulty builds again. The curve is progressive, not a
  fixed block-per-tier structure and not an endless easy→medium→hard repeat.
- Exact numeric curve values are **not finalized in this document** — they are
  tunables proposed and approved as a separate step.
- Deterministic generation and guaranteed solvability (per level, including
  reachability of every Order's required quantity) are preserved regardless of
  curve tuning.

## FTUE

FTUE is a step machine layered over real play — never a modal, never an
overlay glyph. It highlights real on-screen controls only.

### Level 1 — Core Mechanics

- **Instruction 1:** "Tap 3 identical items to collect them." Highlight 3
  identical items. Wait for player input. Timer remains stopped.
- **Instruction 2:** "Collect all goal items to finish the level." Highlight
  the 3 Order Slots. Show Continue. Timer remains stopped. After Continue,
  gameplay begins and the Timer starts.
- **Level setup:** only assets required by the Orders (no distractor objects).
  Timer = 5:00.

### Level 2 — Timer

- **Instruction:** "Collect all the goals before time is over!" Highlight the
  Timer. Show Continue. Timer remains stopped. After Continue, gameplay begins
  and the Timer starts.
- **Level setup:** Timer = 5:00. Introduces additional objects not required by
  any Order (distractors).

### Level 3 — Slots Row

- **Instruction:** "Items don't have to be in order to match."
- A controlled tutorial state demonstrates: `A | A | B` in the Slots Row, then
  the player is allowed/prompted to select another `A`. The three matching `A`
  items must resolve as a match even though they are not adjacent/in-order.
- After the scripted match: remove the remaining tutorial item (`B`) from the
  Slots Row, end the tutorial state, begin normal gameplay, start the Timer.

### How-to-Play

FTUE must remain intentionally accessible/replayable through a **How-to-Play**
entry point. Replaying it runs an **isolated, unscored** pass through the same
3 FTUE steps and **must not reset the player's campaign/level progression**.

## Scoring Specification Boundary

Match Pile's scoring is governed by the **Wolf Template Scoring System**
(supplied separately) — this section defines Match Pile's inputs and
requirements into that system; it does not restate its mathematics.

- `[CONTENT_UNIT] = Level` — the template's scoring unit maps 1:1 to a Match
  Pile level.
- Displayed score label stays **"Score"** for now.
- Scoring is **continuous** — coarse buckets are never the primary scoring
  signal.
- Time-efficiency is measured and stored at **millisecond** precision.
- **No direct point penalties are ever subtracted for mistakes.** Errors cost
  the player only indirectly — via slower cycle times, a broken speed streak,
  and a lower accuracy multiplier.
- The successful-action / time-efficiency event is **a completed triple
  match** (Order-relevant or distractor — both count equally).
- **Match Pile correct/wrong semantics (gameplay-tap-based, not solver-based,
  and not based on end-of-run leftovers):**
  - **correct attempt** — a gameplay tap accepted by the rules that
    successfully selects/adds a currently-selectable item to the Slots Row.
  - **wrong attempt** — a gameplay selection rejected by the rules because the
    targeted item cannot legally be selected in the current state.
  - **Never counted as wrong:** a valid partial selection that hasn't
    completed a triple yet, an Order-relevant selection, a distractor
    selection, a distractor triple match, a UI interaction, or any neutral
    action. This intentionally avoids penalizing blocker-clearing/distractor
    play that may be necessary to expose buried Order items.
- **Speed streak:** advances on each consecutive successful triple match. A
  wrong gameplay attempt (per the definition above) between successful triples
  resets the streak; valid partial selections and neutral/UI actions never
  reset it. The streak multiplier applies to time-efficiency points only.
- **Accuracy** is the template's continuous, run-end multiplier, computed from
  correct vs. wrong gameplay attempts using the semantics above.
- An optional **pace multiplier**, based on total completion time, may apply —
  kept **narrow** per the template's own guidance so it never eclipses
  accuracy or per-action skill.
- Scoring is fully **deterministic** — computed from seeded/injected game
  state, never from `Math.random()` or an unsampled clock read inside scoring
  logic itself.
- **Ranking** is normalized against the Level's median score, never against
  absolute cutoffs.
  - Phase 1: a data-driven median value per Level, plus a `DEFAULT_MEDIAN`
    fallback for Levels without one yet. The architecture must stay compatible
    with a later first-attempt, analytics-driven median, but no live
    aggregation system is built in this phase.
  - Benchmark medians are computed from **first-attempt runs only** — retries
    (e.g. "Try Again") are excluded so repeat plays can't inflate the top
    tiers.
- **Every finished run receives a rank tier**, including a **floor tier (Tier
  0)** for runs below the lowest percentile cutoff — there is no "no rank"
  state, though Tier 0 itself displays no percentile.
- **Mastery is a 0–5 star rating**, mapped across the Level's par→ace score
  band per the template's model.
- All scoring constants (time-efficiency curve, streak steps, accuracy
  parameters, pace band, medians, rank-tier multiples, mastery band) are
  **data/config tunables** — never hardcoded magic numbers in game logic.

## Decision Log

Decisions below are approved and binding; they exist here specifically because
they are not obvious from the code and would otherwise be easy for a future
agent to re-litigate or silently reverse.

- Win condition is **Orders-complete**, not pile-empty. Pile-empty-to-win is
  superseded.
- **Both** lose conditions are active simultaneously: Timer reaching 0:00
  before Orders complete, and Slots Row capacity/overflow with no completable
  triple. Neither supersedes the other.
- Order required quantities are always a multiple of 3 (no partial-triple
  Order fulfillment, no rounding logic needed).
- Distractor and Order-relevant objects are visually identical on the board by
  design — Order Cards are the sole source of "what's needed" information.
  This is intentional, not a placeholder gap.
- Accuracy/streak correct-and-wrong semantics are defined at the level of
  individual gameplay taps (accepted vs. rules-rejected selection), **not** by
  solver-optimal play and **not** by tallying items left unmatched at run end
  (an earlier, now-superseded definition) — see Scoring Specification
  Boundary. Clearing distractors to reach buried Order items is always valid,
  never a "wrong attempt," and never breaks the speed streak.
- Mastery uses the Wolf Template Scoring System's **0–5 star** scale. The
  existing `scoring.ts`/Results-screen implementation (0–3 stars) is known
  stale and is repaired later during the Scoring implementation pass — it is
  not touched by this documentation update.
- "Daily Edition" is branding only. No calendar/date seeding exists or should
  be built; it is a normal sequential level index progression.
- How-to-Play replays FTUE in an isolated, unscored context and never resets
  real campaign/level progression.
- Phase 1 ranking uses a static per-Level median + `DEFAULT_MEDIAN` fallback,
  not live analytics aggregation — that upgrade path is intentionally deferred,
  not abandoned.
- The Tier A UX/layout contract (`ux-contract.md` + wireframes) that would
  define exact Timer/Order-card HUD slot geometry is currently missing (lost
  to an earlier tooling incident) and must be recovered before that geometry
  is finalized. This does not block the Orders state model, Timer state/logic,
  rules, or their tests, which are geometry-independent.
- Exact difficulty-curve numbers and exact HUD slot geometry are **not**
  decided by this document — both are explicitly deferred to separate,
  dedicated approval steps.

## Visual & Audio Identity

**Current state: placeholder art**, same sanctioned placeholder pass as the
rest of the template — every object renders as a flat tinted Pixi `Graphics`
shape with a text glyph, flagged `ART TODO` in code. The game is fully
playable before any final art exists.

### Visual

- Tenant branding (McDonald's) is wired through `brand.tokens.json` →
  `palette.ts`/`typography.ts` — colors, typography, and tenant name/mark are
  live now, using placeholder mark geometry (a tinted rounded-rect + label)
  until real logo art is published.
- The 24-item McDonald's object pool (fries, big-mac, mcnuggets, etc.) are
  color-coded placeholder discs with a 3-letter glyph, one per object type.
- Final look (real object sprites, real tenant marks) is a later asset-pass
  concern, generated and published via the wolf-game-kit MCP pipeline — not
  part of this design document's current-prototype scope.

### Audio

- Existing fx-event hooks (input/submit/correct/win/lose/hint/button) are
  wired through the game's fx/audio system today.
- Final SFX/music content generation and mixing is a later phase concern, not
  part of this design document's current-prototype scope.

## Assets Needed

Pending Phase 2 (asset generation/publish) — placeholders stand in until then:

| Asset | Notes |
|---|---|
| 24 object-type sprites | one per `OBJECT_TYPE_POOL` entry; used on the board and on Order Cards |
| Tenant marks | `mark-mcdonalds`, `mark-mcdonalds-arches` |
| Order Card iconography | reuses the object sprites above |
| Timer/HUD iconography | new — no current spec beyond "top HUD, countdown display" |
| SFX / music | per existing fx-event hooks; content TBD |

## Tuning Knobs

Values below must live in data/config, not as hardcoded constants in game
logic. None of the specific numbers are finalized by this document — each is
proposed and approved as its own step before implementation.

- Timer starting budget per level (early levels: 5:00)
- Difficulty curve parameters per level/tier: time budget, object density,
  Order count, distinct requested types, requested quantities
- Relief-level insertion rule's interaction with the curve (structural rule is
  fixed — "Easy after every Hard/Very Hard" — its numeric placement within a
  longer curve is tunable)
- Wolf Template Scoring System constants: time-efficiency weighting, speed
  streak parameters, accuracy weighting, optional pace-multiplier curve,
  `DEFAULT_MEDIAN`, and the per-Level median table
