import type { Build } from './build';
import type { CoolerSpec, GpuSpec, PsuSpec, StorageInterface, StorageSpec } from './parts/specs';
import type {
  CacheHierarchy,
  CacheSpec,
  CpuSpec,
  LevelId,
  MemoryGeneration,
  MemorySpec,
  MotherboardSpec,
  PcieVersion,
  PowerConnector,
  Socket,
} from '@/sim';

import { DEFAULT_LINE_BYTES } from '@/sim';
import { BASELINE_CPU, CACHE_HIERARCHY, CYCLES_PER_ISSUE, memorySpec } from './presets';

/**
 * What the user picks and swaps. A part owns one or more slots; the CPU owns its
 * three cache levels, because that is where they are.
 */
export type PartId = 'cooler' | 'cpu' | 'gpu' | 'memory' | 'motherboard' | 'psu' | 'storage';

/** What the model consumes: one entry per position of `HardwareConfig`. */
export type SlotId = LevelId | 'motherboard';

/** How a characteristic is edited, which is what fixes its value type. */
export type ParameterControl = 'choice' | 'count' | 'flags' | 'range';

/**
 * `simulated` — the core reads the field, and it moves the numbers.
 * `validated` — the core ignores it, but a rule reads it, so it can warn.
 * `display-only` — nothing reads it; it is recorded so the part is complete.
 */
export type ParameterEffect = 'display-only' | 'simulated' | 'validated';

export type ParameterUnit
  = | 'bytes'
    | 'bytes-per-ns'
    | 'count'
    | 'cycles'
    | 'hz'
    | 'mm'
    | 'mt-per-s'
    | 'ns'
    | 'per-ns'
    | 'watts';

export type ParameterValue = number | string | readonly string[];

interface ParameterBase<Part, Value> {
  readonly id: string;
  readonly label: string;
  readonly help: string;
  /** The group this characteristic belongs to; it is how the part's list groups. */
  readonly group: string;
  readonly effect: ParameterEffect;
  readonly get: (part: Part) => Value;
  /** Pure. Changes exactly this one characteristic (and anything derived from it). */
  readonly with: (part: Part, value: Value) => Part;
  /** What the number *is*; absent on a non-numeric control. */
  readonly unit?: ParameterUnit;
}

export interface RangeParameter<Part> extends ParameterBase<Part, number> {
  readonly control: 'range' | 'count';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** A wide scale (ns against µs) stays draggable only on a log track. */
  readonly scale?: 'linear' | 'log';
}

