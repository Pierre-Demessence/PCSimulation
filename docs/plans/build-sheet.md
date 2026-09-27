# Build sheet — the machine described in words

The sandbox has three pictures of the same run and no words. This plan adds the
words: a **build sheet**, a text view that lists every part in the build,
explains each characteristic, derives the limits the parts impose on each other,
and reports what actually happened for the current workload.

It also settles two things the product has outgrown. **Rigs go.** A 2019 rig is a
whole machine handed to the reader, and it is the opposite of the loop the other
plan is building: a build is assembled part by part, each part either entered by
hand or taken from a catalogue of real ones. And **the pictures become two
faces**: the build sheet, which explains, and the visualisation, which shows. The
Flow view is the one picture the two board views already draw better — the same
spans animated as travelling tokens (`src/main.ts@46`,
`src/render/pipeline.ts@77`) — so it is retired and the sheet takes its place.

The loop it adds:

> Add a part, read what it claims, read what it does to the others, then read
> what the run actually did — and see the difference.

## What exists today (grounded)

| Fact | Source |
| --- | --- |
| Every characteristic of every simulated part is already declared as data, with a `label`, `help`, `unit` and an `effect` flag | `src/data/parameters.ts@510` (`partDefinitions`), descriptors at `@186-493`; `@285` and `@380` are the two `display-only` fields |
| The registry covers the CPU (with its three cache levels), memory and the motherboard, and nothing else | `src/data/parameters.ts@19` (`PartId`), `@504` (`PARTS`) |
| A part already declares which config slots it owns, which is what "this part is present" has to mean | `src/data/parameters.ts@94`; the three lists at `@300` (`cpu`, `l1`, `l2`, `l3`), `@422` (`memory`), `@491` (`motherboard`) |
| A build today is one of three whole machines, and the machine is named, loaded and edited as a unit | `src/data/presets.ts@126` (`RIG_PRESETS`), `@96` (`RigPreset`), `@150` (`findPreset`); `src/main.ts@49`, `@55`, `@106-108`, `@184-187`; `src/ui/panel.ts@43` (`buildId`), `@142`, `@213-217` |
| The rig's reach is not one file: seven test files build their fixtures from it | `src/board/labels.test.ts@5`, `@10`; `src/board/layout.test.ts@5`, `@20`; `src/board/solids.test.ts@3`, `@9`, `@45`; `src/data/compat.test.ts@6`, `@9`, `@17`; `src/data/parameters.test.ts@10`, `@15`; `src/sim/engine.test.ts@5`, `@21` and `rig-2019` throughout it; `src/ui/editor.test.ts@6`, `@11` |
| Every number a derived limit needs already exists in the core | `src/sim/memory.ts@18` `aggregateBandwidthBytesPerNs`, `@26` `casLatencyNs`, `@34` `fullAccessNs`; `src/sim/engine.ts@16` `DEFAULT_LINE_BYTES = 64` |
| A finished run reports everything a verdict needs — time, achieved bandwidth, mean latency, stall, hit rates, outstanding counts, per-resource utilisation and the classification | `src/sim/types.ts` `SimResult` (`elapsedNs` at `@105`) |
| One formatter per unit already exists, and descriptors deliberately carry no formatter | `src/render/format.ts@60` `formatUnit` |
| The board's rules produce warnings and never block a run; the panel is their only reader | `src/data/compat.ts` `validateConfiguration`, consumed at `src/main.ts@161` |
| The board's memory cap warns but is **not** a throttle: the engine reads the DIMM's own rate | `src/sim/engine.ts@283`, `@299` call `fullAccessNs`/`transferNs` with `config.memory`; nothing in `src/sim/` reads `maxMtPerSecond` |
| Five drawn parts sit outside the model entirely, and the part table is module-private | `src/board/layout.ts@27` (`PARTS`); `levelId: null` at `@79` (gpu), `@88` (m2), `@97` (chipset), `@106` (storage), `@115` (psu) |
| A part outside the model already says so, in one place | `src/render/describe.ts` — the `not simulated yet` branch |
| The Flow view is self-contained: its canvas, its class, and four helpers whose only other reader is its own test | `index.html@27-33`; `src/render/pipeline.ts@77` `PipelineView`, `@20` `levelLabel`, `@50` `simulatedNsAt`, `@61` `countActiveSpans`, `@90` `PipelineView.windowOf`; `src/render/index.ts@18-19`; `src/main.ts@46`, `@122` |
| Three of those helpers outlive it, and two are already imported elsewhere | `src/ui/panel.ts@5` (`levelLabel`, used at `@225`); `src/main.ts@8` (`simulatedNsAt`); `windowOf` is still called at `src/main.ts@122` |
| Its one shared helper is used *inside* the surviving board layer, by `roundTripProgress` | `src/board/flow.ts@50` `travelsBackUp`, called at `@69` |
| The picture fills the viewport and two floating windows open over its top-left corner | `src/styles.css@47-52` (`.stage`); `src/ui/windows.tsx@34`, `@44` (both windows at `y: 16`) |

The sheet's whole job is to say true things about a build, so the traps are the
usual ones for prose:

- **A ceiling is not a mechanic.** The board's memory cap is a rule the core
  does not implement. A sheet that printed "the board caps this at 3200 MT/s"
  beside a run that used the DIMM's full 6000 would describe a machine that does
  not exist in the code.
- **A number the sheet restates will drift.** Every figure it prints has a
  function that produces it, and the sheet must call that function. The same is
  true of a *rule*: a second copy of the board's checks will drift from the
  first.
- **A verdict for an unmodeled part is a lie.** Nothing simulates the GPU, so
  the sheet cannot report its utilisation — only its facts and its limits.
- **A document opened under two floating windows has no first line.** The
  verdict is the first thing the reader needs and the control windows open
  exactly there.
- **A machine the reader did not ask for is not a build.** Pre-filling a part,
  or silently completing a build so it can run, is the rig idea wearing a
  different hat — and it teaches the reader that a PC arrives assembled.

## What the sheet says

Five kinds of statement, never mixed, because they have different truth
conditions:

1. **What the parts claim.** One block per part, one row per characteristic,
   each with its value, what reads it (`simulated`, `validated`, `display-only`)
   and the help text the registry already carries. This is the registry rendered
   as a document instead of as a bench.
2. **What the parts do to each other.** A **limit** is derived from the build and
   always true. Two kinds, and the kind *is* the arithmetic:
   - a **ceiling** is a rate, and rates take the **minimum** — the slowest link
     wins;
   - a **floor** is a delay, and delays **add up** — a full miss is
     L1 + L2 + L3 + DRAM.

   A ceiling names the operand that sets it and how much headroom the others
   leave unused. Only ceilings compete, and only within one unit: ceilings of
   different units are not comparable, and a limit alone in its unit is marked
   as such rather than as binding.
3. **What this run did.** The verdict, from `SimResult`: the classification, the
   saturated resource, achieved bandwidth, mean latency and the core's stall —
   every figure named as measured, beside the limit it should be compared with.
