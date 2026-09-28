import type { CpuPart, PartId } from './parameters';
import type { CompatParts, GpuSpec, PsuSpec } from './parts/specs';

import type { HardwareConfig, MemorySpec, MotherboardSpec } from '@/sim';
import { partDefinition, partDefinitions } from './parameters';

/**
 * A build in progress. Each part is a real part in its own right — the CPU
 * carries its own caches — so a build is no longer a slice of the simulation
 * config: it is the set of parts the reader has added, any of which may be
 * absent. `completeBuild` projects the memory path back out when every sim part
 * is present; a sim-less part (a GPU, a PSU) will live here too, owning no slot
 * in `HardwareConfig`.
 */
export interface Build {
  readonly cpu: CpuPart | null;
  readonly memory: MemorySpec | null;
  readonly motherboard: MotherboardSpec | null;
  readonly gpu: GpuSpec | null;
  readonly psu: PsuSpec | null;
}

/** Where every build starts: nothing added. */
export function emptyBuild(): Build {
  return { cpu: null, memory: null, motherboard: null, gpu: null, psu: null };
}

/**
 * True when every slot this part owns is present. Defined once, as the part's
 * `read` returning non-null, so the editor, the picker and the sheet cannot
 * disagree about what "this build has a CPU" means.
 */
export function hasPart(build: Build, part: PartId): boolean {
  return partDefinition(part).read(build) !== null;
}

/** The parts this build has not added, in the order the sheet asks for them. */
export function missingParts(build: Build): readonly PartId[] {
  return partDefinitions()
    .map(definition => definition.id)
    .filter(part => !hasPart(build, part));
}

/**
 * The memory-path config the core consumes, or null while a sim part is missing.
 * The projection lifts the CPU part's nested caches up to `HardwareConfig.caches`,
 * where the engine reads them.
 */
export function completeBuild(build: Build): HardwareConfig | null {
  const { cpu, memory, motherboard } = build;
  if (cpu === null || memory === null || motherboard === null)
    return null;
  return { caches: cpu.caches, cpu: cpu.cpu, memory, motherboard };
}

/**
 * The present parts as a compatibility view, for the rules that walk it
 * (`buildChecks`, `validateConfiguration`) and the sim-path limits
 * (`buildLimits`, which ignores the sim-less parts). A part contributes nothing
 * until it is added.
 */
export function toConfigParts(build: Build): CompatParts {
  const parts: { -readonly [K in keyof CompatParts]?: CompatParts[K] } = {};
  if (build.cpu !== null) {
    parts.cpu = build.cpu.cpu;
    parts.caches = build.cpu.caches;
  }
  if (build.memory !== null)
    parts.memory = build.memory;
  if (build.motherboard !== null)
    parts.motherboard = build.motherboard;
  if (build.gpu !== null)
    parts.gpu = build.gpu;
  if (build.psu !== null)
    parts.psu = build.psu;
  return parts;
}

/**
 * Adds a part at its blank values. Refuses rather than replaces, so a build
 * cannot silently lose a part it was measured with.
 */
export function addPart(build: Build, part: PartId): Build {
  const definition = partDefinition(part);
  if (definition.read(build) !== null)
    return build;
  return definition.write(build, definition.blank);
}

/** Removes a part, returning the slot to absent. */
export function removePart(build: Build, part: PartId): Build {
  switch (part) {
    case 'cpu':
      return { ...build, cpu: null };
    case 'memory':
      return { ...build, memory: null };
    case 'motherboard':
      return { ...build, motherboard: null };
    case 'gpu':
      return { ...build, gpu: null };
    case 'psu':
      return { ...build, psu: null };
    default: {
      // Forces this switch to be revisited when a new part kind is added.
      const unreachable: never = part;
      return unreachable;
    }
  }
}
