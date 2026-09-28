/**
 * Hardware resource roles. Every part of the machine is one of these; a part
 * that spans several dimensions declares the role it saturates on.
 */
export type ResourceRole = 'budget' | 'delay' | 'pipe' | 'tank' | 'work';

export type MemoryGeneration = 'ddr3' | 'ddr4' | 'ddr5';

/** CPU and motherboard socket. Compatibility-only: the simulation never reads it. */
export type Socket = 'am4' | 'am5' | 'lga1200' | 'lga1700' | 'lga1851';

/** PCIe generation. Compatibility-only. */
export type PcieVersion = 3 | 4 | 5;

/** A power lead a part needs or a supply provides. Compatibility-only. */
export type PowerConnector = '12vhpwr' | 'atx-24' | 'eps-8' | 'pcie-6' | 'pcie-8';

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
  /** Compatibility-only: checked against the motherboard, ignored by the core. */
  readonly socket: Socket;
  /** Compatibility-only: the generations the controller accepts. */
  readonly memoryGenerations: readonly MemoryGeneration[];
  /** Compatibility-only: rated power, for the supply and cooler budgets. */
  readonly tdpWatts: number;
  /** Compatibility-only: whether the CPU can drive a display without a GPU. */
  readonly integratedGraphics: boolean;
  readonly clockHz: number;
  readonly cores: number;
  readonly serviceTimeNs: number;
}

export interface MotherboardSpec {
  readonly id: string;
  /** Compatibility-only: checked against the CPU, ignored by the core. */
  readonly socket: Socket;
  readonly allowedGenerations: readonly MemoryGeneration[];
  readonly dimmSlots: number;
  readonly maxChannels: number;
  readonly maxMtPerSecond: number;
  /** Compatibility-only: the slot generation and lane budget for a graphics card. */
  readonly pcieVersion: PcieVersion;
  readonly pcieLanes: number;
  /** Compatibility-only: the leads the supply must provide for the board. */
  readonly powerConnectors: readonly PowerConnector[];
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

/**
 * What one request was doing, over a span of simulated time.
 *
 * - `level` — resident at a cache level: probing, then holding a miss slot while
 *   the line is fetched. One span covers the whole residency, so counting the
 *   spans that contain an instant gives a true "in flight" figure.
 * - `transfer` — the memory channel: queued behind another transfer, or moving.
 * - `dram` — waiting for the DRAM itself, with the bus idle.
 * - `fill` — the line travelling back up into the cache.
 */
export interface SimSpan {
  readonly requestIndex: number;
  readonly level: LevelId;
  readonly kind: 'dram' | 'fill' | 'level' | 'transfer';
  readonly startNs: number;
  readonly endNs: number;
}

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
  /** Activity for the first `traceRequests` accesses, or empty when untraced. */
  readonly spans: readonly SimSpan[];
}
