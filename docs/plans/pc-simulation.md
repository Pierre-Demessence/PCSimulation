# PC Simulation — hardware performance sandbox (v0.1)

An educational sandbox that simulates a PC's **hardware data path** — CPU,
caches, memory, buses — and shows *why* one set of parts performs differently
from another. It is not an emulator: no instructions, no OS, no software.

The product is one loop:

> Run a workload → find the saturated link → swap a part → watch the
> bottleneck move somewhere else.

Everything below serves that loop. RAM is only the first vertical slice; the
model is deliberately general so later parts (GPU, display, storage, PSU) are
content, not re-architecture. Deferred work lives in
[../roadmap.md](../roadmap.md), not here.

## Why this exists (the lesson)

Latency and bandwidth are independent, and almost everyone conflates them:

- **Latency** — how long one access takes (a single trip to the warehouse).
- **Bandwidth** — how many bytes arrive per second (how many trucks fit on
  the road).

RAM generations did not get faster at answering; they got wider.

| Stick | CAS latency (sticker) | Bandwidth (1 channel) |
| --- | --- | --- |
| DDR3-1600 CL9 | ~11.3 ns | 12.8 GB/s |
| DDR4-3200 CL16 | ~10.0 ns | 25.6 GB/s |
| DDR5-5600 CL36 | ~12.9 ns | 44.8 GB/s |

CAS latency from the sticker numbers: `latency_ns = CL × 2000 / MT_per_s`.
DDR signals twice per clock, so `cycle_time_ns = 2000 / MT_per_s` and
`latency_ns = CL × cycle_time_ns`.

That figure is only the CAS portion. A **complete** DRAM access as the core
sees it also pays controller, PHY and row-activation costs, totalling roughly
60–100 ns. The model applies that shared overhead equally to every generation,
so generation-to-generation comparisons are unaffected — but the absolute
number the simulation reports is the full access, not the CAS slice.

The headline lesson: **a bandwidth-bound workload scales with bandwidth, while
a latency-bound workload barely improves across generations — and can even
regress, because DDR5's higher per-access latency offsets its extra width.**
If the UI can make that flip visible in ten seconds, the project works.

## What it is / is not

- **Is** a discrete-event simulation of throughput, latency, queueing and
  compatibility, with a visualizer.
- **Is not** a VM, an emulator, an ISA/microarchitecture simulator, or an
  accurate FPS predictor. It teaches *shape*, not absolute numbers.

## Model: pipes, delays, tanks, budgets

Five roles cover every component, present and future:

| Role | Meaning | Examples |
| --- | --- | --- |
| Pipe | moves bytes at a rate | memory bus, PCIe, SATA, display link |
| Delay | time before one answer | DRAM CL, disk seek, cache hit |
| Tank | holds bytes | cache, RAM, VRAM, disk |
| Work | consumes or produces at a rate | CPU cores, GPU shaders |
| Budget | limits everything else | PSU watts, thermals, lane counts |

The machine is a graph of these; the simulation's job is to saturate an edge.

### The bottleneck is the product

Because every part is the same shape, "what's slow?" is always the same
question: which edge saturates first? Swapping a part does not make the old
bottleneck faster — it moves the bottleneck. v0.1 demonstrates this inside the
memory path alone: down-clock the RAM and the memory bus becomes the limiter;
raise it again — or shrink the working set into cache — and the bus drops out,
leaving the CPU side as the limiter.

## Decisions (settled before building)

- **Discrete-event core, not a per-frame physics loop.** Simulated quantities
  span almost 7 orders of magnitude (L1 hit ~1 ns → DRAM ~60–100 ns → NVMe
  ~20–50 µs → HDD seek ~4–10 ms). A fixed real-time step cannot represent
  that; an event queue keyed by simulated time can, and queueing/contention
  emerges for free instead of being hand-coded.
- **No `@pierre/ecs` dependency for v0.1.** The engine's headline feature
  (spatial queries) is irrelevant here, entity counts are tiny (a handful of
  parts), and the hard problem is scheduling, not querying. Revisit only if
  thousands of individual in-flight requests are later animated as entities —
  then `@pierre/ecs/modules/render-canvas2d` + `stats` + `tick` become
  candidates. Rationale recorded so it is not re-litigated.