4. **What the build is missing.** Which parts have not been added, and therefore
   which of the three blocks above cannot be produced yet. A build with no memory
   has no memory limit and no run, and the sheet says so rather than inventing
   one.
5. **What is out of spec.** A **check** is a rule that can be met or broken
   (generation accepted, channels within the board's cap, channels within the
   DIMM slots, speed within the board's cap, lanes available, connectors
   present).
   A broken check is explained in plain language and sourced to the rule and the
   fields that broke it — and it **never** blocks the run. The DDR5-8000 DIMM in
   a 3200 MT/s board is exactly the comparison the sandbox exists to make.

A build starts empty. It looks like this before anything is added:

```text
This build cannot run yet: it has no CPU, no memory and no motherboard.
```

And like this once the three core parts are in. Each is entered by hand, because
the catalogue of real parts is the other plan's W2 and has not started; a
catalogue part will add its own name to the block when it does.

```text
BUILD — assembled by hand; 3 parts

THIS RUN
  Resource-bound — memory
  Achieved 51.2 GB/s, which is the whole ceiling · 250 µs for 200,000 accesses
  The dependency chain is not the limiter here; the memory channel is.

CEILINGS (rates — within one unit, the tightest wins)
  Memory bandwidth           51.2 GB/s   binding
      memory.mtPerSecond × 1e6 × 8 B × memory.channels ÷ 1e9
      →  3200 × 1e6 × 8 × 2 ÷ 1e9
  Memory-level parallelism  175.5 GB/s   not binding — 3.4× more than needed
      caches.l1.maxOutstandingMisses × DEFAULT_LINE_BYTES ÷ fullAccessNs(memory)
      →  192 × 64 B ÷ 70 ns
  Board memory cap           51.2 GB/s   equal, so the board is not the reason
      motherboard.maxMtPerSecond × 1e6 × 8 B × memory.channels ÷ 1e9
      ⚠ this run does not enforce the cap: it simulated the DIMM's own rate
  Core issue rate            4 per ns   the only limit of its unit
      cpu.clockHz ÷ CYCLES_PER_ISSUE   →  4 GHz ÷ 1

FLOORS (delays; they add up — a real run can only be slower)
  Full-miss latency          90 ns
      l1.hitTimeNs 1 + l2.hitTimeNs 4 + l3.hitTimeNs 15 + fullAccessNs(memory) 70

CHECKS
  met   DDR4 memory accepted by this board
  met   2 channels, and the board supports 2
  met   2 channels need 2 DIMMs, and the board has 4 slots
  met   3200 MT/s, and the board's ceiling is 3200 MT/s

PARTS
  CPU — entered by hand
    Clock        4 GHz          simulated     How fast the core issues...
    Cores        1              display-only  Nothing reads this; one core is modelled...
    L1 capacity  32 KiB         simulated     ...
    L1 ways      8              simulated     ...
    L2 and L3    five rows each  simulated     ...
  Memory — entered by hand
    Generation   DDR4           validated     ...
    Speed        3200 MT/s      simulated     ...
    five more characteristics, each on its own row
  Motherboard — entered by hand
    four characteristics, each on its own row

NOT PART OF THIS BUILD YET (the model does not reach them)
  Graphics card (PCIe ×16) · M.2 slot · chipset · drives · power delivery
```

That one build carries the sheet's most useful sentence. The parallelism ceiling
sits *above* the bandwidth ceiling here, which is why one core can saturate this
DIMM. Swap in DDR5-5600 in two channels and it is still bandwidth-bound: the
ceiling is 89.6 GB/s, and the run achieved the 89.5 GB/s `README.md` prints.
Change one more thing, to four populated channels on a four-channel board, and
the two swap places: the memory claims 179.2 GB/s while the L1 budget can only
feed 168.7 GB/s, so the parallelism ceiling binds instead. That contrast is
arithmetic rather than opinion, and it is two parts swapped.

Note that the CPU block is honest about what the model has: one core, a fixed
issue rate, and therefore a `cores` value that moves nothing. Naming a real CPU
in the catalogue does not change that until a wave gives the core a model —
which is why the CPU above is entered by hand rather than named.

## Decisions

- **A build is assembled, and it may be incomplete.** `Build.parts` is a
  `Partial<HardwareConfig>`, so a part can be absent. A new build has three
  parts to add and no run; `buildLimits` and `buildChecks` return only the rows
  the present parts can support; the sheet lists what is missing; and `simulate`
  is called only through `completeBuild(build)`. Without this the sheet would
  have to describe a machine nobody assembled — the rig by another name.
  `parts`, not `core`: `build.core.cpu.cores` is a collision waiting to be read
  wrong.
- **The registry takes a partial config, or S1 does not compile.** `applyParameter`
  and every part's `read`/`write` are typed over a complete `HardwareConfig`
  (`src/data/parameters.ts@110-118`), so they cannot be handed a build that has
  no memory. S1 owns the change, because S1 introduces the partial build and the
  compiler forces it the moment `PartEditor.update` calls
  `definition.read(config)`. The signatures become
  `read: (parts: Partial<HardwareConfig>) => Part | null`,
  `write: (parts: Partial<HardwareConfig>, part: Part) => Partial<HardwareConfig>`
  and `applyParameter(build: Build, …) => { build, refused }`.
- **One definition of "absent".** `read` returns null when any slot the part owns
  is missing, and that null *is* `hasPart` — one predicate, so the editor, the
  picker and the sheet cannot disagree about whether this build has a CPU. A test
  asserts it agrees with the `slots` each `PartDefinition` declares.
- **Editing an absent part is refused, not an error.** `applyParameter` is public
  and its tests drive it directly, so an absent part returns
  `refused: 'this build has no CPU yet'` with the build unchanged, exactly as an
  impossible value does. The bench makes it unreachable, but the API still has to
  answer.
- **Presence is one predicate, not two.** `hasPart` is exactly
  `PartDefinition.read(build.parts) !== null` (`src/data/parameters.ts@104`), so
  a part is present when every slot it owns can be read, and absent otherwise.
  The `slots` it owns are what `read` consults, not a second definition: a slot
  walk beside it would answer the same question by another route, and the picker,
  the editor and the sheet would drift apart about whether a build has a CPU.
- **The rig concept is deleted, product-wide.** `RIG_PRESETS`, `RigPreset`,
  `findPreset`, `PanelState.buildId` and the rig `<select>` all go, with the
  custom-rig option that existed only to name a hand-edited machine. The panel's
  "Rig" slot is replaced by the part picker. This is not a rename: seven test
  files build their fixtures from `findPreset`/`RIG_PRESETS` (see the table
  above), and they need a fixture that is theirs rather than the product's.
