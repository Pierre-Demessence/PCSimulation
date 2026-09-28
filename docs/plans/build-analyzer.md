# Build analyzer — the spec sheet is the machine

The project's priority moves from *"visualise the data path"* to *"analyse a
build"*: a reader creates parts or picks real ones from a catalogue, adds them to
a build, and the tool says whether the parts fit and where the build is
bottlenecked — PCPartPicker's compatibility verdict, plus the data-transfer
bottleneck PCPartPicker cannot show. The visualisation stays a face and a future
goal; it is no longer the point.

The loop it makes primary:

> Add a part → the tool checks it against every other part → it names each
> incompatibility in plain language, and (when the parts allow) where the build
> is limited.

## The reframing, in one sentence

Today a build **is** a simulation config; it must become a set of **real parts**
from which the simulation config is *derived*. Every consequence below follows
from that one flip.

## What exists today (grounded)

| Fact | Source |
| --- | --- |
| A build is literally a partial simulation config | `src/data/build.ts@11` — `Build.parts: Partial<HardwareConfig>` |
| Every part field exists because the *simulator* (or the one memory rule) reads it | `src/sim/types.ts@24-57` |
| There is **no socket, chipset, form factor, TDP, connector or dimension** anywhere in the model | `src/sim/types.ts@42-57` — `CpuSpec` and `MotherboardSpec` carry only sim/board-cap fields |
| Compatibility is four memory-vs-board rules | `src/data/compat.ts@82` — generation, channels, DIMM slots, speed |
| The rule engine is already declarative, sourced and met/not-met | `src/data/compat.ts@22-31` (`ConfigurationRule`), rendered by `src/data/checks.ts@30` |
| Only three part kinds are editable, all on the memory path | `src/data/parameters.ts@19` — `PartId = 'cpu' \| 'memory' \| 'motherboard'` |
| GPU / M.2 / chipset / storage / PSU are drawn but carry no data and reach the model nowhere | `src/board/layout.ts@79`, `@88`, `@97`, `@106`, `@115` — `levelId: null`, module-private |
| A run needs all four sim parts, or there is no run | `src/data/build.ts@37-42` — `completeBuild` returns null while any is absent |
| The sheet already separates verdict / ceilings / floors / checks / parts / unmodelled | `src/sheet/model.ts@52` — `BuildSheet` |
| The "honest about the unmodelled" concept already exists | `src/sheet/model.ts@43` — `UnmodeledSection`, no verdict field |
| Two faces ship; the Flow view is gone; the sheet is the default face | `docs/plans/done/`… S1 of `build-sheet.md` |

So the primitives the analyzer needs already exist — a declarative rule walk, a
partial build, a report model, and an honest place for facts the sim ignores.
What is missing is the **vocabulary** (sockets, chipsets, form factors,
connectors, wattage) and the **spine** that makes those first-class instead of
bolted onto a sim config.

## The core decision: the spine flips

- **A part is a real spec sheet, not a slice of `HardwareConfig`.** Each part
  kind gets a `*Spec` carrying its full real-world identity and every field a
  compatibility rule could read — most of which the simulation never touches.
  The CPU's socket, the board's socket and chipset, the PSU's connector
  inventory and wattage, the GPU's length and power draw and slot: these are the
  product now, and none of them exists today.
- **`Build` holds parts, and the simulation config is derived from them.**
  `Build` becomes a set of `*Spec`s (one per kind, still one-per-kind as both
  current plans settle). `completeBuild()` stops *being* the build and becomes a
  **projection**: it reads the sim-relevant subset of the parts present and
  returns a `HardwareConfig` only when the memory path (CPU + caches + memory +
  board) is expressible. The simulation core keeps taking a plain
  `HardwareConfig` and does not learn about sockets.
- **Compatibility reads spec sheets; the bottleneck reads the projection.**
  These are two independent analyses over one build. A build with a CPU, board,
  GPU and PSU but no RAM has a full **compatibility** verdict and **no**
  bottleneck run — the opposite of today, where no RAM means no build at all.
- **The rule engine generalises from "board over memory" to "any parts over any
  parts".** `ConfigurationRule` already declares its `sources` and returns a
  met/not-met outcome (`src/data/compat.ts@22-31`); the change is quantity and a
  `severity` (`incompatible` vs `warning`), not a new shape. Nothing blocks a
  run — an out-of-spec pairing is explained, per the existing lesson
  (`src/data/compat.ts`), which is exactly the PCPartPicker behaviour the reader
  wants *plus* the sandbox's "simulate it anyway".
- **The catalogue of real parts becomes the primary way to add a part.**
  Entering numbers by hand stays (it is how a hypothetical part is explored), but
  picking "i5-12400" — which carries its socket, TDP, caches and clock — is the
  headline. This is the component-customization plan's W2, promoted from
  optional to central.
- **Nobody pretends.** The existing `effect` flag
  (`simulated` | `validated` | `display-only`, `src/data/parameters.ts@22-30`)
  already tells the reader which fields move the numbers; it now also carries the
  large new class of **compatibility-only** fields — read by a rule, ignored by
  the sim — which is exactly what `validated` already means. No new honesty
  mechanism is needed.
