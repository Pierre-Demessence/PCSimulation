import type { HardwareConfig, MemorySpec, MotherboardSpec } from '@/sim';

import { describe, expect, it } from 'vitest';

import { buildChecks } from './checks';
import { validateConfiguration } from './compat';
import { BASELINE_CPU, CACHE_HIERARCHY, GIB } from './presets';

/** The two parts every board rule reads: a DIMM and the board it sits in. */
interface MemoryAndBoard {
  readonly memory: MemorySpec;
  readonly motherboard: MotherboardSpec;
}

/** Two DDR4 channels, four DIMM slots, a 3200 MT/s ceiling. */
const DDR4_BOARD: MotherboardSpec = {
  allowedGenerations: ['ddr4'],
  dimmSlots: 4,
  id: 'mb-ddr4',
  maxChannels: 2,
  maxMtPerSecond: 3200,
  socket: 'lga1700',
};

const DDR4_3200: MemorySpec = {
  accessOverheadNs: 60,
  capacityBytes: 32 * GIB,
  casLatency: 16,
  channels: 2,
  generation: 'ddr4',
  id: 'ddr4-3200-cl16',
  maxOutstandingMisses: 192,
  mtPerSecond: 3200,
  role: 'pipe',
};

const DDR4_3200_8CH: MemorySpec = {
  ...DDR4_3200,
  channels: 8,
  id: 'ddr4-3200-cl16-8ch',
};

const DDR4_6000: MemorySpec = {
  ...DDR4_3200,
  id: 'ddr4-6000-cl30',
  mtPerSecond: 6000,
};

const DDR5_5600: MemorySpec = {
  ...DDR4_3200,
  generation: 'ddr5',
  id: 'ddr5-5600-cl36',
  mtPerSecond: 5600,
};

const DDR5_IN_DDR4: MemoryAndBoard = { memory: DDR5_5600, motherboard: DDR4_BOARD };
const EIGHT_CHANNELS: MemoryAndBoard = { memory: DDR4_3200_8CH, motherboard: DDR4_BOARD };
const FAST_DIMM: MemoryAndBoard = { memory: DDR4_6000, motherboard: DDR4_BOARD };

/** The three broken builds the agreement test walks. */
const BROKEN_RULES: readonly MemoryAndBoard[] = [DDR5_IN_DDR4, EIGHT_CHANNELS, FAST_DIMM];

/** The core consumes a whole machine, so the checks get a complete one. */
function complete(parts: MemoryAndBoard): HardwareConfig {
  return { caches: CACHE_HIERARCHY, cpu: BASELINE_CPU, ...parts };
}

describe('buildChecks', () => {
  it('states the four board relations for a coherent build', () => {
    const checks = buildChecks({ memory: DDR4_3200, motherboard: DDR4_BOARD });

    expect(checks.map(check => check.id)).toEqual([
      'memory-generation-accepted',
      'channels-within-board-cap',
      'channels-within-dimm-slots',
      'speed-within-board-cap',
    ]);
    expect(checks.map(check => check.statement)).toEqual([
      'DDR4 memory accepted by this board',
      '2 channels, and the board supports 2',
      '2 channels need 2 DIMMs, and the board has 4 slots',
      '3200 MT/s, and the board\'s ceiling is 3200 MT/s',
    ]);
    expect(checks.map(check => check.met)).toEqual([true, true, true, true]);
    expect(checks[1].sources).toEqual(['memory.channels', 'motherboard.maxChannels']);
    expect(checks[3].sources).toEqual(['memory.mtPerSecond', 'motherboard.maxMtPerSecond']);
  });

  it('reports the generation a DDR4 board will not accept', () => {
    const checks = buildChecks(DDR5_IN_DDR4);

    expect(checks).toHaveLength(4);
    expect(checks[0].met).toBe(false);
    expect(checks[0].rule).toBe('board does not accept DDR5 memory');
    // The other three rows still report. The DIMM is also faster than the
    // board's cap, which is the comparison the sandbox exists to make.
    expect(checks.slice(1).map(check => check.met)).toEqual([true, true, false]);
  });

  it('flags both channel rules when the DIMM asks for more than the board gives', () => {
    const checks = buildChecks(EIGHT_CHANNELS);

    expect(checks.map(check => check.met)).toEqual([true, false, false, true]);
    expect(checks[1].rule).toBe('board supports at most 2 channel(s)');
    expect(checks[2].rule).toBe('each channel needs a DIMM, and the board has 4 slot(s)');
    expect(checks[2].statement).toBe('8 channels need 8 DIMMs, and the board has 4 slots');
  });

  it('flags only the speed when the DIMM is faster than the board', () => {
    const checks = buildChecks(FAST_DIMM);

    expect(checks.map(check => check.met)).toEqual([true, true, true, false]);
    expect(checks[3].rule).toBe('board caps memory at 3200 MT/s');
    expect(checks[3].statement).toBe('6000 MT/s, and the board\'s ceiling is 3200 MT/s');
  });

  it('agrees rule-for-rule with validateConfiguration', () => {
    // Paired by the wording in `check.rule`: it is the message the warnings line
    // carries, because both presentations render the same rule list, so the
    // failed rows and the warnings must be the same texts in the same order.
    for (const parts of BROKEN_RULES) {
      const failed = buildChecks(parts).filter(check => !check.met);
      expect(failed.map(check => check.rule)).toEqual(validateConfiguration(complete(parts)));
    }
  });

  it('has no row for a rule whose fields are absent', () => {
    expect(buildChecks({})).toEqual([]);
    expect(buildChecks({ memory: DDR4_3200 })).toEqual([]);
    expect(buildChecks({ motherboard: DDR4_BOARD })).toEqual([]);
  });

  it('adds the CPU checks with their severity when a CPU is present', () => {
    const checks = buildChecks({ cpu: BASELINE_CPU, memory: DDR4_3200, motherboard: DDR4_BOARD });

    const socket = checks.find(check => check.id === 'cpu-socket-matches-board');
    expect(socket?.severity).toBe('incompatible');
    expect(socket?.met).toBe(true);

    const generation = checks.find(check => check.id === 'cpu-accepts-generation');
    expect(generation?.met).toBe(true);

    const speed = checks.find(check => check.id === 'speed-within-board-cap');
    expect(speed?.severity).toBe('warning');
  });

  it('gives the positivity guards no row even when they fire', () => {
    // `min: 1` on every descriptor makes this unreachable from the bench; the
    // warnings line is where it reaches the reader.
    const parts = { memory: { ...DDR4_3200, casLatency: 0 }, motherboard: DDR4_BOARD };
    const checks = buildChecks(parts);

    expect(checks).toHaveLength(4);
    expect(checks.every(check => check.met)).toBe(true);
    expect(validateConfiguration(complete(parts))).toContain('CAS latency must be at least 1');
  });
});
