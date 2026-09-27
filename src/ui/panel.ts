import type { MemorySpec, SimResult } from '@/sim';
import type { WorkloadKind } from '@/workloads';

import { levelLabel } from '@/render';
import {
  formatBandwidth,
  formatCount,
  formatDuration,
  formatPercent,
  nsPerSecondFromSlider,
  sliderFromNsPerSecond,
} from '@/render/format';
import {
  aggregateBandwidthBytesPerNs,
  casLatencyNs,
  fullAccessNs,
} from '@/sim';

export interface IsolatingControls {
  /** Memory speed in MT/s — the bandwidth knob. */
  readonly mtPerSecond: number;
  /** CAS latency in memory clock cycles — the latency knob. */
  readonly casLatency: number;
}

/** Which picture of the machine is on screen. */
export type ViewMode = 'board' | 'flow' | 'model';

export interface PanelState {
  readonly presetId: string;
  readonly workloadKind: WorkloadKind;
  readonly nsPerSecond: number;
  readonly playing: boolean;
  readonly isolating: IsolatingControls;
  readonly view: ViewMode;
  /** 0 assembles the parts onto the board; 1 pulls them fully apart. */
  readonly explode: number;
}

export interface PanelOptions {
  readonly presets: readonly { readonly id: string; readonly title: string }[];
  readonly onChange: (patch: Partial<PanelState>) => void;
  readonly onResetView: () => void;
  readonly onRestart: () => void;
}

const MT_RANGE = { max: 12_000, min: 1_600, step: 200 };
const CL_RANGE = { max: 46, min: 8, step: 1 };
const EXPLODE_RANGE = { max: 1, min: 0, step: 0.01 };

const VIEW_LABELS: Record<ViewMode, string> = {
  board: 'Board — flat, seen from above',
  flow: 'Flow — one row per level',
  model: 'Model — 3D, orbit and zoom',
};

const WORKLOAD_LABELS: Record<WorkloadKind, string> = {
  mixed: 'Mixed — half dependent hops',
  random: 'Random — dependent (pointer chase)',
  streaming: 'Streaming — sequential lines',
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined)
    node.className = className;
  if (text !== undefined)
    node.textContent = text;
  return node;
}

