import type { Build, PartId } from '@/data';
import type { SimResult } from '@/sim';

import type { WorkloadKind, WorkloadSpec } from '@/workloads';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { completeBuild, emptyBuild } from '@/data';
import { buildSheet } from '@/sheet';
import { simulate } from '@/sim';

import { generateAccesses, mixedSpec, randomSpec, streamingSpec } from '@/workloads';
import { AnalysisPanel } from './components/AnalysisPanel';
import { BuildPanel } from './components/BuildPanel';

import { partStatuses } from './components/partInfo';

/** Kept small so the debounced run stays responsive on the main thread. */
const ACCESS_COUNT = 50_000;

/** Milliseconds of idle after the last edit before the simulation re-runs. */
const REBUILD_DEBOUNCE_MS = 150;

function workloadSpec(kind: WorkloadKind): WorkloadSpec {
  const base = { accessCount: ACCESS_COUNT };
  if (kind === 'random')
    return randomSpec(base);
  if (kind === 'mixed')
    return mixedSpec(base);
  return streamingSpec(base);
}

export function App() {
  const [build, setBuild] = useState(() => emptyBuild());
  const [origin, setOrigin] = useState<Partial<Record<PartId, string>>>({});
  const [workload, setWorkload] = useState<WorkloadKind>('streaming');
  const [result, setResult] = useState<SimResult | null>(null);

  // A catalogue pick records where the part came from; any hand edit, add or
  // remove clears it, because the part is no longer that exact catalogue entry.
  const onPartChange = useCallback((part: PartId, next: Build, from: string | null) => {
    setBuild(next);
    setOrigin((current) => {
      const updated = { ...current };
      if (from === null)
        delete updated[part];
      else
        updated[part] = from;
      return updated;
    });
  }, []);

  // The compatibility checks update instantly; the run is debounced, because a
  // full simulation is too slow to do on every keystroke. The set happens only
  // inside the timer, so an incomplete build clears the result on the next tick.
  useEffect(() => {
    const config = completeBuild(build);
    const timer = setTimeout(() => {
      setResult(config === null ? null : simulate(config, generateAccesses(workloadSpec(workload))));
    }, config === null ? 0 : REBUILD_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [build, workload]);

  const sheet = useMemo(
    () => buildSheet({ build, origin, result, workload }),
    [build, origin, workload, result],
  );
  const statuses = useMemo(() => partStatuses(sheet.checks), [sheet.checks]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">PC Build Analyzer</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Assemble a build; see what fits and what limits it.
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">v0.2</span>
      </header>
      <main className="grid min-h-0 flex-1 gap-px bg-border md:grid-cols-[minmax(24rem,2fr)_3fr]">
        <section aria-label="Build" className="overflow-auto bg-background p-6">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Build</h2>
          <BuildPanel build={build} statuses={statuses} onPartChange={onPartChange} />
        </section>
        <section aria-label="Analysis" className="overflow-auto bg-background p-6">
          <AnalysisPanel sheet={sheet} workload={workload} onWorkloadChange={setWorkload} />
        </section>
      </main>
    </div>
  );
}
