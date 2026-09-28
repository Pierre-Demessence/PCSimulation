import type { Build, PartId } from '@/data';
import type { MemorySpec, SimResult } from '@/sim';
import type { WorkloadKind } from '@/workloads';

import { addPart, hasPart, partDefinitions } from '@/data';
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
} from '@/sim';

import { configureRange, element, slot } from './dom';
import { PartEditor } from './editor';

/** The two faces of the machine: the document, and the picture. */
export type ViewMode = 'sheet' | 'visual';

/** Which picture the visualisation draws. */
export type VisualKind = 'board' | 'model';

export interface PanelState {
  /** The build in progress, so the bench and the simulation read one source. */
  readonly build: Build;
  readonly workloadKind: WorkloadKind;
  readonly nsPerSecond: number;
  readonly playing: boolean;
  readonly view: ViewMode;
  readonly visualKind: VisualKind;
  /** 0 assembles the parts onto the board; 1 pulls them fully apart. */
  readonly explode: number;
  /** Which part is on the bench, and which of its characteristics is varied. */
  readonly part: PartId;
  readonly characteristic: string;
  /**
   * The template each part was loaded from. Filled and read by the template
   * catalogue: until a part is swapped, nothing has an origin.
   */
  readonly origin: Partial<Record<PartId, string>>;
}

export interface PanelOptions {
  readonly onChange: (patch: Partial<PanelState>) => void;
  readonly onResetView: () => void;
  readonly onRestart: () => void;
}

const EXPLODE_RANGE = { max: 1, min: 0, step: 0.01 };

const FACE_LABELS: Record<ViewMode, string> = {
  sheet: 'Build sheet — the machine in words',
  visual: 'Visualisation — the machine in a picture',
};

const VISUAL_LABELS: Record<VisualKind, string> = {
  board: 'Flat board — seen from above',
  model: '3D model — orbit and zoom',
};

const WORKLOAD_LABELS: Record<WorkloadKind, string> = {
  mixed: 'Mixed — half dependent hops',
  random: 'Random — dependent (pointer chase)',
  streaming: 'Streaming — sequential lines',
};

/**
 * The machine-level controls, the part bench, and the readout cards. The bench
 * (`PartEditor`) exists to isolate one characteristic of one part at a time:
 * holding every other value fixed is what makes a bottleneck attributable
 * instead of one blurry "faster".
 */
export class ControlPanel {
  private readonly options: PanelOptions;

  /** Build-level controls, adopted into whichever face is on screen. */
  private readonly buildHost = element('div', 'panel-build');

  /** Picture-only controls, which describe the drawing rather than the build. */
  private readonly pictureHost = element('div', 'panel-picture');

  private readonly faceSelect = element('select', 'control');
  private readonly visualSelect = element('select', 'control');
  private readonly workloadSelect = element('select', 'control');
  private readonly pickers = new Map<PartId, HTMLSelectElement>();
  private readonly explodeSlider = element('input', 'control');
  private readonly explodeReadout = element('span', 'readout');
  private readonly playbackSlider = element('input', 'control');
  private readonly playbackReadout = element('span', 'readout');
  private readonly playButton = element('button', 'control');
  private readonly warnings = element('p', 'warnings');
  private readonly cards = element('div', 'cards');
  private readonly editor: PartEditor;

  private state: PanelState | null = null;

  constructor(options: PanelOptions) {
    this.options = options;
    this.editor = new PartEditor({
      onApply: build => this.options.onChange({ build }),
      onSelect: (part, characteristic) => this.options.onChange({ part, characteristic }),
    });
    this.build();
  }

  /** The build-level controls, which travel with the reader to either face. */
  get buildControlsElement(): HTMLElement {
    return this.buildHost;
  }

  /** The picture-only controls, which stay in the Controls window. */
  get pictureControlsElement(): HTMLElement {
    return this.pictureHost;
  }

  /** The readout cards, for the Readouts window. */
  get readoutsElement(): HTMLElement {
    return this.cards;
  }

