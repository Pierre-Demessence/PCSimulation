import type { PartId } from '../parameters';

import catalogueData from './catalogue.json';

/** A curated real part, ready to write into a build. `spec` is the part object. */
export interface CatalogueChoice {
  readonly id: string;
  readonly name: string;
  readonly spec: unknown;
}

interface CatalogueEntry {
  readonly id: string;
  readonly kind: PartId;
  readonly name: string;
  readonly spec: unknown;
}

const ENTRIES = catalogueData as unknown as readonly CatalogueEntry[];

/** The catalogue parts of a given kind, in id order, each ready for `write`. */
export function catalogueFor(part: PartId): readonly CatalogueChoice[] {
  return ENTRIES
    .filter(entry => entry.kind === part)
    .map(entry => ({ id: entry.id, name: entry.name, spec: entry.spec }));
}
