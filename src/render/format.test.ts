import { describe, expect, it } from 'vitest';

import {
  fitNsPerSecond,
  formatBandwidth,
  formatCount,
  formatDuration,
  formatPercent,
  logBar,
  MAX_NS_PER_SECOND,
  MIN_NS_PER_SECOND,
  nsPerSecondFromSlider,
  sliderFromNsPerSecond,
} from './format';

describe('formatDuration', () => {
  it('picks a unit that keeps the number readable', () => {
    expect(formatDuration(12.9)).toBe('12.9 ns');
    expect(formatDuration(1_500)).toBe('1.5 µs');
    expect(formatDuration(18_600_000)).toBe('18.6 ms');
  });

  it('never prints NaN or a negative duration', () => {
    expect(formatDuration(0)).toBe('0 ns');
    expect(formatDuration(Number.NaN)).toBe('0 ns');
    expect(formatDuration(-5)).toBe('0 ns');
  });
});

describe('the other readouts', () => {
  it('treats bytes per nanosecond as GB/s', () => {
    expect(formatBandwidth(89.541)).toBe('89.5 GB/s');
  });

  it('shows one decimal on a percentage', () => {
    expect(formatPercent(0.999)).toBe('99.9%');
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('groups thousands', () => {
    expect(formatCount(200_000)).toBe('200,000');
  });
});

describe('logBar', () => {
  it('keeps small values visible across orders of magnitude', () => {
    expect(logBar(0, 1_000)).toBe(0);
    expect(logBar(1_000, 1_000)).toBeCloseTo(1, 6);
    expect(logBar(10, 1_000)).toBeGreaterThan(0.2);
  });

  it('is safe when the maximum is zero', () => {
    expect(logBar(0, 0)).toBe(0);
    expect(logBar(5, 0)).toBe(0);
  });
});

describe('playback speed mapping', () => {
  it('round-trips through the logarithmic slider', () => {
    for (const position of [0, 0.25, 0.5, 0.75, 1])
      expect(sliderFromNsPerSecond(nsPerSecondFromSlider(position))).toBeCloseTo(position, 6);
  });

  it('is bounded, and clamps rather than extrapolating', () => {
    expect(nsPerSecondFromSlider(0)).toBeCloseTo(MIN_NS_PER_SECOND, 6);
    expect(nsPerSecondFromSlider(1)).toBeCloseTo(MAX_NS_PER_SECOND, 6);
    expect(nsPerSecondFromSlider(-5)).toBeCloseTo(MIN_NS_PER_SECOND, 6);
    expect(nsPerSecondFromSlider(5)).toBeCloseTo(MAX_NS_PER_SECOND, 6);
    expect(sliderFromNsPerSecond(0)).toBe(0);
    expect(sliderFromNsPerSecond(1e12)).toBe(1);
  });

  it('pins the midpoint, so the round-trip cannot pass on a wrong base', () => {
    // 10^(0.5 x log10(100000)) = 316.2
    expect(nsPerSecondFromSlider(0.5)).toBeCloseTo(316.2, 1);
  });
});

describe('fitNsPerSecond', () => {
  it('plays the whole window in about the target time', () => {
    expect(fitNsPerSecond(600, 12)).toBeCloseTo(50, 6);
  });

  it('falls back to the floor for an empty window', () => {
    expect(fitNsPerSecond(0)).toBe(MIN_NS_PER_SECOND);
  });
});
