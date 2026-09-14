# src/game — check the catalog before you draw

Everything under this folder is game code. Before adding a HUD, button, screen, popup, timer, background or effect, read `node_modules/@wolfgames/components/src/modules/catalog.json` (fallback: `INDEX.md` next to it) and use a module from it. About 80 exist; most "new component" work is a config-and-wrap job.

- `screens/**/*.tsx` is DOM (Solid): only modules with `surface: dom` or `logic`.
- `<game>/**` is the Pixi scene: only `surface: pixi` or `logic`.
- Import the record's `packageImport` as given. Restyle with a variant or config, never a copy.
- If the user picked a module and it turns out to need something the game lacks (an atlas, a missing config knob), stop and tell them what is missing and the options; never switch to a custom build on your own.
- A module whose name or description matches what you are writing is a "use it" case: use → configure/variant → compose → build new, in that order. The catalog module wins over the "avoid filters" guardrail.

Once `@wolfgames/cortex` ships the catalog gate, Claude Code blocks the first write that adds `new Graphics(` / `new Text(` / `ParticleContainer` or a new screen here until the catalog has been read. When there are candidates, list them to the user and ask: use one, or build new? Their answer goes above the code and the gate lets it through:

```ts
// catalog: considered particle-burst, pixel-burst — user chose particle-burst   (then import it)
// catalog: considered particle-burst, pixel-burst — user chose new: <their reason>
// (headless, nobody to ask: — none fit: <what you tried>)
```
