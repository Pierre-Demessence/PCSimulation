import type { SimSpan } from '@/sim';

import { describe, expect, it } from 'vitest';

import { countActiveSpans, PipelineView, simulatedNsAt } from './pipeline';

function span(
  requestIndex: number,
  level: SimSpan['level'],
  startNs: number,
  endNs: number,
  kind: SimSpan['kind'] = 'level',
): SimSpan {
  return { endNs, kind, level, requestIndex, startNs };
}

describe('simulatedNsAt', () => {
  it('scales wall time by a constant dilation', () => {
    expect(simulatedNsAt(1_000, 50)).toBe(50);
    expect(simulatedNsAt(2_000, 50)).toBe(100);
  });

  it('is zero for nonsense input rather than Infinity or NaN', () => {
    expect(simulatedNsAt(-1, 50)).toBe(0);
    expect(simulatedNsAt(1_000, 0)).toBe(0);
  });
});

describe('countActiveSpans', () => {
  const spans = [
    span(0, 'memory', 10, 20),
    span(1, 'memory', 15, 25),
    span(2, 'l1', 10, 20),
  ];

  it('counts only the level asked for', () => {
    expect(countActiveSpans(spans, 'memory', 16)).toBe(2);
    expect(countActiveSpans(spans, 'l1', 16)).toBe(1);
    expect(countActiveSpans(spans, 'l3', 16)).toBe(0);
  });

  it('treats spans as half-open, so a finished one is no longer in flight', () => {
    expect(countActiveSpans(spans, 'memory', 20)).toBe(1);
    expect(countActiveSpans(spans, 'memory', 25)).toBe(0);
  });
});

describe('pipelineView.windowOf', () => {
  it('is the latest span end', () => {
    expect(PipelineView.windowOf([span(0, 'l1', 0, 10), span(1, 'l2', 5, 40)])).toBe(40);
  });

  it('is zero when nothing was traced', () => {
    expect(PipelineView.windowOf([])).toBe(0);
  });
});
