import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BASELINE_CPU, CACHE_HIERARCHY, GIB, memorySpec } from '@/data/presets';

import {
  BOARDS,
  boardFormFactor,
  caseFormFactors,
  CASES,
  COOLERS,
  CPU_NAMES,
  GPUS,
  MEMORY_PICKS,
  MICROARCH,
  parseStorage,
  PSUS,
  slug,
  socketFromDataset,
  STORAGE_PICKS,
} from './enrichment.ts';

/**
 * The build-time importer: it reads the checked-in docyx snapshot, maps each
 * curated part's display fields, merges the hand-authored compatibility fields
 * from `enrichment.ts`, and emits `src/data/catalogue/catalogue.json`. The app
 * imports only that JSON — never the snapshot, never the network. Re-run with
 * `npm run catalogue:build` to refresh. See PROVENANCE.md.
 */

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(SCRIPT_DIR, 'source');
const OUTPUT = join(SCRIPT_DIR, '..', '..', 'src', 'data', 'catalogue', 'catalogue.json');

interface Row { readonly name: string; readonly [key: string]: unknown }

interface CatalogueEntry {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly spec: unknown;
}

function readRows(category: string): readonly Row[] {
  return JSON.parse(readFileSync(join(SOURCE_DIR, `${category}.json`), 'utf8')) as Row[];
}

function firstByField(rows: readonly Row[], field: string, value: string): Row {
  const row = rows.find(candidate => candidate[field] === value);
  if (row === undefined)
    throw new Error(`no ${field} = "${value}" in the snapshot`);
  return row;
}

function firstByName(rows: readonly Row[], name: string): Row {
  return firstByField(rows, 'name', name);
}

function importCpus(): readonly CatalogueEntry[] {
  const rows = readRows('cpu');
  return CPU_NAMES.map((name) => {
    const row = firstByName(rows, name);
    const info = MICROARCH[String(row.microarchitecture)];
    if (info === undefined)
      throw new Error(`no microarchitecture entry for "${row.microarchitecture}" (${name})`);
    const cpu = {
      ...BASELINE_CPU,
      cores: Number(row.core_count),
      id: slug(name),
      integratedGraphics: Boolean(row.graphics),
      memoryGenerations: info.memoryGenerations,
      socket: info.socket,
      tdpWatts: Number(row.tdp),
    };
    return { id: `cpu:${slug(name)}`, kind: 'cpu', name, spec: { caches: CACHE_HIERARCHY, cpu } };
  });
}

function importMemory(): readonly CatalogueEntry[] {
  const rows = readRows('memory');
  return MEMORY_PICKS.map((pick) => {
    const row = rows.find(candidate =>
      candidate.name === pick.name && (candidate.speed as [number, number])[1] === pick.mtPerSecond);
    if (row === undefined)
      throw new Error(`no memory "${pick.name}" at ${pick.mtPerSecond} MT/s in the snapshot`);
    const [ddr, mtPerSecond] = row.speed as [number, number];
    const [moduleCount, moduleGb] = row.modules as [number, number];
    const spec = memorySpec(`ddr${ddr}` as 'ddr3' | 'ddr4' | 'ddr5', mtPerSecond, Number(row.cas_latency), {
      capacityBytes: moduleCount * moduleGb * GIB,
      channels: Math.min(moduleCount, 2),
      id: slug(pick.name),
    });
    return { id: `memory:${slug(pick.name)}`, kind: 'memory', name: pick.name, spec };
  });
}

function importMotherboards(): readonly CatalogueEntry[] {
  const rows = readRows('motherboard');
  return Object.keys(BOARDS).map((name) => {
    const row = firstByName(rows, name);
    const enrich = BOARDS[name];
    const dimmSlots = Number(row.memory_slots);
    const spec = {
      allowedGenerations: enrich.allowedGenerations,
      dimmSlots,
      formFactor: boardFormFactor(String(row.form_factor)),
      id: slug(name),
      m2Slots: enrich.m2Slots,
      maxChannels: Math.min(dimmSlots, 2),
      maxMtPerSecond: enrich.maxMtPerSecond,
      pcieLanes: enrich.pcieLanes,
      pcieVersion: enrich.pcieVersion,
      powerConnectors: enrich.powerConnectors,
      sataPorts: enrich.sataPorts,
      socket: socketFromDataset(String(row.socket)),
    };
    return { id: `motherboard:${slug(name)}`, kind: 'motherboard', name, spec };
  });
}

