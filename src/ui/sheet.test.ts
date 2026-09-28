import type { BuildSheet } from '@/sheet';

import { describe, expect, it } from 'vitest';

import { SheetView } from './sheet';

function sampleSheet(): BuildSheet {
  return {
    ceilings: [
      {
        binding: true,
        expression: 'memory.mtPerSecond × 1e6 × 8 B × memory.channels ÷ 1e9',
        id: 'bandwidth',
        label: 'Memory bandwidth',
        note: null,
        value: '51.2 GB/s',
        workings: ['memory.mtPerSecond = 3200 MT/s', 'memory.channels = 2'],
      },
      {
        binding: false,
        expression: 'caches.l1.maxOutstandingMisses × DEFAULT_LINE_BYTES ÷ fullAccessNs(memory)',
        id: 'parallelism',
        label: 'Memory-level parallelism',
        note: null,
        value: '175.5 GB/s',
        workings: ['192 × 64 B ÷ 70 ns'],
      },
    ],
    checks: [
      {
        id: 'generation',
        met: true,
        rule: 'the board accepts the DIMM generation',
        severity: 'incompatible',
        sources: ['memory.generation'],
        statement: 'DDR4 memory accepted by this board',
      },
      {
        id: 'speed',
        met: false,
        rule: 'the DIMM speed stays within the board\'s cap',
        severity: 'warning',
        sources: ['memory.mtPerSecond', 'motherboard.maxMtPerSecond'],
        statement: '5600 MT/s against a board cap of 3200 MT/s',
      },
    ],
    floors: [
      {
        binding: false,
        expression: 'l1.hitTimeNs + l2.hitTimeNs + l3.hitTimeNs + fullAccessNs(memory)',
        id: 'full-miss',
        label: 'Full-miss latency',
        note: null,
        value: '90 ns',
        workings: ['1 ns + 4 ns + 15 ns + 70 ns'],
      },
    ],
    limiterId: null,
    measured: [
      {
        label: 'Achieved bandwidth',
        note: 'Bytes actually fetched from memory divided by elapsed time.',
        value: '51.2 GB/s',
      },
      {
        label: 'Mean access latency',
        note: 'Average time from issuing an access to its data arriving.',
        value: '90 ns',
      },
    ],
    missing: ['memory', 'motherboard'],
    parts: [
      {
        origin: null,
        part: 'cpu',
        rows: [
          {
            effect: 'simulated',
            help: 'How fast the core issues.',
            id: 'clockHz',
            label: 'Clock',
            value: '4 GHz',
          },
          {
            effect: 'display-only',
            help: 'Nothing reads this; one core is modelled.',
            id: 'cores',
            label: 'Cores',
            value: '1',
          },
        ],
        title: 'CPU',
      },
      {
        origin: 'Corsair Vengeance DDR4-3200',
        part: 'memory',
        rows: [
          {
            effect: 'validated',
            help: 'The board checks it accepts this generation.',
            id: 'generation',
            label: 'Generation',
            value: 'DDR4',
          },
        ],
        title: 'Memory',
      },
    ],
    title: 'medium read · 2 parts',
    unmodeled: [
      {
        facts: [
          {
            label: 'Simulated',
            note: 'The model does not reach this part, so it has no verdict.',
            value: 'No',
          },
        ],
        id: 'gpu',
        title: 'Graphics card (PCIe ×16)',
      },
    ],
    verdict: 'This build cannot run yet: it has no memory and no motherboard.',
  };
}

interface Mounted {
  readonly host: HTMLElement;
  readonly view: SheetView;
}

function mount(): Mounted {
  const host = document.createElement('section');
  host.id = 'sheet';
  const view = new SheetView(host);
  return { host, view };
}

function text(node: Element | null | undefined): string {
  return node?.textContent ?? '';
}

function headings(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.sheet-document h2')].map(heading => text(heading));
}

describe('build sheet', () => {
  it('states the blocks in the order a reader needs them', () => {
    const { host, view } = mount();
    view.update(sampleSheet());

    expect(headings(host)).toEqual([
      'medium read · 2 parts',
      'THIS RUN',
      'CEILINGS',
      'FLOORS',
      'CHECKS',
      'PARTS',
      'NOT PART OF THIS BUILD YET',
      'MISSING',
    ]);
  });

  it('marks only the binding ceiling with the word binding', () => {
    const { host, view } = mount();
    view.update(sampleSheet());

    const limits = [...host.querySelectorAll<HTMLElement>('.sheet-ceilings .sheet-limit')];
    expect(limits).toHaveLength(2);
    expect(text(limits[0])).toContain('binding');
    expect(text(limits[1])).not.toContain('binding');
  });

  it('says met or not met in words, never by colour alone', () => {
    const { host, view } = mount();
    view.update(sampleSheet());

    const checks = [...host.querySelectorAll<HTMLElement>('.sheet-checks .sheet-check')];
    expect(checks).toHaveLength(2);
    expect(text(checks[0])).toContain('met');
    expect(text(checks[0])).not.toContain('not met');
    expect(text(checks[1])).toContain('out of spec');
  });

  it('rebuilds the document instead of accumulating rows', () => {
    const { host, view } = mount();
    view.update(sampleSheet());
    const before = host.querySelectorAll('.sheet-document h3').length;

    view.update(sampleSheet());

    expect(before).toBe(3);
    expect(host.querySelectorAll('.sheet-document h3')).toHaveLength(before);
  });

  it('omits a block that has nothing to report rather than leaving a bare heading', () => {
    const { host, view } = mount();
    const empty = { ...sampleSheet(), ceilings: [], checks: [], floors: [], measured: [], parts: [] };

    view.update(empty);

    expect(headings(host)).toEqual([
      'medium read · 2 parts',
      'NOT PART OF THIS BUILD YET',
      'MISSING',
    ]);
  });

  it('adopts the machine controls into a sidebar inside the host', () => {
    const { host, view } = mount();

    expect(host.contains(view.sidebar)).toBe(true);
    expect(view.sidebar.className).toBe('sheet-sidebar');
  });
});
