import type { ParameterUnit } from './parameters';

import type { HardwareConfig, MemorySpec } from '@/sim';

import { aggregateBandwidthBytesPerNs, bytesPerNanosecond, DEFAULT_LINE_BYTES, fullAccessNs } from '@/sim';
import { CYCLES_PER_ISSUE } from './presets';

const NS_PER_SECOND = 1e9;

/** One field a limit is built from, named so a reader can check the arithmetic. */
export interface LimitInput {
  /** The field, dotted as the code spells it: `memory.mtPerSecond`. */
  readonly source: string;
  readonly value: number;
  readonly unit: ParameterUnit;
}

/**
 * A derived limit. `kind` decides the arithmetic: a ceiling is a minimum of
 * rates, a floor is a sum of delays. Both are always true for this build.
 */
export interface Limit {
  readonly id: string;
  readonly label: string;
  readonly kind: 'ceiling' | 'floor';
  readonly value: number;
  readonly unit: ParameterUnit;
  readonly inputs: readonly LimitInput[];
  /** The arithmetic in the reader's terms: `memory.mtPerSecond × 8 B × channels`. */
  readonly expression: string;
  /**
   * True when this limit sets the minimum of a unit group with more than one
   * member. Floors never bind, and a limit alone in its unit is not "binding" —
   * nothing competes with it. On a tie only one member binds: the first in the
   * group's declared order, and the others report their headroom as the reason
   * they are not it.
   */
  readonly binding: boolean;
  /** Set when the model does not enforce this: the run may exceed it. */
  readonly notEnforcedBy?: string;
}

/**
 * The board's cap is a spec figure, not a throttle: nothing in `src/sim/` reads
 * `maxMtPerSecond`, so a run is free to exceed it. The note is stated on every
 * board cap rather than only on a binding one, because it is a fact about the
 * model, not about this build's arithmetic.
 */
const BOARD_CAP_NOT_ENFORCED
  = 'The run does not enforce this ceiling: the simulation reads the DIMM at its own rate (memory.mtPerSecond), so a run may exceed this spec limit.';

/** A limit whose binding is decided once the whole unit group is known. */
type UnboundLimit = Omit<Limit, 'binding'>;

/** The memory fields behind `fullAccessNs`: the overhead plus the CAS slice and the rate that scales it. */
function memoryLatencyInputs(memory: MemorySpec): readonly LimitInput[] {
  return [
    { source: 'memory.accessOverheadNs', unit: 'ns', value: memory.accessOverheadNs },
    { source: 'memory.casLatency', unit: 'cycles', value: memory.casLatency },
    { source: 'memory.mtPerSecond', unit: 'mt-per-s', value: memory.mtPerSecond },
  ];
}

/**
 * Every ceiling and floor the *present* parts support. A build missing a part
 * yields fewer limits rather than defaults for the absent one.
 */
export function buildLimits(parts: Partial<HardwareConfig>): readonly Limit[] {
  const { caches, cpu, memory, motherboard } = parts;
  const candidates: UnboundLimit[] = [];

  if (memory) {
    candidates.push({
      expression: 'memory.mtPerSecond × 1e6 × 8 B × memory.channels ÷ 1e9',
      id: 'memory-bandwidth',
      inputs: [
        { source: 'memory.mtPerSecond', unit: 'mt-per-s', value: memory.mtPerSecond },
        { source: 'memory.channels', unit: 'count', value: memory.channels },
      ],
      kind: 'ceiling',
      label: 'Memory bandwidth',
      unit: 'bytes-per-ns',
      value: aggregateBandwidthBytesPerNs(memory),
    });
  }

  if (memory && motherboard) {
    candidates.push({
      expression: 'motherboard.maxMtPerSecond × 1e6 × 8 B × memory.channels ÷ 1e9',
      id: 'board-memory-cap',
      inputs: [
        { source: 'motherboard.maxMtPerSecond', unit: 'mt-per-s', value: motherboard.maxMtPerSecond },
        { source: 'memory.channels', unit: 'count', value: memory.channels },
      ],
      kind: 'ceiling',
      label: 'Board memory cap',
      notEnforcedBy: BOARD_CAP_NOT_ENFORCED,
      unit: 'bytes-per-ns',
      value: bytesPerNanosecond(motherboard.maxMtPerSecond) * memory.channels,
    });
  }

  if (caches && memory) {
    candidates.push({
      expression: 'caches.l1.maxOutstandingMisses × DEFAULT_LINE_BYTES ÷ fullAccessNs(memory)',
      id: 'memory-level-parallelism',
      inputs: [
        { source: 'caches.l1.maxOutstandingMisses', unit: 'count', value: caches.l1.maxOutstandingMisses },
        ...memoryLatencyInputs(memory),
      ],
      kind: 'ceiling',
      label: 'Memory-level parallelism',
      unit: 'bytes-per-ns',
      value: (caches.l1.maxOutstandingMisses * DEFAULT_LINE_BYTES) / fullAccessNs(memory),
    });
  }

  if (cpu) {
    candidates.push({
      expression: 'cpu.clockHz ÷ CYCLES_PER_ISSUE',
      id: 'core-issue-rate',
      inputs: [
        { source: 'cpu.clockHz', unit: 'hz', value: cpu.clockHz },
        { source: 'CYCLES_PER_ISSUE', unit: 'cycles', value: CYCLES_PER_ISSUE },
      ],
      kind: 'ceiling',
      label: 'Core issue rate',
      unit: 'per-ns',
      value: cpu.clockHz / CYCLES_PER_ISSUE / NS_PER_SECOND,
    });
  }

  if (caches && memory) {
    candidates.push({
      expression: 'l1.hitTimeNs + l2.hitTimeNs + l3.hitTimeNs + fullAccessNs(memory)',
      id: 'full-miss-latency',
      inputs: [
        { source: 'caches.l1.hitTimeNs', unit: 'ns', value: caches.l1.hitTimeNs },
        { source: 'caches.l2.hitTimeNs', unit: 'ns', value: caches.l2.hitTimeNs },
        { source: 'caches.l3.hitTimeNs', unit: 'ns', value: caches.l3.hitTimeNs },
        ...memoryLatencyInputs(memory),
      ],
      kind: 'floor',
      label: 'Full-miss latency',
      unit: 'ns',
      value: caches.l1.hitTimeNs + caches.l2.hitTimeNs + caches.l3.hitTimeNs + fullAccessNs(memory),
    });
  }

  const ceilingsByUnit = new Map<ParameterUnit, UnboundLimit[]>();
  for (const limit of candidates) {
    if (limit.kind !== 'ceiling')
      continue;
    const group = ceilingsByUnit.get(limit.unit);
    if (group)
      group.push(limit);
    else
      ceilingsByUnit.set(limit.unit, [limit]);
  }

  const bindingIds = new Set<string>();
  for (const group of ceilingsByUnit.values()) {
    // A lone ceiling in its unit competes with nothing, so it is not binding.
    if (group.length < 2)
      continue;
    let tightest = group[0];
    for (const limit of group) {
      // A strict compare keeps the first declared limit on a tie.
      if (limit.value < tightest.value)
        tightest = limit;
    }
    bindingIds.add(tightest.id);
  }

  return candidates.map(limit => ({ ...limit, binding: bindingIds.has(limit.id) }));
}