export interface ChoiceParameter<Part> extends ParameterBase<Part, string> {
  readonly control: 'choice';
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export interface FlagsParameter<Part, Value extends readonly string[] = readonly string[]>
  extends ParameterBase<Part, Value> {
  readonly control: 'flags';
  readonly options: readonly { readonly value: Value[number]; readonly label: string }[];
}

export type Parameter<Part>
  = | RangeParameter<Part>
    | ChoiceParameter<Part>
    | FlagsParameter<Part>;

/** The part values, each a slice of `HardwareConfig`. */
export interface CpuPart {
  readonly cpu: CpuSpec;
  readonly caches: CacheHierarchy;
}

export interface PartDefinition<Part> {
  readonly id: PartId;
  readonly label: string;
  /** Every slot a template swap replaces. */
  readonly slots: readonly SlotId[];
  readonly parameters: readonly Parameter<Part>[];
  /**
   * The part's own starting values, for "enter your own". One part, never a
   * machine, and it lives here because a spec's `id`, `role` and derived fields
   * are not descriptors and cannot be built from them.
   */
  readonly blank: Part;
  /** Null when any slot this part owns is missing, which is what `hasPart` is. */
  readonly read: (build: Build) => Part | null;
  readonly write: (build: Build, part: Part) => Build;
}

export interface ParameterApplication {
  readonly build: Build;
  /** Non-null when the change was refused; `build` is then the input, unchanged. */
  readonly refused: string | null;
}

const GIB_BYTES = 1024 ** 3;
const CACHE_LEVELS = ['l1', 'l2', 'l3'] as const;
type CacheLevel = (typeof CACHE_LEVELS)[number];

/**
 * Capacity ceilings per level. One ceiling for all three would make a 4 GiB L1
 * expressible, which is both silly and expensive to model: the engine allocates
 * one tag list per set, so capacity ÷ (ways × line) is a real allocation.
 */
const CACHE_CAPACITY_MAX: Record<CacheLevel, number> = {
  l1: 256 * 1024,
  l2: 8 * 1024 * 1024,
  l3: 64 * 1024 * 1024,
};

/**
 * Ceiling on the sets one level may have. `SetAssociativeCache` allocates one
 * tag list per set (`src/sim/cache.ts@31`), so a set count is a real allocation
 * and not merely a number. The worst combination the descriptors allow — the L3
 * ceiling at one way — would be over a million empty lists, so the pair is
 * refused rather than simulated.
 */
const MAX_SETS = 262_144;

const MEMORY_GENERATIONS: readonly string[] = ['ddr3', 'ddr4', 'ddr5'];

const SOCKETS: readonly Socket[] = ['am4', 'am5', 'lga1200', 'lga1700', 'lga1851'];
const SOCKET_LABELS: Record<Socket, string> = {
  am4: 'AMD AM4',
  am5: 'AMD AM5',
  lga1200: 'Intel LGA1200',
  lga1700: 'Intel LGA1700',
  lga1851: 'Intel LGA1851',
};

const POWER_CONNECTORS: readonly PowerConnector[] = ['atx-24', 'eps-8', 'pcie-6', 'pcie-8', '12vhpwr'];
const POWER_CONNECTOR_LABELS: Record<PowerConnector, string> = {
  '12vhpwr': '12VHPWR',
  'atx-24': '24-pin ATX',
  'eps-8': '8-pin EPS',
  'pcie-6': '6-pin PCIe',
  'pcie-8': '8-pin PCIe',
};

/**
 * Steps finer than this are not used, so rounding at this width removes the
 * binary floating-point noise a step like 0.05 would otherwise leave behind
 * (0.15000000000000002) without inventing precision.
 */
const STEP_DECIMALS = 6;

/**
 * These three helpers exist to give each descriptor an exact contextual type.
 * The lists they fill are typed as the `Parameter<Part>` union, and a union of
 * function-typed shapes does not contextually type a bare object literal.
 */
function numeric<Part>(parameter: RangeParameter<Part>): RangeParameter<Part> {
  return parameter;
}

function choice<Part>(parameter: ChoiceParameter<Part>): ChoiceParameter<Part> {
  return parameter;
}

function flags<Part, Value extends readonly string[] = readonly string[]>(
  parameter: FlagsParameter<Part, Value>,
): FlagsParameter<Part, Value> {
  return parameter;
}

function isMemoryGeneration(value: string): value is MemoryGeneration {
  return MEMORY_GENERATIONS.includes(value);
}

function isSocket(value: string): value is Socket {
  return (SOCKETS as readonly string[]).includes(value);
}

function isPowerConnector(value: string): value is PowerConnector {
  return (POWER_CONNECTORS as readonly string[]).includes(value);
}

const STORAGE_INTERFACES: readonly { readonly value: StorageInterface; readonly label: string }[] = [
  { label: 'NVMe (M.2)', value: 'nvme' },
  { label: 'SATA', value: 'sata' },
];

function isStorageInterface(value: string): value is StorageInterface {
  return value === 'nvme' || value === 'sata';
}

function cacheLevelOf(slot: string): CacheLevel | null {
  if (slot === 'l1' || slot === 'l2' || slot === 'l3')
    return slot;
  return null;
}

function replaceCache(caches: CacheHierarchy, level: CacheLevel, spec: CacheSpec): CacheHierarchy {
  if (level === 'l1')
    return { ...caches, l1: spec };
  if (level === 'l2')
    return { ...caches, l2: spec };
  return { ...caches, l3: spec };
}

/** Cache characteristics are the same five per level, so they are built once. */
function cacheParameters(level: CacheLevel): readonly Parameter<CpuPart>[] {
  const name = level.toUpperCase();
  const specOf = (part: CpuPart): CacheSpec => part.caches[level];
  const withSpec = (part: CpuPart, spec: CacheSpec): CpuPart => ({
    ...part,
    caches: replaceCache(part.caches, level, spec),
  });

  return [
    numeric<CpuPart>({
      control: 'range',
      effect: 'simulated',
      get: part => specOf(part).capacityBytes,
      group: level,
      help: `${name} capacity. A set is capacity ÷ (ways × ${DEFAULT_LINE_BYTES}-byte lines), so this is the working set the level has to hold.`,
      id: `${level}CapacityBytes`,
      label: `${name} capacity`,
      max: CACHE_CAPACITY_MAX[level],
      min: 1024,
      step: 1024,
      unit: 'bytes',
      with: (part, value) => withSpec(part, { ...specOf(part), capacityBytes: value }),
    }),
    numeric<CpuPart>({
      control: 'count',
      effect: 'simulated',
      get: part => specOf(part).ways,
      group: level,
      help: `${name} associativity: how many lines one set holds before the least recently used is evicted.`,
      id: `${level}Ways`,
      label: `${name} ways`,
      max: 32,
      min: 1,
      step: 1,
      unit: 'count',
      with: (part, value) => withSpec(part, { ...specOf(part), ways: value }),
    }),
    numeric<CpuPart>({
      control: 'range',
      effect: 'simulated',
      get: part => specOf(part).hitTimeNs,
      group: level,
      help: `How long a ${name} lookup takes when the line is present. Every access that reaches this level pays it.`,
      id: `${level}HitTimeNs`,
      label: `${name} hit time`,
      max: 100,
      min: 0.25,
      step: 0.25,
      unit: 'ns',
      with: (part, value) => withSpec(part, { ...specOf(part), hitTimeNs: value }),
    }),
    numeric<CpuPart>({
      control: 'range',
      effect: 'simulated',
      get: part => specOf(part).bytesPerNs,
      group: level,
      help: `The rate ${name} can serve data at, which is what its utilisation is measured against.`,
      id: `${level}BytesPerNs`,
      label: `${name} data rate`,
      max: 2048,
      min: 1,
      step: 1,
      unit: 'bytes-per-ns',
      with: (part, value) => withSpec(part, { ...specOf(part), bytesPerNs: value }),
    }),
    numeric<CpuPart>({
      control: 'count',
      effect: 'simulated',
      get: part => specOf(part).maxOutstandingMisses,
      group: level,
      help:
        level === 'l1'
          ? `How many misses ${name} can keep in flight. For L1 this is also the whole core's memory-level parallelism, because a miss cannot be in flight without holding an L1 slot.`
          : `How many misses ${name} can keep in flight.`,
      id: `${level}MaxOutstandingMisses`,
      label: `${name} misses in flight`,
      max: 1024,
      min: 1,
      step: 1,
      unit: 'count',
      with: (part, value) => withSpec(part, { ...specOf(part), maxOutstandingMisses: value }),
    }),
  ];
}

const cpuPart: PartDefinition<CpuPart> = {
  // The baseline core is what "enter your own" starts from: one part, bringing
  // the model's own three cache levels with it.
  blank: { caches: CACHE_HIERARCHY, cpu: BASELINE_CPU },
  id: 'cpu',
  label: 'CPU',
  parameters: [
    numeric<CpuPart>({
      control: 'range',
      effect: 'simulated',
      get: part => part.cpu.clockHz,
      group: 'cpu',
      help: 'Issue rate of the core. The engine reads the issue time this derives, so a faster clock finishes the same stream sooner.',
      id: 'clockHz',
      label: 'Clock',
      max: 6e9,
      min: 1e9,
      step: 1e8,
      unit: 'hz',
      with: (part, value) => ({
        ...part,
        cpu: { ...part.cpu, clockHz: value, serviceTimeNs: CYCLES_PER_ISSUE / (value / 1e9) },
      }),
    }),
    numeric<CpuPart>({
      control: 'count',
      effect: 'display-only',
      get: part => part.cpu.cores,
      group: 'cpu',
      help: 'How many cores the part advertises. Nothing in this model reads it yet, so it changes no result — it is recorded so the part is complete.',
      id: 'cores',
      label: 'Cores',
      max: 64,
      min: 1,
      step: 1,
      unit: 'count',
      with: (part, value) => ({ ...part, cpu: { ...part.cpu, cores: value } }),
    }),
    choice<CpuPart>({
      control: 'choice',
      effect: 'validated',
      get: part => part.cpu.socket,
      group: 'cpu',
      help: 'The CPU socket. A compatibility rule checks it against the motherboard; the simulation ignores it.',
      id: 'socket',
      label: 'Socket',
      options: SOCKETS.map(socket => ({ label: SOCKET_LABELS[socket], value: socket })),
      with: (part, value) => ({
        ...part,
        cpu: { ...part.cpu, socket: isSocket(value) ? value : part.cpu.socket },
      }),
    }),
    flags<CpuPart>({
      control: 'flags',
      effect: 'validated',
      get: part => part.cpu.memoryGenerations,
      group: 'cpu',
      help: 'Which memory generations the CPU controller accepts. A compatibility rule checks the DIMM against it; the simulation ignores it.',
      id: 'memoryGenerations',
      label: 'Memory support',
      options: MEMORY_GENERATIONS.map(generation => ({
        label: generation.toUpperCase(),
        value: generation,
      })),
      with: (part, value) => ({
        ...part,
        cpu: { ...part.cpu, memoryGenerations: value.filter(isMemoryGeneration) },
      }),
    }),
    numeric<CpuPart>({
      control: 'count',
      effect: 'validated',
      get: part => part.cpu.tdpWatts,
      group: 'cpu',
      help: 'Rated power draw. A compatibility rule sums it into the power budget; the simulation ignores it.',
      id: 'tdpWatts',
      label: 'TDP',
      max: 400,
      min: 1,
      step: 1,
      unit: 'watts',
      with: (part, value) => ({ ...part, cpu: { ...part.cpu, tdpWatts: value } }),
    }),
    choice<CpuPart>({
      control: 'choice',
      effect: 'validated',
      get: part => (part.cpu.integratedGraphics ? 'yes' : 'no'),
      group: 'cpu',
      help: 'Whether the CPU can drive a display on its own. A compatibility rule reads it when no graphics card is present.',
      id: 'integratedGraphics',
      label: 'Integrated graphics',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
      with: (part, value) => ({ ...part, cpu: { ...part.cpu, integratedGraphics: value === 'yes' } }),
    }),
    ...CACHE_LEVELS.flatMap(level => cacheParameters(level)),
  ],
  read: build => build.cpu,
  slots: ['cpu', 'l1', 'l2', 'l3'],
  write: (build, part) => ({ ...build, cpu: part }),
};

/** `id` is derived from the sticker numbers, so every edit rebuilds it with them. */
function withMemory(part: MemorySpec, changes: Partial<MemorySpec>): MemorySpec {
  const next = { ...part, ...changes };
  return memorySpec(next.generation, next.mtPerSecond, next.casLatency, {
    accessOverheadNs: next.accessOverheadNs,
    capacityBytes: next.capacityBytes,
    channels: next.channels,
    maxOutstandingMisses: next.maxOutstandingMisses,
  });
}

const memoryPart: PartDefinition<MemorySpec> = {
  blank: memorySpec('ddr4', 3200, 16),
  id: 'memory',
  label: 'Memory',
  parameters: [
    choice<MemorySpec>({
      control: 'choice',
      effect: 'validated',
      get: part => part.generation,
      group: 'memory',
      help: 'The memory standard. A compatibility rule reads it against the board, so it can warn — but it changes no simulated number on its own.',
      id: 'generation',
      label: 'Generation',
      options: MEMORY_GENERATIONS.map(generation => ({
        label: generation.toUpperCase(),
        value: generation,
      })),
      with: (part, value) =>
        withMemory(part, {
          generation: isMemoryGeneration(value) ? value : part.generation,
        }),
    }),
    numeric<MemorySpec>({
      control: 'range',
      effect: 'simulated',
      get: part => part.mtPerSecond,
      group: 'memory',
      help: 'The clock the standard names: transfers per second. Combined with the channel count, this is the bandwidth the link can carry.',
      id: 'mtPerSecond',
      label: 'Speed',
      max: 12_000,
      min: 200,
      step: 200,
      unit: 'mt-per-s',
      with: (part, value) => withMemory(part, { mtPerSecond: value }),
    }),
    numeric<MemorySpec>({
      control: 'range',
      effect: 'simulated',
      get: part => part.casLatency,
      group: 'memory',
      help: 'Column-address-strobe latency in memory clock cycles: the delay between asking for a line and the first beat coming back.',
      id: 'casLatency',
      label: 'CAS latency',
      max: 100,
      min: 1,
      step: 1,
      unit: 'cycles',
      with: (part, value) => withMemory(part, { casLatency: value }),
    }),
    numeric<MemorySpec>({
      control: 'count',
      effect: 'simulated',
      get: part => part.channels,
      group: 'memory',
      help: 'How many channels the controller can use at once, which is where the bandwidth of a stream comes from.',
      id: 'channels',
      label: 'Channels',
      max: 8,
      min: 1,
      step: 1,
      unit: 'count',
      with: (part, value) => withMemory(part, { channels: value }),
    }),
    numeric<MemorySpec>({
      control: 'range',
      effect: 'display-only',
      get: part => part.capacityBytes,
      group: 'memory',
      help: 'How much memory the build has. The memory model is one channel-level pipe, so nothing reads this — it changes no result.',
      id: 'capacityBytes',
      label: 'Capacity',
      max: 256 * GIB_BYTES,
      min: GIB_BYTES,
      step: GIB_BYTES,
      unit: 'bytes',
      with: (part, value) => withMemory(part, { capacityBytes: value }),
    }),
    numeric<MemorySpec>({
      control: 'range',
      effect: 'simulated',
      get: part => part.accessOverheadNs,
      group: 'memory',
      help: 'The fixed cost every access pays before the transfer: controller, PHY and row activation.',
      id: 'accessOverheadNs',
      label: 'Access overhead',
      max: 500,
      min: 1,
      step: 1,
      unit: 'ns',
      with: (part, value) => withMemory(part, { accessOverheadNs: value }),
    }),
    numeric<MemorySpec>({
      control: 'count',
      effect: 'simulated',
      get: part => part.maxOutstandingMisses,
      group: 'memory',
      help: 'How many accesses the memory link can keep in flight.',
      id: 'maxOutstandingMisses',
      label: 'Misses in flight',
      max: 1024,
      min: 1,
      step: 1,
      unit: 'count',
      with: (part, value) => withMemory(part, { maxOutstandingMisses: value }),
    }),
  ],
  read: build => build.memory,
  slots: ['memory'],
  write: (build, part) => ({ ...build, memory: part }),
};

const motherboardPart: PartDefinition<MotherboardSpec> = {
  // A blank must constrain nothing the reader did not choose, so it accepts
  // every generation and any speed the descriptors allow.
  blank: {
    allowedGenerations: ['ddr3', 'ddr4', 'ddr5'],
    dimmSlots: 4,
    id: 'mb-blank',
    maxChannels: 4,
    maxMtPerSecond: 6400,
    pcieLanes: 20,
    m2Slots: 2,
    pcieVersion: 4,
    powerConnectors: ['atx-24', 'eps-8'],
    sataPorts: 4,
    socket: 'lga1700',
  },
  id: 'motherboard',
  label: 'Motherboard',
  parameters: [
    choice<MotherboardSpec>({
      control: 'choice',
      effect: 'validated',
      get: part => part.socket,
      group: 'motherboard',
      help: 'The board socket. A compatibility rule checks it against the CPU; the simulation ignores it.',
      id: 'socket',
      label: 'Socket',
      options: SOCKETS.map(socket => ({ label: SOCKET_LABELS[socket], value: socket })),
      with: (part, value) => ({ ...part, socket: isSocket(value) ? value : part.socket }),
    }),
    numeric<MotherboardSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.dimmSlots,
      group: 'motherboard',
      help: 'How many DIMMs the board has room for. A compatibility rule reads it; the simulation itself counts channels, not modules.',
      id: 'dimmSlots',
      label: 'DIMM slots',
      max: 16,
      min: 1,
      step: 1,
      unit: 'count',
      with: (part, value) => ({ ...part, dimmSlots: value }),
    }),
    numeric<MotherboardSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.maxChannels,
      group: 'motherboard',
      help: 'The most memory channels this board can feed. A compatibility rule reads it.',
      id: 'maxChannels',
      label: 'Channels',
      max: 8,
      min: 1,
      step: 1,
      unit: 'count',
      with: (part, value) => ({ ...part, maxChannels: value }),
    }),
    numeric<MotherboardSpec>({
      control: 'range',
      effect: 'validated',
      get: part => part.maxMtPerSecond,
      group: 'motherboard',
      help: 'The fastest memory the board accepts. A compatibility rule reads it.',
      id: 'maxMtPerSecond',
      label: 'Max memory speed',
      max: 12_000,
      min: 200,
      step: 200,
      unit: 'mt-per-s',
      with: (part, value) => ({ ...part, maxMtPerSecond: value }),
    }),
    flags<MotherboardSpec>({
      control: 'flags',
      effect: 'validated',
      get: part => part.allowedGenerations,
      group: 'motherboard',
      help: 'Which memory generations the board accepts. A generation it does not accept is simulated and reported, not blocked.',
      id: 'allowedGenerations',
      label: 'Accepted memory',
      options: MEMORY_GENERATIONS.map(generation => ({
        label: generation.toUpperCase(),
        value: generation,
      })),
      with: (part, value) => ({
        ...part,
        allowedGenerations: value.filter(isMemoryGeneration),
      }),
    }),
    numeric<MotherboardSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.pcieVersion,
      group: 'motherboard',
      help: 'The PCIe generation of the graphics slot. A compatibility rule reads it against the card.',
      id: 'pcieVersion',
      label: 'PCIe version',
      max: 5,
      min: 3,
      step: 1,
      unit: 'count',
      with: (part, value) => ({ ...part, pcieVersion: value as PcieVersion }),
    }),
    numeric<MotherboardSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.pcieLanes,
      group: 'motherboard',
      help: 'The lanes the graphics slot provides. A compatibility rule reads it against the card.',
      id: 'pcieLanes',
      label: 'PCIe lanes',
      max: 32,
      min: 1,
      step: 1,
      unit: 'count',
      with: (part, value) => ({ ...part, pcieLanes: value }),
    }),
    flags<MotherboardSpec>({
      control: 'flags',
      effect: 'validated',
      get: part => part.powerConnectors,
      group: 'motherboard',
      help: 'The power leads the board needs from the supply. A compatibility rule checks the supply provides them.',
      id: 'powerConnectors',
      label: 'Power connectors',
      options: POWER_CONNECTORS.map(connector => ({ label: POWER_CONNECTOR_LABELS[connector], value: connector })),
      with: (part, value) => ({ ...part, powerConnectors: value.filter(isPowerConnector) }),
    }),
    numeric<MotherboardSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.m2Slots,
      group: 'motherboard',
      help: 'How many M.2 drives the board hosts. A compatibility rule checks an NVMe drive has a slot; each shares the graphics lanes.',
      id: 'm2Slots',
      label: 'M.2 slots',
      max: 8,
      min: 0,
      step: 1,
      unit: 'count',
      with: (part, value) => ({ ...part, m2Slots: value }),
    }),
    numeric<MotherboardSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.sataPorts,
      group: 'motherboard',
      help: 'How many SATA drives the board hosts. A compatibility rule checks a SATA drive has a port.',
      id: 'sataPorts',
      label: 'SATA ports',
      max: 12,
      min: 0,
      step: 1,
      unit: 'count',
      with: (part, value) => ({ ...part, sataPorts: value }),
    }),
  ],
  read: build => build.motherboard,
  slots: ['motherboard'],
  write: (build, part) => ({ ...build, motherboard: part }),
};