- **A test fixture is not a product concept.** The tests still need *a* complete
  build to simulate. That fixture moves beside the tests (`src/testing/build.ts`)
  and is written as explicit parts, so the product carries no pre-assembled
  machine and the tests carry no illusion of one. `memorySpec`
  (`src/data/presets.ts@79`) stays, because a constructor for a DIMM from its
  sticker numbers is exactly what "enter your own part" needs; `RIG_PRESETS` and
  its `rig()` builder do not.
- **Nothing is pre-filled, and a blank part is one part, never a machine.** A
  spec cannot be empty (`src/sim/types.ts@12-68` has no optional field), so
  "enter your own" writes the part's own blank into the slots it owns. One
  mechanism, visible on screen as the part's initial values, and it is one part,
  never a machine. It is a blank rather than a recommendation: the board-cap
  lesson is reached in S1 by moving `motherboard.maxMtPerSecond`, which is a
  descriptor like any other, and the catalogue's three generation-matched boards
  are W2's entries, not blanks.
- **The blank part lives on the `PartDefinition`, not on each descriptor.**
  `PartDefinition<Part>` carries `blank: Part` (`src/data/parameters.ts@103`),
  the part's own starting values defined beside its descriptors. A `default` per
  descriptor cannot assemble a blank: a spec's `id`, `role` and derived fields
  (`serviceTimeNs`, `MemorySpec.id`) are not descriptors, so defaults alone are
  not enough. A test builds every part from its blank and simulates it.
- **Two faces, and the Flow view is deleted, not hidden.** `ViewMode` becomes
  `'sheet' | 'visual'` with a `visualKind` of `'board' | 'model'`, so the code
  states the product's own two faces instead of leaving them as three peers.
  `src/render/pipeline.ts`, `src/render/pipeline.test.ts` and the `#pipeline`
  canvas all go, and `countActiveSpans` dies with the view that was its only
  caller. `levelLabel`, `simulatedNsAt` and `windowOf` move to
  `src/render/format.ts`, where `fitNsPerSecond` and the playback-speed limits
  already live, because they are the playback clock's arithmetic and its labels;
  they are added to that module's existing export block in
  `src/render/index.ts@4-17`, so `src/main.ts@8` and `src/ui/panel.ts@5` keep
  their import. No re-export shim under the old module name.
- **`travelsBackUp` is no longer exported.** Its only consumer outside the board
  layer was the Flow view (`src/board/index.ts@1`), and inside the layer its only
  caller is `roundTripProgress` (`src/board/flow.ts@69`) — not `progressOf`. Its
  assertions move to a `roundTripProgress` test, and `travelsBackUp` leaves the
  import at `src/board/flow.test.ts@5`.
- **The sheet is a full-page surface, not a child of the stage.** The windows
  open at the top-left (`src/ui/windows.tsx@34`, `@44`) — exactly where a
  document's first line goes — so a sheet drawn inside `.stage` would be born
  covered. `<section id="sheet">` is a sibling of `.stage`, fixed and inset,
  with its own scroll; `applyViewMode()` toggles one or the other and hides the
  window layer with the stage. "The windows can be moved" is not a mitigation
  for a default that hides the verdict.
- **The reader is never trapped, and never loses the bench.** The **face
  switcher** sits among the build-level controls, so it is on screen in both
  faces and the way back is always in view. The **part picker, the workload
  select and the bench** travel with the reader: they sit in the Controls window
  while the visualisation is up and are adopted into the sheet's sidebar while
  the sheet is up, moved rather than copied. `ControlPanel` therefore exposes a
  third element, `buildControlsElement`, and the picture-only controls (Explode,
  Speed, Animation, Restart, Reset view) stay behind in the window. There is
  still exactly one `<select>` per choice and one piece of state.
- **The face switcher is not duplicated.** One switcher lives in the panel's
  build-level controls, which the sheet adopts into its sidebar, so the same
  control is on screen in both faces and the reader is never trapped. A second
  switcher in the sheet would be a second node mirroring the same state — two
  controls to keep in step, and two places for the face to change.
- **The sheet is the answer first and the reference last.** Verdict, then
  ceilings, then floors, then checks, then the parts. A reader who wants "what
  is slow" gets it in the first line; a reader who wants "what does CL mean"
  scrolls to the part block. The alternative order makes the sheet a spec sheet
  with an appendix, which is the opposite of what it is for.
- **Every block is conditional.** The sheet renders `THIS RUN`, `CEILINGS`,
  `FLOORS`, `CHECKS`, `PARTS`, `NOT PART OF THIS BUILD YET` and `MISSING` only
  when each has something to report, because an empty build otherwise renders a
  run of bare headings with nothing beneath them. The head — the title and the
  verdict — is the one block that is always present, and its verdict always says
  something, even when that is only what to add.
- **The parts block is generated, never written.** It walks `partDefinitions()`
  and renders each descriptor's `label`, `help`, `effect` and current value. A
  numeric descriptor formats through `formatUnit`; a `choice` or `flags`
  descriptor shows the label of the option it already carries (`generation` at
  `src/data/parameters.ts@320`, `allowedGenerations` at `@473` — neither carries
  a `unit`, so neither can go through `formatUnit`). The sheet adds no help text
  and no formatter of its own, so the bench and the sheet cannot describe one
  characteristic two ways.
- **The model writes the prose; the renderer only builds elements.**
  `src/sheet/model.ts` produces every string the reader sees, importing the
  existing helpers (`src/render/format.ts`) plus the descriptors' own option
  labels; `src/ui/sheet.ts` formats nothing. A limit therefore becomes a
  `RenderedLimit` on the way out, so the renderer never holds a raw number and
  cannot format one differently. This adds two dependency edges —
  `src/sheet/` → `src/render/format.ts` (pure, no canvas) and `src/sheet/` →
  `src/board` (for the drawn-part list) — which are allowed; only
  `src/board/` → `src/render/` is forbidden.
- **Ceilings and floors are separate because the operators are separate.**
  `kind: 'ceiling' | 'floor'` is not decoration: it decides whether the value is
  a minimum of rates or a sum of delays. The two are presented in separate
  blocks and never compared, because a delay is not a rate and "the run fell
  short of a delay floor" is meaningless — a run's latency can only be worse
  than the unloaded floor.
- **Claims and mechanics are separated in the text, once.** Where a rule is not
  implemented as a mechanic — the board's memory cap is the live example today —
  the limit carries a note saying the run does not enforce it. A test pins that
  note, so a later wave that makes the cap a real throttle fails the test and is
  forced to update the prose.
- **One rule, two presentations.** `src/data/compat.ts` exports its rules as
  data, and `validateConfiguration` becomes a walk over them; `buildChecks`
  reads the same list. The positivity guards the rules already carry
  (`channels ≥ 1`, `mtPerSecond ≥ 1`, `casLatency ≥ 1`, the four outstanding-miss
  checks) stay in that walk and are **not** given sheet rows: the descriptors'
  minima make them unreachable from the editor, so a row for them would describe
  a state the UI cannot produce. They keep reaching the reader through the
  warnings line (`src/ui/panel.ts`), which is hidden while the sheet is up, so
  nothing is shown twice.