- **Vite + strict TypeScript from `create-corniflex`.** Matches the house
  template (Vitest, `@/` alias, `docs/` layout, `brand.json`).
- **Fidelity target is F2** (individual transactions you can watch), with F3
  realism knobs explicitly out of v0.1 scope. Fidelity levels are `F0–F3`;
  `L1/L2/L3` always means cache levels, never fidelity.
- **Time presentation uses a constant, labelled dilation plus log-scaled
  accumulator bars.** A logarithmic *time* axis is rejected: it would decouple a
  packet's on-screen speed from its real duration, which is the one quantity the
  view exists to show. Logs are confined to the accumulator bars, where they are
  labelled as such.
- **Render split:** DOM/SVG for panels, sliders and charts (accessible,
  themable, tooltip-friendly); Canvas 2D only for the animated flow.

## Requirements (EARS)

### Simulation

- THE SYSTEM SHALL model each hardware component as a resource carrying the
  fields required by its role — capacity, service time, transfer rate,
  channels — so a pure delay needs no rate and a pure pipe needs no capacity.
- THE SYSTEM SHALL advance simulated time with a discrete-event queue; it
  SHALL NOT advance in fixed real-time steps.
- WHEN a request arrives at a busy resource, THE SYSTEM SHALL queue it rather
  than drop it.
- WHEN a request misses a cache level, THE SYSTEM SHALL forward it to the next
  level and fill the missing line on return.
- WHEN a workload completes, THE SYSTEM SHALL report per-resource
  `utilisation = busy_time / elapsed_time`, `achieved bandwidth =
  bytes_moved / elapsed_time`, and the mean and maximum outstanding requests
  at each level.
- THE SYSTEM SHALL classify the run as **resource-bound** (a resource at or
  above a saturation threshold holds the highest utilisation) or
  **latency-bound** (no resource saturated; the critical path is the
  dependency chain), and SHALL name the responsible resource or chain.
  Bandwidth-bound is the resource-bound case whose saturated resource is a
  pipe.
- WHERE a run is resource-bound, THE SYSTEM SHALL break utilisation ties by
  proximity to the CPU.
- WHEN a request depends on the result of an earlier request, THE SYSTEM SHALL
  hold it until that result returns, so dependent traffic serialises.
- WHEN a level has reached its maximum outstanding misses, THE SYSTEM SHALL
  stall further misses at that level until one returns.
- WHERE a memory component exposes multiple channels, THE SYSTEM SHALL
  compute aggregate bandwidth as per-channel rate × channels.
- THE SYSTEM SHALL express all simulated quantities in real units (ns, GB/s,
  bytes, MT/s, CL).
- WHEN the user changes any component, THE SYSTEM SHALL re-run the current
  workload and report the delta against the previous result.
- WHEN two configurations are compared, THE SYSTEM SHALL feed both the
  identical access sequence (same seed).
- THE SYSTEM SHALL let the user vary a single parameter (only CL, only
  frequency, only channel count) while holding the others constant.
- IF a component is incompatible with the motherboard, THEN THE SYSTEM SHALL
  keep simulating it and explain which rule it violates.
- THE SYSTEM SHALL keep the simulation core free of DOM and browser APIs.

### Presentation

- THE SYSTEM SHALL visualize requests flowing through the hierarchy, showing
  queueing at saturated resources.
- THE SYSTEM SHALL convey every metric with redundant non-colour cues
  (pattern, glyph, text); colour alone SHALL NOT carry meaning.
- THE SYSTEM SHALL attach a tooltip stating the meaning and unit of every
  metric widget.
- THE SYSTEM SHALL label any non-linear time axis as such.

### v0.1 acceptance criteria

1. Three RAM presets run one workload and produce a ranked result with a
   stated classification (resource-bound on the memory bus, or latency-bound)
   and the per-level outstanding-request evidence behind it.
2. Moving an isolating slider moves the bottleneck highlight.
3. Two configurations with the same seed produce an identical access sequence
   (asserted in a unit test).