/**
 * Every part the editor knows about, so the editor and its tests share one list.
 *
 * The first of this file's two boundary casts. `get`, `with`, `read` and
 * `write` are function-typed, and under `strict` a function-typed property is
 * checked contravariantly, so a `PartDefinition<CpuPart>` is not assignable to a
 * `PartDefinition<unknown>`. Nothing downstream depends on the erasure being
 * sound: `applyParameter` only ever drives a part through its own descriptors.
 */
const gpuPart: PartDefinition<GpuSpec> = {
  blank: {
    boardPowerWatts: 200,
    id: 'gpu-blank',
    identity: 'Custom graphics card',
    lengthMm: 280,
    pcieLanes: 16,
    pcieVersion: 4,
    powerConnectors: ['pcie-8'],
  },
  id: 'gpu',
  label: 'Graphics card',
  parameters: [
    numeric<GpuSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.pcieVersion,
      group: 'gpu',
      help: 'The PCIe generation the card expects. A compatibility rule reads it against the board; PCIe is backward compatible, so a mismatch only costs bandwidth.',
      id: 'pcieVersion',
      label: 'PCIe version',
      max: 5,
      min: 3,
      step: 1,
      unit: 'count',
      with: (part, value) => ({ ...part, pcieVersion: value as PcieVersion }),
    }),
    numeric<GpuSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.pcieLanes,
      group: 'gpu',
      help: 'The lanes the card wants. A compatibility rule reads it against the board budget.',
      id: 'pcieLanes',
      label: 'PCIe lanes',
      max: 32,
      min: 1,
      step: 1,
      unit: 'count',
      with: (part, value) => ({ ...part, pcieLanes: value }),
    }),
    numeric<GpuSpec>({
      control: 'range',
      effect: 'validated',
      get: part => part.lengthMm,
      group: 'gpu',
      help: 'The card length. A future rule checks it against the case; nothing simulates it.',
      id: 'lengthMm',
      label: 'Length',
      max: 400,
      min: 100,
      step: 5,
      unit: 'mm',
      with: (part, value) => ({ ...part, lengthMm: value }),
    }),
    numeric<GpuSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.boardPowerWatts,
      group: 'gpu',
      help: 'The card power draw. A compatibility rule sums it into the power budget.',
      id: 'boardPowerWatts',
      label: 'Board power',
      max: 800,
      min: 5,
      step: 5,
      unit: 'watts',
      with: (part, value) => ({ ...part, boardPowerWatts: value }),
    }),
    flags<GpuSpec>({
      control: 'flags',
      effect: 'validated',
      get: part => part.powerConnectors,
      group: 'gpu',
      help: 'The power leads the card needs. A compatibility rule checks the supply provides them.',
      id: 'powerConnectors',
      label: 'Power connectors',
      options: POWER_CONNECTORS.map(connector => ({ label: POWER_CONNECTOR_LABELS[connector], value: connector })),
      with: (part, value) => ({ ...part, powerConnectors: value.filter(isPowerConnector) }),
    }),
  ],
  read: build => build.gpu,
  slots: [],
  write: (build, part) => ({ ...build, gpu: part }),
};

