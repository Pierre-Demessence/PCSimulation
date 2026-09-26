import type { LevelId } from '@/sim';

/**
 * What a part looks like. Drives the outline and, for context parts, the
 * dimmer fill — never the only cue: every part also carries a label, and every
 * simulated part carries a meter.
 */
export type PartKind = 'cache' | 'chipset' | 'cpu' | 'dimm' | 'gpu' | 'psu' | 'slot' | 'storage';

/** A rectangle on the board, in millimetres from the board's top-left corner. */
export interface BoardRect {
  readonly xMm: number;
  readonly yMm: number;
  readonly wMm: number;
  readonly hMm: number;
}

/** A point on the board, in millimetres from its top-left corner. */
export interface BoardPoint {
  readonly xMm: number;
  readonly yMm: number;
}

/** A visible stretch of a trace, trimmed to the space between two parts. */
export interface BoardSegment {
  readonly from: BoardPoint;
  readonly to: BoardPoint;
}

/** Parallel slots drawn inside a part, as a DIMM bank is. */
export interface BoardStrips {
  readonly count: number;
  readonly occupied: number;
}

export interface BoardPart {
  readonly id: string;
  /** Full name, for the callout when the part is hovered. */
  readonly label: string;
  /** Short name, drawn on the part itself when it fits. */
  readonly short: string;
  readonly kind: PartKind;
  /** Where the part sits on the board with the view collapsed. */
  readonly boardRect: BoardRect;
  /** Where the part sits with the view fully exploded. */
  readonly explodedRect: BoardRect;
  /** The simulated level this part carries, or null when it is context only. */
  readonly levelId: LevelId | null;
  /** Present when the part is drawn as a row of slots rather than a plain box. */
  readonly strips?: BoardStrips;
}

export interface BoardLink {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /**
   * The level whose spans travel along this trace. That level's part then
   * animates on the trace instead of inside its own block — which is what makes
   * the memory channel read as a bus rather than a box.
   */
  readonly levelId: LevelId | null;
}

export interface BoardLayout {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly parts: readonly BoardPart[];
  readonly links: readonly BoardLink[];
}
