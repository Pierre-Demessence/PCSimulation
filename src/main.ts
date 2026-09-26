import type { BoardData, PipelineData } from '@/render';

import type { HardwareConfig, MemorySpec } from '@/sim';
import type { PanelState } from '@/ui';
import type { WorkloadKind, WorkloadSpec } from '@/workloads';
import { boardLayout } from '@/board';
import { findPreset, memorySpec, RIG_PRESETS, validateConfiguration } from '@/data';
import { BoardModel, BoardView, fitNsPerSecond, formatCount, PipelineView, simulatedNsAt } from '@/render';
import { simulate } from '@/sim';
import { ControlPanel } from '@/ui';
import { generateAccesses, mixedSpec, randomSpec, streamingSpec } from '@/workloads';
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
const pipelineCanvas = required<HTMLCanvasElement>('#pipeline');
const panelRoot = required<HTMLElement>('#panel');

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
const view = new PipelineView(pipelineCanvas);
let panel: ControlPanel | null = null;

let state: PanelState = {
  explode: 1,
  isolating: { casLatency: 16, mtPerSecond: 3200 },
  nsPerSecond: 40,
  playing: true,
  presetId: 'rig-2019',
  view: 'model',
  workloadKind: 'streaming',
};

let windowNs = 0;
let playedMs = 0;
let lastFrameMs = performance.now();
let fitKey = '';
let pendingRebuild: number | undefined;
let boardData: BoardData | null = null;

/** Milliseconds to wait after the last slider input before re-simulating. */
const REBUILD_DEBOUNCE_MS = 160;

/** Only the active view is on screen; each keeps its own canvas. */
function applyViewMode(): void {
  modelRoot.hidden = state.view !== 'model';
  boardCanvas.hidden = state.view !== 'board';
  pipelineCanvas.hidden = state.view !== 'flow';
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

/** The DIMM after the sliders have had their say; the rest of the rig is fixed. */
function currentMemory(): MemorySpec | null {
  const preset = findPreset(state.presetId);
  if (preset === undefined)
    return null;
  return memorySpec(preset.memory.generation, state.isolating.mtPerSecond, state.isolating.casLatency, {
    capacityBytes: preset.memory.capacityBytes,
    channels: preset.memory.channels,
  });
}

function rebuild(): void {
  if (pendingRebuild !== undefined) {
    clearTimeout(pendingRebuild);
    pendingRebuild = undefined;
  }

  const preset = findPreset(state.presetId);
  const memory = currentMemory();
  if (preset === undefined || memory === null)
    return;

  const config: HardwareConfig = { ...preset.config, memory };

  const result = simulate(config, generateAccesses(workloadSpec(state.workloadKind)), {
    traceRequests: TRACE_REQUESTS,
  });

  windowNs = PipelineView.windowOf(result.spans);
  const title = `${preset.title} — ${state.workloadKind}`;
  const subtitle = `${preset.title} · ${formatCount(ACCESS_COUNT)} accesses, first ${TRACE_REQUESTS} traced`;

  const data: PipelineData = {
    bottleneckId: result.bottleneckId,
    classification: result.classification,
    levels: result.resources.map(resource => ({
      accesses: resource.accesses,
      busyNs: resource.busyNs,
      id: resource.id,
      role: resource.role,
      utilisation: resource.utilisation,
    })),
    spans: result.spans,
    subtitle,
    title,
    windowNs,
  };
  view.setData(data);

  boardData = {
    explode: state.explode,
    layout: boardLayout(config),
    result,
    subtitle,
    title,
    windowNs,
  };
  publishBoard();

  // A new rig or workload has a different time scale — a dependent chase runs
  // about a hundred times longer than a stream — so refit the playback speed
  // rather than crawl or blur.
  const key = `${state.presetId}|${state.workloadKind}`;
  if (key !== fitKey) {
    fitKey = key;
    state = { ...state, nsPerSecond: fitNsPerSecond(windowNs) };
  }

  panel?.update(state, result, memory, validateConfiguration(config));
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

  // Neither of these touches the simulation, so the picture just updates.
  if (patch.view !== undefined || patch.explode !== undefined) {
    applyViewMode();
    publishBoard();
  }

  if (patch.presetId !== undefined || patch.workloadKind !== undefined) {
    rebuild();
    return;
  }

  if (patch.isolating !== undefined) {
    const memory = currentMemory();
    if (memory !== null)
      panel?.showReadouts(memory);
    scheduleRebuild();
  }
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

  if (state.view === 'model')
    boardModel.render(simulatedNs, state.nsPerSecond);
  else if (state.view === 'board')
    boardView.render(simulatedNs, state.nsPerSecond);
  else
    view.render(simulatedNs, state.nsPerSecond);
  requestAnimationFrame(tick);
}

panel = new ControlPanel(panelRoot, {
  onChange,
  onResetView: () => boardModel.resetCamera(),
  onRestart: () => {
    playedMs = 0;
    lastFrameMs = performance.now();
  },
  presets: RIG_PRESETS.map(preset => ({ id: preset.id, title: preset.title })),
});

applyViewMode();
rebuild();
requestAnimationFrame(tick);
