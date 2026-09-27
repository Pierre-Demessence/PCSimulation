# Roadmap

Living document: what is planned, in what order, and what is deliberately out
of scope. The current focus is the [build-sheet plan](plans/build-sheet.md) —
S2 to S4, on top of the v0.1 memory path (CPU + RAM + motherboard).

## Where we are

v0.1's simulation core and its presentation layer are built: the discrete-event
memory path, the workload profiles, the bottleneck classifier, and the build
sheet that reports a build in words. Lint, tests and build are green. See the
[v0.1 plan](plans/pc-simulation.md).

The visualisation face draws the machine as a picture: the 3D model, or the same
machine seen flat. See the [board view plan](plans/done/board-view.md).

## Presentation waves

The visualisation is a picture of the machine, not a table of numbers. Each wave
makes the picture truer to the object and easier to read.

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

## Build editor wave

The project is becoming a build tool as well as a picture of a machine. Instead of
editing the fixed parts of the memory path, the reader assembles a build: each
part is "Not added" until it is added, and today every part is entered by hand.
A catalogue of real parts is the mechanism that replaces typing the numbers —
see [component customization](plans/component-customization.md), whose W2 owns
it. The tool answers two separate questions:

- **Does this work at all?** Compatibility: memory generation and DIMM count
  today, with the socket, lane and wattage budgets arriving with S2–S4.
- **What limits it?** The bottleneck, which the simulation already classifies.

Those are different axes. The board's caps warn and the run proceeds
(`src/data/compat.ts`); the sheet states each rule as met or not met and never
blocks the run, because a DIMM outside the board's spec is the lesson.

S1 of [the build-sheet plan](plans/build-sheet.md) ships the assembly, the
limits and the first verdict — `Build` as a partial core, the part picker,
`buildLimits` and `buildChecks`, and the sheet over the memory path. Its wave
table carries S2–S4: the parts the model does not reach (GPU facts, the PCIe lane
budget), storage (interface ceilings, M.2 and SATA topology, lane splitting), and
power (connectors and a wattage budget). Two things the plan deliberately does
not do, and that stay deferred here:

- **Multiplicity.** A `Build` carries one part per kind, exactly as
  `HardwareConfig` does, so four DIMM *modules*, two drives and a card beside the
  GPU are not expressible; the channel count stands in for the stick count, as it
  does today.
- **A per-instance identity.** The split between a user-facing part and a simulated
  slot already exists (`BoardPart.id`/`kind` against `levelId`,
  `src/board/layout.ts@23-116`); multiplicity would need an identity above the
  part, which neither plan adds.

### Deferred within the build editor wave

- Several parts of one kind — four DIMM modules, two drives — which needs the
  per-instance identity above the part, not just a picker.
- Per-DIMM simulation: a DIMM's own rank and bank timing, rather than one memory
  level with a `channels` count. Multiplicity makes it visible; it does not make it
  trivial.
- Case, cooler and fan parts with the physical fit rules they carry (card length,
  radiator size). The first cut of the build editor is electrical and logical, not
  spatial.
- Importing a build from pasted part names.

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

## Recorded as static rules

Both are true from a build's parts alone, so they need no simulation: when their
waves arrive the sheet states each as a limit or a check, and no run demonstrates
it. The v0.2 GPU and v0.3 storage simulations remain deferred.

- PCIe lane splitting: filling M.2 slots drops the GPU to ×8.
- Chipset uplink (DMI) saturation when many chipset devices are active.

## Deferred within component customization

- Sharing a build as a URL, so a build can be linked rather than described. See
  [plans/component-customization.md](plans/component-customization.md).
- Component templates for GPU, storage and PSU parts, which arrive with their
  own waves above.
- Several parts of one kind, and the compatibility verdict that needs — the
  assembly is the build editor wave above; multiplicity stays deferred there.

## Deferred presentation work

- Clicking a part in the 3D model to isolate it, dimming everything else.
- Labels crowd each other when two parts sit close together in the collapsed
  view; the 3D model has no de-confliction yet.
- Loading three.js lazily, so the first paint does not wait for the whole 3D
  engine. The production bundle is about 157 kB gzipped, nearly all of it three.
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
