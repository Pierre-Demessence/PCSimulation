import type { BottleneckClass, LevelId, ResourceRole, SimSpan } from '@/sim';

import { formatCount, formatDuration, formatPercent, logBar } from './format';

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

/**
 * Palette note: red, orange and green are the requested family, but a
 * red/green weakness makes hue alone unreliable, so every state also carries a
 * hatch density, a text label and a number. The colour is the bonus cue.
 */
const COLOURS = {
  background: '#11151c',
  band: '#1a2029',
  bandEdge: '#2a333f',
  busy: '#d98a2b',
  fillOutline: '#b9a7ff',
  ok: '#2f9e44',
  packet: '#79b8ff',
  saturated: '#c8322b',
  text: '#e8eef5',
  muted: '#96a3b2',
  wait: '#d9b36c',
};

const FONT_SANS = 'system-ui, -apple-system, Segoe UI, sans-serif';
const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

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

export function countActiveSpans(spans: readonly SimSpan[], level: LevelId, atNs: number): number {
  let active = 0;
  for (const span of spans) {
    if (span.level === level && span.startNs <= atNs && atNs < span.endNs)
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
      this.drawCentredMessage(context, cssWidth, cssHeight, 'Running the simulation…');
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
    context.fillStyle = utilisation >= 0.8 ? COLOURS.saturated : utilisation >= 0.5 ? COLOURS.busy : COLOURS.ok;
    context.fillRect(rect.x, rect.y, filled, rect.h);

    const spacing = utilisation >= 0.8 ? 3 : utilisation >= 0.5 ? 6 : utilisation > 0 ? 12 : 0;
    if (spacing > 0 && filled > 0) {
      context.save();
      context.beginPath();
      context.rect(rect.x, rect.y, filled, rect.h);
      context.clip();
      context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      context.lineWidth = 1;
      for (let x = rect.x - rect.h; x < rect.x + filled + rect.h; x += spacing) {
        context.beginPath();
        context.moveTo(x, rect.y + rect.h);
        context.lineTo(x + rect.h, rect.y);
        context.stroke();
      }
      context.restore();
    }
  }

  /**
   * One glyph shape per phase, so the meaning survives with no colour
   * perception at all: square = resident at a cache level, triangle = moving on
   * the bus, diamond = waiting on the DRAM, hollow square = line returning.
   */
  private drawGlyph(context: CanvasRenderingContext2D, kind: SimSpan['kind'], x: number, y: number): void {
    const half = PACKET_SIZE / 2;

    if (kind === 'fill') {
      context.strokeStyle = COLOURS.fillOutline;
      context.lineWidth = 1.5;
      context.strokeRect(x + 0.5, y + 0.5, PACKET_SIZE - 1, PACKET_SIZE - 1);
      return;
    }

    if (kind === 'transfer') {
      // A triangle: distinct from the square by shape alone, so the legend reads
      // with no colour perception at all.
      context.fillStyle = COLOURS.packet;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + PACKET_SIZE, y + half);
      context.lineTo(x, y + PACKET_SIZE);
      context.closePath();
      context.fill();
      return;
    }

    if (kind === 'dram') {
      context.fillStyle = COLOURS.wait;
      context.beginPath();
      context.moveTo(x + half, y);
      context.lineTo(x + PACKET_SIZE, y + half);
      context.lineTo(x + half, y + PACKET_SIZE);
      context.lineTo(x, y + half);
      context.closePath();
      context.fill();
      return;
    }

    context.fillStyle = COLOURS.packet;
    context.fillRect(x, y, PACKET_SIZE, PACKET_SIZE);
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

    for (const span of spans) {
      if (span.level !== level || simulatedNs < span.startNs || simulatedNs >= span.endNs)
        continue;

      const duration = span.endNs - span.startNs;
      const progress = duration > 0 ? (simulatedNs - span.startNs) / duration : 1;
      const lane = span.requestIndex % lanes;
      const x = laneX + lane * PACKET_STRIDE;
      // A fill travels back up toward the core; everything else travels down.
      const y = span.kind === 'fill'
        ? top + travel - progress * travel
        : top + progress * travel;

      this.drawGlyph(context, span.kind, x, y);
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

    const glyphs: readonly (readonly [SimSpan['kind'], string])[] = [
      ['level', 'at a cache level'],
      ['transfer', 'queued or on the bus'],
      ['dram', 'waiting on DRAM'],
      ['fill', 'line returning'],
    ];

    let x = PADDING_X;
    for (const [kind, label] of glyphs) {
      this.drawGlyph(context, kind, x, y - 5);
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

  private drawCentredMessage(
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
}
