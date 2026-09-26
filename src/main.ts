import type { SimResult } from '@/sim';
import type { WorkloadSpec } from '@/workloads';
import { RIG_PRESETS, validateConfiguration } from '@/data';
import { simulate } from '@/sim';
import { generateAccesses, randomSpec, streamingSpec } from '@/workloads';

const ACCESS_COUNT = 200_000;

interface WorkloadChoice {
  readonly title: string;
  readonly spec: WorkloadSpec;
}

const WORKLOADS: readonly WorkloadChoice[] = [
  { spec: streamingSpec({ accessCount: ACCESS_COUNT }), title: 'streaming (independent)' },
  { spec: randomSpec({ accessCount: ACCESS_COUNT }), title: 'random (dependent)' },
];

interface Measurement {
  readonly rig: string;
  readonly workload: string;
  readonly result: SimResult;
}

function measure(): Measurement[] {
  const rows: Measurement[] = [];
  for (const workload of WORKLOADS) {
    const accesses = generateAccesses(workload.spec);
    for (const preset of RIG_PRESETS)
      rows.push({ result: simulate(preset.config, accesses), rig: preset.title, workload: workload.title });
  }
  return rows;
}

function cell(text: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function limiterLabel(result: SimResult): string {
  if (result.classification === 'latency-bound')
    return 'latency-bound: dependency chain';
  return `resource-bound: ${result.bottleneckId ?? 'unknown'}`;
}

function render(rows: readonly Measurement[]): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app === null)
    return;

  const heading = document.createElement('h1');
  heading.textContent = 'PC Simulation — memory path';
  app.append(heading);

  const intro = document.createElement('p');
  intro.textContent = 'Same workload, three rigs. Streaming is limited by the memory channel; the dependent chase is not.';
  app.append(intro);

  const problems = RIG_PRESETS.flatMap(preset =>
    validateConfiguration(preset.config).map(problem => `${preset.title}: ${problem}`),
  );
  if (problems.length > 0) {
    const warning = document.createElement('p');
    warning.textContent = `Incompatible configuration — ${problems.join('; ')}`;
    app.append(warning);
  }

  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Rig', 'Workload', 'Elapsed (µs)', 'Bandwidth (GB/s)', 'Mean latency (ns)', 'Limiter'])
    headRow.append(cell(label));
  head.append(headRow);
  table.append(head);

  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.append(
      cell(row.rig),
      cell(row.workload),
      cell((row.result.elapsedNs / 1000).toFixed(1)),
      cell(row.result.achievedBandwidthBytesPerNs.toFixed(1)),
      cell(row.result.meanLatencyNs.toFixed(1)),
      cell(limiterLabel(row.result)),
    );
    body.append(tr);
  }
  table.append(body);
  app.append(table);
}

render(measure());
