import { describe, expect, it } from 'vitest';

import { SetAssociativeCache } from './cache';

const LINE = 64;

function singleSetCache(ways: number): SetAssociativeCache {
  return new SetAssociativeCache({ capacityBytes: ways * LINE, lineBytes: LINE, ways });
}

describe('setAssociativeCache', () => {
  it('misses on an empty cache and hits after a fill', () => {
    const cache = singleSetCache(4);
    expect(cache.lookup(0)).toBe(false);
    expect(cache.fill(0)).toBeNull();
    expect(cache.lookup(0)).toBe(true);
  });

  it('evicts the least-recently-used line, not the newest', () => {
    const cache = singleSetCache(4);
    for (let line = 0; line < 4; line += 1)
      cache.fill(line * LINE);

    // Touch line 0 so line 1 becomes the least recently used.
    expect(cache.lookup(0)).toBe(true);

    expect(cache.fill(4 * LINE)).toBe(1 * LINE);
    expect(cache.lookup(1 * LINE)).toBe(false);
    expect(cache.lookup(0)).toBe(true);
  });

  it('is a no-op when filling a line it already holds', () => {
    const cache = singleSetCache(2);
    cache.fill(0);
    cache.fill(LINE);
    expect(cache.fill(0)).toBeNull();
    expect(cache.lookup(0)).toBe(true);
    expect(cache.lookup(LINE)).toBe(true);
  });

  it('thrashes when the working set exceeds associativity', () => {
    const tight = singleSetCache(2);
    const addresses = [0, LINE, 2 * LINE];

    let evictions = 0;
    for (let pass = 0; pass < 3; pass += 1) {
      for (const address of addresses) {
        if (!tight.lookup(address) && tight.fill(address) !== null)
          evictions += 1;
      }
    }

    // Three lines cycling through two ways: every pass evicts.
    expect(evictions).toBeGreaterThanOrEqual(3);
  });

  it('spreads sequential lines across sets', () => {
    const cache = new SetAssociativeCache({ capacityBytes: 4 * LINE, lineBytes: LINE, ways: 1 });
    expect(cache.sets).toBe(4);

    for (let line = 0; line < 4; line += 1)
      cache.fill(line * LINE);

    // Four ways of one, four distinct sets: nothing evicted.
    for (let line = 0; line < 4; line += 1)
      expect(cache.lookup(line * LINE)).toBe(true);
  });

  it('rejects configurations that cannot hold a single set', () => {
    expect(() => new SetAssociativeCache({ capacityBytes: LINE, lineBytes: LINE, ways: 2 })).toThrow();
  });
});