const psuPart: PartDefinition<PsuSpec> = {
  blank: {
    connectors: ['atx-24', 'eps-8', 'pcie-8'],
    id: 'psu-blank',
    identity: 'Custom power supply',
    wattage: 650,
  },
  id: 'psu',
  label: 'Power supply',
  parameters: [
    numeric<PsuSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.wattage,
      group: 'psu',
      help: 'The supply\'s rated output. A compatibility rule checks it covers the parts\' draw.',
      id: 'wattage',
      label: 'Wattage',
      max: 2000,
      min: 100,
      step: 50,
      unit: 'watts',
      with: (part, value) => ({ ...part, wattage: value }),
    }),
    flags<PsuSpec>({
      control: 'flags',
      effect: 'validated',
      get: part => part.connectors,
      group: 'psu',
      help: 'The power leads the supply provides. Compatibility rules check the board and card against them.',
      id: 'connectors',
      label: 'Connectors',
      options: POWER_CONNECTORS.map(connector => ({ label: POWER_CONNECTOR_LABELS[connector], value: connector })),
      with: (part, value) => ({ ...part, connectors: value.filter(isPowerConnector) }),
    }),
  ],
  read: build => build.psu,
  slots: [],
  write: (build, part) => ({ ...build, psu: part }),
};

const storagePart: PartDefinition<StorageSpec> = {
  blank: {
    capacityBytes: 1024 * GIB_BYTES,
    id: 'storage-blank',
    identity: 'Custom drive',
    interface: 'nvme',
    pcieLanes: 4,
  },
  id: 'storage',
  label: 'Storage',
  parameters: [
    choice<StorageSpec>({
      control: 'choice',
      effect: 'validated',
      get: part => part.interface,
      group: 'storage',
      help: 'How the drive attaches. A compatibility rule checks the board offers it; an NVMe drive also takes PCIe lanes from the graphics slot.',
      id: 'interface',
      label: 'Interface',
      options: STORAGE_INTERFACES.map(option => ({ label: option.label, value: option.value })),
      with: (part, value) => ({ ...part, interface: isStorageInterface(value) ? value : part.interface }),
    }),
    numeric<StorageSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.pcieLanes,
      group: 'storage',
      help: 'The PCIe lanes an NVMe drive occupies, shared with the graphics slot. A SATA drive uses none.',
      id: 'pcieLanes',
      label: 'PCIe lanes',
      max: 4,
      min: 0,
      step: 1,
      unit: 'count',
      with: (part, value) => ({ ...part, pcieLanes: value }),
    }),
    numeric<StorageSpec>({
      control: 'range',
      effect: 'display-only',
      get: part => part.capacityBytes,
      group: 'storage',
      help: 'How much the drive holds. Nothing reads it yet; it is recorded so the part is complete.',
      id: 'capacityBytes',
      label: 'Capacity',
      max: 8 * 1024 * GIB_BYTES,
      min: GIB_BYTES,
      step: GIB_BYTES,
      unit: 'bytes',
      with: (part, value) => ({ ...part, capacityBytes: value }),
    }),
  ],
  read: build => build.storage,
  slots: [],
  write: (build, part) => ({ ...build, storage: part }),
};

