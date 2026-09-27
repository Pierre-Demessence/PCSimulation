import type {
  Build,
  Parameter,
  ParameterEffect,
  PartDefinition,
  PartId,
  SlotId,
} from '@/data';
import { applyParameter, partDefinition, partDefinitions } from '@/data';
import { formatUnit } from '@/render/format';

import { configureRange, element, slot } from './dom';

export interface PartEditorHandlers {
  /** A characteristic was applied; the build is the new source of truth. */
  readonly onApply: (build: Build) => void;
  /** The selection moved. No value changed, so nothing needs re-simulating. */
  readonly onSelect: (part: PartId, characteristic: string) => void;
}

/** How a slot is named to a reader. The model's own key is not the UI's word. */
const GROUP_LABELS: Record<SlotId, string> = {
  cpu: 'Core',
  l1: 'L1 cache',
  l2: 'L2 cache',
  l3: 'L3 cache',
  memory: 'Memory',
  motherboard: 'Motherboard',
};

/** Say what reads the value, so a number nothing reads cannot look important. */
const EFFECT_WORDS: Record<ParameterEffect, string> = {
  'display-only': 'nothing reads this yet',
  'simulated': 'moves the numbers',
  'validated': 'checked against the board',
};

/** One `<optgroup>` per slot, so a CPU's caches read as sections of the CPU. */
function groupedOptions(definition: PartDefinition<unknown>): readonly Node[] {
  const groups = new Map<SlotId, HTMLOptGroupElement>();
  const nodes: Node[] = [];

  for (const parameter of definition.parameters) {
    let group = groups.get(parameter.group);
    if (group === undefined) {
      group = document.createElement('optgroup');
      group.label = GROUP_LABELS[parameter.group];
      groups.set(parameter.group, group);
      nodes.push(group);
    }
    group.append(new Option(parameter.label, parameter.id));
  }

  return nodes;
}

