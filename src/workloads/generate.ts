import type { WorkloadAccess } from '@/sim';

import { createRng } from './rng';

export type WorkloadKind = 'mixed' | 'random' | 'streaming';

export interface WorkloadSpec {
  readonly kind: WorkloadKind;
  readonly seed: number;
  readonly accessCount: number;
  readonly workingSetBytes: number;
  /** v0.1 moves whole lines, so access size equals line size. */
  readonly lineBytes: number;
  /**
   * For `mixed`: the share of accesses that follow a dependent random hop
   * instead of the next sequential line.
   */
  readonly dependentRatio: number;
}

export const WORKLOAD_DEFAULTS = {
  accessCount: 1_000_000,
  dependentRatio: 0.5,
  lineBytes: 64,
  seed: 1,
  workingSetBytes: 256 * 1024 * 1024,
} as const;

/** Sequential lines: neighbouring addresses, independent, prefetch-friendly. */
export function streamingSpec(overrides: Partial<WorkloadSpec> = {}): WorkloadSpec {
  return { ...WORKLOAD_DEFAULTS, kind: 'streaming', ...overrides };
}

/** Dependent random hops: one access in flight, latency exposed. */
export function randomSpec(overrides: Partial<WorkloadSpec> = {}): WorkloadSpec {
  return { ...WORKLOAD_DEFAULTS, kind: 'random', ...overrides };
}

export function mixedSpec(overrides: Partial<WorkloadSpec> = {}): WorkloadSpec {
  return { ...WORKLOAD_DEFAULTS, kind: 'mixed', ...overrides };
}

/**
 * Builds the access stream for a workload. The same spec always yields the
 * same sequence, so two rigs can be compared on identical work.
 */
export function generateAccesses(spec: WorkloadSpec): WorkloadAccess[] {
  const { accessCount, dependentRatio, kind, lineBytes, seed, workingSetBytes } = spec;
  if (lineBytes < 1)
    throw new Error('lineBytes must be at least 1');

  const lineCount = Math.max(1, Math.floor(workingSetBytes / lineBytes));
  const rng = createRng(seed);
  const accesses: WorkloadAccess[] = [];

  let cursor = 0;
  for (let index = 0; index < accessCount; index += 1) {
    if (kind === 'streaming') {
      accesses.push({ address: cursor * lineBytes, bytes: lineBytes, dependent: false });
      cursor = (cursor + 1) % lineCount;
      continue;
    }

    if (kind === 'random') {
      accesses.push({ address: rng.nextInt(lineCount) * lineBytes, bytes: lineBytes, dependent: true });
      continue;
    }

    if (rng.next() < dependentRatio) {
      accesses.push({ address: rng.nextInt(lineCount) * lineBytes, bytes: lineBytes, dependent: true });
    }
    else {
      accesses.push({ address: cursor * lineBytes, bytes: lineBytes, dependent: false });
      cursor = (cursor + 1) % lineCount;
    }
  }

  return accesses;
}
