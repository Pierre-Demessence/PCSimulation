import type { Check, Parameter, PartDefinition, PartId } from '@/data';

import { formatUnit } from '@/render/format';

export type PartStatus = 'bad' | 'warn';

function renderValue(parameter: Parameter<unknown>, part: unknown): string {
  switch (parameter.control) {
    case 'choice': {
      const value = parameter.get(part);
      return parameter.options.find(option => option.value === value)?.label ?? value;
    }
    case 'flags':
      return parameter
        .get(part)
        .map(value => parameter.options.find(option => option.value === value)?.label ?? value)
        .join(', ');
    default:
      return formatUnit(parameter.get(part), parameter.unit ?? 'count');
  }
}

/** The identifying characteristics shown on a collapsed row, per part kind. */
const SUMMARY_FIELDS: Partial<Record<PartId, readonly string[]>> = {
  cpu: ['socket', 'clockHz'],
  memory: ['generation', 'mtPerSecond', 'casLatency'],
  motherboard: ['socket', 'allowedGenerations', 'dimmSlots'],
};

/** A short headline for a collapsed part row. */
export function partSummary(definition: PartDefinition<unknown>, part: unknown): string {
  const ids = SUMMARY_FIELDS[definition.id];
  const chosen = ids === undefined
    ? definition.parameters.slice(0, 2)
    : ids
        .map(id => definition.parameters.find(parameter => parameter.id === id))
        .filter((parameter): parameter is Parameter<unknown> => parameter !== undefined);
  return chosen.map(parameter => renderValue(parameter, part)).join(' · ');
}

function partOfSource(source: string): PartId | null {
  const head = source.split('.')[0];
  if (head === 'cpu' || head === 'caches')
    return 'cpu';
  if (head === 'memory')
    return 'memory';
  if (head === 'motherboard')
    return 'motherboard';
  return null;
}

/** Marks each part named by a broken check, so a collapsed row can show its status. */
export function partStatuses(checks: readonly Check[]): Partial<Record<PartId, PartStatus>> {
  const result: Partial<Record<PartId, PartStatus>> = {};
  for (const check of checks) {
    if (check.met)
      continue;
    const status: PartStatus = check.severity === 'incompatible' ? 'bad' : 'warn';
    for (const source of check.sources) {
      const part = partOfSource(source);
      if (part === null)
        continue;
      if (status === 'bad')
        result[part] = 'bad';
      else if (result[part] === undefined)
        result[part] = 'warn';
    }
  }
  return result;
}
