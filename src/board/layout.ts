import type { BoardLayout, BoardLink, BoardPart, BoardPoint, BoardRect, BoardSegment } from './types';

import type { HardwareConfig } from '@/sim';

/** ATX: 305 mm by 244 mm, seen from above with the rear I/O along the top. */
export const BOARD_WIDTH_MM = 305;
export const BOARD_HEIGHT_MM = 244;

/**
 * Every part carries two rectangles: where it physically sits, and where it sits
 * when the view is fully exploded. Authoring the exploded layout by hand is what
 * makes the slider reveal a readable data path rather than a shuffled pile.
 *
 * Sizes may differ between the two, which is the point: a cache that occupies
 * 14 mm inside the package has to become a legible block with its own meter once
 * it has been pulled out. Two rules the authoring must keep, both asserted in
 * the tests:
 *
 * - every rectangle lies inside the board, at both ends of the slider;
 * - the exploded rectangles never overlap, so no part hides another.
 *
 * The one intended overlap is at the collapsed end: L1, L2 and L3 sit inside the
 * CPU package, because that is where they are.
 */
const PARTS: readonly BoardPart[] = [
  {
    boardRect: { hMm: 66, wMm: 60, xMm: 48, yMm: 36 },
    explodedRect: { hMm: 60, wMm: 60, xMm: 12, yMm: 20 },
    id: 'cpu',
    kind: 'cpu',
    label: 'CPU package — the core and its three cache levels',
    levelId: 'cpu',
    short: 'CPU',
  },
  {
    boardRect: { hMm: 20, wMm: 20, xMm: 54, yMm: 48 },
    explodedRect: { hMm: 32, wMm: 32, xMm: 86, yMm: 34 },
    id: 'l1',
    kind: 'cache',
    label: 'L1 cache — 32 KiB per core, 1 ns lookup',
    levelId: 'l1',
    short: 'L1',
  },
  {
    boardRect: { hMm: 26, wMm: 28, xMm: 78, yMm: 48 },
    explodedRect: { hMm: 40, wMm: 40, xMm: 132, yMm: 30 },
    id: 'l2',
    kind: 'cache',
    label: 'L2 cache — 512 KiB per core, 4 ns lookup',
    levelId: 'l2',
    short: 'L2',
  },
  {
    boardRect: { hMm: 18, wMm: 52, xMm: 54, yMm: 76 },
    explodedRect: { hMm: 46, wMm: 56, xMm: 186, yMm: 26 },
    id: 'l3',
    kind: 'cache',
    label: 'L3 cache — 16 MiB shared, 15 ns lookup',
    levelId: 'l3',
    short: 'L3',
  },
  {
    boardRect: { hMm: 128, wMm: 44, xMm: 120, yMm: 26 },
    explodedRect: { hMm: 72, wMm: 42, xMm: 254, yMm: 20 },
    id: 'memory',
    kind: 'dimm',
    label: 'Memory — DIMMs in the board\u2019s slots',
    levelId: 'memory',
    short: 'RAM',
  },
  {
    boardRect: { hMm: 24, wMm: 88, xMm: 26, yMm: 112 },
    explodedRect: { hMm: 26, wMm: 100, xMm: 16, yMm: 112 },
    id: 'gpu',
    kind: 'gpu',
    label: 'Graphics card (PCIe \u00D716)',
    levelId: null,
    short: 'GPU',
  },
  {
    boardRect: { hMm: 14, wMm: 76, xMm: 96, yMm: 164 },
    explodedRect: { hMm: 16, wMm: 76, xMm: 16, yMm: 152 },
    id: 'm2',
    kind: 'slot',
    label: 'M.2 storage slot',
    levelId: null,
    short: 'M.2',
  },
  {
    boardRect: { hMm: 40, wMm: 40, xMm: 196, yMm: 148 },
    explodedRect: { hMm: 44, wMm: 44, xMm: 128, yMm: 116 },
    id: 'chipset',
    kind: 'chipset',
    label: 'Chipset',
    levelId: null,
    short: 'Chipset',
  },
  {
    boardRect: { hMm: 44, wMm: 44, xMm: 252, yMm: 176 },
    explodedRect: { hMm: 40, wMm: 60, xMm: 128, yMm: 172 },
    id: 'storage',
    kind: 'storage',
    label: 'Drive bays',
    levelId: null,
    short: 'Drives',
  },
  {
    boardRect: { hMm: 32, wMm: 40, xMm: 256, yMm: 30 },
    explodedRect: { hMm: 44, wMm: 80, xMm: 208, yMm: 116 },
    id: 'psu',
    kind: 'psu',
    label: 'Power delivery',
    levelId: null,
    short: 'PSU',
  },
];

/**
 * The access path, core outwards. Only the last one leaves the CPU package, so
 * only the last one is visible while the view is collapsed.
 */
const LINKS: readonly BoardLink[] = [
  { from: 'cpu', id: 'cpu-l1', levelId: null, to: 'l1' },
  { from: 'l1', id: 'l1-l2', levelId: null, to: 'l2' },
  { from: 'l2', id: 'l2-l3', levelId: null, to: 'l3' },
  { from: 'l3', id: 'l3-memory', levelId: 'memory', to: 'memory' },
];

/**
 * The parts the current rig actually populates. Slot count and population are
 * the rig's own numbers, so swapping to a four-channel board fills two more
 * strips — the picture follows the hardware rather than a fixed drawing.
 */
