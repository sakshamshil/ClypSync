'use client';

import { useEffect, useState, useCallback } from 'react';
import { Trash2, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PasteInput } from './PasteInput';
import { PasteList } from './PasteList';
import { supabase, fetchRoomPastes, deletePastes } from '@/lib/supabase';
import { APP_NAME } from '@/lib/constants';
import { SpaceSwitcher } from './SpaceSwitcher';
import type { Space } from '@/lib/spaces';
import type { Paste } from '@/types';

interface ClipboardViewProps {
  space: Space;
  spaces: Space[];
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, label: string) => void;
  onLeave: (id: string) => void;
}

export function ClipboardView({ space, spaces, onSwitch, onAdd, onRename, onLeave }: ClipboardViewProps) {
  // room_code in the DB: the PIN itself, or the hash derived from a passphrase.
  const pin = space.code;
  const fileSlug = space.kind === 'pin' ? pin : space.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'space';
  const [pastes, setPastes] = useState<Paste[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Copy to clipboard helper
  const copyToClipboard = useCallback(async (content: string, showToast = true) => {
    try {
      await navigator.clipboard.writeText(content);
      if (showToast) {
        toast.success('Copied to clipboard!');
      }
    } catch {
      toast.error('Failed to copy');
    }
  }, []);

  // Fetch pastes
  const fetchPastes = useCallback(async () => {
    try {
      setPastes(await fetchRoomPastes(pin));
    } catch (err) {
      setError('Failed to load pastes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pin]);

  // Add new paste
  const addPaste = async (
    content: string,
    type: 'text' | 'image' | 'document',
    meta?: { fileName?: string; fileSize?: number }
  ) => {
    try {
      const { error: insertError } = await supabase.from('pastes').insert({
        room_code: pin,
        content,
        type,
        file_name: meta?.fileName,
        file_size: meta?.fileSize,
      });

      if (insertError) throw insertError;

      toast.success(
        type === 'image' ? 'Image uploaded!' : type === 'document' ? 'Document uploaded!' : 'Paste added!'
      );
    } catch {
      toast.error(
        type === 'image' ? 'Failed to upload image' : type === 'document' ? 'Failed to upload document' : 'Failed to add paste'
      );
    }
  };

  // Delete single paste
  const deletePaste = async (id: string) => {
    try {
      const { error: deleteError } = await deletePastes(pin, [id]);
      if (deleteError) throw new Error(deleteError);

      setPastes((prev) => prev.filter((p) => p.id !== id)); // Update UI immediately
      toast.success('Paste deleted');
    } catch {
      toast.error('Failed to delete paste');
    }
  };

  // Clear all pastes
  const clearAll = async () => {
    try {
      const { error: deleteError } = await deletePastes(pin);
      if (deleteError) throw new Error(deleteError);

      setPastes([]); // Update UI immediately
      toast.success('All pastes cleared!');
    } catch {
      toast.error('Failed to clear pastes');
    }
  };

  // Export pastes
  const exportPastes = (format: 'json' | 'txt', order: 'newest' | 'oldest') => {
    const sorted = order === 'oldest' ? [...pastes].reverse() : pastes;

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify(
        sorted.map((p) => ({
          content: p.content,
          type: p.type,
          file_name: p.file_name ?? undefined,
          file_size: p.file_size ?? undefined,
          created_at: p.created_at,
        })),
        null,
        2
      );
      filename = `clypsync-${fileSlug}.json`;
      mimeType = 'application/json';
    } else {
      // Text export - only include text pastes, skip images and documents
      const textPastes = sorted.filter((p) => p.type === 'text');
      content = textPastes.map((p) => p.content).join('\n\n===\n\n');
      filename = `clypsync-${fileSlug}.txt`;
      mimeType = 'text/plain';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported as ${filename}`);
  };

  // Setup real-time subscription
  useEffect(() => {
    fetchPastes();

    const channel = supabase
      .channel(`room:${pin}`)
      // The DB broadcasts each change to 'room:<code>'. Only clients that
      // know the code can join this topic.
      .on('broadcast', { event: 'insert' }, ({ payload }) => {
        const paste = payload as Paste;
        setPastes((prev) => (prev.some((p) => p.id === paste.id) ? prev : [paste, ...prev]));
      })
      .on('broadcast', { event: 'delete' }, ({ payload }) => {
        const { id } = payload as { id: string };
        setPastes((prev) => prev.filter((p) => p.id !== id));
      })
      .subscribe((status) => {
        // Re-sync on every (re)connect, so pastes missed while the
        // socket was down (sleep, backgrounded tab, network drop) show up
        // without a manual refresh.
        if (status === 'SUBSCRIBED') {
          fetchPastes();
        }
      });

    // Belt-and-suspenders: some mobile browsers suspend the socket while
    // backgrounded and don't reconnect promptly on their own.
    const handleReconnectCheck = () => {
      if (document.visibilityState === 'visible') {
        fetchPastes();
      }
    };
    document.addEventListener('visibilitychange', handleReconnectCheck);
    window.addEventListener('online', handleReconnectCheck);

    return () => {
      document.removeEventListener('visibilitychange', handleReconnectCheck);
      window.removeEventListener('online', handleReconnectCheck);
      supabase.removeChannel(channel);
    };
  }, [pin, fetchPastes]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="font-semibold">{APP_NAME}</h1>
            <SpaceSwitcher
              space={space}
              spaces={spaces}
              onSwitch={onSwitch}
              onAdd={onAdd}
              onRename={onRename}
              onLeave={onLeave}
            />
            {pastes.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {(() => {
                  const textCount = pastes.filter((p) => p.type === 'text').length;
                  const imageCount = pastes.filter((p) => p.type === 'image').length;
                  const documentCount = pastes.filter((p) => p.type === 'document').length;
                  return `${pastes.length} ${pastes.length === 1 ? 'paste' : 'pastes'}${textCount > 0 ? ` · ${textCount} text` : ''}${imageCount > 0 ? ` · ${imageCount} ${imageCount === 1 ? 'image' : 'images'}` : ''}${documentCount > 0 ? ` · ${documentCount} ${documentCount === 1 ? 'document' : 'documents'}` : ''}`;
                })()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={pastes.length === 0}>
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>JSON</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => exportPastes('json', 'newest')}>
                      Newest First
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportPastes('json', 'oldest')}>
                      Oldest First
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Text</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => exportPastes('txt', 'newest')}>
                      Newest First
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportPastes('txt', 'oldest')}>
                      Oldest First
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" disabled={pastes.length === 0}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all pastes?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all pastes in this space. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearAll}>
                    Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-6">
        <PasteInput onSubmit={addPaste} roomCode={pin} />

        <div className="border-t pt-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">
            Recent Pastes
          </h2>
          <PasteList pastes={pastes} loading={loading} onCopy={copyToClipboard} onDelete={deletePaste} />
        </div>
      </main>
    </div>
  );
}
