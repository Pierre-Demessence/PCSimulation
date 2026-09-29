import type { PartStatus } from './partInfo';

import type { Build, StorageSpec } from '@/data';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addStorage, catalogueFor, removeStorageAt, replaceStorageAt, STORAGE_BLANK } from '@/data';

import { storageSummary } from './partInfo';
import { StorageEditor } from './StorageEditor';

const STATUS_GLYPH: Record<PartStatus, string> = { bad: '✘', warn: '⚠' };
const STATUS_TONE: Record<PartStatus, string> = { bad: 'text-destructive', warn: 'text-amber-500' };
const STATUS_WORD: Record<PartStatus, string> = { bad: 'Incompatible', warn: 'Warning' };

/** Storage is the one kind a build may hold several of: a list, not a single slot. */
export function StorageSection({
  build,
  status,
  onChange,
}: {
  readonly build: Build;
  readonly status: PartStatus | undefined;
  readonly onChange: (build: Build) => void;
}) {
  const drives = build.storage;
  const choices = catalogueFor('storage');
  const glyph = status === undefined ? '✓' : STATUS_GLYPH[status];
  const tone = status === undefined ? 'text-muted-foreground' : STATUS_TONE[status];
  const word = status === undefined ? 'Compatible' : STATUS_WORD[status];

  return (
    <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
      <div className="flex items-center gap-3">
        {drives.length > 0 && (
          <>
            <span className={`font-mono text-sm ${tone}`} aria-hidden>{glyph}</span>
            <span className="sr-only">{word}</span>
          </>
        )}
        <span className="flex-1 text-sm font-medium">Storage</span>
        <span className="font-mono text-xs text-muted-foreground">
          {drives.length === 0 ? 'None' : `${drives.length} drive${drives.length > 1 ? 's' : ''}`}
        </span>
      </div>

      {drives.map((drive, index) => (
        // Two drives can share an id (two blanks, or the same model twice), so position is the identity.
        // eslint-disable-next-line react/no-array-index-key
        <div key={`${drive.id}-${index}`} className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{drive.identity}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">{storageSummary(drive)}</div>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">Edit</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{drive.identity}</DialogTitle>
                <DialogDescription>Every characteristic of this drive. Changes apply immediately.</DialogDescription>
              </DialogHeader>
              <StorageEditor
                drive={drive}
                onChange={(next: StorageSpec) => onChange(replaceStorageAt(build, index, next))}
              />
            </DialogContent>
          </Dialog>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onChange(removeStorageAt(build, index))}
          >
            Remove
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        {choices.length > 0 && (
          <Select
            value=""
            onValueChange={(id) => {
              const choice = choices.find(candidate => candidate.id === id);
              if (choice !== undefined)
                onChange(addStorage(build, choice.spec as StorageSpec));
            }}
          >
            <SelectTrigger size="sm" className="w-52">
              <SelectValue placeholder="Add a drive…" />
            </SelectTrigger>
            <SelectContent>
              {choices.map(choice => (
                <SelectItem key={choice.id} value={choice.id}>{choice.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="secondary" onClick={() => onChange(addStorage(build, STORAGE_BLANK))}>
          Enter your own
        </Button>
      </div>
    </div>
  );
}
