import type { BoardData } from '@/render';

import type { SimResult } from '@/sim';
import type { PanelState } from '@/ui';
import type { WorkloadKind, WorkloadSpec } from '@/workloads';
import { boardLayout } from '@/board';
import { completeBuild, emptyBuild, missingParts, partDefinitions, validateConfiguration } from '@/data';
import { BoardModel, BoardView, fitNsPerSecond, formatCount, simulatedNsAt, windowOf } from '@/render';
import { buildSheet } from '@/sheet';
import { simulate } from '@/sim';
import { ControlPanel, mountWindows, SheetView } from '@/ui';
import { generateAccesses, mixedSpec, randomSpec, streamingSpec } from '@/workloads';
import '@pierre/winkit/styles.css';
import './styles.css';

/** Large enough for steady-state numbers; only a slice is traced for the view. */
const ACCESS_COUNT = 200_000;
const TRACE_REQUESTS = 500;

/** The page is ours, so a missing element is a wiring mistake, not a user state. */
function required<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null)
    throw new Error(`the page is missing ${selector}`);
  return found;
}

const boardCanvas = required<HTMLCanvasElement>('#board');
const modelCanvas = required<HTMLCanvasElement>('#model3d');
const modelHudCanvas = required<HTMLCanvasElement>('#modelHud');
const modelRoot = required<HTMLElement>('#model');
const sheetRoot = required<HTMLElement>('#sheet');
const uiRoot = required<HTMLElement>('#ui');
const introBlock = required<HTMLElement>('#intro');

function workloadSpec(kind: WorkloadKind): WorkloadSpec {
  const base = { accessCount: ACCESS_COUNT };
  if (kind === 'random')
    return randomSpec(base);
  if (kind === 'mixed')
    return mixedSpec(base);
  return streamingSpec(base);
}

const boardModel = new BoardModel(modelCanvas, modelHudCanvas);
const boardView = new BoardView(boardCanvas);
let panel: ControlPanel | null = null;
let sheet: SheetView | null = null;
let buildDock: HTMLElement | null = null;

// A build starts empty, so the sheet is the face that opens: it says what to add,
// where the picture would have nothing to draw.
let state: PanelState = {
  build: emptyBuild(),
  characteristic: 'clockHz',
  explode: 0,
  nsPerSecond: 40,
  origin: {},
  part: 'cpu',
  playing: true,
  view: 'sheet',
  visualKind: 'model',
  workloadKind: 'streaming',
};

let windowNs = 0;
let playedMs = 0;
let lastFrameMs = performance.now();
/**
 * Set when the reader picks a different machine or workload. A new rig has a
 * different time scale — a dependent chase runs about a hundred times longer
 * than a stream — so the playback speed is refitted. It is decided where the
 * event is known and applied in `rebuild`, because the window a fit needs only
 * exists after a run. Editing a characteristic must not re-fit.
 */
let refitPlayback = true;
let pendingRebuild: number | undefined;
let boardData: BoardData | null = null;

/** Milliseconds to wait after the last slider input before re-simulating. */
const REBUILD_DEBOUNCE_MS = 160;

/** Only the active face is on screen, and only its picture is drawn. */
function applyViewMode(): void {
  const sheetUp = state.view === 'sheet';

  sheetRoot.hidden = !sheetUp;
  uiRoot.hidden = sheetUp;
  modelRoot.hidden = sheetUp || state.visualKind !== 'model';
  boardCanvas.hidden = sheetUp || state.visualKind !== 'board';

  // One set of build controls, relocated rather than duplicated: they follow the
  // reader to the sheet, and wait in the Controls window when the picture is up.
  if (panel !== null) {
    const host = sheetUp && sheet !== null ? sheet.sidebar : buildDock;
    host?.append(panel.buildControlsElement);
  }
}

/**
 * The board views take the explode position per frame rather than rebuilding, so
 * dragging the slider is instant and never re-runs the simulation.
 */
function publishBoard(): void {
  if (boardData === null)
    return;
  const data = { ...boardData, explode: state.explode };
  boardModel.setData(data);
  boardView.setData(data);
}

/** What the picture calls this run: the workload and how many parts it has. */
function buildLabel(): string {
  const total = partDefinitions().length;
  const present = total - missingParts(state.build).length;
  return `${state.workloadKind} · ${present} of ${total} parts`;
}

