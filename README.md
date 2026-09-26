# PC Simulation

An educational sandbox that simulates a PC's hardware data path — CPU, caches
and memory — and shows *why* one set of parts performs differently from
another. It is deliberately not an emulator: no instructions, no OS, no
software running on top.

The whole point is one loop: run a workload, find the saturated link, swap a
part, and watch the bottleneck move somewhere else.

## What it already shows

The same 200,000-access workload on three rigs that differ only in memory:

| Rig | Streaming | Random (pointer chase) |
| --- | --- | --- |
| 2012 · DDR3-1600 CL9 | 500 µs @ 25.6 GB/s | 18,669 µs |
| 2019 · DDR4-3200 CL16 | 250 µs @ 51.2 GB/s | 18,180 µs |
| 2024 · DDR5-5600 CL36 | 143 µs @ 89.5 GB/s | 18,634 µs |

Streaming scales with bandwidth: DDR5 finishes 3.5× faster than DDR3. The
pointer chase ignores bandwidth completely — all three generations land within
3% of each other, and the limiter is the dependency chain rather than any
part. The very same DDR5 DIMM delivers 89.5 GB/s or 0.7 GB/s depending only on
the access pattern.

## Getting started

```sh
npm install
npm run dev
```

## Scripts

| Script                  | Description                           |
| ----------------------- | ------------------------------------- |
| `npm run dev`           | Start the Vite dev server.            |
| `npm run build`         | Type-check, then build for production.|
| `npm run preview`       | Preview the production build.         |
| `npm run lint`          | Lint with ESLint.                     |
| `npm run lint:fix`      | Lint and auto-fix.                    |
| `npm test`              | Run Vitest once.                      |
| `npm run test:watch`    | Run Vitest in watch mode.             |
| `npm run test:coverage` | Run Vitest with coverage.             |

See [docs/INDEX.md](docs/INDEX.md) for project documentation.
