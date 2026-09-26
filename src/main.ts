import type { PipelineData } from '@/render';

import type { HardwareConfig, MemorySpec } from '@/sim';
import type { PanelState } from '@/ui';
import type { WorkloadKind, WorkloadSpec } from '@/workloads';
import { findPreset, memorySpec, RIG_PRESETS, validateConfiguration } from '@/data';
import { fitNsPerSecond, formatCount, PipelineView, simulatedNsAt } from '@/render';
import { simulate } from '@/sim';
import { ControlPanel } from '@/ui';
import { generateAccesses, mixedSpec, randomSpec, streamingSpec } from '@/workloads';
import './styles.css';

/** Large enough for steady-state numbers; only a slice is traced for the view. */
const ACCESS_COUNT = 200_000;
const TRACE_REQUESTS = 500;

const canvas = document.querySelector<HTMLCanvasElement>('#pipeline');
const panelRoot = document.querySelector<HTMLElement>('#panel');
if (canvas === null || panelRoot === null)
  throw new Error('the page is missing #pipeline or #panel');

function workloadSpec(kind: WorkloadKind): WorkloadSpec {
  const base = { accessCount: ACCESS_COUNT };
  if (kind === 'random')
    return randomSpec(base);
  if (kind === 'mixed')
    return mixedSpec(base);
  return streamingSpec(base);
}

const view = new PipelineView(canvas);
let panel: ControlPanel | null = null;

let state: PanelState = {
  isolating: { casLatency: 16, mtPerSecond: 3200 },
  nsPerSecond: 40,
  playing: true,
  presetId: 'rig-2019',
  workloadKind: 'streaming',
};

let windowNs = 0;
let playedMs = 0;
let lastFrameMs = performance.now();
let fitKey = '';
let pendingRebuild: number | undefined;

/** Milliseconds to wait after the last slider input before re-simulating. */
const REBUILD_DEBOUNCE_MS = 160;

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
    subtitle: `${preset.title} · ${formatCount(ACCESS_COUNT)} accesses, first ${TRACE_REQUESTS} traced`,
    title: `${preset.title} — ${state.workloadKind}`,
    windowNs,
  };
  view.setData(data);

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

  view.render(simulatedNs, state.nsPerSecond);
  requestAnimationFrame(tick);
}

panel = new ControlPanel(panelRoot, {
  onChange,
  onRestart: () => {
    playedMs = 0;
    lastFrameMs = performance.now();
  },
  presets: RIG_PRESETS.map(preset => ({ id: preset.id, title: preset.title })),
});

rebuild();
requestAnimationFrame(tick);
