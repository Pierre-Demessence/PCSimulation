import type { Check, Parameter, PartId } from '@/data';

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

/** A short headline for a collapsed part row: its first few characteristics. */
export function partSummary(parameters: readonly Parameter<unknown>[], part: unknown, count = 3): string {
  return parameters
    .slice(0, count)
    .map(parameter => renderValue(parameter, part))
    .join(' · ');
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
