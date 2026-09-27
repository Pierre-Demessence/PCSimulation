# Component customization — every part, one characteristic at a time

The sandbox can currently vary exactly two component characteristics: memory
speed and CAS latency (`src/ui/panel.ts@19-24`, wired at `@185-193`). Every
other characteristic — the CPU's clock and core count, the three caches'
capacity, ways, hit time, data rate and miss budget, the DIMM's generation,
channels, capacity and access overhead — is frozen at module load
(`src/data/presets.ts@33-76`), the board's slots and caps included
(`@132`, `@139`, `@146`), and a "rig" is one of three whole machines sharing a
CPU and a cache hierarchy (`@113`) while differing in **both** memory
(`@131`, `@138`, `@145`) and motherboard.

This plan makes the **configuration** the source of truth, so the editor can
reach every characteristic of every part, and adds a **catalogue of real-world
templates** so a plausible part can be created in one click and then fine-tuned.

The loop it adds:

> Pick a component → pick one characteristic → move it → watch the bottleneck
> move. Or start from a real part instead of typing numbers.

## What exists today (grounded)

| Fact | Source |
| --- | --- |
| The only editable component state is `isolating: { mtPerSecond, casLatency }` | `src/ui/panel.ts@19-24`, `@29-38` |
| Those two change a *component*; the rig and workload selects also re-run the sim | `src/ui/panel.ts@179-183`, `@185-193`, `src/main.ts@192-195`, `@197-202` |
| CPU, cache hierarchy and memory defaults are shared module constants | `src/data/presets.ts@33-76` |
| The rigs share `BASELINE_CPU` and `CACHE_HIERARCHY` (`@113`); memory (`@131`, `@138`, `@145`) and the board (`@132`, `@139`, `@146`) both differ per rig | `src/data/presets.ts` |
| A rebuild spreads the preset config and replaces `memory` | `src/main.ts@110` |
| Every spec field is `readonly` | `src/sim/types.ts@12-68` |
| Validation checks memory against the board, plus every level's outstanding-miss count; it does not check CPU values or the remaining cache fields | `src/data/compat.ts@7-39`, `@41-49` |
| Three part labels hard-code spec numbers in prose | `src/board/layout.ts@40`, `@49`, `@58` |
| The board layout already derives from the config (DIMM strips follow `channels` and `dimmSlots`) | `src/board/layout.ts@134-146` |
| The `clockHz` field is read nowhere: `serviceTimeNs` is derived from a local constant and is what the engine reads; `cores` is read nowhere at all | `src/data/presets.ts@30`, `@38`, `src/sim/engine.ts@197`, `@218`, `src/sim/types.ts@44-46` |
| The board already separates a drawn *part* from the *slot* it simulates: every `BoardPart` carries `id`, `kind` and `levelId`, the three caches share `kind: 'cache'`, and the CPU package claims to contain them | `src/board/layout.ts@23-116`, `@28`, `@40`, `@44` |

Three traps the plan has to respect:

- **Rendered prose that will lie.** The three `label` strings above are the
  machine's own description of itself and they are literals.
- **A knob with no effect.** `cores` looks like a characteristic and is not one;
  the editor must say so rather than imply a second core does anything.
- **A knob that means more than its name.** The L1 miss budget *is* the core's
  memory-level parallelism, by the model's own design
  (`src/data/presets.ts@20-22`), so editing it changes core-wide parallelism,
  not an L1-local detail. Its help text must say that.

## Decisions

