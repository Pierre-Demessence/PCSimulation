import type { CaseSpec, CpuPart, PartId, StorageSpec } from '@/data';

import type { MemorySpec, MotherboardSpec } from '@/sim';

import { describe, expect, it } from 'vitest';

import {
  addStorage,
  BASELINE_CPU,
  buildChecks,
  CACHE_HIERARCHY,
  catalogueFor,
  emptyBuild,
  partDefinition,
  toConfigParts,
  validateConfiguration,
} from '@/data';

import {
  boardFormFactor,
  caseFormFactors,
  parseStorage,
  slug,
  socketFromDataset,
} from '../../../scripts/catalogue/enrichment';

const KINDS: readonly PartId[] = ['cpu', 'motherboard', 'memory', 'gpu', 'psu', 'storage', 'cooler', 'case'];

function specOf(kind: PartId, id: string): unknown {
  const choice = catalogueFor(kind).find(candidate => candidate.id === id);
  if (choice === undefined)
    throw new Error(`no catalogue ${kind} "${id}"`);
  return choice.spec;
}

function assemble(parts: readonly { readonly kind: PartId; readonly spec: unknown }[]) {
  let build = emptyBuild();
  for (const { kind, spec } of parts) {
    build = kind === 'storage'
      ? addStorage(build, spec as StorageSpec)
      : partDefinition(kind).write(build, spec);
  }
  return build;
}

/** Every violation string, warnings included. */
function problemsFor(parts: readonly { readonly kind: PartId; readonly spec: unknown }[]): readonly string[] {
  return validateConfiguration(toConfigParts(assemble(parts)));
}

/** Only the hard incompatibilities, so a passing warning (older link, no iGPU) is ignored. */
function incompatibilitiesFor(parts: readonly { readonly kind: PartId; readonly spec: unknown }[]): readonly string[] {
  return buildChecks(toConfigParts(assemble(parts)))
    .filter(check => !check.met && check.severity === 'incompatible')
    .map(check => check.rule);
}

