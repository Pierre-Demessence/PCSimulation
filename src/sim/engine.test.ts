import type { HardwareConfig, MemoryGeneration, SimResult } from './types';

import type { WorkloadSpec } from '@/workloads';
import { describe, expect, it } from 'vitest';

import { DDR3_BOARD, DDR3_MEMORY, DDR5_BOARD, DDR5_MEMORY, testConfig } from '@/testing/build';

import { generateAccesses, mixedSpec, randomSpec, streamingSpec } from '@/workloads';
import { simulate } from './engine';
import { aggregateBandwidthBytesPerNs } from './memory';

/**
 * Small enough to keep the suite fast; large enough that the pipeline reaches
 * steady state before the last accesses tail off.
 */
const ACCESS_COUNT = 20_000;

const streaming = streamingSpec({ accessCount: ACCESS_COUNT });
const random = randomSpec({ accessCount: ACCESS_COUNT });

/** The one machine per memory generation, each with the board that accepts it. */
function rig(generation: MemoryGeneration): HardwareConfig {
  if (generation === 'ddr3')
    return testConfig({ memory: DDR3_MEMORY, motherboard: DDR3_BOARD });
  if (generation === 'ddr5')
    return testConfig({ memory: DDR5_MEMORY, motherboard: DDR5_BOARD });
  return testConfig();
}

function run(generation: MemoryGeneration, spec: WorkloadSpec): SimResult {
  const result = simulate(
    rig(generation),
    generateAccesses({ ...spec, accessCount: ACCESS_COUNT }),
  );
  // A dropped access would otherwise look like a plausible but wrong answer.
  expect(result.accesses).toBe(ACCESS_COUNT);
  return result;
}

