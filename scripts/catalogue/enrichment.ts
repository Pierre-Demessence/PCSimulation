import type { StorageInterface } from '@/data';
import type { FormFactor, MemoryGeneration, PowerConnector, Socket } from '@/sim';

/**
 * The hand-authored half of the catalogue. The docyx dataset is a listing
 * dataset: it carries identity and the display specs but almost none of the
 * compatibility fields the rules read. So each curated part names a real dataset
 * row and supplies the fields the dataset lacks, verifiable against the real
 * product. See PROVENANCE.md.
 */

/**
 * The one lookup that pays for itself: a CPU's `microarchitecture` is in the
 * dataset, and it fixes the socket and the memory generations for every CPU of
 * that generation, so this table enriches every curated CPU at once.
 */
export interface MicroarchInfo {
  readonly socket: Socket;
  readonly memoryGenerations: readonly MemoryGeneration[];
}

export const MICROARCH: Record<string, MicroarchInfo> = {
  'Alder Lake': { memoryGenerations: ['ddr4', 'ddr5'], socket: 'lga1700' },
  'Arrow Lake': { memoryGenerations: ['ddr5'], socket: 'lga1851' },
  'Comet Lake': { memoryGenerations: ['ddr4'], socket: 'lga1200' },
  'Raptor Lake': { memoryGenerations: ['ddr4', 'ddr5'], socket: 'lga1700' },
  'Raptor Lake Refresh': { memoryGenerations: ['ddr4', 'ddr5'], socket: 'lga1700' },
  'Rocket Lake': { memoryGenerations: ['ddr4'], socket: 'lga1200' },
  'Zen 3': { memoryGenerations: ['ddr4'], socket: 'am4' },
  'Zen 4': { memoryGenerations: ['ddr5'], socket: 'am5' },
  'Zen 5': { memoryGenerations: ['ddr5'], socket: 'am5' },
};

/** The CPUs to curate, by exact dataset `name`. Socket and memory come from MICROARCH. */
export const CPU_NAMES: readonly string[] = [
  'AMD Ryzen 5 5600',
  'AMD Ryzen 7 5800X3D',
  'AMD Ryzen 5 7600',
  'AMD Ryzen 7 7800X3D',
  'Intel Core i5-10400F',
  'Intel Core i5-12400F',
  'Intel Core i5-13600K',
  'Intel Core i7-14700K',
  'Intel Core Ultra 5 245K',
];

/** The board electrical fields the dataset lacks, hand-set per curated board. */
export interface BoardEnrich {
  readonly allowedGenerations: readonly MemoryGeneration[];
  readonly maxMtPerSecond: number;
  readonly pcieVersion: 3 | 4 | 5;
  readonly pcieLanes: number;
  readonly m2Slots: number;
  readonly sataPorts: number;
  readonly powerConnectors: readonly PowerConnector[];
}

const STANDARD_BOARD_POWER: readonly PowerConnector[] = ['atx-24', 'eps-8'];

