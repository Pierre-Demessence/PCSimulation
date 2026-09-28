import type { Parameter, ParameterValue, SlotId } from './parameters';
import type { Build } from '@/data';

import type { HardwareConfig } from '@/sim';

import { describe, expect, it } from 'vitest';
import { applyParameter, completeBuild, partDefinitions } from '@/data';

import { simulate } from '@/sim';
import { testFullBuild as testBuild } from '@/testing/build';
import { generateAccesses, streamingSpec } from '@/workloads';
import { CYCLES_PER_ISSUE } from './presets';

const ALL_SLOTS: readonly SlotId[] = ['cpu', 'l1', 'l2', 'l3', 'memory', 'motherboard'];

function configOf(build: Build): HardwareConfig {
  const config = completeBuild(build);
  if (config === null)
    throw new Error('the build is missing a part');
  return config;
}

function slotOf(build: Build, slot: SlotId): unknown {
  if (slot === 'cpu')
    return build.cpu?.cpu;
  if (slot === 'l1')
    return build.cpu?.caches.l1;
  if (slot === 'l2')
    return build.cpu?.caches.l2;
  if (slot === 'l3')
    return build.cpu?.caches.l3;
  if (slot === 'memory')
    return build.memory;
  return build.motherboard;
}

/**
 * Every value a descriptor's own range admits, each already on its own step
 * grid, so a round-trip failure means a real bug rather than snapping.
 */
