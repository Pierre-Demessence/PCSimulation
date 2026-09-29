import type { PartStatus } from './partInfo';

import type { Build, PartId } from '@/data';

import { partDefinitions } from '@/data';

import { PartSlot } from './PartSlot';

export function BuildPanel({
  build,
  statuses,
  onPartChange,
}: {
  readonly build: Build;
  readonly statuses: Partial<Record<PartId, PartStatus>>;
  readonly onPartChange: (part: PartId, build: Build, origin: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {partDefinitions().map(definition => (
        <PartSlot
          key={definition.id}
          definition={definition}
          build={build}
          status={statuses[definition.id]}
          onChange={next => onPartChange(definition.id, next, null)}
          onChoose={(next, name) => onPartChange(definition.id, next, name)}
        />
      ))}
    </div>
  );
}