export const BOARDS: Record<string, BoardEnrich> = {
  'ASRock B460 Steel Legend': {
    allowedGenerations: ['ddr4'],
    m2Slots: 2,
    maxMtPerSecond: 2933,
    pcieLanes: 20,
    pcieVersion: 3,
    powerConnectors: STANDARD_BOARD_POWER,
    sataPorts: 6,
  },
  'ASRock B860 Pro RS': {
    allowedGenerations: ['ddr5'],
    m2Slots: 2,
    maxMtPerSecond: 6400,
    pcieLanes: 20,
    pcieVersion: 5,
    powerConnectors: STANDARD_BOARD_POWER,
    sataPorts: 4,
  },
  'ASRock B550M Steel Legend': {
    allowedGenerations: ['ddr4'],
    m2Slots: 2,
    maxMtPerSecond: 4400,
    pcieLanes: 20,
    pcieVersion: 4,
    powerConnectors: STANDARD_BOARD_POWER,
    sataPorts: 4,
  },
  'ASRock B550M-ITX/ac': {
    allowedGenerations: ['ddr4'],
    m2Slots: 1,
    maxMtPerSecond: 4400,
    pcieLanes: 20,
    pcieVersion: 4,
    powerConnectors: STANDARD_BOARD_POWER,
    sataPorts: 4,
  },
  'Asus PRIME B650-PLUS WIFI': {
    allowedGenerations: ['ddr5'],
    m2Slots: 2,
    maxMtPerSecond: 6400,
    pcieLanes: 20,
    pcieVersion: 4,
    powerConnectors: STANDARD_BOARD_POWER,
    sataPorts: 4,
  },
  'Asus PRIME B660-PLUS D4': {
    allowedGenerations: ['ddr4'],
    m2Slots: 2,
    maxMtPerSecond: 3200,
    pcieLanes: 20,
    pcieVersion: 4,
    powerConnectors: STANDARD_BOARD_POWER,
    sataPorts: 4,
  },
  'Gigabyte B760 GAMING X AX': {
    allowedGenerations: ['ddr5'],
    m2Slots: 2,
    maxMtPerSecond: 6000,
    pcieLanes: 20,
    pcieVersion: 4,
    powerConnectors: STANDARD_BOARD_POWER,
    sataPorts: 4,
  },
  'MSI MAG B550 TOMAHAWK': {
    allowedGenerations: ['ddr4'],
    m2Slots: 2,
    maxMtPerSecond: 4400,
    pcieLanes: 20,
    pcieVersion: 4,
    powerConnectors: STANDARD_BOARD_POWER,
    sataPorts: 6,
  },
};

/** The memory kits to curate, by exact dataset `name`. All fields map directly. */
export const MEMORY_NAMES: readonly string[] = [
  'Corsair Vengeance LPX 16 GB',
  'G.Skill Flare X5 32 GB',
  'G.Skill Trident Z5 RGB 32 GB',
];

/** The GPU fields the dataset lacks, hand-set per curated chipset. */
export interface GpuEnrich {
  readonly boardPowerWatts: number;
  readonly powerConnectors: readonly PowerConnector[];
  readonly pcieVersion: 3 | 4 | 5;
  readonly pcieLanes: number;
}

/** Curated GPUs, selected by dataset `chipset` (names collide across brands). */
export const GPUS: Record<string, GpuEnrich> = {
  'GeForce RTX 3060 Ti': { boardPowerWatts: 200, pcieLanes: 16, pcieVersion: 4, powerConnectors: ['pcie-8'] },
  'GeForce RTX 4060': { boardPowerWatts: 115, pcieLanes: 16, pcieVersion: 4, powerConnectors: ['pcie-8'] },
  'GeForce RTX 4070': { boardPowerWatts: 200, pcieLanes: 16, pcieVersion: 4, powerConnectors: ['pcie-8'] },
  'GeForce RTX 4090': { boardPowerWatts: 450, pcieLanes: 16, pcieVersion: 4, powerConnectors: ['12vhpwr'] },
  'Radeon RX 7800 XT': { boardPowerWatts: 263, pcieLanes: 16, pcieVersion: 4, powerConnectors: ['pcie-8', 'pcie-8'] },
};

/** The supply's connector inventory is absent from the dataset; hand-set per name. */
export const PSUS: Record<string, readonly PowerConnector[]> = {
  'Corsair CX650M (2021)': ['atx-24', 'eps-8', 'pcie-8', 'pcie-8'],
  'Corsair RM750e (2023)': ['atx-24', 'eps-8', 'pcie-8', 'pcie-8', '12vhpwr'],
  'Corsair RM850e (2023)': ['atx-24', 'eps-8', 'pcie-8', 'pcie-8', '12vhpwr'],
  'EVGA SuperNOVA 650 GA': ['atx-24', 'eps-8', 'pcie-8', 'pcie-8', 'pcie-8'],
  'MSI MAG A750GL PCIE5': ['atx-24', 'eps-8', 'pcie-8', 'pcie-8', '12vhpwr'],
};

/** The drives to curate, by exact dataset `name`. Interface and lanes parse from the source. */
export const STORAGE_NAMES: readonly string[] = [
  'Samsung 990 Pro',
  'Western Digital Black SN770',
  'Crucial P3 Plus',
  'Samsung 870 Evo',
  'Crucial MX500',
];

