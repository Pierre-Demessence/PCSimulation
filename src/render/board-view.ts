import type { BoardData } from './board-data';

import type { HudData } from './hud';

import type { BoardPart, BoardPoint, BoardRect, BoardSegment, FlowToken } from '@/board';
import { linkSegment, partAtPoint, partById, partRect, roundTripProgress, tokensAt, traceProgress } from '@/board';
import { describePart } from './describe';
import { clamp01 } from './format';
import { drawCentredMessage, drawGlyph, drawHatch } from './glyphs';
import {
  drawHudFooter,
  drawHudHeader,
  HUD_FOOTER_H as FOOTER_H,
  HUD_HEADER_H as HEADER_H,
  HUD_PADDING_X as PADDING_X,
} from './hud';
import { COLOURS, FONT_SANS, utilisationColour, utilisationHatch } from './palette';

const BOARD_MARGIN = 12;
const GLYPH_SIZE = 7;
const BLOCK_STRIDE = 9;
const BLOCK_LANES_MAX = 6;
const LINK_LANES = 3;
const METER_H = 5;
const ARROW_SIZE = 7;
const ROOMY_W = 44;
const ROOMY_H = 40;

interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

interface BlockMetrics {
  /** True when the block can spare a strip at the top for its name. */
  readonly nameAtTop: boolean;
  readonly meterVisible: boolean;
  readonly travelLength: number;
  readonly travelStart: number;
}

/**
 * How a block divides its height between its name, its tokens and its meter. A
 * roomy block stacks all three; a cramped one keeps its name centred and gives
 * the tokens what room is left, because the exploded view is where a small part
 * is meant to be read.
 */
function blockMetrics(w: number, h: number, simulated: boolean): BlockMetrics {
  const roomy = w >= ROOMY_W && h >= ROOMY_H;
  const meterVisible = simulated && w > 16 && h >= 24;
  const top = roomy ? 22 : Math.min(8, h / 5);
  const bottom = meterVisible ? (roomy ? 14 : 11) : Math.min(8, h / 5);
  return {
    meterVisible,
    nameAtTop: roomy,
    travelLength: Math.max(6, h - top - bottom),
    travelStart: top,
  };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  from: ScreenPoint,
  to: ScreenPoint,
  colour: string,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0))
    return;

  const ux = dx / length;
  const uy = dy / length;
  context.fillStyle = colour;
  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(to.x - ux * ARROW_SIZE + uy * ARROW_SIZE * 0.5, to.y - uy * ARROW_SIZE - ux * ARROW_SIZE * 0.5);
  context.lineTo(to.x - ux * ARROW_SIZE - uy * ARROW_SIZE * 0.5, to.y - uy * ARROW_SIZE + ux * ARROW_SIZE * 0.5);
  context.closePath();
  context.fill();
}

/**
 * The machine as a picture. Parts sit where they sit on the board; the Explode
 * control slides them to the places where the data path reads clearly, and the
 * traces between them surface as the parts separate.
 *
 * Every figure the view shows is doubled by a shape, a length, a hatch density
 * or a word, so a red/green weakness costs nothing.
 */