- **A parameter registry, not a hand-built control panel.** Each part declares
its characteristics as data: label, help, group, range, control type, and a pure
`with(part, value)` that changes exactly one characteristic. "One characteristic
at a time" then becomes a *structural* property a test can assert, rather than a
promise the UI is trusted to keep.
- **Parts are what the user edits; slots are what the model consumes.** A part
owns one or more slots — `CPU` owns `cpu`, `l1`, `l2` and `l3`, because that is
where its caches are — and a slot is a group of characteristics, never something
the user picks. The editor never asks about "cache 1" and "cache 2": it shows a
CPU page whose list is grouped by slot. The board already makes this distinction
(`BoardPart.id`/`kind` against `levelId`, `src/board/layout.ts@23-116`), so the
plan names an existing one rather than adding one.
- **A part is a projection of the config, not a second copy of it.** Each part
value is a slice of `HardwareConfig` — the CPU's is `{ cpu, caches }`, already two
adjacent fields — so a part carries a pure `read(config)` and
`write(config, part)`, and the simulation core keeps taking a plain
`HardwareConfig`. Parameters stay typed per part, so a CPU descriptor cannot
address memory. What the compiler cannot prove is that a hand-written `write`
leaves the rest of the config alone, so each part's pair is pinned by one test.
- **Not every characteristic is a slider.** `MemoryGeneration` is a choice
(`src/sim/types.ts@7`) and `MotherboardSpec.allowedGenerations` is a set
(`src/sim/types.ts@51`), so a descriptor carries a control kind (`range`,
`count`, `choice`, `flags`) and the value type follows from it.
- **One rule for every value, stated once.** A descriptor's `[min, max]` is that
field's own law, so a value outside it is **clamped** to the bound and can never
reach the model. What a descriptor cannot express is **refused**: a capacity
smaller than `ways × lineBytes`, or a level whose set count would exceed the
model's ceiling. That second one is a cost rule, not a physical one — the engine
allocates one tag list per set (`src/sim/cache.ts@31`) — which is exactly why it
is a refusal and not a slider range. The descriptor minima for `bytesPerNs` and
`hitTimeNs` are re-checked there too, because a template or a hand-written
config never passes through the editor. `applyParameter` returns the refusal
instead of a config, so the editor keeps the last valid value and shows the
invariant. Values out of spec *for the board* are neither: they are simulated
and explained, which is the existing memory behaviour
(`src/data/compat.ts@11-28`) and the lesson itself.
- **An out-of-spec part is simulated and explained, never blocked.** The board's
caps produce warnings, not refusals (`src/data/compat.ts@11-31`), and the run
proceeds regardless. A DDR5-8000 DIMM in a board capped at 3200 MT/s is exactly
the comparison the sandbox exists to make.
- **Nobody pretends.** A characteristic the core does not read is marked
`validated` or `display-only` and is shown as such. `cores` is display-only;
`clockHz` is simulated *through* `serviceTimeNs`, which the descriptor's
transform derives the same way `BASELINE_CPU` does
(`src/data/presets.ts@38`), so editing a clock moves the issue rate.
- **Templates are per part, and a build remembers its origin.** A template is a
named part — "DDR4-3200 CL16, 2 × 16 GB" or "Intel i5-12400" — and a CPU
template carries its own L1/L2/L3 figures, because a real part's caches are baked
in rather than sold separately. The *parts* of the 2012 / 2019 / 2024 machines
become catalogue entries, so the numbers those machines produce must not move,
but the machines themselves are gone: a build is assembled one part at a time.
Each part records which catalogue entry it came from, so *Reset to template* has
backing state rather than being computed by guessing.
- **Descriptors are data, not presentation.** They carry a label, help text and a
`unit`, but no formatting function: the editor renders through one formatter per
unit, so two call sites cannot drift apart.
- **`src/board/` must not import `src/render/`.** The part labels are built in
`src/board/layout.ts`, so the byte and frequency formatting they need is a small
pure helper beside them rather than a call into the render layer.
- **One picker, not a wall of controls.** W1 enumerates about 28 values. Showing
them all at once is unreadable; showing one at a time is also exactly what the
lesson requires.

## Data model

Fictional but config-complete: descriptors are data, specs stay `readonly`, and
editing is a pure transform. Honours `erasableSyntaxOnly` and
`verbatimModuleSyntax`.

```ts
// src/data/parameters.ts
import type {
  CacheHierarchy,
  CpuSpec,
  HardwareConfig,
  LevelId,
  MemorySpec,
  MotherboardSpec,
} from '@/sim';

/**
 * What the user picks and swaps. A part owns one or more slots; the CPU owns its
 * three cache levels, because that is where they are.
 */
export type PartId = 'cpu' | 'memory' | 'motherboard';

/** What the model consumes: one entry per position of `HardwareConfig`. */
export type SlotId = LevelId | 'motherboard';

interface ParameterBase<Part, Value> {
  readonly id: string;
  readonly label: string;
  readonly help: string;
  /** The slot this characteristic belongs to; it is how the part's list groups. */
  readonly group: SlotId;
  /**
   * 'simulated' — the core reads this field and it moves the numbers.
   * 'validated' — the core ignores it, but a rule reads it (the board's caps,
   * the memory generation), so it can warn but never changes a result.
   * 'display-only' — nothing reads it; it is recorded so the part is complete.
   */
  readonly effect: 'display-only' | 'simulated' | 'validated';
  readonly get: (part: Part) => Value;
  /** Pure. Changes exactly this one characteristic (and anything derived from it). */
  readonly with: (part: Part, value: Value) => Part;
  /** What the number *is*; absent on a non-numeric control. */
  readonly unit?: ParameterUnit;
}

export type ParameterUnit =
  | 'bytes'
  | 'bytes-per-ns'
  | 'count'
  | 'cycles'
  | 'hz'
  | 'mt-per-s'
  | 'ns';

export interface RangeParameter<Part> extends ParameterBase<Part, number> {
  readonly control: 'range' | 'count';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** A wide scale (ns against µs) stays draggable only on a log track. */
  readonly scale?: 'linear' | 'log';
}

export interface ChoiceParameter<Part> extends ParameterBase<Part, string> {
  readonly control: 'choice';
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export interface FlagsParameter<Part, Value extends readonly string[] = readonly string[]>
  extends ParameterBase<Part, Value> {
  readonly control: 'flags';
  readonly options: readonly { readonly value: Value[number]; readonly label: string }[];
}

export type Parameter<Part> =
  | RangeParameter<Part>
  | ChoiceParameter<Part>
  | FlagsParameter<Part>;

/** The part values, each a slice of `HardwareConfig`. */
export interface CpuPart {
  readonly cpu: CpuSpec;
  readonly caches: CacheHierarchy;
}

export interface PartDefinition<Part> {
  readonly id: PartId;
  readonly label: string;
  /** Every slot a template swap replaces. */
  readonly slots: readonly SlotId[];
  readonly parameters: readonly Parameter<Part>[];
  readonly read: (config: HardwareConfig) => Part;
  readonly write: (config: HardwareConfig, part: Part) => HardwareConfig;
}
```

