import type { Check } from '@/data';
import type { BuildSheet, PartSection, RenderedLimit, UnmodeledSection } from '@/sheet';

import { element } from './dom';

/** Say what reads a characteristic, in the same words the bench uses. */
const EFFECT_WORDS = {
  'display-only': 'nothing reads this yet',
  'simulated': 'moves the numbers',
  'validated': 'checked against the board',
} as const;

/** The model names a part by its id; the sheet spells it the way a reader says it. */
const PART_WORDS = {
  cpu: 'CPU',
  memory: 'Memory',
  motherboard: 'Motherboard',
} as const;

function block(className: string, heading: string): HTMLElement {
  const node = element('section', `sheet-block ${className}`);
  node.append(element('h2', 'sheet-block-title', heading));
  return node;
}

/** A definition-list-style row: what it is, what it reads, and why. */
function dataRow(label: string, value: string, note?: null | string): HTMLElement {
  const row = element('div', 'sheet-row');
  row.append(
    element('span', 'sheet-row-label', label),
    element('span', 'sheet-row-value', value),
  );
  if (note !== undefined && note !== null)
    row.append(element('span', 'sheet-row-note', note));
  return row;
}

function limitRow(limit: RenderedLimit): HTMLElement {
  const row = element('div', `sheet-limit${limit.binding ? ' limit-is-binding' : ''}`);
  row.append(
    element('span', 'limit-label', limit.label),
    element('span', 'limit-value', limit.value),
  );
  // A binding limit says so in a word; a limit that is merely alone in its unit
  // gets no claim at all, because the model made none.
  if (limit.binding)
    row.append(element('span', 'limit-binding', 'binding'));

  const arithmetic = element('div', 'limit-arithmetic');
  arithmetic.append(element('div', 'limit-expression', limit.expression));
  for (const working of limit.workings)
    arithmetic.append(element('div', 'limit-working', working));
  if (limit.note !== null)
    arithmetic.append(element('div', 'limit-note', limit.note));
  row.append(arithmetic);
  return row;
}

function checkRow(check: Check): HTMLElement {
  const row = element('div', `sheet-check ${check.met ? 'check-met' : 'check-not-met'}`);
  row.append(
    element('span', 'check-glyph', check.met ? '✓' : '✘'),
    element('span', 'check-state', check.met ? 'met' : 'not met'),
    element('span', 'check-statement', check.statement),
    element('span', 'check-rule', check.rule),
  );
  return row;
}

function partBlock(section: PartSection): HTMLElement {
  const node = element('section', `sheet-part part-${section.part}`);
  node.append(element('h3', 'part-title', section.title));
  node.append(element('p', 'part-origin', section.origin ?? 'entered by hand'));

  for (const characteristic of section.rows) {
    const row = dataRow(characteristic.label, characteristic.value);
    row.title = characteristic.help;
    row.append(element('span', 'row-effect', EFFECT_WORDS[characteristic.effect]));
    node.append(row);
  }
  return node;
}

function unmodeledBlock(section: UnmodeledSection): HTMLElement {
  const node = element('section', `sheet-unmodeled-part unmodeled-${section.id}`);
  node.append(element('h3', 'unmodeled-title', section.title));
  for (const fact of section.facts)
    node.append(dataRow(fact.label, fact.value, fact.note));
  return node;
}

export class SheetView {
  private readonly sheetDocument: HTMLElement;

  /** The sidebar the machine's build-level controls are adopted into. */
  readonly sidebar: HTMLElement;

  constructor(host: HTMLElement) {
    const layout = element('div', 'sheet-layout');
    this.sidebar = element('aside', 'sheet-sidebar');
    this.sheetDocument = element('article', 'sheet-document');
    layout.append(this.sidebar, this.sheetDocument);

    host.append(layout);
  }

  update(sheet: BuildSheet): void {
    const nodes: Node[] = [];

    const head = element('section', 'sheet-block sheet-head');
    head.append(
      element('h2', 'sheet-title', sheet.title),
      element('p', 'sheet-verdict', sheet.verdict),
    );
    nodes.push(head);

    // A block with nothing to say is omitted rather than left as a bare heading.
    if (sheet.measured.length > 0) {
      const run = block('sheet-run', 'THIS RUN');
      for (const figure of sheet.measured)
        run.append(dataRow(figure.label, figure.value, figure.note));
      nodes.push(run);
    }

    if (sheet.ceilings.length > 0) {
      const ceilings = block('sheet-ceilings', 'CEILINGS');
      for (const limit of sheet.ceilings)
        ceilings.append(limitRow(limit));
      nodes.push(ceilings);
    }

    if (sheet.floors.length > 0) {
      const floors = block('sheet-floors', 'FLOORS');
      for (const limit of sheet.floors)
        floors.append(limitRow(limit));
      nodes.push(floors);
    }

    if (sheet.checks.length > 0) {
      const checks = block('sheet-checks', 'CHECKS');
      for (const check of sheet.checks)
        checks.append(checkRow(check));
      nodes.push(checks);
    }

    if (sheet.parts.length > 0) {
      const parts = block('sheet-parts', 'PARTS');
      for (const section of sheet.parts)
        parts.append(partBlock(section));
      nodes.push(parts);
    }

    if (sheet.unmodeled.length > 0) {
      const unmodeled = block('sheet-unmodeled', 'NOT PART OF THIS BUILD YET');
      for (const section of sheet.unmodeled)
        unmodeled.append(unmodeledBlock(section));
      nodes.push(unmodeled);
    }

    if (sheet.missing.length > 0) {
      const missing = block('sheet-missing', 'MISSING');
      const list = element('ul', 'missing-list');
      for (const part of sheet.missing)
        list.append(element('li', 'missing-part', PART_WORDS[part]));
      missing.append(list);
      nodes.push(missing);
    }

    this.sheetDocument.replaceChildren(...nodes);
  }
}
