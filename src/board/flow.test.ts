import type { SimSpan } from '@/sim';

import { describe, expect, it } from 'vitest';

import { tokensAt, travelsBackUp } from './flow';

function span(
  requestIndex: number,
  level: SimSpan['level'],
  startNs: number,
  endNs: number,
  kind: SimSpan['kind'] = 'level',
): SimSpan {
  return { endNs, kind, level, requestIndex, startNs };
}

describe('tokensAt', () => {
  const spans = [
    span(0, 'l1', 100, 200),
    span(1, 'l1', 150, 250, 'fill'),
    span(2, 'memory', 150, 250, 'transfer'),
  ];

  it('counts only the requests resident at that level at that instant', () => {
    expect(tokensAt(spans, 'l1', 120).length).toBe(1);
    expect(tokensAt(spans, 'l1', 175).length).toBe(2);
    expect(tokensAt(spans, 'l1', 300).length).toBe(0);
  });

  it('excludes the end of a span, so a token is never in two places at once', () => {
    expect(tokensAt([span(0, 'l1', 100, 200)], 'l1', 200).length).toBe(0);
  });

  it('ignores spans at other levels', () => {
    expect(tokensAt(spans, 'memory', 175).map(token => token.requestIndex)).toEqual([2]);
  });

  it('runs progress from zero to one across the span', () => {
    expect(tokensAt(spans, 'l1', 150)[0].progress).toBeCloseTo(0.5);
    expect(tokensAt(spans, 'l1', 249)[0].progress).toBeCloseTo(0.99);
  });

  it('ignores a zero-length span rather than dividing by zero', () => {
    expect(tokensAt([span(0, 'l1', 100, 100)], 'l1', 100)).toEqual([]);
  });
});

describe('travelsBackUp', () => {
  it('sends only fills back toward the core', () => {
    expect(travelsBackUp('fill')).toBe(true);
    expect(travelsBackUp('dram')).toBe(false);
    expect(travelsBackUp('level')).toBe(false);
    expect(travelsBackUp('transfer')).toBe(false);
  });
});
