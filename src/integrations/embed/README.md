# Embed Integration

Wires the game into a publisher-embed context. Source of truth: the
cortex skill `amino-embed-integration`.

## URL contract

The game is "embedded" when the URL contains `mode=embedded`. Other
params are read from the URL:

- `bundleId` — content bundle identifier (fetched from `VITE_EMBED_STORAGE_URL`)
- `hookId` — which hook interaction to show in the attract gate
- `clickUrl` — where to navigate the top window when the player engages

In standalone mode (no params), the game boots normally.

## Wiring

`src/app.tsx` wraps the root in `<EmbedProvider>` and slots
`<AttractGate>` around the game shell. The `hook` slot renders the
attract interaction; the wrapped children mount only after engagement
(or immediately in standalone mode).

```tsx
<EmbedProvider>
  <AttractGate hook={(engage) => <EmbedHook engage={engage} />}>
    <GameShell />
  </AttractGate>
</EmbedProvider>
```

Replace `EmbedHook` with a real attract interaction for your game.

## Outcome contract

On engagement, the game calls `engage({ score, correct, hookId })`.
That value is encoded onto `clickUrl` and the top window navigates
to the result, completing the publisher attribution loop.

## Environment

- `VITE_EMBED_STORAGE_URL` — base URL where bundles live; the
  loader fetches `${VITE_EMBED_STORAGE_URL}/<bundleId>/config.json`
  and `.../game.json`.