```ts
// src/data/components.ts
interface TemplateBase {
  /** Machine id, e.g. `ddr4-3200-cl16-2x16`. Unique across the catalogue. */
  readonly id: string;
  /** Human name of the real part, e.g. "DDR4-3200 CL16, 2 × 16 GB". */
  readonly identity: string;
}

/**
 * A named part. A CPU template carries its own caches, because a real part's
 * L1/L2/L3 are baked in rather than sold separately.
 */
export type ComponentTemplate =
  | (TemplateBase & { readonly part: 'cpu'; readonly value: CpuPart })
  | (TemplateBase & { readonly part: 'memory'; readonly value: MemorySpec })
  | (TemplateBase & { readonly part: 'motherboard'; readonly value: MotherboardSpec });
```

Three entry points carry the feature — two in `src/data/parameters.ts`, one in
`src/data/components.ts`:

```ts
// src/data/parameters.ts
/** Every part the editor knows about, so the editor and its tests share one list. */
export function partDefinitions(): readonly PartDefinition<unknown>[];

/** Applies one characteristic. `refused` is set when the model would break. */
export function applyParameter(
  config: HardwareConfig,
  part: PartId,
  parameterId: string,
  value: number | string | readonly string[],
): ParameterApplication;

export interface ParameterApplication {
  readonly config: HardwareConfig;
  /** Non-null when the change was refused; `config` is then the input, unchanged. */
  readonly refused: string | null;
}

// src/data/components.ts
/** Adds a catalogue part to a build, or replaces it, and records which entry. */
export function applyTemplate(
  build: Build,
  origin: Partial<Record<PartId, string>>,
  part: PartId,
  templateId: string,
): { readonly build: Build; readonly origin: Partial<Record<PartId, string>> };
```

Two spec fields are *derived*, not edited: `CpuSpec.serviceTimeNs` (from
`clockHz`, `src/data/presets.ts@38`) and `MemorySpec.id` (from generation, MT/s
and CL, `src/data/presets.ts@89`). Their transforms recompute them, and they are
excluded from the "every other field is identical" assertion — which is stated
over *characteristics*, not over raw object fields.

## UI shape

`PanelState` (`src/ui/panel.ts`) loses `presetId` and `isolating` and gains the
build itself. [The build sheet](build-sheet.md)'s S1 then makes that build a
`Build` — a partial core, assembled part by part — and deletes the rig fields, so
this is the shape W2 works against:

```ts
export interface PanelState {
  readonly build: Build;                 // a partial core, assembled part by part
  readonly part: PartId;                 // which part is on the bench
  readonly characteristic: string;       // which parameter of it is being varied
  /** The template each part was loaded from; absent means hand-typed. */
  readonly origin: Partial<Record<PartId, string>>;
  // ...unchanged: workloadKind, view, explode, nsPerSecond, playing
}
```

W1 shipped this migration with a `HardwareConfig` build and a `buildId` naming the
rig that was loaded. S1 replaces the first with a `Build` and deletes the second
along with the rig select, because there is no named machine to load. The playback
fit is triggered by the event that changes the machine or the workload rather than
by a state key: a key changes on the first edit and would re-fit mid-slider, which
is exactly what the comment at `src/main.ts@147-149` rules out.

The migration is one change, and every call site was itemised in W1's checklist:
`src/ui/panel.ts` (rig select, listeners, getters, `update()`'s `MemorySpec`
parameter, the header mirrors), `src/ui/index.ts` (the `IsolatingControls`
re-export) and `src/main.ts` (state literal, `currentMemory`, the config spread,
title/subtitle, the playback fit, both `onChange` branches, the `presets:`
option).

