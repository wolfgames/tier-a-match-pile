# Entry Points

How the app boots -- the entry point files at the root of `src/` and what each one does.

---

## Overview

This is a **Vite** app (not SolidStart). There is a single entry point through `index.html`:

```
Browser: index.html  ->  loads app.tsx  ->  interactive app
```

| File | Runs On | Purpose |
|------|---------|---------|
| `index.html` | Browser | HTML shell -- `<head>`, viewport meta, font preload, mount point |
| `app.tsx` | Browser | Root component -- provider stack, screen routing, dev tools |

---

## index.html -- The HTML Shell

The static HTML document served by Vite. Contains the minimal structure needed before JavaScript executes.

**What it contains:**

| Element | Purpose |
|---------|---------|
| `<meta charset>` | Character encoding |
| `<meta viewport>` | Mobile viewport config (`viewport-fit=cover`, no user scaling) |
| `<link rel="preload">` | Font preload to prevent FOUT (Flash of Unstyled Text) |
| `<script type="module" src>` | Vite entry that loads app.tsx |
| `<div id="app">` | Mount point for the Solid.js app |

### Dynamic Viewport Height

An inline script runs immediately (before any framework JS) to handle mobile browsers where the address bar changes the viewport height:

```javascript
var vh = window.innerHeight * 0.01;
document.documentElement.style.setProperty('--dynamic-vh', vh + 'px');
```

This gives CSS access to `--dynamic-vh` which updates on resize and orientation change. Use `calc(var(--dynamic-vh, 1vh) * 100)` instead of `100vh` to get the real visible height on mobile.

### When to Edit

- **New game font**: Update the `<link rel="preload">` path to your WOFF2 file
- **New meta tags**: Add OpenGraph, favicon, etc. in the `<head>`
- **Never**: Remove the viewport script or viewport meta tag

---

## app.tsx -- The Root Component

The actual application component tree. This is where the core provider stack lives.

### Provider Stack

The providers nest in a specific order (outer -> inner):

```
GlobalBoundary              <- Error boundary (catches everything)
  TuningProvider            <- Live config system (dev tuning panel)
    AnalyticsProvider       <- Game analytics (PostHog, etc.)
      FeatureFlagProvider   <- Feature flag evaluation
        ViewportModeWrapper <- Mobile viewport frame (small/large/none)
          PauseProvider     <- Pause/resume state
            ManifestProvider <- Level manifest loading (takes manifest, defaultGameData, serverStorageUrl props)
              AssetProvider  <- Asset loading (Pixi, Howler, DOM)
                ScreenProvider <- Screen routing (goto/back)
                  ScreenRenderer <- Renders current screen
```

Each provider makes its hook available to everything nested inside it:
- `useTuning()` -- available everywhere below `TuningProvider`
- `useAssets()` -- available in screens (below `AssetProvider`)
- `useScreen()` -- available in screens (below `ScreenProvider`)

### Dev-Only Features

Wrapped in `<Show when={IS_DEV_ENV}>`:
- **TuningPanel** -- Press backtick (`` ` ``) to open live parameter editing
- **ViewportToggle** -- Top-left button to cycle viewport modes (S/L/full), located at `core/ui/ViewportToggle.tsx`
- **Reset Progress** -- In settings menu (top-right)

### Initialization (onMount)

Runs once on client after mount:
1. **Sentry** -- Error tracking (lazy-loaded)
2. **Global error handlers** -- Window-level error/rejection catching
3. **Pause keyboard** -- Spacebar pause listener

### When to Edit

- **New game**: Update `GAME_DEFAULTS` import in `TuningProvider`
- **New provider**: Add to the provider stack in the correct order
- **New dev tool**: Add inside `<Show when={IS_DEV_ENV}>`
- **Never**: Remove `GlobalBoundary`, `AssetProvider`, or `ScreenProvider`

---

## Boot Sequence (Timeline)

```
1. Browser loads index.html
   └── Viewport script runs immediately (--dynamic-vh set)
   └── Font file starts downloading (from preload link)

2. Vite loads app.tsx as module
   └── Solid.js renders the component tree into #app

3. app.tsx onMount fires
   ├── Sentry initialized
   ├── Error handlers attached
   └── Pause keyboard listener attached

4. Provider stack initializes top-down
   ├── GlobalBoundary catches errors
   ├── TuningProvider loads config
   ├── AnalyticsProvider initializes tracking
   ├── FeatureFlagProvider evaluates flags
   ├── ViewportModeWrapper applies viewport frame
   ├── PauseProvider initializes pause state
   ├── ManifestProvider loads level manifest
   ├── AssetProvider prepares loaders
   └── ScreenProvider renders initial screen (loading)

5. LoadingScreen begins
   └── Game begins
```

---

## Per-Game Changes

When creating a new game, these are the only entry point changes needed:

| File | Change | Why |
|------|--------|-----|
| `index.html` | Update font `<link>` path | Preload your game's font |
| `app.tsx` | Update `GAME_DEFAULTS` import | Point to your tuning defaults |
| `app.tsx` | Update `manifest` / `defaultGameData` imports | Point to your game data |
| `app.tsx` | Update `AnalyticsProvider` / `FeatureFlagProvider` | Wire your analytics/flags |

Everything else (screens, assets, audio) is configured through [game/config.ts](../../src/game/config.ts) and the core provider stack handles the rest.

---

## Related

- [Architecture](architecture.md) -- 3-tier design, contracts, provider stack