- **Unmodeled parts get facts, not parameters.** A part the model does not reach
  has no characteristics the user can vary one at a time, because nothing reads
  them. It carries a `Fact` list — a label, a value and a note saying what it
  *would* constrain and why nothing simulates it yet — and no verdict. When a
  wave gives it a simulation, its facts become `Parameter`s exactly as memory's
  did, and nothing else about the sheet changes.
- **A single part is a limit of the model, not a fact about the build.** One
  memory part, one board and one drive are what the model can consume, not what
  the reader owns. A block that lists "Storage: 1 TB NVMe" with no note tells a
  reader with two drives something false about their own machine, so the sheet
  says so in words — the same rule that makes `cores` and memory's
  `capacityBytes` `display-only` rather than implied to matter.
- **The sheet re-renders with the run it describes.** `rebuild()` already
  produces the `SimResult` the picture and the cards read; the sheet reads the
  same object in the same call, so the verdict in words and the verdict in the
  picture cannot come from different runs.
- **No meaning by colour.** A broken check, a binding ceiling and a
  `display-only` characteristic each carry a word (`not met`, `binding`,
  `display-only`). A tint is never the only difference, and where a table is
  drawn the word is in the cell.
- **The unit travels beside the value, as the registry already does it.**
  `docs/codebase.md`'s "Units are explicit in every name" convention is not
  violated by `Limit.value`, because the descriptor registry already pairs a
  unit-agnostic `value` with a `unit` field (`src/data/parameters.ts`,
  `ParameterBase.unit`) precisely so one formatter per unit can render
  everywhere. The sheet inherits that exception rather than inventing a second
  one.

## Data model

Fictional but complete enough to start. Honours `erasableSyntaxOnly` and
`verbatimModuleSyntax`, and keeps the core's inputs unchanged.

```ts
// src/data/build.ts
import type { HardwareConfig } from '@/sim';

import type { PartId } from './parameters';

/**
 * A build in progress. Parts arrive one at a time, so the core config is
 * partial: a build with no memory has no memory. Nothing here is filled in for
 * the reader, because a machine nobody assembled is the rig concept renamed.
 */
export interface Build {
  readonly parts: Partial<HardwareConfig>;
  // S2 adds gpu, storage and psu. Nothing else about the shape changes.
}

/**
 * True when every slot this part owns is present. Defined once, as the part's
 * `read` returning non-null, so the editor, the picker and the sheet cannot
 * disagree about what "this build has a CPU" means.
 */
export function hasPart(build: Build, part: PartId): boolean;

/** The parts still missing, in the order the sheet asks for them. */
export function missingParts(build: Build): readonly PartId[];

/** The complete build the core consumes, or null while a part is missing. */
export function completeBuild(build: Build): HardwareConfig | null;
```

```ts
// src/data/limits.ts
import type { ParameterUnit } from './parameters';
import type { HardwareConfig } from '@/sim';

/** One field a limit is built from, named so a reader can check the arithmetic. */
export interface LimitInput {
  /** The field, dotted as the code spells it: `memory.mtPerSecond`. */
  readonly source: string;
  readonly value: number;
  readonly unit: ParameterUnit;
}

/**
 * A derived limit. `kind` decides the arithmetic: a ceiling is a minimum of
 * rates, a floor is a sum of delays. Both are always true for this build.
 */
export interface Limit {
  readonly id: string;
  readonly label: string;
  readonly kind: 'ceiling' | 'floor';
  readonly value: number;
  readonly unit: ParameterUnit;
  readonly inputs: readonly LimitInput[];
  /** The arithmetic in the reader's terms: `memory.mtPerSecond × 8 B × channels`. */
  readonly expression: string;
  /**
   * True when this limit sets the minimum of a unit group with more than one
   * member. Floors never bind, and a limit alone in its unit is not "binding" —
   * nothing competes with it. On a tie only one member binds: the first in the
   * group's declared order, and the others report their headroom as the reason
   * they are not it.
   */
  readonly binding: boolean;
  /** Set when the model does not enforce this: the run may exceed it. */
  readonly notEnforcedBy?: string;
}

/**
 * Every ceiling and floor the *present* parts support. A build missing a part
 * yields fewer limits rather than defaults for the absent one.
 */
export function buildLimits(parts: Partial<HardwareConfig>): readonly Limit[];

// src/data/checks.ts
/** A rule that can be met or broken, stated so the reader can check it. */
export interface Check {
  readonly id: string;
  readonly statement: string;
  /** The rule's own wording, from the single list `validateConfiguration` walks. */
  readonly rule: string;
  readonly sources: readonly string[];
  readonly met: boolean;
}

export function buildChecks(parts: Partial<HardwareConfig>): readonly Check[];
```

```ts
// src/sheet/model.ts
import type { Check } from '@/data';
import type { Build, PartId } from '@/data';
import type { LevelId, SimResult } from '@/sim';
import type { WorkloadKind } from '@/workloads';

/** One characteristic of one part, already written out for the reader. */
export interface CharacteristicRow {
  /** The descriptor's own id, so a test can assert one row per descriptor. */
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly effect: 'display-only' | 'simulated' | 'validated';
  readonly help: string;
}

export interface PartSection {
  readonly part: PartId;
  readonly title: string;
  /** The template it was loaded from, or that it was entered by hand. */
  readonly origin: string | null;
  readonly rows: readonly CharacteristicRow[];
}

/**
 * A limit written out for the reader. The raw `Limit` never leaves `src/data`,
 * so the renderer has no number to format and cannot format one differently.
 */
export interface RenderedLimit {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly expression: string;
  /** The inputs in the reader's terms, one per line, so the arithmetic is checkable. */
  readonly workings: readonly string[];
  readonly binding: boolean;
  readonly note: string | null;
}

/** A part the model does not reach: facts only. There is no verdict field. */
export interface UnmodeledSection {
  readonly id: string;
  readonly title: string;
  readonly facts: readonly {
    readonly label: string;
    readonly value: string;
    readonly note: string;
  }[];
}

export interface MeasuredFigure {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

export interface BuildSheet {
  readonly title: string;
  /** The verdict, or why there cannot be one yet. Never empty. */
  readonly verdict: string;
  /** The resource the run saturated, as a `LevelId`, or null when none did. */
  readonly limiterId: LevelId | null;
  /** The parts this build has not added yet; non-empty means `result` is null. */
  readonly missing: readonly PartId[];
  readonly measured: readonly MeasuredFigure[];
  readonly ceilings: readonly RenderedLimit[];
  readonly floors: readonly RenderedLimit[];
  readonly checks: readonly Check[];
  readonly parts: readonly PartSection[];
  readonly unmodeled: readonly UnmodeledSection[];
}

export interface BuildSheetInput {
  readonly build: Build;
  readonly origin: Partial<Record<PartId, string>>;
  readonly workload: WorkloadKind;
  /** Null while the build is missing a part, because no run exists. */
  readonly result: SimResult | null;
}

export function buildSheet(input: BuildSheetInput): BuildSheet;
```