- **A part may own no simulated slot.** GPU, PSU, cooler and case reach the
  simulation nowhere, so a `PartDefinition` can now own zero `HardwareConfig`
  slots. The shipped invariant — every part owns ≥1 slot and every `SlotId` is
  owned by exactly one part (customization W1/W4) — is reframed: the
  slot-ownership walk covers only the *sim* parts (CPU, memory, motherboard),
  and presence for a sim-less part is simply `build.<kind> !== null`.

## What supersedes what

This plan **merges and reframes** the two active plans rather than discarding
them; their shipped work stands.

- `build-sheet.md` (S1 shipped) gave the two faces, the assembled `Build`, the
  rule walk and the sheet. Its S2–S4 (GPU / storage / PSU as *facts* bolted onto
  the sim config) are **re-expressed** here as first-class spec sheets on the new
  spine. The sheet model is reused as-is.
- `component-customization.md` (W1 shipped) gave the parameter registry and the
  generic editor. Its W2 (real-world templates) is **promoted** to a headline
  wave here; its W3/W4 (broader validation, extension proof) fold into the
  compatibility engine below.
- Both plans keep `Build = Partial<HardwareConfig>` as the spine; **this plan
  changes that**, which is the one thing neither of them does.

Once this plan's B1 lands, the superseded waves in those two plans are retired
(their remaining checkboxes move here); the plans themselves move to
`docs/plans/done/` when their shipped portions are archived.

## Target data model

Fictional but shape-complete. Honours `erasableSyntaxOnly` and
`verbatimModuleSyntax`; the simulation core's input is unchanged.

These **evolve the existing types in place** — `CpuSpec` and `MotherboardSpec`
(`src/sim/types.ts@42`, `@50`) gain fields; nothing the sim reads is removed. The
names below are the real ones: there is no parallel `*Spec2`, per the standing
"delete the old, no versioned shim" rule. `caches` stays **nested under the CPU
part**, exactly as `CpuPart` (`src/data/parameters.ts@86`) already bundles it, so
`completeBuild` lifts `build.cpu.caches` up to `HardwareConfig.caches`.

```ts
// src/data/parts/vocabulary.ts — the compatibility alphabet, none of it simulated
export type Socket = 'am4' | 'am5' | 'lga1200' | 'lga1700' | 'lga1851';
export type FormFactor = 'atx' | 'matx' | 'itx' | 'eatx';
export type PcieVersion = 3 | 4 | 5;
export type PowerConnector = 'atx-24' | 'eps-8' | 'pcie-8' | 'pcie-6' | '12vhpwr';
// MemoryGeneration already exists in src/sim/types.ts@6.
```

```ts
// src/data/parts/specs.ts — real spec sheets; the sim reads a subset, no more
export interface CpuSpec {           // the existing CpuSpec (src/sim/types.ts@42), grown
  readonly id: string;
  readonly identity: string;         // "Intel Core i5-12400", the sticker name
  readonly socket: Socket;           // compatibility-only
  readonly tdpWatts: number;         // compatibility-only (PSU + cooler budgets)
  readonly memoryGenerations: readonly MemoryGeneration[]; // controller support
  readonly integratedGraphics: boolean; // compatibility-only (display-output check)
  readonly clockHz: number;          // simulated (through serviceTimeNs)
  readonly cores: number;            // display-only, as today
  // caches travel with the CPU, because a real part's caches are baked in
  readonly caches: CacheHierarchy;
}

export interface MotherboardSpec {   // the existing MotherboardSpec (src/sim/types.ts@50), grown
  readonly id: string;
  readonly identity: string;
  readonly socket: Socket;           // must match the CPU
  readonly chipset: string;          // display-only unless a support matrix is sourced
  readonly formFactor: FormFactor;   // must fit the case
  readonly allowedGenerations: readonly MemoryGeneration[];
  readonly dimmSlots: number;
  readonly maxChannels: number;
  readonly maxMtPerSecond: number;
  readonly pcieVersion: PcieVersion;
  readonly pcieLanes: number;        // lane budget for GPU + M.2
  readonly powerConnectors: readonly PowerConnector[]; // what the PSU must supply
}

// MemorySpec gains a form factor and keeps its sim fields.
// GpuSpec, StorageSpec, PsuSpec, CoolerSpec, CaseSpec are new and mostly
// compatibility-only — see B3/B4/B5.
```

```ts
// src/data/build.ts — the build, decoupled
export interface Build {
  readonly cpu: CpuSpec | null;      // carries its own caches
  readonly motherboard: MotherboardSpec | null;
  readonly memory: MemorySpec | null;
  readonly gpu: GpuSpec | null;
  readonly storage: StorageSpec | null;
  readonly psu: PsuSpec | null;
  readonly cooler: CoolerSpec | null;
  readonly case: CaseSpec | null;    // 'case' is a reserved word but a legal property key
}

/**
 * The memory-path config, or null while it is incomplete. The memory path is
 * three parts: the CPU (with its nested caches), the memory and the motherboard;
 * the projection lifts `build.cpu.caches` to `HardwareConfig.caches`.
 */
export function completeBuild(build: Build): HardwareConfig | null;
```

