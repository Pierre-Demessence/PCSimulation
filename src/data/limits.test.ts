import type { Limit } from './limits';

import type { HardwareConfig, MotherboardSpec } from '@/sim';
import { describe, expect, it } from 'vitest';

import { aggregateBandwidthBytesPerNs, DEFAULT_LINE_BYTES, fullAccessNs } from '@/sim';
import { buildLimits } from './limits';
import { BASELINE_CPU, CACHE_HIERARCHY, CYCLES_PER_ISSUE, memorySpec } from './presets';

const DDR4_BOARD: MotherboardSpec = {
  allowedGenerations: ['ddr4'],
  dimmSlots: 4,
  id: 'mb-ddr4',
  maxChannels: 2,
  maxMtPerSecond: 3200,
  pcieLanes: 20,
  m2Slots: 2,
  pcieVersion: 4,
  powerConnectors: ['atx-24', 'eps-8'],
  sataPorts: 4,
  socket: 'lga1700',
};

const DDR5_BOARD: MotherboardSpec = {
  allowedGenerations: ['ddr5'],
  dimmSlots: 4,
  id: 'mb-ddr5',
  maxChannels: 4,
  maxMtPerSecond: 6000,
  pcieLanes: 20,
  m2Slots: 2,
  pcieVersion: 5,
  powerConnectors: ['atx-24', 'eps-8'],
  sataPorts: 4,
  socket: 'lga1700',
};

/** DDR4-3200 CL16 in two channels, the sheet's worked example. */
const DDR4_3200 = memorySpec('ddr4', 3200, 16);

/** The plan's flip rig: DDR5-5600 CL36, which swings from 2 to 4 channels. */
const DDR5_5600 = memorySpec('ddr5', 5600, 36);

const DDR4_BUILD: Partial<HardwareConfig> = {
  caches: CACHE_HIERARCHY,
  cpu: BASELINE_CPU,
  memory: DDR4_3200,
  motherboard: DDR4_BOARD,
};

function limitOf(limits: readonly Limit[], id: string): Limit {
  const limit = limits.find(entry => entry.id === id);
  if (limit === undefined)
    throw new Error(`missing limit: ${id}`);
  return limit;
}

function idsOf(limits: readonly Limit[]): readonly string[] {
  return limits.map(limit => limit.id);
}