export class BoardView {
  private readonly canvas: HTMLCanvasElement;
  private data: BoardData | null = null;
  private hoveredId: string | null = null;
  /** Screen pixels per board millimetre, recomputed every frame. */
  private scale = 1;
  private originX = 0;
  private originY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('pointerleave', this.clearHover);
    canvas.addEventListener('pointermove', this.trackHover);
  }

  setData(data: BoardData): void {
    this.data = data;
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

    drawHudHeader(context, cssWidth, this.hudData(data, simulatedNs, nsPerSecond));

    const areaW = cssWidth - PADDING_X * 2;
    const areaH = cssHeight - HEADER_H - FOOTER_H - BOARD_MARGIN;
    this.scale = Math.max(0.01, Math.min(areaW / data.layout.widthMm, areaH / data.layout.heightMm));
    this.originX = PADDING_X + (areaW - data.layout.widthMm * this.scale) / 2;
    this.originY = HEADER_H + (areaH - data.layout.heightMm * this.scale) / 2;

    this.drawBoardPlate(context, data);
    this.drawLinks(context, data);
    for (const part of data.layout.parts)
      this.drawPart(context, part, data);
    this.drawTokens(context, data, simulatedNs);
    drawHudFooter(context, cssWidth, cssHeight, this.hudData(data, simulatedNs, nsPerSecond));
  }

  /** The HUD is the same in every view, so it takes one shape of data. */
  private hudData(data: BoardData, simulatedNs: number, nsPerSecond: number): HudData {
    const hovered = this.hoveredId === null ? undefined : partById(data.layout, this.hoveredId);
    return {
      classification: data.result.classification,
      detail: hovered === undefined ? null : describePart(hovered, data.result.resources),
      explode: data.explode,
      nsPerSecond,
      simulatedNs,
      subtitle: data.subtitle,
      title: data.title,
      windowNs: data.windowNs,
    };
  }

  private readonly clearHover = (): void => {
    this.hoveredId = null;
  };

  private readonly trackHover = (event: PointerEvent): void => {
    const data = this.data;
    if (data === null)
      return;

    const bounds = this.canvas.getBoundingClientRect();
    const xMm = (event.clientX - bounds.left - this.originX) / this.scale;
    const yMm = (event.clientY - bounds.top - this.originY) / this.scale;
    this.hoveredId = partAtPoint(data.layout, data.explode, xMm, yMm)?.id ?? null;
  };

  private toScreen(point: BoardPoint): ScreenPoint {
    return { x: this.originX + point.xMm * this.scale, y: this.originY + point.yMm * this.scale };
  }

  private drawBoardPlate(context: CanvasRenderingContext2D, data: BoardData): void {
    const { layout } = data;
    const topLeft = this.toScreen({ xMm: 0, yMm: 0 });
    const w = layout.widthMm * this.scale;
    const h = layout.heightMm * this.scale;

    // The plate never disappears: once the parts have flown apart it is the only
    // thing still saying which way round the machine is.
    context.globalAlpha = 1 - 0.62 * clamp01(data.explode);

    roundedRect(context, topLeft.x, topLeft.y, w, h, Math.min(10, w / 8));
    context.fillStyle = COLOURS.recess;
    context.fill();
    context.strokeStyle = COLOURS.bandEdge;
    context.lineWidth = 1;
    context.stroke();

    context.fillStyle = COLOURS.boardIo;
    const io = this.toScreen({ xMm: 44, yMm: 0 });
    context.fillRect(io.x, io.y, 96 * this.scale, 12 * this.scale);

    context.fillStyle = COLOURS.background;
    const holes: readonly BoardPoint[] = [
      { xMm: 10, yMm: 10 },
      { xMm: layout.widthMm - 10, yMm: 10 },
      { xMm: 10, yMm: layout.heightMm - 10 },
      { xMm: layout.widthMm - 10, yMm: layout.heightMm - 10 },
    ];
    for (const hole of holes) {
      const point = this.toScreen(hole);
      context.beginPath();
      context.arc(point.x, point.y, Math.max(2, 3 * this.scale), 0, Math.PI * 2);
      context.fill();
    }

    context.globalAlpha = 1;
  }

  private drawLinks(context: CanvasRenderingContext2D, data: BoardData): void {
    for (const link of data.layout.links) {
      const segment = linkSegment(data.layout, data.explode, link);
      if (segment === null)
        continue;

      const from = this.toScreen(segment.from);
      const to = this.toScreen(segment.to);
      // The link that carries the memory spans is the one the workload lives on,
      // so it reads heavier than the internal hops.
      const carrying = link.levelId !== null;
      const colour = carrying ? COLOURS.link : COLOURS.bandEdge;

      context.strokeStyle = colour;
      context.lineWidth = carrying ? 2 : 1;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();

      drawArrowHead(context, from, to, colour);
    }
  }

  private drawPart(context: CanvasRenderingContext2D, part: BoardPart, data: BoardData): void {
    const rect = partRect(part, data.explode);
    const topLeft = this.toScreen(rect);
    const w = rect.wMm * this.scale;
    const h = rect.hMm * this.scale;
    const level = data.result.resources.find(resource => resource.id === part.levelId);
    const simulated = part.levelId !== null && level !== undefined;
    const isBottleneck = simulated && data.result.bottleneckId === part.levelId;
    const hovered = this.hoveredId === part.id;

    roundedRect(context, topLeft.x, topLeft.y, w, h, Math.min(6, w / 6, h / 6));
    context.fillStyle = simulated ? (part.kind === 'cpu' ? COLOURS.partFillCpu : COLOURS.partFill) : COLOURS.contextFill;
    context.fill();
    context.strokeStyle = isBottleneck
      ? COLOURS.saturated
      : hovered ? COLOURS.packet : simulated ? COLOURS.partEdge : COLOURS.contextEdge;
    context.lineWidth = isBottleneck ? 3 : hovered ? 2 : 1;
    context.setLineDash(simulated ? [] : [4, 3]);
    context.stroke();
    context.setLineDash([]);

    if (part.strips !== undefined && w > 20)
      this.drawStrips(context, topLeft, w, h, part);

    const metrics = blockMetrics(w, h, simulated);
    this.drawBlockName(context, part, topLeft, w, h, simulated);

    if (metrics.meterVisible && level !== undefined) {
      const meterW = w - 12;
      const meterX = topLeft.x + 6;
      const meterY = topLeft.y + h - 10;
      const filled = meterW * clamp01(level.utilisation);
      context.fillStyle = COLOURS.recess;
      context.fillRect(meterX, meterY, meterW, METER_H);
      context.fillStyle = utilisationColour(level.utilisation);
      context.fillRect(meterX, meterY, filled, METER_H);
      drawHatch(context, meterX, meterY, filled, METER_H, utilisationHatch(level.utilisation));
    }

    if (isBottleneck)
      this.drawBottleneckTag(context, topLeft.x + w / 2, Math.max(HEADER_H + 2, topLeft.y - 9));
  }

  /**
   * A DIMM bank as its slots. Which slots are populated is carried by a notch
   * and a solid outline against an empty slot's dashed one — never by fill shade
   * alone, which a red/green weakness would read as no difference at all.
   */
  private drawStrips(
    context: CanvasRenderingContext2D,
    topLeft: ScreenPoint,
    w: number,
    h: number,
    part: BoardPart,
  ): void {
    const strips = part.strips;
    if (strips === undefined || strips.count < 1)
      return;

    const gap = Math.max(1, w * 0.03);
    const slotW = (w - gap * (strips.count - 1)) / strips.count;
    const notchH = Math.max(2, Math.min(5, h * 0.03));

    for (let index = 0; index < strips.count; index++) {
      const populated = index < strips.occupied;
      const x = topLeft.x + index * (slotW + gap);
      roundedRect(context, x, topLeft.y + 4, slotW, h - 8, Math.min(2, slotW / 3));
      context.fillStyle = populated ? COLOURS.stripFill : COLOURS.recess;
      context.fill();
      context.strokeStyle = populated ? COLOURS.stripEdge : COLOURS.stripEmptyEdge;
      context.lineWidth = populated ? 1.5 : 1;
      context.setLineDash(populated ? [] : [3, 2]);
      context.stroke();
      context.setLineDash([]);

      if (populated) {
        // The notch is the non-colour cue: an occupied slot has a tab, an empty
        // one has nothing.
        roundedRect(context, x, topLeft.y + 4, slotW, notchH, Math.min(1.5, slotW / 4));
        context.fillStyle = COLOURS.stripEdge;
        context.fill();
      }
    }
  }

  /**
   * The part's name, on a chip of its own when the block is too cramped to keep
   * the traffic away from it. The name wins: an unidentifiable block is
   * decoration. Which is also why the token layer puts it back on top.
   */
  private drawBlockName(
    context: CanvasRenderingContext2D,
    part: BoardPart,
    topLeft: ScreenPoint,
    w: number,
    h: number,
    simulated: boolean,
  ): void {
    const metrics = blockMetrics(w, h, simulated);
    const nameSize = w >= 70 && h >= 56 ? 13 : 11;
    const nameY = metrics.nameAtTop ? topLeft.y + 13 : topLeft.y + h / 2;

    context.font = `600 ${nameSize}px ${FONT_SANS}`;
    const nameWidth = context.measureText(part.short).width;
    if (nameWidth > w - 10)
      return;

    if (!metrics.nameAtTop) {
      roundedRect(context, topLeft.x + w / 2 - nameWidth / 2 - 4, nameY - 8, nameWidth + 8, 16, 4);
      context.fillStyle = COLOURS.nameChip;
      context.fill();
    }

    context.fillStyle = simulated ? COLOURS.text : COLOURS.muted;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(part.short, topLeft.x + w / 2, nameY);
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
  }

  private drawBottleneckTag(context: CanvasRenderingContext2D, centreX: number, y: number): void {
    const label = 'BOTTLENECK';
    context.font = `700 10px ${FONT_SANS}`;
    const width = context.measureText(label).width + 12;

    context.fillStyle = COLOURS.saturated;
    context.fillRect(centreX - width / 2, y, width, 16);
    context.fillStyle = COLOURS.text;
    context.textAlign = 'center';
    context.fillText(label, centreX, y + 11.5);
    context.textAlign = 'left';
  }

  private drawTokens(context: CanvasRenderingContext2D, data: BoardData, simulatedNs: number): void {
    for (const part of data.layout.parts) {
      if (part.levelId === null)
        continue;
      const tokens = tokensAt(data.result.spans, part.levelId, simulatedNs);
      if (tokens.length === 0)
        continue;

      // A level that owns a trace animates on the trace; every other level
      // animates inside its own block, which is where a cache level actually
      // lives. A trace that is hidden falls back to the block rather than
      // dropping the requests on the floor.
      const link = data.layout.links.find(candidate => candidate.levelId === part.levelId);
      const segment = link === undefined ? null : linkSegment(data.layout, data.explode, link);
      if (segment !== null) {
        this.drawTraceTokens(context, segment, tokens);
        continue;
      }

      // Inside its own block, the traffic goes under the name: the name is what
      // makes the block recognisable, so it is drawn last.
      const rect = partRect(part, data.explode);
      this.drawBlockTokens(context, rect, tokens);
      this.drawBlockName(
        context,
        part,
        this.toScreen(rect),
        rect.wMm * this.scale,
        rect.hMm * this.scale,
        true,
      );
    }
  }

  private drawTraceTokens(
    context: CanvasRenderingContext2D,
    segment: BoardSegment,
    tokens: readonly FlowToken[],
  ): void {
    const from = this.toScreen(segment.from);
    const to = this.toScreen(segment.to);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0))
      return;

    const nx = -dy / length;
    const ny = dx / length;

    for (const token of tokens) {
      const lane = token.requestIndex % LINK_LANES;
      const offset = (lane - (LINK_LANES - 1) / 2) * BLOCK_STRIDE;
      // Only the channel's own phases reach a trace: a transfer moves along it,
      // and the DRAM wait parks at the DIMM end. Fills happen at the cache
      // levels, so they travel inside their own blocks and never out here.
      const at = traceProgress(token);
      const x = from.x + dx * at + nx * offset;
      const y = from.y + dy * at + ny * offset;
      drawGlyph(context, token.kind, x - GLYPH_SIZE / 2, y - GLYPH_SIZE / 2, GLYPH_SIZE);
    }
  }

  private drawBlockTokens(
    context: CanvasRenderingContext2D,
    rect: BoardRect,
    tokens: readonly FlowToken[],
  ): void {
    const topLeft = this.toScreen(rect);
    const w = rect.wMm * this.scale;
    const h = rect.hMm * this.scale;
    const metrics = blockMetrics(w, h, true);
    const centre = topLeft.x + w / 2;
    const lanes = Math.max(1, Math.min(BLOCK_LANES_MAX, Math.floor(w / BLOCK_STRIDE)));

    for (const token of tokens) {
      const lane = token.requestIndex % lanes;
      const offset = (lane - (lanes - 1) / 2) * BLOCK_STRIDE;
      // A fill comes back up, so a request reads as one round trip.
      const progress = roundTripProgress(token);
      const x = centre + offset;
      const y = topLeft.y + metrics.travelStart + progress * metrics.travelLength;
      drawGlyph(context, token.kind, x - GLYPH_SIZE / 2, y - GLYPH_SIZE / 2, GLYPH_SIZE);
    }
  }
}
