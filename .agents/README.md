# .agents/

Tool-agnostic agent assets — readable by any harness (Zed, Claude Code,
Codex, Gemini, …). This directory holds **both** hand-written tracked content
and cortex-generated content, so mind the split:

- **Hand-written, tracked in git** — `context/` and `specs/` (below). Edit
  these freely.
- **Generated, gitignored** — `rules/`, `skills/`, and `commands/` are
  symlinked from `@wolfgames/cortex` on every `bun install`. Never hand-edit;
  changes are wiped on the next install.

- `context/` — durable context. One topic per file, absolute dates, prune
  stale notes. Start with `engineering-principles.md`.
- `specs/` — plans for non-trivial features. Copy `SPEC.template.md` to
  `<feature>.md`, fill it in during planning, execute against it in a fresh
  session.

Designer-facing context does NOT live here — it lives in
[`docs/GAME-DESIGN.md`](../docs/GAME-DESIGN.md) where non-technical
collaborators can find and edit it.
