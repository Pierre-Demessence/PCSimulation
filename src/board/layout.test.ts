import type { BoardLayout, BoardPart, BoardRect } from './types';

import { describe, expect, it } from 'vitest';

import { testConfig } from '@/testing/build';

import {
  BOARD_HEIGHT_MM,
  BOARD_WIDTH_MM,
  boardLayout,
  clipBetweenRects,
  linkSegment,
  partAtPoint,
  partById,
  partRect,
  rectsOverlap,
} from './layout';

function rig(): BoardLayout {
  return boardLayout(testConfig());
}

function insideBoard(part: BoardPart, explode: number): boolean {
  const rect = partRect(part, explode);
  return rect.xMm >= 0
    && rect.yMm >= 0
    && rect.xMm + rect.wMm <= BOARD_WIDTH_MM
    && rect.yMm + rect.hMm <= BOARD_HEIGHT_MM;
}

const CACHE_IDS = ['l1', 'l2', 'l3'] as const;

describe('boardLayout', () => {
  it('keeps every part on the board at both ends of the slider', () => {
    const layout = rig();
    for (const part of layout.parts) {
      expect(insideBoard(part, 0), `${part.id} collapsed`).toBe(true);
      expect(insideBoard(part, 1), `${part.id} exploded`).toBe(true);
    }
  });

  it('keeps every part on the board all the way through the slider', () => {
    const layout = rig();
    for (const explode of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      for (const part of layout.parts)
        expect(insideBoard(part, explode), `${part.id} at ${explode}`).toBe(true);
    }
  });

  it('leaves no part hidden behind another once exploded', () => {
    const layout = rig();
    const rects = layout.parts.map(part => ({ id: part.id, rect: partRect(part, 1) }));

    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        expect(
          rectsOverlap(rects[a].rect, rects[b].rect),
          `${rects[a].id} overlaps ${rects[b].id}`,
        ).toBe(false);
      }
    }
  });

  it('nests the caches in the CPU package while collapsed, and lifts them out when exploded', () => {
    const layout = rig();
    const cpu = partById(layout, 'cpu');
    if (cpu === undefined)
      throw new Error('the layout has no CPU');

    for (const id of CACHE_IDS) {
      const cache = partById(layout, id);
      if (cache === undefined)
        throw new Error(`the layout has no ${id}`);
      expect(rectsOverlap(partRect(cache, 0), partRect(cpu, 0)), `${id} collapsed`).toBe(true);
      expect(rectsOverlap(partRect(cache, 1), partRect(cpu, 1)), `${id} exploded`).toBe(false);
    }
  });

  it('takes the slot count and the population from the memory spec', () => {
    const config = testConfig();

    expect(partById(rig(), 'memory')?.strips).toEqual({ count: 4, occupied: 2 });

    // The fixture populates two of its four slots; a four-channel spec fills
    // four, so the picture follows the hardware rather than the drawing.
    const fourChannel = boardLayout({ ...config, memory: { ...config.memory, channels: 4 } });
    expect(partById(fourChannel, 'memory')?.strips).toEqual({ count: 4, occupied: 4 });

    const slotless = boardLayout({ ...config, motherboard: { ...config.motherboard, dimmSlots: 0 } });
    expect(partById(slotless, 'memory')?.strips).toEqual({ count: 0, occupied: 0 });
  });

  it('clamps the explode position', () => {
    const part = partById(rig(), 'memory');
    if (part === undefined)
      throw new Error('the layout has no memory');
    expect(partRect(part, -1)).toEqual(part.boardRect);
    expect(partRect(part, 2)).toEqual(part.explodedRect);
  });

  it('picks the part on top when a cache sits on its package', () => {
    const layout = rig();
    expect(partAtPoint(layout, 0, 114, 58)?.id).toBe('l1');
    // The package's own name strip, above the cache plates.
    expect(partAtPoint(layout, 0, 122, 43)?.id).toBe('cpu');
    expect(partAtPoint(layout, 0, 185, 93)?.id).toBe('memory');
    expect(partAtPoint(layout, 0, 5, 5)).toBeUndefined();
  });

  it('still finds a part under the pointer once the view is exploded', () => {
    const layout = rig();
    expect(partAtPoint(layout, 1, 99, 35)?.id).toBe('l1');
    expect(partAtPoint(layout, 1, 40, 48)?.id).toBe('cpu');
    expect(partAtPoint(layout, 1, 275, 50)?.id).toBe('memory');
    expect(partAtPoint(layout, 1, 300, 240)).toBeUndefined();
  });
});

describe('clipBetweenRects', () => {
  const left: BoardRect = { hMm: 10, wMm: 10, xMm: 0, yMm: 0 };
  const right: BoardRect = { hMm: 10, wMm: 10, xMm: 20, yMm: 0 };

  it('trims a trace to the gap between two parts', () => {
    expect(clipBetweenRects(left, right)).toEqual({
      from: { xMm: 10, yMm: 5 },
      to: { xMm: 20, yMm: 5 },
    });
  });

  it('returns nothing when one part sits inside the other', () => {
    expect(clipBetweenRects(left, { hMm: 2, wMm: 2, xMm: 3, yMm: 3 })).toBeNull();
  });

  it('returns nothing when the two parts share a centre, rather than NaN', () => {
    expect(clipBetweenRects(left, { hMm: 10, wMm: 10, xMm: 0, yMm: 0 })).toBeNull();
  });

  it('still reports a visible stretch when the boxes overlap', () => {
    const segment = clipBetweenRects(
      { hMm: 10, wMm: 100, xMm: 0, yMm: 0 },
      { hMm: 200, wMm: 20, xMm: 90, yMm: 0 },
    );
    if (segment === null)
      throw new Error('an overlapping pair can still leave a visible stretch');
    expect(segment.from.xMm).toBeLessThan(segment.to.xMm);
  });
});

describe('linkSegment', () => {
  it('shows only the memory trace while the package is closed', () => {
    const layout = rig();
    const visible = layout.links
      .map(link => ({ id: link.id, segment: linkSegment(layout, 0, link) }))
      .filter(entry => entry.segment !== null)
      .map(entry => entry.id);

    expect(visible).toEqual(['l3-memory']);
  });

  it('shows the whole chain once exploded', () => {
    const layout = rig();
    const visible = layout.links.filter(link => linkSegment(layout, 1, link) !== null);

    expect(visible.map(link => link.id)).toEqual(['cpu-l1', 'l1-l2', 'l2-l3', 'l3-memory']);
  });

  it('draws nothing for a link whose endpoints are missing', () => {
    const layout = rig();
    expect(linkSegment(layout, 1, { from: 'cpu', id: 'cpu-ghost', levelId: null, to: 'ghost' })).toBeNull();
    expect(linkSegment(layout, 1, { from: 'ghost', id: 'ghost-l1', levelId: null, to: 'l1' })).toBeNull();
  });

  it('draws the memory trace toward the DIMMs', () => {
    const layout = rig();
    const link = layout.links.find(candidate => candidate.id === 'l3-memory');
    const memory = partById(layout, 'memory');
    if (link === undefined || memory === undefined)
      throw new Error('the layout has no memory link or no DIMM bank');

    const segment = linkSegment(layout, 0, link);
    if (segment === null)
      throw new Error('the memory trace should be visible while collapsed');

    // It starts at the CPU package and stops at the sockets, because a trace
    // that ran into the bank would be buried in the sticks.
    expect(segment.to.xMm).toBeCloseTo(partRect(memory, 0).xMm);
    expect(segment.from.xMm).toBeLessThan(segment.to.xMm);
  });
});
