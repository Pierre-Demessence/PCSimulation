import type { StorageSpec } from '@/data';

import { applyStorageParameter, storageDescriptors } from '@/data';

import { ParameterField } from './ParameterField';

/** Edits one drive. Storage carries no cross-part invariant, so nothing refuses. */
export function StorageEditor({
  drive,
  onChange,
}: {
  readonly drive: StorageSpec;
  readonly onChange: (drive: StorageSpec) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {storageDescriptors.map(parameter => (
        <ParameterField
          key={parameter.id}
          parameter={parameter}
          part={drive}
          refusal={undefined}
          onChange={value => onChange(applyStorageParameter(drive, parameter.id, value).drive)}
        />
      ))}
    </div>
  );
}