function importGpus(): readonly CatalogueEntry[] {
  const rows = readRows('video-card');
  return Object.keys(GPUS).map((chipset) => {
    const row = firstByField(rows, 'chipset', chipset);
    const enrich = GPUS[chipset];
    const spec = {
      boardPowerWatts: enrich.boardPowerWatts,
      id: slug(chipset),
      identity: chipset,
      lengthMm: Number(row.length),
      pcieLanes: enrich.pcieLanes,
      pcieVersion: enrich.pcieVersion,
      powerConnectors: enrich.powerConnectors,
    };
    return { id: `gpu:${slug(chipset)}`, kind: 'gpu', name: chipset, spec };
  });
}

function importPsus(): readonly CatalogueEntry[] {
  const rows = readRows('power-supply');
  return Object.keys(PSUS).map((name) => {
    const row = firstByName(rows, name);
    const spec = { connectors: PSUS[name], id: slug(name), identity: name, wattage: Number(row.wattage) };
    return { id: `psu:${slug(name)}`, kind: 'psu', name, spec };
  });
}

function importStorage(): readonly CatalogueEntry[] {
  const rows = readRows('internal-hard-drive');
  return STORAGE_PICKS.map((pick) => {
    const row = rows.find(candidate =>
      candidate.name === pick.name
      && Number(candidate.capacity) === pick.capacityGb
      && (pick.datasetInterface === undefined || candidate.interface === pick.datasetInterface));
    if (row === undefined)
      throw new Error(`no drive "${pick.name}" at ${pick.capacityGb} GB in the snapshot`);
    const { interface: storageInterface, pcieLanes } = parseStorage(String(row.interface));
    const label = pick.capacityGb >= 1000 ? `${pick.capacityGb / 1000} TB` : `${pick.capacityGb} GB`;
    const name = `${pick.name} ${label}`;
    const idSlug = `${slug(pick.name)}-${pick.capacityGb}`;
    const spec = {
      capacityBytes: pick.capacityGb * 1_000_000_000,
      id: idSlug,
      identity: name,
      interface: storageInterface,
      pcieLanes,
    };
    return { id: `storage:${idSlug}`, kind: 'storage', name, spec };
  });
}

function importCoolers(): readonly CatalogueEntry[] {
  const rows = readRows('cpu-cooler');
  return Object.keys(COOLERS).map((name) => {
    firstByName(rows, name); // asserts the curated cooler exists in the snapshot
    const enrich = COOLERS[name];
    const spec = {
      heightMm: enrich.heightMm,
      id: slug(name),
      identity: name,
      supportedSockets: enrich.supportedSockets,
      tdpRatingWatts: enrich.tdpRatingWatts,
    };
    return { id: `cooler:${slug(name)}`, kind: 'cooler', name, spec };
  });
}

function importCases(): readonly CatalogueEntry[] {
  const rows = readRows('case');
  return Object.keys(CASES).map((name) => {
    const row = firstByName(rows, name);
    const enrich = CASES[name];
    const spec = {
      formFactors: caseFormFactors(String(row.type), enrich.eatx ?? false),
      id: slug(name),
      identity: name,
      maxCoolerHeightMm: enrich.maxCoolerHeightMm,
      maxGpuLengthMm: enrich.maxGpuLengthMm,
    };
    return { id: `case:${slug(name)}`, kind: 'case', name, spec };
  });
}

const entries = [
  ...importCpus(),
  ...importMotherboards(),
  ...importMemory(),
  ...importGpus(),
  ...importPsus(),
  ...importStorage(),
  ...importCoolers(),
  ...importCases(),
].sort((left, right) => left.id.localeCompare(right.id));

const ids = new Set(entries.map(entry => entry.id));
if (ids.size !== entries.length)
  throw new Error('duplicate catalogue id');

writeFileSync(OUTPUT, `${JSON.stringify(entries, null, 2)}\n`);
// eslint-disable-next-line no-console
console.log(`wrote ${entries.length} catalogue entries to ${OUTPUT}`);
