import type { Check } from '@/data';
import type { BuildSheet, RenderedLimit } from '@/sheet';
import type { WorkloadKind } from '@/workloads';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const WORKLOADS: readonly { readonly value: WorkloadKind; readonly label: string }[] = [
  { value: 'streaming', label: 'Streaming' },
  { value: 'random', label: 'Random' },
  { value: 'mixed', label: 'Mixed' },
];

interface Summary {
  readonly glyph: string;
  readonly word: string;
  readonly tone: 'bad' | 'good' | 'muted' | 'warn';
}

const TONE_CLASS: Record<Summary['tone'], string> = {
  bad: 'text-destructive',
  good: 'text-foreground',
  muted: 'text-muted-foreground',
  warn: 'text-amber-500',
};

const BORDER_TONE: Record<Summary['tone'], string> = {
  bad: 'border-l-destructive',
  good: 'border-l-emerald-500',
  muted: 'border-l-border',
  warn: 'border-l-amber-500',
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function compatibilitySummary(checks: readonly Check[]): Summary {
  if (checks.length === 0)
    return { glyph: '·', word: 'Nothing to check yet', tone: 'muted' };
  const notMet = checks.filter(check => !check.met);
  const incompatible = notMet.filter(check => check.severity === 'incompatible').length;
  const warnings = notMet.length - incompatible;
  if (incompatible > 0)
    return { glyph: '✘', word: `Not compatible — ${plural(incompatible, 'issue')}`, tone: 'bad' };
  if (warnings > 0)
    return { glyph: '⚠', word: `Compatible, ${plural(warnings, 'warning')}`, tone: 'warn' };
  return { glyph: '✓', word: 'Compatible', tone: 'good' };
}

function checkState(check: Check): Summary {
  if (check.met)
    return { glyph: '✓', word: 'met', tone: 'good' };
  return check.severity === 'incompatible'
    ? { glyph: '✘', word: 'not compatible', tone: 'bad' }
    : { glyph: '⚠', word: 'out of spec', tone: 'warn' };
}

/** Failures first (incompatible, then warnings), then the met rows, keeping model order within each. */
function orderChecks(checks: readonly Check[]): readonly Check[] {
  const rank = (check: Check): number => {
    if (check.met)
      return 2;
    return check.severity === 'incompatible' ? 0 : 1;
  };
  return [...checks].sort((left, right) => rank(left) - rank(right));
}

function CheckRow({ check }: { readonly check: Check }) {
  const state = checkState(check);
  return (
    <li className="flex gap-2 py-1.5">
      <span className={`font-mono text-sm ${TONE_CLASS[state.tone]}`} aria-hidden>{state.glyph}</span>
      <span className="text-sm">
        <span className={`font-medium ${TONE_CLASS[state.tone]}`}>{state.word}</span>
        {' — '}
        {check.met ? check.statement : check.rule}
      </span>
    </li>
  );
}

function LimitRow({ limit }: { readonly limit: RenderedLimit }) {
  return (
    <li className="flex flex-col gap-0.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{limit.label}</span>
        <span className="flex items-center gap-2">
          {limit.binding && <Badge variant="outline" className="text-[10px]">binding</Badge>}
          <span className="font-mono text-sm">{limit.value}</span>
        </span>
      </div>
      <span className="font-mono text-xs text-muted-foreground">{limit.expression}</span>
      {limit.note !== null && <span className="text-xs text-amber-500">{limit.note}</span>}
    </li>
  );
}

function empty(message: string) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

export function AnalysisPanel({
  sheet,
  workload,
  onWorkloadChange,
}: {
  readonly sheet: BuildSheet;
  readonly workload: WorkloadKind;
  readonly onWorkloadChange: (workload: WorkloadKind) => void;
}) {
  const summary = compatibilitySummary(sheet.checks);
  const checks = orderChecks(sheet.checks);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Analysis</h2>
        <ToggleGroup
          type="single"
          size="sm"
          value={workload}
          onValueChange={value => value && onWorkloadChange(value as WorkloadKind)}
          variant="outline"
        >
          {WORKLOADS.map(option => (
            <ToggleGroupItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className={`rounded-lg border border-l-4 p-4 ${BORDER_TONE[summary.tone]}`}>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-base ${TONE_CLASS[summary.tone]}`} aria-hidden>{summary.glyph}</span>
          <span className={`text-sm font-medium ${TONE_CLASS[summary.tone]}`}>{summary.word}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{sheet.verdict}</p>
      </div>

      <Tabs defaultValue="compatibility">
        <TabsList>
          <TabsTrigger value="compatibility">Compatibility</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="parts">Parts</TabsTrigger>
        </TabsList>

        <TabsContent value="compatibility" className="pt-2">
          {checks.length === 0
            ? empty('Add a CPU, memory and a motherboard to check compatibility.')
            : <ul className="divide-y">{checks.map(check => <CheckRow key={check.id} check={check} />)}</ul>}
        </TabsContent>

        <TabsContent value="performance" className="flex flex-col gap-4 pt-2">
          {sheet.measured.length === 0
            ? empty('Add the CPU, memory and motherboard to run the simulation.')
            : (
                <>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {sheet.measured.map(figure => (
                      <div key={figure.label} className="flex flex-col" title={figure.note}>
                        <dt className="text-xs text-muted-foreground">{figure.label}</dt>
                        <dd className="font-mono text-sm">{figure.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {sheet.ceilings.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Ceilings</h3>
                      <ul className="divide-y">{sheet.ceilings.map(limit => <LimitRow key={limit.id} limit={limit} />)}</ul>
                    </div>
                  )}
                  {sheet.floors.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Floors</h3>
                      <ul className="divide-y">{sheet.floors.map(limit => <LimitRow key={limit.id} limit={limit} />)}</ul>
                    </div>
                  )}
                </>
              )}
        </TabsContent>

        <TabsContent value="parts" className="flex flex-col gap-4 pt-2">
          {sheet.parts.length === 0
            ? empty('No parts added yet.')
            : sheet.parts.map(section => (
                <div key={section.part}>
                  <h3 className="mb-1 text-sm font-medium">
                    {section.title}
                    {section.origin !== null && (
                      <span className="ml-2 font-normal text-muted-foreground">{section.origin}</span>
                    )}
                  </h3>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                    {section.rows.map(row => (
                      <div key={row.id} className="col-span-2 grid grid-cols-subgrid" title={row.help}>
                        <dt className="text-sm text-muted-foreground">{row.label}</dt>
                        <dd className="text-right font-mono text-sm">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
          {sheet.unmodeled.length > 0 && (
            <div>
              <Separator className="my-2" />
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Not part of this build yet
              </h3>
              <ul className="flex flex-col gap-2">
                {sheet.unmodeled.map(section => (
                  <li key={section.id} className="text-sm text-muted-foreground">{section.title}</li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