4. Flipping the workload changes the ranking in a *stated* direction:
   streaming ranks DDR5 > DDR4 > DDR3 and the spread is large; random collapses
   that spread to a few percent and DDR5 does not win, the limiter being the
   dependency chain rather than any part.

Measured on the v0.1 core — 200,000 accesses, 64 B lines, dual channel:

| Rig | Streaming | Random (dependent) |
| --- | --- | --- |
| 2012 · DDR3-1600 CL9 | 500 µs @ 25.6 GB/s | 18,669 µs @ 0.7 GB/s |
| 2019 · DDR4-3200 CL16 | 250 µs @ 51.2 GB/s | 18,180 µs @ 0.7 GB/s |
| 2024 · DDR5-5600 CL36 | 143 µs @ 89.5 GB/s | 18,634 µs @ 0.7 GB/s |

Streaming reaches 99.9% channel utilisation on every rig: the part really is
the limit, and the time tracks bandwidth (DDR4 halves DDR3's, because 25.6 →
51.2 doubles; DDR5 goes 1.75× faster again, matching 51.2 → 89.6). The
dependent chase never exceeds 3% utilisation, lands within 3% across all three
generations, and delivers 0.7 GB/s — the same DIMM that managed 89.5 GB/s when
the access pattern allowed it.

## Design

### Fidelity ladder

Fidelity levels are `F0–F3`; `L1/L2/L3` always means cache levels.

| Level | What it simulates | Status |
| --- | --- | --- |
| F0 | Pure formulas, no simulation | spec-sheet panel only |
| F1 | One aggregate number per level, flow rate animated | contingency if F2 slips |
| F2 | Individual transactions, caches as occupancy-limited stores | **v0.1 target** |
| F3 | Banks, rows, refresh, prefetchers, coherence, NUMA | advanced toggles, later |

### Simulation core

An event queue ordered by simulated time. Minimal event set for v0.1:

- `RequestIssued` — a workload emits an access (address, size, kind).
- `LevelLookup` — probe a cache level: hit (return at hit-latency) or miss
  (forward down, remember to fill on return).
- `BusTransfer` — occupy a channel for `bytes / rate`, queued behind others.
- `LineFill` — install the fetched line in every level it passed.
- `RequestCompleted` — record latency, release resources, report stalls.

Two run modes over the same core:

- **Instant (headless):** run to completion, return aggregates. Used for
  charts, rankings and A/B comparison; can run in a Web Worker.
- **Paced:** sample events onto a timer for the animation, decoupled from the
  simulation clock.

Both run modes execute the same core with the same seed and SHALL produce
identical aggregate results; only the sampling differs. The worker boundary
takes `{ seed, workload, components }` and returns either final aggregates
(instant) or a stream of sampled events (paced). Payloads are small, so no
transferables are needed; a run is cancelled by terminating the worker.

### Time scaling

The central presentation trap. A linear animated clock makes fast levels
invisible: L1 is ~100× faster than DRAM, an HDD seek is ~80,000× slower than
DRAM and ~8,000,000× slower than an L1 hit. Two mitigations ship:

- a **dilation control**, labelled on screen as "1 real second = N simulated",
- **accumulator meters**, log-scaled and marked `(log)`, so per-level busy
  times spanning orders of magnitude stay visible.

A **logarithmic time axis is deliberately rejected.** Under one, a packet's
speed on screen would no longer match its duration — and duration is precisely
what the view exists to show. Constant dilation keeps every animation truthful;
logs are confined to the accumulator bars, where they are labelled.

### Data model

Component descriptors declare what they provide and require; the motherboard
is topology plus compatibility rules, never a speed source. Sketch (honours
the house TS config: `erasableSyntaxOnly`, `verbatimModuleSyntax`, no enums):

