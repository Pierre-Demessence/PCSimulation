# Roadmap

Living document: what is planned, in what order, and what is deliberately out
of scope. The current focus is the [v0.1 plan](plans/pc-simulation.md) —
memory path only (CPU + RAM + motherboard).

## Where we are

v0.1's simulation core and its presentation layer are built: the discrete-event
memory path, the workload profiles, the rig presets, the bottleneck classifier,
and the animated data-path view with its isolating controls. Lint, tests and
build are green. See the [v0.1 plan](plans/pc-simulation.md).

The machine is also drawn as a picture now, and as an object: the 3D model is
the default view, with the flat board and the swimlane beside it. See the
[board view plan](plans/done/board-view.md).

## Presentation waves

The view is a picture of the machine, not a table of numbers. Each wave makes the
picture truer to the object and easier to read.

| Wave | Adds | Status |
| --- | --- | --- |
| P1 | Flat block diagram: parts in their board positions, traces, animated traffic and the Explode control | shipped |
| P2 | The same model in 3D, with orbit, pan and zoom, and each part at its own height | shipped |
| P3 | Explode in 3D: the parts lift off the board and the traces follow them, so the wiring surfaces | shipped |
| P4 | Plausible ATX placement, a silhouette detail per kind of part, and contact shadows | shipped |

## Component waves

Each wave adds parts plus the workloads that stress them. A wave is not done
until it can demonstrate a bottleneck *migrating* as a part is swapped.

| Wave | Adds | Why it earns its place |
| --- | --- | --- |
| v0.2 | GPU + display link | Pure arithmetic, most striking demo: resolution × refresh × bits exceeds the cable rate (8K at 244 Hz ≈ 194 Gbit/s payload, ≈ 233 Gbit/s with blanking, versus HDMI 2.1's 48 Gbit/s and DisplayPort 2.1's 80 Gbit/s). Also shows a *second, independent* limit — the GPU's render rate. |
| v0.3 | Storage (HDD / SATA SSD / NVMe) | Contrasts bandwidth-bound loads (game level streaming: SATA ~550 MB/s vs NVMe ~7 GB/s) against latency-bound ones (OS boot: HDD seek ~8 ms vs NVMe ~20–50 µs). Same lesson as RAM, and far larger in magnitude (HDD seek ~8 ms vs a full DRAM access of ~100 ns — nearly 5 orders of magnitude). |
| v0.4 | PSU + thermals | Introduces budgets and a feedback loop: power → heat → thermal cap → lower boost clock → lower compute rate. Also teaches a *negative* lesson — a bigger PSU makes nothing faster. |

## Deferred within the memory wave

Recorded here so they are not lost when the v0.1 plan is archived.

- Multi-core contention on the memory controller.
- Cache coherence across cores.
- DRAM banks, row buffers and refresh as optional advanced toggles.
- Hardware prefetchers (a toggle, off by default), and true per-level MSHRs
  instead of v0.1's generous outstanding-miss limits.
- Out-of-order issue, so independent accesses are not held behind a dependent
  one.
- Associativity and eviction policies richer than the v0.1 set-associative
  LRU model.
- Memory channel topology beyond the basic case: how slot population choices
  silently halve bandwidth — a high-value beginner demo.
- NUMA / dual-socket layouts.
- Full-system presets spanning CPU + GPU + storage, once all waves ship.

## Deferred within the GPU and storage waves

- PCIe lane splitting: filling M.2 slots drops the GPU to ×8 (v0.2).
- Chipset uplink (DMI) saturation when many chipset devices are active (v0.3).

## Deferred presentation work

- Clicking a part in the 3D model to isolate it, dimming everything else.
- Labels crowd each other when two parts sit close together in the collapsed
  view; the 3D model has no de-confliction yet.
- Loading three.js lazily, so the first paint does not wait for the whole 3D
  engine. The production bundle is about 157 kB gzipped, nearly all of it three.
- Narrow-canvas guards in the swimlane view: its header and its per-row figures
  are measured against nothing, so below roughly 480 px the title, the
  percentage and the BOTTLENECK tag can overlap. The two board views now trim
  every line to their canvas.
- The delta against the previous run in the readout.
- Headless batch comparison in a Web Worker, so a slider change never waits.
- Precomputing the per-frame labels instead of formatting them every frame.
- Per-level MSHRs and a real prefetcher, which would let the cache rows show
  contention for miss slots rather than a single generous limit.

## Non-goals

Stated as the current intended state, not as history.

- Full software emulation: no OS, no applications, no instruction execution.
  That path leads to a VM and is explicitly rejected.
- ISA or cycle-accurate microarchitecture simulation.
- Predicting real-world FPS or benchmark scores to any useful accuracy; the
  sandbox teaches the *shape* of a bottleneck, not absolute numbers.
- A first-person "inside the PC" experience. The machine is an object to orbit,
  never a place to stand.
- Online/multiplayer comparison or accounts.
- Depending on `@pierre/ecs` for the simulation core. Revisit only if
  thousands of in-flight requests are later animated as individual entities;
  then `render-canvas2d`, `stats` and `tick` become candidates.
