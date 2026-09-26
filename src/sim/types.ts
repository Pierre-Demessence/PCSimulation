/**
 * Hardware resource roles. Every part of the machine is one of these; a part
 * that spans several dimensions declares the role it saturates on.
 */
export type ResourceRole = 'budget' | 'delay' | 'pipe' | 'tank' | 'work';

export type MemoryGeneration = 'ddr3' | 'ddr4' | 'ddr5';

/** Levels that participate in the access path, plus the issuing core. */
export type LevelId = 'l1' | 'l2' | 'l3' | 'memory' | 'cpu';

export interface CacheSpec {
  readonly id: string;
  readonly role: 'tank';
  readonly capacityBytes: number;
  readonly ways: number;
  /** Lookup latency added to the request's critical path. */
  readonly hitTimeNs: number;
  /** Data rate the level can serve, which is what its utilisation measures. */
  readonly bytesPerNs: number;
  readonly maxOutstandingMisses: number;
}

/**
 * A DIMM as seen by the core. `casLatency` and `mtPerSecond` feed the
 * arithmetic in `memory.ts`; `accessOverheadNs` is the controller, PHY and
 * row-activation cost every generation pays.
 */
export interface MemorySpec {
  readonly id: string;
  readonly role: 'pipe';
  readonly generation: MemoryGeneration;
  readonly mtPerSecond: number;
  readonly casLatency: number;
  readonly channels: number;
  readonly capacityBytes: number;
  readonly accessOverheadNs: number;
  readonly maxOutstandingMisses: number;
}

export interface CpuSpec {
  readonly id: string;
  readonly role: 'work';
  readonly clockHz: number;
  readonly cores: number;
  readonly serviceTimeNs: number;
}

export interface MotherboardSpec {
  readonly id: string;
  readonly allowedGenerations: readonly MemoryGeneration[];
  readonly dimmSlots: number;
  readonly maxChannels: number;
  readonly maxMtPerSecond: number;
}

export interface CacheHierarchy {
  readonly l1: CacheSpec;
  readonly l2: CacheSpec;
  readonly l3: CacheSpec;
}

export interface HardwareConfig {
  readonly cpu: CpuSpec;
  readonly caches: CacheHierarchy;
  readonly memory: MemorySpec;
  readonly motherboard: MotherboardSpec;
}

export interface ResourceStats {
  readonly id: LevelId;
  readonly role: ResourceRole;
  readonly busyNs: number;
  readonly utilisation: number;
  readonly accesses: number;
  readonly hits: number;
}

export interface OutstandingStats {
  readonly mean: number;
  readonly max: number;
}

export type BottleneckClass = 'latency-bound' | 'resource-bound';

export interface SimResult {
  readonly elapsedNs: number;
  readonly accesses: number;
  readonly movedBytes: number;
  readonly meanLatencyNs: number;
  readonly minLatencyNs: number;
  readonly maxLatencyNs: number;
  readonly cpuStallNs: number;
  readonly achievedBandwidthBytesPerNs: number;
  readonly hitRates: Readonly<Record<'l1' | 'l2' | 'l3', number>>;
  readonly outstanding: Readonly<Record<'l1' | 'l2' | 'l3' | 'memory', OutstandingStats>>;
  readonly resources: readonly ResourceStats[];
  readonly classification: BottleneckClass;
  readonly bottleneckId: LevelId | null;
}
