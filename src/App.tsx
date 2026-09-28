export function App() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">PC Build Analyzer</h1>
          <span className="font-mono text-xs text-muted-foreground">v0.2</span>
        </div>
      </header>
      <main className="grid flex-1 gap-px bg-border md:grid-cols-[minmax(22rem,2fr)_3fr]">
        <section aria-label="Build" className="bg-background p-6">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Build</h2>
          <p className="text-sm text-muted-foreground">The build list goes here.</p>
        </section>
        <section aria-label="Analysis" className="bg-background p-6">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Analysis</h2>
          <p className="text-sm text-muted-foreground">The verdict and tabs go here.</p>
        </section>
      </main>
    </div>
  );
}
