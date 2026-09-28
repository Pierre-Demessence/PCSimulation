import type { PartStatus } from './partInfo';

import type { Build, PartId } from '@/data';

import { partDefinitions } from '@/data';

import { PartSlot } from './PartSlot';

export function BuildPanel({
  build,
  statuses,
  onChange,
}: {
  readonly build: Build;
  readonly statuses: Partial<Record<PartId, PartStatus>>;
  readonly onChange: (build: Build) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {partDefinitions().map(definition => (
        <PartSlot
          key={definition.id}
          definition={definition}
          build={build}
          status={statuses[definition.id]}
          onChange={onChange}
        />
      ))}
    </div>
  );
}
