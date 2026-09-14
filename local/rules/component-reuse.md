---
description: Required catalog check before creating any UI or gameplay element (HUD, buttons, screens, backgrounds, popups)
alwaysApply: true
---

# Components: catalog check required

**Trigger:** you are about to create or add a HUD, button, menu, screen
(start / loading / results / settings / win / lose), background, dialogue
box, popup, progress bar, timer, overlay, character display, or any other
visual or logic element. The trigger is the element, not whether the file
already exists: adding a button to an existing screen triggers it too.

**Requirement:** check `@wolfgames/components` FIRST. This is a required step
in the task, not a suggestion. ~55 tested modules cover most of the above;
most "new component" tasks are a config-and-wrap job, not new code. The
check, in order:

1. Read the catalog: `node_modules/@wolfgames/components/src/modules/catalog.json`
   (fallback: `INDEX.md` next to it on older packages).
2. Read the closest matches' `README.md` (`readmePath`); check `surface`
   (pixi|dom|logic) against where the code will live.
3. Fallback: `grep -Ri "<keywords>" node_modules/@wolfgames/components/src/modules/`,
   or run the `amino-component-discovery` skill.

**Evidence:** name the specific modules you considered (with catalog paths)
and why none fit, in the task output, before the first Write/Edit for the
element. If you cannot name one, you have not done the check. Creating an
element without the check is a guardrail violation
(`docs/standards/guardrails.md`, "No Hand-Rolled Components Before a Catalog
Check").

Rules of use:

- Import package entry points (`@wolfgames/components/solid|core|pixi|howler`,
  `@wolfgames/components/modules/*`), never deep paths. There is no `/react`
  export; the stack is Solid + Pixi.
- Respect `locked: true` manifest properties; bind styling through
  `@wolfgames/tokens`, don't hardcode Figma hex/px values.
- Game-specific wrappers live in `src/game/` (pass atlas/font/config via the
  constructor). Genuinely new game-agnostic patterns incubate in `src/game/`
  and promote to the `wolfgames/game-components` repo once stable — never a
  local shared tier.
- Settings/pause/menu UI: wrap the catalog `options-menu` from
  `src/game/screens/` (DOM); `src/core/ui/` is scaffold-only and off-limits.

Full guide: `docs/guides/shared-components.md`.

This local copy stays until `@wolfgames/cortex` ships `module-catalog.md` as
always-apply; it is deleted in the same PR that bumps the dependency.
