import type { BoardData } from './board-data';
import type { HudData } from './hud';

import type { BoardPart, PartKind } from '@/board';

import type { SimSpan } from '@/sim';

import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  RepeatWrapping,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { partRect, roundTripProgress, solidAt, tokensAt, traceProgress } from '@/board';
import { describePart } from './describe';
import { clamp01 } from './format';
import { drawHudFooter, drawHudHeader, HUD_FOOTER_H } from './hud';
import { COLOURS, FONT_SANS, utilisationColour, utilisationHatch } from './palette';

/**
 * World units are millimetres, so the numbers in `src/board/` carry over
 * unchanged: board X maps to world X, board Y to world Z, and thickness is world
 * Y. One millimetre unit box is scaled per part, which keeps every solid on a
 * single geometry.
 */
const UNIT_BOX = new BoxGeometry(1, 1, 1);
const BOARD_THICKNESS_MM = 6;
const TOKEN_SIZE_MM = 5;
const LABEL_WIDTH_MM = 46;
const TAG_LIFT_MM = 18;
/** An unoccupied DIMM slot is a bare socket: the cue is height, not shade. */
const SOCKET_HEIGHT_MM = 2;
/** Below this, two parts are effectively on top of each other and a trace is noise. */
const MIN_TRACE_MM = 14;

const TOKEN_KINDS: readonly SimSpan['kind'][] = ['level', 'transfer', 'dram', 'fill'];
const LANES = 3;
const LANE_SPREAD_MM = 6;

/**
 * The opening camera: far enough back, and high enough, to hold the whole board
 * plus the height the parts gain when the view is exploded. Aimed at the middle
 * of the board rather than the top of it, so the parts stay centred.
 */
const CAMERA_X = 152;
const CAMERA_Y = 460;
const CAMERA_Z = 700;
const TARGET_Y = 40;
const CAMERA_Z_AIM = 122;

interface StickView {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
}

/**
 * A detail that makes a part recognisable, sized and placed as a fraction of the
 * part's own box — so it follows the rectangle as the view explodes, without a
 * single hard-coded millimetre.
 */
interface Accent {
  readonly mesh: Mesh;
  /** Size as a fraction of the part's width, height and depth. */
  readonly fx: number;
  readonly fy: number;
  readonly fz: number;
  /** Centre, as a fraction of the same box. */
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
}

/** What each kind of part has bolted to it, and nothing else does. */
const ACCENTS: Partial<Record<PartKind, readonly Omit<Accent, 'mesh'>[]>> = {
  // A socket frame the package sits inside.
  cpu: [{ fx: 1.18, fy: 0.12, fz: 1.18, ox: 0, oy: 0.06, oz: 0 }],
  // A heatsink on the chipset.
  chipset: [{ fx: 0.72, fy: 0.5, fz: 0.72, ox: 0, oy: 1.2, oz: 0 }],
  // A card: an I/O bracket at one end, and a cooler block along the top.
  gpu: [
    { fx: 0.05, fy: 1.08, fz: 1.08, ox: -0.5, oy: 0.5, oz: 0 },
    { fx: 0.85, fy: 0.45, fz: 0.82, ox: 0.03, oy: 1.15, oz: 0 },
  ],
  // A stick: the screw tab at the far end.
  slot: [{ fx: 0.04, fy: 1.5, fz: 0.9, ox: 0.42, oy: 0.75, oz: 0 }],
};

interface PartView {
  readonly group: Group;
  /**
   * The solid that carries the part's utilisation colour and hatch. Every part
   * has one, including a DIMM bank, whose substrate is the socket strip the
   * sticks stand in.
   */
  readonly body: Mesh;
  readonly material: MeshStandardMaterial;
  /** Empty for a part that is not drawn as a row of slots. */
  readonly sticks: StickView[];
  readonly accents: Accent[];
  readonly label: Sprite;
}

