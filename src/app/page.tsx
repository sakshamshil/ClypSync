'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { PinEntry, type EntryResult } from '@/components/PinEntry';
import { ClipboardView } from '@/components/ClipboardView';
import {
  type Space,
  createSpace,
  loadActiveId,
  loadSpaces,
  migrateLegacyPin,
  normalizePhrase,
  phraseToRoomCode,
  saveSpaces,
} from '@/lib/spaces';
import { SPACES_KEY } from '@/lib/constants';

export default function Home() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load spaces from localStorage on mount
  useEffect(() => {
    migrateLegacyPin();
    const list = loadSpaces();
    const stored = loadActiveId();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpaces(list);
    setActiveId(list.some((s) => s.id === stored) ? stored : list[0]?.id ?? null);
    setIsLoading(false);

    // Keep tabs in sync: another tab may add, rename, or leave a space.
    const onStorage = (e: StorageEvent) => {
      if (e.key === SPACES_KEY) setSpaces(loadSpaces());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Apply a change to the freshest stored list, so one tab never drops
  // a space that another tab added.
  const commit = useCallback((change: (list: Space[]) => Space[], id: string | null) => {
    const list = change(loadSpaces());
    saveSpaces(list, id);
    setSpaces(list);
    setActiveId(id);
  }, []);

  const handleEntry = async (result: EntryResult) => {
    let code: string;
    try {
      code = result.kind === 'pin' ? result.pin : await phraseToRoomCode(result.phrase);
    } catch {
      toast.error('Could not open the space. Your browser needs HTTPS for passphrases.');
      return;
    }

    const current = loadSpaces();
    const existing = current.find((s) => s.code === code);
    if (existing) {
      // Re-entering a passphrase saves it on a space that was added without it.
      const phrase = result.kind === 'phrase' ? normalizePhrase(result.phrase) : undefined;
      commit((l) => l.map((s) => (s.id === existing.id && phrase ? { ...s, phrase } : s)), existing.id);
      if (adding) toast.info(`Switched to ${existing.label}`);
    } else {
      const space =
        result.kind === 'phrase'
          ? createSpace(code, 'phrase', result.label, current, result.phrase)
          : createSpace(code, 'pin', '', current);
      commit((l) => [...l, space], space.id);
    }
    setAdding(false);
  };

  const handleSwitch = (id: string) => commit((l) => l, id);

  const handleRename = (id: string, label: string) => {
    const clean = label.trim().slice(0, 32);
    if (!clean) return;
    commit((l) => l.map((s) => (s.id === id ? { ...s, label: clean } : s)), activeId);
  };

  const handleLeave = (id: string) => {
    const all = loadSpaces();
    const left = all.find((s) => s.id === id);
    const remaining = all.filter((s) => s.id !== id);
    const nextId = id === activeId ? remaining[0]?.id ?? null : activeId;
    commit(() => remaining, nextId);
    if (left) {
      toast(`Left ${left.label}`, {
        action: {
          label: 'Undo',
          onClick: () => commit((l) => (l.some((s) => s.id === left.id) ? l : [...l, left]), left.id),
        },
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const active = spaces.find((s) => s.id === activeId);

  if (!active || adding) {
    return <PinEntry onComplete={handleEntry} onCancel={active ? () => setAdding(false) : undefined} />;
  }

  return (
    <ClipboardView
      key={active.code}
      space={active}
      spaces={spaces}
      onSwitch={handleSwitch}
      onAdd={() => setAdding(true)}
      onRename={handleRename}
      onLeave={handleLeave}
    />
  );
}
