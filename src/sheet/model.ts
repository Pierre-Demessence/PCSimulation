import type { Build, Check, Limit, Parameter, ParameterEffect, PartId } from '@/data';
import type { LevelId, SimResult } from '@/sim';
import type { WorkloadKind } from '@/workloads';

import { boardLayout } from '@/board';
import { buildChecks, buildLimits, completeBuild, missingParts, partDefinition, partDefinitions, toConfigParts } from '@/data';
import {
  formatBandwidth,
  formatCount,
  formatDuration,
  formatPercent,
  formatUnit,
  levelLabel,
} from '@/render/format';

export interface CharacteristicRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly effect: ParameterEffect;
  readonly help: string;
}

export interface PartSection {
  readonly part: PartId;
  readonly title: string;
  /** The catalogue entry it came from, or null when it was entered by hand. */
  readonly origin: string | null;
  readonly rows: readonly CharacteristicRow[];
}

export interface RenderedLimit {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly expression: string;
  readonly workings: readonly string[];
  readonly binding: boolean;
  readonly note: string | null;
}

export interface UnmodeledSection {
  readonly id: string;
  readonly title: string;
  readonly facts: readonly { readonly label: string; readonly value: string; readonly note: string }[];
}

export interface MeasuredFigure {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

export interface BuildSheet {
  readonly title: string;
  /** The verdict, or why there cannot be one yet. Never empty. */
  readonly verdict: string;
  readonly limiterId: LevelId | null;
  readonly missing: readonly PartId[];
  readonly measured: readonly MeasuredFigure[];
  readonly ceilings: readonly RenderedLimit[];
  readonly floors: readonly RenderedLimit[];
  readonly checks: readonly Check[];
  readonly parts: readonly PartSection[];
  readonly unmodeled: readonly UnmodeledSection[];
}

export interface BuildSheetInput {
  readonly build: Build;
  readonly origin: Partial<Record<PartId, string>>;
  readonly workload: WorkloadKind;
  /** Null while a part is missing, because no run exists. */
  readonly result: SimResult | null;
}

const UNMODELED_NOTE = 'The model does not reach this part, so it has no utilisation and no verdict.';

type DescriptorOptions = readonly { readonly label: string; readonly value: string }[];

/** `Memory` reads as `memory` in a sentence; an acronym like `CPU` keeps its case. */
function plainName(label: string): string {
  return label === label.toUpperCase() ? label : label.toLowerCase();
}

function listInProse(items: readonly string[]): string {
  if (items.length <= 1)
    return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function optionLabel(options: DescriptorOptions, value: string): string {
  return options.find(option => option.value === value)?.label ?? value;
}

/** The descriptor's current value in the reader's terms, never a raw number. */
function renderValue(parameter: Parameter<unknown>, part: unknown): string {
  switch (parameter.control) {
    case 'choice':
      return optionLabel(parameter.options, parameter.get(part));
    case 'flags':
      return parameter.get(part).map(value => optionLabel(parameter.options, value)).join(', ');
    default:
      return formatUnit(parameter.get(part), parameter.unit ?? 'count');
  }
}

function partSections(input: BuildSheetInput): readonly PartSection[] {
  const sections: PartSection[] = [];
  for (const definition of partDefinitions()) {
    const part = definition.read(input.build);
    if (part === null)
      continue;
    sections.push({
      origin: input.origin[definition.id] ?? null,
      part: definition.id,
      rows: definition.parameters.map(parameter => ({
        effect: parameter.effect,
        help: parameter.help,
        id: parameter.id,
        label: parameter.label,
        value: renderValue(parameter, part),
      })),
      title: definition.label,
    });
  }
  return sections;
}

function renderedLimit(limit: Limit): RenderedLimit {
  return {
    binding: limit.binding,
    expression: limit.expression,
    id: limit.id,
    label: limit.label,
    note: limit.notEnforcedBy ?? null,
    value: formatUnit(limit.value, limit.unit),
    workings: limit.inputs.map(input => `${input.source} = ${formatUnit(input.value, input.unit)}`),
  };
}

function missingVerdict(missing: readonly PartId[]): string {
  if (missing.length === 0)
    return 'This build is complete, but it has not been run yet.';
  const names = missing.map(part => `no ${plainName(partDefinition(part).label)}`);
  return `This build cannot run yet: it has ${listInProse(names)}.`;
}

function verdictFor(result: SimResult): string {
  if (result.classification === 'latency-bound')
    return 'Latency-bound — the dependency chain is the limiter, not any one part.';
  if (result.bottleneckId === null)
    return 'Resource-bound — a resource saturated, though the run did not name which one.';
  // One name for a level, shared with the readout cards, so the two cannot drift.
  return `Resource-bound — ${levelLabel(result.bottleneckId)} saturated.`;
}

/** The same wording the readout cards use, so the sheet and the cards agree. */
function measuredFigures(result: SimResult): readonly MeasuredFigure[] {
  return [
    {
      label: 'Time to finish',
      note: 'How long the whole workload took, in simulated time.',
      value: formatDuration(result.elapsedNs),
    },
    {
      label: 'Achieved bandwidth',
      note: 'Bytes actually fetched from memory divided by elapsed time. GB/s is the same number as bytes per nanosecond.',
      value: formatBandwidth(result.achievedBandwidthBytesPerNs),
    },
    {
      label: 'Mean access latency',
      note: 'Average time from issuing an access to its data arriving, including queueing.',
      value: formatDuration(result.meanLatencyNs),
    },
    {
      label: 'Core stall',
      note: 'How long the core spent stalled waiting on memory instead of issuing.',
      value: formatDuration(result.cpuStallNs),
    },
    {
      label: 'L1 hit rate',
      note: 'Share of accesses the L1 answered. A working set that fits in cache makes the core the limiter instead of memory.',
      value: formatPercent(result.hitRates.l1),
    },
    {
      label: 'Accesses completed',
      note: 'Every issued access completes; the simulation throws rather than report a partial run.',
      value: formatCount(result.accesses),
    },
  ];
}

function unmodeledSections(build: Build): readonly UnmodeledSection[] {
  const config = completeBuild(build);
  if (config === null)
    return [];
  return boardLayout(config).parts.filter(part => part.levelId === null).map(part => ({
    facts: [{ label: 'Simulated', note: UNMODELED_NOTE, value: 'No' }],
    id: part.id,
    title: part.label,
  }));
}

export function buildSheet(input: BuildSheetInput): BuildSheet {
  const { build, result, workload } = input;
  const parts = partSections(input);

  const ceilings: RenderedLimit[] = [];
  const floors: RenderedLimit[] = [];
  for (const limit of buildLimits(toConfigParts(build))) {
    (limit.kind === 'ceiling' ? ceilings : floors).push(renderedLimit(limit));
  }

  const missing = missingParts(build);
  const partCount = parts.length;

  return {
    ceilings,
    checks: buildChecks(toConfigParts(build)),
    floors,
    limiterId: result === null ? null : result.bottleneckId,
    measured: result === null ? [] : measuredFigures(result),
    missing,
    parts,
    title: `${workload} · ${partCount} ${partCount === 1 ? 'part' : 'parts'}`,
    // Both need a finished run: a part with no level has no utilisation to report,
    // and a run that has not happened has nothing to say about one.
    unmodeled: result === null ? [] : unmodeledSections(build),
    verdict: result === null ? missingVerdict(missing) : verdictFor(result),
  };
}
