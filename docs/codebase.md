# Codebase map

- `src/sim/` — the discrete-event simulation core. Pure TypeScript, no DOM.
  - `engine.ts` — the event loop, resource occupancy, miss handling.
  - `event-queue.ts` — time-ordered queue with stable tie-breaking.
  - `cache.ts` — set-associative LRU cache.
  - `memory.ts` — DIMM arithmetic: CAS latency, bandwidth, transfer time.
  - `types.ts` — specs, stats and result shapes.
  - `index.ts` — the public surface of the core.
- `src/workloads/` — seeded access-stream generation (`rng.ts`, `generate.ts`).
- `src/data/` — rig presets and the motherboard's compatibility rules.
- `src/board/` — the machine as a physical object, and pure geometry. No DOM.
  - `types.ts` — `BoardPart`, `BoardLink`, `BoardLayout` and the rectangle types.
  - `layout.ts` — the authored part table, `boardLayout(config)`, and the
    geometry: `partRect` interpolates the assembled and exploded rectangles,
    `clipBetweenRects` trims a trace to the space between two parts, and
    `linkSegment` hides a trace buried inside a package.
  - `flow.ts` — `tokensAt`, the requests resident at one level at one instant,
    and the travel rules (`isResident`, `progressOf`, `traceProgress`,
    `roundTripProgress`) both views share.
  - `solids.ts` — how tall each kind of part stands, and `solidAt`, the placement
    the 3D model reads each frame.
- `src/render/` — everything that draws.
  - `board-3d.ts` — the 3D model: solids, lights, an orbit camera, raycast
    picking, and an overlay canvas for the HUD.
  - `board-view.ts` — the flat board picture, drawn on one canvas.
  - `pipeline.ts` — the swimlane flow view, one row per level.
  - `board-data.ts` — the shape every board view takes, so they cannot disagree.
  - `describe.ts` — the sentence a view shows about the part under the pointer.
    One implementation, so the two board views cannot describe a part two ways.
  - `hud.ts` — the header and footer both board views draw, on canvas or on the
    overlay. One place, so the same run is described the same way everywhere.
  - `palette.ts` / `glyphs.ts` — the shared colours, the per-phase glyphs, the
    hatch and the utilisation thresholds, so every view speaks one language.
  - `format.ts` — the pure formatting and scale helpers, with no canvas.
- `src/ui/` — the control panel and the readout cards (`panel.ts`), and the
  floating windows that host them (`windows.tsx`, a Preact `WindowLayer` from
  `@pierre/winkit`). `panel.ts` builds plain DOM and exposes it as two elements;
  `windows.tsx` adopts those nodes into draggable windows over the canvas.
- `src/main.ts` — wiring: state, re-simulation on change, the three views and
  the animation loop. Only the active view is on screen, and only it is drawn.
- `src/styles.css` — the full-viewport stage, the intro block, and the winkit
  window theming.
- `index.html` — Vite HTML entry; `%APP_NAME%` is replaced from `brand.json`.
- `vite.config.ts` / `vitest.config.ts` — build and test config; both share the `@/` alias.
- `eslint.config.ts` — flat ESLint config.
- `docs/` — project documentation (start at [INDEX.md](INDEX.md)).

## Planned

See [roadmap.md](roadmap.md). Not yet written:

- `src/worker/` — headless batch comparison off the main thread.

## Conventions

- Import from `@/…` instead of long relative paths.
- Keep `src/sim/` free of DOM and browser APIs so it can run in a worker.
  `src/board/` is pure geometry and holds to the same rule, so it stays testable
  without a canvas.
- Co-locate tests with source as `<name>.test.ts`.
- Units are explicit in every name: `Ns`, `Bytes`, `BytesPerNs`, `MtPerSecond`.
- 2-space indent, single quotes, semicolons (enforced by ESLint).
