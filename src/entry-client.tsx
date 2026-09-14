/* @refresh reload */
import { render } from "solid-js/web";
import { resolvePlayerId, whenStoresReady } from "~/core";
import App from "./app";

// Load game font in parallel with app mount (ready before any Pixi Text is created)
const gameFont = new FontFace('Baloo', "url('/assets/fonts/Baloo-Regular.woff2')");
gameFont.load().then((loaded) => document.fonts.add(loaded));

// Resolve the stable player id, then let module-scope versioned stores hydrate
// (allSettled — one store's backend failure can't reject boot), before first
// render (so sync store.load() serves real persisted data). Never rejects.
async function boot() {
  await resolvePlayerId();
  await whenStoresReady();
  render(() => <App />, document.getElementById("app")!);
}
void boot();