The Memory section becomes one case of a generic editor:

1. **Part** — a `<select>` over the parts the user owns: `CPU`, `Memory`,
   `Motherboard`, each with a `modified` marker when the current value differs
   from the template named in `origin`. Slots are never listed on their own: the
   CPU's three cache levels are sections of the CPU, not three peers of it.
2. **Characteristic** — that part's parameters, grouped by the slot they belong
   to (`Core`, `L1`, `L2`, `L3`), each showing its current value and unit and
   tagged `simulated`, `validated` or `display-only` so the reader knows which
   ones move the numbers.
3. **One control** — a single slider / number field / select / checkbox group,
   plus a live formatted readout and a `Reset to template` button.

Tooltips state the meaning, the unit and what reads the value (the core, a
validation rule, or nothing), as the existing controls do
(`src/ui/panel.ts@154-166`). No meaning is carried by colour: a modified
component and an out-of-spec value each get a word, not a tint.

## Waves

| Wave | Deliverable | Status |
| --- | --- | --- |
| W1 | Parameter registry over parts and slots + generic editor, with part labels generated from the specs | shipped |
| W2 | Real-world part templates, applied through the build sheet's part picker | held — the build sheet's S1 lands first |
| W3 | Validation for every slot and honest display-only marking | not started |
| W4 | Extension proof: a new *editor* part is one descriptor list, one template list and its registration | not started |

### W1 — Registry and generic editor

Two landable increments: **W1a** is the data layer (`src/data/parameters.ts`, its
tests, and the barrel export) and **W1b** is the UI: the `PanelState` migration,
`src/ui/editor.ts` and the generated board labels. W1a is pure and lands on its
own; W1b is the atomic migration the risk list warns about, and is entered with
nothing else in flight. Both are shipped. `origin` and *Reset to template* arrive
with W2's catalogue; the state field is carried from now on, so the shape of
`PanelState` does not change twice.

- [x] Add `src/data/parameters.ts` with the descriptor types and one descriptor
      list per **part**, each record declaring the slots it owns and a
      `read`/`write` projection pair:
      - **CPU** — slots `cpu`, `l1`, `l2`, `l3`; value `{ cpu, caches }`;
        parameters `clockHz` and `cores` (group `cpu`), then the five cache
        fields (`capacityBytes`, `ways`, `hitTimeNs`, `bytesPerNs`,
        `maxOutstandingMisses`) once per level, each carrying its level as its
        `group`, so one list covers L1/L2/L3 without three near-identical ones.
      - **Memory** — slot `memory`; `generation`, `mtPerSecond`, `casLatency`,
        `channels`, `capacityBytes`, `accessOverheadNs`,
        `maxOutstandingMisses`.
      - **Motherboard** — slot `motherboard`; `dimmSlots`, `maxChannels`,
        `maxMtPerSecond`, `allowedGenerations`.
      `generation` is a `choice` (`src/sim/types.ts@7`);
      `allowedGenerations` is `flags` (`@51`) and takes its value type as a
      second parameter, with `options` typed against `Value[number]`, so the
      constructor needs no cast inside its own body; the `parameters` array and
      the registry still each need one boundary cast, because under `strict` a
      function-typed property is checked contravariantly.
- [x] Mark every characteristic of every part that the core does not read, or
      the plan's own rule is broken on day one. **simulated**: `clockHz`
      (through `serviceTimeNs`),
      the caches' five fields (`src/sim/engine.ts@151`, `@178-181`, `@239`,
      `@260`, `@355`), and
      memory's `mtPerSecond`, `casLatency`, `channels` and `accessOverheadNs`
      (`src/sim/memory.ts@1-41`), with its miss budget
      (`src/sim/engine.ts@180`). **validated**: `generation`
      (`src/data/compat.ts@11`) and the board's four caps, which only
      `src/data/compat.ts@8-28` and `src/board/layout.ts@135-138` read.
      **display-only**: `cores`, and memory's `capacityBytes` — the simulation
      ignores it, and the one place that copies it (`src/main.ts@94`) is deleted
      by this change.
- [x] Give `cores`, `generation` and the board's caps help text that names what
      reads them, and say in the L1 miss-budget help that it is the whole core's
      memory-level parallelism (`src/data/presets.ts@20-22`,
      `src/sim/engine.ts@166-167`).
- [x] Export `CYCLES_PER_ISSUE` from `src/data/presets.ts@31`, and have the
      `clockHz` transform recompute `serviceTimeNs` exactly as `BASELINE_CPU`
      does (`@38`).
- [x] Add `applyParameter` and `partDefinitions`; keep specs `readonly` and
      return new objects. `applyParameter` resolves the part, applies the
      descriptor's `with` to the part value and writes it back with the part's
      `write`, clamping to the descriptor's `[min, max]` / `step`.