const coolerPart: PartDefinition<CoolerSpec> = {
  blank: {
    heightMm: 150,
    id: 'cooler-blank',
    identity: 'Custom cooler',
    supportedSockets: ['am4', 'am5', 'lga1200', 'lga1700', 'lga1851'],
    tdpRatingWatts: 150,
  },
  id: 'cooler',
  label: 'CPU cooler',
  parameters: [
    flags<CoolerSpec>({
      control: 'flags',
      effect: 'validated',
      get: part => part.supportedSockets,
      group: 'cooler',
      help: 'The sockets this cooler mounts on. A compatibility rule checks the CPU socket is among them.',
      id: 'supportedSockets',
      label: 'Supported sockets',
      options: SOCKETS.map(socket => ({ label: SOCKET_LABELS[socket], value: socket })),
      with: (part, value) => ({ ...part, supportedSockets: value.filter(isSocket) }),
    }),
    numeric<CoolerSpec>({
      control: 'count',
      effect: 'validated',
      get: part => part.tdpRatingWatts,
      group: 'cooler',
      help: 'The heat the cooler can dissipate. A compatibility rule checks it covers the CPU TDP.',
      id: 'tdpRatingWatts',
      label: 'TDP rating',
      max: 500,
      min: 1,
      step: 1,
      unit: 'watts',
      with: (part, value) => ({ ...part, tdpRatingWatts: value }),
    }),
    numeric<CoolerSpec>({
      control: 'range',
      effect: 'display-only',
      get: part => part.heightMm,
      group: 'cooler',
      help: 'The cooler height. A future rule checks it against the case; nothing simulates it.',
      id: 'heightMm',
      label: 'Height',
      max: 200,
      min: 20,
      step: 5,
      unit: 'mm',
      with: (part, value) => ({ ...part, heightMm: value }),
    }),
  ],
  read: build => build.cooler,
  slots: [],
  write: (build, part) => ({ ...build, cooler: part }),
};

