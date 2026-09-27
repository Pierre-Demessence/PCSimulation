# Prettier 3D — material, light and shape polish

The 3D model reads as flat coloured blocks: every part is the same unit cube
stretched to size, every surface is the same matte paint, and the scene has one
sun and no reflections. This plan makes the model *look* nicer without adding
HD textures or fine detail — the improvement comes from shape, material and
light, not from recolouring (the utilisation colours carry meaning and stay
put).

Two contained sets, both inside `src/render/`:

## A — Material & light polish

- [x] In-memory environment map (`RoomEnvironment` → `PMREMGenerator`) set as
      `scene.environment`, so matte materials gain soft, realistic reflections.
- [x] Neutral tone mapping (`NeutralToneMapping`, preserves hue/saturation so the
      colour-blind-safe palette is not desaturated) with tuned exposure.
- [x] Softer shadows (`PCFSoftShadowMap`) and a low fill/rim light for edge
      highlights.
- [x] Material identity by role: heatsinks / brackets / sockets / DIMM contacts
      get metalness; the PCB and the utilisation-carrying body stay dielectric so
      the meaningful colours stay vivid.

## B — Shape realism

- [x] Swap the shared unit `BoxGeometry` for a `RoundedBoxGeometry` so parts,
      accents and sticks gain chamfered edges.
- [x] Give the board its own bevelled geometry and a PCB-like surface (deep
      solder-mask colour with a subtle sheen) instead of the flat grey plate.
- [x] Subtle heatsink fins on the chipset and GPU cooler, authored as thin accent
      slabs (no change to the placement code).

## Invariants kept

- Colour never becomes the only cue: hatch, shape and labels are untouched, and
  the body material stays dielectric so utilisation colour is not dimmed.
- The single-geometry-scaled-per-part pattern is kept; only the geometry changes.
- No new texture files; the environment is generated at runtime.

## Validation

- `npm run lint`, `npm test`, `npm run build`. E2E playtest is Pierre's.
