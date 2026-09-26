import type { HardwareConfig } from '@/sim';

/**
 * Applies the motherboard's rules to a configuration. Empty means the board
 * accepts the parts; otherwise every violation is explained in plain language.
 */
export function validateConfiguration(config: HardwareConfig): string[] {
  const { memory, motherboard } = config;
  const problems: string[] = [];

  if (!motherboard.allowedGenerations.includes(memory.generation))
    problems.push(`board does not accept ${memory.generation.toUpperCase()} memory`);

  if (memory.channels < 1)
    problems.push('memory must expose at least one channel');

  if (memory.channels > motherboard.maxChannels)
    problems.push(`board supports at most ${motherboard.maxChannels} channel(s)`);

  if (memory.channels > motherboard.dimmSlots)
    problems.push(`each channel needs a DIMM, and the board has ${motherboard.dimmSlots} slot(s)`);

  if (memory.mtPerSecond < 1) {
    problems.push('memory speed must be positive');
  }
  else if (memory.mtPerSecond > motherboard.maxMtPerSecond) {
    problems.push(`board caps memory at ${motherboard.maxMtPerSecond} MT/s`);
  }

  if (memory.casLatency < 1)
    problems.push('CAS latency must be at least 1');

  for (const [label, cap] of outstandingCaps(config)) {
    if (cap < 1)
      problems.push(`${label} needs at least one outstanding-miss slot`);
  }

  return problems;
}

function outstandingCaps(config: HardwareConfig): readonly (readonly [string, number])[] {
  const { caches, memory } = config;
  return [
    ['L1', caches.l1.maxOutstandingMisses],
    ['L2', caches.l2.maxOutstandingMisses],
    ['L3', caches.l3.maxOutstandingMisses],
    ['memory', memory.maxOutstandingMisses],
  ];
}