const PARTS: readonly PartDefinition<unknown>[] = [
  cpuPart,
  memoryPart,
  motherboardPart,
  gpuPart,
  psuPart,
  storagePart,
  coolerPart,
] as unknown as readonly PartDefinition<unknown>[];

export function partDefinitions(): readonly PartDefinition<unknown>[] {
  return PARTS;
}

/** One part by id. The page is ours, so an unknown id is a wiring mistake. */
export function partDefinition(part: PartId): PartDefinition<unknown> {
  const definition = PARTS.find(candidate => candidate.id === part);
  if (definition === undefined)
    throw new Error(`unknown part: ${part}`);
  return definition;
}

/** The shape `applyParameter` drives, with the part's own type erased. */
interface ErasedParameter {
  readonly control: ParameterControl;
  readonly get: (part: unknown) => unknown;
  readonly group: SlotId;
  readonly id: string;
  readonly max?: number;
  readonly min?: number;
  readonly options?: readonly { readonly label: string; readonly value: unknown }[];
  readonly scale?: 'linear' | 'log';
  readonly step?: number;
  readonly with: (part: unknown, value: unknown) => unknown;
}

/**
 * Applies one characteristic. A value outside the descriptor's own range is
 * clamped, because that range *is* the field's law. A change that would leave
 * the model incoherent is refused instead, and the input build is returned.
 */
