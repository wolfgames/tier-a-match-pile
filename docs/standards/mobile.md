# Mobile Development

Standards for mobile web games on iOS and Android.

---

## Essential Setup

### Viewport Meta Tag

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
>
```

### Base CSS

```css
html, body {
  position: fixed;
  overflow: hidden;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overscroll-behavior: none;
}

#game-container {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}

/* Prevent image drag */
#game-container img {
  -webkit-user-drag: none;
  user-drag: none;
  pointer-events: none;
}
```

### Audio Unlock

```typescript
// Must call on first user interaction
function handleFirstTap() {
  unlockAudio();  // From useAssets()
}
```

---

## Dynamic Viewport Height

Mobile browser toolbars show/hide dynamically, making `100vh` unreliable.

### CSS-Only (preferred)

```css
.game-container {
  height: 100vh;   /* Fallback */
  height: 100dvh;  /* Dynamic viewport height */
}
```

| Unit | Meaning |
|------|---------|
| `100vh` | Static viewport (includes hidden toolbar) |
| `100dvh` | Dynamic viewport (actual visible area) |
| `100svh` | Small viewport (toolbar visible) |
| `100lvh` | Large viewport (toolbar hidden) |

### JavaScript fallback

```typescript
export function setupDynamicViewport() {
  function update() {
    const vh = window.innerHeight;
    document.documentElement.style.setProperty('--dynamic-vh', `${vh}px`);
  }

  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);

  return () => {
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
  };
}
```

### Safe Areas

```css
.game-ui {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

---

## Disable Browser Gestures

Browser gestures that break games: pinch-zoom, swipe navigation, double-tap zoom, long press context menu.

### CSS (`touch-action`)

```css
#game-container {
  touch-action: none;        /* Block ALL gestures */
  -ms-touch-action: none;    /* IE/Edge legacy */
}
```

| Value | Effect |
|-------|--------|
| `none` | Block all gestures (scroll, zoom, swipe) |
| `manipulation` | Allow scroll and tap, block zoom |
| `pan-x` | Allow horizontal scroll only |
| `pan-y` | Allow vertical scroll only |

For games, use `none` on the game container.

### JavaScript backup

```javascript
const container = document.getElementById('game-container');

// Block all default touch behavior
['touchstart', 'touchmove', 'touchend'].forEach(event => {
  container.addEventListener(event, (e) => {
    e.preventDefault();
  }, { passive: false });
});

// Block iOS gesture events
['gesturestart', 'gesturechange', 'gestureend'].forEach(event => {
  container.addEventListener(event, (e) => {
    e.preventDefault();
  });
});

// Block context menu
container.addEventListener('contextmenu', e => e.preventDefault());
```

---

## Disable Pull-to-Refresh

| Platform | CSS Solution | JS Needed? |
|----------|--------------|------------|
| Android Chrome | `overscroll-behavior: contain` | No |
| iOS Safari | Partial support | Yes |

### CSS (Android)

```css
html, body {
  overscroll-behavior-y: contain;
  overflow: hidden;
  height: 100%;
}
```

### JavaScript (iOS)

```javascript
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    touchStartY = e.touches[0].clientY;
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  const scrollTop = document.documentElement.scrollTop;
  const touchY = e.touches[0].clientY;

  if (scrollTop === 0 && touchY > touchStartY) {
    e.preventDefault();
  }
}, { passive: false });
```

---

## Disable Keyboard & Text Selection

```css
#game-container {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
```

Avoid focusable elements (`<input>`, `<textarea>`, `<select>`, `contenteditable`) inside the game container. If you need text input, use a separate overlay outside the game container.

---

## Canvas Resize

### Pixi.js with `resizeTo`

```typescript
const app = new Application();

await app.init({
  resizeTo: window,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio, 2),
});
```

When using `resizeTo`, dimensions update asynchronously — wait a frame before reading `app.screen`:

```typescript
app.ticker.addOnce(() => {
  game.centerOnScreen(app.screen.width, app.screen.height);
});
```

### Solid.js + Pixi Integration

```tsx
import { onMount, onCleanup } from 'solid-js';
import { Application } from 'pixi.js';

export function PixiGame() {
  let containerRef: HTMLDivElement;
  let app: Application;

  onMount(async () => {
    app = new Application();

    await app.init({
      resizeTo: containerRef,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio, 2),
    });

    containerRef.appendChild(app.canvas);

    function handleResize() {
      containerRef.style.height = `${window.innerHeight}px`;
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    onCleanup(() => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      app.destroy(true);
    });
  });

  return (
    <div
      ref={containerRef!}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
}
```

---

## Platform Differences

| Feature | iOS Safari | Android Chrome |
|---------|------------|----------------|
| `overscroll-behavior` | Partial support | Full support |
| `100dvh` | Supported | Supported |
| Audio unlock | Required | Required |
| Safe areas | Notch + home indicator | Varies by device |
| Pull-to-refresh | Needs JS workaround | CSS works |

---

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Canvas too tall | Using `100vh` | Use `window.innerHeight` or `100dvh` |
| Touch misaligned | Resolution mismatch | Set `autoDensity: true` |
| Blurry on mobile | Low resolution | Cap at `devicePixelRatio` of 2 |
| Resize flicker | No debounce | Debounce resize events |
| Wrong size on load | Async resize | Wait a frame before centering |

---

## Testing Checklist

- [ ] Audio plays after first tap
- [ ] No pull-to-refresh triggers
- [ ] No accidental zoom
- [ ] No text selection in game
- [ ] Keyboard doesn't appear
- [ ] Game fits viewport (no scroll)
- [ ] Works in both orientations
- [ ] Safe areas respected
- [ ] Toolbar show/hide handled