  private build(): void {
    for (const face of ['sheet', 'visual'] as const)
      this.faceSelect.append(new Option(FACE_LABELS[face], face));

    for (const kind of ['model', 'board'] as const)
      this.visualSelect.append(new Option(VISUAL_LABELS[kind], kind));

    for (const kind of ['streaming', 'random', 'mixed'] as const)
      this.workloadSelect.append(new Option(WORKLOAD_LABELS[kind], kind));

    const pickerHost = element('div', 'pickers');
    for (const definition of partDefinitions()) {
      const picker = element('select', 'control');
      picker.title
        = `Whether this build has a ${definition.label.toLowerCase()}. A part appears only when you add it, so nothing is filled in for you.`;
      picker.addEventListener('change', () => {
        const build = this.state?.build;
        if (build === undefined || picker.value !== 'add')
          return;
        this.options.onChange({ build: addPart(build, definition.id) });
      });
      this.pickers.set(definition.id, picker);
      pickerHost.append(slot(definition.label, picker));
    }

    this.faceSelect.title
      = 'The build sheet explains the machine in words; the visualisation draws it. Both show the same build.';
    this.visualSelect.title
      = 'Model draws the machine in 3D where you can orbit it; Board draws the same machine flat.';

    configureRange(this.explodeSlider, EXPLODE_RANGE.min, EXPLODE_RANGE.max, EXPLODE_RANGE.step);
    this.explodeSlider.title
      = 'How far apart to pull the parts. At 0 they assemble onto the board; at 100% they separate, so the traces buried inside a package become visible.';

    configureRange(this.playbackSlider, 0, 1, 0.001);
    this.playbackSlider.title
      = 'Playback speed, logarithmic. Time always runs at a constant rate, so distances on screen stay honest.';

    this.playButton.title = 'Pause or resume the animation. The numbers are unaffected.';
    const restart = element('button', 'control', 'Restart');
    restart.title = 'Rewind the animation to the start of the traced window.';
    const resetView = element('button', 'control', 'Reset view');
    resetView.title
      = 'Puts the 3D camera back to its opening angle. In the flat view there is no camera to reset.';

    this.faceSelect.addEventListener('change', () =>
      this.options.onChange({ view: this.faceSelect.value as ViewMode }));

    this.visualSelect.addEventListener('change', () =>
      this.options.onChange({ visualKind: this.visualSelect.value as VisualKind }));

    this.workloadSelect.addEventListener('change', () =>
      this.options.onChange({ workloadKind: this.workloadSelect.value as WorkloadKind }));

    this.explodeSlider.addEventListener('input', () =>
      this.options.onChange({ explode: Number(this.explodeSlider.value) }));

    this.playbackSlider.addEventListener('input', () =>
      this.options.onChange({ nsPerSecond: nsPerSecondFromSlider(Number(this.playbackSlider.value)) }));

    this.playButton.addEventListener('click', () =>
      this.options.onChange({ playing: !(this.state?.playing ?? true) }));

    restart.addEventListener('click', () => this.options.onRestart());
    resetView.addEventListener('click', () => this.options.onResetView());

    // The split is the point: the build controls travel with the reader to either
    // face, and the picture controls stay with the picture.
    const buildControls = element('div', 'controls');
    buildControls.append(
      slot('View', this.faceSelect),
      slot('Workload', this.workloadSelect),
      pickerHost,
      this.editor.element,
    );

    const pictureControls = element('div', 'controls');
    pictureControls.append(
      slot('Draw', this.visualSelect),
      slot('Explode', this.explodeSlider, this.explodeReadout),
      slot('Speed', this.playbackSlider, this.playbackReadout),
      slot('Animation', this.playButton),
      slot('', restart),
      slot('', resetView),
    );

    this.warnings.setAttribute('aria-live', 'polite');

    this.buildHost.append(buildControls, this.warnings);
    this.pictureHost.append(pictureControls);
  }

  /**
   * Republishes every value, so the DOM always mirrors the state. A build that is
   * missing a part has no run, so `result` is null and the cards go away rather
   * than describe a machine nobody assembled.
   */
  update(state: PanelState, result: SimResult | null, memoryWarnings: readonly string[]): void {
    this.playbackSlider.value = String(sliderFromNsPerSecond(state.nsPerSecond));
    this.syncState(state);

    this.warnings.textContent = memoryWarnings.length > 0
      ? `Outside this board's spec: ${memoryWarnings.join('; ')}`
      : '';

    const memory = state.build.memory;
    if (result === null || memory === null) {
      this.cards.replaceChildren();
      return;
    }
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
    this.faceSelect.value = state.view;
    this.visualSelect.value = state.visualKind;
    this.explodeSlider.value = String(state.explode);
    this.explodeReadout.textContent = state.explode <= 0
      ? 'assembled on the board'
      : state.explode >= 1 ? 'fully apart' : `${Math.round(state.explode * 100)}% apart`;
    this.workloadSelect.value = state.workloadKind;

    // "Not added" is offered only while the part is absent, so a build cannot
    // silently lose a part it was measured with. The option list is rebuilt only
    // when presence changes, so a drag cannot close a picker the reader opened.
    for (const definition of partDefinitions()) {
      const picker = this.pickers.get(definition.id);
      if (picker === undefined)
        continue;
      const present = hasPart(state.build, definition.id);
      const shape = present ? 'present' : 'absent';
      if (picker.dataset.shape !== shape) {
        picker.dataset.shape = shape;
        picker.replaceChildren(
          ...(present ? [] : [new Option('Not added', 'absent')]),
          new Option('Enter your own', 'add'),
        );
      }
      picker.value = present ? 'add' : 'absent';
    }

    this.editor.update(state.build, state.part, state.characteristic);
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
