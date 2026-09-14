# Agent-Friendly Modules — Rubric

Concrete, binary criteria for evaluating modules in the upstream `@wolfgames/components` catalog (`node_modules/@wolfgames/components/src/modules/INDEX.md`). The goal is that an AI agent (or a new engineer) can pick the right module on the first try and use it correctly without reading source.

Every module passes or fails each criterion independently. Two reviewers scoring the same module should land within ±1 total criterion. If they don't, the rubric is too soft — sharpen the failing criterion before re-scoring.

> Shared modules live upstream in [`wolfgames/game-components`](https://github.com/wolfgames/game-components). Path references in this rubric refer to that repo's `src/modules/` tree.

## Scope

Applies to every module listed in `node_modules/@wolfgames/components/src/modules/INDEX.md` — primitives, prefabs, and logic modules.

## Criteria

### R1. Module README exists with one-line purpose

**Pass:** `<module>/README.md` exists. Its first non-heading paragraph is a single sentence that states what the module *is* and what it's *for*. No marketing language, no architecture preamble.

**Fail:** No README. README missing the one-liner. One-liner buried below diagrams or background.

**Pass example** (from `sprite-button/README.md`):
> *Interactive button primitive with hover, press, and exit animations. Ships with three renderer backends that share the same defaults and tuning.*

**Fail example:**
> *## Architecture* (no purpose statement above this heading)

### R2. README has a copy-paste usage example

**Pass:** README contains a fenced TypeScript code block that imports the module from its barrel path (`~/modules/...`) and shows a minimal working invocation. Pasting it into a game file with the listed deps in scope produces a working instance with no edits needed beyond names.

**Fail:** No code block. Block uses pseudocode, omits imports, references undefined variables (`myConfig`, `someStage`), or skips required constructor args.

**Pass example:**
```ts
import { SpriteButton } from '~/modules/primitives/sprite-button';

const btn = new SpriteButton(gpuLoader, {
  atlasName: 'ui',
  spriteName: 'btn-play',
  label: 'Play',
  onClick: () => startGame(),
});
stage.addChild(btn);
```

### R3. Public-API config size is within budget

Count fields on the `*Config` interface(s) re-exported from `index.ts`. Count optional and required together. Don't count nested type aliases (e.g. `HitAreaDef`) — only top-level fields.

| Module type | Budget |
|-------------|--------|
| Primitive   | ≤ 7    |
| Prefab      | ≤ 9    |
| Logic       | ≤ 7    |

**Pass:** Field count ≤ budget for the module's category.

**Fail:** Over budget. Remediate by (a) grouping related fields into a sub-object (e.g. `style`, `animation`), (b) moving rarely-tuned values into `defaults.ts` and exposing setters instead, or (c) splitting the module.

The 7/9 ceilings are calibrated so an agent can hold the full surface in working memory. Going over forces them to read source; that's exactly the friction we're removing.

### R4. No `src/game/` imports

**Pass:** No file under the module imports from `~/game`, `src/game/`, or any relative path that resolves into `src/game/`. Verify with:

```bash
grep -rE "from ['\"](~/game|\.\./\.\./game|\.\./\.\./\.\./game)" src/modules/<module>/
```

**Fail:** Any match. Modules are upstream of game code; reverse imports break the layering and make the module non-portable.

### R5. INDEX.md row has an agent-readable "Use when…" hint

**Pass:** The module's row in `game-components/src/modules/INDEX.md` populates the *Use when you need…* column with concrete intent phrases an agent would actually type while searching. Multiple comma-separated examples preferred.

**Fail:** Cell empty. Cell restates the module name. Cell describes implementation rather than intent (e.g. "Pixi container with three children" instead of "speech bubbles, NPC dialogue, text boxes").

**Pass example:** `speech bubbles, text boxes, NPC dialogue`

**Fail example:** `9-slice with text` (describes how, not when)

### R6. `defaults.ts` follows the contract

**Pass:** All four hold:

1. File exists at `<module>/defaults.ts`.
2. Exports a single object named `<MODULE_NAME>_DEFAULTS` in `SCREAMING_SNAKE_CASE`.
3. Object is flat (one level of keys) where possible.
4. Every numeric, color, or string literal has a JSDoc comment explaining what it controls and its unit.

**Fail:** Missing file. Wrong export name. Inline magic numbers in the renderer/factory not lifted into defaults. Missing JSDoc on entries.

### R7. `tuning.ts` follows the contract

**Pass:** All four hold:

1. File exists at `<module>/tuning.ts`.
2. Exports `<moduleName>Tuning` (camelCase) with shape `{ name, defaults, schema }`.
3. `defaults` references the imported `<MODULE_NAME>_DEFAULTS` (no duplication).
4. Every key in `schema` corresponds to a real key in `defaults` and has a valid Tweakpane control type (`number` with `min/max/step`, `string`, or `boolean`).

**Fail:** Missing file. Schema references non-existent keys. Defaults duplicated rather than imported. Sliders without `min/max`.

Logic modules exempt from R7 only when the module has zero tunable values; in that case `tuning.ts` should still exist and export an empty schema, so the module appears in the panel for discovery.

### R8. Module is listed in INDEX.md

**Pass:** Module folder name matches a row in `game-components/src/modules/INDEX.md`.

**Fail:** Folder exists but no row (orphan), or row exists but no folder (broken link).

This is the cheapest criterion to check and the one agents fail hardest on — modules invisible to the catalog get rebuilt from scratch.

## Scoring

Each module is scored 0–8 (one point per criterion passed). The scorecard records pass/fail per criterion, not just the total — totals hide which axis is broken.

| Score | Status      | Action |
|-------|-------------|--------|
| 8/8   | Healthy     | None |
| 6–7/8 | Minor drift | Single fix ticket, ≤ 1 pt |
| ≤ 5/8 | Needs work  | Fix ticket, 2 pts; consider whether the module should be split |

A failing R1 or R2 always blocks the module from "Healthy" status regardless of other passes — without the README there is no entry point for an agent.

## How to remediate

When fixing a failing module:

1. Identify which criterion the module fails.
2. Apply the smallest change that flips the criterion to pass. Don't take the opportunity to refactor unrelated code.
3. Update the scorecard row, including the date and the PR/commit reference.
4. If the fix changes the module's public API or INDEX hint, also update consumers.

## When to update this rubric

The rubric is wrong when:

- Two reviewers score the same module > ±1 apart on a single criterion. Tighten the criterion's pass/fail definition.
- A module passes everything but agents still misuse it. Add a criterion that captures the missing signal.
- A criterion never fires (every module passes). It's not load-bearing — remove it.