function legalValues(parameter: Parameter<unknown>): readonly ParameterValue[] {
  switch (parameter.control) {
    case 'count':
    case 'range':
      return [parameter.min, parameter.max];
    case 'choice':
      return parameter.options.map(option => option.value);
    case 'flags': {
      const all = parameter.options.map(option => option.value);
      // Two distinct sets, so a descriptor whose default is the full set still
      // offers an alternative to the "changes exactly one" test.
      return all.length > 1 ? [all, all.slice(1)] : [all];
    }
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((item, index) => item === right[index]);
  return left === right;
}

function changedValue(parameter: Parameter<unknown>, current: unknown): ParameterValue {
  const different = legalValues(parameter).find(candidate => !sameValue(candidate, current));
  if (different === undefined)
    throw new Error(`${parameter.id} offers no alternative value`);
  return different;
}

function isOnGrid(value: number, min: number, step: number): boolean {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

describe('parameter registry', () => {
  it('reads back every value it writes', () => {
    for (const definition of partDefinitions()) {
      for (const parameter of definition.parameters) {
        for (const value of legalValues(parameter)) {
          const label = `${definition.id}.${parameter.id}`;
          const applied = applyParameter(testBuild(), definition.id, parameter.id, value);

          expect(applied.refused, label).toBeNull();
          expect(parameter.get(definition.read(applied.build)), label).toEqual(value);
        }
      }
    }
  });

  it('changes exactly one characteristic and nothing else', () => {
    const build = testBuild();
    for (const definition of partDefinitions()) {
      const before = definition.read(build);
      for (const parameter of definition.parameters) {
        const label = `${definition.id}.${parameter.id}`;
        const value = changedValue(parameter, parameter.get(before));
        const applied = applyParameter(build, definition.id, parameter.id, value);
        expect(applied.refused, label).toBeNull();

        const after = definition.read(applied.build);
        for (const other of definition.parameters) {
          if (other.id === parameter.id)
            continue;
          expect(other.get(after), `${label} moved ${other.id}`).toEqual(other.get(before));
        }
      }
    }
  });

  it('writes only the slots the part owns', () => {
    const build = testBuild();
    for (const definition of partDefinitions()) {
      const first = definition.parameters[0];
      if (first === undefined)
        throw new Error(`${definition.id} has no characteristics`);

      const before = definition.read(build);
      const applied = applyParameter(
        build,
        definition.id,
        first.id,
        changedValue(first, first.get(before)),
      );
      expect(applied.refused).toBeNull();

      for (const slot of ALL_SLOTS) {
        if (definition.slots.includes(slot))
          continue;
        // Identity, not equality: a write must not rebuild a slot it does not own.
        expect(slotOf(applied.build, slot), `${definition.id} touched ${slot}`).toBe(
          slotOf(build, slot),
        );
      }
    }
  });

  it('assigns every slot of the config to exactly one part', () => {
    const owned = partDefinitions().flatMap(definition => [...definition.slots]);
    expect([...owned].sort()).toEqual([...ALL_SLOTS].sort());
  });

  it('clamps to its own range and lands on the step grid', () => {
    const build = testBuild();
    for (const definition of partDefinitions()) {
      for (const parameter of definition.parameters) {
        if (parameter.control !== 'range' && parameter.control !== 'count')
          continue;
        const label = `${definition.id}.${parameter.id}`;

        const low = applyParameter(build, definition.id, parameter.id, -1e12);
        expect(parameter.get(definition.read(low.build)), label).toBe(parameter.min);

        const high = applyParameter(build, definition.id, parameter.id, 1e12);
        const clamped = parameter.get(definition.read(high.build)) as number;
        expect(clamped, label).toBe(parameter.max);
        expect(isOnGrid(clamped, parameter.min, parameter.step), label).toBe(true);
      }
    }
  });

  it('refuses a capacity that cannot hold a single set', () => {
    const shrunk = applyParameter(testBuild(), 'cpu', 'l3CapacityBytes', 1024);
    expect(shrunk.refused).toBeNull();

    // 32 ways × 64 bytes needs 2 KiB, which the 1 KiB capacity cannot hold.
    const widened = applyParameter(shrunk.build, 'cpu', 'l3Ways', 32);
    expect(widened.refused).not.toBeNull();

    // The refusal returns the input, so the editor keeps its last valid value.
    expect(widened.build).toBe(shrunk.build);
    expect(configOf(shrunk.build).caches.l3.ways).toBe(16);
  });

  it('refuses a board that accepts no memory generation', () => {
    const applied = applyParameter(testBuild(), 'motherboard', 'allowedGenerations', []);
    expect(applied.refused).not.toBeNull();
    expect(configOf(applied.build).motherboard.allowedGenerations).toEqual(['ddr4']);
  });

  it('refuses a level whose set count would blow the model up', () => {
    // 64 MiB at one way is 1,048,576 sets, each of which allocates a tag list.
    const widened = applyParameter(testBuild(), 'cpu', 'l3CapacityBytes', 64 * 1024 * 1024);
    expect(widened.refused).toBeNull();

    const narrowed = applyParameter(widened.build, 'cpu', 'l3Ways', 1);
    expect(narrowed.refused).not.toBeNull();
    expect(narrowed.build).toBe(widened.build);
  });

  it('recomputes the field derived from the one being edited', () => {
    const build = testBuild();

    const clocked = applyParameter(build, 'cpu', 'clockHz', 2e9);
    expect(configOf(clocked.build).cpu.serviceTimeNs).toBe(CYCLES_PER_ISSUE / (2e9 / 1e9));

    const regened = applyParameter(build, 'memory', 'generation', 'ddr3');
    expect(configOf(regened.build).memory.id).toBe('ddr3-3200-cl16');

    const reclocked = applyParameter(build, 'memory', 'casLatency', 20);
    expect(configOf(reclocked.build).memory.id).toBe('ddr4-3200-cl20');

    const respeed = applyParameter(build, 'memory', 'mtPerSecond', 2400);
    expect(configOf(respeed.build).memory.id).toBe('ddr4-2400-cl16');
  });

  it('simulates every extreme a descriptor admits', () => {
    const accesses = generateAccesses(streamingSpec({ accessCount: 2_000 }));
    for (const definition of partDefinitions()) {
      for (const parameter of definition.parameters) {
        for (const value of legalValues(parameter)) {
          const label = `${definition.id}.${parameter.id}`;
          const applied = applyParameter(testBuild(), definition.id, parameter.id, value);
          expect(applied.refused, label).toBeNull();

          // A zero rate would yield Infinity without throwing, so finiteness is
          // the assertion that matters, not merely "it did not throw".
          expect(Number.isFinite(simulate(configOf(applied.build), accesses).elapsedNs), label).toBe(true);
        }
      }
    }
  });

  it('rejects an unknown characteristic rather than guessing', () => {
    expect(() => applyParameter(testBuild(), 'cpu', 'gpuClockHz', 1e9)).toThrow();
  });
});
