import type { ParameterUnit } from '@/data';
import type { LevelId, SimSpan } from '@/sim';

const NS_PER_US = 1_000;
const NS_PER_MS = 1_000_000;

const KIB = 1024;
const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

/** Smallest and largest animation speeds, in simulated nanoseconds per second. */
export const MIN_NS_PER_SECOND = 1;
export const MAX_NS_PER_SECOND = 100_000;

/** How long the traced window should take to play, in real seconds. */
export const TARGET_PLAY_SECONDS = 12;

export function formatDuration(ns: number): string {
  if (!Number.isFinite(ns) || ns <= 0)
    return '0 ns';
  if (ns < NS_PER_US)
    return `${ns.toFixed(1)} ns`;
  if (ns < NS_PER_MS)
    return `${(ns / NS_PER_US).toFixed(1)} µs`;
  return `${(ns / NS_PER_MS).toFixed(1)} ms`;
}

/** Bytes per nanosecond is numerically GB/s. */
export function formatBandwidth(bytesPerNs: number): string {
  return `${bytesPerNs.toFixed(1)} GB/s`;
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

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

/**
 * One formatter per unit, so two call sites cannot render the same number two
 * ways. A descriptor carries the unit and never a formatter.
 */
export function formatUnit(value: number, unit: ParameterUnit): string {
  switch (unit) {
    case 'bytes': return formatBytes(value);
    case 'bytes-per-ns': return formatBandwidth(value);
    case 'count': return formatCount(value);
    case 'cycles': return `${formatCount(value)} cycles`;
    case 'hz': return formatHz(value);
    case 'mt-per-s': return `${formatCount(value)} MT/s`;
    case 'ns': return `${value} ns`;
    case 'per-ns': return `${trimUnit(value)} per ns`;
  }
}

function trimUnit(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const LEVEL_LABELS: Record<LevelId, string> = {
  cpu: 'CPU core',
  l1: 'L1 cache',
  l2: 'L2 cache',
  l3: 'L3 cache',
  memory: 'Memory bus',
};

/** Human name for a level, for anywhere that shows the limiter. */
export function levelLabel(id: LevelId): string {
  return LEVEL_LABELS[id];
}

/** Simulated time reached after `elapsedMs` of playback at a constant rate. */
export function simulatedNsAt(elapsedMs: number, nsPerSecond: number): number {
  if (!(elapsedMs > 0) || !(nsPerSecond > 0))
    return 0;
  return (elapsedMs / 1000) * nsPerSecond;
}

/** Longest span end, which is how much simulated time there is to play. */
export function windowOf(spans: readonly SimSpan[]): number {
  let windowNs = 0;
  for (const span of spans)
    windowNs = Math.max(windowNs, span.endNs);
  return windowNs;
}

/** Clamps a fraction to 0..1, so a control cannot drive a bar past its track. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Log-scaled bar length, so quantities spanning orders of magnitude stay
 * visible. Callers must label the bar as logarithmic — a log bar next to a
 * linear one with no label is a lie.
 */
export function logBar(value: number, max: number): number {
  if (!(value > 0) || !(max > 0))
    return 0;
  return Math.min(1, Math.log10(1 + value) / Math.log10(1 + max));
}

/** Maps a 0..1 slider position onto a logarithmic speed range. */
export function nsPerSecondFromSlider(position: number): number {
  const clamped = Math.min(1, Math.max(0, position));
  const span = Math.log10(MAX_NS_PER_SECOND / MIN_NS_PER_SECOND);
  return MIN_NS_PER_SECOND * 10 ** (clamped * span);
}

/** Inverse of {@link nsPerSecondFromSlider}, for putting a value back on the slider. */
export function sliderFromNsPerSecond(nsPerSecond: number): number {
  const clamped = Math.min(MAX_NS_PER_SECOND, Math.max(MIN_NS_PER_SECOND, nsPerSecond));
  const span = Math.log10(MAX_NS_PER_SECOND / MIN_NS_PER_SECOND);
  return Math.log10(clamped / MIN_NS_PER_SECOND) / span;
}

/** Chooses a speed that plays the whole window in about {@link TARGET_PLAY_SECONDS}. */
export function fitNsPerSecond(windowNs: number, targetSeconds = TARGET_PLAY_SECONDS): number {
  if (!(windowNs > 0) || !(targetSeconds > 0))
    return MIN_NS_PER_SECOND;
  return Math.min(MAX_NS_PER_SECOND, Math.max(MIN_NS_PER_SECOND, windowNs / targetSeconds));
}
