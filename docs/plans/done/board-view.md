# Board view — the machine as a picture, then as a 3D object

Today the sandbox explains the parts with a five-row swimlane and a set of HTML
cards. Both are legible, but neither shows a *machine*: nothing has a place, and
nothing is connected to anything. This plan gives the rig a body — parts with
positions and shapes, traces between them, and traffic you can watch move — and
then puts that body in 3D so it can be orbited, panned and pulled apart.

The loop it adds:

> Drag **Explode** from 100% down to 0% and watch a readable block diagram
> assemble itself into a motherboard.

Three stages, each one shippable on its own.

| Stage | Deliverable | Status |
| --- | --- | --- |
| 1 | Flat block diagram: parts in their board positions, traces, animated traffic, explode control, view tab | shipped |
| 2 | The same model in 3D with orbit / pan / zoom | shipped |
| 3 | Explode in 3D: parts lift off the board so the wiring surfaces | shipped |

## Decisions

- **Three.js for stage 2.** The camera, the mouse picking and the lighting are
  solved problems there; hand-rolling them in raw WebGL2 would cost days and add
  nothing to the lesson. It is the first runtime dependency in the repo, and
  `docs/tech-stack.md` records it.
- **Stage 1 first, and it is not throwaway.** The layout model — what a part is,
  where it sits, what it connects to — is renderer-independent. Stage 2 swaps
  the drawing code and keeps the model.
- **The swimlane view stays.** It becomes the secondary tab, and it is the only
  view that works with no colour perception at all. The board view joins it
  rather than replacing it.
- **Geometry is authored, not derived.** Parts carry two rectangles — where they
  physically sit, and where they sit when fully exploded — and the slider
  interpolates. Authoring the exploded layout by hand is what makes it read as a
  data path rather than a scrambled pile.
- **Links are drawn only where they are visible.** A trace whose two parts
  overlap is inside a package and is skipped. This is why the collapsed board
  shows a single memory trace, and the exploded view shows the whole chain.
- **Nothing pretends to be simulated.** Parts the simulation does not model
  (GPU, M.2, chipset, storage, power) are drawn as context, dashed and labelled,
  with no traces and no numbers.

## Stage 1 — flat block diagram

### Model (`src/board/`)

- [x] `types.ts` — `BoardPart`, `BoardLink`, `BoardLayout`, `BoardRect`.
- [x] `layout.ts` — `boardLayout(config)`; `partRect(part, explode)` lerps the
      two rectangles; `rectsOverlap`; `partAtPoint`; `clipBetweenRects`, which
      trims a trace to the space between two parts; and `linkSegment`, which
      returns null for a trace buried inside a package.
- [x] `flow.ts` — the residency rule as a predicate, `isResident`, with
      `progressOf` and `tokensAt` on top of it, plus `travelsBackUp`. One
      predicate serves the token list, the swimlane's in-flight count and the
      swimlane's layout, so the two views cannot disagree about what was in
      flight.
- [x] `index.ts` — the module's public surface.
- [x] Tests: every part inside the board at both ends of the slider; no two
      parts overlap at explode = 1; the caches sit inside the CPU package at
      explode = 0 and outside it at explode = 1; the memory trace is the only
      visible link when collapsed, and all four are visible when exploded; the
      populated slot count follows the rig's channels and the board's slots;
      the point hit test picks a cache over its own package; tokens appear only
      inside their span, only at their own level, and their progress runs 0 → 1.

### Renderer (`src/render/board-view.ts`)

- [x] Board plate with mounting holes, faded as the view explodes.
- [x] Parts as rounded blocks: a fill that only tints, a name that always wins
      over the traffic, a utilisation bar along the bottom edge with hatch
      density at saturation, and the word BOTTLENECK on the saturated part.
- [x] DIMM slots drawn as strips, the occupied count taken from the rig.
- [x] Traces with an arrowhead, plus tokens for the parts that carry them —
      inside the block for a cache level, along the trace for the memory bus.
- [x] Hover highlight, with the part's full detail in the footer.
- [x] Legend: glyph shapes for the four traffic phases.
- [x] The palette, the phase glyphs, the hatch and the utilisation thresholds
      move to `palette.ts` and `glyphs.ts`, so both views provably share one
      visual language rather than two that look alike.

### Wiring

- [x] `PanelState` gains `view` (`'board' | 'flow'`) and `explode` (0–1).
- [x] The panel gains a View select and an Explode slider.
- [x] `index.html` wraps both canvases in a stage; the inactive one is hidden.
- [x] `main.ts` builds both views from the same `SimResult` and renders only the
      active one. Explode never re-runs the simulation.

### Acceptance

1. The board view is the default and shows the whole rig with the memory trace
   live.
2. Dragging Explode to 0 assembles the diagram into the board layout, and back
   to 100 separates it, with no part leaving the visible area.
3. Switching to the Flow tab shows the existing swimlane view unchanged, still
   animating.
4. Every metric the board shows is also carried by shape, hatch or text, so a
   red/green weakness loses nothing.
5. Lint, tests and build are green.

## Stage 2 — 3D (shipped)

- [x] Add `three` and `@types/three`; record it in `docs/tech-stack.md`.
- [x] Give each part a solid whose silhouette is recognisable: a raised CPU
      package with three thin cache plates stacked on it, DIMM sticks standing
      in their slots, a card, an M.2 stick, a chipset, a PSU box. Height and
      proportion are what tell them apart, not colour.
- [x] `OrbitControls` for rotate, pan and zoom, with a **Reset view** button to
      recover the opening framing. The default camera is a three-quarter view
      rather than top-down: the point of this stage is that the machine reads as
      an object, and a top-down camera would just repeat the flat view.
- [x] Render traces as lines between the two parts they connect, with the
      traffic as pooled glyph solids, reusing `tokensAt` and the glyph language.
- [x] Draw the HUD on a transparent overlay canvas above the WebGL canvas, so
      the header, legend and hover readout stay crisp text at any zoom and both
      board views describe a run identically. The overlay takes no pointer
      events, so the orbit gestures reach the model.
- [x] Hover picking via a raycast against the part solids.
- [x] Frame the camera so the board sits above the HUD footer, and fall back to
      a plain message when the browser has no WebGL.

## Stage 3 — explode in 3D (shipped)

- [x] Each part lifts off the board by its own amount, so the caches separate
      from each other as well as from the package.
- [x] The traces follow the parts, and traffic rides the traces: pulling the view
      apart shows what is wired to what, which is the whole point of an exploded
      diagram.
- [ ] Click a part to isolate it. Recorded in
      [../roadmap.md](../roadmap.md) as deferred, along with the three.js bundle
      size and label de-confliction.

## Non-goals

- Photorealistic hardware. The silhouette has to be recognisable, nothing more.
- Simulating the parts that are drawn for context. They gain numbers when their
  component wave lands, not before.
- A first-person "inside the PC" experience.