```ts
// src/data/compat.ts — generalised, severity added
export interface CompatRule {
  readonly id: string;
  readonly sources: readonly string[];       // dotted field paths, as today
  readonly severity: 'incompatible' | 'warning';
  evaluate: (build: Build) => RuleOutcome | null; // null when a read part is absent
}
```

## Waves

| Wave | Deliverable | Status |
| --- | --- | --- |
| B1 | Spine flip: `Build` decouples from `HardwareConfig`; `completeBuild` becomes a projection; the sim keeps its input | shipped |
| B2 | Compatibility vocabulary + engine: sockets, chipsets, form factors, connectors, severity; CPU↔board socket the first new check | not started |
| B3 | GPU + PSU as real parts: PCIe slot/lanes/version, power connectors, wattage budget | not started |
| B4 | Storage + cooler: interface + ports, socket support, TDP headroom | not started |
| B5 | Case + physical fit: form factor, GPU length, cooler height, radiator support | not started |
| B6 | Real-world catalogue per kind (promotes customization W2) as the primary add route | not started |

Each wave is landable on its own and none blocks a run. The bottleneck sim is
untouched after B1; every later wave adds spec sheets, rules and catalogue
entries, not engine changes.

### B1 — The spine flip

Shipped as a purely structural decoupling: no compatibility fields are added yet
(that is B2), so the sim's `CpuSpec`/`MotherboardSpec` and `HardwareConfig` are
untouched. All 142 tests, lint and build stay green, and the projected config
still produces the v0.1 numbers.

- [x] Decouple `Build` from `HardwareConfig`: `Build` is a flat per-kind record
      (`cpu`, `memory`, `motherboard`, any absent), the CPU part being the
      existing `CpuPart` composite (`{ cpu, caches }`) so caches travel with the
      CPU without touching the sim's `CpuSpec`/`HardwareConfig`. Growing the specs
      with the compatibility fields (`socket`, …) is B2.
- [x] `completeBuild` is a **projection** that assembles a `HardwareConfig` from
      the present parts — lifting `build.cpu.caches` up to `HardwareConfig.caches`
      — and returns null while the memory path (CPU, memory, motherboard) is
      incomplete (`src/data/build.ts`).
- [x] `hasPart` / `missingParts` / `addPart` on the new `Build`; `hasPart` stays
      one predicate (`read(build) !== null`).
- [x] The parameter registry's `read`/`write` take and return the `Build`
      (`src/data/parameters.ts`); the round-trip test still pins it.
- [x] `buildLimits` / `buildChecks` / `validateConfiguration` keep taking
      `Partial<HardwareConfig>`, fed by a new `toConfigParts(build)` projection
      (`src/data/build.ts`), so their tests are unchanged; they migrate to read
      `Build` directly when sim-less parts arrive (B3).
- [x] The sheet model and `main.ts` wiring read the new `Build`
      (`src/sheet/model.ts`, `src/main.ts`).
- [x] The test fixture (`testBuild`, `src/testing/build.ts`) is on the new shape;
      the projected `HardwareConfig` still produces the v0.1 numbers, so the spine
      flip changes no simulated result.

### B2 — Compatibility vocabulary and engine

- [ ] Add `src/data/parts/vocabulary.ts` with `Socket`, `FormFactor`,
      `PcieVersion`, `PowerConnector`.
- [ ] Give `CpuSpec` and `MotherboardSpec` their `socket` (+ form factor, lanes,
      connectors), marked `validated` in the registry — read by a rule, ignored
      by the sim. `chipset` stays `display-only`: no rule reads it until a
      support matrix is sourced (see the deferred note in the matrix).
- [ ] Generalise `ConfigurationRule` → `CompatRule` with `severity`
      (`src/data/compat.ts@22-31`); `validateConfiguration` and `buildChecks`
      keep walking the one list.
- [ ] Add the first new check: **CPU socket must match the motherboard socket** —
      the flagship PCPartPicker rule, impossible to express before this wave.
- [ ] Add the CPU↔board memory-generation check (the CPU controller's supported
      generations against the DIMM), distinct from the existing board rule.
- [ ] The sheet's `CHECKS` block groups by `severity`; a broken `incompatible`
      rule carries the word `not compatible`, never colour alone (Pierre is
      colour-blind — see repo memory).
- [ ] Tests: a mismatched socket is `incompatible` and explained; the run still
      happens when the memory path is present; a matched socket is `met`.

### B3 — GPU and PSU as real parts

- [ ] Add `GpuSpec` (identity, PCIe version + lanes wanted, length mm, power
      connectors required, board power draw) and `PsuSpec` (wattage, connector
      inventory) to `src/data/parts/specs.ts`; extend `Build`.
