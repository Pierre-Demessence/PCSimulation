import type { LevelId, SimSpan } from '@/sim';

/** One request in flight, placed by how far through its span it is. */
export interface FlowToken {
  readonly kind: SimSpan['kind'];
  /** 0 when the span starts, 1 when it ends. */
  readonly progress: number;
  readonly requestIndex: number;
}

/**
 * True when a request is resident at the given instant. Half-open at the end,
 * so a request is never in two places at once — and so this one predicate can
 * serve a count, a token list and the swimlane's layout alike.
 */
export function isResident(span: SimSpan, atNs: number): boolean {
  return atNs >= span.startNs && atNs < span.endNs;
}

/** How far through its span a request is: 0 at the start, 1 at the end. */
export function progressOf(span: SimSpan, atNs: number): number {
  const duration = span.endNs - span.startNs;
  return duration > 0 ? (atNs - span.startNs) / duration : 1;
}

/**
 * The requests resident at a level at one instant. A span covers a request's
 * whole residency at the level, so "does this instant fall inside the span" is a
 * true in-flight count rather than a guess.
 */
export function tokensAt(
  spans: readonly SimSpan[],
  levelId: LevelId,
  atNs: number,
): readonly FlowToken[] {
  const tokens: FlowToken[] = [];
  for (const span of spans) {
    if (span.level !== levelId || !isResident(span, atNs))
      continue;
    tokens.push({
      kind: span.kind,
      progress: progressOf(span, atNs),
      requestIndex: span.requestIndex,
    });
  }
  return tokens;
}

/** A fill climbs back up the hierarchy; everything else travels down it. */
export function travelsBackUp(kind: SimSpan['kind']): boolean {
  return kind === 'fill';
}

/**
 * Where a request sits along a trace. A DRAM wait is time parked at the far end
 * rather than time on the wire, so it does not drift along the line.
 */
export function traceProgress(token: FlowToken): number {
  return token.kind === 'dram' ? 1 : token.progress;
}

/**
 * Where a request sits inside a level. A fill travels back toward the core, so
 * a request reads as one round trip; a DRAM wait parks where it is.
 */
export function roundTripProgress(token: FlowToken): number {
  if (token.kind === 'dram')
    return 1;
  return travelsBackUp(token.kind) ? 1 - token.progress : token.progress;
}
