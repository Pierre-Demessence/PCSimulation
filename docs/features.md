# Features

Product-level feature list. One line per feature: name — description — owner.

- **Discrete-event memory path** — walks L1 → L2 → L3 → the memory channel per
  access, with queueing, merged misses and outstanding-miss limits. — owner: Pierre
- **Workload profiles** — seeded streaming, dependent random and mixed access
  streams, so two builds are always compared on identical work. — owner: Pierre
- **Assembled builds** — a build holds one part per kind (CPU, memory,
  motherboard, and the compatibility-only graphics card, power supply, storage
  drive, CPU cooler and case), each
  "Not added" until the reader adds it and fills in its values; a part that is
  absent contributes no checks of its own, and the memory path (CPU, memory,
  motherboard) must be present for a bottleneck run — the other parts are
  optional and only feed the compatibility checks. — owner: Pierre
- **Bottleneck classification** — reports per-resource utilisation, then labels
  the run resource-bound (naming the saturated part) or latency-bound (naming
  the dependency chain). — owner: Pierre
- **Compatibility checks** — part-against-part rules stated as met or broken and
  sourced to the fields they read: the CPU socket against the board, the CPU's
  memory-controller support and the board's acceptance against the DIMM's
  generation, the board's channel and speed caps, the graphics card's PCIe lanes
  and generation against the board (an NVMe drive narrows the lane budget),
  every card and board power lead against the
  supply's connectors, the summed wattage against the supply's rating, whether
  any part can drive a display, the cooler against the CPU socket and TDP, the
  drive's interface against the board's M.2 and SATA slots, and the case against
  the board form factor, the graphics card length and the cooler height. Each
  carries a severity — `not compatible`
  for parts that cannot work together, `out of spec` for a part that works below
  spec — as a word beside a ✓/✘ glyph, never colour alone. A part outside spec is
  still simulated: the comparison is the lesson, so nothing is blocked.
  — owner: Pierre
- **Results readout** — cards for time to finish, achieved bandwidth, mean
  latency, the DIMM's peak and CAS latency, L1 hit rate and the limiter, each
  with a tooltip stating what it means and its unit. The build sheet restates the
  same figures in prose, from the same run. — owner: Pierre
- **ATX placement** — every part sits where it would on a real ATX board: the
  rear I/O on the left edge level with the socket, the DIMM bank beside the
  socket with the card slot running across the board below it, the chipset low
  right, and the 24-pin header and SATA ports on the right edge. — owner: Pierre
- **Contact shadows** — the 3D scene casts shadows onto the board, so a part
  reads as resting on it rather than hovering above it. — owner: Pierre
- **Part silhouettes** — a socket frame around the package, a heatsink on the
  chipset, an I/O bracket and a cooler on the card, and a screw tab on the M.2
  stick, so each kind is recognisable from its shape alone. — owner: Pierre
- **Build sheet** — the default face: a text document for the current build,
  listing every part and each of its characteristics with what reads it,
  deriving the ceilings (rates, where the tightest wins) and floors (delays,
  which add up) the parts impose on each other, stating the board's rules as met
  or not met, and reporting the run's figures in prose. — owner: Pierre
- **Honest about the unmodelled** — a part the simulation does not reach (the
  card, the M.2 slot, the chipset, the drives, the power delivery) is listed with
  the facts it has and with no utilisation and no verdict, rather than given a
  number the run never produced. — owner: Pierre
- **3D model view** — the machine as an object you can orbit, pan and zoom,
  with each part drawn at its own height so a DIMM stick and an M.2 slot do not
  look alike. The visualisation's default picture. — owner: Pierre
- **Board view** — the same machine drawn flat, seen from above: the parts where
  they sit on the motherboard, the CPU package with its three cache levels
  inside it, the DIMM slots drawn as strips, and the traces between them. — owner: Pierre
- **Explode control** — one slider that pulls the parts apart — in the 3D model
  they lift off the board, and the traces follow them, so pulling the view apart
  shows what is wired to what. — owner: Pierre
- **Face switch** — the build sheet or the visualisation; only the active face is
  drawn, and inside the visualisation only the active picture (the 3D model or
  the flat board). — owner: Pierre
- **Saturated-resource tagging** — the busiest resource is tagged three ways at
  once (colour, hatch density and the word BOTTLENECK), so the meaning never
  rests on colour alone. — owner: Pierre
- **Per-component editing** — every characteristic of every part is editable on
  its own, one at a time: the CPU's clock and core count and all three of its
  cache levels, the DIMM's generation, speed, CAS latency, channel count,
  capacity and access overhead, and the board's slots and caps. Everything else
  stays fixed, so a bottleneck is attributable. — owner: Pierre
- **Perfectly honest knobs** — each characteristic says in words what reads it:
  that it moves the numbers, that a rule checks it against the board, or that
  nothing reads it yet. — owner: Pierre
- **A part describes itself** — the label each part carries on the board is
  generated from its current values, so an edited build cannot leave a stale
  number on a part. — owner: Pierre
- **Playback control** — a labelled constant dilation ("1 real second = N
  simulated") and a logarithmic speed slider, so no axis lies about magnitude.
  — owner: Pierre

Planned: click a part in the 3D model to isolate it, the delta against the
previous run, and headless batch comparison in a Web Worker. See
[roadmap.md](roadmap.md) and [plans/done/board-view.md](plans/done/board-view.md).
