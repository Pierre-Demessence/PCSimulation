# UI redo — the build analyzer as a real interface

The current view layer is unusable and is rebuilt from scratch. It was grown by
different agents for the *old* goal (isolate one characteristic and watch the
bottleneck), so it fights the new one (assemble a build and read the verdict):
a floating-window shell, a left menu nested three deep, a bench that edits one
characteristic at a time, and a main area that stacks `THIS RUN → CEILINGS →
CHECKS → PARTS` in one tall flood.

This is a **view-layer** rewrite. The data layer is untouched: the `src/sheet/`
model, the parameter registry, `compat`/`limits`/`checks`, the sim core, the
board geometry, and the `src/render/` canvas classes all stay. What changes is
everything that draws DOM.

## The shape it takes

A single-page, windowless, two-region layout — PCPartPicker's clarity, plus the
bottleneck analysis it cannot show.

- **The build list (the spine).** One row per part slot — CPU, Motherboard,
  Memory, GPU, PSU, Cooler, Case — each either **Add** or the chosen part with a
  status glyph and its **whole spec editable at once** (expandable inline), never
  one field at a time.
- **The analysis (summary-first, not a flood).** A prominent **verdict** at the
  top (compatible / N issues / cannot run yet), then the detail behind **tabs**
  rather than four stacked blocks:
  - **Compatibility** — the checks, grouped by severity, each a ✓/✘ with its word.
  - **Performance** — the bottleneck verdict and the limits (ceilings, floors).
  - **Parts** — the full spec reference for every added part.
  - **Visualisation** — the 3D model / flat board, a secondary tab, not a
    competing full-screen face.

The reader sees the answer first and drills in for detail, on one screen, with no
window to move.

## Aesthetic direction

A refined **technical-instrument** look: this is a precision tool, so it reads
like one. A restrained dark workbench palette with a single sharp accent, spec
numbers set in a monospace so figures align and feel measured, and a
characterful (non-generic) UI typeface. Proposed: **IBM Plex Sans** for the UI
and **IBM Plex Mono** for every number and identifier — distinctive, technical,
and not the generic Inter/Roboto default. Meaning never rests on colour: every
status carries a glyph and a word (the colourblind invariant).

## Stack decision

Full React with a component library, off the vanilla-DOM + Preact/winkit setup.

- **React 19 + react-dom**, via `@vitejs/plugin-react`. Vite stays the bundler.
- **Tailwind CSS v4** (`@tailwindcss/vite`) + **shadcn/ui** for accessible,
  composable primitives (Tabs, Card, Table, Badge, Alert, Sidebar, Field/Input,
  ToggleGroup, Select). Components are added as source under `src/components/ui`.
- **`@testing-library/react`** for component tests (vitest + jsdom already
  present).
- **`@pierre/winkit` and `preact` are removed.** The layout is windowless, so
  winkit has no role, and Preact goes with it.

Toolchain edits this implies:

- `package.json` — drop `@pierre/winkit`, `preact`; add `react`, `react-dom`,
  `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `tailwindcss`,
  `@tailwindcss/vite`, `@testing-library/react`, `@testing-library/jest-dom`.
- `tsconfig.json` — `jsxImportSource` `preact` → `react` (keep `jsx: react-jsx`).
- `vite.config.ts` — replace the `esbuild.jsx` Preact settings with the React
  plugin and the Tailwind plugin; keep the `@/` alias and the brand injection.
- `vitest.config.ts` — mirror the React plugin; keep jsdom.
- `eslint.config.ts` — enable antfu's `react` and drop the Preact/JSX-preact
  bits.
- `index.html` — replace `.stage`/`#sheet`/`#intro`/`#ui` with a single
  `<div id="root">` and `src/main.tsx`.
- `src/styles.css` — becomes the Tailwind entry (`@import "tailwindcss"` + the
  shadcn theme tokens and the two fonts).

## What is kept, wrapped, and deleted

- **Kept as-is (no DOM):** `src/sim/`, `src/workloads/`, `src/board/`,
  `src/data/`, `src/sheet/model.ts`, `src/render/` (the canvas classes and the
  formatters), `src/testing/`.
