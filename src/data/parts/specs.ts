import type { HardwareConfig, PcieVersion, PowerConnector } from '@/sim';

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

/**
 * The compatibility view of a build: the memory-path config fields plus the
 * sim-less parts. The rules walk this, so a GPU or PSU rule reads its part even
 * though it belongs to no position of `HardwareConfig`.
 */
export interface CompatParts extends Partial<HardwareConfig> {
  readonly gpu?: GpuSpec;
  readonly psu?: PsuSpec;
}
