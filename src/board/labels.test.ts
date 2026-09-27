import type { Build } from '@/data';
import type { HardwareConfig } from '@/sim';

import { describe, expect, it } from 'vitest';

import { applyParameter, completeBuild } from '@/data';
import { testBuild, testConfig } from '@/testing/build';

import { boardLayout } from './layout';

function configOf(build: Build): HardwareConfig {
  const config = completeBuild(build);
  if (config === null)
    throw new Error('the edit dropped a part from the build');
  return config;
}

function labelOf(config: HardwareConfig, id: string): string {
  return boardLayout(config).parts.find(part => part.id === id)?.label ?? '';
}

describe('board part labels', () => {
  it('states the values the build actually has', () => {
    const config = testConfig();

    expect(labelOf(config, 'cpu')).toContain('1 core at 4 GHz');
    expect(labelOf(config, 'l1')).toBe('L1 cache — 32 KiB per core, 1 ns lookup');
    expect(labelOf(config, 'l2')).toBe('L2 cache — 512 KiB per core, 4 ns lookup');
    expect(labelOf(config, 'l3')).toBe('L3 cache — 16 MiB shared, 15 ns lookup');
    expect(labelOf(config, 'memory')).toBe('Memory — DDR4-3200 CL16, 32 GiB in 2 channels');
  });

  it('follows the spec when one characteristic moves', () => {
    const smaller = configOf(applyParameter(testBuild(), 'cpu', 'l1CapacityBytes', 64 * 1024).build);
    expect(labelOf(smaller, 'l1')).toBe('L1 cache — 64 KiB per core, 1 ns lookup');

    const faster = configOf(applyParameter(testBuild(), 'cpu', 'clockHz', 5e9).build);
    expect(labelOf(faster, 'cpu')).toContain('5 GHz');

    const quicker = configOf(applyParameter(testBuild(), 'cpu', 'l3HitTimeNs', 9).build);
    expect(labelOf(quicker, 'l3')).toBe('L3 cache — 16 MiB shared, 9 ns lookup');

    const wider = configOf(applyParameter(testBuild(), 'memory', 'channels', 4).build);
    expect(labelOf(wider, 'memory')).toContain('in 4 channels');
  });

  it('describes a part the editor cannot reach without inventing a number', () => {
    const parts = boardLayout(testConfig()).parts;
    const gpu = parts.find(part => part.id === 'gpu');

    // Static prose about a part outside the config is not a config figure, so it
    // stays a literal — and must not borrow a number from the simulated ones.
    expect(gpu?.label).toBe('Graphics card (PCIe ×16)');
    expect(gpu?.label).not.toMatch(/\d+ (KiB|MiB|GiB|GHz|MT\/s)/);
  });
});
