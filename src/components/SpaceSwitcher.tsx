'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Copy, Eye, EyeOff, Hash, KeyRound, LogOut, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Space } from '@/lib/spaces';

interface SpaceSwitcherProps {
  space: Space;
  spaces: Space[];
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, label: string) => void;
  onLeave: (id: string) => void;
}

function SpaceIcon({ kind, className }: { kind: Space['kind']; className?: string }) {
  return kind === 'phrase' ? <KeyRound className={className} /> : <Hash className={className} />;
}

export function SpaceSwitcher({ space, spaces, onSwitch, onAdd, onRename, onLeave }: SpaceSwitcherProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [draft, setDraft] = useState(space.label);
  const [revealOpen, setRevealOpen] = useState(false);
  const [shown, setShown] = useState(false);

  // The PIN is the room code. For a passphrase room, the phrase is kept only
  // if this device saved it.
  const secret = space.kind === 'pin' ? space.code : space.phrase;
  const secretName = space.kind === 'pin' ? 'room code' : 'passphrase';

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast.success(`Copied ${secretName}`);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="-ml-2 flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Space: ${space.label}. Switch space`}
          >
            <SpaceIcon kind={space.kind} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{space.label}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Spaces on this device
          </DropdownMenuLabel>
          {spaces.map((s) => (
            <DropdownMenuItem
              key={s.id}
              onSelect={() => s.id !== space.id && onSwitch(s.id)}
              className="gap-2"
            >
              <SpaceIcon kind={s.kind} className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 truncate">{s.label}</span>
              {s.id === space.id && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onAdd} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            Add a space
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => { setShown(space.kind === 'pin'); setRevealOpen(true); }}
            className="gap-2"
          >
            <Eye className="h-3.5 w-3.5" />
            {space.kind === 'pin' ? 'Show room code' : 'Show passphrase'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => { setDraft(space.label); setRenameOpen(true); }}
            className="gap-2"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename this space
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onLeave(space.id)} className="gap-2">
            <LogOut className="h-3.5 w-3.5" />
            Leave this space
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename space</AlertDialogTitle>
            <AlertDialogDescription>The name stays on this device only.</AlertDialogDescription>
          </AlertDialogHeader>
          <form
            id="rename-space"
            onSubmit={(e) => {
              e.preventDefault();
              onRename(space.id, draft);
              setRenameOpen(false);
            }}
          >
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={32} autoFocus />
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="submit" form="rename-space" disabled={!draft.trim()}>
              Save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={revealOpen}
        onOpenChange={(open) => { setRevealOpen(open); if (!open) setShown(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{space.kind === 'pin' ? 'Room code' : 'Passphrase'}</AlertDialogTitle>
            <AlertDialogDescription>
              {secret
                ? `Enter this ${secretName} on another device to open “${space.label}”. Anyone with it can read this space.`
                : 'This device did not save the passphrase for this space. Add the space again with its passphrase, and the passphrase will be saved here.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {secret && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <code className="flex-1 break-all font-mono text-sm select-all">
                {shown ? secret : '•'.repeat(Math.min(secret.length, 24))}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setShown((v) => !v)}
                aria-label={shown ? `Hide ${secretName}` : `Show ${secretName}`}
              >
                {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={copySecret}
                aria-label={`Copy ${secretName}`}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
