import type { BoardPart } from '@/board';
import type { ResourceStats } from '@/sim';

import { formatCount, formatDuration, formatPercent } from './format';

/**
 * The sentence a view shows about the part under the pointer. One implementation,
 * so the flat board and the 3D model cannot end up describing the same part in
 * two different ways.
 */
export function describePart(part: BoardPart, resources: readonly ResourceStats[]): string {
  const level = resources.find(resource => resource.id === part.levelId);
  if (part.levelId === null || level === undefined)
    return `${part.label} — not simulated yet`;

  // Slot population goes early: a narrow canvas truncates the tail, and the
  // population is the least obvious figure in the line.
  const slots = part.strips === undefined || part.strips.count < 1
    ? ''
    : ` · ${part.strips.occupied} of ${part.strips.count} slots populated`;
  return `${part.label} — ${formatPercent(level.utilisation)} busy${slots} · ${formatCount(level.accesses)} accesses · ${formatDuration(level.busyNs)} of service`;
}