- **Wrapped in React:** `BoardModel` and `BoardView` (`src/render/board-3d.ts`,
  `board-view.ts`) become the body of a `<Visualisation>` component — a `ref` +
  effect that instantiates the existing class against a canvas. three.js stays.
- **Deleted:** `src/main.ts`, `src/ui/panel.ts`, `src/ui/editor.ts`,
  `src/ui/sheet.ts`, `src/ui/dom.ts`, `src/ui/windows.tsx`, `src/ui/index.ts`,
  and their tests (`editor.test.ts`, `sheet.test.ts`). The sheet **model** tests
  (`src/sheet/model.test.ts`) stay; the renderer tests are rewritten against the
  React components.

The state that lived in `main.ts` (the `Build`, the selected workload, the view
mode, the playback clock) moves into React state/hooks; every mutation still goes
through the data layer (`addPart`, `applyParameter`, `buildSheet`, `simulate`).

## Waves

| Wave | Deliverable | Status |
| --- | --- | --- |
| U1 | Toolchain: React + Tailwind + shadcn scaffold; the app shell renders; old UI deleted | shipped |
| U2 | The build list: add a part, edit its whole spec at once, remove it | shipped |
| U3 | The analysis: verdict + Compatibility / Performance / Parts tabs, from the sheet model | shipped |
| U4 | Visualisation tab: the 3D model and flat board wrapped as a component, with the playback controls | not started |
| U5 | Aesthetic + accessibility pass, colourblind verification, component tests | not started |

### U1 — Toolchain and shell

Shipped. Fonts are IBM Plex Sans (variable) + IBM Plex Mono, self-hosted via
`@fontsource`; the app defaults to the dark theme (`class="dark"` on `<html>`).
The bundle drops to ~221 kB because three.js is now tree-shaken out until the
visualisation tab wires it back in (U4).

- [x] Install the React + Tailwind + shadcn stack; remove `@pierre/winkit` and
      `preact`. Run `shadcn init` (Nova preset, Radix base, neutral colours).
- [x] Rewire `tsconfig`, `vite.config`, `vitest.config`, `eslint.config` for
      React; rewrite `index.html` to a single `#root` + `src/main.tsx`.
- [x] Delete `src/main.ts` and the `src/ui/` DOM files and their tests
      (`editor.test.ts`, `sheet.test.ts` go; the sheet-model tests stay).
- [x] Render an empty two-region shell (build | analysis) with the fonts and
      theme tokens in place. `npm run build`, `lint`, `test` (133) green.

### U2 — The build list

Shipped. `BuildPanel` maps `partDefinitions()` to a `PartSlot` each: absent slots
show an Add control; present ones are a **compact row** — a status glyph, the part
label and a one-line summary of its first characteristics — with **Edit** (opens a
dialog holding the full-spec editor) and Remove. This keeps the left column short
as parts multiply. The status glyph is per-part compatibility (✓/⚠/✘), derived
from the sheet's checks by the source fields each names. `PartEditor` groups a
part's descriptors by slot and renders them all at once inside the dialog; each
control writes through `applyParameter`, and a refusal keeps the value and names
the invariant. A `removePart` was added to the data layer (with a `never`
exhaustiveness guard). Component tests cover add/edit-in-dialog/remove and a
refusal.

- [x] A build panel of compact part-slot rows, driven by `partDefinitions()` and
      the `Build` state; **Add** calls `addPart`, and a populated row shows a
      status glyph, a summary and an **Edit** button.
- [x] A `<PartEditor>` (in an Edit dialog) that renders **every** descriptor of a
      part at once (number Input, shadcn Select, shadcn Checkbox), each writing
      through `applyParameter`; a refusal keeps the value and shows the reason.
- [x] Remove-a-part control (`removePart`); an absent slot names the part to add.

### U3 — The analysis

