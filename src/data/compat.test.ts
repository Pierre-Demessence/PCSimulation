import type { CaseSpec, CoolerSpec, GpuSpec, PsuSpec, StorageSpec } from '@/data';
import type { HardwareConfig, MemorySpec, MotherboardSpec } from '@/sim';

import { describe, expect, it } from 'vitest';

import { BASELINE_CPU, memorySpec } from '@/data';
import { GENERATION_PAIRS, testConfig } from '@/testing/build';

import { validateConfiguration } from './compat';

function configWith(memory: MemorySpec): HardwareConfig {
  return { ...testConfig(), memory };
}

const BASE_GPU: GpuSpec = {
  boardPowerWatts: 200,
  id: 'gpu',
  identity: 'Test GPU',
  lengthMm: 280,
  pcieLanes: 16,
  pcieVersion: 4,
  powerConnectors: ['pcie-8'],
};

const BASE_PSU: PsuSpec = {
  connectors: ['atx-24', 'eps-8', 'pcie-8'],
  id: 'psu',
  identity: 'Test PSU',
  wattage: 650,
};

const BASE_COOLER: CoolerSpec = {
  heightMm: 150,
  id: 'cooler',
  identity: 'Test cooler',
  supportedSockets: ['lga1700'],
  tdpRatingWatts: 150,
};

const BASE_STORAGE: StorageSpec = {
  capacityBytes: 1_000_000_000_000,
  id: 'storage',
  identity: 'Test drive',
  interface: 'nvme',
  pcieLanes: 4,
};

