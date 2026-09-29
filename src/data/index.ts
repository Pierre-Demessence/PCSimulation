export { addPart, addStorage, completeBuild, emptyBuild, hasPart, missingParts, removePart, removeStorageAt, replaceStorageAt, toConfigParts } from './build';
export type { Build } from './build';
export { catalogueFor } from './catalogue';
export type { CatalogueChoice } from './catalogue';
export { buildChecks } from './checks';
export type { Check } from './checks';
export { validateConfiguration } from './compat';
export { buildLimits } from './limits';
export type { Limit, LimitInput } from './limits';
export { applyParameter, applyStorageParameter, partDefinition, partDefinitions, STORAGE_BLANK, storageDescriptors } from './parameters';
export type {
  ChoiceParameter,
  CpuPart,
  FlagsParameter,
  Parameter,
  ParameterApplication,
  ParameterControl,
  ParameterEffect,
  ParameterUnit,
  ParameterValue,
  PartDefinition,
  PartId,
  RangeParameter,
  SlotId,
} from './parameters';
export type { CaseSpec, CompatParts, CoolerSpec, GpuSpec, PsuSpec, StorageInterface, StorageSpec } from './parts/specs';
export {
  BASELINE_CPU,
  CACHE_HIERARCHY,
  CYCLES_PER_ISSUE,
  GIB,
  MEMORY_DEFAULTS,
  memorySpec,
} from './presets';
