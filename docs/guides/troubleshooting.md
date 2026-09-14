# Troubleshooting Guide

Common issues and solutions when developing games on this scaffold.

## Asset Loading Issues

### "Texture not found" / "Sprite not found"

**Symptoms:** Console error about missing texture, blank sprites

**Causes & Solutions:**

1. **Bundle not loaded**
   ```typescript
   // Wrong - accessing before load
   const sprite = gpuLoader.createSprite('tiles', 'road.png');

   // Right - wait for load
   await coordinator.loadBundle('tiles_mygame_v1');
   if (gpuLoader.hasSheet('tiles_mygame_v1')) {
     const sprite = gpuLoader.createSprite('tiles_mygame_v1', 'road.png');
   }
   ```

2. **Wrong sprite name** (case-sensitive!)
   ```typescript
   // Wrong
   gpuLoader.createSprite('tiles', 'Road.png');

   // Right - match atlas exactly
   gpuLoader.createSprite('tiles', 'road.png');
   ```

3. **Missing file extension**
   ```typescript
   // Wrong
   gpuLoader.createSprite('tiles', 'road');

   // Right
   gpuLoader.createSprite('tiles', 'road.png');
   ```

### "Atlas not loading" / 404 errors

**Symptoms:** Network tab shows 404, assets never load

**Solutions:**

1. Verify file exists in `public/assets/`
2. Check manifest bundle name matches filename
3. Ensure both `.json` and `.png` exist with matching names
4. Check for typos in manifest path

```typescript
// Manifest entry
{ name: 'tiles_mygame_v1', assets: ['tiles_mygame_v1.json'] }

// Files required
public/assets/tiles_mygame_v1.json
public/assets/tiles_mygame_v1.png
```

### CORS errors

**Symptoms:** "Access-Control-Allow-Origin" errors in console

**Solutions:**

1. Run dev server (not file://)
2. Check CDN settings if using external assets
3. Ensure assets are in `public/` folder

## Audio Issues

### Audio not playing

**Symptoms:** No sound, no errors

**Causes & Solutions:**

1. **Audio not unlocked on mobile**
   ```typescript
   // Must call on user interaction (tap, click)
   const handleStart = () => {
     unlockAudio();  // Before loading audio
     // ...
   };
   ```

2. **Music disabled in settings**
   ```typescript
   import { audioState } from '~/core/systems/audio';

   if (audioState.musicEnabled()) {
     manager.startGameMusic();
   }
   ```

3. **Volume at zero**
   ```typescript
   // Check master volume
   coordinator.audio.setMasterVolume(1.0);
   ```

### Audio delayed or stuttering

**Solutions:**

1. Preload audio bundles before gameplay
2. Use audio sprites (single file, multiple sounds)
3. Keep sprite durations short for responsive sounds

### "Cannot read property 'play' of undefined"

**Cause:** Accessing audio before bundle loaded

```typescript
// Wrong
manager.playSound();
await coordinator.loadBundle('audio-sfx');

// Right
await coordinator.loadBundle('audio-sfx');
manager.playSound();
```

## Screen Transition Issues

### Screen not rendering

**Symptoms:** Blank screen after transition

**Solutions:**

1. Check screen is registered in config:
   ```typescript
   // src/game/config.ts
   export const gameConfig = {
     screens: {
       game: GameScreen,  // Must be registered
     },
   };
   ```

2. Verify `goto()` uses correct screen name:
   ```typescript
   await goto('game');  // Must match config key
   ```

### State lost between screens

**Symptoms:** Game resets unexpectedly

**Solution:** Use signals or stores that persist outside screen components:

```typescript
// src/game/state.ts - persists across screens
export const gameState = {
  currentLevel: createSignal(1),
  score: createSignal(0),
};
```

## Tuning Panel Issues

### Panel not opening

**Symptoms:** Backtick (`) doesn't open panel

**Solutions:**

1. Check keyboard focus isn't in an input field
2. Verify dev mode is enabled (not production build)
3. Check console for errors

### Changes not applying

**Symptoms:** Tuning values change but game doesn't update

**Cause:** Parameter not "wired" for live updates

**Solution:** Register in tuning registry:

```typescript
// src/core/dev/tuningRegistry.ts
const GAME_WIRED_PATHS = [
  'grid.tileSize',  // Add your path
];
```

### "localStorage quota exceeded"

**Solution:** Clear old tuning data:

```javascript
// In browser console
localStorage.removeItem('tuning_game');
localStorage.removeItem('tuning_scaffold');
```

## Build Issues

### TypeScript errors after changes

**Common causes:**

1. **Import path wrong**
   ```typescript
   // Wrong
   import { foo } from './game/foo';

   // Right - use alias
   import { foo } from '~/game/foo';
   ```

2. **Missing type export**
   ```typescript
   // Add to index.ts
   export type { MyType } from './types';
   ```

### Build succeeds but runtime error

**Debug steps:**

1. Check browser console for errors
2. Verify all async operations are awaited
3. Check for null/undefined access

```typescript
// Add null checks
if (gpuLoader?.hasSheet(bundleName)) {
  // Safe to use
}
```

## Mobile Issues

### Touch not working

**Solutions:**

1. Set `eventMode` on interactive elements:
   ```typescript
   sprite.eventMode = 'static';
   sprite.cursor = 'pointer';
   sprite.on('pointertap', handleTap);
   ```

2. Use `pointertap` not `click` for cross-platform

### Game too small/large on mobile

**Solution:** Use responsive sizing:

```typescript
game.autoSizeToViewport(
  app.screen.width,
  app.screen.height,
  maxTileSize,
  reservedTop,
  reservedBottom
);
```

### Notch/safe area issues

**Solution:** Use CSS safe area insets:

```css
.safe-area-inset {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

## Performance Issues

### Low frame rate

**Debug steps:**

1. Open tuning panel, check FPS display
2. Look for expensive operations in game loop
3. Profile with Chrome DevTools Performance tab

**Common fixes:**

- Reduce particle counts
- Use object pooling for frequently created/destroyed objects
- Batch draw calls (use containers)
- Reduce texture sizes

### Memory growing over time

**Common causes:**

1. **Not destroying objects**
   ```typescript
   // Always destroy when done
   sprite.destroy();
   container.destroy({ children: true });
   ```

2. **Event listeners not removed**
   ```typescript
   // In cleanup
   window.removeEventListener('resize', handleResize);
   sprite.removeAllListeners();
   ```

3. **GSAP animations not killed**
   ```typescript
   // Kill animations when destroying
   gsap.killTweensOf(sprite);
   gsap.killTweensOf(sprite.scale);
   ```

## Debug Mode

### Enable debug logging

```typescript
// URL params
?debug=1           // General debug mode
?debugLevel=5      // Set specific level
?debugProgress=1   // Progress bar testing
```

### Console logging pattern

```typescript
console.log('[GameScreen] Level loaded:', levelNumber);
console.error('[GameScreen] Failed to load:', error);
```

## Getting Help

1. Check existing documentation in `/docs` (start at [INDEX.md](../INDEX.md))
2. Review similar implementations in codebase
3. Check browser console for detailed error messages
