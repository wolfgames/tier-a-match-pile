/**
 * Deterministic seeded PRNG (LCG, Numerical-Recipes constants). Own,
 * self-contained implementation — Math.random is banned anywhere in
 * rules/solver/generator (R-GEN-DETERMINISTIC).
 */

export interface Rng {
  /** Next pseudo-random float in [0, 1). */
  next(): number;
  /** Next pseudo-random integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

/**
 * Integer hash finalizer (Chris Wellons' "lowbias32"). A bare LCG seeded
 * directly with small sequential integers (0, 1, 2, ...) produces a nearly
 * linear — and therefore highly correlated — first output, since one
 * multiply-add step barely scrambles a small starting state. Passing the
 * seed through this finalizer first gives nearby seeds well-decorrelated
 * initial LCG states while staying fully deterministic and dependency-free.
 */
function scrambleSeed(seed: number): number {
  let x = seed >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

export function createRng(seed: number): Rng {
  let state = scrambleSeed(seed);

  function next(): number {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  }

  function nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(next() * maxExclusive);
  }

  return { next, nextInt };
}
