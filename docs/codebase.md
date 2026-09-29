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
  - `build.ts` — the build in progress: a set of real parts (`cpu`, `memory`,
    `motherboard`, `gpu`, `psu`, `storage`, `cooler`, `case`, any of which may be
    absent), decoupled from the simulation config. `completeBuild` projects a
    `HardwareConfig` from the memory-path parts and `toConfigParts` a `CompatParts`
    for the rules, plus `hasPart`, `missingParts`, `addPart` and `removePart`.
  - `parts/specs.ts` — the spec sheets of the sim-less parts (`GpuSpec`,
    `PsuSpec`, `StorageSpec`, `CoolerSpec`, `CaseSpec`) and `CompatParts`, the
    compatibility view the rules walk (a `Partial<HardwareConfig>` plus the
    sim-less parts).
  - `catalogue/` — the app's view of the real-part catalogue: the checked-in
    `catalogue.json` and `catalogueFor(part)`, which returns the curated parts of
    a kind ready to write into a build. The importer that produces the JSON lives
    outside `src`, in `scripts/catalogue/` (see below).
  - `presets.ts` — the shared constants a part is built from (`BASELINE_CPU`,
    `CACHE_HIERARCHY`, `MEMORY_DEFAULTS`) and `memorySpec`, which builds a DIMM
    spec from the numbers printed on the sticker.
  - `parameters.ts` — the editable characteristic of every part: the descriptor
    registry, each part's `read`/`write` over the `Build` so an absent part is
    expressible, and `applyParameter`.
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
  (`testConfig`, `testBuild`, the generation-matched
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
- `src/` (interface) — a React 19 app, rebuilt from scratch as a windowless
  build analyzer (see [plans/ui-redo.md](plans/ui-redo.md)).
  - `main.tsx` — the entry: mounts `<App>` into `#root` and imports the styles.
  - `App.tsx` — the single-page shell: a build region beside an analysis region.
    The build list, the part editor and the analysis tabs are added across the
    UI waves; each reads the data layer and renders the sheet model.
  - `components/ui/` — shadcn/ui primitives, added as source (vendored; excluded
    from lint).
  - `lib/utils.ts` — the `cn()` class-name helper.
- `src/styles.css` — the Tailwind entry: `@import "tailwindcss"`, the shadcn
  theme tokens (light and `.dark`), and the IBM Plex font faces.
- `index.html` — Vite HTML entry; `<html class="dark">`, a single `#root`, and
  `%APP_NAME%` replaced from `brand.json`.
- `vite.config.ts` / `vitest.config.ts` — build and test config; both share the `@/` alias and the React plugin.
- `eslint.config.ts` — flat ESLint config.
- `scripts/catalogue/` — the build-time catalogue importer, outside `src` so it
  is not shipped or type-checked with the app. `build-catalogue.ts` reads the
  checked-in `docyx/pc-part-dataset` snapshot in `source/`, merges the
  hand-authored enrichment in `enrichment.ts`, and emits
  `src/data/catalogue/catalogue.json`. Run with `npm run catalogue:build` (tsx);
  see `PROVENANCE.md`.
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