export function applyParameter(
  build: Build,
  part: PartId,
  parameterId: string,
  value: ParameterValue,
): ParameterApplication {
  const definition = partDefinition(part);
  const current = definition.read(build);

  // An absent part is a refusal rather than a throw: this function is public and
  // its tests drive it directly, and the bench makes the case unreachable.
  if (current === null)
    return { build, refused: `this build has no ${definition.label.toLowerCase()} yet` };

  const parameter = definition.parameters.find(candidate => candidate.id === parameterId);
  if (parameter === undefined)
    throw new Error(`${part} has no characteristic named ${parameterId}`);

  // The second boundary cast, the mirror of the one above: `Parameter<unknown>`
  // is a union of function-typed shapes, so its `with` cannot be called with a
  // value the compiler has not narrowed to one member. `read` and `write` are
  // already callable on `unknown`, so nothing else needs to be erased.
  const erased = parameter as unknown as ErasedParameter;
  const next = definition.write(build, erased.with(current, coerce(erased, value)));

  const refused = refusalFor(next, erased);
  if (refused !== null)
    return { build, refused };
  return { build: next, refused: null };
}

function coerce(parameter: ErasedParameter, value: ParameterValue): unknown {
  if (parameter.control !== 'count' && parameter.control !== 'range')
    return value;
  return clampToDescriptor(parameter, typeof value === 'number' ? value : Number(value));
}

