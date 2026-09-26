import type { SimSpan } from '@/sim';

import { COLOURS, FONT_SANS } from './palette';

/**
 * The four traffic phases and what each one means. One table, so the two views
 * cannot drift into describing the same glyph two ways.
 */
export const PHASE_LEGEND: readonly (readonly [SimSpan['kind'], string])[] = [
  ['level', 'at a cache level'],
  ['transfer', 'queued or on the bus'],
  ['dram', 'waiting on DRAM'],
  ['fill', 'line returning'],
];

/** Trims text to fit a width, so a narrow canvas cannot make two labels collide. */
export function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!(maxWidth > 0))
    return '';
  if (context.measureText(text).width <= maxWidth)
    return text;

  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}\u2026`).width > maxWidth)
    cut = cut.slice(0, -1);
  return `${cut}\u2026`;
}

export function drawCentredMessage(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  message: string,
): void {
  context.fillStyle = COLOURS.muted;
  context.font = `13px ${FONT_SANS}`;
  context.textAlign = 'center';
  context.fillText(message, width / 2, height / 2);
  context.textAlign = 'left';
}

/**
 * One glyph shape per phase, so the meaning survives with no colour perception
 * at all: square = resident at a cache level, triangle = moving on the bus,
 * diamond = waiting on the DRAM, hollow square = line returning.
 */
export function drawGlyph(
  context: CanvasRenderingContext2D,
  kind: SimSpan['kind'],
  x: number,
  y: number,
  size: number,
): void {
  const half = size / 2;

  if (kind === 'fill') {
    context.strokeStyle = COLOURS.fillOutline;
    context.lineWidth = 1.5;
    context.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    return;
  }

  if (kind === 'transfer') {
    // A triangle: distinct from the square by shape alone, so the legend reads
    // with no colour perception at all.
    context.fillStyle = COLOURS.packet;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + size, y + half);
    context.lineTo(x, y + size);
    context.closePath();
    context.fill();
    return;
  }

  if (kind === 'dram') {
    context.fillStyle = COLOURS.wait;
    context.beginPath();
    context.moveTo(x + half, y);
    context.lineTo(x + size, y + half);
    context.lineTo(x + half, y + size);
    context.lineTo(x, y + half);
    context.closePath();
    context.fill();
    return;
  }

  context.fillStyle = COLOURS.packet;
  context.fillRect(x, y, size, size);
}

/**
 * Diagonal hatching, clipped to a rectangle. A second, non-colour channel for
 * "how busy": the same fill reads as light, medium or dense regardless of hue.
 */
export function drawHatch(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  spacing: number,
): void {
  if (!(spacing > 0) || !(w > 0) || !(h > 0))
    return;

  context.save();
  context.beginPath();
  context.rect(x, y, w, h);
  context.clip();
  context.strokeStyle = COLOURS.hatchStroke;
  context.lineWidth = 1;
  for (let startX = x - h; startX < x + w + h; startX += spacing) {
    context.beginPath();
    context.moveTo(startX, y + h);
    context.lineTo(startX + h, y);
    context.stroke();
  }
  context.restore();
}
