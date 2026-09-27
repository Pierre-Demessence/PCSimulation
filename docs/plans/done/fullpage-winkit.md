# Full-page 3D with floating winkit panels

The machine sits in a fixed 640 px stage with the controls and readout cards
stacked underneath. This makes the 3D model the whole page and moves the
controls and readouts into draggable, minimisable floating windows over the
canvas, using `@pierre/winkit`.

winkit is Preact-only, so this is also the point where Preact + JSX enter the
build. The simulation, rendering and the existing `ControlPanel` logic are
untouched: the panel keeps building its DOM exactly as before; only *where* that
DOM is mounted changes — it is adopted into winkit windows instead of a block
under the canvas.

## Steps

- [x] Add `preact` and `@pierre/winkit` (`file:../../Packages/winkit`) deps.
- [x] Turn on JSX: `jsx: react-jsx` + `jsxImportSource: preact` in tsconfig, and
      the matching esbuild options in vite/vitest config.
- [x] Full-page layout: the stage fills the viewport; body/app lose their max
      width and padding. Import `@pierre/winkit/styles.css` and theme the windows
      to the app palette.
- [x] `ControlPanel` exposes two elements — `controlsElement` (inputs +
      warnings) and `readoutsElement` (cards) — instead of appending to one root.
- [x] `src/ui/windows.tsx`: a Preact `WindowLayer` with a **Controls** window and
      a **Readouts** window, each adopting the panel's DOM via a ref effect.
- [x] `main.ts`: mount the windows into `#ui`, relocate the app title/lede into
      the Controls window, drop the old `#panel`.

## Decisions

- **Adopt, don't rewrite.** The panel's `update`/`syncState`/`renderCards` logic
  is correct and colour-blind-safe; rewriting it as Preact would risk that for no
  gain. A tiny `Adopt` component appends the existing DOM node into a window, so
  the vanilla panel and the Preact windows coexist.
- **Two windows, not one.** Controls and readouts are separate concerns and read
  better as separate, independently movable panels.
- **Layout persists** via winkit `persistKey`, so a user's arrangement survives
  reloads.

## Invariants kept

- Colour never the only cue: the panel DOM and its hatch/label/shape cues are
  unchanged.
- The 3D render path, HUD and simulation are untouched.

## Validation

- `npm run lint`, `npm test`, `npm run build`. E2E playtest is Pierre's.
