import type { Build, Parameter, ParameterValue, PartId } from '@/data';

import { useState } from 'react';

import { applyParameter, partDefinition } from '@/data';

import { ParameterField } from './ParameterField';

function groupLabel(group: string): string {
  switch (group) {
    case 'cpu':
      return 'Core';
    case 'l1':
      return 'L1 cache';
    case 'l2':
      return 'L2 cache';
    case 'l3':
      return 'L3 cache';
    case 'memory':
      return 'Memory';
    case 'motherboard':
      return 'Motherboard';
    case 'gpu':
      return 'Graphics card';
    case 'psu':
      return 'Power supply';
    case 'storage':
      return 'Storage';
    case 'cooler':
      return 'CPU cooler';
    case 'case':
      return 'Case';
    default:
      return group;
  }
}

interface ParameterGroup {
  readonly group: string;
  readonly parameters: Parameter<unknown>[];
}

/** Groups a part's descriptors by the slot they belong to, in first-seen order. */
function groupParameters(parameters: readonly Parameter<unknown>[]): readonly ParameterGroup[] {
  const groups: ParameterGroup[] = [];
  for (const parameter of parameters) {
    let entry = groups.find(candidate => candidate.group === parameter.group);
    if (entry === undefined) {
      entry = { group: parameter.group, parameters: [] };
      groups.push(entry);
    }
    entry.parameters.push(parameter);
  }
  return groups;
}

export function PartEditor({
  build,
  part,
  onChange,
}: {
  readonly build: Build;
  readonly part: PartId;
  readonly onChange: (build: Build) => void;
}) {
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const definition = partDefinition(part);
  const partValue = definition.read(build);
  if (partValue === null)
    return null;

  const apply = (parameterId: string, value: ParameterValue): void => {
    const result = applyParameter(build, part, parameterId, value);
    if (result.refused !== null) {
      const reason = result.refused;
      setRefusals(current => ({ ...current, [parameterId]: reason }));
      return;
    }
    setRefusals((current) => {
      if (current[parameterId] === undefined)
        return current;
      const next = { ...current };
      delete next[parameterId];
      return next;
    });
    onChange(result.build);
  };

  const groups = groupParameters(definition.parameters);

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ group, parameters }) => (
        <fieldset key={group} className="flex flex-col gap-3">
          {groups.length > 1 && (
            <legend className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {groupLabel(group)}
            </legend>
          )}
          {parameters.map(parameter => (
            <ParameterField
              key={parameter.id}
              parameter={parameter}
              part={partValue}
              refusal={refusals[parameter.id]}
              onChange={value => apply(parameter.id, value)}
            />
          ))}
        </fieldset>
      ))}
    </div>
  );
}