Shipped. `App` holds the build, the workload and the `SimResult`, running
`simulate` in a debounced effect (150 ms, ~0 ms to clear when the build is
incomplete) so the compatibility checks update instantly while the run catches
up. `AnalysisPanel` shows a verdict bar — a compatibility summary (glyph + word)
over the run verdict — then shadcn Tabs: **Compatibility** (checks, failures
first, each a ✓/✘/⚠ + word), **Performance** (measured figures, ceilings, floors)
and **Parts** (the spec reference + the unmodelled list). A workload ToggleGroup
re-runs the analysis. Every string is the sheet model's; the panel formats
nothing.

- [x] A verdict bar from `buildSheet` (compatibility summary + the run verdict),
      always visible above the tabs.
- [x] Tabs — Compatibility (`checks`, ordered failures-first, ✓/✘/⚠ + word),
      Performance (the run verdict + `measured`/`ceilings`/`floors`), Parts (the
      `parts` sections + `unmodeled`). Every string comes from the sheet model.
- [x] The run is debounced; the verdict and the checks read one build, the run
      lagging by the debounce window only.

### U4 — The visualisation tab

- [ ] A `<Visualisation>` component wrapping `BoardModel` / `BoardView` on a
      canvas via a ref + effect, with the 3D/flat toggle and the playback clock
      (the `requestAnimationFrame` loop moves into an effect).
- [ ] It is one tab among the analysis tabs, never a full-screen face.

### U5 — Polish and tests

- [ ] The aesthetic pass (typography, spacing, the accent, subtle texture) per
      the direction above; the frontend-design skill guides it.
- [ ] Accessibility: keyboard reachable, labelled controls, the document
      navigable; colourblind verification (word/glyph on every status).
- [ ] Component tests with `@testing-library/react`: the build list adds/edits a
      part, a refusal restores the value, the verdict and checks render, a broken
      check shows its word.

## Requirements (EARS)

- THE SYSTEM SHALL present one single-page layout with no draggable windows.
- THE SYSTEM SHALL show every part slot as a row that is either empty (with an
  Add control) or the chosen part with its whole spec editable at once.
- WHEN a characteristic is edited, THE SYSTEM SHALL write it through the existing
  data layer and re-render the analysis from the same run the picture shows.
- THE SYSTEM SHALL show the verdict first and place the detail behind tabs, so no
  single view stacks every block at once.
- THE SYSTEM SHALL render the visualisation as a secondary tab, never a
  full-screen face.
- THE SYSTEM SHALL carry every status as a word and a glyph, never colour alone.
- THE SYSTEM SHALL keep the sheet model as the source of the rendered strings;
  the React renderer formats nothing.

## Risks

- **A big-bang toolchain swap.** React + Tailwind v4 + shadcn on Vite 8 is a lot
  to land at once, and the old and new UIs cannot coexist (they mount the same
  DOM). U1 does the whole swap in one wave and is entered with nothing else in
  flight; `build`/`lint`/`test` gate it.
- **Vite 8 / Tailwind v4 / shadcn compatibility.** All are current but new
  together. If a blocker appears, the fallback is Tailwind without shadcn
  (hand-built primitives) — decided if it bites, not pre-emptively.
- **Wrapping imperative canvases.** `BoardModel`/`BoardView` own their own
  animation loop; the React wrapper must instantiate once (effect with an empty
  dep) and drive the clock without re-creating the renderer each render.
- **Test coverage dips during the swap.** The renderer tests are deleted with the
  renderers; U5 restores coverage with component tests. The data-layer tests
  (the bulk) never move.
- **eslint churn.** Moving antfu from Preact to React reflows config; expect a
  lint pass to settle imports.

## Non-goals

- Any change to the data layer, the simulation, the compatibility rules, or the
  sheet model's content (only its presentation).
- New analysis features — this wave re-presents what B1/B2 already produce.
- A native app, SSR, or routing; it stays a single-page client app.
- Keeping `winkit` — it is removed, not preserved for later.

## Relationship to the build-analyzer plan

This realises the `UI` wave recorded in
[build-analyzer.md](build-analyzer.md#ui--full-view-layer-rewrite-design-tbd).
It lands before the remaining part waves (B3–B6) so GPU, PSU, storage, cooler and
case are added through the new build list rather than the old bench.