describe('buildLimits', () => {
  it('derives the five limits of the worked example', () => {
    const limits = buildLimits(DDR4_BUILD);

    expect(idsOf(limits)).toEqual([
      'memory-bandwidth',
      'board-memory-cap',
      'memory-level-parallelism',
      'core-issue-rate',
      'full-miss-latency',
    ]);

    expect(limitOf(limits, 'memory-bandwidth').value).toBeCloseTo(51.2, 6);
    expect(limitOf(limits, 'board-memory-cap').value).toBeCloseTo(51.2, 6);
    expect(limitOf(limits, 'memory-level-parallelism').value).toBeCloseTo(175.5, 1);
    expect(limitOf(limits, 'core-issue-rate').value).toBe(4);
    expect(limitOf(limits, 'full-miss-latency').value).toBe(90);
  });

  it('computes the bandwidth from the same function the engine uses', () => {
    const bandwidth = limitOf(buildLimits(DDR4_BUILD), 'memory-bandwidth');

    expect(bandwidth.value).toBe(aggregateBandwidthBytesPerNs(DDR4_3200));
    expect(bandwidth.unit).toBe('bytes-per-ns');
    expect(bandwidth.kind).toBe('ceiling');
  });

  it('computes the parallelism ceiling independently of the engine', () => {
    const parallelism = limitOf(buildLimits(DDR4_BUILD), 'memory-level-parallelism');
    const expected = (CACHE_HIERARCHY.l1.maxOutstandingMisses * DEFAULT_LINE_BYTES) / fullAccessNs(DDR4_3200);

    expect(parallelism.value).toBe(expected);
    expect(parallelism.value).toBeCloseTo(175.542857, 5);
  });

  it('computes the floor as the three cache delays plus a full DRAM access', () => {
    const floor = limitOf(buildLimits(DDR4_BUILD), 'full-miss-latency');
    const expected
      = CACHE_HIERARCHY.l1.hitTimeNs + CACHE_HIERARCHY.l2.hitTimeNs + CACHE_HIERARCHY.l3.hitTimeNs
        + fullAccessNs(DDR4_3200);

    expect(floor.kind).toBe('floor');
    expect(floor.unit).toBe('ns');
    expect(floor.value).toBe(expected);
    // A floor is a delay, so it never competes for the tightest rate.
    expect(floor.binding).toBe(false);
  });

  it('flips the binding ceiling from bandwidth to parallelism when channels double', () => {
    const two = buildLimits({
      caches: CACHE_HIERARCHY,
      cpu: BASELINE_CPU,
      memory: DDR5_5600,
      motherboard: DDR5_BOARD,
    });
    const four = buildLimits({
      caches: CACHE_HIERARCHY,
      cpu: BASELINE_CPU,
      memory: memorySpec('ddr5', 5600, 36, { channels: 4 }),
      motherboard: DDR5_BOARD,
    });

    expect(limitOf(two, 'memory-bandwidth').binding).toBe(true);
    expect(limitOf(two, 'memory-level-parallelism').binding).toBe(false);
    expect(limitOf(four, 'memory-bandwidth').binding).toBe(false);
    expect(limitOf(four, 'memory-level-parallelism').binding).toBe(true);

    for (const limits of [two, four]) {
      const binders = limits
        .filter(limit => limit.kind === 'ceiling' && limit.unit === 'bytes-per-ns' && limit.binding)
        .map(limit => limit.id);
      expect(binders).toHaveLength(1);
    }

    // The issue rate is alone in `per-ns`, so nothing competes with it.
    expect(limitOf(two, 'core-issue-rate').binding).toBe(false);
    expect(limitOf(two, 'core-issue-rate').unit).toBe('per-ns');
  });

  it('binds the board cap and explains that the run does not enforce it when the board is slower', () => {
    const slowBoard: MotherboardSpec = { ...DDR4_BOARD, maxMtPerSecond: 1600 };
    const limits = buildLimits({ ...DDR4_BUILD, motherboard: slowBoard });
    const cap = limitOf(limits, 'board-memory-cap');

    expect(cap.value).toBeCloseTo(25.6, 6);
    expect(cap.binding).toBe(true);
    expect(limitOf(limits, 'memory-bandwidth').binding).toBe(false);
    expect(cap.notEnforcedBy).toBeTypeOf('string');
    expect(cap.notEnforcedBy).toContain('does not enforce');
  });

  it('keeps the not-enforced note but does not bind the cap once the board clears the DIMM', () => {
    const limits = buildLimits(DDR4_BUILD);
    const cap = limitOf(limits, 'board-memory-cap');

    expect(cap.binding).toBe(false);
    // The note is a fact about the model, not about this build, so it stays.
    expect(cap.notEnforcedBy).toBeTypeOf('string');
  });

  it('returns only the limits the present parts support, and never throws', () => {
    expect(buildLimits({})).toEqual([]);
    expect(buildLimits({ caches: CACHE_HIERARCHY })).toEqual([]);

    // Memory alone supports its bandwidth ceiling and nothing needing a cache or a board.
    expect(idsOf(buildLimits({ memory: DDR4_3200 }))).toEqual(['memory-bandwidth']);

    // A board without memory has nothing to cap.
    expect(buildLimits({ motherboard: DDR4_BOARD })).toEqual([]);
    expect(buildLimits({ cpu: BASELINE_CPU })).toHaveLength(1);
    expect(limitOf(buildLimits({ cpu: BASELINE_CPU }), 'core-issue-rate').value)
      .toBe(BASELINE_CPU.clockHz / CYCLES_PER_ISSUE / 1e9);
  });
});