The parts the model does not reach, which arrive with S2 and never reach the
core:

```ts
// src/data/build-parts.ts
/** Facts only. No field here is read by `simulate`, and the sheet says so. */
export interface GpuSpec {
  readonly id: string;
  readonly identity: string;
  readonly pcieGeneration: 3 | 4 | 5;
  readonly pcieLanes: number;
  /** The display link the card can drive, in bytes per nanosecond. */
  readonly linkBytesPerNs: number;
}
```

`PanelState` loses `presetId`-by-another-name and gains the build:

```ts
export interface PanelState {
  /** The build in progress; a part may be absent until it is added. */
  readonly build: Build;
  /** Which part is on the bench, and which of its characteristics is varied. */
  readonly part: PartId;
  readonly characteristic: string;
  /** The template each part was loaded from; absent means entered by hand. */
  readonly origin: Partial<Record<PartId, string>>;
  readonly view: 'sheet' | 'visual';
  readonly visualKind: 'board' | 'model';
  // ...unchanged: workloadKind, explode, nsPerSecond, playing
}
```

`buildId` goes with the rigs, and the playback refit goes with it: what is left
is `refitPlayback` (`src/main.ts@78`), set by the `buildId`/`workloadKind` branch
(`@221-226`) and keyed on what actually changes the timescale — the workload and
the memory rate — so a characteristic drag does not re-fit the speed on every
move, which is what the comment at `@152-155` is protecting.

## Waves

| Wave | Deliverable | Status |
| --- | --- | --- |
| S1 | Two faces; rigs deleted; the assembled build; the sheet over the memory path | shipped |
| S2 | Parts the model does not reach: GPU facts, the PCIe lane budget | not started |
| S3 | Storage: interface ceilings, M.2 and SATA topology, lane splitting | not started |
| S4 | Power: connectors and a wattage budget | not started |

### S1 — Two faces, the assembled build, and the sheet

- [x] Delete the rig concept. Remove `RIG_PRESETS`, `RigPreset` and `findPreset`
      (`src/data/presets.ts@96`, `@126`, `@150`) and their barrel exports
      (`src/data/index.ts@22`, `@26`); `PanelState.buildId` and `PanelOptions.presets`
      (`src/ui/panel.ts@43`, `@47`), the rig `<select>` and its listener (`@142`),
      the custom-rig option and its `syncState` branch (`@90`, `@213-217`); and in
      `src/main.ts` the opening lookup (`@49-51`), its throw (`@51`), the state
      field (`@55`), `buildTitle` (`@105-108`), the `applyPatch` rig branch
      (`@184-187`) and the `presets:` option (`@261`). Keep `memorySpec`
      (`src/data/presets.ts@79`); keep `BASELINE_CPU` and `CACHE_HIERARCHY` as
      they are — with the blank S1 gives the CPU part, they are what
      "enter your own" produces.
- [x] Give the tests their own fixture, since they are the rig's other seven
      users: `src/board/labels.test.ts@5`, `@10`; `src/board/layout.test.ts@5`,
      `@20`; `src/board/solids.test.ts@3`, `@9`, `@45`; `src/data/compat.test.ts@6`,
      `@9`, `@17`; `src/data/parameters.test.ts@10`, `@15`; `src/sim/engine.test.ts@5`,
      `@21` and every `rig-2019` call in it; `src/ui/editor.test.ts@6`, `@11`.
      The fixture is a complete build written out as explicit parts, living beside
      the tests.
- [x] Add `src/data/build.ts` + test: `Build` as a `Partial<HardwareConfig>`,
      `hasPart` (via `PartDefinition.read` returning null,
      `src/data/parameters.ts@104`), `missingParts` and `completeBuild`. A build
      with a CPU and a cache hierarchy but no memory has a CPU part and no memory
      part.
- [x] Move `PanelState.build` to the `Build` and take the core from
      `state.build.parts`, as one atomic change: the state literal
      (`src/main.ts@53-66`), the config binding (`@117`), `applyPatch` (`@187`,
      `@190`), the `onChange` branch (`@228`), `panel.update`/`syncState`
      (`src/ui/panel.ts@189`, `@220`) and `PartEditor.update`
      (`src/ui/editor.ts@126`). No test constructs a `PanelState` today, so the
      compiler is the check; S1's sheet tests are the first that will.
- [x] Guard the run: `rebuild()` calls `simulate` only with
      `completeBuild(build)`, and passes `null` to the sheet otherwise. The
      picture and the cards must stop rendering rather than simulate a machine
      nobody assembled.
- [x] Retire the Flow view. Delete `src/render/pipeline.ts` and
      `src/render/pipeline.test.ts`; delete the `#pipeline` canvas and its
      `aria-label` (`index.html@27-33`); remove `flow` from `VIEW_LABELS`
      (`src/ui/panel.ts@55`) and from the population loop (`@121`); remove the
      `PipelineData` import (`src/main.ts@1`), the `PipelineView` field (`@46`),
      the `PipelineData` object and `view.setData` in `rebuild()` (`@126-141` —
      note `subtitle` is built there and is shared with `boardData`), and the
      `view.render` branch of `tick()` (`@249-250`). There are no pipeline rules
      in `src/styles.css` to remove; `.stage` sizes canvas children only.
- [x] Move what survives into `src/render/format.ts`: `levelLabel`
      (`src/render/pipeline.ts@20`), `simulatedNsAt` (`@50`) and the window
      reduction as a free `windowOf(spans)` (`PipelineView.windowOf`, `@90`,
      called at `src/main.ts@122`). Add all three to the existing export block
      in `src/render/index.ts@4-17`, so `src/ui/panel.ts@5` and
      `src/main.ts@8` keep importing from `@/render`.
- [x] Move the `simulatedNsAt` cases (`src/render/pipeline.test.ts@17-26`) and
      the `windowOf` cases (`@48-55`) into `src/render/format.test.ts`, so the
      helpers keep their coverage after the file they lived in is deleted.
      `countActiveSpans` (`@61`) dies with the view.
- [x] Un-export `travelsBackUp` (`src/board/flow.ts@50`, barrel at
      `src/board/index.ts@1`) and move its assertions
      (`src/board/flow.test.ts@48-53`) into a `roundTripProgress` test, its only
      caller (`src/board/flow.ts@69`). Drop the direct import at
      `src/board/flow.test.ts@5`.
- [x] `ViewMode` becomes `'sheet' | 'visual'` and `PanelState` gains
      `visualKind: 'board' | 'model'` (`src/ui/panel.ts@23`, state literal
      `src/main.ts@53-66`). Trace the whole view state: `VIEW_LABELS` (`@55`),
      the population loop (`@121`), the `viewSelect` tooltip that names the Flow
      view (`@127-128`), the change handler (`@147-148`), the assign in
      `syncState` (`@205`) and the `slot('View', …)` grouping (`@164`); the type
      re-export at `src/ui/index.ts@2`; and in `src/main.ts`, `applyViewMode()`
      (`@86-90`, and its first call at `@269`), the `onChange` branch (`@211`,
      which must react to `visualKind` as well as `view` and `explode`) and the
      `tick()` branch (`@249-250`). `visualKind` needs a control of its own —
      `3D` or `flat`, in the picture-only element, since it chooses between two
      pictures rather than between the two faces — with its own listener and its
      own line in `syncState`; without it the flat board becomes unreachable.
