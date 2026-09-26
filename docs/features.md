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
- **Results readout** — cards for time to finish, achieved bandwidth, mean
  latency, the DIMM's peak and CAS latency, L1 hit rate and the limiter, each
  with a tooltip stating what it means and its unit. — owner: Pierre
- **Animated data path** — a Canvas 2D view of the hierarchy where each level
  shows its utilisation, a log-scaled accumulator and how many requests are in
  flight, with glyphs travelling down as misses and back up as fills. — owner: Pierre
- **Saturated-resource tagging** — the busiest resource is tagged three ways at
  once (colour, hatch density and the word BOTTLENECK), so the meaning never
  rests on colour alone. — owner: Pierre
- **Isolating controls** — memory speed and CAS latency are dialled
  independently, with the rest of the rig fixed, so bandwidth and latency can
  be told apart. — owner: Pierre
- **Playback control** — a labelled constant dilation ("1 real second = N
  simulated") and a logarithmic speed slider, so no axis lies about magnitude.
  — owner: Pierre

Planned: the delta against the previous run, and headless batch comparison in a
Web Worker. See [roadmap.md](roadmap.md).
