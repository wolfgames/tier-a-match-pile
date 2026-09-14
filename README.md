# Template Amino — Game Production Template

A production-ready template for building mobile web games — from prompt to
polished, shippable product. Describe a game idea and AI agents design and
build it; the template handles loading, screens, audio, tuning, analytics,
and errors so every game starts at production quality.

**North star:** games players can't put down — instantly playable, deeply
satisfying, compulsively replayable. The quality bar lives in
[`docs/GAME-DESIGN.md`](docs/GAME-DESIGN.md).

## Pick your path

### I'm a designer / artist / producer

You don't need to write code to shape the game.

1. Open [`docs/GAME-DESIGN.md`](docs/GAME-DESIGN.md) — it's the design source
   of truth, written in plain language. Fill in (or edit) the concept,
   mechanics, screens, and asset list. Agents read it before building
   anything.
2. Talk to the AI agent in your editor (Cursor, Claude Code, …) — describe
   what you want changed. The agent will ask when something is ambiguous and
   will update the design doc as decisions are made.
3. Ask the agent to generate art, sound, and music — it uses the Wolf Games
   asset generator and publishes everything to the CDN by default. If you
   have finished files of your own, tell the agent where they are and it
   will stage, name, and publish them through the same pipeline. (For quick
   local experiments the agent can also work with files in `public/assets/`
   — they move to the CDN before release.)
4. Tune the feel live: press backtick (`` ` ``) in the running game to open
   the tuning panel — no code, no rebuild.

### I'm an engineer

Prerequisites: [Bun](https://bun.sh), Node >= 22, and a GitHub Packages token
for `@wolfgames/*` (see [Setup](#setup) below).

```bash
git clone <repo-url>
bun install     # also wires AI rules/skills into .agents/ and .claude/
bun run dev     # http://localhost:5173
```

| Task | Command |
|------|---------|
| Dev server | `bun run dev` |
| Unit tests | `bun run test:run` |
| E2E smoke | `bun run test:e2e` |
| Typecheck | `bun run typecheck` |
| Format | `bun run format` |
| Build | `bun run build` |

Start with [`docs/INDEX.md`](docs/INDEX.md) — it routes every task to the
right doc. Required pre-reads before writing game code:
[best-practices](docs/standards/best-practices.md) and
[guardrails](docs/standards/guardrails.md); the hard boundaries live in
[`AGENTS.md`](AGENTS.md).

### I'm an AI agent

Read [`AGENTS.md`](AGENTS.md). It is the single source of truth for commands,
structure, boundaries, workflow, and the self-maintenance mandate.

## Setup

### GitHub Packages token

`@wolfgames/*` packages live on GitHub Packages. [`.npmrc`](.npmrc) reads
`NODE_AUTH_TOKEN` from your shell:

1. Create a classic token with `read:packages` at
   https://github.com/settings/tokens (or run `gh auth token`).
2. Add `export NODE_AUTH_TOKEN="ghp_..."` to `~/.zshrc` and reload.
3. Verify with `echo $NODE_AUTH_TOKEN`.

Full walkthrough (including the Cursor non-interactive-shell gotcha):
[`docs/guides/game-kit-setup.md`](docs/guides/game-kit-setup.md).

**Windows only:** enable Developer Mode before the first `bun install` — the
cortex postinstall uses symlinks. Without it, setup falls back to junctions or
copies (copies won't pick up cortex updates).

### MCP servers

Asset generation runs through the **wolf-game-kit MCP** — it lets agents
generate sprites, audio, music, and VFX directly, and publish them to the
CDN. Its config is machine-local (`.mcp.json` stays gitignored) and is
provisioned by the workspace setup / Nucleo Studio CLI. Two env vars
activate it (same pattern as `NODE_AUTH_TOKEN` above):

```bash
export ASSET_GEN_API_KEY="wg_ag_..."
export ASSET_GEN_HOST="https://asset-gen.qa.wolf.games"
```

Or put the same two lines in the project `.env` (gitignored). No keys live
in committed files — pre-commit blocks real keys. Getting a key:
[MCP Setup Guide (wolf-game-kit)](https://app.notion.com/p/wolfgames/MCP-Setup-Guide-wolf-game-kit-3794a337719981d59746e77c92843153).

Add other servers (e.g. Playwright for E2E debugging) to your local
`.mcp.json` the same way.

## How the AI context stays fresh

All AI rules and skills come from
[@wolfgames/cortex](https://github.com/wolfgames/cortex), symlinked into
`.agents/` and `.claude/` on every `bun install`. Nothing to maintain by
hand:

```bash
bun run cortex:refresh   # pull latest cortex content
bun run cortex:setup     # re-link (also runs automatically on install)
```

- Project-only rules/skills go in [`local/`](local/) (tracked in git).
- `docs/cortex-inventory.md` (generated) lists everything currently wired up.
- The repo itself learns over time: agents append to
  [`docs/LEARNINGS.md`](docs/LEARNINGS.md) and keep
  [`docs/GAME-DESIGN.md`](docs/GAME-DESIGN.md) current as part of every task.

## Architecture

```
src/
├── core/              # Scaffold framework — DO NOT EDIT
│   ├── systems/       # Assets, screens, tuning, audio, errors, pause, vfx
│   ├── ui/            # Button, Logo, MobileViewport, PauseOverlay
│   └── dev/           # TuningPanel (Tweakpane), inspector
│
├── game/              # YOUR GAME
│   ├── config.ts      # Identity, environment, screen wiring
│   ├── state.ts       # Runtime signals
│   ├── asset-manifest.ts  # Asset bundles (see manifest-contract recipe)
│   ├── screens/       # Loading, Start, Game, Results shells
│   ├── setup/ audio/ tuning/
│   └── mygame/        # Placeholder game — replace with yours
│
└── integrations/      # Publisher embed integration
```

Dependency rule: `core/` never imports from `game/`. Reusable building blocks
come from [`@wolfgames/components`](https://github.com/wolfgames/game-components)
(see [shared-components guide](docs/guides/shared-components.md)).

Full picture: [`docs/core/architecture.md`](docs/core/architecture.md).

## Tech stack

| Category | Technology |
|----------|------------|
| UI | SolidJS |
| Graphics | PixiJS 8 |
| Audio | Howler.js |
| Animation | GSAP |
| Build | Vite |
| Styling | TailwindCSS |

## Documentation

Everything routes through [`docs/INDEX.md`](docs/INDEX.md). Highlights:

| Topic | Doc |
|-------|-----|
| Design source of truth | [docs/GAME-DESIGN.md](docs/GAME-DESIGN.md) |
| Creating a new game | [docs/guides/new-game.md](docs/guides/new-game.md) |
| Best practices (required) | [docs/standards/best-practices.md](docs/standards/best-practices.md) |
| Guardrails (required) | [docs/standards/guardrails.md](docs/standards/guardrails.md) |
| Asset naming | [docs/guides/naming-convention.md](docs/guides/naming-convention.md) |
| Debugging | [docs/guides/debugging.md](docs/guides/debugging.md) |
| Agent harness support | [docs/AGENT-HARNESSES.md](docs/AGENT-HARNESSES.md) |
| Team learnings | [docs/LEARNINGS.md](docs/LEARNINGS.md) |
