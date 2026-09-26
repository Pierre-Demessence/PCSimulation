import type { HardwareConfig, MemorySpec, MotherboardSpec } from '@/sim';

import { describe, expect, it } from 'vitest';

import { validateConfiguration } from './compat';
import { BASELINE_CPU, CACHE_HIERARCHY, findPreset, memorySpec, RIG_PRESETS } from './presets';

function configWith(memory: MemorySpec): HardwareConfig {
  const board = findPreset('rig-2019')?.motherboard;
  if (board === undefined)
    throw new Error('missing preset: rig-2019');
  return { caches: CACHE_HIERARCHY, cpu: BASELINE_CPU, memory, motherboard: board };
}

describe('validateConfiguration', () => {
  it('accepts every stock rig on its own board', () => {
    for (const preset of RIG_PRESETS)
      expect(validateConfiguration(preset.config)).toEqual([]);
  });

  it('rejects a DIMM the board will not accept', () => {
    const problems = validateConfiguration(configWith(memorySpec('ddr5', 5600, 36)));
    expect(problems).toContain('board does not accept DDR5 memory');
  });

  it('rejects more channels than the board supports', () => {
    const problems = validateConfiguration(configWith(memorySpec('ddr4', 3200, 16, { channels: 4 })));
    expect(problems).toContain('board supports at most 2 channel(s)');
  });

  it('rejects memory faster than the board allows', () => {
    const problems = validateConfiguration(configWith(memorySpec('ddr4', 6000, 30)));
    expect(problems.some(problem => problem.includes('MT/s'))).toBe(true);
  });

  it('rejects more channels than there are DIMM slots', () => {
    // No shipped board can show this, because each has at least as many slots
    // as channels; a narrow board makes the rule reachable.
    const board: MotherboardSpec = {
      allowedGenerations: ['ddr4'],
      dimmSlots: 2,
      id: 'mb-narrow',
      maxChannels: 4,
      maxMtPerSecond: 3200,
    };
    const problems = validateConfiguration({
      caches: CACHE_HIERARCHY,
      cpu: BASELINE_CPU,
      memory: memorySpec('ddr4', 3200, 16, { channels: 3 }),
      motherboard: board,
    });
    expect(problems).toContain('each channel needs a DIMM, and the board has 2 slot(s)');
  });

  it('rejects a nonsensical spec', () => {
    expect(validateConfiguration(configWith(memorySpec('ddr4', 3200, 0)))).toContain(
      'CAS latency must be at least 1',
    );
  });

  it('rejects an outstanding-miss cap of zero, which would stall the core forever', () => {
    const base = configWith(memorySpec('ddr4', 3200, 16));
    const problems = validateConfiguration({
      ...base,
      caches: { ...base.caches, l2: { ...base.caches.l2, maxOutstandingMisses: 0 } },
    });
    expect(problems).toContain('L2 needs at least one outstanding-miss slot');
  });
});
