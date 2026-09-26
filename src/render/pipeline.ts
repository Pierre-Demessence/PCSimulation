import type { BottleneckClass, LevelId, ResourceRole, SimSpan } from '@/sim';

import { isResident, tokensAt, travelsBackUp } from '@/board';

import { formatCount, formatDuration, formatPercent, logBar } from './format';
import { drawCentredMessage, drawGlyph, drawHatch, PHASE_LEGEND } from './glyphs';
import { COLOURS, FONT_MONO, FONT_SANS, utilisationColour, utilisationHatch } from './palette';

const ROW_ORDER: readonly LevelId[] = ['cpu', 'l1', 'l2', 'l3', 'memory'];

const LEVEL_LABELS: Record<LevelId, string> = {
  cpu: 'CPU core',
  l1: 'L1 cache',
  l2: 'L2 cache',
  l3: 'L3 cache',
  memory: 'Memory bus',
};

/** Human name for a level, for anywhere that shows the limiter. */
export function levelLabel(id: LevelId): string {
  return LEVEL_LABELS[id];
}

const PADDING_X = 14;
const HEADER_H = 50;
const FOOTER_H = 62;
const ROW_GAP = 6;
const PACKET_SIZE = 6;
const PACKET_STRIDE = 8;

export interface PipelineLevelView {
  readonly id: LevelId;
  readonly role: ResourceRole;
  readonly utilisation: number;
  readonly busyNs: number;
  readonly accesses: number;
}

export interface PipelineData {
  readonly title: string;
  readonly subtitle: string;
  readonly levels: readonly PipelineLevelView[];
  readonly spans: readonly SimSpan[];
  readonly windowNs: number;
  readonly bottleneckId: LevelId | null;
  readonly classification: BottleneckClass;
}

/** Simulated time reached after `elapsedMs` of playback at a constant rate. */
export function simulatedNsAt(elapsedMs: number, nsPerSecond: number): number {
  if (!(elapsedMs > 0) || !(nsPerSecond > 0))
    return 0;
  return (elapsedMs / 1000) * nsPerSecond;
}

/**
 * How many requests are in flight at a level. Shares the residency predicate
 * with `tokensAt` rather than restating it, and stays allocation-free because it
 * runs once per row per frame.
 */
export function countActiveSpans(spans: readonly SimSpan[], level: LevelId, atNs: number): number {
  let active = 0;
  for (const span of spans) {
    if (span.level === level && isResident(span, atNs))
      active += 1;
  }
  return active;
}

interface Rect {
  readonly h: number;
  readonly w: number;
  readonly x: number;
  readonly y: number;
}

export class PipelineView {
  private readonly canvas: HTMLCanvasElement;
  private data: PipelineData | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  setData(data: PipelineData): void {
    this.data = data;
  }

  /** Longest span end, which is how much simulated time there is to play. */
  static windowOf(spans: readonly SimSpan[]): number {
    let windowNs = 0;
    for (const span of spans)
      windowNs = Math.max(windowNs, span.endNs);
    return windowNs;
  }

