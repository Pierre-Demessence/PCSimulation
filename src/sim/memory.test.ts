import { describe, expect, it } from 'vitest';

import { memorySpec } from '@/data';

import { aggregateBandwidthBytesPerNs, casLatencyNs, fullAccessNs, transferNs } from './memory';

describe('memory arithmetic', () => {
  it('derives CAS latency from the sticker numbers', () => {
    expect(casLatencyNs(1600, 9)).toBeCloseTo(11.25, 6);
    expect(casLatencyNs(3200, 16)).toBeCloseTo(10, 6);
    expect(casLatencyNs(5600, 36)).toBeCloseTo(12.857, 2);
  });

  it('derives per-channel bandwidth from MT/s', () => {
    expect(aggregateBandwidthBytesPerNs(memorySpec('ddr3', 1600, 9, { channels: 1 }))).toBeCloseTo(12.8, 6);
    expect(aggregateBandwidthBytesPerNs(memorySpec('ddr4', 3200, 16, { channels: 1 }))).toBeCloseTo(25.6, 6);
    expect(aggregateBandwidthBytesPerNs(memorySpec('ddr5', 5600, 36, { channels: 1 }))).toBeCloseTo(44.8, 6);
  });

  it('multiplies bandwidth by channel count', () => {
    const single = memorySpec('ddr4', 3200, 16, { channels: 1 });
    const dual = memorySpec('ddr4', 3200, 16, { channels: 2 });
    expect(aggregateBandwidthBytesPerNs(dual)).toBeCloseTo(aggregateBandwidthBytesPerNs(single) * 2, 6);
  });

  it('adds the shared controller overhead on top of CAS', () => {
    const spec = memorySpec('ddr4', 3200, 16);
    expect(fullAccessNs(spec)).toBeCloseTo(60 + 10, 6);
  });

  it('scales channel occupancy with transfer size', () => {
    const spec = memorySpec('ddr4', 3200, 16, { channels: 1 });
    expect(transferNs(64, spec)).toBeCloseTo(64 / 25.6, 6);
    expect(transferNs(128, spec)).toBeCloseTo(2 * transferNs(64, spec), 6);
  });
});
