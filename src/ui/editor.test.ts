import type { Build, PartId } from '@/data';

import { describe, expect, it } from 'vitest';

import { testBuild } from '@/testing/build';

import { PartEditor } from './editor';

function baseBuild(): Build {
  return testBuild();
}

function bench(): {
  readonly applied: Build[];
  readonly editor: PartEditor;
  readonly selections: [PartId, string][];
} {
  const applied: Build[] = [];
  const selections: [PartId, string][] = [];
  const editor = new PartEditor({
    onApply: build => applied.push(build),
    onSelect: (part, characteristic) => selections.push([part, characteristic]),
  });
  return { applied, editor, selections };
}

function control(editor: PartEditor): HTMLInputElement {
  const found = editor.element.querySelector<HTMLInputElement>('.editor-control input');
  if (found === null)
    throw new Error('the bench mounted no control');
  return found;
}

function refusal(editor: PartEditor): string {
  return editor.element.querySelector('.warnings')?.textContent ?? '';
}

describe('part bench', () => {
  it('shows exactly one control, for the selected characteristic', () => {
    const { editor } = bench();

    for (const characteristic of ['clockHz', 'cores', 'l1Ways', 'l1HitTimeNs', 'l3CapacityBytes']) {
      editor.update(baseBuild(), 'cpu', characteristic);
      const mounted = editor.element.querySelectorAll('.editor-control input, .editor-control select');
      expect(mounted, characteristic).toHaveLength(1);
    }

    editor.update(baseBuild(), 'motherboard', 'allowedGenerations');
    const boxes = editor.element.querySelectorAll('.editor-control input[type="checkbox"]');
    expect(boxes.length).toBeGreaterThan(1);
  });

  it('lists parts, and shows a CPU\'s caches as sections of the CPU', () => {
    const { editor } = bench();
    editor.update(baseBuild(), 'cpu', 'l1Ways');

    const parts = editor.element.querySelector('select');
    expect([...(parts?.options ?? [])].map(option => option.value)).toEqual([
      'cpu',
      'memory',
      'motherboard',
    ]);

    const groups = [...editor.element.querySelectorAll('optgroup')].map(group => group.label);
    expect(groups).toEqual(['Core', 'L1 cache', 'L2 cache', 'L3 cache']);
  });

  it('applies one characteristic and leaves every other slot alone', () => {
    const { applied, editor } = bench();
    const build = baseBuild();
    editor.update(build, 'cpu', 'clockHz');

    const slider = control(editor);
    slider.value = '5000000000';
    slider.dispatchEvent(new Event('input'));

    expect(applied).toHaveLength(1);
    const next = applied[0];
    if (next === undefined)
      throw new Error('nothing was applied');
    expect(next.parts.cpu?.clockHz).toBe(5e9);
    expect(next.parts.cpu?.serviceTimeNs).toBe(0.2);
    expect(next.parts.caches).toBe(build.parts.caches);
    expect(next.parts.memory).toBe(build.parts.memory);
    expect(next.parts.motherboard).toBe(build.parts.motherboard);
  });

  it('reports a selection without moving a number', () => {
    const { applied, editor, selections } = bench();
    editor.update(baseBuild(), 'cpu', 'clockHz');

    const partSelect = editor.element.querySelector('select');
    if (partSelect === null)
      throw new Error('the bench has no component picker');
    partSelect.value = 'memory';
    partSelect.dispatchEvent(new Event('change'));

    expect(selections).toEqual([['memory', 'generation']]);
    expect(applied).toHaveLength(0);
  });

  it('refuses a change that would break the model, and restores the value', () => {
    const { applied, editor } = bench();

    editor.update(baseBuild(), 'cpu', 'l3CapacityBytes');
    const capacity = control(editor);
    capacity.value = '1024';
    capacity.dispatchEvent(new Event('input'));
    expect(applied).toHaveLength(1);

    const shrunk = applied[0];
    if (shrunk === undefined)
      throw new Error('nothing was applied');

    // 32 ways x 64 bytes needs 2 KiB, which a 1 KiB L3 cannot hold.
    editor.update(shrunk, 'cpu', 'l3Ways');
    const ways = control(editor);
    ways.value = '32';
    ways.dispatchEvent(new Event('input'));

    expect(applied).toHaveLength(1);
    expect(refusal(editor)).toContain('must hold at least one set');
    expect(control(editor).value).toBe('16');
  });

  it('says what reads a characteristic', () => {
    const { editor } = bench();

    editor.update(baseBuild(), 'cpu', 'cores');
    expect(editor.element.textContent).toContain('nothing reads this yet');

    editor.update(baseBuild(), 'memory', 'capacityBytes');
    expect(editor.element.textContent).toContain('nothing reads this yet');

    editor.update(baseBuild(), 'cpu', 'clockHz');
    expect(editor.element.textContent).toContain('moves the numbers');

    editor.update(baseBuild(), 'memory', 'generation');
    expect(editor.element.textContent).toContain('checked against the board');
  });

  it('reads a choice as its option label, not its raw value', () => {
    const { editor } = bench();
    editor.update(baseBuild(), 'memory', 'generation');
    expect(editor.element.textContent).toContain('Generation: DDR4');
  });
});
