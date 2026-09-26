# Codebase map

- `src/sim/` — the discrete-event simulation core. Pure TypeScript, no DOM.
  - `engine.ts` — the event loop, resource occupancy, miss handling.
  - `event-queue.ts` — time-ordered queue with stable tie-breaking.
  - `cache.ts` — set-associative LRU cache.
  - `memory.ts` — DIMM arithmetic: CAS latency, bandwidth, transfer time.
  - `types.ts` — specs, stats and result shapes.
  - `index.ts` — the public surface of the core.
- `src/workloads/` — seeded access-stream generation (`rng.ts`, `generate.ts`).
- `src/data/` — rig presets and the motherboard's compatibility rules.
- `src/main.ts` — entry point; currently a plain results readout.
- `index.html` — Vite HTML entry; `%APP_NAME%` is replaced from `brand.json`.
- `vite.config.ts` / `vitest.config.ts` — build and test config; both share the `@/` alias.
- `eslint.config.ts` — flat ESLint config.
- `docs/` — project documentation (start at [INDEX.md](INDEX.md)).

## Planned

See [roadmap.md](roadmap.md). Not yet written:

- `src/render/` — Canvas 2D flow visualizer.
- `src/ui/` — DOM/SVG panels, sliders, charts, tooltips.
- `src/worker/` — headless batch comparison off the main thread.

## Conventions

- Import from `@/…` instead of long relative paths.
- Keep `src/sim/` free of DOM and browser APIs so it can run in a worker.
- Co-locate tests with source as `<name>.test.ts`.
- Units are explicit in every name: `Ns`, `Bytes`, `BytesPerNs`, `MtPerSecond`.
- 2-space indent, single quotes, semicolons (enforced by ESLint).
