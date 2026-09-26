import { describe, expect, it } from 'vitest';

import { findPreset } from '@/data';

import { boardLayout, partById } from './layout';
import { solidAt } from './solids';

function part(id: string) {
  const preset = findPreset('rig-2019');
  if (preset === undefined)
    throw new Error('missing preset rig-2019');
  const found = partById(boardLayout(preset.config), id);
  if (found === undefined)
    throw new Error(`the layout has no ${id}`);
  return found;
}

describe('solidAt', () => {
  it('tells a DIMM from an M.2 stick by height, since their footprints are alike', () => {
    expect(solidAt(part('memory'), 0).heightMm).toBeGreaterThan(solidAt(part('m2'), 0).heightMm * 5);
  });

  it('stands the memory above the CPU package, not flush with it', () => {
    expect(solidAt(part('memory'), 0).topMm).toBeGreaterThan(solidAt(part('cpu'), 0).topMm);
  });

  it('stacks the caches on the package and separates them when exploded', () => {
    const caches = ['l1', 'l2', 'l3'].map(id => solidAt(part(id), 1).bottomMm);
    expect(new Set(caches).size).toBe(3);
    for (const bottom of caches)
      expect(bottom).toBeGreaterThan(solidAt(part('cpu'), 1).topMm);
  });

  it('rises monotonically with the explode position, and stays put at zero', () => {
    for (const id of ['l1', 'memory', 'gpu', 'psu']) {
      const part0 = solidAt(part(id), 0).bottomMm;
      const half = solidAt(part(id), 0.5).bottomMm;
      const whole = solidAt(part(id), 1).bottomMm;
      expect(half).toBeGreaterThanOrEqual(part0);
      expect(whole).toBeGreaterThan(half);
    }
  });

  it('clamps an explode position outside the slider range', () => {
    expect(solidAt(part('gpu'), -1)).toEqual(solidAt(part('gpu'), 0));
    expect(solidAt(part('gpu'), 3)).toEqual(solidAt(part('gpu'), 1));
  });
});
