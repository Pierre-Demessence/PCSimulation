import type { CacheSpec, MemorySpec } from '@/sim';

const KIB = 1024;
const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

/**
 * Formatting for the board's own labels.
 *
 * `src/board/` must not import `src/render/`, so these duplicate that layer's
 * formatters by design — extracting one module both could import is a larger
 * change than the labels need.
 */
export function formatBytes(bytes: number): string {
  if (bytes >= GIB)
    return `${trimUnit(bytes / GIB)} GiB`;
  if (bytes >= MIB)
    return `${trimUnit(bytes / MIB)} MiB`;
  return `${trimUnit(bytes / KIB)} KiB`;
}

export function formatHz(hz: number): string {
  if (hz >= 1e9)
    return `${trimUnit(hz / 1e9)} GHz`;
  if (hz >= 1e6)
    return `${trimUnit(hz / 1e6)} MHz`;
  return `${formatCount(hz)} Hz`;
}

/** Nanoseconds exactly: a 0.25 ns hit time must not render as 0.3 ns. */
export function formatNs(ns: number): string {
  return `${ns} ns`;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** `2 channels`, `1 core` — a label is prose, so it reads as prose. */
export function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${formatCount(count)} ${noun}s`;
}

/** The numbers on the DIMM's sticker: `DDR4-3200 CL16, 32 GiB in 2 channels`. */
export function memoryIdentity(memory: MemorySpec): string {
  const generation = memory.generation.toUpperCase();
  const capacity = formatBytes(memory.capacityBytes);
  return `${generation}-${memory.mtPerSecond} CL${memory.casLatency}, ${capacity} in ${plural(memory.channels, 'channel')}`;
}

/** The note a cache level carries: `32 KiB per core, 1 ns lookup`. */
export function cacheNote(spec: CacheSpec, sharing: 'per core' | 'shared'): string {
  return `${formatBytes(spec.capacityBytes)} ${sharing}, ${formatNs(spec.hitTimeNs)} lookup`;
}

function trimUnit(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
