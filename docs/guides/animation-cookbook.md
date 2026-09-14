# Animation Cookbook

GSAP patterns for game feel and juice.

---

## Essential Easings

| Feel | Ease | Use For |
|------|------|---------|
| Snappy | `power2.out` | Buttons, UI |
| Bouncy | `back.out(1.7)` | Pop-ins |
| Elastic | `elastic.out(1, 0.5)` | Playful feedback |
| Heavy | `power3.out` | Large objects |
| Smooth | `sine.inOut` | Camera |
| Punch | `power4.out` | Impacts |

---

## Common Patterns

### Pop In

```typescript
async function popIn(sprite: Container, delay = 0): Promise<void> {
  sprite.scale.set(0);
  sprite.alpha = 0;

  return new Promise(resolve => {
    gsap.to(sprite, {
      pixi: { scale: 1, alpha: 1 },
      duration: 0.4,
      delay,
      ease: 'back.out(1.7)',
      onComplete: resolve,
    });
  });
}
```

### Pop Out

```typescript
async function popOut(sprite: Container): Promise<void> {
  return new Promise(resolve => {
    gsap.to(sprite, {
      pixi: { scale: 0, alpha: 0 },
      duration: 0.25,
      ease: 'back.in(1.7)',
      onComplete: resolve,
    });
  });
}
```

### Bounce (Attention)

```typescript
function bounce(sprite: Container): Promise<void> {
  return new Promise(resolve => {
    gsap.to(sprite, {
      pixi: { scale: 1.2 },
      duration: 0.15,
      ease: 'power2.out',
      yoyo: true,
      repeat: 1,
      onComplete: resolve,
    });
  });
}
```

### Shake (Error)

```typescript
function shake(sprite: Container, intensity = 5): Promise<void> {
  const startX = sprite.x;

  return new Promise(resolve => {
    gsap.to(sprite, {
      x: startX + intensity,
      duration: 0.05,
      repeat: 5,
      yoyo: true,
      ease: 'none',
      onComplete: () => {
        sprite.x = startX;
        resolve();
      },
    });
  });
}
```

### Pulse (Highlight)

```typescript
function pulse(sprite: Container, loops = 2): Promise<void> {
  return new Promise(resolve => {
    gsap.to(sprite, {
      pixi: { alpha: 0.5 },
      duration: 0.3,
      repeat: loops * 2 - 1,
      yoyo: true,
      ease: 'sine.inOut',
      onComplete: resolve,
    });
  });
}
```

### Float (Idle)

```typescript
function float(sprite: Container): gsap.core.Tween {
  const startY = sprite.y;

  return gsap.to(sprite, {
    y: startY - 10,
    duration: 1.5,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}
```

---

## Staggered Animations

```typescript
// Multiple items entering
async function staggerIn(sprites: Container[]): Promise<void> {
  sprites.forEach(s => s.scale.set(0));

  return new Promise(resolve => {
    gsap.to(sprites, {
      pixi: { scale: 1 },
      duration: 0.4,
      stagger: 0.1,
      ease: 'back.out(1.7)',
      onComplete: resolve,
    });
  });
}
```

---

## Timeline Sequences

```typescript
function levelComplete(stars: Container[], button: Container): Promise<void> {
  const tl = gsap.timeline();

  // Stars pop in
  tl.from(stars, {
    pixi: { scale: 0 },
    duration: 0.3,
    stagger: 0.15,
    ease: 'back.out(2)',
  });

  // Button slides up
  tl.from(button, {
    y: '+=50',
    alpha: 0,
    duration: 0.4,
    ease: 'power2.out',
  }, '-=0.1');

  return new Promise(resolve => {
    tl.eventCallback('onComplete', resolve);
  });
}
```

---

## Button States

```typescript
function setupButton(sprite: Container, onClick: () => void) {
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';

  sprite.on('pointerover', () => {
    gsap.to(sprite, { pixi: { scale: 1.05 }, duration: 0.2 });
  });

  sprite.on('pointerout', () => {
    gsap.to(sprite, { pixi: { scale: 1 }, duration: 0.2 });
  });

  sprite.on('pointerdown', () => {
    gsap.to(sprite, { pixi: { scale: 0.95 }, duration: 0.1 });
  });

  sprite.on('pointerup', () => {
    gsap.to(sprite, { pixi: { scale: 1.05 }, duration: 0.1, ease: 'back.out(2)' });
    onClick();
  });
}
```

---

## Number Counting

```typescript
async function countTo(
  textObj: Text,
  endValue: number,
  duration = 1
): Promise<void> {
  const counter = { value: 0 };

  return new Promise(resolve => {
    gsap.to(counter, {
      value: endValue,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        textObj.text = Math.round(counter.value).toString();
      },
      onComplete: resolve,
    });
  });
}
```

---

## Performance Tips

1. **Use stagger** over individual tweens
2. **Kill tweens** when objects removed: `gsap.killTweensOf(target)`
3. **Avoid filters** - Very expensive
4. **Use `overwrite: 'auto'`** to prevent conflicts
5. **Batch properties** in single tween

```typescript
// Good
gsap.to(sprite, { x: 100, y: 100, alpha: 1 });

// Bad (3 separate tweens)
gsap.to(sprite, { x: 100 });
gsap.to(sprite, { y: 100 });
gsap.to(sprite, { alpha: 1 });
```

---

## Promise-Wrapped Pattern

All the examples above use this pattern — wrap GSAP in a `Promise<void>` so you can `await` animations:

```typescript
playExitAnimation(): Promise<void> {
  return new Promise((resolve) => {
    gsap.to(this, { alpha: 0, duration: 0.25, ease: 'power2.out' });
    gsap.to(this.scale, {
      x: 0.9,
      y: 0.9,
      duration: 0.25,
      ease: 'power2.out',
      onComplete: resolve,
    });
  });
}

// Usage
await button.playExitAnimation();
// Animation complete, safe to proceed
```

No callback nesting. Clean async/await flow. Works with try/catch.

---

## Related

- [Debugging](debugging.md)
- [Performance](../standards/performance.md)
