import { LEGACY_PIN_KEY, PIN_LENGTH, SPACES_KEY, ACTIVE_SPACE_KEY } from './constants';

/**
 * A space is one clipboard this device remembers. It is either a 6-digit PIN
 * room or a passphrase room. For a passphrase room we keep only the derived
 * room code, never the phrase itself.
 */
export interface Space {
  id: string;
  code: string; // room_code in the DB: '123456' or 'p_<64 hex>'
  kind: 'pin' | 'phrase';
  label: string;
  /** The passphrase, kept on this device only so the user can see or copy it later. */
  phrase?: string;
}

const PHRASE_SALT = 'clypsync-passphrase-v1';
const PHRASE_ITERATIONS = 600_000;
const ROOM_CODE_RE = /^(\d{6}|p_[0-9a-f]{64})$/;

function isSpace(v: unknown): v is Space {
  const s = v as Space;
  return (
    !!s && typeof s.id === 'string' && typeof s.label === 'string' &&
    typeof s.code === 'string' && ROOM_CODE_RE.test(s.code) &&
    (s.kind === 'pin' || s.kind === 'phrase') &&
    (s.phrase === undefined || typeof s.phrase === 'string')
  );
}

/** Trim and collapse whitespace so "my  phrase " and "my phrase" match. */
export function normalizePhrase(phrase: string): string {
  return phrase.trim().replace(/\s+/g, ' ');
}

/** PBKDF2-SHA256 of the phrase. Deterministic, so every device lands in the same room. */
export async function phraseToRoomCode(phrase: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(normalizePhrase(phrase)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(PHRASE_SALT), iterations: PHRASE_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  const hex = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
  return `p_${hex}`;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function loadSpaces(): Space[] {
  try {
    const list = JSON.parse(localStorage.getItem(SPACES_KEY) || '[]');
    return Array.isArray(list) ? list.filter(isSpace) : [];
  } catch {
    return [];
  }
}

export function saveSpaces(list: Space[], activeId: string | null): void {
  localStorage.setItem(SPACES_KEY, JSON.stringify(list));
  if (activeId) localStorage.setItem(ACTIVE_SPACE_KEY, activeId);
  else localStorage.removeItem(ACTIVE_SPACE_KEY);
}

export function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_SPACE_KEY);
}

/** Move a user from the old single-PIN storage into the spaces list. */
export function migrateLegacyPin(): void {
  const pin = localStorage.getItem(LEGACY_PIN_KEY);
  if (!pin) return;
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    localStorage.removeItem(LEGACY_PIN_KEY);
    return;
  }
  const list = loadSpaces();
  let entry = list.find((s) => s.code === pin);
  if (!entry) {
    entry = { id: newId(), code: pin, kind: 'pin', label: defaultLabel('pin', pin, list) };
    list.push(entry);
  }
  saveSpaces(list, entry.id);
  // Remove the old key only after the new list is safely written.
  localStorage.removeItem(LEGACY_PIN_KEY);
}

export function defaultLabel(kind: Space['kind'], code: string, list: Space[]): string {
  if (kind === 'pin') return `Room ${code}`;
  const n = list.filter((s) => s.kind === 'phrase').length + 1;
  return `Private space ${n}`;
}

export function createSpace(
  code: string,
  kind: Space['kind'],
  label: string,
  list: Space[],
  phrase?: string
): Space {
  return {
    ...(phrase ? { phrase: normalizePhrase(phrase) } : {}),
    id: newId(),
    code,
    kind,
    label: label.trim().slice(0, 32) || defaultLabel(kind, code, list),
  };
}
