import type { PartStatus } from './partInfo';

import type { Build, PartDefinition } from '@/data';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { addPart, removePart } from '@/data';

import { PartEditor } from './PartEditor';
import { partSummary } from './partInfo';

const STATUS_GLYPH: Record<PartStatus, string> = { bad: '✘', warn: '⚠' };
const STATUS_TONE: Record<PartStatus, string> = { bad: 'text-destructive', warn: 'text-amber-500' };

export function PartSlot({
  definition,
  build,
  status,
  onChange,
}: {
  readonly definition: PartDefinition<unknown>;
  readonly build: Build;
  readonly status: PartStatus | undefined;
  readonly onChange: (build: Build) => void;
}) {
  const partValue = definition.read(build);

  if (partValue === null) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3">
        <span className="text-sm text-muted-foreground">{definition.label}</span>
        <Button size="sm" variant="secondary" onClick={() => onChange(addPart(build, definition.id))}>
          Add
        </Button>
      </div>
    );
  }

  const glyph = status === undefined ? '✓' : STATUS_GLYPH[status];
  const tone = status === undefined ? 'text-muted-foreground' : STATUS_TONE[status];

  return (
    <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
      <span className={`font-mono text-sm ${tone}`} aria-hidden>{glyph}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{definition.label}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          {partSummary(definition.parameters, partValue)}
        </div>
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">Edit</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{definition.label}</DialogTitle>
            <DialogDescription>
              Every characteristic of this part. Changes apply immediately.
            </DialogDescription>
          </DialogHeader>
          <PartEditor build={build} part={definition.id} onChange={onChange} />
        </DialogContent>
      </Dialog>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => onChange(removePart(build, definition.id))}
      >
        Remove
      </Button>
    </div>
  );
}
