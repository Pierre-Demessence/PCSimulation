# Agent operational notes

Concise instructions for AI agents working in this repository.

## Commands

- Dev server: `npm run dev`
- Build: `npm run build` (runs `tsc --noEmit` then `vite build`)
- Lint: `npm run lint` / `npm run lint:fix`
- Test: `npm test` / `npm run test:watch`

## Key paths

- `src/sim/` — the simulation core. Never import DOM or browser APIs here.
- `src/workloads/` — seeded access generators. Determinism is load-bearing.
- `src/data/presets.ts` — rig presets and the core's in-flight miss budget.
- `docs/plans/` — the active feature plan.

## Invariants

- **Units are explicit.** Time is nanoseconds, size is bytes, and rate is bytes
  per nanosecond (numerically GB/s). Never introduce a bare `number` rate.
- **Latency is not occupancy.** A level's `hitTimeNs` delays a request; its
  `bytesPerNs` is what consumes the resource. Charging latency as occupancy
  pushes utilisation past 100% and makes the bottleneck rule meaningless.
- **Every level is a serial server**, reserved on a free-time cursor. Never
  accumulate busy time in parallel.
- **Determinism.** A fixed seed must produce the identical access stream and
  the identical result; equal timestamps in the event queue break by insertion
  order.
- **The core stays DOM-free** so it can move into a Web Worker unchanged.
- Run the static pipeline (lint + test + build) before considering work done.
