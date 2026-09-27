import type { HardwareConfig, MemorySpec, MotherboardSpec } from '@/sim';

type Parts = Partial<HardwareConfig>;

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
export interface ConfigurationRule {
  readonly id: string;
  readonly sources: readonly string[];
  evaluate: (parts: Parts) => RuleOutcome | null;
}

/** A rule that reads the DIMM and the board, and so needs both to be present. */
function boardRule(
  id: string,
  sources: readonly string[],
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
  boardRule(
    'memory-generation-accepted',
    ['memory.generation', 'motherboard.allowedGenerations'],
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
];

/**
 * Applies the motherboard's rules to a configuration. Empty means the board
 * accepts the parts; otherwise every violation is explained in plain language.
 */
export function validateConfiguration(config: HardwareConfig): string[] {
  const problems: string[] = [];
  for (const rule of CONFIGURATION_RULES) {
    const outcome = rule.evaluate(config);
    if (outcome !== null && outcome.violation !== null)
      problems.push(outcome.violation);
  }
  return problems;
}
