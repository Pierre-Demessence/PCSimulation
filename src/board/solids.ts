import type { BoardPart, PartKind } from './types';

/**
 * How tall each kind of part stands, where its bottom sits, and how far it rises
 * when the view is fully exploded.
 *
 * Height is the third dimension's whole job: an M.2 stick and a DIMM occupy
 * similar board area, so their proportions are what tell them apart.
 */
export interface PartSolid {
  readonly baseMm: number;
  readonly heightMm: number;
  readonly liftMm: number;
}

const SOLIDS: Record<PartKind, PartSolid> = {
  cache: { baseMm: 8, heightMm: 3, liftMm: 46 },
  chipset: { baseMm: 0, heightMm: 6, liftMm: 34 },
  cpu: { baseMm: 0, heightMm: 8, liftMm: 0 },
  dimm: { baseMm: 0, heightMm: 31, liftMm: 42 },
  gpu: { baseMm: 0, heightMm: 24, liftMm: 52 },
  psu: { baseMm: 0, heightMm: 20, liftMm: 60 },
  slot: { baseMm: 0, heightMm: 3, liftMm: 24 },
  storage: { baseMm: 0, heightMm: 14, liftMm: 44 },
};

/** The caches are stacked on the package, so each rises from its own rung. */
const CACHE_LIFT: Readonly<Record<string, number>> = { l1: 92, l2: 66, l3: 40 };

/** Where a part's solid stands at the given explode position. */
export interface PartPlacement {
  /** The bottom of the solid, in millimetres above the board. */
  readonly bottomMm: number;
  readonly heightMm: number;
  /** The top of the solid. */
  readonly topMm: number;
}

export function solidAt(part: BoardPart, explode: number): PartPlacement {
  const solid = SOLIDS[part.kind];
  const rise = Math.min(1, Math.max(0, explode)) * (CACHE_LIFT[part.id] ?? solid.liftMm);
  const bottomMm = solid.baseMm + rise;
  return { bottomMm, heightMm: solid.heightMm, topMm: bottomMm + solid.heightMm };
}