- [ ] Grow `PartId` to `gpu` and `psu` and register each as a `PartDefinition`
      that owns **zero** sim slots, so the picker and editor reach them while the
      slot-ownership walk still covers only the sim parts.
- [ ] Checks: GPU PCIe generation/lanes against the board's budget; every GPU
      power connector present on the PSU; **summed part wattage ≤ PSU wattage**
      (CPU TDP + GPU draw + a base); and **a display output exists** (a dedicated
      GPU or the CPU's `integratedGraphics`). All `warning` or `incompatible` as
      fits; none blocks.
- [ ] The GPU and PSU render as `UnmodeledSection`s (facts, no verdict) until a
      simulation wave reaches them — `src/sheet/model.ts@43` already models this.
- [ ] Tests: a missing connector is explained; wattage over budget is
      `incompatible`; a CPU without `integratedGraphics` and no GPU warns about
      no display; a GPU with facts carries no verdict string.

### B4 — Storage and cooler

- [ ] Add `StorageSpec` (interface: SATA / NVMe-PCIe, lanes, form factor) and
      `CoolerSpec` (supported sockets, TDP rating, height mm); extend `Build`.
- [ ] Checks: the cooler supports the CPU socket; the cooler's TDP rating ≥ the
      CPU TDP; the drive's interface is offered by the board; M.2 occupancy
      splits the GPU's lanes (a static rule the roadmap already records).
- [ ] Tests: an unsupported socket is `incompatible`; an under-rated cooler is a
      `warning`; populating M.2 moves the GPU lane budget.

### B5 — Case and physical fit

- [ ] Add `CaseSpec` (supported form factors, max GPU length, max cooler height,
      radiator support); extend `Build`.
- [ ] Checks: the board's form factor fits the case; the GPU length ≤ the case
      max; the cooler height ≤ the case max. Physical fit was a non-goal of both
      earlier plans and is promoted here because the analyzer is now the point.
- [ ] Tests: an oversize GPU is `incompatible`; an ATX board in an ITX case is
      `incompatible`.

### B6 — Real-world catalogue

**Sourcing decision: a build-time importer, not hand-authoring and not a live
API.** There is no official API for PC part specs — PCPartPicker has none and its
ToS forbids scraping; retail APIs carry listings, not compatibility fields. So the
catalogue is **imported once at build time from a static dataset and checked in**,
which keeps the sandbox offline (it has no network dependency today) and avoids
authoring thousands of parts by hand.

- **Primary source: `docyx/pc-part-dataset`** — ~66 k parts scraped from
  PCPartPicker, per-category JSON, MIT-licensed repo, refreshed 2025. It is a
  **listing** dataset, not a compatibility one: it carries identity, price and the
  display specs (clock, TDP, capacity, form factor, wattage, length) but **not**
  most compatibility fields — the CPU has **no socket**, the PSU **no connector
  inventory**, the GPU **no power draw**. The full field-by-field mapping and the
  gaps are in the appendix. Caveat, noted so it is a decision and not an accident:
  the *data* is a PCPartPicker scrape, so its provenance is a ToS gray area even
  though the code is MIT. Acceptable for a non-commercial educational sandbox
  importing a static snapshot; **Wikidata SPARQL** is the fully-clean fallback if
  that ever needs to change, at the cost of coverage and heavier normalisation.
- **Import plus enrichment, not bulk import.** Because the compatibility fields
  are largely absent, the catalogue is the dataset's display fields *enriched* by
  hand-authored lookups. The highest-value one is a compact **microarchitecture →
  { socket, memory generations }** table (a few dozen rows) that unlocks CPU
  socket and memory support for every CPU the dataset lists — `microarchitecture`
  is one of the few fields it does carry. The sparse remainder (PSU connectors,
  GPU power, cooler sockets/height, case clearances) is hand-set per curated
  entry, which is affordable only because the set is small.
- **Curated, not exhaustive.** The importer trims to a few dozen representative
  parts per kind across generations, because this is a teaching sandbox: a
  socket mismatch and a weak PSU are taught better by a legible set than by 66 k
  rows, and a small set stays accurate (the catalogue-accuracy risk below).
- **Constraint this puts on B1/B2:** choose spec field names that are *mappable*
  from the dataset (socket, form factor, tdp, memory support, wattage,
  connectors). For fields the dataset lacks (exact PCIe lanes, connector
  inventory, cooler height, case GPU clearance), derive, default, or expose as a
  "not specified" fact — never invent a number.

- [ ] Add `src/data/catalogue/`: a one-time importer/normaliser that maps the
      source dataset's fields → our spec schema and emits a checked-in
      `catalogue.json`; the importer, the source snapshot and a provenance note
      live beside it, and it is re-runnable to refresh. The app imports only the
      emitted JSON, never the network.
- [ ] Author the enrichment lookups the importer applies (see the mapping
      appendix): the **microarchitecture → { socket, memory generations }** table
      first, then the hand-set fields the dataset lacks per curated entry (PSU
      connectors, GPU power draw + connectors, cooler socket/TDP/height, case
      clearances). Keep them beside the importer as data a reader can check
      against the real part.
- [ ] Each entry carries an `identity` naming the part it claims to be; where a
      field is absent in the source it is defaulted or marked "not specified"
      rather than guessed (customization W2's sourcing discipline).
- [ ] The part picker gains the catalogue as its primary route: choosing a real
      part writes its whole spec and records the entry in `origin`
      (`src/sheet/model.ts@27`), with "enter your own" the secondary route.
- [ ] Keep catalogue CPUs on the model's fixed 4 GHz / one-core issue rate for
      the *simulated* fields, so naming a real CPU does not silently move every
      v0.1 number (customization W2's standing instruction); the real socket,
      TDP and generation support are honoured because those are compatibility
      fields the sim ignores.
- [ ] Tests: catalogue ids unique; every catalogue part passes its own kind's
      checks in a matching board; a build assembled from a matched set produces
      the v0.1 numbers for everything the sim reads; the importer is covered by a
      fixture rather than the live dataset, so tests stay offline.

## Docs to land with this feature

- [ ] `docs/features.md` — lead with the compatibility analyzer across part
      kinds; reframe the bottleneck sim as one analysis, not the definition of a
      build; keep the "honest about the unmodelled" entry.
- [ ] `docs/codebase.md` — `src/data/parts/` (vocabulary + spec sheets),
      `src/data/catalogue/`; note `Build` no longer equals `Partial<HardwareConfig>`
      and `completeBuild` is a projection.
- [ ] `docs/roadmap.md` — the analyzer is the current focus; the v0.2–v0.4
      *simulation* waves (GPU/storage/PSU bottlenecks) stay deferred behind their
      static-rule counterparts here.
- [ ] `README.md` — the headline becomes "assemble a build, get a compatibility
      verdict and a bottleneck" rather than "watch the data path".
- [ ] Update the repo memory note (`/memories/repo/pc-simulation.md`), which
      still describes three views and a sim-centred model.
- [ ] Move `build-sheet.md` and `component-customization.md` to
      `docs/plans/done/`, and this plan too, in the final commit of B6.

## Requirements (EARS)

- THE SYSTEM SHALL represent every part as a real spec sheet whose fields
  include those no simulation reads.
- THE SYSTEM SHALL derive the simulation configuration from the build's parts,
  and SHALL keep the simulation core's input a plain `HardwareConfig`.
- WHEN a build has the parts a compatibility rule reads, THE SYSTEM SHALL
  evaluate that rule regardless of whether the memory path is complete.
- WHILE the memory path is incomplete, THE SYSTEM SHALL still produce the
  compatibility verdict and SHALL produce no bottleneck run.
- IF two parts are incompatible, THEN THE SYSTEM SHALL name the rule and the
  fields that broke it, mark it incompatible, and SHALL NOT block the build.
- WHEN the user adds a real part from the catalogue, THE SYSTEM SHALL write its
  whole spec sheet and record which entry it came from.
- THE SYSTEM SHALL label every field with what reads it — the simulation, a
  compatibility rule, or nothing.
- THE SYSTEM SHALL NOT carry the meaning of a check's outcome in colour alone.

## Acceptance criteria

1. `Build` is no longer `Partial<HardwareConfig>`; `completeBuild` projects a
   `HardwareConfig` from the present parts and the v0.1 numbers are unchanged.
2. A CPU whose socket differs from the motherboard's is reported incompatible in
   words, and the build still runs when the memory path is present.
3. A build with a CPU, board, GPU and PSU but no memory shows a full
   compatibility verdict and no bottleneck run.
4. A PSU missing a connector the GPU needs, and a summed wattage over the PSU's
   rating, are each explained and sourced to their fields.
5. Adding a catalogue part in one selection writes its whole spec and records its
   origin; a build of a matched catalogue set reproduces the v0.1 sim numbers.
6. Every check's outcome carries a word, not only a tint.

## Risks

- **The spine flip is invasive.** `Build` is read in `main.ts`, `panel.ts`,
  `editor.ts`, `parameters.ts`, `limits.ts`, `checks.ts`, `sheet/model.ts` and
  the test fixture. It is one change (B1), compiler-checked, done before any new
  part kind — exactly as both earlier plans handled their own migrations.
- **A rule that lies.** A compatibility rule the sim does not enforce (most of
  them) must never be printed as a simulated result. Mitigated by the `effect`
  flag on every field and by rules naming their `sources`, as today.
- **Catalogue accuracy.** A wrong sticker number teaches the wrong lesson; each
  entry's `identity` names the part it claims to be and the numbers are sourced.
  Mitigated further by B6's curated-representative stance — a small set stays
  checkable — and by importing rather than hand-typing, so the source, not a
  typist, is the authority. The dataset's provenance (a PCPartPicker scrape) is a
  ToS gray area accepted for this non-commercial sandbox, with Wikidata the
  clean fallback.
- **Scope creep into simulation.** The temptation is to simulate the GPU/PSU so a
  verdict exists. That stays the roadmap's deferred v0.2–v0.4 waves; the analyzer
  reports facts and static rules for them.
- **Colour-only meaning.** Every check state needs a redundant cue (repo memory
  invariant); the sheet already renders words beside any tint.

## Non-goals

- Simulating the GPU, storage or PSU bottleneck — deferred to the roadmap's
  component waves; this plan gives them facts and static rules only.
- More than one part of a kind (two DIMMs, two drives) — one part per kind, as
  both earlier plans settle and the roadmap defers.
- Prices, vendors, availability, or any shopping behaviour.
- Sharing a build as a URL — deferred in `component-customization.md`.
- A thermal or power feedback loop — the roadmap's v0.4.

## Appendix: the full compatibility matrix

The complete rule set the analyzer works towards, so no wave has to rediscover
it. Every rule is a walk over `Build` returning a met/not-met outcome that names
its `sources`, and **none blocks the run** — a broken rule is explained, which is
the whole point of the sandbox. Severity only groups the presentation:
`incompatible` (the parts cannot work together) versus `warning` (they work, but
below spec, at risk, or needing a caveat like a BIOS update).

Almost every field a rule reads is **compatibility-only** — the simulation
ignores it — so it is marked `validated` in the registry. The few fields the sim
already reads are flagged in the last column.

### Fields each part kind must carry

The rules below need these fields. A field the model has today is marked; every
other field is new and compatibility-only unless noted.

| Kind | Fields the rules read | Already present? |
| --- | --- | --- |
| CPU | `socket`, `tdpWatts`, `memoryGenerations`, `maxMemoryMtPerSecond`, `maxMemoryBytes`, `integratedGraphics` | only `clockHz`/`cores`/caches (sim) exist |
| Motherboard | `socket`, `chipset` (display-only until a support matrix is sourced), `formFactor`, `allowedGenerations`✓, `dimmSlots`✓, `maxChannels`✓, `maxMtPerSecond`✓, `maxMemoryBytes`, `eccSupport`, `pcieVersion`, `pcieSlots` (lane map), `m2Slots` (key + shared-lane note), `sataPorts`, `powerConnectors`, `atxPowerFormFactor` | four board-cap fields ✓ |
| Memory | `generation`✓, `mtPerSecond`✓, `casLatency`✓, `channels`✓, `capacityBytes`✓, `moduleCount`, `ecc`, `heightMm` | sim fields ✓; count/ecc/height new |
| GPU | `identity`, `pcieVersion`, `pcieLanes`, `lengthMm`, `slotWidth`, `powerConnectorsRequired`, `boardPowerWatts` | none |
| Storage | `identity`, `interface` (`sata`/`nvme-pcie`), `m2FormFactor` (`2280`…), `pcieLanes`, `capacityBytes` | none |
| PSU | `identity`, `wattage`, `formFactor` (`atx`/`sfx`), `connectors` (inventory), `lengthMm` | none |
| Cooler | `identity`, `supportedSockets`, `tdpRatingWatts`, `type` (`air`/`aio`), `heightMm`, `radiatorMm` | none |
| Case | `identity`, `formFactors` (supported), `maxGpuLengthMm`, `maxCoolerHeightMm`, `radiatorSupportMm`, `driveBays`, `psuFormFactor`, `expansionSlots` | none |

### CPU ↔ Motherboard

| Rule id | Reads | Severity | Wave |
| --- | --- | --- | --- |
| `cpu-socket-matches-board` | `cpu.socket`, `motherboard.socket` | incompatible | B2 |

Deferred, needing data the dataset does not cleanly provide: **chipset → CPU
support** (a BIOS-revision matrix, not derivable from a socket plus a chipset
string) and **board VRM adequacy** (there is no VRM rating field). Socket match
covers the common case; both are recorded as future rules that first need an
explicit `chipsetSupportedCpus` / `vrmRatingWatts` field, or they would teach
guesses. `chipset` stays `display-only` until then.

### Motherboard ↔ Memory (and CPU ↔ Memory)

| Rule id | Reads | Severity | Wave |
| --- | --- | --- | --- |
| `board-accepts-generation` ✓ *(exists)* | `memory.generation`, `motherboard.allowedGenerations` | incompatible | shipped → B2 |
| `cpu-controller-accepts-generation` | `memory.generation`, `cpu.memoryGenerations` | incompatible | B2 |
| `modules-within-dimm-slots` | `memory.moduleCount`, `motherboard.dimmSlots` | incompatible | B2 |
| `channels-within-board-cap` ✓ *(exists)* | `memory.channels`, `motherboard.maxChannels` | warning | shipped |
| `channels-within-dimm-slots` ✓ *(exists)* | `memory.channels`, `motherboard.dimmSlots` | warning | shipped |
| `capacity-within-board-max` | `memory.capacityBytes`, `motherboard.maxMemoryBytes` | warning | B2 |
| `capacity-within-cpu-max` | `memory.capacityBytes`, `cpu.maxMemoryBytes` | warning | B2 |
| `speed-within-board-cap` ✓ *(exists)* | `memory.mtPerSecond`, `motherboard.maxMtPerSecond` | warning | shipped |
| `speed-within-cpu-rating` | `memory.mtPerSecond`, `cpu.maxMemoryMtPerSecond` | warning | B2 |
| `ecc-supported` | `memory.ecc`, `motherboard.eccSupport`, `cpu` | warning | B2 |

### GPU

| Rule id | Reads | Severity | Wave |
| --- | --- | --- | --- |
| `gpu-slot-present` | `gpu`, `motherboard.pcieSlots` | incompatible | B3 |
| `display-output-available` | `cpu.integratedGraphics`, `gpu` | warning | B3 |
| `gpu-lanes-available` | `gpu.pcieLanes`, `motherboard.pcieSlots`, `storage` (M.2 occupancy) | warning | B3/B4 |
| `gpu-pcie-generation` | `gpu.pcieVersion`, `motherboard.pcieVersion` | warning (bandwidth) | B3 |
| `gpu-power-connectors-present` | `gpu.powerConnectorsRequired`, `psu.connectors` | incompatible | B3 |
| `gpu-length-fits-case` | `gpu.lengthMm`, `case.maxGpuLengthMm` | incompatible | B5 |
| `gpu-slot-width-fits-case` | `gpu.slotWidth`, `case.expansionSlots` | incompatible | B5 |

### PSU / power budget

| Rule id | Reads | Severity | Wave |
| --- | --- | --- | --- |
| `board-power-connectors-present` | `motherboard.powerConnectors`, `psu.connectors` | incompatible | B3 |
| `psu-wattage-covers-load` | `cpu.tdpWatts`, `gpu.boardPowerWatts`, base overhead, `psu.wattage` | warning | B3 |
| `psu-form-factor-fits-case` | `psu.formFactor`, `case.psuFormFactor` | incompatible | B5 |
| `psu-length-fits-case` | `psu.lengthMm`, `case` clearance | warning | B5 |

### Storage

| Rule id | Reads | Severity | Wave |
| --- | --- | --- | --- |
| `storage-interface-offered` | `storage.interface`, `motherboard.m2Slots`/`sataPorts` | incompatible | B4 |
| `m2-form-factor-supported` | `storage.m2FormFactor`, `motherboard.m2Slots` | warning | B4 |
| `sata-port-available` | `storage.interface`, `motherboard.sataPorts` | warning | B4 |
| `m2-occupancy-shares-lanes` | `storage`, `motherboard` shared-lane map (also drops GPU to ×8) | warning | B4 |
| `drive-bay-available` | `storage`, `case.driveBays` | warning | B5 |

### Cooler

| Rule id | Reads | Severity | Wave |
| --- | --- | --- | --- |
| `cooler-supports-socket` | `cooler.supportedSockets`, `cpu.socket` | incompatible | B4 |
| `cooler-tdp-covers-cpu` | `cooler.tdpRatingWatts`, `cpu.tdpWatts` | warning | B4 |
| `cooler-height-fits-case` | `cooler.heightMm`, `case.maxCoolerHeightMm` | incompatible | B5 |
| `radiator-fits-case` | `cooler.radiatorMm`, `case.radiatorSupportMm` | incompatible | B5 |
| `cooler-clears-memory` | `cooler.type`/height, `memory.heightMm` | warning | B5 |

### Motherboard ↔ Case

| Rule id | Reads | Severity | Wave |
| --- | --- | --- | --- |
| `board-form-factor-fits-case` | `motherboard.formFactor`, `case.formFactors` | incompatible | B5 |

Around thirty-five rules, of which three ship today. Every field they read is
compatibility-only except the memory sim fields the current rules already reuse,
so the whole matrix lands as `validated` descriptors plus rule entries — no
engine change after B1.

## Appendix: mapping the docyx dataset to our schema

Pulled from the dataset's `API.md`. The blunt finding: **it is a listing dataset,
not a compatibility one.** It carries identity, price and the *display* specs, but
most compatibility-critical fields are absent — most glaringly, **the CPU has no
`socket` field at all**. So a bulk import cannot populate the schema; the
catalogue is import **plus enrichment**, which is the second reason (after
teaching) the set stays curated and small.

The one lever that pays for itself: the CPU record *does* carry
`microarchitecture`, and a compact **microarch → { socket, memoryGenerations,
maxMemoryMtPerSecond }** table — a few dozen rows (Alder Lake → LGA1700 + DDR4/
DDR5, Zen 4 → AM5 + DDR5, …) — enriches every CPU the dataset lists. That table
is the highest-value hand-authored artifact in B6.

Legend: **direct** (copy) · **convert** (unit/shape) · **infer** (derive from a
present field) · **enrich** (a hand-authored lookup keyed on a present field) ·
**hand-set** (not in the dataset; set per curated entry) · **default** (a model
constant).

### CPU — `core_count`, `core_clock`, `boost_clock`, `microarchitecture`, `tdp`, `graphics`, `smt`

| Our field | From | How |
| --- | --- | --- |
| `identity` | `name` | direct |
| `cores` | `core_count` | direct (display-only) |
| `clockHz` | — | default: pinned to the model's 4 GHz for the sim (W2 rule) |
| `tdpWatts` | `tdp` | direct |
| `integratedGraphics` | `graphics` | infer (non-null ⇒ true) |
| `socket` | `microarchitecture` | **enrich** (the key table) |
| `memoryGenerations` | `microarchitecture` | **enrich** |
| `maxMemoryMtPerSecond` | `microarchitecture` | enrich, else not-specified |
| `caches` | — | default (the sim uses its fixed hierarchy regardless) |

### Motherboard — `socket`, `form_factor`, `max_memory`, `memory_slots`

| Our field | From | How |
| --- | --- | --- |
| `socket` | `socket` | direct ✓ |
| `formFactor` | `form_factor` | direct ✓ |
| `maxMemoryBytes` | `max_memory` | convert (GB → bytes) |
| `dimmSlots` | `memory_slots` | direct ✓ |
| `allowedGenerations` | `socket` | enrich (AM5 ⇒ DDR5; LGA1700 is DDR4 **or** DDR5, so hand-set per board) |
| `chipset` | `name` | infer/hand-set (display-only) |
| `maxChannels` | `memory_slots` | infer (÷2, min 1) |
| `maxMtPerSecond`, `pcie*`, `m2Slots`, `sataPorts`, `powerConnectors` | — | hand-set / default |

### Memory — `speed` `[gen, MT/s]`, `modules` `[count, GB]`, `cas_latency`, `first_word_latency`

| Our field | From | How |
| --- | --- | --- |
| `generation` | `speed[0]` | convert (`4` ⇒ `ddr4`) |
| `mtPerSecond` | `speed[1]` | direct (the "MHz" label is MT/s) |
| `casLatency` | `cas_latency` | direct ✓ |
| `capacityBytes` | `modules` | convert (`count × size` GB → bytes) |
| `moduleCount` | `modules[0]` | direct |
| `channels` | `modules[0]` | infer (min(count, 2)) |
| `accessOverheadNs` | `first_word_latency` | infer, else default |
| `ecc`, `heightMm` | — | default / hand-set |

### GPU — `chipset`, `memory`, `core_clock`, `length`

| Our field | From | How |
| --- | --- | --- |
| `identity` | `name` | direct |
| `lengthMm` | `length` | direct ✓ |
| `boardPowerWatts` | `chipset` | **enrich** (a GPU-model → TDP table) or hand-set |
| `powerConnectorsRequired` | `chipset` | enrich (from the TDP table) or hand-set |
| `pcieVersion`, `pcieLanes`, `slotWidth` | — | hand-set / default (×16) |

### PSU — `type`, `efficiency`, `wattage`, `modular`

| Our field | From | How |
| --- | --- | --- |
| `wattage` | `wattage` | direct ✓ |
| `formFactor` | `type` | direct (ATX/SFX) ✓ |
| `identity` | `name` | direct |
| `connectors` | — | **hand-set** (the inventory is absent — the biggest PSU gap) |

### Storage — `capacity`, `type`, `form_factor`, `interface`

| Our field | From | How |
| --- | --- | --- |
| `capacityBytes` | `capacity` | convert (GB → bytes) |
| `interface` | `interface` | infer (parse `PCIe`/`SATA`) |
| `m2FormFactor` | `form_factor` | convert (`M.2-2280` ⇒ `2280`) |
| `pcieLanes` | `interface` | infer where the string states it, else default |

### Cooler — `rpm`, `noise_level`, `size`

| Our field | From | How |
| --- | --- | --- |
| `identity` | `name` | direct |
| `radiatorMm` | `size` | direct (AIO) |
| `type` | `size` | infer (radiator size present ⇒ AIO, weak) |
| `supportedSockets`, `tdpRatingWatts`, `heightMm` | — | **hand-set** (all absent) |

### Case — `type`, `psu`, `internal_35_bays`

| Our field | From | How |
| --- | --- | --- |
| `identity` | `name` | direct |
| `formFactors` | `type` | infer (a case fits its size and smaller) |
| `driveBays` | `internal_35_bays` | direct (3.5″ only) |
| `maxGpuLengthMm`, `maxCoolerHeightMm`, `radiatorSupportMm`, `psuFormFactor`, `expansionSlots` | — | **hand-set** (all absent — the physical-fit gap) |

The pattern: the dataset fills **identity + display + the memory path** cleanly,
the **microarch table** unlocks CPU socket and memory support, and the
**physical-fit and connector** fields (PSU connectors, GPU power, cooler
sockets/height, case clearances) are simply not in it and are hand-set per
curated entry. That is affordable precisely because the set is a few dozen parts,
not 66 k — the gap is what forces the curation, not just the pedagogy.
