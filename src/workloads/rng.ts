export interface Rng {
  /** Uniform in [0, 1). */
  readonly next: () => number;
  /** Uniform integer in [0, bound). */
  readonly nextInt: (bound: number) => number;
}

/**
 * mulberry32 — small, fast, and deterministic for a given seed. Determinism is
 * load-bearing: two configurations must see the identical access sequence.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextInt: bound => Math.floor(next() * bound),
  };
}
