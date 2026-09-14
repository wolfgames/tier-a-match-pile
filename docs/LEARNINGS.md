# Learnings

> Durable, non-obvious learnings from working in this repo. Append-only,
> newest first, dated. Each entry: **What** happened / was discovered, and
> **Why it matters** for the next person or agent.
>
> Write here when: a bug took real digging, an API behaved unexpectedly, a
> convention exists for a non-obvious reason, or a approach was tried and
> rejected. Prune entries that become obsolete.
>
> Don't write here: task summaries, ephemeral notes, anything already covered
> by docs/ — link to docs instead of duplicating them.

<!-- Template:

## YYYY-MM-DD — Short title

- **What:** ...
- **Why it matters:** ...

-->

## 2026-06-11 — App fails to mount with @wolfgames/components@0.1.30

- **What:** The e2e smoke test (`bun run test:e2e`) fails because the app
  never mounts: the browser throws
  `The requested module '/node_modules/react/jsx-runtime.js' does not provide
  an export named 'jsx'`. Root cause is upstream — the published
  `@wolfgames/components@0.1.30` shipped
  `dist/modules/primitives/loader-bar/renderers/solid.js` compiled with the
  React JSX transform instead of Solid's (its source glob in the
  game-components build config missed `src/modules/primitives/**/renderers/solid.tsx`).
  `LoadingScreen → ContentLoader → LoaderBar` hits that file and crashes boot.
- **Why it matters:** Any consumer of 0.1.30 that renders `ContentLoader` is
  broken at runtime. Fix belongs in game-components (widen the solid plugin
  `include` and republish). Once a fixed version is published, bump the
  dependency here and the smoke tests should pass unchanged.

