# Docs Index

Routing table for everything in `docs/`. Start from what you're trying to do.

## Start here

| Doc | Who it's for |
|-----|--------------|
| [GAME-DESIGN.md](GAME-DESIGN.md) | **Everyone.** The design source of truth — designers write it, agents read it before building |
| [LEARNINGS.md](LEARNINGS.md) | Durable team memory — append dated learnings, newest first |
| [AGENT-HARNESSES.md](AGENT-HARNESSES.md) | How Claude Code / Cursor / Codex / new harnesses plug into this repo |

## I want to… (task routing)

| Task | Read |
|------|------|
| Start a new game from this template | [guides/new-game.md](guides/new-game.md), then [factory/newgame.md](factory/newgame.md) |
| Understand how the app is put together | [core/architecture.md](core/architecture.md), [core/entry-points.md](core/entry-points.md) |
| Write any game code (required pre-read) | [standards/best-practices.md](standards/best-practices.md) + [standards/guardrails.md](standards/guardrails.md) |
| Generate assets (images, spritesheets, SFX, music, VFX) | [recipes/asset-pipeline.md](recipes/asset-pipeline.md) — the wolf-game-kit MCP workflow |
| Publish assets to the CDN | [recipes/asset-pipeline.md](recipes/asset-pipeline.md) (`bun run assets:publish` → committed lockfile) |
| Add or name assets | [guides/naming-convention.md](guides/naming-convention.md), [recipes/asset-pipeline.md](recipes/asset-pipeline.md) |
| Register assets in the manifest | [recipes/manifest-contract.md](recipes/manifest-contract.md) |
| Add music or sound effects | [recipes/audio-setup.md](recipes/audio-setup.md) |
| Build gameplay state (ECS — the default, pre-wired in `src/game/mygame/ecs/`) | [guides/state-architecture.md](guides/state-architecture.md) |
| Add a real-time / per-frame loop (physics, movement, orbit, matter.js) | [../src/game/mygame/ecs/README.md](../src/game/mygame/ecs/README.md) (fixed-step + systems), [guides/state-architecture.md](guides/state-architecture.md) |
| Animate things / improve game feel | [guides/animation-cookbook.md](guides/animation-cookbook.md) |
| Use shared components (check before writing new ones) | [guides/shared-components.md](guides/shared-components.md), catalog at `node_modules/@wolfgames/components/src/modules/INDEX.md` |
| Write a new module | [modules/writing-a-module.md](modules/writing-a-module.md), [standards/agent-friendly-modules.md](standards/agent-friendly-modules.md) |
| Save/load player progress | [recipes/progress-persistence.md](recipes/progress-persistence.md) |
| Hit 60fps / fix jank | [standards/performance.md](standards/performance.md) |
| Make it work well on phones | [standards/mobile.md](standards/mobile.md) |
| Size or position anything in a screen (design canvas, no breakpoints) | [standards/guardrails.md](standards/guardrails.md) §22, then `@wolfgames/components` `docs/standards/components.md` §9 |
| Debug a problem | [guides/debugging.md](guides/debugging.md), then [guides/troubleshooting.md](guides/troubleshooting.md) |
| Set up GitHub Packages auth | [guides/game-kit-setup.md](guides/game-kit-setup.md) |
| Deploy to QA/staging/production | [factory/deploy.md](factory/deploy.md) |

## Standards (rules to follow)

| Doc | What it covers |
|-----|----------------|
| [best-practices.md](standards/best-practices.md) | Project structure, assets, modules, game contract, animation |
| [guardrails.md](standards/guardrails.md) | Anti-patterns that silently break games |
| [performance.md](standards/performance.md) | 60fps optimization, profiling, memory management |
| [mobile.md](standards/mobile.md) | Viewport, gestures, keyboard, canvas resize, pull-to-refresh |
| [agent-friendly-modules.md](standards/agent-friendly-modules.md) | Rubric for modules agents can use reliably |

## Reference

| Doc | What it covers |
|-----|----------------|
| [schemas/manifest.schema.json](schemas/manifest.schema.json) | Asset manifest JSON schema |
| [guides/naming-convention.schema.json](guides/naming-convention.schema.json) | Asset naming JSON schema |
| [core/scaffold-update-check.yml](core/scaffold-update-check.yml) | GH Actions template — copy into game repos to get scaffold-update notifications |
| `cortex-inventory.md` (generated) | Every active AI rule/skill/command and its origin — regenerated on install |
| GameKit API | See the game-sdk repo — auth, analytics, assets, Sentry, data CRUD |

## Factory Commands

| Command | What it does |
|---------|--------------|
| [/newgame](factory/newgame.md) | Setup checklist for forking a new game |
| /newmodule | Scaffold a new module (see `.agents/skills/amino-new-module/`) |
| [/deploy](factory/deploy.md) | Deploy to QA/staging/production |

---

**Keeping this index current is part of every task** — when you add, move, or
delete a doc, update the tables above in the same change (see "Maintaining the
agent-facing docs" in [AGENTS.md](../AGENTS.md)).