```ts
export type ResourceRole = 'budget' | 'delay' | 'pipe' | 'tank' | 'work';
export type MemoryGeneration = 'ddr3' | 'ddr4' | 'ddr5';
export type LevelId = 'l1' | 'l2' | 'l3' | 'memory' | 'cpu';

export interface CacheSpec {
  readonly id: string;
  readonly role: 'tank';
  readonly capacityBytes: number;
  readonly ways: number;
  /** Lookup latency added to the request's critical path. */
  readonly hitTimeNs: number;
  /** Data rate the level can serve — what its utilisation measures. */
  readonly bytesPerNs: number;
  readonly maxOutstandingMisses: number;
}

export interface MemorySpec {
  readonly id: string;
  readonly role: 'pipe';
  readonly generation: MemoryGeneration;
  readonly mtPerSecond: number;
  readonly casLatency: number;
  readonly channels: number;
  readonly capacityBytes: number;
  /** Controller, PHY and row-activation cost every generation pays. */
  readonly accessOverheadNs: number;
  readonly maxOutstandingMisses: number;
}

export interface CpuSpec {
  readonly id: string;
  readonly role: 'work';
  readonly clockHz: number;
  readonly cores: number;
  readonly serviceTimeNs: number;
}

export interface CacheHierarchy {
  readonly l1: CacheSpec;
  readonly l2: CacheSpec;
  readonly l3: CacheSpec;
}

export interface HardwareConfig {
  readonly cpu: CpuSpec;
  readonly caches: CacheHierarchy;
  readonly memory: MemorySpec;
  readonly motherboard: MotherboardSpec;
}
```

`role` names the dimension a resource saturates on, not an exhaustive typing: a
DIMM is also a delay and a tank, and carries those fields alongside. The CPU is
a `work` resource, so the bottleneck rule can select it when nothing else
saturates.

Two invariants the core enforces:

- **Latency is not occupancy.** `hitTimeNs` delays a request; `bytesPerNs` is
  what consumes the resource.
- **Every level is a serial server**, reserved on a free-time cursor, so no
  resource can ever report more than 100% utilisation.

### Workloads

A workload is a seeded access stream plus metadata. v0.1 profiles:

- **Streaming** — long sequential runs, high spatial locality → bandwidth-bound.
- **Random / pointer-chase** — dependent scattered access → latency-bound.
- **Mixed** — a configurable blend.

Each workload carries: seed, access count, working-set size, stride,
read/write mix, and whether requests depend on the previous result
(serialising) or are independent (pipelining). Determinism is load-bearing
for fair comparison.

| Profile | Working set | Stride | Dependencies | Expected bottleneck |
| --- | --- | --- | --- | --- |
| Streaming | ≫ L3 | uniform, forward | independent | bandwidth |
| Random / pointer-chase | ≫ L3 | scattered | dependent | latency |
| Mixed | configurable | blended | blend | whichever saturates first |

A working set that *fits* in cache is a valid fourth case (cache-resident →
the CPU becomes the resource-bound limiter, since no pipe reaches the
saturation threshold), used to show the bottleneck moving up the hierarchy.

Issue is strictly in order, so an independent access sitting behind a dependent
one waits with it. The mixed profile therefore lands between the two profiles
but nearer the chase — 1.3 GB/s, roughly twice the pointer chase and far short
of streaming's 89.5 GB/s. See [../roadmap.md](../roadmap.md) for out-of-order
issue.

Starting magnitudes: 200,000 accesses per run, which is what the app uses so a
slider change settles quickly — the generator's own default is 1,000,000.
Streaming working set ≥ 256 MiB with a forward stride of one cache line; random
working set ≥ 256 MiB with scattered line addresses and dependent requests;
mixed a 50/50 blend. All read-only unless a profile says otherwise.

### Presets (v0.1)

Three rigs identical except for RAM: "2012" (DDR3-1600 CL9), "2019"
(DDR4-3200 CL16), "2024" (DDR5-5600 CL36). Later waves add full-system
presets.

### Module layout

```text
src/
  sim/         pure discrete-event core (no DOM)
  workloads/   seeded access-stream generators
  data/        component specs + presets
  render/      Canvas 2D flow visualizer
  ui/          DOM/SVG panels, sliders, charts, tooltips
  worker/      headless batch runs off the main thread
```

### Fixed constants

Hit/miss is not asserted: it emerges from a set-associative LRU model, so a
workload's working set versus these capacities produces the hit rate. Latency
and data rate are separate numbers: one delays a request, the other is what
consumes the resource.

