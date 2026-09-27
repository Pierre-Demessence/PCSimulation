# Codebase map

- `src/sim/` — the discrete-event simulation core. Pure TypeScript, no DOM.
  - `engine.ts` — the event loop, resource occupancy, miss handling.
  - `event-queue.ts` — time-ordered queue with stable tie-breaking.
  - `cache.ts` — set-associative LRU cache.
  - `memory.ts` — DIMM arithmetic: CAS latency, bandwidth, transfer time.
  - `types.ts` — specs, stats and result shapes.
  - `index.ts` — the public surface of the core.
- `src/workloads/` — seeded access-stream generation (`rng.ts`, `generate.ts`).
- `src/data/` — part data and the rules over it.
  - `build.ts` — the build in progress: a `Partial<HardwareConfig>` plus
    `hasPart`, `missingParts`, `completeBuild` and `addPart`.
  - `presets.ts` — the shared constants a part is built from (`BASELINE_CPU`,
    `CACHE_HIERARCHY`, `MEMORY_DEFAULTS`) and `memorySpec`, which builds a DIMM
    spec from the numbers printed on the sticker.
  - `parameters.ts` — the editable characteristic of every part: the descriptor
    registry, each part's `read`/`write` over a `Partial<HardwareConfig>` so an
    absent part is expressible, and `applyParameter`.
  - `compat.ts` — the motherboard's compatibility rules as one list;
    `validateConfiguration` walks it for the warnings line.
  - `checks.ts` — the rules that carry a plain-language statement, rendered as
    the sheet's rows from that same list.
  - `limits.ts` — the derived limits: ceilings (rates, where the tightest wins)
    and floors (delays, which add up).
- `src/board/` — the machine as a physical object, and pure geometry. No DOM.
  - `types.ts` — `BoardPart`, `BoardLink`, `BoardLayout` and the rectangle types.
  - `layout.ts` — the authored part table, `boardLayout(config)`, and the
    geometry: `partRect` interpolates the assembled and exploded rectangles,
    `clipBetweenRects` trims a trace to the space between two parts, and
    `linkSegment` hides a trace buried inside a package.
  - `flow.ts` — `tokensAt`, the requests resident at one level at one instant,
    and the travel rules (`isResident`, `progressOf`, `traceProgress`,
    `roundTripProgress`) the two pictures share.
  - `solids.ts` — how tall each kind of part stands, and `solidAt`, the placement
    the 3D model reads each frame.
  - `labels.ts` — the byte, clock and sticker formatting a part's own label needs.
    It duplicates `src/render/format.ts` by design, because `src/board/` must not
    import the render layer.
- `src/sheet/` — the report model. `model.ts` turns a `Build` and a `SimResult`
  into a `BuildSheet` of finished strings: the parts, the limits, the checks, the
  measured figures and what is missing. It is DOM-free and imports only
  `@/data`, `@/sim`, `@/board`, `@/workloads` and `@/render/format`.
- `src/testing/` — `build.ts`, the complete machine the tests simulate
  (`testConfig`, `testParts`, `testBuild`, the generation-matched
  `*_MEMORY`/`*_BOARD` pairs and `GENERATION_PAIRS`). The product ships no
  pre-assembled machine, so the fixture lives with the tests.
- `src/render/` — everything that draws.
  - `board-3d.ts` — the 3D model: solids, lights, an orbit camera, raycast
    picking, and an overlay canvas for the HUD.
  - `board-view.ts` — the flat board picture, drawn on one canvas.
  - `board-data.ts` — the shape every board view takes, so they cannot disagree.
  - `describe.ts` — the sentence a view shows about the part under the pointer.
    One implementation, so the two board views cannot describe a part two ways.
  - `hud.ts` — the header and footer both board views draw, on canvas or on the
    overlay. One place, so the same run is described the same way everywhere.
  - `palette.ts` / `glyphs.ts` — the shared colours, the per-phase glyphs, the
    hatch and the utilisation thresholds, so every view speaks one language.
  - `format.ts` — the pure formatting and scale helpers, with no canvas; it also
    holds the playback clock's arithmetic (`simulatedNsAt`, `windowOf`) and the
    level labels (`levelLabel`).
- `src/ui/` — the control panel, the part bench, the readout cards and the sheet
  renderer (`panel.ts`, `editor.ts`, `sheet.ts`, `dom.ts`), and the floating
  windows that host them (`windows.tsx`, a Preact `WindowLayer` from
  `@pierre/winkit`). `panel.ts` builds plain DOM and exposes it as three
  elements — the build controls, the picture controls and the readouts;
  `editor.ts` is the bench — one part, one characteristic, one control, built
  from the parameter registry; `sheet.ts` renders a `BuildSheet` into `#sheet`
  and formats nothing, because every string comes from the model; `dom.ts` holds
  the row and label helpers they share. `windows.tsx` adopts those nodes into
  draggable windows over the canvas.
- `src/main.ts` — wiring: state, re-simulation on change, the two faces and the
  animation loop. Only the active face is on screen, and only it is drawn.
- `src/styles.css` — the full-viewport stage, the intro block, the build sheet's
  document rules, and the winkit window theming.
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
