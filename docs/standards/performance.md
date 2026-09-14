# Performance Guide

Hitting 60fps on mobile devices.

---

## Quick Checks

### FPS Monitor

```typescript
// Add to game init
if (import.meta.env.DEV) {
  app.ticker.add(() => {
    const fps = Math.round(app.ticker.FPS);
    if (fps < 55) console.warn('FPS drop:', fps);
  });
}
```

### Performance Targets

| Device | Target FPS | Budget per Frame |
|--------|------------|------------------|
| Desktop | 60 | 16.6ms |
| iPhone 12+ | 60 | 16.6ms |
| Older phones | 30 | 33.3ms |

---

## Pixi.js Optimization

### Texture Atlases

**Always** use texture atlases, never individual images.

```typescript
// Good: Single atlas load
await Assets.load('atlas-tiles.json');

// Bad: Many individual textures
await Promise.all([
  Assets.load('tile1.png'),
  Assets.load('tile2.png'),
  // 50 more...
]);
```

Benefits:
- Single draw call for many sprites
- Fewer HTTP requests
- Better GPU memory usage

### Container Caching

Cache static containers as textures:

```typescript
// For containers that don't change
staticContainer.cacheAsTexture(true);

// Update when content changes
staticContainer.updateCacheTexture();
```

### Disable Interactivity

```typescript
// For non-interactive containers
container.eventMode = 'none';
container.interactiveChildren = false;
```

### Culling Off-Screen

```typescript
// Don't render off-screen objects
app.stage.cullable = true;
app.stage.cullArea = new Rectangle(0, 0, app.screen.width, app.screen.height);
```

---

## GSAP Optimization

### Batch Animations

```typescript
// Good: Single tween with stagger
gsap.to(tiles, {
  pixi: { scale: 1 },
  stagger: 0.05,
});

// Bad: Individual tweens
tiles.forEach((tile, i) => {
  gsap.to(tile, { pixi: { scale: 1 }, delay: i * 0.05 });
});
```

### Kill Unused Tweens

```typescript
// When removing objects
gsap.killTweensOf(sprite);
sprite.destroy();

// When changing screens
gsap.killTweensOf(container.children);
```

### Avoid Expensive Properties

| Expensive | Cheap |
|-----------|-------|
| `filters` | `tint` |
| `blendMode` (some) | `alpha` |
| `mask` | `visible` |
| `rotation` (with pivot) | `x`, `y` |

---

## Memory Management

### Destroy Objects

```typescript
// When done with sprites
sprite.destroy({ children: true, texture: false });

// When done with textures
texture.destroy(true);  // true = destroy base texture too
```

### Object Pooling

Reuse objects instead of creating/destroying:

```typescript
class TilePool {
  private pool: Tile[] = [];

  get(): Tile {
    return this.pool.pop() || new Tile();
  }

  release(tile: Tile): void {
    tile.reset();
    this.pool.push(tile);
  }
}
```

### Monitor Memory

```typescript
// Check texture cache
console.log('Cached textures:', PIXI.Cache.size);

// Force garbage collection (DevTools)
// Memory panel > Trash icon
```

---

## Asset Loading

### Preload Critical Assets

```typescript
// Load essential assets first
await Assets.load(['atlas-ui.json', 'sfx-ui.json']);

// Load level assets while showing UI
const levelPromise = Assets.load('atlas-level.json');

// Wait when needed
await levelPromise;
```

### Lazy Load Levels

```typescript
// Don't load all levels upfront
async function loadLevel(id: string) {
  // Unload previous level assets
  if (currentLevelId) {
    Assets.unload(`level-${currentLevelId}`);
  }

  // Load new level
  await Assets.load(`level-${id}`);
  currentLevelId = id;
}
```

---

## Rendering Tips

### Reduce Draw Calls

Check draw calls in browser:
1. DevTools > Layers panel
2. Or Pixi DevTools

Reduce by:
- Using atlases
- Batching similar sprites
- Reducing container nesting

### Resolution Scaling

```typescript
// For low-end devices
const dpr = Math.min(window.devicePixelRatio, 2);

await app.init({
  resolution: dpr,
  autoDensity: true,
});
```

### Disable Antialiasing

```typescript
// For pixel art or low-end devices
await app.init({
  antialias: false,
});
```

---

## Profiling

### Chrome Performance Tab

1. Open DevTools > Performance
2. Click Record
3. Play game for 5-10 seconds
4. Stop recording
5. Look for:
   - Long frames (>16ms)
   - Scripting spikes
   - Rendering bottlenecks

### Common Bottlenecks

| Issue | Symptom | Fix |
|-------|---------|-----|
| Too many sprites | High scripting time | Use containers, pool objects |
| Complex filters | GPU spikes | Simplify or remove filters |
| Memory leaks | Growing memory | Destroy unused objects |
| Layout thrashing | DOM reflows | Batch DOM reads/writes |

---

## Mobile-Specific

See [Mobile Guide](./mobile.md) for:
- Touch optimization
- Battery considerations
- iOS Safari quirks

---

## Checklist

Before launch:

- [ ] Atlas all textures
- [ ] Cache static containers
- [ ] Pool frequently created objects
- [ ] Kill tweens on cleanup
- [ ] Disable interactivity where not needed
- [ ] Test on lowest-spec target device
- [ ] Profile with DevTools
- [ ] Check memory doesn't grow over time

---

## Related

- [Debugging](../guides/debugging.md)
- [Mobile](mobile.md)
