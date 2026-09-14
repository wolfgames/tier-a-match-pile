# `identity` — player identity singleton

Template-owned, **core-tier** module that resolves a single stable player id
once at boot and exposes it as an app-wide singleton the whole codebase reads —
component tree *and* plain module code. The Vault token bridge is one code path
*inside* it; identity is broader than embedding.

It lives in core (not `src/integrations/`) deliberately: the
`createVersionedStore` consumer also lives in core and cannot import upward
(dependencies flow downward only), and core is the `amino:sync`-owned,
un-forkable layer — correct for a security-sensitive contract games must not
diverge.

## Public surface

```ts
import {
  resolvePlayerId,
  getResolvedPlayerId,
  getResolvedIdentityService,
  getPlayerIdentityService,
} from '~/core';
```

- `resolvePlayerId(): Promise<string>` — memoized boot path. Races the backend
  `PlayerIdentityService.identify()` against a ~2.5s budget. **Always resolves
  to a string, never rejects.** `entry-client` awaits it once before render.
- `getResolvedPlayerId(): string | null` — synchronous accessor, valid after
  resolution. How `AnalyticsProvider` reads the id at construction.
- `getResolvedIdentityService(): PlayerIdentityService` — a **no-network**
  `PlayerIdentityService` stand-in bound to the resolved id (backend uuid when
  signed in, else the local id). This is what the storage wrapper hands
  `GameSaveService` to key its localStorage envelope without risking the network
  throw the real service raises offline. Its `identity.isAnonymous` is pinned
  `true` on purpose — see **Save-wipe pin** below.
- `getPlayerIdentityService(): PlayerIdentityService` — memoized **real** service
  carrying the authenticated session/token, for consumers (score sync, a future
  cloud-backed save) that must call the backend *as this player*.

## Behavior

- **Vault bridge.** When embedded (`?wolfHost=` present and a valid http(s)
  origin), the service is built with a `BridgedTokenStore` so the shelf's
  session is borrowed. The origin is *validated, not trusted* — anything that is
  not a concrete http(s) origin is ignored and the game falls back to a
  standalone (origin-scoped) session.
- **Local fallback.** No backend / bridge down / offline → mint and persist a
  local id under the `player_id` key. If storage is blocked (partitioned frame),
  return an ephemeral id without throwing. Ids use `crypto.randomUUID` with a
  non-secure-context fallback generator.
- **Host resolution.** Per-environment map keyed on `VITE_APP_ENV`
  (`player-data.{env}.wolf.games`), with an optional `VITE_PLAYER_DATA_HOST`
  override for local/custom hosts.

## One id, three consumers

The boot-resolved id (`resolvePlayerId()` → `getResolvedPlayerId()`) is the
single player key for the whole app. All three identity-sensitive subsystems
read it, so the same human is one id everywhere — analytics events, save state,
and flag buckets share a join key:

- **Analytics** — `app.tsx` passes `getResolvedPlayerId()` to `AnalyticsProvider`
  as `userId`. The boot gate (`entry-client` awaits `resolvePlayerId()` before
  render) guarantees it is resolved before the provider constructs.
- **Save** — `createVersionedStore` (`~/core/utils/storage.ts`) hands
  `getResolvedIdentityService()` to `GameSaveService`, keying the envelope by the
  same id.
- **Feature flags** — `src/game/setup/flags.ts` keys the flag cache by the same
  resolved id (via a getter, since it registers at module load, before
  resolution). PostHog bucketing already follows the analytics identity above;
  this only aligns the local cache key.

There is no separate `uid` identity for these paths. `player_id` (below) is the
shared local key.

## Sticky resolved id

`identify()` on a backend-configured env (QA/Staging/Prod, and Dev) mints a
**backend** anonymous uuid — not our local `player_id`. So without care the
resolved id would flip between that backend uuid and a local id every time
`identify()` misses its budget on a flaky network, splitting one player into two
ids across sessions (analytics, flags, and the save envelope all diverge).

`resolvePlayerId()` prevents that: on a successful `identify()` it persists the
backend uuid onto the local `player_id` key (`rememberResolvedPlayerId`), so a
later timeout falls back to *that* uuid instead of minting a fresh one. Once the
backend has been reached, the id is stable regardless of network. The pin below
still covers the one-time transition the first time the backend is reached (a
save created under a local id is adopted to the backend uuid).

## Save-wipe pin

`getResolvedIdentityService()` pins `identity.isAnonymous` to `true` rather than
sourcing it from the resolved identity. This gates the SDK's cross-player
save-**wipe**: `GameSaveService.load()` only clears a mismatched save when the
stored envelope's `isAnonymous === false`; with `true` it always takes the
softer **adopt** branch (re-key the save to the current uuid).

The pin is **inert today**: nothing in `src/` calls `completeSignIn` / `logout`,
and both `identify()` paths (backend `anonymous-login` and the local fallback)
return `isAnonymous: true`, so no identity is ever `false` — the wipe branch is
unreachable whether we hardcode `true` or source it. The naive one-line "fix"
(passing real `isAnonymous`) therefore changes nothing today.

It becomes meaningful only when a sign-in flow lands (`completeSignIn` produces
`isAnonymous: false`), re-enabling the wipe so Player B on a shared device can't
inherit Player A's save. Two things must be true before flipping it: the sticky
resolved id above (done — so a signed-in player's timeout presents their *same*
uuid, not a local one, and never hits the wipe by accident), **and** a real
sign-in path to exercise and test the wipe branch against. Until that exists the
pin stays. See the comment at `identity.ts` and ENG-4222.

## Forward constraint

Identity resolves **before mount** (`entry-client` awaits `resolvePlayerId()`),
so any future store built on it must not read the id at construction
(module-load) — only at hydrate / first `load()`, which runs post-mount when
resolution is already complete.

## `player_id` key

Our own local fallback key, kept identical to the `ANONYMOUS_ID_KEY` that
`@wolfgames/components`' built-in anonymous-identity path uses
(`analytics-state.core.ts`), so a player's id stays continuous no matter which
path mints it. This module owns identity for the template and feeds the resolved
id into `AnalyticsProvider` via `userId` (see **One id, three consumers**); when
`AnalyticsProvider` is handed that `userId` it skips its own minting entirely, so
the two stay in lockstep. Keep the two key constants identical.