function clampToDescriptor(parameter: ErasedParameter, value: number): number {
  const min = parameter.min ?? value;
  const max = parameter.max ?? value;
  if (Number.isNaN(value))
    return min;

  // `Math.max`/`Math.min` send an infinite request to the end it points at:
  // +Infinity to `max`, -Infinity to `min`.
  const clamped = Math.min(Math.max(value, min), max);

  const step = parameter.scale === 'log' ? undefined : parameter.step;
  if (step === undefined || step <= 0)
    return clamped;

  const snapped = min + Math.round((clamped - min) / step) * step;
  return Math.min(Math.max(Number(snapped.toFixed(STEP_DECIMALS)), min), max);
}

/**
 * The invariants a descriptor cannot express. Everything else is either clamped
 * by the descriptor's range or a warning the run continues through.
 */
function refusalFor(build: Build, parameter: ErasedParameter): string | null {
  const board = build.motherboard;
  if (parameter.id === 'allowedGenerations' && board !== null && board.allowedGenerations.length < 1)
    return 'a board must accept at least one memory generation';

  const level = cacheLevelOf(parameter.group);
  const caches = build.cpu?.caches;
  if (level === null || caches === undefined)
    return null;

  const name = level.toUpperCase();
  const spec = caches[level];
  const sets = Math.floor(spec.capacityBytes / (spec.ways * DEFAULT_LINE_BYTES));

  if (sets < 1)
    return `${name} capacity must hold at least one set: ${spec.ways} ways × ${DEFAULT_LINE_BYTES} bytes`;
  if (sets > MAX_SETS)
    return `${name} would need ${sets} sets, and this model stops at ${MAX_SETS}`;
  return null;
}
