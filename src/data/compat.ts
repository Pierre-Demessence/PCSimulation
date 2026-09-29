import type { CompatParts } from './parts/specs';

import type { FormFactor, MemorySpec, MotherboardSpec, PowerConnector } from '@/sim';

type Parts = CompatParts;

/** A base draw for the parts a build does not model (board, fans, drives). */
const BASE_WATTS = 80;

const CONNECTOR_LABEL: Record<PowerConnector, string> = {
  '12vhpwr': '12VHPWR',
  'atx-24': '24-pin ATX',
  'eps-8': '8-pin EPS',
  'pcie-6': '6-pin PCIe',
  'pcie-8': '8-pin PCIe',
};

const FORM_FACTOR_LABEL: Record<FormFactor, string> = {
  atx: 'ATX',
  eatx: 'E-ATX',
  itx: 'Mini-ITX',
  matx: 'Micro-ATX',
};

/** The first required connector the available set cannot cover, honouring counts. */
function firstUncovered(
  required: readonly PowerConnector[],
  available: readonly PowerConnector[],
): PowerConnector | null {
  const pool = [...available];
  for (const need of required) {
    const index = pool.indexOf(need);
    if (index === -1)
      return need;
    pool.splice(index, 1);
  }
  return null;
}

/**
 * What one rule makes of a configuration. `rule` is the rule's own wording for
 * these parts, its numbers filled in, so a reader can check the arithmetic;
 * `statement` says the same thing in plain language and only the rules the sheet
 * gives a row carry one; `violation` repeats `rule` when the rule does not hold
 * and is null when it does.
 */
export interface RuleOutcome {
  readonly rule: string;
  readonly statement?: string;
  readonly violation: string | null;
}

/**
 * One of the motherboard's rules, as data. `id` is stable across presentations;
 * `sources` names every field the rule reads, dotted as the code spells it, so a
 * reader can check the claim. `evaluate` returns null when a field it reads is
 * absent, so a build missing a part skips the rule instead of guessing.
 *
 * `validateConfiguration` and the build sheet's checks both walk this one list,
 * which is what keeps the warnings line and the sheet from stating one rule two
 * ways.
 */
/** How a broken rule is presented: parts that cannot work together (`incompatible`), or that work below spec (`warning`). */
export type RuleSeverity = 'incompatible' | 'warning';

export interface ConfigurationRule {
  readonly id: string;
  readonly severity: RuleSeverity;
  readonly sources: readonly string[];
  evaluate: (parts: Parts) => RuleOutcome | null;
}

/** A rule that reads the DIMM and the board, and so needs both to be present. */
function boardRule(
  id: string,
  sources: readonly string[],
  severity: RuleSeverity,
  evaluate: (memory: MemorySpec, motherboard: MotherboardSpec) => RuleOutcome,
): ConfigurationRule {
  return {
    evaluate(parts) {
      const { memory, motherboard } = parts;
      if (memory === undefined || motherboard === undefined)
        return null;
      return evaluate(memory, motherboard);
    },
    id,
    severity,
    sources,
  };
}

/**
 * A rule that reads one count and holds while it is at least one. The positivity
 * guards and the four outstanding-miss checks share this shape, so they are
 * built from one factory. None of them gets a sheet row: the descriptors' minima
 * put them out of the editor's reach.
 */
function atLeastOne(
  id: string,
  source: string,
  read: (parts: Parts) => number | undefined,
  wording: string,
): ConfigurationRule {
  return {
    evaluate(parts) {
      const value = read(parts);
      if (value === undefined)
        return null;
      return { rule: wording, violation: value < 1 ? wording : null };
    },
    id,
    severity: 'warning',
    sources: [source],
  };
}

/**
 * The board's rules, in the order their warnings are reported.
 * `validateConfiguration` walks this list; `buildChecks` renders the rules that
 * carry a `statement` as the sheet's rows, so a rule is written once no matter
 * how many presentations read it.
 */
