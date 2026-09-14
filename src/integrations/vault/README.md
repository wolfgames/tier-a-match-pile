# Vault Integration

Wires the game into the **Games Vault** host environment. Sibling of
`embed/` — a cross-cutting host integration, not a game-internal module.

Built on `@wolfgames/client` **0.1.36+** (`modules/hostContext`).

The bridge here is **game-agnostic** and ships in the template for every fork.
The game-specific *content consumer* is not shipped — you write it (see
[Daily Editions consumer seam](#daily-editions-consumer-seam) below).

## Two independent axes

Being launched inside Vault and offering Daily Editions are **orthogonal** —
one does not imply the other.

- **Hosted by Vault** — `inVault()` is true (the game was launched with the
  Vault's `wolfHost`/`wolfSurface` params). Host-driven, decided by the launch
  URL. `<VaultHostBridge />` always runs here and no-ops everywhere else.
- **Daily mode** — the game passes a `catalog` and handles `content` selections.
  This is **game-content-driven**: your game's own call about whether it has
  dated content to offer. There is no host-side or URL `daily` signal. A game
  can be Vault-hosted with no Daily Editions, or offer content without one.

## The wire contract (0.1.36)

```
Game -> Vault: content_catalog  (optional scheduling metadata)  ┐ startVaultRuntime
Game -> Vault: ready            (first non-loading screen)       ┘ sends these in order
Vault -> Game: context          (re-sent on selection; may arrive the instant Vault sees `ready`)
... gameplay ...
Game -> Vault: content_completed (per-content completion boundary; deduped)
Game -> Vault: play_ended        (session exit only, never completion)
```

**`ready` gates the reveal.** `startVaultRuntime` sends `ready` synchronously,
and the Vault may reveal the iframe and push a `context` the moment it sees it.
So `ready` means "the player can see and interact", not "the tree mounted":
`<VaultHostBridge>` holds the runtime until the first non-`loading` screen (see
[Host runtime bridge](#host-runtime-bridge-generic-always-mounted)). Context is
**unauthenticated**: never gate entitlement, unlocks, or access on it.

The context shape the game receives:

```ts
interface VaultGameContext {
  gameSessionId: string;
  host: VaultRuntimeHost; // partnerId, vaultId, siteId?, cohort?, distinctId?, vaultSessionId?, ...
  content: { type: 'default' } | { type: 'content'; contentId: string };
}
```

## Host runtime bridge (generic, always mounted)

`<VaultHostBridge />` is the **single owner** of `startVaultRuntime` for the
app. On the first non-`loading` screen it subscribes the context listener,
sends the optional `content_catalog`, then `ready` — in that order, once (a
later `results -> game` revisit must not restart it). It reports `play_ended`
on session exit (`startVaultRuntime` fires it on `beforeunload`; the bridge
also fires it on SPA cleanup). It reads `useScreen()` to time `ready`, so it
**must** mount inside `<ScreenProvider>`. **Inert standalone:** it
early-returns `null` when `!inVault()`, so outside Vault nothing subscribes or
fires and games run identically.

> **One `startVaultRuntime` per page.** The SDK keeps a single active runtime
> (a module-global play-ended sender, an unconditional `ready`). Do not call
> `startVaultRuntime` or `reportGameReady` yourself — route content handling
> through this bridge's props instead.

### Wiring into app.tsx

The template mounts it **by default** as `<VaultHostBridge />`, inside
`<ScreenProvider>` (it reads `useScreen()` to time `ready`) and under
`<AssetProvider>`, at the marker comment before `<AttractGate>` — that mount
point matters for the content-consumer hazard below.

```tsx
import { VaultHostBridge } from '~/integrations/vault';

// lifecycle only (template default):
<VaultHostBridge />

// content fork — pass handling in, no second bridge:
<VaultHostBridge onContext={handleContext} catalog={myCatalog} />
```

`app.tsx` is game-owned and **not** covered by `amino-sync` — this wiring is
durable in a fork and never clobbered by `bun run amino:sync`.

### Host analytics fields

`vaultHostFields()` returns a flat snapshot of the host/session metadata
(partner/site/vault id, config version, cohort, anonymous + distinct id,
session ids) from the latest context — for analytics attribution only. Never an
entitlement signal. `latestVaultContext()` returns the raw last context.

These are **pull-based**: sample them when you emit an event. A fork that
instead wants *push*-reactive analytics (restamp super-properties the moment
context changes) alongside content maps both from its one `onContext` handler.

## Daily Editions consumer seam

Daily Editions are **opt-in and game-specific**, built from two SDK primitives
re-exported from this module:

- **`catalog`** (via `<VaultHostBridge catalog={...} />`) — temporary
  scheduling metadata, `readonly { contentId, availableFrom }[]`, sent as
  `content_catalog` before `ready`. The Vault owns all sorting, selection and
  pacing; this is metadata only. Read once when the runtime starts, so populate
  it synchronously — an async/signal-built catalog still `undefined` then is
  sent empty with no error.
- **`onContext`** (via `<VaultHostBridge onContext={...} />`) — receives each
  resolved `VaultGameContext`. Map `content` onto your game's content:
  `{ type: 'default' }` → your normal/authored run; `{ type: 'content', contentId }`
  → resolve `contentId` and start it. Identical re-sends are ignored by the SDK.
  **Only `contentId` comes back on the wire** — the `availableFrom` date and any
  other metadata you put in the `catalog` do *not* round-trip. The Vault treats
  `contentId` as opaque; resolve the date/thumbnail/etc. from your own authored
  catalog by that id.
- **`reportContentCompleted(contentId)`** — call at your game's completion
  boundary for that content. Deduped per `gameSessionId + contentId`, so the
  same content can complete again under a new session.
- **`reportGameCompleted()`** — the default/authored run completed (deduped per
  `gameSessionId`).

To enable Daily mode, create **`src/game/setup/vault-content.tsx`** that owns
your content mapping and either renders `<VaultHostBridge onContext=… catalog=…/>`
itself, or lifts those handlers up to the `app.tsx` mount. Mount inside
`<ScreenProvider>` and under `<AssetProvider>`.

### Consumer hazards (read before writing yours)

Each is genuinely game-specific and must be handled in your consumer:

1. **Deciding *when* content is complete is game-owned.** The SDK only exposes
   `reportContentCompleted()`; *what* counts as "done" — a cleared board, a
   finished quiz, the last level of a pack — only your content model knows.
   Call it from your own completion boundary (e.g. your win handler).

2. **A *new* context can arrive mid-play.** The host may push a fresh selection
   while the player is still in a board, or during a win → results transition
   already in flight. Reloading the instant `onContext` fires can interrupt that
   transition or yank the board out from under the player. Prefer to **remember
   the pending selection and act on it once a safe screen is reached** (e.g.
   re-check on screen change and reload only when back on `results`).

3. **Do not activate content during `loading`.** Starting content while the app
   is still on the `loading` screen parks the GPU bundle load and the screen
   never renders — defer via a `pendingContent` signal until
   `current() !== 'loading'`. This is why the bridge stays under
   `<AssetProvider>`.

4. **`{ type: 'default' }` after a selection is a *deselection*.** The host can
   switch back from a chosen `content` to its own authored/default content
   mid-session. Treating `default` as a no-op leaves your last selection live —
   the player keeps playing content the Vault has moved off. When `default`
   arrives *and* content was active, actively drop it (clear the active id,
   notify downstream) and fall back to your normal run. Only ignore `default`
   when nothing was selected in the first place.

### Consumer sketch (adapt to your content model)

```tsx
import { createSignal } from 'solid-js';
import { useScreen } from '~/core';
import {
  VaultHostBridge,
  reportContentCompleted,
  type ScheduledContentMetadata,
  type VaultGameContext,
} from '~/integrations/vault';

const CATALOG: readonly ScheduledContentMetadata[] = [
  { contentId: 'my-pack-2026-09-01', availableFrom: '2026-09-01' },
];

export function VaultContentBridge() {
  const { current } = useScreen();
  const [pending, setPending] = createSignal<string | null>(null);

  let activeContentId: string | null = null;

  const handleContext = (ctx: VaultGameContext) => {
    if (ctx.content.type === 'default') {
      if (activeContentId === null) return; // nothing was selected — no-op
      activeContentId = null; // hazard 4: deselection — drop the live content
      startDefaultRun(); // fall back to your normal/authored run
      return;
    }
    const { contentId } = ctx.content;
    activeContentId = contentId;
    if (current() === 'loading') setPending(contentId); // hazard 3
    else startContent(contentId); // your resolver; defer per hazard 2
  };

  // ...drain `pending` once past 'loading'; call
  // reportContentCompleted(contentId) at your completion boundary (hazard 1).

  return <VaultHostBridge onContext={handleContext} catalog={CATALOG} />;
}
```

When you own the content consumer, mount **`<VaultContentBridge />`** in
`app.tsx` instead of the bare `<VaultHostBridge />` — it renders the single
bridge with your handlers.