const BASE_CASE: CaseSpec = {
  formFactors: ['atx', 'matx', 'itx'],
  id: 'case',
  identity: 'Test case',
  maxCoolerHeightMm: 170,
  maxGpuLengthMm: 360,
};
describe('validateConfiguration', () => {
  it('accepts every generation on its own board', () => {
    for (const { board, memory } of GENERATION_PAIRS)
      expect(validateConfiguration(testConfig({ memory, motherboard: board }))).toEqual([]);
  });

  it('rejects a DIMM the board will not accept', () => {
    const problems = validateConfiguration(configWith(memorySpec('ddr5', 5600, 36)));
    expect(problems).toContain('board does not accept DDR5 memory');
  });

  it('rejects more channels than the board supports', () => {
    const problems = validateConfiguration(configWith(memorySpec('ddr4', 3200, 16, { channels: 4 })));
    expect(problems).toContain('board supports at most 2 channel(s)');
  });

  it('rejects memory faster than the board allows', () => {
    const problems = validateConfiguration(configWith(memorySpec('ddr4', 6000, 30)));
    expect(problems.some(problem => problem.includes('MT/s'))).toBe(true);
  });

  it('rejects more channels than there are DIMM slots', () => {
    // No shipped board can show this, because each has at least as many slots
    // as channels; a narrow board makes the rule reachable.
    const board: MotherboardSpec = {
      allowedGenerations: ['ddr4'],
      dimmSlots: 2,
      formFactor: 'atx',
      id: 'mb-narrow',
      maxChannels: 4,
      maxMtPerSecond: 3200,
      pcieLanes: 20,
      m2Slots: 2,
      pcieVersion: 4,
      powerConnectors: ['atx-24', 'eps-8'],
      sataPorts: 4,
      socket: 'lga1700',
    };
    const problems = validateConfiguration({
      ...testConfig(),
      memory: memorySpec('ddr4', 3200, 16, { channels: 3 }),
      motherboard: board,
    });
    expect(problems).toContain('each channel needs a DIMM, and the board has 2 slot(s)');
  });

  it('rejects a nonsensical spec', () => {
    expect(validateConfiguration(configWith(memorySpec('ddr4', 3200, 0)))).toContain(
      'CAS latency must be at least 1',
    );
  });

  it('rejects an outstanding-miss cap of zero, which would stall the core forever', () => {
    const base = configWith(memorySpec('ddr4', 3200, 16));
    const problems = validateConfiguration({
      ...base,
      caches: { ...base.caches, l2: { ...base.caches.l2, maxOutstandingMisses: 0 } },
    });
    expect(problems).toContain('L2 needs at least one outstanding-miss slot');
  });

  it('rejects a CPU whose socket does not fit the board', () => {
    const problems = validateConfiguration(
      testConfig({ cpu: { ...BASELINE_CPU, socket: 'am5' } }),
    );
    expect(problems.some(problem => problem.includes('socket'))).toBe(true);
  });

  it('rejects memory the CPU controller does not support', () => {
    const problems = validateConfiguration(
      testConfig({ cpu: { ...BASELINE_CPU, memoryGenerations: ['ddr5'] } }),
    );
    expect(problems).toContain('the CPU\'s memory controller does not support DDR4');
  });

  it('rejects a card whose power lead the supply lacks', () => {
    const gpu: GpuSpec = { ...BASE_GPU, powerConnectors: ['12vhpwr'] };
    const problems = validateConfiguration({ gpu, psu: BASE_PSU });
    expect(problems.some(problem => problem.includes('12VHPWR'))).toBe(true);
  });

  it('rejects a board whose power lead the supply lacks', () => {
    const problems = validateConfiguration({
      motherboard: testConfig().motherboard,
      psu: { ...BASE_PSU, connectors: ['atx-24'] },
    });
    expect(problems.some(problem => problem.includes('EPS'))).toBe(true);
  });

  it('warns when the card wants more lanes than the board provides', () => {
    const problems = validateConfiguration({
      gpu: { ...BASE_GPU, pcieLanes: 32 },
      motherboard: testConfig().motherboard,
    });
    expect(problems.some(problem => problem.includes('PCIe lanes'))).toBe(true);
  });

  it('warns when the board slot is an older PCIe generation than the card', () => {
    const problems = validateConfiguration({
      gpu: { ...BASE_GPU, pcieVersion: 5 },
      motherboard: testConfig().motherboard,
    });
    expect(problems.some(problem => problem.includes('older'))).toBe(true);
  });

  it('warns when the parts draw more than the supply provides', () => {
    const problems = validateConfiguration({
      cpu: BASELINE_CPU,
      gpu: { ...BASE_GPU, boardPowerWatts: 400 },
      psu: { ...BASE_PSU, wattage: 200 },
    });
    expect(problems.some(problem => problem.includes('rated 200 W'))).toBe(true);
  });

  it('warns when no part can drive a display', () => {
    const problems = validateConfiguration({ cpu: { ...BASELINE_CPU, integratedGraphics: false } });
    expect(problems).toContain('no display output: add a graphics card or a CPU with integrated graphics');
  });

  it('rejects a cooler that does not fit the CPU socket', () => {
    const problems = validateConfiguration({
      cooler: { ...BASE_COOLER, supportedSockets: ['am5'] },
      cpu: BASELINE_CPU,
    });
    expect(problems.some(problem => problem.includes('cooler does not fit'))).toBe(true);
  });

  it('warns when the cooler is rated below the CPU TDP', () => {
    const problems = validateConfiguration({
      cooler: { ...BASE_COOLER, tdpRatingWatts: 30 },
      cpu: BASELINE_CPU,
    });
    expect(problems.some(problem => problem.includes('below the CPU'))).toBe(true);
  });

  it('rejects a drive the board has no slot for', () => {
    const problems = validateConfiguration({
      motherboard: { ...testConfig().motherboard, m2Slots: 0 },
      storage: BASE_STORAGE,
    });
    expect(problems.some(problem => problem.includes('no M.2 slot'))).toBe(true);
  });

  it('rejects a SATA drive the board has no port for', () => {
    const problems = validateConfiguration({
      motherboard: { ...testConfig().motherboard, sataPorts: 0 },
      storage: { ...BASE_STORAGE, interface: 'sata', pcieLanes: 0 },
    });
    expect(problems.some(problem => problem.includes('no SATA slot'))).toBe(true);
  });

  it('narrows the GPU lane budget when an M.2 drive is populated', () => {
    const gpu: GpuSpec = { ...BASE_GPU, pcieLanes: 20 };
    const board = testConfig().motherboard;
    const withoutM2 = validateConfiguration({ gpu, motherboard: board });
    const withM2 = validateConfiguration({ gpu, motherboard: board, storage: BASE_STORAGE });
    expect(withoutM2.some(problem => problem.includes('PCIe lanes'))).toBe(false);
    expect(withM2.some(problem => problem.includes('PCIe lanes'))).toBe(true);
  });

  it('rejects a board the case cannot hold', () => {
    const problems = validateConfiguration({
      case: { ...BASE_CASE, formFactors: ['itx'] },
      motherboard: testConfig().motherboard,
    });
    expect(problems.some(problem => problem.includes('does not support the ATX board'))).toBe(true);
  });

  it('rejects a card longer than the case allows', () => {
    const problems = validateConfiguration({
      case: { ...BASE_CASE, maxGpuLengthMm: 250 },
      gpu: BASE_GPU,
    });
    expect(problems.some(problem => problem.includes('mm clearance'))).toBe(true);
  });

  it('rejects a cooler taller than the case allows', () => {
    const problems = validateConfiguration({
      case: { ...BASE_CASE, maxCoolerHeightMm: 120 },
      cooler: BASE_COOLER,
    });
    expect(problems.some(problem => problem.includes('mm clearance'))).toBe(true);
  });

  it('accepts a card exactly as long as the case allows', () => {
    const problems = validateConfiguration({
      case: { ...BASE_CASE, maxGpuLengthMm: BASE_GPU.lengthMm },
      gpu: BASE_GPU,
    });
    expect(problems.some(problem => problem.includes('mm clearance'))).toBe(false);
  });
});
