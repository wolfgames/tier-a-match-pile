# Debugging Guide

Daily reference for debugging Pixi.js, GSAP, and Solid.js games.

---

## Browser DevTools

### Pixi Inspector

Install the [Pixi.js DevTools](https://chrome.google.com/webstore/detail/pixijs-devtools) Chrome extension.

```typescript
// Expose app globally for inspector
if (import.meta.env.DEV) {
  (window as any).__PIXI_APP__ = app;
}
```

**What you can do:**
- Inspect display object tree
- Toggle visibility of containers
- View texture memory usage
- Check blend modes and filters

### Console Helpers

Add to your game class for quick debugging:

```typescript
// src/game/mygame/MyGame.ts

if (import.meta.env.DEV) {
  (window as any).game = this;
  (window as any).grid = this.grid;
  (window as any).tiles = this.tiles;
}
```

Then in console:
```javascript
game.tiles[0].rotation      // Check tile state
grid.children.length        // Count children
game.scale.set(0.5)         // Zoom out to see everything
```

---

## Common Issues

### Sprites Not Showing

| Symptom | Check | Fix |
|---------|-------|-----|
| Invisible sprite | `sprite.visible`, `sprite.alpha` | Set to `true` / `1` |
| Black rectangle | Texture not loaded | Check asset bundle loaded |
| Wrong position | Parent transform | Log `sprite.getGlobalPosition()` |
| Behind other sprites | z-order | Use `parent.sortChildren()` or `zIndex` |

```typescript
// Debug visibility
console.log({
  visible: sprite.visible,
  alpha: sprite.alpha,
  worldVisible: sprite.worldVisible,
  position: sprite.getGlobalPosition(),
  bounds: sprite.getBounds(),
});
```

### GSAP Animations Not Running

```typescript
// Check if GSAP ticker is paused
console.log(gsap.globalTimeline.paused());

// List active tweens
gsap.getTweensOf(target);

// Kill stuck animations
gsap.killTweensOf(target);
```

### Touch/Click Not Working

```typescript
// Verify interactive settings
console.log({
  eventMode: sprite.eventMode,  // Should be 'static' or 'dynamic'
  cursor: sprite.cursor,
  hitArea: sprite.hitArea,
});

// Debug hit area
sprite.hitArea = new PIXI.Rectangle(0, 0, 100, 100);

// Check if something is blocking
container.interactiveChildren = false;  // Disable children to test
```

---

## Performance Debugging

### Frame Rate

```typescript
// Add FPS counter
import { Ticker } from 'pixi.js';

app.ticker.add(() => {
  console.log('FPS:', Math.round(app.ticker.FPS));
});
```

### Memory Leaks

```typescript
// Check texture cache size
console.log('Textures:', Object.keys(PIXI.Cache._cache).length);

// Find orphaned display objects
function countChildren(container: Container, depth = 0): number {
  let count = 1;
  for (const child of container.children) {
    count += countChildren(child as Container, depth + 1);
  }
  return count;
}
console.log('Total objects:', countChildren(app.stage));
```

### Timeline Heap Snapshot

1. Open Chrome DevTools > Memory
2. Take heap snapshot before/after level
3. Compare retained objects
4. Look for detached DOM nodes or PIXI objects

---

## Solid.js Debugging

### Signal Values

```typescript
import { createEffect } from 'solid-js';

// Log signal changes
createEffect(() => {
  console.log('Screen changed:', screen());
});
```

### Component Re-renders

```typescript
// Track why component re-renders
function GameScreen() {
  console.log('GameScreen render');

  createEffect(() => {
    console.log('Effect triggered, level:', level());
  });
}
```

---

## Logging Patterns

### Namespaced Logs

```typescript
const log = {
  game: (...args: any[]) => console.log('[Game]', ...args),
  audio: (...args: any[]) => console.log('[Audio]', ...args),
  assets: (...args: any[]) => console.log('[Assets]', ...args),
};

log.game('Level started', levelId);
log.audio('Playing', soundName);
```

### Conditional Logging

```typescript
const DEBUG = {
  TILES: false,
  AUDIO: true,
  ANIMATIONS: false,
};

if (DEBUG.AUDIO) console.log('Sound played:', name);
```

---

## Quick Fixes

| Problem | Quick Fix |
|---------|-----------|
| Can't see sprite | `sprite.tint = 0xff0000` (make it red) |
| Animation stuck | `gsap.killTweensOf(target)` |
| Touch not working | `sprite.eventMode = 'static'` |
| Z-order wrong | `parent.sortableChildren = true` then set `zIndex` |
| Texture blurry | Check `resolution` and `PIXI.settings.RESOLUTION` |
| Audio not playing | Check `unlockAudio()` called on user interaction |

---

## Related

- [Troubleshooting](troubleshooting.md) - Common issues
- [Performance](../standards/performance.md) - Optimization