/** The cooler compatibility fields (all absent from the dataset), hand-set per name. */
export interface CoolerEnrich {
  readonly supportedSockets: readonly Socket[];
  readonly tdpRatingWatts: number;
  readonly heightMm: number;
}

const MODERN_SOCKETS: readonly Socket[] = ['am4', 'am5', 'lga1200', 'lga1700', 'lga1851'];

export const COOLERS: Record<string, CoolerEnrich> = {
  'ARCTIC Liquid Freezer II 240': { heightMm: 50, supportedSockets: MODERN_SOCKETS, tdpRatingWatts: 300 },
  'Cooler Master Hyper 212 Black Edition': { heightMm: 159, supportedSockets: MODERN_SOCKETS, tdpRatingWatts: 150 },
  'Deepcool AK400': { heightMm: 155, supportedSockets: MODERN_SOCKETS, tdpRatingWatts: 220 },
  'Noctua NH-D15 chromax.black': { heightMm: 165, supportedSockets: MODERN_SOCKETS, tdpRatingWatts: 250 },
  'Thermalright Peerless Assassin 120 SE': { heightMm: 155, supportedSockets: MODERN_SOCKETS, tdpRatingWatts: 220 },
};

/** The case clearances (absent from the dataset), hand-set per name. `eatx` widens the inferred set. */
export interface CaseEnrich {
  readonly maxGpuLengthMm: number;
  readonly maxCoolerHeightMm: number;
  readonly eatx?: boolean;
}

export const CASES: Record<string, CaseEnrich> = {
  'Cooler Master MasterBox Q300L': { maxCoolerHeightMm: 159, maxGpuLengthMm: 360 },
  'Corsair 4000D Airflow': { maxCoolerHeightMm: 170, maxGpuLengthMm: 360 },
  'Fractal Design North': { maxCoolerHeightMm: 170, maxGpuLengthMm: 355 },
  'Fractal Design Terra': { maxCoolerHeightMm: 77, maxGpuLengthMm: 322 },
  'Lian Li O11 Dynamic EVO': { eatx: true, maxCoolerHeightMm: 167, maxGpuLengthMm: 420 },
};

/** A URL-safe id from a product name: `AMD Ryzen 5 5600` -> `amd-ryzen-5-5600`. */
export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const DATASET_SOCKETS: Record<string, Socket> = {
  AM4: 'am4',
  AM5: 'am5',
  LGA1200: 'lga1200',
  LGA1700: 'lga1700',
  LGA1851: 'lga1851',
};

export function socketFromDataset(socket: string): Socket {
  const mapped = DATASET_SOCKETS[socket.toUpperCase()];
  if (mapped === undefined)
    throw new Error(`unknown socket "${socket}"`);
  return mapped;
}

export function boardFormFactor(formFactor: string): FormFactor {
  const value = formFactor.toLowerCase().replace(/[^a-z]/g, '');
  if (value.includes('miniitx') || value === 'itx')
    return 'itx';
  if (value.includes('microatx') || value.includes('matx'))
    return 'matx';
  if (value.includes('eatx') || value.includes('extendedatx'))
    return 'eatx';
  return 'atx';
}

/** A case fits its own size and every smaller board; `eatx` extends the top. */
export function caseFormFactors(type: string, eatx: boolean): readonly FormFactor[] {
  const value = type.toLowerCase();
  if (value.startsWith('mini itx'))
    return ['itx'];
  if (value.startsWith('microatx') || value.startsWith('micro atx'))
    return ['matx', 'itx'];
  return eatx ? ['eatx', 'atx', 'matx', 'itx'] : ['atx', 'matx', 'itx'];
}

/** `M.2 PCIe 4.0 X4` -> NVMe on 4 lanes; `SATA 6.0 Gb/s` -> SATA on none. */
export function parseStorage(interfaceStr: string): { interface: StorageInterface; pcieLanes: number } {
  if (/sata/i.test(interfaceStr))
    return { interface: 'sata', pcieLanes: 0 };
  const lanes = interfaceStr.match(/x\s*(\d+)/i);
  return { interface: 'nvme', pcieLanes: lanes === null ? 4 : Number(lanes[1]) };
}