- [ ] Add `applyTemplate`, with W2's catalogue to apply: it takes the `Build`,
      adds that part or replaces it, and records the entry's id in `origin`, so
      one part can be swapped without disturbing the rest of the build.
- [x] Erase the registry's per-part generics to `PartDefinition<unknown>`
      through one documented cast: under `strict`,
      `PartDefinition<CpuPart>` is not assignable to
      `PartDefinition<unknown>`, because `get`, `with`, `read` and `write` are
      function-typed properties.
- [x] Replace `PanelState.presetId` / `PanelState.isolating` with `build`,
      `part`, `characteristic`, `origin` and `buildId`, and migrate every
      call site in the same change: the rig select and its listener (which reads
      `buildId`, and shows "Custom" when it is `'custom'`), the workload listener
      and the two isolating listeners (`src/ui/panel.ts@179-193`), the getters
      (`@229-235`), `update()`'s `MemorySpec` parameter (`@238`), the mirrors that
      read `state.presetId` / `state.isolating` (`@239`, `@241-242`), the warning
      line (`@248-250`), the `IsolatingControls` interface itself (`@19-24`) and
      its re-export (`src/ui/index.ts@2`), and in `src/main.ts` the state literal
      (`@47-57`), `currentMemory` (`@89-97`), `findPreset(state.presetId)` inside
      `rebuild` (`@105`), the config spread (`@110`), the title and subtitle
      (`@117-118`), `fitKey` (`@150-154`), the preset/workload branch
      (`@192-195`), the isolating branch (`@197-202`) and the `presets:` option
      (`@234`).
- [x] Set `buildId`: the preset's id when a rig is loaded, `'custom'` on the
      first characteristic edit or template applied to any part, and never back
      — reloading a rig is the only thing that restores a named build. This is
      what keeps the header honest and stops `fitKey` re-fitting the playback
      speed on every slider move.
- [x] Extend `ControlPanel` rather than replace it: `panel.ts` keeps the
      machine-level controls (view, explode, workload, playback, and the Rig
      select as a one-click "load this build") and composes the bench from
      `src/ui/editor.ts`. This is the choice; the migration list above is sized
      for it.
- [x] Export the new modules from `src/data/index.ts`, the barrel consumers
      import through.
- [x] Build `src/ui/editor.ts`: part picker, characteristic list grouped by the
      slot that owns each parameter, one control, live readout,
      `Reset to template`.
- [x] Keep the existing readout cards and the debounced rebuild
      (`src/main.ts@166-170`); a one-characteristic edit re-runs and
      re-classifies.
- [x] Generate `BoardPart.label` from the current spec instead of the three
      literals (`src/board/layout.ts@40`, `@49`, `@58`) — in this wave, because
      editable specs would otherwise make the machine describe itself wrongly.
      They render bytes and
      nanoseconds today ("32 KiB … 1 ns lookup"), and a generated memory label
      will want MT/s too; `src/board/` must not import `src/render/`, so the
      helper beside the layout covers all three. It duplicates `formatDuration`
      (`src/render/format.ts@11`) by design; the alternative — extracting one
      pure formatter module both layers import — is a larger change than this
      feature needs.
- [x] Keep formatting out of the descriptors — they carry a `unit` — so one
      formatter per unit renders everywhere.
- [x] Tests — `src/data/parameters.test.ts` walks every descriptor:
      (a) `get(with(part, v))` equals `v` for the descriptor's own values —
      `===` for the numeric and `choice` kinds, `toEqual` for a `flags` set,
      which is compared by value rather than by reference;
      (b) every *other characteristic* reads back unchanged, derived fields
      excluded (see Data model);
      (c) a value outside `[min, max]` clamps to the bound and lands on the
      `step` grid for a linear descriptor (a log-scaled one has no additive grid);
      (d) a sweep applies each range descriptor's min, max and one mid value
      (`choice` and `flags` descriptors have neither), builds a config from it
      and runs `simulate` — it must not throw
      (`src/sim/cache.ts@21-28`) and must return a finite `elapsedNs`, because
      `rebuild()` has no try/catch and the engine divides by `bytesPerNs`, so a
      zero rate yields `Infinity` without throwing;
      (e) every `SlotId` of `HardwareConfig` is owned by exactly one part, so a
      slot cannot exist without an owner or be claimed twice;
      (f) each part's `read`/`write` pair round-trips — for every part,
      `read(write(config, value))` equals `value` and every slot the part does
      **not** own still reads back unchanged.
- [x] Tests — `src/board/labels.test.ts` (a label follows the spec, and a label
      for a part the editor cannot reach states no figure) and
      `src/ui/editor.test.ts` (exactly one control is mounted; a change moves one
      characteristic and leaves the other slots alone; a refusal restores the
      value and names the invariant; every effect word is reachable).