export const CONFIGURATION_RULES: readonly ConfigurationRule[] = [
  {
    evaluate(parts) {
      const { cpu, motherboard } = parts;
      if (cpu === undefined || motherboard === undefined)
        return null;
      const rule = `CPU socket ${cpu.socket.toUpperCase()} does not fit the board's ${motherboard.socket.toUpperCase()} socket`;
      return {
        rule,
        statement: `CPU socket ${cpu.socket.toUpperCase()} fits the board`,
        violation: cpu.socket === motherboard.socket ? null : rule,
      };
    },
    id: 'cpu-socket-matches-board',
    severity: 'incompatible',
    sources: ['cpu.socket', 'motherboard.socket'],
  },
  {
    evaluate(parts) {
      const { cpu, memory } = parts;
      if (cpu === undefined || memory === undefined)
        return null;
      const generation = memory.generation.toUpperCase();
      const rule = `the CPU's memory controller does not support ${generation}`;
      return {
        rule,
        statement: `${generation} memory supported by the CPU`,
        violation: cpu.memoryGenerations.includes(memory.generation) ? null : rule,
      };
    },
    id: 'cpu-accepts-generation',
    severity: 'incompatible',
    sources: ['cpu.memoryGenerations', 'memory.generation'],
  },
  boardRule(
    'memory-generation-accepted',
    ['memory.generation', 'motherboard.allowedGenerations'],
    'incompatible',
    (memory, motherboard) => {
      const generation = memory.generation.toUpperCase();
      const rule = `board does not accept ${generation} memory`;
      return {
        rule,
        statement: `${generation} memory accepted by this board`,
        violation: motherboard.allowedGenerations.includes(memory.generation) ? null : rule,
      };
    },
  ),
  atLeastOne(
    'memory-channels-positive',
    'memory.channels',
    parts => parts.memory?.channels,
    'memory must expose at least one channel',
  ),
  boardRule(
    'channels-within-board-cap',
    ['memory.channels', 'motherboard.maxChannels'],
    'warning',
    (memory, motherboard) => {
      const rule = `board supports at most ${motherboard.maxChannels} channel(s)`;
      return {
        rule,
        statement: `${memory.channels} channels, and the board supports ${motherboard.maxChannels}`,
        violation: memory.channels > motherboard.maxChannels ? rule : null,
      };
    },
  ),
  boardRule(
    'channels-within-dimm-slots',
    ['memory.channels', 'motherboard.dimmSlots'],
    'warning',
    (memory, motherboard) => {
      const rule = `each channel needs a DIMM, and the board has ${motherboard.dimmSlots} slot(s)`;
      return {
        rule,
        statement: `${memory.channels} channels need ${memory.channels} DIMMs, and the board has ${motherboard.dimmSlots} slots`,
        violation: memory.channels > motherboard.dimmSlots ? rule : null,
      };
    },
  ),
  atLeastOne(
    'memory-speed-positive',
    'memory.mtPerSecond',
    parts => parts.memory?.mtPerSecond,
    'memory speed must be positive',
  ),
  boardRule(
    'speed-within-board-cap',
    ['memory.mtPerSecond', 'motherboard.maxMtPerSecond'],
    'warning',
    (memory, motherboard) => {
      const rule = `board caps memory at ${motherboard.maxMtPerSecond} MT/s`;
      return {
        rule,
        statement: `${memory.mtPerSecond} MT/s, and the board's ceiling is ${motherboard.maxMtPerSecond} MT/s`,
        violation: memory.mtPerSecond > motherboard.maxMtPerSecond ? rule : null,
      };
    },
  ),
  atLeastOne(
    'cas-latency-positive',
    'memory.casLatency',
    parts => parts.memory?.casLatency,
    'CAS latency must be at least 1',
  ),
  atLeastOne(
    'l1-outstanding-misses',
    'caches.l1.maxOutstandingMisses',
    parts => parts.caches?.l1.maxOutstandingMisses,
    'L1 needs at least one outstanding-miss slot',
  ),
  atLeastOne(
    'l2-outstanding-misses',
    'caches.l2.maxOutstandingMisses',
    parts => parts.caches?.l2.maxOutstandingMisses,
    'L2 needs at least one outstanding-miss slot',
  ),
  atLeastOne(
    'l3-outstanding-misses',
    'caches.l3.maxOutstandingMisses',
    parts => parts.caches?.l3.maxOutstandingMisses,
    'L3 needs at least one outstanding-miss slot',
  ),
  atLeastOne(
    'memory-outstanding-misses',
    'memory.maxOutstandingMisses',
    parts => parts.memory?.maxOutstandingMisses,
    'memory needs at least one outstanding-miss slot',
  ),
  {
    evaluate(parts) {
      const { cpu, gpu } = parts;
      if (cpu === undefined)
        return null;
      const rule = 'no display output: add a graphics card or a CPU with integrated graphics';
      return {
        rule,
        statement: 'a display output is available',
        violation: gpu !== undefined || cpu.integratedGraphics ? null : rule,
      };
    },
    id: 'display-output',
    severity: 'warning',
    sources: ['cpu.integratedGraphics', 'gpu.pcieLanes'],
  },
  {
    evaluate(parts) {
      const { gpu, motherboard } = parts;
      if (gpu === undefined || motherboard === undefined)
        return null;
      const m2Lanes = parts.storage?.interface === 'nvme' ? parts.storage.pcieLanes : 0;
      const available = motherboard.pcieLanes - m2Lanes;
      const shared = m2Lanes > 0 ? `, less ${m2Lanes} for the M.2 drive` : '';
      const rule = `the card wants ${gpu.pcieLanes} PCIe lanes, and ${available} are free (the board has ${motherboard.pcieLanes}${shared})`;
      return {
        rule,
        statement: `${gpu.pcieLanes} PCIe lanes, and ${available} are free`,
        violation: gpu.pcieLanes > available ? rule : null,
      };
    },
    id: 'gpu-lanes-available',
    severity: 'warning',
    sources: ['gpu.pcieLanes', 'motherboard.pcieLanes', 'storage.pcieLanes'],
  },
  {
    evaluate(parts) {
      const { gpu, motherboard } = parts;
      if (gpu === undefined || motherboard === undefined)
        return null;
      const rule = `the board's PCIe ${motherboard.pcieVersion} slot is older than the card's PCIe ${gpu.pcieVersion}, so the link runs slower`;
      return {
        rule,
        statement: `PCIe ${gpu.pcieVersion} card in a PCIe ${motherboard.pcieVersion} slot`,
        violation: motherboard.pcieVersion < gpu.pcieVersion ? rule : null,
      };
    },
    id: 'gpu-pcie-generation',
    severity: 'warning',
    sources: ['gpu.pcieVersion', 'motherboard.pcieVersion'],
  },
  {
    evaluate(parts) {
      const { gpu, psu } = parts;
      if (gpu === undefined || psu === undefined)
        return null;
      const missing = firstUncovered(gpu.powerConnectors, psu.connectors);
      const rule = missing === null
        ? 'the supply provides the card power leads'
        : `the card needs a ${CONNECTOR_LABEL[missing]} the supply does not provide`;
      return { rule, statement: 'the supply provides the card power leads', violation: missing === null ? null : rule };
    },
    id: 'gpu-power-connectors',
    severity: 'incompatible',
    sources: ['gpu.powerConnectors', 'psu.connectors'],
  },
  {
    evaluate(parts) {
      const { motherboard, psu } = parts;
      if (motherboard === undefined || psu === undefined)
        return null;
      const missing = firstUncovered(motherboard.powerConnectors, psu.connectors);
      const rule = missing === null
        ? 'the supply provides the board power leads'
        : `the board needs a ${CONNECTOR_LABEL[missing]} the supply does not provide`;
      return { rule, statement: 'the supply provides the board power leads', violation: missing === null ? null : rule };
    },
    id: 'board-power-connectors',
    severity: 'incompatible',
    sources: ['motherboard.powerConnectors', 'psu.connectors'],
  },
  {
    evaluate(parts) {
      const { cpu, psu } = parts;
      if (psu === undefined || cpu === undefined)
        return null;
      const draw = cpu.tdpWatts + (parts.gpu?.boardPowerWatts ?? 0) + BASE_WATTS;
      const rule = `the parts draw about ${draw} W, and the supply is rated ${psu.wattage} W`;
      return {
        rule,
        statement: `about ${draw} W drawn, ${psu.wattage} W supplied`,
        violation: draw > psu.wattage ? rule : null,
      };
    },
    id: 'psu-wattage',
    severity: 'warning',
    sources: ['psu.wattage', 'cpu.tdpWatts', 'gpu.boardPowerWatts'],
  },
  {
    evaluate(parts) {
      const { cooler, cpu } = parts;
      if (cpu === undefined || cooler === undefined)
        return null;
      const socket = cpu.socket.toUpperCase();
      const rule = `the cooler does not fit the CPU's ${socket} socket`;
      return {
        rule,
        statement: `the cooler fits the CPU's ${socket} socket`,
        violation: cooler.supportedSockets.includes(cpu.socket) ? null : rule,
      };
    },
    id: 'cooler-supports-socket',
    severity: 'incompatible',
    sources: ['cooler.supportedSockets', 'cpu.socket'],
  },
  {
    evaluate(parts) {
      const { cooler, cpu } = parts;
      if (cpu === undefined || cooler === undefined)
        return null;
      const rule = `the cooler is rated ${cooler.tdpRatingWatts} W, below the CPU's ${cpu.tdpWatts} W`;
      return {
        rule,
        statement: `the cooler's ${cooler.tdpRatingWatts} W rating covers the CPU's ${cpu.tdpWatts} W`,
        violation: cooler.tdpRatingWatts < cpu.tdpWatts ? rule : null,
      };
    },
    id: 'cooler-tdp-covers-cpu',
    severity: 'warning',
    sources: ['cooler.tdpRatingWatts', 'cpu.tdpWatts'],
  },
  {
    evaluate(parts) {
      const { motherboard, storage } = parts;
      if (motherboard === undefined || storage === undefined)
        return null;
      const nvme = storage.interface === 'nvme';
      const offered = nvme ? motherboard.m2Slots : motherboard.sataPorts;
      const name = nvme ? 'M.2' : 'SATA';
      const rule = `the board has no ${name} slot for the drive`;
      return {
        rule,
        statement: `the board offers a ${name} slot for the drive`,
        violation: offered < 1 ? rule : null,
      };
    },
    id: 'storage-interface-offered',
    severity: 'incompatible',
    sources: ['storage.interface', 'motherboard.m2Slots', 'motherboard.sataPorts'],
  },
  {
    evaluate(parts) {
      const { case: pcCase, motherboard } = parts;
      if (motherboard === undefined || pcCase === undefined)
        return null;
      const size = FORM_FACTOR_LABEL[motherboard.formFactor];
      const rule = `the case does not support the ${size} board`;
      return {
        rule,
        statement: `the case supports the ${size} board`,
        violation: pcCase.formFactors.includes(motherboard.formFactor) ? null : rule,
      };
    },
    id: 'case-fits-board',
    severity: 'incompatible',
    sources: ['case.formFactors', 'motherboard.formFactor'],
  },
  {
    evaluate(parts) {
      const { case: pcCase, gpu } = parts;
      if (gpu === undefined || pcCase === undefined)
        return null;
      const rule = `the ${gpu.lengthMm} mm card exceeds the case's ${pcCase.maxGpuLengthMm} mm clearance`;
      return {
        rule,
        statement: `the ${gpu.lengthMm} mm card fits the case's ${pcCase.maxGpuLengthMm} mm clearance`,
        violation: gpu.lengthMm > pcCase.maxGpuLengthMm ? rule : null,
      };
    },
    id: 'case-fits-gpu-length',
    severity: 'incompatible',
    sources: ['case.maxGpuLengthMm', 'gpu.lengthMm'],
  },
  {
    evaluate(parts) {
      const { case: pcCase, cooler } = parts;
      if (cooler === undefined || pcCase === undefined)
        return null;
      const rule = `the ${cooler.heightMm} mm cooler exceeds the case's ${pcCase.maxCoolerHeightMm} mm clearance`;
      return {
        rule,
        statement: `the ${cooler.heightMm} mm cooler fits the case's ${pcCase.maxCoolerHeightMm} mm clearance`,
        violation: cooler.heightMm > pcCase.maxCoolerHeightMm ? rule : null,
      };
    },
    id: 'case-fits-cooler-height',
    severity: 'incompatible',
    sources: ['case.maxCoolerHeightMm', 'cooler.heightMm'],
  },
];

/**
 * Applies the motherboard's rules to a configuration. Empty means the board
 * accepts the parts; otherwise every violation is explained in plain language.
 */
export function validateConfiguration(parts: Parts): string[] {
  const problems: string[] = [];
  for (const rule of CONFIGURATION_RULES) {
    const outcome = rule.evaluate(parts);
    if (outcome !== null && outcome.violation !== null)
      problems.push(outcome.violation);
  }
  return problems;
}
