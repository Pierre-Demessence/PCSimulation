import type { MemorySpec } from './types';

const TRANSFERS_PER_MTS = 1e6;
const BYTES_PER_TRANSFER = 8;
const NS_PER_SECOND = 1e9;

/** Transfer rate of one channel, in bytes per second. */
export function bytesPerSecond(mtPerSecond: number): number {
  return mtPerSecond * TRANSFERS_PER_MTS * BYTES_PER_TRANSFER;
}

/** Transfer rate of one channel, in bytes per nanosecond (GB/s numerically). */
export function bytesPerNanosecond(mtPerSecond: number): number {
  return bytesPerSecond(mtPerSecond) / NS_PER_SECOND;
}

/** Aggregate rate across all populated channels. */
export function aggregateBandwidthBytesPerNs(spec: MemorySpec): number {
  return bytesPerNanosecond(spec.mtPerSecond) * spec.channels;
}

/**
 * CAS latency in nanoseconds. DDR signals twice per clock, so the cycle time
 * is `2000 / MT_per_s` and the sticker CL counts those cycles.
 */
export function casLatencyNs(mtPerSecond: number, casLatency: number): number {
  return casLatency * (2000 / mtPerSecond);
}

/**
 * A complete DRAM access as the core sees it: the CAS slice plus the
 * controller, PHY and row-activation overhead every generation pays.
 */
export function fullAccessNs(spec: MemorySpec): number {
  return spec.accessOverheadNs + casLatencyNs(spec.mtPerSecond, spec.casLatency);
}

/** Channel occupancy for moving `bytes`, excluding DRAM access latency. */
export function transferNs(bytes: number, spec: MemorySpec): number {
  return bytes / aggregateBandwidthBytesPerNs(spec);
}