### W2 — Component templates

- [ ] Add `src/data/components.ts` with real-world entries per part: memory
      (DDR3-1600 CL9, DDR4-3200 CL16, DDR5-5600 CL36, DDR5-6000 CL30), CPU
      (a 4-core 2012 part, a 2019 6-core, a 2024 8-core — each *with* its
      L1/L2/L3 figures, since a real part's caches are not sold separately) and
      board (DDR3 2-channel, DDR4 2-channel, DDR5 4-channel). Each entry carries
      an `id` and an `identity` naming the part it claims to be; the numbers are
      sourced content, not invented. A template carries a complete part value,
      so the 2012 rig's 16 GiB DIMM is a template of its own
      (`src/data/presets.ts@131`) and a build needs no override channel.
- [ ] Keep the catalogue's CPU templates on the 4 GHz / 0.25 ns issue rate
      (`src/data/presets.ts@30-38`). `serviceTimeNs` is read at
      `src/sim/engine.ts@197` and `@218`, so a "more period-correct" clock would
      silently move every v0.1 number the moment such a template reached a rig.
      `cores` may carry a realistic period core count (4 / 6 / 8): nothing reads
      it, and no result depends on it.
- [ ] The rig removal, the `Build` migration of `PanelState` and the fixture that
      replaces `findPreset` belong to the [build-sheet plan](build-sheet.md)'s S1.
      Nothing here re-expresses `2012 / 2019 / 2024` as a loadable machine, and no
      preset omits a slot, because a build is assembled rather than chosen.
- [ ] Every catalogue entry is applied through the build sheet's part picker: a
      memory template adds the DIMM, a board template adds the board. That picker
      is S1's, so this wave adds entries to it rather than a route of its own.
      The three generations' *boards* are entries in their own right, or the
      board-cap lesson — a DDR5 DIMM in a board that stops at 3200 — has nothing
      to demonstrate it.
- [ ] Record the template each part came from in `PanelState.origin`, so the
      `modified` marker and `Reset to template` have backing state; a part with
      no recorded origin counts as unmodified.
- [ ] Tests — `src/data/components.test.ts`: ids unique; every template passes
      `validateConfiguration` in its matching board; and a build assembled from
      the 2019 machine's entries equals the v0.1 specs field-for-field for
      everything the model reads — `serviceTimeNs` (`src/data/presets.ts@33-39`),
      memory and the board. The fixture it compares against lives in
      `src/testing/`, because `findPreset` is gone. `cores` is compared by
      nothing, because nothing reads it.

### W3 — Validation and honesty

- [ ] Extend validation to every slot (`src/data/compat.ts@7-39`) under the one
      rule stated in Decisions. Single-field bounds are the descriptors' job, so
      the editor cannot violate them; the refused class covers what a descriptor
      cannot express (a capacity smaller than `ways × lineBytes`) and repeats the
      single-field minima as a guard for configs that never met the editor — a
      template or a hand-written fixture.
- [ ] Give validation the line width: `CacheSpec` has no `lineBytes` field
      (`src/sim/types.ts@12-22`) — it is `DEFAULT_LINE_BYTES`
      (`src/sim/engine.ts@16`) — so add an options parameter defaulting to it
      (`validateConfiguration(config, { lineBytes })`) rather than inventing a
      config field.
- [ ] Enumerate and keep the **warned** class: generation, channel count, MT/s
      and CAS below 1 are simulated and explained (`src/data/compat.ts@11-31`).
      The miss-budget check stays where it is (`@33-36`, `@41-49`): a descriptor
      minimum of 1 makes it unreachable from the editor, and it still guards a
      hand-written config.
- [x] Correct `docs/features.md`: "Motherboard compatibility" said the board
      *refuses* a DIMM, which the shipped code does not do — it checks and
      explains, then simulates anyway. The "Rig presets" wording is retired with
      the rig itself ([build-sheet.md](build-sheet.md)).
- [ ] Tests: an edited value appears in the rendered label; an incoherent
      combination is refused with the rule named; a within-range value that is
      out of the board's spec still simulates and reports it.

### W4 — Extension proof

- [ ] Document in `docs/agent/README.md` what a new **editor part** costs: one
      descriptor list, one template list and its registration in the picker.
      State plainly that a new *simulated* part is a larger change —
      `HardwareConfig` (`src/sim/types.ts@63-68`), the engine, `PARTS`,
      validation and a workload — so the doc does not imply the editor is the
      whole cost.
- [ ] Tests: a registry walk asserts every `SlotId` of `HardwareConfig` is owned
      by exactly one part, so a slot cannot be added to the config and forgotten
      by the editor, nor claimed twice. The walk covers the config only: `PARTS`
      also draws `gpu`, `m2`, `chipset`, `storage` and `psu` with
      `levelId: null` (`src/board/layout.ts@25-116`), which the editor does not
      reach and the walk must not pretend to.

## Relationship to the build-sheet plan

[The build sheet](build-sheet.md) is the other half of this feature: it adds the
text face and, with it, **deletes the rig concept**. A build is assembled part by
part, so there is no named machine to load and nothing is pre-filled.

- `BuildPreset` and `buildFromPreset` are deleted, not re-expressed. A build is
  `Build` (`src/data/build.ts`), whose `core` is a `Partial<HardwareConfig>`.
- `applyTemplate` survives, and is now how a catalogue part is *added* as well as
  swapped: it takes a `Build` and returns `{ build, origin }`.
- The rig removal, the `Build` migration of `PanelState` and the test fixture that
  replaces `findPreset` all belong to that plan's S1. W2 here starts from a build
  whose parts are absent until the reader adds them.
- The 2012 / 2019 / 2024 *parts* are still this plan's content and their numbers
  must not move, but the three machines are not re-expressed as anything, and no
  preset omits a slot, because there is no preset.

One consequence crosses the wave boundary and is easy for both plans to miss:
the registry shipped in W1a takes a **complete** `HardwareConfig` —
`applyParameter`, and the `read`/`write` pair on every `PartDefinition`. On a
partial core those cannot be called at all, so they move to the partial shape
(`read` returning `null`, or a `hasPart` precondition) in whichever change
introduces `Build`. Whichever plan lands second must not assume the other did it.

### Settled with the build-sheet plan

- **S1 moves the registry to the partial shape**, with the signatures this plan
  needs. An absent part is a **refusal**, not a throw — `applyParameter` is public
  and its tests drive it directly — and `read(...) === null` *is* `hasPart`: one
  predicate, with a test asserting it agrees with the `slots` each definition
  declares. `slots` stays the declaration of what a part owns; it is no longer a
  second definition of presence.
- **S1 ships no catalogue entries and no starter module.** Every descriptor gains
  a `default` beside its `min`/`max`/`step`, and "enter your own" builds a blank
  part from those blanks — one mechanism, nothing mistakable for a chosen part. So
  the three generation-matched boards are this plan's catalogue entries and nothing
  pre-empts them. The board-cap lesson is still reachable in S1, because
  `maxMtPerSecond` is an editable descriptor: move the cap and watch the check
  break.
- **The build is `Build.parts`**, not `Build.core` — `build.core.cpu.cores` was a
  trap.
- **One part per kind, in both plans.** `storage` is a single spec rather than an
  array, and "more than one part of a kind" is a non-goal of both.
- Both plans put the v0.1 fixture in `src/testing/`.

Two notes this plan hands to S1:

- The blanks must satisfy the invariants `applyParameter` enforces: a capacity of
  at least `ways × lineBytes`, and a set count under `MAX_SETS`. "Enter your own"
  writes a part directly rather than through `applyParameter`, so a default pair
  that violated either would reach `SetAssociativeCache` and throw. W1a's sweep
  test is the model — build every part from its blanks and simulate it.
- A single `storage` spec is a limit of the model, not a fact about the build, so
  the sheet has to say so rather than printing one drive as though it were the
  whole machine. Same rule this plan applies to `cores` and memory's
  `capacityBytes`, both of which say what reads them.

## Docs to land with this feature

- [x] `docs/features.md` — per-component editing, honest knobs and
      self-describing parts are listed, and "Isolating controls" is retired. The
      "Rig presets" entry is the build sheet's to retire; the catalogue entry
      arrives with W2.
- [ ] `docs/codebase.md` — `src/data/` grows beyond "rig presets and the
      motherboard's compatibility rules"; `src/ui/` gains `editor.ts`; the
      `src/board/` entry gains the label helper.
- [ ] `docs/roadmap.md` — record the feature's status.
- [ ] Move this plan to `docs/plans/done/` in the feature's final commit.

## Requirements (EARS)

- THE SYSTEM SHALL expose every characteristic of every component in the
  configuration as a separately editable value, through the part that owns it,
  so the reader edits a CPU rather than three cache levels.
- WHEN the user changes one characteristic, THE SYSTEM SHALL hold every other
  characteristic of every component fixed.
- WHEN the user changes one characteristic, THE SYSTEM SHALL re-run the current
  workload and report the resulting classification and bottleneck.
- THE SYSTEM SHALL recompute every derived field (the CPU's issue time, the
  memory part's identifier) when one of its sources changes.
- THE SYSTEM SHALL mark any characteristic the simulation does not consume as
  display-only or validated, in both the editor and its tooltip.
- WHEN a characteristic is outside its own declared range, THE SYSTEM SHALL
  clamp it before it reaches the model.
- WHEN a characteristic is outside the motherboard's specification, THE SYSTEM
  SHALL keep simulating it and name the rule the board broke.
- IF a combination of characteristics would make the model incoherent (a way
  count larger than the lines the capacity holds, or a set count past the
  model's ceiling), THEN THE SYSTEM SHALL refuse the change, keep the previous
  valid value, and name the invariant that is violated.
- WHEN the user selects a real-world part from the catalogue, THE SYSTEM SHALL
  add that part to the build, or replace it when it is already there, and SHALL
  leave every other part untouched.
- THE SYSTEM SHALL record, per part, the template it was loaded from.
- WHEN a component's characteristics differ from its recorded template, THE
  SYSTEM SHALL mark it modified and SHALL offer to restore the template.
- THE SYSTEM SHALL render every *configuration-derived* figure it displays from
  the current configuration. Static prose about a part the editor does not reach
  (`'Graphics card (PCIe ×16)'`, `src/board/layout.ts@76`) is not a
  configuration figure.
- THE SYSTEM SHALL keep the simulation core free of editor state: the core
  continues to take a plain `HardwareConfig`.

## Acceptance criteria

1. Every characteristic listed in W1 is reachable through the part that owns it
   and is editable on its own, and editing one leaves every other
   *characteristic* at its previous value (asserted by test; derived fields
   excepted, see Data model).
2. For each of cache `hitTimeNs`, L1 `maxOutstandingMisses`, memory `channels`,
   memory `mtPerSecond` and CPU `clockHz`, the test states the direction it
   expects and asserts it. Streaming is memory-bound and a dependent chase is
   latency-bound, as measured in `docs/plans/pc-simulation.md`; a run whose
   limiter does not move in the stated direction fails.
3. Every descriptor's min, max and a mid value each produce a config that
   `simulate` completes without throwing.
4. A build assembled from the 2019 machine's parts — a CPU entry, a DDR4-3200 CL16
   DIMM and its board — still produces the v0.1 numbers
   (`docs/plans/pc-simulation.md`, "v0.1 acceptance criteria") for everything the
   model reads: the CPU's issue time, memory and the board.
5. A part can be created from the template catalogue in one selection and then
   fine-tuned without disturbing the other components.
6. No *configuration-derived* figure appears as a literal in a rendered string:
   changing the spec changes what the board says.
7. No slot is presented as a choice: `L1`, `L2` and `L3` appear as sections of
   the CPU, and the picker lists only parts.

## Risks

- **Control-panel sprawl.** W1 enumerates about 28 values; shown at once they
  are unreadable. Mitigated by the picker: one component and one characteristic
  at a time.
- **A half-finished `PanelState` migration.** Dropping `presetId`/`isolating`
  fails to compile in three files at once (`src/ui/panel.ts`, `src/ui/index.ts`,
  `src/main.ts`). It is one change, itemised in W1, not an incremental edit.
- **A part projection that reaches outside its own slots.** A hand-written
  `write(config, part)` can overwrite a neighbouring slot, and the compiler
  cannot see it. Mitigated by W1's round-trip test, and by keeping one
  `read`/`write` pair per part rather than a generic assembler.
- **Model-breaking values.** A degenerate way count or capacity makes
  `SetAssociativeCache` throw (`src/sim/cache.ts@21-28`), and a zero `bytesPerNs`
  yields an infinite result without throwing. `rebuild()` has no try/catch.
  Mitigated by descriptor minimums, the refused class, and the W1 sweep test,
  which asserts a finite result rather than merely no throw.
- **A lying board.** The three hard-coded labels in `src/board/layout.ts` are the
  first thing to go stale, which is why the label work is in W1 rather than W3.
- **Rebuild cost per drag.** A run is ~0.5 s and is already debounced
  (`src/main.ts@166-170`). Moving the run into a worker is tracked in
  [../roadmap.md](../roadmap.md); this plan does not add it.
- **Catalogue accuracy.** Real-world template numbers are content and need
  sourcing discipline; a wrong sticker number teaches the wrong lesson. Each
  template's `identity` names the part it claims to be.

## Non-goals

Adding a *simulated* part (GPU, storage, PSU) — that is the component waves in
[../roadmap.md](../roadmap.md), and their static facts are the
[build sheet](build-sheet.md)'s S2–S4. Letting a build hold **several** parts of
one kind (four DIMM modules, two drives) is still deferred: a `Build` carries one
part per kind, exactly as `HardwareConfig` does, so the channel count stands in
for the stick count. Sharing a build as a URL, per-channel population
topology and multi-core contention are tracked in the roadmap's deferred lists.
Wiring `cores` into the core is a non-goal here: it stays display-only until a
wave gives it a model to affect.