function slot(label: string, control: HTMLElement, readout?: HTMLElement): HTMLElement {
  const wrapper = element('div', 'slot');
  const labelable = control instanceof HTMLInputElement || control instanceof HTMLSelectElement;

  if (labelable && label.length > 0) {
    // A real <label for> keeps the control's accessible name to its caption,
    // and aria-describedby keeps the readout reachable without polluting it.
    const id = `slot-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    control.id = id;
    const caption = element('label', 'slot-label', label);
    caption.htmlFor = id;
    wrapper.append(caption);

    if (readout !== undefined) {
      const readoutId = `${id}-readout`;
      readout.id = readoutId;
      control.setAttribute('aria-describedby', readoutId);
    }
  }
  else {
    wrapper.append(element('span', 'slot-label', label));
  }

  wrapper.append(control);
  if (readout !== undefined)
    wrapper.append(readout);
  return wrapper;
}

function configureRange(input: HTMLInputElement, min: number, max: number, step: number): void {
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
}

/**
 * The controls and the readout cards. The two sliders exist to isolate one
 * variable at a time: fixing channel count and the other knob is what makes
 * "bandwidth" and "latency" separable rather than a single blurry "faster".
 */
export class ControlPanel {
  private readonly options: PanelOptions;

  /** Hosts the inputs and the warnings line; adopted into the Controls window. */
  private readonly controlsHost = element('div', 'panel-controls');

  private readonly presetSelect = element('select', 'control');
  private readonly workloadSelect = element('select', 'control');
  private readonly viewSelect = element('select', 'control');
  private readonly explodeSlider = element('input', 'control');
  private readonly explodeReadout = element('span', 'readout');
  private readonly mtInput = element('input', 'control');
  private readonly mtReadout = element('span', 'readout');
  private readonly clSlider = element('input', 'control');
  private readonly clReadout = element('span', 'readout');
  private readonly playbackSlider = element('input', 'control');
  private readonly playbackReadout = element('span', 'readout');
  private readonly playButton = element('button', 'control');
  private readonly warnings = element('p', 'warnings');
  private readonly cards = element('div', 'cards');

  private state: PanelState | null = null;

  constructor(options: PanelOptions) {
    this.options = options;
    this.build();
  }

  /** The inputs and warnings, for the Controls window. */
  get controlsElement(): HTMLElement {
    return this.controlsHost;
  }

  /** The readout cards, for the Readouts window. */
  get readoutsElement(): HTMLElement {
    return this.cards;
  }

  private build(): void {
    for (const preset of this.options.presets)
      this.presetSelect.append(new Option(preset.title, preset.id));

    for (const kind of ['streaming', 'random', 'mixed'] as const)
      this.workloadSelect.append(new Option(WORKLOAD_LABELS[kind], kind));

    for (const view of ['model', 'board', 'flow'] as const)
      this.viewSelect.append(new Option(VIEW_LABELS[view], view));

    configureRange(this.explodeSlider, EXPLODE_RANGE.min, EXPLODE_RANGE.max, EXPLODE_RANGE.step);
    this.explodeSlider.title
      = 'How far apart to pull the parts. At 0 they assemble onto the board; at 100% they separate, so the traces buried inside a package become visible.';
    this.viewSelect.title
      = 'Model draws the machine in 3D where you can orbit it; Board draws it flat; Flow draws one row per cache level.';

    configureRange(this.mtInput, MT_RANGE.min, MT_RANGE.max, MT_RANGE.step);
    this.mtInput.title
      = 'Memory speed in MT/s. Channel count and CAS latency stay fixed, so this isolates bandwidth on its own.';

    configureRange(this.clSlider, CL_RANGE.min, CL_RANGE.max, CL_RANGE.step);
    this.clSlider.title
      = 'CAS latency in memory clock cycles. Channels and MT/s stay fixed, so this isolates latency on its own.';

    configureRange(this.playbackSlider, 0, 1, 0.001);
    this.playbackSlider.title
      = 'Playback speed, logarithmic. Time always runs at a constant rate, so distances on screen stay honest.';

    this.playButton.title = 'Pause or resume the animation. The numbers are unaffected.';
    const restart = element('button', 'control', 'Restart');
    restart.title = 'Rewind the animation to the start of the traced window.';
    const resetView = element('button', 'control', 'Reset view');
    resetView.title
      = 'Puts the 3D camera back to its opening angle. In the flat views there is no camera to reset.';

    this.presetSelect.addEventListener('change', () =>
      this.options.onChange({ presetId: this.presetSelect.value }));

    this.workloadSelect.addEventListener('change', () =>
      this.options.onChange({ workloadKind: this.workloadSelect.value as WorkloadKind }));

    this.mtInput.addEventListener('input', () =>
      this.options.onChange({
        isolating: { casLatency: this.casLatency, mtPerSecond: Number(this.mtInput.value) },
      }));

    this.clSlider.addEventListener('input', () =>
      this.options.onChange({
        isolating: { casLatency: Number(this.clSlider.value), mtPerSecond: this.mtPerSecond },
      }));

    this.viewSelect.addEventListener('change', () =>
      this.options.onChange({ view: this.viewSelect.value as ViewMode }));

    this.explodeSlider.addEventListener('input', () =>
      this.options.onChange({ explode: Number(this.explodeSlider.value) }));

    this.playbackSlider.addEventListener('input', () =>
      this.options.onChange({ nsPerSecond: nsPerSecondFromSlider(Number(this.playbackSlider.value)) }));

    this.playButton.addEventListener('click', () =>
      this.options.onChange({ playing: !(this.state?.playing ?? true) }));

    restart.addEventListener('click', () => this.options.onRestart());
    resetView.addEventListener('click', () => this.options.onResetView());

    const controls = element('div', 'controls');
    controls.append(
      slot('View', this.viewSelect),
      slot('Explode', this.explodeSlider, this.explodeReadout),
      slot('Rig', this.presetSelect),
      slot('Workload', this.workloadSelect),
      slot('Memory speed', this.mtInput, this.mtReadout),
      slot('CAS latency', this.clSlider, this.clReadout),
      slot('Speed', this.playbackSlider, this.playbackReadout),
      slot('Animation', this.playButton),
      slot('', restart),
      slot('', resetView),
    );

    this.warnings.setAttribute('aria-live', 'polite');

    this.controlsHost.append(controls, this.warnings);
  }

  private get mtPerSecond(): number {
    return Number(this.mtInput.value);
  }

  private get casLatency(): number {
    return Number(this.clSlider.value);
  }

  /** Republishes every value, so the DOM always mirrors the state. */
  update(state: PanelState, result: SimResult, memory: MemorySpec, memoryWarnings: readonly string[]): void {
    this.presetSelect.value = state.presetId;
    this.workloadSelect.value = state.workloadKind;
    this.mtInput.value = String(state.isolating.mtPerSecond);
    this.clSlider.value = String(state.isolating.casLatency);
    this.playbackSlider.value = String(sliderFromNsPerSecond(state.nsPerSecond));
    this.syncState(state);

    this.showReadouts(memory);

    this.warnings.textContent = memoryWarnings.length > 0
      ? `Outside this board's spec: ${memoryWarnings.join('; ')}`
      : '';

    this.renderCards(result, memory);
  }

  /**
   * The cheap DOM mirrors: everything that depends on the state alone, not on a
   * simulation result. Pausing or changing playback speed must not require a
   * half-second re-run.
   */
  syncState(state: PanelState): void {
    this.state = state;
    this.playButton.textContent = state.playing ? 'Pause' : 'Play';
    this.playButton.setAttribute(
      'aria-label',
      state.playing ? 'Pause the animation' : 'Play the animation',
    );
    this.playbackReadout.textContent = `1 s = ${formatDuration(state.nsPerSecond)}`;
    this.viewSelect.value = state.view;
    this.explodeSlider.value = String(state.explode);
    this.explodeReadout.textContent = state.explode <= 0
      ? 'assembled on the board'
      : state.explode >= 1 ? 'fully apart' : `${Math.round(state.explode * 100)}% apart`;
  }

  /**
   * Refreshes only the DIMM-derived readouts. These need no simulation, so the
   * sliders can call this on every input event while the costly re-run is
   * debounced elsewhere.
   */
  showReadouts(memory: MemorySpec): void {
    this.mtReadout.textContent = `${formatBandwidth(
      aggregateBandwidthBytesPerNs(memory),
    )} peak · one access ${formatDuration(fullAccessNs(memory))}`;
    this.clReadout.textContent = `CAS ${formatDuration(casLatencyNs(memory.mtPerSecond, memory.casLatency))}`;
  }

  private renderCards(result: SimResult, memory: MemorySpec): void {
    const limiter = result.classification === 'resource-bound' && result.bottleneckId !== null
      ? `${formatPercent(result.resources.find(r => r.id === result.bottleneckId)?.utilisation ?? 0)} on ${levelLabel(result.bottleneckId)}`
      : 'The dependency chain';

    const cards: readonly { readonly label: string; readonly value: string; readonly title: string }[] = [
      {
        label: 'Time to finish',
        title: 'How long the whole workload took, in simulated time.',
        value: formatDuration(result.elapsedNs),
      },
      {
        label: 'Achieved bandwidth',
        title: 'Bytes actually fetched from memory divided by elapsed time. GB/s is the same number as bytes per nanosecond.',
        value: formatBandwidth(result.achievedBandwidthBytesPerNs),
      },
      {
        label: 'Mean access latency',
        title: 'Average time from issuing an access to its data arriving, including queueing.',
        value: formatDuration(result.meanLatencyNs),
      },
      {
        label: 'Memory peak',
        title: 'Theoretical ceiling of this DIMM: MT/s x 8 bytes x channel count. Achieved bandwidth is capped by this.',
        value: formatBandwidth(aggregateBandwidthBytesPerNs(memory)),
      },
      {
        label: 'CAS latency',
        title: 'How long the DIMM waits before answering: CL x 2000 / MT/s, in nanoseconds. Newer memory is not always lower here.',
        value: formatDuration(casLatencyNs(memory.mtPerSecond, memory.casLatency)),
      },
      {
        label: 'L1 hit rate',
        title: 'Share of accesses the L1 answered. A working set that fits in cache makes the core the limiter instead of memory.',
        value: formatPercent(result.hitRates.l1),
      },
      {
        label: 'Accesses completed',
        title: 'Every issued access completes; the simulation throws rather than report a partial run.',
        value: formatCount(result.accesses),
      },
      {
        label: 'Limiter',
        title: 'The resource with the highest utilisation when it passes the saturation threshold; otherwise the dependency chain.',
        value: limiter,
      },
    ];

    this.cards.replaceChildren(...cards.map((card) => {
      const node = element('div', 'card');
      node.title = card.title;
      node.append(element('span', 'card-label', card.label), element('strong', 'card-value', card.value));
      return node;
    }));
  }
}