export function boardLayout(config: HardwareConfig): BoardLayout {
  const occupied = Math.min(config.memory.channels, config.motherboard.dimmSlots);
  const parts = PARTS.map(part =>
    part.id === 'memory'
      ? { ...part, strips: { count: config.motherboard.dimmSlots, occupied } }
      : part);

  return {
    heightMm: BOARD_HEIGHT_MM,
    links: LINKS,
    parts,
    widthMm: BOARD_WIDTH_MM,
  };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Where a part sits at the given explode position: 0 assembled, 1 fully apart. */
export function partRect(part: BoardPart, explode: number): BoardRect {
  const t = clamp01(explode);
  return {
    hMm: lerp(part.boardRect.hMm, part.explodedRect.hMm, t),
    wMm: lerp(part.boardRect.wMm, part.explodedRect.wMm, t),
    xMm: lerp(part.boardRect.xMm, part.explodedRect.xMm, t),
    yMm: lerp(part.boardRect.yMm, part.explodedRect.yMm, t),
  };
}

export function partById(layout: BoardLayout, id: string): BoardPart | undefined {
  return layout.parts.find(part => part.id === id);
}

/**
 * The part under a point. Later parts are drawn over earlier ones, so the search
 * runs backwards — which is what keeps a cache clickable on top of its package.
 */
export function partAtPoint(
  layout: BoardLayout,
  explode: number,
  xMm: number,
  yMm: number,
): BoardPart | undefined {
  for (let index = layout.parts.length - 1; index >= 0; index--) {
    const part = layout.parts[index];
    if (rectContains(partRect(part, explode), { xMm, yMm }))
      return part;
  }
  return undefined;
}

/** Touching edges do not count: a part flush against another is not inside it. */
export function rectsOverlap(a: BoardRect, b: BoardRect): boolean {
  return a.xMm < b.xMm + b.wMm
    && b.xMm < a.xMm + a.wMm
    && a.yMm < b.yMm + b.hMm
    && b.yMm < a.yMm + a.hMm;
}

export function rectCentre(rect: BoardRect): BoardPoint {
  return { xMm: rect.xMm + rect.wMm / 2, yMm: rect.yMm + rect.hMm / 2 };
}

function rectContains(rect: BoardRect, point: BoardPoint): boolean {
  return point.xMm >= rect.xMm
    && point.xMm <= rect.xMm + rect.wMm
    && point.yMm >= rect.yMm
    && point.yMm <= rect.yMm + rect.hMm;
}

/** Distance along the ray at which it leaves an axis-aligned box it started in. */
function exitT(rect: BoardRect, from: BoardPoint, to: BoardPoint): number {
  const dx = to.xMm - from.xMm;
  const dy = to.yMm - from.yMm;
  const tx = dx > 0
    ? (rect.xMm + rect.wMm - from.xMm) / dx
    : dx < 0 ? (rect.xMm - from.xMm) / dx : Number.POSITIVE_INFINITY;
  const ty = dy > 0
    ? (rect.yMm + rect.hMm - from.yMm) / dy
    : dy < 0 ? (rect.yMm - from.yMm) / dy : Number.POSITIVE_INFINITY;
  return Math.min(tx, ty);
}

/** Distance along the ray at which it enters an axis-aligned box it ends in. */
function entryT(rect: BoardRect, from: BoardPoint, to: BoardPoint): number {
  const dx = to.xMm - from.xMm;
  const dy = to.yMm - from.yMm;
  const tx = dx > 0
    ? (rect.xMm - from.xMm) / dx
    : dx < 0 ? (rect.xMm + rect.wMm - from.xMm) / dx : Number.NEGATIVE_INFINITY;
  const ty = dy > 0
    ? (rect.yMm - from.yMm) / dy
    : dy < 0 ? (rect.yMm + rect.hMm - from.yMm) / dy : Number.NEGATIVE_INFINITY;
  return Math.max(tx, ty);
}

/**
 * The stretch of a trace that is actually visible: the part of the line between
 * two part centres that lies outside both boxes. Returns null when there is
 * none, which is the case for a trace that never leaves its package — a link
 * inside the CPU is invisible until the view is exploded, exactly as it would be
 * on a real board.
 */
export function clipBetweenRects(from: BoardRect, to: BoardRect): BoardSegment | null {
  const start = rectCentre(from);
  const end = rectCentre(to);
  const leave = exitT(from, start, end);
  const arrive = entryT(to, start, end);
  if (!(leave < arrive))
    return null;

  return {
    from: { xMm: lerp(start.xMm, end.xMm, leave), yMm: lerp(start.yMm, end.yMm, leave) },
    to: { xMm: lerp(start.xMm, end.xMm, arrive), yMm: lerp(start.yMm, end.yMm, arrive) },
  };
}

/**
 * A trace that runs entirely inside a third part is buried in that part. The
 * caches sit side by side within the CPU package, so their traces are hidden
 * until the package is pulled apart — the same reason you cannot see the wiring
 * inside a real chip.
 */
function isBuried(
  layout: BoardLayout,
  explode: number,
  link: BoardLink,
  segment: BoardSegment,
): boolean {
  return layout.parts.some((part) => {
    if (part.id === link.from || part.id === link.to)
      return false;
    const rect = partRect(part, explode);
    return rectContains(rect, segment.from) && rectContains(rect, segment.to);
  });
}

/** Where a link is drawn at the given explode position, or null when buried. */
export function linkSegment(layout: BoardLayout, explode: number, link: BoardLink): BoardSegment | null {
  const from = partById(layout, link.from);
  const to = partById(layout, link.to);
  if (from === undefined || to === undefined)
    return null;

  const segment = clipBetweenRects(partRect(from, explode), partRect(to, explode));
  if (segment === null || isBuried(layout, explode, link, segment))
    return null;
  return segment;
}