function rebuild(): void {
  if (pendingRebuild !== undefined) {
    clearTimeout(pendingRebuild);
    pendingRebuild = undefined;
  }

  const config = completeBuild(state.build);
  let result: SimResult | null = null;
  if (config !== null) {
    result = simulate(config, generateAccesses(workloadSpec(state.workloadKind)), {
      traceRequests: TRACE_REQUESTS,
    });
  }

  const title = buildLabel();
  const subtitle = `${title} · ${formatCount(ACCESS_COUNT)} accesses, first ${TRACE_REQUESTS} traced`;

  // A build missing a part has no run and so no picture; the sheet names what is
  // missing rather than the view drawing a machine nobody assembled.
  if (config === null || result === null) {
    windowNs = 0;
    boardData = null;
  }
  else {
    windowNs = windowOf(result.spans);
    boardData = {
      explode: state.explode,
      layout: boardLayout(config),
      result,
      subtitle,
      title,
      windowNs,
    };
    publishBoard();
  }

  // A new workload, or a part appearing, has a different time scale — a dependent
  // chase runs about a hundred times longer than a stream — so refit the playback
  // speed rather than crawl or blur.
  if (refitPlayback) {
    refitPlayback = false;
    if (windowNs > 0)
      state = { ...state, nsPerSecond: fitNsPerSecond(windowNs) };
  }

  panel?.update(state, result, config === null ? [] : validateConfiguration(config));
  sheet?.update(buildSheet({
    build: state.build,
    origin: state.origin,
    result,
    workload: state.workloadKind,
  }));
  playedMs = 0;
  lastFrameMs = performance.now();
}

/**
 * A full run over 200,000 accesses takes about half a second, which is far too
 * slow to do on every slider input event. The readouts update instantly and the
 * simulation catches up once the user pauses.
 */
function scheduleRebuild(): void {
  if (pendingRebuild !== undefined)
    clearTimeout(pendingRebuild);
  pendingRebuild = globalThis.setTimeout(rebuild, REBUILD_DEBOUNCE_MS);
}

function onChange(patch: Partial<PanelState>): void {
  const previous = state;
  state = { ...state, ...patch };

  if (patch.nsPerSecond !== undefined && previous.nsPerSecond !== state.nsPerSecond) {
    // Hold the animation where it is instead of jumping when the speed changes.
    const currentNs = simulatedNsAt(playedMs, previous.nsPerSecond);
    playedMs = (currentNs / state.nsPerSecond) * 1000;
  }

  // Cheap DOM mirrors first: a pause or a speed change must be reflected even
  // when nothing needs re-simulating.
  panel?.syncState(state);

  // None of these touches the simulation, so the picture just updates.
  if (patch.view !== undefined || patch.visualKind !== undefined || patch.explode !== undefined) {
    applyViewMode();
    publishBoard();
  }

  // Choosing a component or a characteristic moves no number.
  if (patch.part !== undefined || patch.characteristic !== undefined)
    return;

  // A part appearing changes how long the run takes, so it re-fits at once.
  const partAdded = patch.build !== undefined
    && missingParts(previous.build).length !== missingParts(state.build).length;

  // A new workload has a different time scale, so it re-fits at once too.
  if (patch.workloadKind !== undefined || partAdded) {
    refitPlayback = true;
    rebuild();
    return;
  }

  // An edited characteristic re-runs, but only once the reader stops dragging.
  if (patch.build !== undefined)
    scheduleRebuild();
}

function tick(now: number): void {
  // Clamp the frame delta so a backgrounded tab does not fast-forward.
  const delta = Math.min(250, now - lastFrameMs);
  lastFrameMs = now;
  if (state.playing)
    playedMs += delta;

  let simulatedNs = windowNs > 0 ? simulatedNsAt(playedMs, state.nsPerSecond) : 0;
  if (windowNs > 0 && simulatedNs > windowNs) {
    playedMs = 0;
    simulatedNs = 0;
  }

  if (state.view === 'visual' && boardData !== null) {
    if (state.visualKind === 'model')
      boardModel.render(simulatedNs, state.nsPerSecond);
    else
      boardView.render(simulatedNs, state.nsPerSecond);
  }
  requestAnimationFrame(tick);
}

panel = new ControlPanel({
  onChange,
  onResetView: () => boardModel.resetCamera(),
  onRestart: () => {
    playedMs = 0;
    lastFrameMs = performance.now();
  },
});

// The app title and lede travel with the build controls rather than sitting over
// the canvas, where they would collide with the HUD header.
panel.buildControlsElement.prepend(introBlock);
mountWindows(uiRoot, panel.pictureControlsElement, panel.readoutsElement);

buildDock = required<HTMLElement>('#controls-dock');
sheet = new SheetView(sheetRoot);

applyViewMode();
rebuild();
requestAnimationFrame(tick);
