import { describe, expect, it } from 'vitest';

import { generateAccesses, mixedSpec, randomSpec, streamingSpec } from './generate';

describe('generateAccesses', () => {
  it('produces an identical stream for the same spec', () => {
    const spec = randomSpec({ accessCount: 500 });
    expect(generateAccesses(spec)).toEqual(generateAccesses(spec));
  });

  it('produces a different stream for a different seed', () => {
    const first = generateAccesses(randomSpec({ accessCount: 500, seed: 1 }));
    const second = generateAccesses(randomSpec({ accessCount: 500, seed: 2 }));
    expect(first).not.toEqual(second);
  });

  it('emits exactly the requested number of accesses', () => {
    expect(generateAccesses(streamingSpec({ accessCount: 321 }))).toHaveLength(321);
  });

  it('walks consecutive lines when streaming', () => {
    const accesses = generateAccesses(streamingSpec({ accessCount: 4, lineBytes: 64 }));
    expect(accesses.map(access => access.address)).toEqual([0, 64, 128, 192]);
    expect(accesses.every(access => !access.dependent)).toBe(true);
  });

  it('marks random hops as dependent, which is what serialises them', () => {
    const accesses = generateAccesses(randomSpec({ accessCount: 50 }));
    expect(accesses.every(access => access.dependent)).toBe(true);
  });

  it('blends both kinds when mixed', () => {
    const accesses = generateAccesses(mixedSpec({ accessCount: 200, dependentRatio: 0.5 }));
    expect(accesses.some(access => access.dependent)).toBe(true);
    expect(accesses.some(access => !access.dependent)).toBe(true);
  });

  it('keeps every address inside the working set', () => {
    const workingSetBytes = 64 * 64;
    const accesses = generateAccesses(
      randomSpec({ accessCount: 500, lineBytes: 64, workingSetBytes }),
    );
    for (const access of accesses)
      expect(access.address).toBeLessThan(workingSetBytes);
  });

  it('moves one cache line per access', () => {
    const accesses = generateAccesses(streamingSpec({ accessCount: 10, lineBytes: 128 }));
    expect(accesses.every(access => access.bytes === 128)).toBe(true);
  });
});