describe('memory system simulation', () => {
  it('is deterministic for a fixed seed', () => {
    const first = run('ddr4', streaming);
    const second = run('ddr4', streaming);

    expect(first.elapsedNs).toBe(second.elapsedNs);
    expect(first.meanLatencyNs).toBe(second.meanLatencyNs);
    expect(first.achievedBandwidthBytesPerNs).toBe(second.achievedBandwidthBytesPerNs);
  });

  it('saturates the memory channel on a streaming workload', () => {
    const result = run('ddr4', streaming);

    expect(result.classification).toBe('resource-bound');
    expect(result.bottleneckId).toBe('memory');
    // Dual-channel DDR4-3200 is 51.2 GB/s; a saturated stream should reach it.
    expect(result.achievedBandwidthBytesPerNs).toBeGreaterThan(51.2 * 0.9);
  });

  it('ranks generations by bandwidth when bandwidth is the limit', () => {
    const ddr3 = run('ddr3', streaming);
    const ddr4 = run('ddr4', streaming);
    const ddr5 = run('ddr5', streaming);

    expect(ddr5.elapsedNs).toBeLessThan(ddr4.elapsedNs);
    expect(ddr4.elapsedNs).toBeLessThan(ddr3.elapsedNs);
    expect(ddr4.elapsedNs / ddr5.elapsedNs).toBeGreaterThan(1.5);
    expect(ddr3.elapsedNs / ddr4.elapsedNs).toBeGreaterThan(1.5);
  });

  it('exposes latency instead of bandwidth when accesses are dependent', () => {
    const result = run('ddr4', random);

    expect(result.classification).toBe('latency-bound');
    expect(result.bottleneckId).toBeNull();
    // One access in flight at a time: the classic pointer chase.
    expect(result.outstanding.memory.max).toBe(1);
  });

  it('does not reward bandwidth on a latency-bound workload', () => {
    const ddr3 = run('ddr3', random);
    const ddr4 = run('ddr4', random);
    const ddr5 = run('ddr5', random);

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
    const result = run('ddr4', resident);

    expect(result.hitRates.l1).toBeGreaterThan(0.9);
    // One DRAM fetch per distinct line in the working set, and no more: every
    // later visit is either an L1 hit or a merged secondary miss.
    expect(result.movedBytes).toBe((workingSetBytes / lineBytes) * lineBytes);
    expect(result.classification).toBe('resource-bound');
    expect(result.bottleneckId).toBe('cpu');
  });

  it('reports every resource with a utilisation in range', () => {
    const result = run('ddr5', streaming);
    expect(result.resources).toHaveLength(5);

    for (const resource of result.resources) {
      expect(resource.utilisation).toBeGreaterThanOrEqual(0);
      expect(resource.utilisation).toBeLessThanOrEqual(1.000_001);
    }
  });

  it('derives utilisation from busy time over elapsed time', () => {
    const result = run('ddr4', streaming);
    for (const resource of result.resources)
      expect(resource.utilisation).toBeCloseTo(resource.busyNs / result.elapsedNs, 12);
  });

  it('never charges lookup latency as occupancy', () => {
    const config = rig('ddr4');

    const accesses = generateAccesses(streamingSpec({ accessCount: 5_000 }));
    const baseline = simulate(config, accesses);
    const slowerLookups = simulate(
      {
        ...config,
        caches: {
          l1: { ...config.caches.l1, hitTimeNs: config.caches.l1.hitTimeNs * 4 },
          l2: { ...config.caches.l2, hitTimeNs: config.caches.l2.hitTimeNs * 4 },
          l3: { ...config.caches.l3, hitTimeNs: config.caches.l3.hitTimeNs * 4 },
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
    const config = rig('ddr4');

    const accessCount = 2_000;
    // Keep L1 at its normal depth — it is the core's in-flight gate — and
    // squeeze the levels below, so requests genuinely queue at L2/L3 and are
    // resumed as slots free. A tiny working set keeps many requests on the same
    // few lines, which exercises the L1 merge path and the queues below it.
    const squeezed: HardwareConfig = {
      ...config,
      caches: {
        l1: config.caches.l1,
        l2: { ...config.caches.l2, maxOutstandingMisses: 1 },
        l3: { ...config.caches.l3, maxOutstandingMisses: 1 },
      },
      memory: { ...config.memory, maxOutstandingMisses: 1 },
    };

    const result = simulate(
      squeezed,
      generateAccesses(streamingSpec({ accessCount, workingSetBytes: 4 * 1024 })),
    );
    expect(result.accesses).toBe(accessCount);
  });

  it('holds independent accesses behind a dependent one, because issue is in order', () => {
    const mixed = run('ddr4', mixedSpec({ accessCount: ACCESS_COUNT }));
    const stream = run('ddr4', streamingSpec({ accessCount: ACCESS_COUNT }));
    const chase = run('ddr4', randomSpec({ accessCount: ACCESS_COUNT }));

    expect(mixed.achievedBandwidthBytesPerNs).toBeLessThan(stream.achievedBandwidthBytesPerNs);
    expect(mixed.achievedBandwidthBytesPerNs).toBeGreaterThan(chase.achievedBandwidthBytesPerNs);
  });

  it('handles an empty workload without dividing by zero', () => {
    const result = simulate(rig('ddr4'), []);
    expect(result.elapsedNs).toBe(0);
    expect(result.accesses).toBe(0);
    expect(result.achievedBandwidthBytesPerNs).toBe(0);
    expect(result.meanLatencyNs).toBe(0);
  });

  it('moves the limiter off the bus once memory outruns the cache below it', () => {
    const config = rig('ddr4');

    const accesses = generateAccesses(streamingSpec({ accessCount: ACCESS_COUNT }));
    expect(simulate(config, accesses).bottleneckId).toBe('memory');

    // An absurdly fast DIMM: past the L3's own 128 B/ns, so the wall moves
    // rather than disappearing. This is acceptance criterion 2.
    const memory = { ...config.memory, mtPerSecond: 12_000 };
    const result = simulate({ ...config, memory }, accesses);

    expect(result.bottleneckId).toBe('l3');
    expect(result.classification).toBe('resource-bound');
    expect(result.achievedBandwidthBytesPerNs).toBeLessThanOrEqual(
      aggregateBandwidthBytesPerNs(memory) * 0.9,
    );
  });

  it('traces nothing by default, and only the requested accesses when asked', () => {
    const config = rig('ddr4');

    const accesses = generateAccesses(streamingSpec({ accessCount: 200 }));
    expect(simulate(config, accesses).spans).toHaveLength(0);

    const traced = simulate(config, accesses, { traceRequests: 10 });
    expect(traced.spans.length).toBeGreaterThan(0);
    expect(traced.spans.every(candidate => candidate.requestIndex < 10)).toBe(true);
  });

  it('traces well-formed spans covering lookup, transfer and fill', () => {
    const config = rig('ddr4');

    const accesses = generateAccesses(streamingSpec({ accessCount: 200 }));
    const result = simulate(config, accesses, { traceRequests: 50 });

    for (const kind of ['level', 'transfer', 'dram', 'fill'] as const)
      expect(result.spans.some(candidate => candidate.kind === kind)).toBe(true);

    for (const candidate of result.spans) {
      expect(candidate.startNs).toBeGreaterThanOrEqual(0);
      expect(candidate.endNs).toBeGreaterThanOrEqual(candidate.startNs);
      // The view plays this window, so nothing may sit outside it.
      expect(candidate.endNs).toBeLessThanOrEqual(result.elapsedNs);
    }
  });
});