- [x] Make the sheet a real surface: add `<section id="sheet">` to `index.html`
      as a sibling of `.stage`, with rules in `src/styles.css` (`position:
      fixed`, `inset: 0`, its own scroll, the type scale a document needs, and
      `#sheet[hidden] { display: none }`).
- [x] Hide the window layer while the sheet is the active face:
      `applyViewMode()` sets `#ui` hidden along with `.stage`, and the sheet's
      stacking must beat winkit's `.wk-layer` even if the layer is ever left
      visible. Without this step the sheet is covered by the two windows that
      open at `y: 16` — the regression the surface decision exists to prevent.
- [x] Split `ControlPanel.controlsElement` into a build-level element (the face
      switcher, the part picker, the workload select, the bench) and a
      picture-only element (Explode, Speed, Animation, Restart, Reset view); the
      face switcher stays in the build-level element, so it reaches both faces
      with the travelling controls and needs no second copy. `mountWindows`
      (`src/ui/windows.tsx`) keeps adopting the picture-only element into the
      Controls window; the sheet adopts the build-level element while it is up,
      moving the same nodes. Restart and Reset view are locals inside `build()`
      (`src/ui/panel.ts@135`, `@137`), which is fine — they are appended to the
      picture-only host there and never referenced again.
- [x] The part picker: one `<select>` per `PartId`, offering "not added" and
      "enter your own". Choosing "enter your own" writes that part's own blank
      into the slots it owns; "not added" is only offered while the part is
      absent, so a build cannot silently lose a part it was measured with. When
      the customization plan's W2 lands, its catalogue entries join this same
      control and go through `applyTemplate` — the picker is built for that from
      the start, and S1 ships it with one route.
- [x] Give each `PartDefinition` its `blank: Part` — the part's own starting
      values, defined next to its descriptors (`src/data/parameters.ts@103`) —
      which is what makes a blank part expressible without inventing a
      pre-assembled one. The blank is a starting point rather than a
      recommendation, and the picker names it as one.
- [x] Check that the blanks are legal specs, not merely non-empty ones. Both real
      invariants bite the blank route precisely because it bypasses
      `applyParameter`: a cache capacity below `ways × lineBytes` makes
      `SetAssociativeCache` throw (`src/sim/cache.ts@28`), and a set count over
      `MAX_SETS` (`src/data/parameters.ts@128`) is an allocation rather than a
      number. Both already have refusals the editor cannot reach
      (`src/data/parameters.test.ts@156`, `@175`). One test builds every part from
      its blanks and simulates it, modelled on the sweep at `@201`.
- [x] Build the blanks through the shape `applyParameter` already uses:
      `ErasedParameter` (`src/data/parameters.ts@514-515`) is how a part is
      driven without knowing its type. Reuse it rather than writing a second
      erased shape beside it.
- [x] Change the registry to the partial config: `read`, `write`,
      `applyParameter` and `applyTemplate` take `Partial<HardwareConfig>` and
      return a part or null (`src/data/parameters.ts@110-118`, `@510`, `@533`).
      `hasPart` is `read(...) !== null` — one predicate — and an edit on an
      absent part is refused rather than thrown.
- [x] The bench cannot add a part behind the picker's back: while the selected
      part is absent, `PartEditor` shows it as absent and disables its controls,
      so the only thing that makes a part appear is the picker. Without this an
      edit would write a part in through `applyParameter` and the build would
      assemble itself.