describe('catalogue', () => {
  it('gives every entry a unique id', () => {
    const ids = KINDS.flatMap(kind => catalogueFor(kind).map(choice => choice.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers several parts of every kind', () => {
    for (const kind of KINDS)
      expect(catalogueFor(kind).length, kind).toBeGreaterThan(0);
  });

  it('assembles a matched AMD build with no incompatibility', () => {
    expect(problemsFor([
      { kind: 'cpu', spec: specOf('cpu', 'cpu:amd-ryzen-5-7600') },
      { kind: 'motherboard', spec: specOf('motherboard', 'motherboard:asus-prime-b650-plus-wifi') },
      { kind: 'memory', spec: specOf('memory', 'memory:g-skill-flare-x5-32-gb') },
      { kind: 'gpu', spec: specOf('gpu', 'gpu:geforce-rtx-4070') },
      { kind: 'psu', spec: specOf('psu', 'psu:corsair-rm750e-2023') },
      { kind: 'storage', spec: specOf('storage', 'storage:samsung-990-pro-2000') },
      { kind: 'cooler', spec: specOf('cooler', 'cooler:thermalright-peerless-assassin-120-se') },
      { kind: 'case', spec: specOf('case', 'case:corsair-4000d-airflow') },
    ])).toEqual([]);
  });

  it('assembles a matched Intel DDR4 build with no incompatibility', () => {
    expect(problemsFor([
      { kind: 'cpu', spec: specOf('cpu', 'cpu:intel-core-i5-12400f') },
      { kind: 'motherboard', spec: specOf('motherboard', 'motherboard:asus-prime-b660-plus-d4') },
      { kind: 'memory', spec: specOf('memory', 'memory:corsair-vengeance-lpx-16-gb') },
      { kind: 'gpu', spec: specOf('gpu', 'gpu:geforce-rtx-4060') },
      { kind: 'psu', spec: specOf('psu', 'psu:evga-supernova-650-ga') },
      { kind: 'storage', spec: specOf('storage', 'storage:crucial-mx500-1000') },
      { kind: 'cooler', spec: specOf('cooler', 'cooler:deepcool-ak400') },
      { kind: 'case', spec: specOf('case', 'case:fractal-design-north') },
    ])).toEqual([]);
  });
  it('assembles the LGA1151 Skylake reference build with no incompatibility', () => {
    expect(problemsFor([
      { kind: 'cpu', spec: specOf('cpu', 'cpu:intel-core-i5-6600k') },
      { kind: 'motherboard', spec: specOf('motherboard', 'motherboard:asus-z170-p') },
      { kind: 'memory', spec: specOf('memory', 'memory:kingston-fury-16-gb') },
      { kind: 'gpu', spec: specOf('gpu', 'gpu:geforce-gtx-1060-6gb') },
      { kind: 'psu', spec: specOf('psu', 'psu:corsair-vs550') },
      { kind: 'storage', spec: specOf('storage', 'storage:samsung-850-evo-250') },
      { kind: 'cooler', spec: specOf('cooler', 'cooler:cooler-master-hyper-212x') },
      { kind: 'case', spec: specOf('case', 'case:zalman-z3-plus') },
    ])).toEqual([]);
  });

  it('assembles the i9-13900K / RTX 4080 reference build with no incompatibility', () => {
    expect(problemsFor([
      { kind: 'cpu', spec: specOf('cpu', 'cpu:intel-core-i9-13900k') },
      { kind: 'motherboard', spec: specOf('motherboard', 'motherboard:msi-mag-z790-tomahawk-wifi') },
      { kind: 'memory', spec: specOf('memory', 'memory:corsair-vengeance-64-gb') },
      { kind: 'gpu', spec: specOf('gpu', 'gpu:geforce-rtx-4080') },
      { kind: 'psu', spec: specOf('psu', 'psu:corsair-rm1000x-2021') },
      { kind: 'storage', spec: specOf('storage', 'storage:samsung-980-pro-2000') },
      { kind: 'cooler', spec: specOf('cooler', 'cooler:noctua-nh-d15-chromax-black') },
      { kind: 'case', spec: specOf('case', 'case:corsair-7000d-airflow') },
    ])).toEqual([]);
  });
  it('keeps every catalogue CPU on the model\'s simulated fields', () => {
    for (const choice of catalogueFor('cpu')) {
      const part = choice.spec as CpuPart;
      expect(part.cpu.clockHz, choice.name).toBe(BASELINE_CPU.clockHz);
      expect(part.cpu.serviceTimeNs, choice.name).toBe(BASELINE_CPU.serviceTimeNs);
      expect(part.caches, choice.name).toEqual(CACHE_HIERARCHY);
    }
  });

  it('pairs every CPU with a board and memory of its socket and generation', () => {
    const boards = catalogueFor('motherboard').map(choice => choice.spec as MotherboardSpec);
    const memories = catalogueFor('memory').map(choice => choice.spec as MemorySpec);
    for (const choice of catalogueFor('cpu')) {
      const cpu = (choice.spec as CpuPart).cpu;
      const board = boards.find(candidate => candidate.socket === cpu.socket);
      expect(board, `no board for ${choice.name}`).toBeDefined();
      const generation = board!.allowedGenerations.find(gen => cpu.memoryGenerations.includes(gen));
      const memory = memories.find(candidate => candidate.generation === generation);
      expect(memory, `no memory for ${choice.name}`).toBeDefined();
      expect(incompatibilitiesFor([
        { kind: 'cpu', spec: choice.spec },
        { kind: 'motherboard', spec: board },
        { kind: 'memory', spec: memory },
      ]), choice.name).toEqual([]);
    }
  });

  it('fits every graphics card and drive on a compatible board', () => {
    const board = specOf('motherboard', 'motherboard:asus-prime-b650-plus-wifi');
    for (const choice of catalogueFor('gpu'))
      expect(problemsFor([{ kind: 'motherboard', spec: board }, { kind: 'gpu', spec: choice.spec }]), choice.name).toEqual([]);
    for (const choice of catalogueFor('storage'))
      expect(problemsFor([{ kind: 'motherboard', spec: board }, { kind: 'storage', spec: choice.spec }]), choice.name).toEqual([]);
  });

  it('cools every CPU and houses every case with a fitting cooler and card', () => {
    const cpu = specOf('cpu', 'cpu:intel-core-i7-14700k');
    for (const choice of catalogueFor('cooler'))
      expect(problemsFor([{ kind: 'cpu', spec: cpu }, { kind: 'cooler', spec: choice.spec }]), choice.name).toEqual([]);

    const lowCooler = specOf('cooler', 'cooler:arctic-liquid-freezer-ii-240');
    const shortCard = specOf('gpu', 'gpu:geforce-rtx-4060');
    const boards = catalogueFor('motherboard').map(choice => choice.spec as MotherboardSpec);
    for (const choice of catalogueFor('case')) {
      const fits = (choice.spec as CaseSpec).formFactors;
      const board = boards.find(candidate => fits.includes(candidate.formFactor));
      expect(board, `no board fits ${choice.name}`).toBeDefined();
      expect(incompatibilitiesFor([
        { kind: 'motherboard', spec: board },
        { kind: 'gpu', spec: shortCard },
        { kind: 'cooler', spec: lowCooler },
        { kind: 'case', spec: choice.spec },
      ]), choice.name).toEqual([]);
    }
  });
});

describe('catalogue importer helpers', () => {
  it('slugs a product name', () => {
    expect(slug('AMD Ryzen 5 5600')).toBe('amd-ryzen-5-5600');
    expect(slug('MSI MAG A750GL PCIE5')).toBe('msi-mag-a750gl-pcie5');
  });

  it('maps dataset sockets to the model union', () => {
    expect(socketFromDataset('AM5')).toBe('am5');
    expect(socketFromDataset('LGA1700')).toBe('lga1700');
    expect(() => socketFromDataset('sTRX4')).toThrow();
  });

  it('maps board form factors', () => {
    expect(boardFormFactor('ATX')).toBe('atx');
    expect(boardFormFactor('Micro ATX')).toBe('matx');
    expect(boardFormFactor('Mini ITX')).toBe('itx');
  });

  it('infers a case form-factor set from its type, widening for E-ATX', () => {
    expect(caseFormFactors('Mini ITX Desktop', false)).toEqual(['itx']);
    expect(caseFormFactors('MicroATX Mini Tower', false)).toEqual(['matx', 'itx']);
    expect(caseFormFactors('ATX Mid Tower', false)).toEqual(['atx', 'matx', 'itx']);
    expect(caseFormFactors('ATX Mid Tower', true)).toEqual(['eatx', 'atx', 'matx', 'itx']);
  });

  it('parses a drive interface into bus and lanes', () => {
    expect(parseStorage('M.2 PCIe 4.0 X4')).toEqual({ interface: 'nvme', pcieLanes: 4 });
    expect(parseStorage('SATA 6.0 Gb/s')).toEqual({ interface: 'sata', pcieLanes: 0 });
  });
});
