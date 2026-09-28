import type { Build } from '@/data';

import type {
  HardwareConfig,
  MemoryGeneration,
  MemorySpec,
  MotherboardSpec,
} from '@/sim';
import { BASELINE_CPU, CACHE_HIERARCHY, GIB, memorySpec } from '@/data';

/**
 * A complete machine the tests can simulate, written out part by part.
 *
 * It lives beside the tests rather than in `src/data/`, because the product
 * ships no pre-assembled machine: a build is assembled part by part, and a
 * fixture is a test's own business.
 */
export const DDR3_MEMORY = memorySpec('ddr3', 1600, 9, { capacityBytes: 16 * GIB });
export const DDR4_MEMORY = memorySpec('ddr4', 3200, 16);
export const DDR5_MEMORY = memorySpec('ddr5', 5600, 36);

export const DDR3_BOARD: MotherboardSpec = {
  allowedGenerations: ['ddr3'],
  dimmSlots: 4,
  id: 'mb-ddr3',
  maxChannels: 2,
  maxMtPerSecond: 1600,
  socket: 'lga1700',
};

export const DDR4_BOARD: MotherboardSpec = {
  allowedGenerations: ['ddr4'],
  dimmSlots: 4,
  id: 'mb-ddr4',
  maxChannels: 2,
  maxMtPerSecond: 3200,
  socket: 'lga1700',
};

export const DDR5_BOARD: MotherboardSpec = {
  allowedGenerations: ['ddr5'],
  dimmSlots: 4,
  id: 'mb-ddr5',
  maxChannels: 4,
  maxMtPerSecond: 6000,
  socket: 'lga1700',
};

/** The three generation-matched pairs the memory comparisons are made of. */
export const GENERATION_PAIRS: readonly {
  readonly board: MotherboardSpec;
  readonly generation: MemoryGeneration;
  readonly memory: MemorySpec;
}[] = [
  { board: DDR3_BOARD, generation: 'ddr3', memory: DDR3_MEMORY },
  { board: DDR4_BOARD, generation: 'ddr4', memory: DDR4_MEMORY },
  { board: DDR5_BOARD, generation: 'ddr5', memory: DDR5_MEMORY },
];

export function testConfig(overrides: Partial<HardwareConfig> = {}): HardwareConfig {
  return {
    caches: CACHE_HIERARCHY,
    cpu: BASELINE_CPU,
    memory: DDR4_MEMORY,
    motherboard: DDR4_BOARD,
    ...overrides,
  };
}

export function testBuild(overrides: Partial<HardwareConfig> = {}): Build {
  const config = testConfig(overrides);
  return {
    cpu: { caches: config.caches, cpu: config.cpu },
    memory: config.memory,
    motherboard: config.motherboard,
  };
}