- [x] Add `src/data/limits.ts` + `src/data/limits.test.ts`, with the four
      ceilings the worked example shows and one floor: the DIMM's own bandwidth
      (`aggregateBandwidthBytesPerNs(memory)`), the board's memory cap as a
      ceiling of its own (from `motherboard.maxMtPerSecond`, carrying
      `notEnforcedBy` because the run uses the DIMM's rate instead), the
      memory-level parallelism ceiling
      (`caches.l1.maxOutstandingMisses × DEFAULT_LINE_BYTES ÷
      fullAccessNs(memory)`), the core issue rate, and the full-miss latency
      floor (`l1 + l2 + l3 + fullAccessNs`). Every value comes from
      `src/sim/memory.ts@18`, `@26`, `@34`, `src/sim/engine.ts@16`
      (`DEFAULT_LINE_BYTES`), `src/data/presets.ts` (`CYCLES_PER_ISSUE`) and the
      specs' own `hitTimeNs` fields — never from a literal. Widen `ParameterUnit`
      with `'per-ns'` and add its `formatUnit` case, so the issue rate is a rate
      like any other and every limit formats through the one formatter. Each
      limit is returned only when the parts it names are present.
- [x] Hoist the board's rules in `src/data/compat.ts` into a list of rule
      descriptors, have `validateConfiguration` walk that list, and add
      `src/data/checks.ts` + test that renders the same list as `Check`s. Assert
      one config that breaks several rules produces one warning per broken rule
      from both.
- [x] Add `src/sheet/model.ts` + `src/sheet/model.test.ts`: `buildSheet`
      assembles the verdict (or why there cannot be one), the measured figures,
      the ceilings, the floors, the checks, the part blocks (walking
      `partDefinitions()`), the missing list and the unmodeled list. The
      drawn-part list comes from `boardLayout(config)`, which needs a complete
      config — `src/board/layout.ts@134-146` dereferences four spec fields — so
      it is produced only when `completeBuild(build)` is non-null and the block
      is omitted otherwise; `PARTS` itself is module-private.
- [x] Add `src/ui/sheet.ts` + test: build elements from a `BuildSheet` inside
      `#sheet` — headings and a definition list, so the document is navigable
      without sight — and format nothing.
- [x] Export the new modules from `src/data/index.ts` and a new
      `src/sheet/index.ts`.
- [x] Call the sheet from `rebuild()` in `src/main.ts`, beside
      `panel?.update(...)`, so the words and the picture come from one run, and
      adopt the build-level controls when the sheet becomes the active face.
- [x] `docs/features.md`: retire the "Rig presets" entry, add the build sheet and
      the unmodeled-part honesty, and correct the "View switch" entry from three
      views to two faces.

### S2 — The parts the model does not reach

- [ ] Add `src/data/build-parts.ts` with `GpuSpec` and the `Fact` helper, and
      extend `Build` with `gpu: GpuSpec | null` — an added field, not a
      restructure, because S1 already moved the build behind `build.parts`.
- [ ] A catalogue of real cards, each with an `identity` naming the part it
      claims to be, and the picker's second route: choosing one replaces the
      whole part through `applyTemplate` and records it in `origin`.
- [ ] Ceilings for the card: the display link's own ceiling, and the PCIe lane
      budget — the lanes the card wants against the lanes the board and its M.2
      occupancy leave it.
- [ ] Checks for the card: lanes available, generation supported by the slot,
      board fit. Broken ones explain and never block, as the memory rules do.
- [ ] The sheet gains a GPU section of facts and a shrinking "not part of this
      build yet" list. The GPU still gets **no verdict**, because nothing
      simulates it.
- [ ] Tests: the lane budget moves when an M.2 slot is populated; a card whose
      lanes exceed the board's is explained and still yields a run; a GPU section
      carries facts and no verdict string.

### S3 — Storage

- [ ] Add `StorageSpec` to `src/data/build-parts.ts`: its link (`sata` or
      `pcie`), its lanes, its own rated rate and its latency, because a drive is
      limited by both. `Build` gains `storage: StorageSpec | null` — one part per
      kind, matching the roadmap's deferral of multiplicity, which both plans now
      state the same way.
- [ ] A ceiling for the interface's rate against the drive's own, with the
      binding side named — the same minimum as memory, one order of magnitude
      larger; and a floor for the drive's own latency chain.
- [ ] Checks: M.2 and SATA port occupancy, the lane split an M.2 stick takes
      from the card slot, and a drive whose interface the board does not offer.
- [ ] The part blocks reach the storage facts, and the sheet states that the
      latency figures are published part data rather than simulated — and that
      one drive describes the model's limit, not the reader's build.

### S4 — Power

- [ ] Add `PsuSpec` and a connector list to `src/data/build-parts.ts`, plus the
      board's own power facts.
- [ ] Checks: a required connector the power supply does not have, and a rated
      wattage below the parts' summed demand. Both are matches on listed facts,
      not a thermal model.
- [ ] The sheet reports the power budget as a **requirement sum**, and says in
      as many words that the model has no thermal feedback yet — that is the
      roadmap's v0.4 wave, not this one.

## Relationship to the component customization plan

That plan (`component-customization.md`) is active, and its W2 and W3 still
describe rigs: `BuildPreset` (`@230`), `buildFromPreset` (`@262`), re-expressing
`2012 / 2019 / 2024` as sets of template ids (`@99-100`, `@486-504`). Its W3
already retires the "Rig presets" entry (`@553`) and corrects the "Motherboard
compatibility" wording (`@528`), which this plan agrees with for a different
reason. Under this plan the assembled build replaces all of it:

- `BuildPreset`, `buildFromPreset` and the `parts` map on a preset are deleted,
  not re-expressed. A build is `Build`, and the sheet already knows how to
  describe one.
- `applyTemplate` survives, with one signature change: it takes a `Build` and
  returns `{ build, origin }`, because picking a real part is how a part is
  added. It is not free.
- Its W2's "keep the CPU templates on the 4 GHz issue rate" instruction stands
  and is now load-bearing for a second reason: without it, naming a real CPU
  would silently move every number, which the sheet would then print as fact.
- Its W2 test "the three rig presets resolve to `BASELINE_CPU` and
  `CACHE_HIERARCHY` for the slots they do not name" (`@502-504`) loses its
  subject once `RIG_PRESETS` is gone; the assembled-build test replaces it.

That plan is not edited here; this section is the hand-off.

## Docs to land with this feature

- [x] `README.md` — the headline table becomes three *memory templates* rather
      than three machines: the numbers, the lesson and its three rows are
      unchanged, and only the naming goes. The "Three views of the same run"
      section becomes the two faces and loses the Flow view's paragraph.
- [x] `docs/features.md` — add the build sheet and the unmodeled-part honesty as
      a feature in its own right; retire the "Rig presets" entry and the
      Flow-view entry; correct the "View switch" entry (two faces, not three) and
      say in the "Results readout" entry that the sheet restates the same figures
      in prose from the same run.
- [x] `docs/codebase.md` — `src/sheet/` is the DOM-free report model and
      `src/ui/sheet.ts` renders it; `src/data/` grows `build.ts`, `limits.ts`,
      `checks.ts` and `build-parts.ts`; `src/testing/` holds the fixture a rig
      used to be; `src/render/pipeline.ts` is gone and its survivors moved to
      `src/render/format.ts`; `src/ui/panel.ts` exposes three elements, not two;
      `src/main.ts` holds two faces, not three views; `src/styles.css` gains the
      sheet.
- [x] `docs/roadmap.md` — at `@15` the "flat board and the swimlane beside it"
      becomes the two faces; drop the "Narrow-canvas guards in the swimlane view"
      item (`@121-122`); drop the "Full-system presets spanning CPU + GPU +
      storage" deferral, which the assembled build and the catalogue replace; move
      PCIe lane splitting and the chipset uplink out of "Deferred within the GPU
      and storage waves" and record them as **static rules only** (S2/S3),
      stating plainly that the v0.2/v0.3 *simulations* are still deferred; record
      the sheet's status.
- [x] `docs/agent/README.md` — `src/sheet/` is DOM-free, it may import
      `src/render/format.ts` and `src/board`, and it must add no help text, no
      formatter and no second copy of a `compat.ts` rule.
- [ ] Move this plan to `docs/plans/done/` in the feature's final commit.

## Requirements (EARS)

- THE SYSTEM SHALL present exactly two faces: a build sheet and a
  visualisation, the latter drawn in 3D or flat, with the way to switch between
  them reachable from either one.
- THE SYSTEM SHALL start a build empty, and SHALL add parts one at a time.
- THE SYSTEM SHALL fill in no part the user did not add, and SHALL NOT complete a
  build in order to run it.
- IF an edit is applied to a part the build does not have, THEN THE SYSTEM SHALL
  refuse it, keep the build unchanged, and name the missing part.
- WHEN a part is added, THE SYSTEM SHALL take it either from the catalogue of
  real parts or from the part's own blank, and SHALL record which.
- WHILE a part the model needs is missing, THE SYSTEM SHALL name it, SHALL
  produce no run, and SHALL print no verdict.
- WHEN the build changes, THE SYSTEM SHALL re-render the sheet from the new
  build and from the same run the picture shows.
- THE SYSTEM SHALL derive every limit it prints from the build's own values, and
  SHALL name the fields each value came from.
- THE SYSTEM SHALL state, for a ceiling, which operand binds it and how much
  headroom the others leave unused.
- WHERE a rule is not implemented as a mechanic, THE SYSTEM SHALL state that the
  run does not enforce it.
- THE SYSTEM SHALL label every characteristic with what reads it — the core, a
  rule, or nothing.
- WHEN a part is outside another part's specification, THE SYSTEM SHALL explain
  the rule, keep the run, and never block it.
- THE SYSTEM SHALL mark every part the model does not reach as unmodeled, and
  SHALL NOT report a verdict for it.
- THE SYSTEM SHALL state, in words, that a single part of a kind describes the
  model's limit rather than what the user owns.
- THE SYSTEM SHALL render every figure through one formatter per unit, and SHALL
  carry no help text of its own.
- THE SYSTEM SHALL NOT carry meaning in colour alone.

## Acceptance criteria

1. No rig survives: `RIG_PRESETS`, `RigPreset`, `findPreset`, `buildId` and the
   rig `<select>` are gone, the product's own module holds no pre-assembled
   machine, and the tests build their fixtures from their own helper.
2. A new build renders the missing-parts sentence and no verdict; adding the
   three core parts through the picker makes a verdict, ceilings, checks and the
   part blocks appear, and only when their parts are present; and no edit through
   the bench can make a part appear.
3. The face control offers two faces and the visualisation offers its two
   renderers, so the 3D model and the flat board stay reachable; the Flow view is
   unreachable, `src/render/pipeline.ts` no longer exists, and a repo-wide search
   finds no import of it.
4. A test walks `partDefinitions()` and asserts exactly one row per descriptor,
   keyed by `CharacteristicRow.id`: a numeric descriptor shows
   `formatUnit(value, unit)`, and a `choice` or `flags` descriptor shows the
   label of the option it currently holds — every descriptor, including the two
   that carry no `unit`.
5. `buildLimits` is asserted against its own inputs rather than literals: the
   bandwidth ceiling equals `aggregateBandwidthBytesPerNs`, the floor equals the
   three `hitTimeNs` plus `fullAccessNs`, and the parallelism ceiling equals
   `caches.l1.maxOutstandingMisses × DEFAULT_LINE_BYTES ÷ fullAccessNs(memory)`
   — the one formula whose unit can silently be wrong — and every rendered value
   equals `formatUnit` of the raw one.
6. With a DIMM faster than its board's cap, the board is the binding ceiling
   **and** the board's limit carries the `notEnforcedBy` note; the test asserts
   both strings are rendered.
7. The sheet's `limiterId` is the `LevelId` that the readout cards'
   `bottleneckId` names, for the same `SimResult`.
8. A complete build renders the drawn parts with `levelId === null` in
   `unmodeled`, each with its facts and on an `UnmodeledSection` that has no
   verdict field — the type is the assertion — while an incomplete build renders
   an empty `unmodeled`, because `boardLayout` needs a complete config.
9. Two named cases: changing `memory.mtPerSecond` changes the rendered bandwidth
   ceiling; changing `cpu.cores` changes the sheet's part block and no limit.
   (One lucky example would prove nothing, and the two `display-only`
   descriptors make the second case the interesting one.)
10. The worked example's contrast is a test: a build whose memory populates four
    channels binds the parallelism ceiling rather than the memory rate, and the
    test asserts both which limit carries `binding` and that the two swap when
    the channel count changes.
11. No limit is a literal: for each limit, the test changes an input field the
    limit names and asserts the rendered text changes.
12. Every state that also has a colour — a binding ceiling, a broken check, a
    `display-only` row — is asserted to carry its word in the rendered text.

## Risks

- **A sheet that lies.** The limit layer is new arithmetic the core does not
  enforce — the board's memory cap is the live example. Mitigated by limits
  naming their inputs and their expression, by the `notEnforcedBy` note, and by
  a test that pins the note so a later wave cannot make the cap real without
  updating it.
- **An empty page on first load.** A build with nothing in it shows a sentence,
  not a machine, which is a worse first impression than a 2019 rig was.
  Mitigated by the sentence naming exactly what to add, by the part picker
  offering the catalogue from the same control, and by the README's three memory
  templates remaining the worked introduction.
- **Deleting the rigs is not local.** Seven test files build fixtures from
  `findPreset`, and every one of them needs the new fixture. It is one change,
  itemised in S1, not an incremental edit.
- **A rising sheet under the windows** *(retired in design, kept as a
  regression risk)*. The sheet is a sibling surface rather than a stage child,
  and the window layer is hidden while it is up. The test that pins this is
  visual, not unit-level, so it is Pierre's playtest.
- **Two renderers for the same numbers.** The cards and the sheet both report
  bandwidth, latency and the limiter. Mitigated by both reading one `SimResult`
  and one set of formatters — but prose is not a number, so the sheet's verdict
  sentence and the cards' `… on memory` sentence are two sentences about one
  fact. Accepted, because they are read at different moments and in different
  faces; the test asserts the ids agree, not the wording.
- **A half-finished `Build` migration.** S1 changes `state.build` from a
  `HardwareConfig` to a `Build` in `main.ts`, `panel.ts`, `editor.ts` and their
  tests at once. It is one change, itemised in S1, and the compiler is the
  check. Doing it in S1 rather than S2 keeps it to one migration.
- **Relocating the bench.** Adopting the same nodes into the sheet and back is
  the one genuinely fiddly part of S1: a node can only be in one parent, so the
  adoption has to happen on the face change and nowhere else. Mitigated by
  keeping the move in one function beside `applyViewMode()`, and by the fact
  `src/ui/windows.tsx` already adopts and releases nodes this way.
- **Deleting the Flow view loses work.** `src/render/pipeline.ts` holds the log
  accumulator and the travelling-glyph drawing. It is deliberate: the two board
  views already animate the same spans through `tokensAt`, and the Flow view's
  only unique figure — requests in flight — is on the cards.
- **Naming a real part the model cannot honour.** A catalogue CPU names a real
  processor whose caches, clock and core count the model does not have. The sheet
  must print the model's numbers beside the part's name and say plainly that the
  name is a label until a wave makes the part real, or the catalogue teaches the
  opposite of the truth.
- **Scope creep into the simulation.** The temptation is to simulate the GPU so
  the sheet can report a real verdict for it. That is the roadmap's v0.2 wave
  and a different plan; the sheet's honesty about what is unmodeled is worth
  more than a second simulated part.
- **A wall of text.** Twenty-eight characteristics plus limits and checks is
  long. Mitigated by the order (verdict first, parts last), by one row per
  characteristic, and by the sheet being the one face that can be skimmed.

## Non-goals

- Pre-built machines of any kind, including "start from an example": the
  catalogue is per part, never per build.
- More than one part of a kind as its own entry — a second drive, a second card.
  One part per kind is what a build describes; multiplicity is deferred in
  [../roadmap.md](../roadmap.md), and both plans state it the same way.
- Physical fit — case and cooler clearance, DIMM height, card length. It needs a
  case spec and is the least teachable of the rules; recorded in
  [../roadmap.md](../roadmap.md) rather than built here.
- Prices, vendors, availability and any shopping-list behaviour.
- Wiring the new parts into the simulation core. That is the roadmap's
  component waves (GPU, storage, power), and each one turns that part's facts
  into parameters and its ceilings into mechanics.
- Sharing a build as a URL, which the
  [component customization plan](component-customization.md) already defers.
- A thermal or power feedback loop, which the roadmap defers to v0.4. S4 reports
  a budget, not a temperature.
