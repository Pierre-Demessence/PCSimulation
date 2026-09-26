# Features

Product-level feature list. One line per feature: name — description — owner.

- **Discrete-event memory path** — walks L1 → L2 → L3 → the memory channel per
  access, with queueing, merged misses and outstanding-miss limits. — owner: Pierre
- **Workload profiles** — seeded streaming, dependent random and mixed access
  streams, so two rigs are always compared on identical work. — owner: Pierre
- **Rig presets** — 2012 (DDR3-1600 CL9), 2019 (DDR4-3200 CL16) and 2024
  (DDR5-5600 CL36) machines differing only in memory. — owner: Pierre
- **Bottleneck classification** — reports per-resource utilisation, then labels
  the run resource-bound (naming the saturated part) or latency-bound (naming
  the dependency chain). — owner: Pierre
- **Motherboard compatibility** — refuses a DIMM the board will not accept and
  explains which rule it broke. — owner: Pierre
- **Results readout** — a plain table of elapsed time, achieved bandwidth, mean
  latency and limiter per rig. — owner: Pierre

Planned: an animated data-flow view, preset picking with isolating sliders, and
headless batch comparison in a worker. See [roadmap.md](roadmap.md).