| Quantity | Value |
| --- | --- |
| CPU | 4 GHz, 1 core, 0.25 ns per issue |
| Cache line | 64 B |
| L1 (per core) | 32 KiB, 8-way, 1 ns latency, 256 B/ns |
| L2 (per core) | 512 KiB, 8-way, 4 ns latency, 192 B/ns |
| L3 (shared) | 16 MiB, 16-way, 15 ns latency, 128 B/ns |
| Outstanding misses | L1 192 (the core's MLP limit), L2 256, L3 320, channel 192 |
| DRAM access (full) | CAS + 60 ns shared controller overhead |
| DRAM channel | 8 B per transfer, one transfer per half clock |
| Saturation threshold | 80% utilisation |

Each level's outstanding-miss limit stands in for MSHRs *plus* the next-line
prefetching a real core does, and the L1 limit doubles as the whole core's
memory-level parallelism: a miss cannot be in flight without holding an L1 slot.
Saturating a dual-channel DDR5 link needs on the order of a hundred outstanding
lines, which is what a real prefetcher delivers and a bare MSHR file does not.
F3 replaces these with true per-level MSHRs and a real prefetcher.

## Non-goals (v0.1)

Full hardware emulation, OS/software execution, cycle-accurate
microarchitecture, real benchmark prediction, 3D visuals. Component waves for
GPU, display, storage and PSU are tracked in [../roadmap.md](../roadmap.md).

## Risks

- **The workload library is the long pole.** Each part needs a workload that
  stresses it, or the demo teaches nothing. Budget for content, not just core.
- **Time-scale legibility.** Mitigated by the labelled constant dilation and
  the log-scaled accumulator bars; validate with a real user early.
- **Scope creep toward real simulators.** Every realism knob must be opt-in
  and off by default.

## Checklist

- [x] Scaffold the project with `create-corniflex` (Vite 8, strict TS,
      Vitest, `@/` alias) and create the standard doc set (`README.md`,
      `docs/INDEX.md`, `docs/tech-stack.md`, `docs/codebase.md`,
      `docs/features.md`, `docs/agent/README.md`).
- [x] Implement the pure discrete-event core in `src/sim/` (event queue,
      resource queues, cache levels, line fills, merged duplicate misses).
- [x] Colocated unit tests: queueing order, latency accumulation, line-fill
      propagation, LRU eviction, seeded determinism, bandwidth saturation.
- [x] Implement the three workload profiles in `src/workloads/`.
- [x] Encode the component specs and three RAM presets in `src/data/`.
- [x] Implement the motherboard compatibility rules (DDR generation, channel
      count, slot count, max memory speed) with tests.
- [x] Verify acceptance criteria 1, 3 and 4 as unit tests, and record the
      measured results above.
- [x] `npm run lint` + `npm test` + `npm run build`.
- [x] Build the control panel: rig and workload pickers, the two isolating
      sliders, and metric cards carrying units and tooltips.
- [x] Satisfy acceptance criterion 2: raising memory speed on a streaming
      workload moves the limiter from the memory bus to the L3 cache.
- [x] Build the Canvas 2D flow view: per-level utilisation, a log accumulator,
      live in-flight glyphs per phase, and the saturated resource tagged by
      colour, hatch density and the word BOTTLENECK.
- [x] Implement the time-scale control: a labelled constant dilation plus
      log-scaled accumulator meters.
- [x] E2E check in the browser against Pierre's running dev server.
- [ ] Show the delta against the previous run in the readout.
- [ ] Implement headless batch comparison in a Web Worker.
- [x] Peer review (subagent, no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM.
- [ ] Move this plan to `docs/plans/done/` as part of the final commit.

## Shape notes

- v0.1 stays inside the memory path. GPU, display, storage and PSU are
  deliberately deferred to [../roadmap.md](../roadmap.md) so this plan stays a
  record of one shippable slice rather than a backlog.
- The general graph model ships in v0.1 even though only three component kinds
  use it, because retrofitting generality after four parts exist is the
  expensive path.
- Pierre owns the dev server; do not start one — E2E against his port.