function textureFromCanvas(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * `roundRect` is recent enough that its absence would throw during startup, so the
 * corner is drawn by hand — the same way the flat view does it.
 */
function roundedRectPath(
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

/**
 * A hatch density per utilisation band — the same three bands the flat view's
 * bars use, so "how busy" reads the same way in both. It is a pattern rather
 * than a darker shade, because colour must never be the only cue.
 */
function hatchTexture(spacing: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.fillStyle = '#66707e';
    context.fillRect(0, 0, 64, 64);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    for (let offset = -64; offset < 128; offset += spacing) {
      context.beginPath();
      context.moveTo(offset, 64);
      context.lineTo(offset + 64, 0);
      context.stroke();
    }
  }

  const texture = textureFromCanvas(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

/** A name on a chip, so it stays readable over whatever is behind it. */
function labelTexture(text: string, bold: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.fillStyle = 'rgba(13, 17, 23, 0.82)';
    roundedRectPath(context, 4, 24, 504, 80, 18);
    context.fill();
    context.strokeStyle = 'rgba(150, 163, 178, 0.5)';
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = '#e8eef5';
    context.font = `${bold ? '700' : '600'} 54px ${FONT_SANS}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 66);
  }
  return textureFromCanvas(canvas);
}

/** A floating label that ignores depth, so a name is never swallowed by a solid. */
function labelSprite(text: string, bold: boolean): Sprite {
  const material = new SpriteMaterial({
    depthTest: false,
    depthWrite: false,
    map: labelTexture(text, bold),
    transparent: true,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(LABEL_WIDTH_MM, LABEL_WIDTH_MM / 4, 1);
  sprite.renderOrder = 30;
  return sprite;
}

/**
 * One shape per traffic phase, matching the glyph legend: a box for a request
 * resident at a level, a cone for a transfer, an octahedron for a DRAM wait and
 * an open box for a line on its way back.
 */
function tokenGeometry(kind: SimSpan['kind']): BoxGeometry | ConeGeometry | OctahedronGeometry {
  if (kind === 'transfer')
    return new ConeGeometry(TOKEN_SIZE_MM * 0.6, TOKEN_SIZE_MM * 1.6, 3);
  if (kind === 'dram')
    return new OctahedronGeometry(TOKEN_SIZE_MM * 0.7);
  return new BoxGeometry(TOKEN_SIZE_MM, TOKEN_SIZE_MM, TOKEN_SIZE_MM);
}

/**
 * The machine as an object: the same layout, the same traces and the same
 * simulated time as the flat view, drawn with depth so a part can be looked at
 * from an angle that makes its shape say what it is.
 *
 * The camera is the point of this view — orbit, pan and zoom — and the parts
 * rise off the board as the view explodes.
 */
export class BoardModel {
  private readonly canvas: HTMLCanvasElement;
  private readonly hud: HTMLCanvasElement;
  private readonly available: boolean;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer | null;
  private readonly controls: OrbitControls | null = null;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly pickTargets = new Map<Mesh, string>();
  private readonly parts = new Group();
  private readonly traces = new Group();
  private readonly marks = new Group();
  private readonly labels = new Group();
  private readonly pools = new Map<SimSpan['kind'], Mesh[]>();
  private readonly used = new Map<SimSpan['kind'], number>();
  private readonly hatch = new Map<number, CanvasTexture>();
  private readonly views: PartView[] = [];
  private readonly traceLines: Line[] = [];
  /** Where each trace currently runs, or null when it is buried. */
  private readonly traceEnds: ({ readonly from: Vector3; readonly to: Vector3 } | null)[] = [];

  private tag: Sprite | null = null;
  private data: BoardData | null = null;
  private hoveredId: string | null = null;
  private built = false;
  private width = 0;
  private height = 0;
  private pixelRatio = 0;

  constructor(canvas: HTMLCanvasElement, hud: HTMLCanvasElement) {
    this.canvas = canvas;
    this.hud = hud;
    this.camera = new PerspectiveCamera(42, 1, 1, 6000);

    let renderer: WebGLRenderer | null = null;
    try {
      renderer = new WebGLRenderer({ antialias: true, canvas });
    }
    catch {
      renderer = null;
    }
    this.renderer = renderer;
    this.available = renderer !== null;

    if (renderer !== null) {
      renderer.outputColorSpace = SRGBColorSpace;
      this.scene.background = new Color(COLOURS.background);
      // A dim fill and a strong key: with the fill too bright, a contact shadow
      // has nothing to darken and the parts read as pasted on.
      this.scene.add(new HemisphereLight(0x9FB4CC, 0x1B2330, 0.85));

      // Contact shadows are what stop a part reading as if it were hovering over
      // the board, which a dark plate and no shadow do very convincingly.
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFShadowMap;

      const sun = new DirectionalLight(0xFFFFFF, 3.2);
      // Up, in front and to the left, so every part throws its shadow to the
      // right and back — where the camera can see it. A light straight overhead
      // hides each shadow behind its own part, which reads as no shadow at all.
      sun.position.set(20, 400, 420);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.6;
      // Aimed at the middle of the board, so the shadow frustum stays tight.
      sun.target.position.set(CAMERA_X, 0, CAMERA_Z_AIM);
      sun.shadow.camera.left = -190;
      sun.shadow.camera.right = 190;
      sun.shadow.camera.top = 190;
      sun.shadow.camera.bottom = -190;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 1400;
      sun.shadow.camera.updateProjectionMatrix();
      this.scene.add(sun, sun.target);

      this.scene.add(this.parts, this.traces, this.marks, this.labels);
      this.camera.position.set(CAMERA_X, CAMERA_Y, CAMERA_Z);

      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.minDistance = 90;
      this.controls.maxDistance = 1600;
      // Keeps the camera above the board, where the parts are still readable.
      this.controls.maxPolarAngle = Math.PI * 0.49;
      this.controls.target.set(CAMERA_X, TARGET_Y, CAMERA_Z_AIM);
      this.controls.update();
    }

    canvas.addEventListener('pointerleave', this.clearHover);
    canvas.addEventListener('pointermove', this.trackHover);
  }

  setData(data: BoardData): void {
    this.data = data;
    if (this.available && !this.built)
      this.build(data);
  }

  render(simulatedNs: number, nsPerSecond: number): void {
    this.resize();
    const data = this.data;
    if (this.available && this.renderer !== null && data !== null) {
      this.place(data);
      this.drawTokens(data, simulatedNs);
      this.controls?.update();
      this.renderer.render(this.scene, this.camera);
    }
    this.drawHud(data, simulatedNs, nsPerSecond);
  }

  /** Back to the framing the view opens with, for when the camera gets lost. */
  resetCamera(): void {
    this.camera.position.set(CAMERA_X, CAMERA_Y, CAMERA_Z);
    this.controls?.target.set(CAMERA_X, TARGET_Y, CAMERA_Z_AIM);
    this.controls?.update();
  }

  private readonly clearHover = (): void => {
    this.hoveredId = null;
  };

  private readonly trackHover = (event: PointerEvent): void => {
    if (!this.available || this.data === null)
      return;

    const bounds = this.canvas.getBoundingClientRect();
    if (!(bounds.width > 0) || !(bounds.height > 0))
      return;

    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.pickTargets.keys()], false)[0];
    const object = hit?.object;
    const picked = object instanceof Mesh ? this.pickTargets.get(object) : undefined;
    this.hoveredId = picked ?? null;
  };

  private resize(): void {
    const width = this.canvas.clientWidth || 900;
    const height = this.canvas.clientHeight || 640;
    const dpr = globalThis.devicePixelRatio || 1;
    // The pixel ratio is checked, not assumed: dragging the window to a screen
    // with a different scale would otherwise leave the buffers at the old ratio
    // while the HUD drew at the new one.
    if (width === this.width && height === this.height && dpr === this.pixelRatio)
      return;
    this.width = width;
    this.height = height;
    this.pixelRatio = dpr;

    if (this.renderer !== null) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      // Framed as if the canvas were taller, so the board does not sit behind
      // the HUD footer.
      this.camera.setViewOffset(width, height + HUD_FOOTER_H, 0, 0, width, height);
      this.camera.updateProjectionMatrix();
    }

    this.hud.width = Math.round(width * dpr);
    this.hud.height = Math.round(height * dpr);
  }

  private build(data: BoardData): void {
    this.built = true;
    for (const spacing of [3, 6, 12])
      this.hatch.set(spacing, hatchTexture(spacing));

    const plate = new Mesh(
      UNIT_BOX,
      new MeshStandardMaterial({ color: COLOURS.plate, roughness: 0.95 }),
    );
    plate.receiveShadow = true;
    plate.scale.set(data.layout.widthMm, BOARD_THICKNESS_MM, data.layout.heightMm);
    plate.position.set(data.layout.widthMm / 2, -BOARD_THICKNESS_MM / 2, data.layout.heightMm / 2);
    this.parts.add(plate);

    for (const part of data.layout.parts)
      this.views.push(this.buildPart(part));

    for (const link of data.layout.links) {
      const line = new Line(
        new BufferGeometry(),
        new LineBasicMaterial({ color: link.levelId === null ? COLOURS.bandEdge : COLOURS.packet }),
      );
      this.traces.add(line);
      this.traceLines.push(line);
    }

    this.tag = labelSprite('BOTTLENECK', true);
    this.tag.visible = false;
    this.labels.add(this.tag);
  }

  private buildPart(part: BoardPart): PartView {
    const group = new Group();

    // Every part gets a body, including a DIMM bank: the substrate is what
    // carries the utilisation colour, the hatch, the bottleneck tint and the
    // hover highlight, so none of those clues go missing on the part most likely
    // to be the bottleneck. The sticks are built on demand, because how many
    // slots a rig populates changes with the rig.
    const material = new MeshStandardMaterial({ color: COLOURS.partFill, roughness: 0.65 });
    const body = new Mesh(UNIT_BOX, material);
    body.castShadow = true;
    this.pickTargets.set(body, part.id);
    group.add(body);

    // The details that make a kind of part recognisable at a glance.
    const accents: Accent[] = [];
    for (const spec of ACCENTS[part.kind] ?? []) {
      const mesh = new Mesh(
        UNIT_BOX,
        new MeshStandardMaterial({ color: COLOURS.partEdge, roughness: 0.7 }),
      );
      mesh.castShadow = true;
      group.add(mesh);
      accents.push({ ...spec, mesh });
    }

    const label = labelSprite(part.short, false);
    this.labels.add(label);

    this.parts.add(group);
    return { accents, body, group, label, material, sticks: [] };
  }

  /** Grows or shrinks the stick set to match the slots the current rig reports. */
  private syncSticks(view: PartView, part: BoardPart): void {
    const wanted = part.strips?.count ?? 0;

    while (view.sticks.length > wanted) {
      const removed = view.sticks.pop();
      if (removed === undefined)
        break;
      this.pickTargets.delete(removed.mesh);
      view.group.remove(removed.mesh);
    }

    while (view.sticks.length < wanted) {
      const stickMaterial = new MeshStandardMaterial({ color: COLOURS.stripFill, roughness: 0.8 });
      const mesh = new Mesh(UNIT_BOX, stickMaterial);
      mesh.castShadow = true;
      this.pickTargets.set(mesh, part.id);
      view.group.add(mesh);
      view.sticks.push({ material: stickMaterial, mesh });
    }
  }

  private place(data: BoardData): void {
    const explode = clamp01(data.explode);
    if (this.tag !== null)
      this.tag.visible = false;

    data.layout.parts.forEach((part, index) => {
      const view = this.views[index];
      if (view === undefined)
        return;

      const rect = partRect(part, explode);
      const place = solidAt(part, explode);
      const centreX = rect.xMm + rect.wMm / 2;
      const centreZ = rect.yMm + rect.hMm / 2;

      view.group.position.set(centreX, place.bottomMm, centreZ);

      for (const accent of view.accents) {
        accent.mesh.scale.set(
          rect.wMm * accent.fx,
          place.heightMm * accent.fy,
          rect.hMm * accent.fz,
        );
        accent.mesh.position.set(
          rect.wMm * accent.ox,
          place.heightMm * accent.oy,
          rect.hMm * accent.oz,
        );
      }

      if (part.strips === undefined) {
        view.body.scale.set(rect.wMm, place.heightMm, rect.hMm);
        view.body.position.set(0, place.heightMm / 2, 0);
      }
      else {
        // A DIMM bank draws a thin socket strip, with the sticks seated on top of
        // it. A full-height body would swallow the very sticks it exists to hold.
        this.syncSticks(view, part);
        view.body.scale.set(rect.wMm, SOCKET_HEIGHT_MM, rect.hMm);
        view.body.position.set(0, SOCKET_HEIGHT_MM / 2, 0);

        const count = view.sticks.length;
        const occupied = part.strips.occupied;
        if (count > 0) {
          const gap = Math.max(1, rect.wMm * 0.03);
          const slotW = (rect.wMm - gap * (count - 1)) / count;
          const stickH = Math.max(1, place.heightMm - SOCKET_HEIGHT_MM);
          view.sticks.forEach((stick, slot) => {
            // Occupancy is read from the current layout every frame, and it shows
            // as a stick being there at all: presence, not a shade.
            const populated = slot < occupied;
            stick.mesh.visible = populated;
            stick.mesh.scale.set(slotW, stickH, rect.hMm);
            stick.mesh.position.set(
              -rect.wMm / 2 + slot * (slotW + gap) + slotW / 2,
              SOCKET_HEIGHT_MM + stickH / 2,
              0,
            );
          });
        }
      }

      const level = data.result.resources.find(resource => resource.id === part.levelId);
      const isBottleneck = part.levelId !== null && data.result.bottleneckId === part.levelId;
      const material = view.material;
      // A part the simulation does not model stays neutral: painting it with the
      // idle colour would claim a number it does not have. It still needs to be
      // lighter than the board, or it reads as a hole.
      if (level === undefined) {
        material.color.set(COLOURS.contextEdge);
        material.map = null;
      }
      else {
        material.color.set(isBottleneck ? COLOURS.saturated : utilisationColour(level.utilisation));
        // The hatch is the second cue for "how busy": colour alone says nothing.
        // A simulated part always carries one — the light band at zero, so an
        // idle simulated part never looks like a part that has no numbers.
        material.map = this.hatch.get(utilisationHatch(level.utilisation) || 12) ?? null;
      }
      material.emissive.set(this.hoveredId === part.id ? COLOURS.packet : '#000000');
      material.emissiveIntensity = this.hoveredId === part.id ? 0.5 : 0;

      view.label.position.set(centreX, place.topMm + 9, centreZ);

      if (this.tag !== null && isBottleneck) {
        this.tag.visible = true;
        this.tag.position.set(centreX, place.topMm + TAG_LIFT_MM, centreZ);
      }
    });

    data.layout.links.forEach((link, index) => {
      const line = this.traceLines[index];
      if (line === undefined)
        return;

      // A trace connects the two parts wherever they currently are, so pulling the
      // view apart shows what is wired to what — the whole point of an exploded
      // diagram. The gate is three-dimensional: a trace is worth drawing only when
      // its two ends are far enough apart to see, which is a different question
      // from whether it is buried inside a package on the flat board.
      const from = this.partAnchor(data, link.from, explode);
      const to = this.partAnchor(data, link.to, explode);
      const ends = from !== null && to !== null && from.distanceTo(to) > MIN_TRACE_MM
        ? { from, to }
        : null;
      this.traceEnds[index] = ends;
      line.visible = ends !== null;
      if (ends !== null)
        line.geometry.setFromPoints([ends.from, ends.to]);
    });
  }

  /** The point a trace attaches to: the top of a part, just clear of its surface. */
  private partAnchor(data: BoardData, id: string, explode: number): Vector3 | null {
    const part = data.layout.parts.find(candidate => candidate.id === id);
    if (part === undefined)
      return null;

    const rect = partRect(part, explode);
    return new Vector3(
      rect.xMm + rect.wMm / 2,
      solidAt(part, explode).topMm + 2,
      rect.yMm + rect.hMm / 2,
    );
  }

  private drawTokens(data: BoardData, simulatedNs: number): void {
    for (const kind of TOKEN_KINDS)
      this.used.set(kind, 0);

    for (const part of data.layout.parts) {
      if (part.levelId === null)
        continue;

      const tokens = tokensAt(data.result.spans, part.levelId, simulatedNs);
      if (tokens.length === 0)
        continue;

      const linkIndex = data.layout.links.findIndex(candidate => candidate.levelId === part.levelId);
      const ends = linkIndex < 0 ? null : this.traceEnds[linkIndex] ?? null;
      const rect = partRect(part, data.explode);
      const top = solidAt(part, data.explode).topMm;

      for (const token of tokens) {
        const lane = ((token.requestIndex % LANES) - (LANES - 1) / 2) * LANE_SPREAD_MM;

        let x: number;
        let y: number;
        let z: number;
        if (ends !== null) {
          // Riding the trace, wherever the trace currently runs.
          const at = traceProgress(token);
          x = ends.from.x + (ends.to.x - ends.from.x) * at;
          y = ends.from.y + (ends.to.y - ends.from.y) * at;
          z = ends.from.z + (ends.to.z - ends.from.z) * at + lane;
        }
        else {
          // Inside its own block: over its middle, travelling its depth. A fill
          // comes back up, so a request reads as one round trip.
          const at = roundTripProgress(token);
          x = rect.xMm + rect.wMm / 2 + lane;
          z = rect.yMm + rect.hMm * (0.15 + 0.7 * at);
          y = top + 7;
        }

        this.take(token.kind).position.set(x, y, z);
      }
    }

    for (const kind of TOKEN_KINDS) {
      const pool = this.pools.get(kind) ?? [];
      const used = this.used.get(kind) ?? 0;
      for (let index = used; index < pool.length; index++)
        pool[index].visible = false;
    }
  }

  private take(kind: SimSpan['kind']): Mesh {
    let pool = this.pools.get(kind);
    if (pool === undefined) {
      pool = [];
      this.pools.set(kind, pool);
    }

    const index = this.used.get(kind) ?? 0;
    this.used.set(kind, index + 1);

    const existing = pool[index];
    if (existing !== undefined) {
      existing.visible = true;
      return existing;
    }

    const mesh = new Mesh(
      tokenGeometry(kind),
      kind === 'fill'
        ? new MeshStandardMaterial({ color: COLOURS.fillOutline, wireframe: true })
        : new MeshStandardMaterial({
            color: kind === 'dram' ? COLOURS.wait : COLOURS.packet,
            roughness: 0.4,
          }),
    );
    pool.push(mesh);
    this.marks.add(mesh);
    return mesh;
  }

  private drawHud(data: BoardData | null, simulatedNs: number, nsPerSecond: number): void {
    const context = this.hud.getContext('2d');
    if (context === null)
      return;

    const dpr = globalThis.devicePixelRatio || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, this.width, this.height);

    if (!this.available) {
      context.fillStyle = COLOURS.muted;
      context.font = `13px ${FONT_SANS}`;
      context.textAlign = 'center';
      context.fillText('This browser has no WebGL, so the 3D model cannot be drawn.', this.width / 2, this.height / 2 - 12);
      context.fillText('Switch View to Board for the flat version.', this.width / 2, this.height / 2 + 12);
      context.textAlign = 'left';
      return;
    }

    if (data === null)
      return;

    const hud: HudData = {
      classification: data.result.classification,
      detail: this.describe(data),
      explode: data.explode,
      nsPerSecond,
      simulatedNs,
      subtitle: data.subtitle,
      title: data.title,
      windowNs: data.windowNs,
    };
    drawHudHeader(context, this.width, hud);
    drawHudFooter(context, this.width, this.height, hud);
  }

  private describe(data: BoardData): string | null {
    if (this.hoveredId === null)
      return null;

    const part = data.layout.parts.find(candidate => candidate.id === this.hoveredId);
    return part === undefined ? null : describePart(part, data.result.resources);
  }
}