function checkedFlags(group: HTMLElement): readonly string[] {
  return [...group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    .filter(input => input.checked)
    .map(input => input.value);
}

function describeValue(parameter: Parameter<unknown>, value: unknown): string {
  if (parameter.unit !== undefined && typeof value === 'number')
    return formatUnit(value, parameter.unit);

  // A choice reads as its option label, so the readout and the control agree.
  if (Array.isArray(value))
    return value.map(item => optionLabel(parameter, String(item))).join(', ');
  if (typeof value === 'string')
    return optionLabel(parameter, value);
  return String(value);
}

function optionLabel(parameter: Parameter<unknown>, value: string): string {
  if (parameter.control !== 'choice' && parameter.control !== 'flags')
    return value;
  return parameter.options.find(option => option.value === value)?.label ?? value;
}

/**
 * One part, one characteristic, one control.
 *
 * The bench is built from the parameter registry, so "one characteristic at a
 * time" is a property of the structure rather than a promise: there is exactly
 * one control on screen, and it writes through `applyParameter`, which moves one
 * field. A part's slots are never listed as choices — a CPU's caches are
 * sections of its own list.
 */
export class PartEditor {
  /** The bench, for the Controls window. */
  readonly element: HTMLElement;

  private readonly handlers: PartEditorHandlers;
  private readonly partSelect = element('select', 'control');
  private readonly characteristicSelect = element('select', 'control');
  private readonly controlHost = element('div', 'editor-control');
  private readonly readoutValue = element('strong', 'editor-value');
  private readonly readoutEffect = element('span', 'editor-effect');
  private readonly readout = element('p', 'editor-readout');
  private readonly help = element('p', 'editor-help');
  private readonly refusal = element('p', 'warnings');

  private build: Build | null = null;
  private part: PartId = 'cpu';
  private characteristic = '';
  /** `part|parameter` of the mounted control, so a drag is never torn down. */
  private mounted = '';
  private controlNode: HTMLElement | null = null;

  constructor(handlers: PartEditorHandlers) {
    this.handlers = handlers;
    this.element = element('div', 'editor');
    this.buildDom();
  }

  /** Republishes the bench from the state. Cheap: the mounted control is reused. */
  update(build: Build, part: PartId, characteristic: string): void {
    const definition = partDefinition(part);
    const parameter = definition.parameters.find(candidate => candidate.id === characteristic)
      ?? definition.parameters[0];
    if (parameter === undefined)
      return;

    this.build = build;
    this.part = part;
    this.characteristic = parameter.id;
    this.partSelect.value = part;

    // The option list depends on the part alone, so changing a value never
    // rebuilds it — and so never closes a dropdown the reader has open.
    if (this.characteristicSelect.dataset.part !== part) {
      this.characteristicSelect.dataset.part = part;
      this.characteristicSelect.replaceChildren(...groupedOptions(definition));
    }
    this.characteristicSelect.value = parameter.id;

    const key = `${part}|${parameter.id}`;
    if (key !== this.mounted) {
      this.mounted = key;
      this.refusal.textContent = '';
      this.help.textContent = parameter.help;
      this.mountControl(parameter);
    }

    const value = definition.read(build.parts);
    this.setAbsent(value === null);
    if (value !== null)
      this.publishValue(parameter, value);
  }

  /**
   * A part this build does not have is shown as absent with its controls dead, so
   * the picker stays the only way a part appears — otherwise an edit would write
   * a part in through `applyParameter` and the build would assemble itself.
   */
  private setAbsent(absent: boolean): void {
    const node = this.controlNode;
    if (node !== null) {
      if (node instanceof HTMLInputElement || node instanceof HTMLSelectElement)
        node.disabled = absent;
      for (const field of node.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))
        field.disabled = absent;
    }

    if (absent) {
      this.readoutValue.textContent = 'Not in this build';
      this.readoutEffect.textContent = 'add the part with the Component picker';
      this.refusal.textContent = '';
    }
  }

  private buildDom(): void {
    for (const definition of partDefinitions())
      this.partSelect.append(new Option(definition.label, definition.id));

    this.partSelect.title
      = 'Which part is on the bench. The caches belong to the CPU, so they are sections of it rather than parts of their own.';
    this.characteristicSelect.title
      = 'Which characteristic of that part to vary. Every other value stays where it is.';

    this.readout.append(this.readoutValue, this.readoutEffect);
    this.readout.setAttribute('aria-live', 'polite');
    this.refusal.setAttribute('aria-live', 'polite');

    this.partSelect.addEventListener('change', () => {
      const part = this.partSelect.value as PartId;
      const first = partDefinition(part).parameters[0];
      if (first !== undefined)
        this.handlers.onSelect(part, first.id);
    });

    this.characteristicSelect.addEventListener('change', () =>
      this.handlers.onSelect(this.part, this.characteristicSelect.value));

    this.element.append(
      slot('Component', this.partSelect),
      slot('Characteristic', this.characteristicSelect),
      this.controlHost,
      this.readout,
      this.help,
      this.refusal,
    );
  }

  private mountControl(parameter: Parameter<unknown>): void {
    const node = this.createControl(parameter);
    this.controlNode = node;
    this.controlHost.replaceChildren(slot(parameter.label, node, undefined, 'bench'));
  }

  private createControl(parameter: Parameter<unknown>): HTMLElement {
    switch (parameter.control) {
      case 'range':
      case 'count': {
        const input = element('input', 'control');
        configureRange(input, parameter.min, parameter.max, parameter.step);
        input.title = parameter.help;
        input.addEventListener('input', () => this.apply(Number(input.value)));
        return input;
      }
      case 'choice': {
        const select = element('select', 'control');
        for (const option of parameter.options)
          select.append(new Option(option.label, option.value));
        select.title = parameter.help;
        select.addEventListener('change', () => this.apply(select.value));
        return select;
      }
      case 'flags': {
        const fieldset = element('div', 'flags');
        fieldset.title = parameter.help;
        for (const option of parameter.options) {
          const input = element('input', 'control');
          const caption = element('label', 'flag');
          input.type = 'checkbox';
          input.value = option.value;
          input.addEventListener('change', () => this.apply(checkedFlags(fieldset)));
          caption.append(input, element('span', '', option.label));
          fieldset.append(caption);
        }
        return fieldset;
      }
    }
  }

  /** Writes the descriptor's own value into the control, and the readout. */
  private publishValue(parameter: Parameter<unknown>, partValue: unknown): void {
    const value = parameter.get(partValue);
    const node = this.controlNode;

    if (node instanceof HTMLInputElement)
      node.value = String(value);

    if (node instanceof HTMLSelectElement)
      node.value = String(value);

    if (parameter.control === 'flags' && node !== null) {
      const chosen = new Set(Array.isArray(value) ? value.map(String) : []);
      for (const input of node.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
        input.checked = chosen.has(input.value);
    }

    this.readoutValue.textContent = `${parameter.label}: ${describeValue(parameter, value)}`;
    this.readoutEffect.textContent = EFFECT_WORDS[parameter.effect];
  }

  private apply(value: number | string | readonly string[]): void {
    const build = this.build;
    if (build === null)
      return;

    const applied = applyParameter(build, this.part, this.characteristic, value);
    const definition = partDefinition(this.part);

    if (applied.refused !== null) {
      // The state never saw the change, so put the control back on the last
      // valid value and name the invariant that stopped it.
      this.refusal.textContent = `Refused: ${applied.refused}`;
      const parameter = definition.parameters.find(candidate => candidate.id === this.characteristic);
      const current = definition.read(build.parts);
      if (parameter !== undefined && current !== null)
        this.publishValue(parameter, current);
      return;
    }

    this.refusal.textContent = '';
    this.handlers.onApply(applied.build);
  }
}
