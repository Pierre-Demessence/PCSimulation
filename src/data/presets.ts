import type {
  CacheHierarchy,
  CpuSpec,
  HardwareConfig,
  MemoryGeneration,
  MemorySpec,
  MotherboardSpec,
} from '@/sim';

export const GIB = 1024 ** 3;

/**
 * v0.1 gives each level one generous outstanding-miss limit standing in for
 * MSHRs *plus* the next-line prefetching a real core does. Saturating a
 * dual-channel DDR5 link needs on the order of a hundred outstanding lines —
 * what a real prefetcher delivers but a bare MSHR file does not. Without a
 * budget this size the stream is limited by in-flight capacity rather than by
 * the memory channel, and the bandwidth-versus-latency lesson disappears.
 *
 * The L1 limit doubles as the whole core's memory-level parallelism, since a
 * miss cannot be in flight without holding an L1 slot. F3 replaces this with
 * true per-level MSHRs and a real prefetcher.
 */
const IN_FLIGHT_BUDGET = 192;

/** Deeper per-level limits, so L1 — and therefore the core — is what binds. */
const L2_IN_FLIGHT = 256;
const L3_IN_FLIGHT = 320;

const CLOCK_HZ = 4e9;
const CYCLES_PER_ISSUE = 1;

export const BASELINE_CPU: CpuSpec = {
  clockHz: CLOCK_HZ,
  cores: 1,
  id: 'cpu',
  role: 'work',
  serviceTimeNs: CYCLES_PER_ISSUE / (CLOCK_HZ / 1e9),
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

export interface RigPreset {
  readonly id: string;
  readonly title: string;
  readonly year: number;
  readonly memory: MemorySpec;
  readonly motherboard: MotherboardSpec;
  readonly config: HardwareConfig;
}

function rig(
  id: string,
  title: string,
  year: number,
  memory: MemorySpec,
  motherboard: MotherboardSpec,
): RigPreset {
  return {
    config: { caches: CACHE_HIERARCHY, cpu: BASELINE_CPU, memory, motherboard },
    id,
    memory,
    motherboard,
    title,
    year,
  };
}

/**
 * Three rigs identical except for memory: the comparison the sandbox exists to
 * make. Each board accepts only its own generation, as a real one would.
 */
export const RIG_PRESETS: readonly RigPreset[] = [
  rig(
    'rig-2012',
    '2012 rig',
    2012,
    memorySpec('ddr3', 1600, 9, { capacityBytes: 16 * GIB }),
    { allowedGenerations: ['ddr3'], dimmSlots: 4, id: 'mb-ddr3', maxChannels: 2, maxMtPerSecond: 1600 },
  ),
  rig(
    'rig-2019',
    '2019 rig',
    2019,
    memorySpec('ddr4', 3200, 16),
    { allowedGenerations: ['ddr4'], dimmSlots: 4, id: 'mb-ddr4', maxChannels: 2, maxMtPerSecond: 3200 },
  ),
  rig(
    'rig-2024',
    '2024 rig',
    2024,
    memorySpec('ddr5', 5600, 36),
    { allowedGenerations: ['ddr5'], dimmSlots: 4, id: 'mb-ddr5', maxChannels: 4, maxMtPerSecond: 6000 },
  ),
];

export function findPreset(id: string): RigPreset | undefined {
  return RIG_PRESETS.find(preset => preset.id === id);
}
