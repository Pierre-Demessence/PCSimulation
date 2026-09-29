# Multiple storage drives

Today a build holds **one part per kind**: `Build.storage` is a single
`StorageSpec | null`, and the whole part framework
(`PartDefinition.read`/`write`, the build-list UI, the sheet) assumes one
instance per `PartId`. Real builds carry **several drives** (Pierre's have 3–5).
This wave lets a build hold a **list** of drives while every other part stays
single.

## Scope

- **Storage only** becomes multi-instance now. The other seven kinds stay
  single. Monitors (a future wave) will be their own kind and are out of scope
  here.
- No new drive fields; the drive spec is unchanged. This is about **cardinality**,
  not new data.

## The decision: special-case storage, don't generalise the framework yet

Two ways to hold multiple drives:

- **(A) Special-case storage** — `Build.storage` becomes `StorageSpec[]`; storage
  leaves the single-slot `PartDefinition` walk and gets a small dedicated section
  in the build list, the sheet and the checks. The drive **editor** still reuses
  the existing descriptor registry for one drive.
- **(B) Generalise the framework** — teach `PartDefinition` a cardinality so any
  kind can be multi-instance. Reusable for future fans/monitors, but a large
  change to the core abstraction every part flows through.

**Recommended: (A).** It is far less code and risk; the framework's one-part-per-
kind assumption is load-bearing in many places. If a second multi-instance kind
later proves the pattern, generalising is a separate, informed refactor.

## Model

- `Build.storage: readonly StorageSpec[]` (was `StorageSpec | null`), default
  `[]`. `emptyBuild` seeds `[]`.
- New helpers in `build.ts`: `addStorage(build, spec)`, `removeStorageAt(build, i)`,
  `replaceStorageAt(build, i, spec)`. Storage leaves `partDefinitions()` (the
  single-slot walk); a standalone `storageDescriptors` (the current
  `storagePart.parameters`) drives the single-drive editor.
- `CompatParts.storage: readonly StorageSpec[]` (was optional single). The rules
  iterate it.
- `toConfigParts` carries the list; `completeBuild` still ignores storage.

## Checks (aggregate over the list)

- **`storage-slots`** (`incompatible`, replaces `storage-interface-offered`): the
  build's **NVMe drive count ≤ `board.m2Slots`** *and* **SATA drive count ≤
  `board.sataPorts`**. The message names whichever bus is oversubscribed.
- **`gpu-lanes-available`**: `available = pcieLanes − Σ(nvme drive lanes)`, summed
  over every NVMe drive (was a single drive's lanes). So filling M.2 slots with
  several NVMe drives narrows the graphics-lane budget further.
- Every other rule is unchanged.

## UI

- The build list renders the seven single parts through the existing `PartSlot`
  loop, then a dedicated **Storage** section: one compact row per drive with its
  own **Edit** (the existing dialog over one drive) and **Remove**, plus a
  "Choose a drive…" catalogue picker and an "Enter your own" button that
  **append** a drive rather than replace.
- Origin tracking is per-drive is out of scope; storage origin is dropped from
  the sheet for now (a drive row still shows its summary). Revisit if needed.

## Sheet

- `partSections` renders the seven single parts as today; storage becomes **N
  sections** (one per drive) or one section listing each drive's rows. Keep the
  Parts tab readable.
- `partStatuses`: a broken storage check marks the storage section(s); the status
  is aggregate (any drive incompatible ⇒ storage shows incompatible).

## Tasks

- [x] `Build.storage` → list; `emptyBuild`, `addStorage`/`removeStorageAt`/
      `replaceStorageAt`; drop storage from `partDefinitions()`; keep
      `storageDescriptors` for the editor.
- [x] `CompatParts.storage` → list; rewrite the storage rule to
      `storage-slots-available` (count vs `m2Slots`/`sataPorts`) and sum NVMe
      lanes in `gpu-lanes-available`.
- [x] Sheet + `partInfo`: render N drives; aggregate storage status.
- [x] UI: a Storage section with per-drive Edit/Remove and an appending picker.
- [x] `testing/build.ts`: `storage: []`; `testFullBuild` adds one drive.
- [x] Tests: two NVMe drives on a 1-slot board is `incompatible`; a SATA count
      over `sataPorts` is `incompatible`; two NVMe drives narrow the GPU lanes
      more than one; a build with several drives assembles clean when it fits.
- [x] Docs: `features.md` (a build holds several drives), `codebase.md`
      (`Build.storage` is a list), repo memory. Move this plan to `done/`.

## Deferred

- **Monitors** — a new part kind with display-output ports checked against the
  GPU's outputs (adapter-needed / insufficient-port warnings). Its own wave;
  written up when we start it.
- Per-drive catalogue **origin** in the sheet.
- Generalising the part framework to multi-instance (only if a second kind wants
  it).
