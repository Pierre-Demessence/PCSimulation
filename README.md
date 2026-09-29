# PC Simulation

An educational sandbox that **analyses a PC build**: you assemble parts — or pick
real ones from a catalogue — and it tells you whether they fit and where the
build is bottlenecked. It is PCPartPicker's compatibility verdict plus the
data-transfer bottleneck PCPartPicker cannot show, over CPU, caches and memory.
It is deliberately not an emulator: no instructions, no OS, no software running
on top.

The loop it makes primary: assemble a build → the tool checks every part against
every other in plain language → and, when the memory path is complete, it runs
the workload and names the saturated link. Swap a part and both the verdict and
the bottleneck update.

## What it shows

A build is assembled part by part in the panel: a part is "Not added" until you
add it and fill in its values. This table is therefore three memory choices on
one machine, not three computers — the same 200,000-access workload runs on each:

| Memory | Streaming | Random (pointer chase) |
| --- | --- | --- |
| DDR3-1600 CL9 | 500 µs @ 25.6 GB/s | 18,669 µs |
| DDR4-3200 CL16 | 250 µs @ 51.2 GB/s | 18,180 µs |
| DDR5-5600 CL36 | 143 µs @ 89.5 GB/s | 18,634 µs |

Streaming scales with bandwidth: DDR5 finishes 3.5× faster than DDR3. The
pointer chase ignores bandwidth completely — all three generations land within
3% of each other, and the limiter is the dependency chain rather than any
part. The very same DDR5 DIMM delivers 89.5 GB/s or 0.7 GB/s depending only on
the access pattern.

## Two faces of the same build

The **build sheet** is the default face: a text document that lists every part
and its characteristics, derives the limits the parts impose on each other,
states the board's rules as met or not met, and reports what the run did. Its
controls sit in a sidebar beside it.

The **visualisation** draws the same machine. The **Model** picture is an object
you can orbit, pan and zoom — the CPU package with its three cache levels, the
memory sticks standing in their slots, the card and drive slots, and the traces
between them. Each part has its own height, so a DIMM stick does not look like
an M.2 slot. The **Board** picture is the same machine drawn flat, seen from
above.

One slider, **Explode**, pulls the parts apart. In the flat board they separate
until a cache buried inside the CPU package becomes a readable block; in the 3D
model they lift off the board and the traces follow them, so you can see what is
wired to what.

The readout cards report every number, each with a tooltip saying what it means
and what unit it is in. The build sheet states the same figures in prose, from
the same run.

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
