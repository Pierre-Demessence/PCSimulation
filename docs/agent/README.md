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
- `src/data/parameters.ts` — every part's `read`/`write` is typed over a
  `Partial<HardwareConfig>`, so an absent part is expressible and `read` returns
  null for it.
- `src/data/presets.ts` — the shared constants every part is built from, and the
  core's in-flight miss budget.
- `src/sheet/` — DOM-free. The model owns every string, so add no help text and
  no formatter of your own here; `src/ui/sheet.ts` owns only the elements.
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
- **A build is never completed for the reader.** Nothing is filled in that the
  user did not add: a missing part stays missing, `simulate` is reached only
  through `completeBuild`, and the sheet says what to add rather than inventing a
  part.
- **The core stays DOM-free** so it can move into a Web Worker unchanged.
- Run the static pipeline (lint + test + build) before considering work done.
