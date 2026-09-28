import type { Parameter, ParameterEffect, ParameterValue } from '@/data';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const EFFECT_LABEL: Record<ParameterEffect, string> = {
  'display-only': '—',
  'simulated': 'sim',
  'validated': 'rule',
};

const EFFECT_HELP: Record<ParameterEffect, string> = {
  'display-only': 'Nothing reads this yet — it changes no result.',
  'simulated': 'Moves the simulated numbers.',
  'validated': 'A compatibility rule reads it.',
};

export function ParameterField({
  parameter,
  part,
  refusal,
  onChange,
}: {
  readonly parameter: Parameter<unknown>;
  readonly part: unknown;
  readonly refusal: string | undefined;
  readonly onChange: (value: ParameterValue) => void;
}) {
  const fieldId = `param-${parameter.id}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={fieldId} title={parameter.help} className="text-xs">
          {parameter.label}
        </Label>
        <Badge
          variant="outline"
          title={EFFECT_HELP[parameter.effect]}
          className="font-mono text-[10px] font-normal text-muted-foreground"
        >
          {EFFECT_LABEL[parameter.effect]}
        </Badge>
      </div>
      <Control fieldId={fieldId} parameter={parameter} part={part} onChange={onChange} />
      {refusal !== undefined && (
        <p className="text-xs text-destructive">
          Refused:
          {refusal}
        </p>
      )}
    </div>
  );
}

function Control({
  fieldId,
  parameter,
  part,
  onChange,
}: {
  readonly fieldId: string;
  readonly parameter: Parameter<unknown>;
  readonly part: unknown;
  readonly onChange: (value: ParameterValue) => void;
}) {
  switch (parameter.control) {
    case 'range':
    case 'count':
      return (
        <Input
          id={fieldId}
          type="number"
          className="font-mono"
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          value={parameter.get(part)}
          onChange={event => onChange(Number(event.target.value))}
        />
      );
    case 'choice':
      return (
        <Select value={parameter.get(part)} onValueChange={onChange}>
          <SelectTrigger id={fieldId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {parameter.options.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'flags': {
      const value = parameter.get(part);
      const selected = new Set(value);
      return (
        <div className="flex flex-wrap gap-3">
          {parameter.options.map((option) => {
            const flagId = `flag-${parameter.id}-${option.value}`;
            return (
              <label key={option.value} htmlFor={flagId} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  id={flagId}
                  checked={selected.has(option.value)}
                  onCheckedChange={(checked) => {
                    const next = new Set(value);
                    if (checked === true)
                      next.add(option.value);
                    else
                      next.delete(option.value);
                    onChange([...next]);
                  }}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      );
    }
  }
}
