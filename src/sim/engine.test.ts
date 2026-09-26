import type { HardwareConfig, SimResult } from './types';

import type { WorkloadSpec } from '@/workloads';
import { describe, expect, it } from 'vitest';
import { findPreset } from '@/data';

import { generateAccesses, mixedSpec, randomSpec, streamingSpec } from '@/workloads';
import { simulate } from './engine';

/**
 * Small enough to keep the suite fast; large enough that the pipeline reaches
 * steady state before the last accesses tail off.
 */
const ACCESS_COUNT = 20_000;

const streaming = streamingSpec({ accessCount: ACCESS_COUNT });
const random = randomSpec({ accessCount: ACCESS_COUNT });

function run(presetId: string, spec: WorkloadSpec): SimResult {
  const preset = findPreset(presetId);
  if (preset === undefined)
    throw new Error(`unknown preset: ${presetId}`);

  const result = simulate(preset.config, generateAccesses({ ...spec, accessCount: ACCESS_COUNT }));
  // A dropped access would otherwise look like a plausible but wrong answer.
  expect(result.accesses).toBe(ACCESS_COUNT);
  return result;
}

describe('memory system simulation', () => {
  it('is deterministic for a fixed seed', () => {
    const first = run('rig-2019', streaming);
    const second = run('rig-2019', streaming);

    expect(first.elapsedNs).toBe(second.elapsedNs);
    expect(first.meanLatencyNs).toBe(second.meanLatencyNs);
    expect(first.achievedBandwidthBytesPerNs).toBe(second.achievedBandwidthBytesPerNs);
  });

  it('saturates the memory channel on a streaming workload', () => {
    const result = run('rig-2019', streaming);

    expect(result.classification).toBe('resource-bound');
    expect(result.bottleneckId).toBe('memory');
    // Dual-channel DDR4-3200 is 51.2 GB/s; a saturated stream should reach it.
    expect(result.achievedBandwidthBytesPerNs).toBeGreaterThan(51.2 * 0.9);
  });

  it('ranks generations by bandwidth when bandwidth is the limit', () => {
    const ddr3 = run('rig-2012', streaming);
    const ddr4 = run('rig-2019', streaming);
    const ddr5 = run('rig-2024', streaming);

    expect(ddr5.elapsedNs).toBeLessThan(ddr4.elapsedNs);
    expect(ddr4.elapsedNs).toBeLessThan(ddr3.elapsedNs);
    expect(ddr4.elapsedNs / ddr5.elapsedNs).toBeGreaterThan(1.5);
    expect(ddr3.elapsedNs / ddr4.elapsedNs).toBeGreaterThan(1.5);
  });

  it('exposes latency instead of bandwidth when accesses are dependent', () => {
    const result = run('rig-2019', random);

    expect(result.classification).toBe('latency-bound');
    expect(result.bottleneckId).toBeNull();
    // One access in flight at a time: the classic pointer chase.
    expect(result.outstanding.memory.max).toBe(1);
  });

  it('does not reward bandwidth on a latency-bound workload', () => {
    const ddr3 = run('rig-2012', random);
    const ddr4 = run('rig-2019', random);
    const ddr5 = run('rig-2024', random);

    // The bandwidth ranking does not survive: DDR5 finishes last, and the three
    // generations land within a few percent of each other.
    expect(ddr4.elapsedNs).toBeLessThan(ddr5.elapsedNs);
    expect(ddr4.elapsedNs).toBeLessThan(ddr3.elapsedNs);

    const slowest = Math.max(ddr3.elapsedNs, ddr4.elapsedNs, ddr5.elapsedNs);
    const fastest = Math.min(ddr3.elapsedNs, ddr4.elapsedNs, ddr5.elapsedNs);
    expect(slowest / fastest).toBeLessThan(1.1);
  });

  it('moves the bottleneck up the hierarchy when the working set fits in cache', () => {
    const workingSetBytes = 16 * 1024;
    const lineBytes = 64;
    const resident = streamingSpec({ accessCount: ACCESS_COUNT, workingSetBytes });
    const result = run('rig-2019', resident);

    expect(result.hitRates.l1).toBeGreaterThan(0.9);
    // One DRAM fetch per distinct line in the working set, and no more: every
    // later visit is either an L1 hit or a merged secondary miss.
    expect(result.movedBytes).toBe((workingSetBytes / lineBytes) * lineBytes);
    expect(result.classification).toBe('resource-bound');
    expect(result.bottleneckId).toBe('cpu');
  });

  it('reports every resource with a utilisation in range', () => {
    const result = run('rig-2024', streaming);
    expect(result.resources).toHaveLength(5);

    for (const resource of result.resources) {
      expect(resource.utilisation).toBeGreaterThanOrEqual(0);
      expect(resource.utilisation).toBeLessThanOrEqual(1.000_001);
    }
  });

  it('derives utilisation from busy time over elapsed time', () => {
    const result = run('rig-2019', streaming);
    for (const resource of result.resources)
      expect(resource.utilisation).toBeCloseTo(resource.busyNs / result.elapsedNs, 12);
  });

  it('never charges lookup latency as occupancy', () => {
    const preset = findPreset('rig-2019');
    if (preset === undefined)
      throw new Error('missing preset: rig-2019');

    const accesses = generateAccesses(streamingSpec({ accessCount: 5_000 }));
    const baseline = simulate(preset.config, accesses);
    const slowerLookups = simulate(
      {
        ...preset.config,
        caches: {
          l1: { ...preset.config.caches.l1, hitTimeNs: preset.config.caches.l1.hitTimeNs * 4 },
          l2: { ...preset.config.caches.l2, hitTimeNs: preset.config.caches.l2.hitTimeNs * 4 },
          l3: { ...preset.config.caches.l3, hitTimeNs: preset.config.caches.l3.hitTimeNs * 4 },
        },
      },
      accesses,
    );

    // Quadrupling lookup latency must change the timing but not the work done:
    // busy time is data moved, so it cannot move with latency.
    expect(slowerLookups.elapsedNs).toBeGreaterThan(baseline.elapsedNs);
    for (const [index, resource] of baseline.resources.entries())
      expect(slowerLookups.resources[index]?.busyNs).toBeCloseTo(resource.busyNs, 6);
  });

  it('completes every access when a level cap is far below the core budget', () => {
    const preset = findPreset('rig-2019');
    if (preset === undefined)
      throw new Error('missing preset: rig-2019');

    const accessCount = 2_000;
    // Keep L1 at its normal depth — it is the core's in-flight gate — and
    // squeeze the levels below, so requests genuinely queue at L2/L3 and are
    // resumed as slots free. A tiny working set keeps many requests on the same
    // few lines, which exercises the L1 merge path and the queues below it.
    const squeezed: HardwareConfig = {
      ...preset.config,
      caches: {
        l1: preset.config.caches.l1,
        l2: { ...preset.config.caches.l2, maxOutstandingMisses: 1 },
        l3: { ...preset.config.caches.l3, maxOutstandingMisses: 1 },
      },
      memory: { ...preset.config.memory, maxOutstandingMisses: 1 },
    };

    const result = simulate(
      squeezed,
      generateAccesses(streamingSpec({ accessCount, workingSetBytes: 4 * 1024 })),
    );
    expect(result.accesses).toBe(accessCount);
  });

  it('holds independent accesses behind a dependent one, because issue is in order', () => {
    const mixed = run('rig-2019', mixedSpec({ accessCount: ACCESS_COUNT }));
    const stream = run('rig-2019', streamingSpec({ accessCount: ACCESS_COUNT }));
    const chase = run('rig-2019', randomSpec({ accessCount: ACCESS_COUNT }));

    expect(mixed.achievedBandwidthBytesPerNs).toBeLessThan(stream.achievedBandwidthBytesPerNs);
    expect(mixed.achievedBandwidthBytesPerNs).toBeGreaterThan(chase.achievedBandwidthBytesPerNs);
  });

  it('handles an empty workload without dividing by zero', () => {
    const preset = findPreset('rig-2019');
    if (preset === undefined)
      throw new Error('missing preset');

    const result = simulate(preset.config, []);
    expect(result.elapsedNs).toBe(0);
    expect(result.accesses).toBe(0);
    expect(result.achievedBandwidthBytesPerNs).toBe(0);
    expect(result.meanLatencyNs).toBe(0);
  });
});
