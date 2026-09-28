import { useState } from 'react';

import { emptyBuild } from '@/data';

import { BuildPanel } from './components/BuildPanel';

export function App() {
  const [build, setBuild] = useState(() => emptyBuild());

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">PC Build Analyzer</h1>
          <span className="font-mono text-xs text-muted-foreground">v0.2</span>
        </div>
      </header>
      <main className="grid flex-1 gap-px bg-border md:grid-cols-[minmax(24rem,2fr)_3fr]">
        <section aria-label="Build" className="overflow-auto bg-background p-6">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Build</h2>
          <BuildPanel build={build} onChange={setBuild} />
        </section>
        <section aria-label="Analysis" className="bg-background p-6">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Analysis</h2>
          <p className="text-sm text-muted-foreground">The verdict and tabs arrive in U3.</p>
        </section>
      </main>
    </div>
  );
}
