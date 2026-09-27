import type { PartId } from './parameters';

import type { HardwareConfig } from '@/sim';
import { partDefinition, partDefinitions } from './parameters';

/**
 * A build in progress. Parts arrive one at a time, so the config is partial: a
 * build with no memory has no memory. Nothing is ever filled in for the reader,
 * because a machine nobody assembled is a rig with a smaller name.
 */
export interface Build {
  readonly parts: Partial<HardwareConfig>;
}

/** Where every build starts: nothing added. */
export function emptyBuild(): Build {
  return { parts: {} };
}

/**
 * True when every slot this part owns is present. Defined once, as the part's
 * `read` returning non-null, so the editor, the picker and the sheet cannot
 * disagree about what "this build has a CPU" means.
 */
export function hasPart(build: Build, part: PartId): boolean {
  return partDefinition(part).read(build.parts) !== null;
}

/** The parts this build has not added, in the order the sheet asks for them. */
export function missingParts(build: Build): readonly PartId[] {
  return partDefinitions()
    .map(definition => definition.id)
    .filter(part => !hasPart(build, part));
}

/** The complete config the core consumes, or null while a part is missing. */
export function completeBuild(build: Build): HardwareConfig | null {
  const { caches, cpu, memory, motherboard } = build.parts;
  if (caches === undefined || cpu === undefined || memory === undefined || motherboard === undefined)
    return null;
  return { caches, cpu, memory, motherboard };
}

/**
 * Adds a part at its blank values. Refuses rather than replaces, so a build
 * cannot silently lose a part it was measured with.
 */
export function addPart(build: Build, part: PartId): Build {
  const definition = partDefinition(part);
  if (definition.read(build.parts) !== null)
    return build;
  return { parts: definition.write(build.parts, definition.blank) };
}
