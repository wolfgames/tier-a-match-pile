/* @refresh reload */
import { render } from "solid-js/web";
import { resolvePlayerId, whenStoresReady } from "~/core";
import App from "./app";
import "./game/match-pile/fontsReady";

// Importing fontsReady kicks off the Montserrat font-load in parallel with app mount
// (see src/game/match-pile/fontsReady.ts) — game screens await it before first Pixi paint.

// Resolve the stable player id, then let module-scope versioned stores hydrate
// (allSettled — one store's backend failure can't reject boot), before first
// render (so sync store.load() serves real persisted data). Never rejects.
async function boot() {
  await resolvePlayerId();
  await whenStoresReady();
  render(() => <App />, document.getElementById("app")!);
}
void boot();