  render(simulatedNs: number, nsPerSecond: number): void {
    const context = this.canvas.getContext('2d');
    if (context === null)
      return;

    const dpr = globalThis.devicePixelRatio || 1;
    const cssWidth = this.canvas.clientWidth || 900;
    const cssHeight = this.canvas.clientHeight || 620;
    const pixelWidth = Math.round(cssWidth * dpr);
    const pixelHeight = Math.round(cssHeight * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillStyle = COLOURS.background;
    context.fillRect(0, 0, cssWidth, cssHeight);

    const data = this.data;
    if (data === null) {
      drawCentredMessage(context, cssWidth, cssHeight, 'Running the simulation…');
      return;
    }

    this.drawHeader(context, cssWidth, data, simulatedNs, nsPerSecond);

    const rowH = (cssHeight - HEADER_H - FOOTER_H) / ROW_ORDER.length;
    const bandW = cssWidth - PADDING_X * 2;
    const maxBusyNs = data.levels.reduce((max, level) => Math.max(max, level.busyNs), 0);

    ROW_ORDER.forEach((id, index) => {
      const rect: Rect = {
        h: rowH - ROW_GAP,
        w: bandW,
        x: PADDING_X,
        y: HEADER_H + index * rowH,
      };
      const level = data.levels.find(candidate => candidate.id === id);
      if (level === undefined)
        return;
      this.drawRow(context, rect, level, data, simulatedNs, maxBusyNs);
    });

    this.drawFooter(context, cssWidth, cssHeight, data);
  }

  private drawHeader(
    context: CanvasRenderingContext2D,
    width: number,
    data: PipelineData,
    simulatedNs: number,
    nsPerSecond: number,
  ): void {
    context.fillStyle = COLOURS.text;
    context.font = `600 15px ${FONT_SANS}`;
    context.textAlign = 'left';
    context.fillText(data.title, PADDING_X, 21);

    context.fillStyle = COLOURS.muted;
    context.font = `12px ${FONT_SANS}`;
    context.fillText(data.subtitle, PADDING_X, 39);
    context.textAlign = 'right';
    context.font = `12px ${FONT_MONO}`;
    // Constant dilation: distances in time stay truthful, so no non-linear
    // axis is introduced and none needs disclaiming.
    context.fillText(`1 real second = ${formatDuration(nsPerSecond)} simulated`, width - PADDING_X, 21);
    context.fillText(`t = ${formatDuration(simulatedNs)} of ${formatDuration(data.windowNs)}`, width - PADDING_X, 39);
    context.textAlign = 'left';
  }

  private drawRow(
    context: CanvasRenderingContext2D,
    rect: Rect,
    level: PipelineLevelView,
    data: PipelineData,
    simulatedNs: number,
    maxBusyNs: number,
  ): void {
    const isBottleneck = data.bottleneckId === level.id;

    context.fillStyle = COLOURS.band;
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    context.strokeStyle = isBottleneck ? COLOURS.saturated : COLOURS.bandEdge;
    context.lineWidth = isBottleneck ? 2 : 1;
    context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    // Fixed column widths keep every row aligned, and reserving the tag column
    // on all rows stops the bar length from jumping when the tag appears.
    const labelW = 100;
    const percentW = 54;
    const tagW = 96;
    const right = rect.x + rect.w - 10;
    const tagX = right - tagW + 8;
    const barX = rect.x + labelW + 10;
    const barW = Math.max(40, right - tagW - percentW - barX - 6);
    // Derived from the bar's end, not from the right edge, so a floored bar on a
    // narrow canvas cannot run under the percentage text.
    const percentX = barX + barW + 6;

    context.fillStyle = isBottleneck ? COLOURS.saturated : COLOURS.text;
    context.font = `600 12px ${FONT_SANS}`;
    context.textAlign = 'left';
    context.fillText(LEVEL_LABELS[level.id], rect.x + 10, rect.y + 18);

    this.drawUtilisationBar(context, { h: 10, w: barW, x: barX, y: rect.y + 9 }, level.utilisation);

    context.fillStyle = COLOURS.text;
    context.font = `600 12px ${FONT_MONO}`;
    context.fillText(formatPercent(level.utilisation), percentX, rect.y + 18);

    if (isBottleneck)
      this.drawBottleneckTag(context, tagX, rect.y + 6, tagW - 8);

    context.fillStyle = COLOURS.muted;
    context.font = `11px ${FONT_MONO}`;
    context.fillText(
      `busy ${formatDuration(level.busyNs)} (log) · ${formatCount(level.accesses)} accesses`,
      rect.x + 10,
      rect.y + 36,
    );

    const active = countActiveSpans(data.spans, level.id, simulatedNs);
    if (active > 0) {
      context.fillStyle = COLOURS.text;
      context.font = `600 11px ${FONT_MONO}`;
      context.textAlign = 'right';
      context.fillText(`${active} in flight`, right, rect.y + 36);
      context.textAlign = 'left';
    }

    // The log-scaled accumulator sits on its own line, directly under the bar it
    // annotates: per-level busy times span orders of magnitude, so a linear bar
    // would show nothing at all for the fast levels.
    const meterY = rect.y + 43;
    const meterH = 6;
    context.fillStyle = COLOURS.bandEdge;
    context.fillRect(barX, meterY, barW, meterH);
    context.fillStyle = COLOURS.muted;
    context.fillRect(barX, meterY, barW * logBar(level.busyNs, maxBusyNs), meterH);

    this.drawPackets(context, rect, level.id, data.spans, simulatedNs, barX, barW);
  }

  /** Linear length plus a hatch density, so hue is never the only cue. */
  private drawUtilisationBar(context: CanvasRenderingContext2D, rect: Rect, utilisation: number): void {
    context.fillStyle = COLOURS.bandEdge;
    context.fillRect(rect.x, rect.y, rect.w, rect.h);

    const filled = rect.w * Math.min(1, Math.max(0, utilisation));
    context.fillStyle = utilisationColour(utilisation);
    context.fillRect(rect.x, rect.y, filled, rect.h);
    drawHatch(context, rect.x, rect.y, filled, rect.h, utilisationHatch(utilisation));
  }

  private drawPackets(
    context: CanvasRenderingContext2D,
    rect: Rect,
    level: LevelId,
    spans: readonly SimSpan[],
    simulatedNs: number,
    laneX: number,
    laneWidth: number,
  ): void {
    const top = rect.y + 55;
    const travel = Math.max(4, rect.h - 60);
    const lanes = Math.max(1, Math.floor(laneWidth / PACKET_STRIDE));

    // The residency rule lives in one place, so this view and the board view
    // cannot drift into disagreeing about what was in flight.
    for (const token of tokensAt(spans, level, simulatedNs)) {
      const lane = token.requestIndex % lanes;
      const x = laneX + lane * PACKET_STRIDE;
      // A fill travels back up toward the core; everything else travels down.
      const y = travelsBackUp(token.kind)
        ? top + travel - token.progress * travel
        : top + token.progress * travel;

      drawGlyph(context, token.kind, x, y, PACKET_SIZE);
    }
  }

  private drawBottleneckTag(context: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    const label = 'BOTTLENECK';
    context.font = `700 11px ${FONT_SANS}`;

    context.fillStyle = COLOURS.saturated;
    context.fillRect(x, y, width, 17);
    context.fillStyle = COLOURS.text;
    context.textAlign = 'center';
    context.fillText(label, x + width / 2, y + 12.5);
    context.textAlign = 'left';
  }

  private drawFooter(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    data: PipelineData,
  ): void {
    const y = height - FOOTER_H + 14;
    context.font = `11px ${FONT_SANS}`;

    let x = PADDING_X;
    for (const [kind, label] of PHASE_LEGEND) {
      drawGlyph(context, kind, x, y - 5, PACKET_SIZE);
      context.fillStyle = COLOURS.muted;
      context.fillText(label, x + PACKET_SIZE + 6, y);
      x += PACKET_SIZE + 10 + context.measureText(label).width + 16;
    }

    context.fillStyle = COLOURS.muted;
    context.fillText(
      data.classification === 'latency-bound'
        ? 'No resource is saturated: the limit is the dependency chain itself.'
        : 'The tagged resource is saturated, so it is what the workload waits on.',
      PADDING_X,
      y + 18,
    );
    context.fillText(
      'Each packet moves at a speed that matches its real duration. Bars marked (log) are logarithmic.',
      PADDING_X,
      y + 34,
    );

    context.textAlign = 'right';
    context.fillText(`${formatCount(data.spans.length)} traced spans`, width - PADDING_X, y + 34);
    context.textAlign = 'left';
  }
}
