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
- **3D model view** — the machine as an object you can orbit, pan and zoom,
  with each part drawn at its own height so a DIMM stick and an M.2 slot do not
  look alike. The default view. — owner: Pierre
- **Board view** — the same machine drawn flat, seen from above: the parts where
  they sit on the motherboard, the CPU package with its three cache levels
  inside it, the DIMM slots drawn as strips, and the traces between them. — owner: Pierre
- **Explode control** — one slider that pulls the parts apart — in the 3D model
  they lift off the board, and the traces follow them, so pulling the view apart
  shows what is wired to what. — owner: Pierre
- **View switch** — 3D model, flat board, or swimlane; only the active one is
  drawn. — owner: Pierre
- **Animated data path (the Flow view)** — a Canvas 2D view of the hierarchy
  where each level shows its utilisation, a log-scaled accumulator and how many
  requests are in flight, with glyphs travelling down as misses and back up as
  fills. This is the secondary view, and the one that carries no meaning in
  colour at all. — owner: Pierre
- **Saturated-resource tagging** — the busiest resource is tagged three ways at
  once (colour, hatch density and the word BOTTLENECK), so the meaning never
  rests on colour alone. — owner: Pierre
- **Isolating controls** — memory speed and CAS latency are dialled
  independently, with the rest of the rig fixed, so bandwidth and latency can
  be told apart. — owner: Pierre
- **Playback control** — a labelled constant dilation ("1 real second = N
  simulated") and a logarithmic speed slider, so no axis lies about magnitude.
  — owner: Pierre

Planned: click a part in the 3D model to isolate it, the delta against the
previous run, and headless batch comparison in a Web Worker. See
[roadmap.md](roadmap.md) and [plans/done/board-view.md](plans/done/board-view.md).
