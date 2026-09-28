import type {
  CacheHierarchy,
  CpuSpec,
  MemoryGeneration,
  MemorySpec,
} from '@/sim';

export const GIB = 1024 ** 3;

/**
 * Each level gets one generous outstanding-miss limit — one that stands in for
 * MSHRs *plus* the next-line prefetching a real core does. Saturating a
 * dual-channel DDR5 link needs on the order of a hundred outstanding lines — what a real
 * prefetcher delivers but a bare MSHR file does not. Without a budget this size
 * the stream is limited by in-flight capacity rather than by the memory channel,
 * and the bandwidth-versus-latency lesson disappears.
 *
 * The L1 limit doubles as the whole core's memory-level parallelism, since a
 * miss cannot be in flight without holding an L1 slot.
 */
const IN_FLIGHT_BUDGET = 192;

/** Deeper per-level limits, so L1 — and therefore the core — is what binds. */
const L2_IN_FLIGHT = 256;
const L3_IN_FLIGHT = 320;

const CLOCK_HZ = 4e9;

/** Issue cycles per access. The core's issue time is this divided by the clock. */
export const CYCLES_PER_ISSUE = 1;

/**
 * The core the model has: one core at a fixed issue rate. It is also the CPU
 * part's blank, which is why it is not named after a real processor.
 */
export const BASELINE_CPU: CpuSpec = {
  clockHz: CLOCK_HZ,
  cores: 1,
  id: 'cpu',
  memoryGenerations: ['ddr3', 'ddr4', 'ddr5'],
  role: 'work',
  serviceTimeNs: CYCLES_PER_ISSUE / (CLOCK_HZ / 1e9),
  socket: 'lga1700',
};

export const CACHE_HIERARCHY: CacheHierarchy = {
  l1: {
    bytesPerNs: 256,
    capacityBytes: 32 * 1024,
    hitTimeNs: 1,
    id: 'l1',
    maxOutstandingMisses: IN_FLIGHT_BUDGET,
    role: 'tank',
    ways: 8,
  },
  l2: {
    bytesPerNs: 192,
    capacityBytes: 512 * 1024,
    hitTimeNs: 4,
    id: 'l2',
    maxOutstandingMisses: L2_IN_FLIGHT,
    role: 'tank',
    ways: 8,
  },
  l3: {
    bytesPerNs: 128,
    capacityBytes: 16 * 1024 * 1024,
    hitTimeNs: 15,
    id: 'l3',
    maxOutstandingMisses: L3_IN_FLIGHT,
    role: 'tank',
    ways: 16,
  },
};

export const MEMORY_DEFAULTS = {
  accessOverheadNs: 60,
  capacityBytes: 32 * GIB,
  channels: 2,
  maxOutstandingMisses: IN_FLIGHT_BUDGET,
} as const;

/** Builds a DIMM spec from the numbers printed on the sticker. */
export function memorySpec(
  generation: MemoryGeneration,
  mtPerSecond: number,
  casLatency: number,
  overrides: Partial<MemorySpec> = {},
): MemorySpec {
  return {
    ...MEMORY_DEFAULTS,
    casLatency,
    generation,
    id: `${generation}-${mtPerSecond}-cl${casLatency}`,
    mtPerSecond,
    role: 'pipe',
    ...overrides,
  };
}
