import type { BottleneckClass } from '@/sim';

import { formatDuration } from './format';
import { drawGlyph, fitText, PHASE_LEGEND } from './glyphs';
import { COLOURS, FONT_MONO, FONT_SANS } from './palette';

export const HUD_PADDING_X = 14;
export const HUD_HEADER_H = 50;
export const HUD_FOOTER_H = 92;

const GLYPH_SIZE = 7;

export interface HudData {
  readonly title: string;
  readonly subtitle: string;
  readonly simulatedNs: number;
  readonly nsPerSecond: number;
  readonly windowNs: number;
  readonly explode: number;
  readonly classification: BottleneckClass;
  /** What the hovered part is, or null for the standing hint. */
  readonly detail: string | null;
}

/**
 * The strip that says what is on screen and how fast it is playing. Shared by
 * every view, so the two-dimensional board, the three-dimensional model and the
 * swimlane all describe the same run in the same words.
 *
 * Time runs at a constant, labelled dilation. A non-linear time axis is
 * deliberately rejected: it would decouple a token's speed on screen from its
 * real duration, which is the one quantity the view exists to show.
 */
export function drawHudHeader(
  context: CanvasRenderingContext2D,
  width: number,
  data: HudData,
): void {
  // Measure the clock first: it is right-aligned and fixed, so the two lines on
  // the left have to make do with what is left of the width.
  context.font = `12px ${FONT_MONO}`;
  const clockWidth = Math.max(
    context.measureText(`1 real second = ${formatDuration(data.nsPerSecond)} simulated`).width,
    context.measureText(`t = ${formatDuration(data.simulatedNs)} of ${formatDuration(data.windowNs)}`).width,
  );
  const room = width - HUD_PADDING_X * 3 - clockWidth;

  context.textAlign = 'left';
  context.fillStyle = COLOURS.text;
  context.font = `600 15px ${FONT_SANS}`;
  context.fillText(fitText(context, data.title, room), HUD_PADDING_X, 21);

  context.fillStyle = COLOURS.muted;
  context.font = `12px ${FONT_SANS}`;
  context.fillText(fitText(context, data.subtitle, room), HUD_PADDING_X, 39);

  context.textAlign = 'right';
  context.font = `12px ${FONT_MONO}`;
  context.fillText(`1 real second = ${formatDuration(data.nsPerSecond)} simulated`, width - HUD_PADDING_X, 21);
  context.fillText(`t = ${formatDuration(data.simulatedNs)} of ${formatDuration(data.windowNs)}`, width - HUD_PADDING_X, 39);
  context.textAlign = 'left';
}

/**
 * The legend, the hovered part's numbers, and the two standing sentences. Every
 * line is trimmed to the canvas: an entry that does not fit is cut with an
 * ellipsis rather than run off the edge or collide with its neighbour.
 */
export function drawHudFooter(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: HudData,
): void {
  const y = height - HUD_FOOTER_H + 14;
  const room = width - HUD_PADDING_X * 2;
  context.font = `11px ${FONT_SANS}`;

  let x = HUD_PADDING_X;
  for (const [kind, label] of PHASE_LEGEND) {
    const left = room - (x - HUD_PADDING_X);
    const text = fitText(context, label, left - GLYPH_SIZE - 12);
    if (text.length === 0)
      break;
    drawGlyph(context, kind, x, y - 5, GLYPH_SIZE);
    context.fillStyle = COLOURS.muted;
    context.fillText(text, x + GLYPH_SIZE + 6, y);
    x += GLYPH_SIZE + 10 + context.measureText(text).width + 16;
  }

  if (data.detail === null) {
    context.fillStyle = COLOURS.muted;
    context.font = `11px ${FONT_SANS}`;
    context.fillText(fitText(context, 'Hover a part for its numbers.', room), HUD_PADDING_X, y + 19);
  }
  else {
    context.fillStyle = COLOURS.text;
    context.font = `600 12px ${FONT_SANS}`;
    context.fillText(fitText(context, data.detail, room), HUD_PADDING_X, y + 19);
  }

  context.fillStyle = COLOURS.muted;
  context.font = `11px ${FONT_SANS}`;
  context.fillText(
    fitText(
      context,
      data.explode >= 1
        ? 'Fully exploded: the parts are laid out in the order the data reaches them.'
        : data.explode <= 0
          ? 'Assembled on the board. Slide Explode to pull the parts apart and see what is wired to what.'
          : 'Slide Explode to 0 to assemble the parts onto the board, or to 100% to separate them.',
      room,
    ),
    HUD_PADDING_X,
    y + 37,
  );
  context.fillText(
    fitText(
      context,
      data.classification === 'latency-bound'
        ? 'No resource is saturated: the limit is the dependency chain itself, not any one part.'
        : 'The tagged part is saturated, so it is what the workload waits on.',
      room,
    ),
    HUD_PADDING_X,
    y + 55,
  );
}
