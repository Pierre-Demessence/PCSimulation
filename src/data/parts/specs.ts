import type { FormFactor, HardwareConfig, PcieVersion, PowerConnector, Socket } from '@/sim';

/** How a drive attaches. Compatibility-only. */
export type StorageInterface = 'nvme' | 'sata';

/**
 * A graphics card. Compatibility-only: the simulation never reads it, so every
 * field is checked by a rule or shown as a fact.
 */
export interface GpuSpec {
  readonly id: string;
  readonly identity: string;
  readonly pcieVersion: PcieVersion;
  readonly pcieLanes: number;
  readonly lengthMm: number;
  readonly powerConnectors: readonly PowerConnector[];
  readonly boardPowerWatts: number;
}

/** A power supply. Compatibility-only. */
export interface PsuSpec {
  readonly id: string;
  readonly identity: string;
  readonly wattage: number;
  readonly connectors: readonly PowerConnector[];
}

/** A drive. Compatibility-only. An NVMe drive occupies PCIe lanes; a SATA drive does not. */
export interface StorageSpec {
  readonly id: string;
  readonly identity: string;
  readonly interface: StorageInterface;
  readonly pcieLanes: number;
  readonly capacityBytes: number;
}

/** A CPU cooler. Compatibility-only. */
export interface CoolerSpec {
  readonly id: string;
  readonly identity: string;
  readonly supportedSockets: readonly Socket[];
  readonly tdpRatingWatts: number;
  readonly heightMm: number;
}

/** A case. Compatibility-only: it bounds the board size and the parts it holds. */
export interface CaseSpec {
  readonly id: string;
  readonly identity: string;
  readonly formFactors: readonly FormFactor[];
  readonly maxGpuLengthMm: number;
  readonly maxCoolerHeightMm: number;
}

/**
 * The compatibility view of a build: the memory-path config fields plus the
 * sim-less parts. The rules walk this, so a GPU or PSU rule reads its part even
 * though it belongs to no position of `HardwareConfig`.
 */
export interface CompatParts extends Partial<HardwareConfig> {
  readonly gpu?: GpuSpec;
  readonly psu?: PsuSpec;
  readonly storage?: readonly StorageSpec[];
  readonly cooler?: CoolerSpec;
  readonly case?: CaseSpec;
}
