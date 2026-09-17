# Match Pile — Research (Phase 0)

Genre: triple-match tile-pile, modeled on **Match Factory!** (Peak Games,
Google Play, 10M+ downloads, top-grossing Puzzle) and its direct competitors
(Tile Triple Match, Match Master 3D, Triple Tile, Tile Valley, Vega Mix 2,
Pretty Tidy). Canonical ancestor: **Mahjong Solitaire / Shanghai** (Brodie
Lockard, 1981 PLATO; Activision *Shanghai*, 1986) — layered-tile occlusion +
matched-group removal. The genre modernizes it by (a) matching triples instead
of pairs, (b) replacing the fixed layered grid with a freeform overlapping
pile, and (c) adding a bounded holding tray as the new fail-condition
mechanism (replacing Mahjong's "cleared board, no illegal states" win state).

Three read-only research passes ran in parallel (engine/solver, rules/
conventions, content/seed strategy). Findings below; full matrix in
`REFERENCE_MATRIX.json`.

## 1. Engine / solver (tier 1-2)

No npm package and no GitHub repo implement this exact mechanic, nor does any
package exist even for its closest documented cousin (Mahjong Solitaire
generation) — `npm view` came back empty for `mahjong-solitaire`,
`mahjong-generator`, `mahjong-solver`, `tile-match`, `match-three`,
`triple-match`, `sort-puzzle-generator`. This is a from-scratch build.

The one thing genuinely worth adopting is the **guaranteed-solvability
generation technique**, independently confirmed in two separate open-source
Mahjong Solitaire implementations:

- [`danhquach/mahjongsolitaire`](https://github.com/danhquach/mahjongsolitaire)
  (TypeScript, MIT) — `core/src/generator.ts` builds the board by repeatedly
  computing the currently-free tile ids, drawing 2 of them, assigning the next
  matching pair of faces, marking them removed, and recording `[a,b]` as a
  solution-order witness, looping until every tile is placed. `core/src/board.ts`
  defines "free" as `!isCovered(id) && (!isBlockedLeft(id) || !isBlockedRight(id))`.
- [`acvrp-lab/mahjong-solitaire-algorithm`](https://github.com/acvrp-lab/mahjong-solitaire-algorithm)
  (C++, GPL) — same reverse-construction idea via DFS with backtracking on
  dead ends (not vendored: license + language; used only to cross-validate the
  algorithm and confirm the backtrack-on-deadend detail).

**Adopted, adapted from pairs to triples and from a lattice+edge-blocking rule
to pure top-down cell coverage** (Match Pile is a pile, not a row lattice —
see `R-EXPOSURE`): build the pile backward from an empty grid. Decide the
*forward* clear order for triples first (`T_1` cleared first … `T_k` cleared
last), then place triples in *reverse* (`T_k` down to `T_1`), each triple's 3
objects going onto 3 distinct grid cells, stacked on top of whatever is
already at that cell. Because later-cleared triples are always placed
*earlier* (lower layer) and earlier-cleared triples are placed *later* (higher
layer, i.e. on top), the recorded order `T_1..T_k` is provably a valid clear
sequence with no forward search required. See `R-GEN-SOLVABLE`.

No dataset exists for tile-pile or Mahjong Solitaire *layouts* either — only
unrelated competitive-Mahjong play logs / tile-image CV datasets on
HuggingFace and Kaggle (`pjura/mahjong_board_states`, `mexwell/mahjong`, …).
Confirms: content must be procedurally generated, not mined.

## 2. Rules & genre conventions (tier 4-6)

Reverse-engineered from store listings, player guides, and competitor
round-ups (no single canonical rulebook exists for this genre — see search
order tiers 4-6 in `research.md`).

| # | question | finding | confidence |
|---|---|---|---|
| 1 | Tray size | **7 slots** — cited for both Match Factory and competitor "Tile Valley" ("seven-slot tray system") | convention (2+ sources) |
| 2 | Matching rule | Always exactly **3 identical objects**; one competitor (Vega Mix 2) varies group size as an outlier, not Match Factory's own rule | convention (base) / reversed (variant) |
| 3 | Pile structure | **Freeform overlap heap** ("objects can overlap or hide underneath each other"), explicitly *not* a Mahjong-style discrete grid with edge-blocking | convention |
| 4 | Fail condition | **Tray fills to 7 with no completable triple → immediate game over.** Universally cited. Timer: conflicting (one guide claims a countdown; official Play Store listing markets zen/no-timer; majority of competitors are move-based) — resolved to **no timer** in base mode, see `R-NO-TIMER` | convention (fail) / reversed (timer, resolved to default) |
| 5 | Level progression | Harder levels have "deeper initial piles," "more concurrent types," "less obvious matches" — directional only, no hard counts published | reversed (direction) / assumed (thresholds) |
| 6 | Power-ups | Shuffle, Undo ("Turn Back"), Hint, Hammer (remove-one), +1 tray-slot (offered as a stuck-state save, not upfront) — genre-standard toolkit | convention |
| 7 | Ancestor | Mahjong Solitaire / Shanghai (1981/1986), documented on Wikipedia/StrategyWiki/MobyGames | canonical |

## 3. Content / seed strategy (tier 3)

No usable dataset or level-editor export exists for this genre or its
ancestor (checked GitHub, Kaggle, HuggingFace — only generic grid-match-3
tools and unrelated Mahjong play-log/CV datasets turned up). **Design default:
build a from-scratch procedural generator; do not keep searching for prior
content.**

Difficulty-scaling guidance (directional, no hard numbers in any source):
object/tile count increases per level, item-type variety increases, pile
density/overlap increases (more hidden/stacked objects), tray size itself is
*not* a lever in the genre (stays fixed). Recommended concrete tiers (our
design judgment, see `REFERENCE_MATRIX.json#MODE-DIFFICULTY-LADDER`):

| tier | objects | distinct types | grid | count in pack |
|---|---|---|---|---|
| easy | 9–24 | 2–4 | roomier (more cells than objects → shallow stacks) | 10 |
| medium | 27–54 | 4–7 | moderate | 12 |
| hard | 57–90 | 6–10 | tight (fewer cells than objects → forced deep stacks) | 8 |

No sourced figure exists for "how many distinct object types should a pile
game draw from" — informal cross-check against general icon-set curation
practice (~20-30 icons per themed pool) lines up with the tier thresholds
above, so the object pool is sized at 24 (`UX-OBJECT-POOL`).

## 4. Decisions carried into the matrix (summary)

- **Tray size**: 7 (`R-TRAY-SIZE`).
- **Match rule**: exactly 3 identical (`R-MATCH-SIZE`), auto-clears the
  instant the 3rd copy lands in the tray (`R-AUTOCLEAR`).
- **Pile/exposure model**: discrete (col,row)+layer grid-stack; topmost
  remaining object at a cell is selectable (`R-EXPOSURE`) — a documented
  simplification of the true freeform overlap pile, logged as `assumed` in
  `REQUIREMENTS.json` since it's a design choice, not a sourced fact.
- **Fail**: tray full (7/7) with no completable triple, checked immediately
  after each resolved pick (`R-FAIL`). **Win**: pile empty (`R-WIN`).
  **Terminal states absorbing** (`R-TERMINAL`). **No timer** (`R-NO-TIMER`,
  `default`).
- **Hint**: one per level, finds any still-winnable next move via the solver
  (`R-HINT`); other power-ups (shuffle/undo/hammer/+1 slot) explicitly
  descoped from this build (`UX-POWERUPS-DESCOPE`, `default`) — brief asks
  for the simplest possible core loop.
- **Generator**: reverse-construction, guarantees solvability by
  construction, never generate-then-verify (`R-GEN-SOLVABLE`); deterministic
  from `{seed, tier}` via an internal seeded PRNG, `Math.random` banned
  (`R-GEN-DETERMINISTIC`).
- **Content**: 24-item semantic McDonald's object pool (`UX-OBJECT-POOL`,
  `default`) — food/drink/packaging, chosen for instant recognizability per
  the brief; opaque string ids only, no sprite/CDN references (that's Phase 2).
  3-tier ladder 10/12/8 (`MODE-DIFFICULTY-LADDER`, `default`, thresholds are
  our judgment, validated by the generator's own solve-rate + rating).
- **FTUE**: levels 1-3 hand-selected; level 1 uses only 2 object types with
  zero stacking, which is structurally unloseable under TRAY_SIZE=7 without a
  special-cased rule (`FTUE-LEVELS`, `default`).

## 5a. §Infrastructure incident (read before starting Phase 1)

`bun add -d fast-check` (needed for this phase's property tests) triggered the
repo's `postinstall` → `@wolfgames/cortex` `cortex:setup` script, which
**regenerated `.claude/skills/` and `.agents/skills/` from scratch and deleted
the entire untracked `tier-a-generation-v4`, `tier-a-build-v4`,
`tier-a-ship-v4` and `tier-a-assets-v4` skill directories** (they are
environment-seeded, not part of git or any npm package, so cortex's
regeneration — which only knows about cortex-provided and `local/skills/`
sources — silently pruned them). This is a real infrastructure bug in the
pipeline's own setup step, not a research-phase decision; recorded here
because it happened during this phase and blocks the next one.

**Restored from content already read into context before the wipe** (verbatim,
high confidence): `tier-a-generation-v4/SKILL.md`, `tier-a-build-v4/SKILL.md`,
`tier-a-ship-v4/SKILL.md`, `tier-a-research-v4/SKILL.md` (body verbatim from
the skill invocation; frontmatter reconstructed from the catalog description
text, not independently verifiable byte-for-byte), `tier-a-generation-v4/
references/{research.md,ux-contract.md,template-notes.md}`,
`tier-a-generation-v4/assets/{solvability.test.ts,stryker.conf.json,init.sh}`,
plus the `.claude/skills/tier-a-*` symlinks back to `.agents/skills/tier-a-*`.

**Confirmed lost, NOT restorable from this session** (never read before the
wipe, so no verbatim content exists to restore — fabricating them would
violate the pipeline's own "unfakeable gates, harness code not prose"
principle, so they were intentionally left missing rather than guessed):
- `tier-a-assets-v4/SKILL.md` — the entire Phase 2 skill definition.
- `tier-a-generation-v4/references/brand-contract.md`.
- `tier-a-generation-v4/references/brand-sheets/{wolf,mcdonalds,usweekly}.tokens.json`
  — **includes the McDonald's tenant sheet this exact task was told already
  existed.** It existed before the wipe; it does not now.
- `tier-a-generation-v4/references/{gameplay-layout-wireframe.png,style-*.png,screen-example-usweekly.png}`.
- `tier-a-generation-v4/assets/{architecture.test.ts,archive-transcripts.sh,classify-failure.ts,converge.ts,feel.test.ts,feel.ts,ftue.test.ts,gate.sh,inspector.ts,lazy-assets.spec.ts,package-scripts.json,playwright.config.ts,ui-contract.spec.ts}`
  — this is most of the actual gate/converge/FTUE/feel harness Phase 1 and
  Phase 3 depend on.
- `tier-a-generation-v4/evals/evals.json`.
- `.claude/skills/installed.json` (cortex's own bookkeeping — low stakes).

**Recommendation to the orchestrator**: re-provision these paths (whatever
process first populated `.agents/skills/tier-a-*` for this environment, since
none of it is tracked in this git repo) before dispatching Phase 1
(`tier-a-build-v4`) — its bootstrap step (`bash .../assets/init.sh`) and the
whole convergence loop hard-depend on the missing `gate.sh`/`converge.ts`/
`classify-failure.ts`/test-harness files, and Phase 2 needs both its own
SKILL.md and the McDonald's brand sheet back. Until then, treat any future
`bun add`/`bun install` in this repo as a risk to `.agents/skills/tier-a-*`
and re-verify those paths survived immediately after.

## 5b. Mutation testing

`bunx stryker run tier-a/stryker.conf.json` (config fixed for a Windows-specific
sandbox-copy crash on symlinked skill directories — see §5a) — final run:

```
All files     |  90.57 |   91.00 |      189 |         3 |         19 |        1 |        0 |
 isExposed.ts |  96.43 |   96.43 |       27 |         0 |          1 |        0 |        0 |
 isValid.ts   |  96.61 |   98.28 |       57 |         0 |          1 |        1 |        0 |
 rate.ts      |  76.56 |   76.56 |       47 |         2 |         15 |        0 |        0 |
 step.ts      |  96.00 |   96.00 |       48 |         0 |          2 |        0 |        0 |
 winFail.ts   | 100.00 |  100.00 |       10 |         1 |          0 |        0 |        0 |
Final mutation score of 90.57 is greater than or equal to break threshold 90.
```

**90.57% ≥ 90% — meets the gate.** `isValid.ts` (solution/structural
validation) and `step.ts`/`winFail.ts` (terminal-state logic) — the
categories the skill calls out as mandatory to fix — are all at 96%+ after
adding explicit negative-case tests (deliberately malformed `PileState`s
asserting `isValid()===false`) and exact-value-pinned fixtures for `rate.ts`
(hand-traced naive-walk scores asserted via `toBeCloseTo`, not loose
range/comparison checks, so arithmetic/comparator mutants are caught).

Remaining 19 survivors, checked individually and left deliberately:
- 4 are confirmed **equivalent mutants** (documented inline in
  `tests/unit/game/rules.test.ts` next to the fixtures that investigate them):
  `isValid.ts`#40 (dead code — a stronger guard 3 lines earlier already
  subsumes it), `isExposed.ts`#15 (removing a self-skip has no effect since
  a tile's layer is never strictly greater than its own), `step.ts`#39 (both
  its condition and block mutants — a later independent guard,
  `isExposed`'s own not-found check, already catches the same case),
  `rate.ts`#65 (an `>`→`>=` boundary that only fires on an exact-equality
  reassignment to the same value — unobservable).
- The remaining ~15 are concentrated in `rate.ts`'s naive-walk tie-break
  comparator and loop bookkeeping (e.g. a `<` → `>=` flip on the row
  tie-break that happens to be unobservable when the two tied tiles share a
  typeId, as in one of the added fixtures). `rate.ts` is the content
  difficulty-heuristic (`MODE-DIFFICULTY-LADDER`, tagged `assumed` — no
  external source, pure engineering judgment), not `scoring.ts` (the
  player-facing score formula, a Phase 1/build-owned file) — it is outside
  the skill's explicitly mandatory "terminal state / solution validation /
  scoring" categories, all of which are otherwise clean. Given the overall
  90.57% clears the gate and the mandatory categories are addressed, these
  were left as a documented, bounded gap rather than chased further.

## 5. §Changes (repair mode)

- **Same-pass fixture fix, `R-FAIL (seed=1)` in `tests/unit/game/rules.test.ts`.**
  Not a matrix/rule change — `R-WIN`'s precedence over `R-FAIL` (pile-empty
  wins regardless of tray occupancy) was already correctly decided in
  `REFERENCE_MATRIX.json#R-WIN`, implemented in `reference.ts`, and covered by
  the adjacent `R-WIN` test. The test author's `R-FAIL(seed=1)` fixture had an
  authoring bug: picking all 7 tiles in a 7-tile pile empties the pile *and*
  fills the tray on the same transition, so it asserted `'lost'` on a state
  that is actually `'won'` by the already-agreed precedence rule. The
  implementer correctly flagged this as `SPEC_CONFLICT R-FAIL` instead of
  routing around it. Fix: added an 8th, deliberately-unpicked tile to the
  fixture so FAIL is isolated from WIN (tray fills to 7 while the pile still
  holds 1 object). No rule, matrix entry, or production code changed.
