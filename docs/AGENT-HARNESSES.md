# Agent harness compatibility

How this repo stays readable by multiple AI coding tools with **one source of
truth** and no duplicated instructions.

## Principle

`AGENTS.md` is the canonical instruction file (an open standard read by most
tools). Every other tool either reads it natively or points to it via an
import or symlink. **Never copy instructions between files — point at
`AGENTS.md`.**

## Instructions: what each tool reads

| Tool | Reads | Status here |
| --- | --- | --- |
| **Zed** (primary) | **one** instruction file, first match wins — `.rules`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `.github/copilot-instructions.md`, `AGENT.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` ([docs](https://zed.dev/docs/ai/instructions)). Reads **no** directories. | resolves `AGENTS.md`. ⚠ Reads no rule dirs — cortex's generated trees are inert for Zed; rules reach it only via `AGENTS.md` content. ⚠ A leftover Cursor-era rules file (position 2) would silently outrank `AGENTS.md` — delete it if present. |
| **Claude Code** | `CLAUDE.md` → points to `AGENTS.md` + imports `@.claude/rules.md` | wired |
| **Codex** | `AGENTS.md` natively | nothing to add |
| **Gemini CLI** | `GEMINI.md` by default (`DEFAULT_CONTEXT_FILENAME`); reads `AGENTS.md` only when `contextFileName` is configured | `GEMINI.md` → `AGENTS.md` symlink committed, so Gemini loads the canonical file |
| Aider | `CONVENTIONS.md` via `.aider.conf.yml` | add if adopted |
| Copilot / VS Code | `.github/copilot-instructions.md` | add if adopted |

Tool-specific tweaks go **below** the import in that tool's own file — never
by forking `AGENTS.md`.

## Rules & skills: cortex keeps both harnesses in sync

This template does not hand-maintain `.agents/` rule dirs or `.claude/`. The
`@wolfgames/cortex` package symlinks the same rule/skill/command sources into
both on every `bun install`. There are **no per-harness rule directories**:
pack rules are single-source, one file per rule, `.md` preferred (with
`description`/`globs`/`alwaysApply` frontmatter) and legacy `.mdc` still
tolerated (some `guardrails/**` sources are `.mdc`, and `setup.mjs` still
accepts `.mdc` from `local/rules/`). The same source links into both sides:

```
.agents/rules/    ← <pack>/rules/*.md            (tool-agnostic)
.claude/rules/    ←        〃
.agents/skills/   ← <pack>/skills/<name>/        (same targets both sides)
.claude/skills/   ←        〃
.claude/rules.md  ← generated @-import index of all alwaysApply rules
```

Consequences:

- A new harness that reads `.agents/`-style or `.claude/`-style context gets
  it for free after `bun install`.
- Project-only context goes in `local/` (tracked), never directly in the
  generated folders.
- `docs/cortex-inventory.md` (generated) lists every active rule/skill/command
  and where it came from.

## MCP: wolf-game-kit (asset generation)

The wolf-game-kit MCP server (asset generation + CDN publish) is
**machine-local, not committed**: `.mcp.json` is gitignored and provisioned
by the workspace setup / Nucleo Studio CLI. The server reads
`ASSET_GEN_API_KEY` / `ASSET_GEN_HOST` from your environment (shell exports
or the gitignored project `.env` — see `.env.example`); pre-commit blocks any
staged real `wg_ag_` key.

Keep the server key `wolf-game-kit`: skill `allowed-tools` frontmatter
references tool names like `mcp__wolf-game-kit__*`, and a different key
silently breaks those allowlists. If the tools don't appear, fix the setup or
use the documented local fallback — see
[`docs/recipes/asset-pipeline.md`](../docs/recipes/asset-pipeline.md).

## Permissions & autonomy policy

Permission rules can't be shared across tools — each harness has its own
schema. The *policy* below is the single source of truth (tool-agnostic
prose); each tool's config implements it. Claude Code's implementation is
committed at `.claude/settings.json` (safe alongside cortex, which wipes only
`.claude/{rules,skills,commands}`).

- **Auto-allow (run unattended):** reads/searches, builds, tests, linters,
  formatters, dependency installs, dev-server runs, and file deletes
  (recoverable via git).
- **Prompt first (irreversible or outward-facing):** `git reset`,
  `git rebase`, `git push`, package publishes, deploys
  (`bun run amino:release`, `/deploy`).
- **Never (denied):** reading or printing secrets — `.env*`, `*.key`,
  `*.pem`, service tokens.

## Adding a new harness

1. Find its instruction file → symlink or point it to `AGENTS.md`.
2. Check whether cortex's generated `.agents/` or `.claude/` layout already
   feeds it; if not, add a target to cortex's `setup.mjs` rather than
   hand-copying rules.
3. Map its permission/approval mechanism to the policy above.
4. Add a row to the table above so this doc stays in sync.
