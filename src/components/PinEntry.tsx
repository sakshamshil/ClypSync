'use client';

import { useRef, useState, useEffect, KeyboardEvent, FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, Hash, KeyRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { APP_NAME, APP_TAGLINE, PIN_LENGTH, PASSPHRASE_MIN_LENGTH } from '@/lib/constants';
import { normalizePhrase } from '@/lib/spaces';
import { cn } from '@/lib/utils';

export type EntryResult =
  | { kind: 'pin'; pin: string }
  | { kind: 'phrase'; phrase: string; label: string };

interface PinEntryProps {
  onComplete: (result: EntryResult) => void | Promise<void>;
  /** Present when the user already has a space and is adding another one. */
  onCancel?: () => void;
}

type Mode = 'pin' | 'phrase';

export function PinEntry({ onComplete, onCancel }: PinEntryProps) {
  const [mode, setMode] = useState<Mode>('pin');
  const adding = Boolean(onCancel);

  useEffect(() => {
    if (!onCancel) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 pb-4 pt-16">
      {onCancel && (
        <Button variant="ghost" size="sm" className="absolute left-4 top-4 gap-1.5" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      )}

      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {adding ? 'Add a space' : APP_NAME}
          </h1>
          <p className="text-muted-foreground">
            {adding ? 'Open another clipboard. You can switch between them anytime.' : APP_TAGLINE}
          </p>
        </div>

        {/* Mode switch */}
        <div className="mx-auto grid w-full max-w-xs grid-cols-2 rounded-lg bg-muted p-1 text-sm">
          {([
            { id: 'pin', label: 'Room code', icon: Hash },
            { id: 'phrase', label: 'Passphrase', icon: KeyRound },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors',
                mode === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {mode === 'pin' ? (
          <PinFields onComplete={(pin) => onComplete({ kind: 'pin', pin })} />
        ) : (
          <PhraseFields onComplete={(phrase, label) => onComplete({ kind: 'phrase', phrase, label })} />
        )}
      </div>
    </div>
  );
}

function PinFields({ onComplete }: { onComplete: (pin: string) => void }) {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (digit && index === PIN_LENGTH - 1) {
      const pin = newDigits.join('');
      if (pin.length === PIN_LENGTH) onComplete(pin);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (pasted.length === PIN_LENGTH) {
      setDigits(pasted.split(''));
      onComplete(pasted);
    }
  };

  return (
    <>
      <div className="flex justify-center gap-2">
        {digits.map((digit, index) => (
          <Input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            className="h-14 w-12 text-center text-2xl font-mono"
            autoComplete="off"
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">
          Enter any {PIN_LENGTH}-digit code to create or join a room
        </p>
        <p className="text-xs text-muted-foreground/70">
          Quick to type. Anyone who guesses the code can see the room.
        </p>
      </div>
    </>
  );
}

function PhraseFields({ onComplete }: { onComplete: (phrase: string, label: string) => void | Promise<void> }) {
  const [phrase, setPhrase] = useState('');
  const [label, setLabel] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phraseRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    phraseRef.current?.focus();
  }, []);

  const length = normalizePhrase(phrase).length;
  const ready = length >= PASSPHRASE_MIN_LENGTH;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) {
      setError(`Use at least ${PASSPHRASE_MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    try {
      await onComplete(phrase, label);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-3">
      <div className="relative">
        <Input
          ref={phraseRef}
          type={show ? 'text' : 'password'}
          value={phrase}
          onChange={(e) => { setPhrase(e.target.value); setError(null); }}
          placeholder="e.g. purple otter eats tacos"
          className="h-12 pr-10 text-base"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Passphrase"
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
          aria-label={show ? 'Hide passphrase' : 'Show passphrase'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Name this space (optional)"
        maxLength={32}
        className="h-10"
        aria-label="Space name"
      />

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {ready ? 'Looks good.' : `${length}/${PASSPHRASE_MIN_LENGTH} characters minimum`}
        </p>
      )}

      <Button type="submit" className="w-full h-10" disabled={!ready || busy}>
        {busy ? 'Opening…' : 'Open space'}
      </Button>

      <div className="text-center space-y-1 pt-2">
        <p className="text-xs text-muted-foreground">
          Same phrase on any device opens the same clipboard.
        </p>
        <p className="text-xs text-muted-foreground/70">
          The phrase never leaves this device. There is no recovery if you forget it.
        </p>
      </div>
    </form>
  );
}
