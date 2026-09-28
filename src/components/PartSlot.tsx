import type { Build, PartDefinition } from '@/data';

import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { addPart, removePart } from '@/data';

import { PartEditor } from './PartEditor';

export function PartSlot({
  definition,
  build,
  onChange,
}: {
  readonly definition: PartDefinition<unknown>;
  readonly build: Build;
  readonly onChange: (build: Build) => void;
}) {
  const present = definition.read(build) !== null;

  if (!present) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3">
        <span className="text-sm text-muted-foreground">{definition.label}</span>
        <Button size="sm" variant="secondary" onClick={() => onChange(addPart(build, definition.id))}>
          Add
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">{definition.label}</CardTitle>
        <CardAction>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onChange(removePart(build, definition.id))}
          >
            Remove
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <PartEditor build={build} part={definition.id} onChange={onChange} />
      </CardContent>
    </Card>
  );
}
