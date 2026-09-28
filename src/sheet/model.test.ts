import type { BuildSheet } from './model';

import type { Build } from '@/data';
import { describe, expect, it } from 'vitest';
import { applyParameter, completeBuild, emptyBuild, partDefinitions } from '@/data';
import { simulate } from '@/sim';
import { DDR5_BOARD, DDR5_MEMORY, testBuild } from '@/testing/build';

import { generateAccesses, streamingSpec } from '@/workloads';
import { buildSheet } from './model';

/** Small enough to stay fast; the sheet reports whatever figures it produces. */
const STREAMING = streamingSpec({ accessCount: 2_000 });

function runBuild(build: Build) {
  const config = completeBuild(build);
  if (config === null)
    throw new Error('the build under test must be complete');
  const result = simulate(config, generateAccesses(STREAMING));
  return {
    result,
    sheet: buildSheet({ build, origin: {}, result, workload: STREAMING.kind }),
  };
}

const DDR4_RUN = runBuild(testBuild());

/** Four populating channels, so the L1 budget runs out before the link does. */
const DDR5_FOUR_CHANNEL = applyParameter(
  testBuild({ memory: DDR5_MEMORY, motherboard: DDR5_BOARD }),
  'memory',
  'channels',
  4,
).build;
const DDR5_RUN = runBuild(DDR5_FOUR_CHANNEL);

/** Every string the sheet will show, so one empty formatter cannot slip through. */
function sheetStrings(sheet: BuildSheet): readonly string[] {
  const strings: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      strings.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value)
        visit(item);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>))
        visit(item);
    }
  };
  visit(sheet);
  return strings;
}

describe('buildSheet', () => {
  it('says what a build with no parts is missing', () => {
    const build = emptyBuild();
    const sheet = buildSheet({ build, origin: {}, result: null, workload: 'streaming' });

    expect(sheet.missing).toEqual(['cpu', 'memory', 'motherboard']);
    expect(sheet.verdict).toBe(
      'This build cannot run yet: it has no CPU, no memory and no motherboard.',
    );
    expect(sheet.measured).toEqual([]);
    expect(sheet.ceilings).toEqual([]);
    expect(sheet.floors).toEqual([]);
    expect(sheet.unmodeled).toEqual([]);
  });

  it('reads the DDR4 fixture back as prose', () => {
    expect(DDR4_RUN.sheet.limiterId).toBe(DDR4_RUN.result.bottleneckId);
    expect(DDR4_RUN.sheet.parts.map(section => section.part))
      .toEqual(['cpu', 'memory', 'motherboard']);

    const generation = DDR4_RUN.sheet.parts
      .find(section => section.part === 'memory')
      ?.rows
      .find(row => row.id === 'generation');
    expect(generation?.value).toBe('DDR4');
  });

  it('keeps row ids unique within each part', () => {
    for (const section of DDR4_RUN.sheet.parts) {
      const ids = section.rows.map(row => row.id);
      expect(new Set(ids).size, section.part).toBe(ids.length);
    }
  });

  it('writes one row per present descriptor', () => {
    const build = testBuild();
    const expected = partDefinitions()
      .filter(definition => definition.read(build) !== null)
      .reduce((total, definition) => total + definition.parameters.length, 0);

    const rows = DDR4_RUN.sheet.parts.reduce((total, section) => total + section.rows.length, 0);
    expect(rows).toBe(expected);
  });

  it('binds the parallelism ceiling on four DDR5 channels', () => {
    const parallelism = DDR5_RUN.sheet.ceilings.find(ceiling => ceiling.id === 'memory-level-parallelism');
    const bandwidth = DDR5_RUN.sheet.ceilings.find(ceiling => ceiling.id === 'memory-bandwidth');

    expect(parallelism?.binding).toBe(true);
    expect(bandwidth?.binding).toBe(false);
  });

  it('says the board cap is not enforced by the run', () => {
    const cap = DDR4_RUN.sheet.ceilings.find(ceiling => ceiling.id === 'board-memory-cap');

    expect(cap?.note).not.toBeNull();
    expect(cap?.note).toContain('does not enforce');
  });

  it('changes a rendered figure when one characteristic changes', () => {
    const faster = applyParameter(testBuild(), 'memory', 'mtPerSecond', 5600).build;
    const before = DDR4_RUN.sheet.ceilings.find(ceiling => ceiling.id === 'memory-bandwidth')?.value;
    const after = runBuild(faster).sheet.ceilings.find(ceiling => ceiling.id === 'memory-bandwidth')?.value;

    expect(before).toBe('51.2 GB/s');
    expect(after).not.toBe(before);
  });

  it('leaves no string empty', () => {
    expect(sheetStrings(DDR5_RUN.sheet).filter(text => text.length === 0)).toEqual([]);
  });
});
