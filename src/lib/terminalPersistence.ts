export const TERMINAL_SAVE_STORAGE_KEY = 'evu-simulator.terminal-save.v1';
export const TERMINAL_SAVE_SCHEMA_VERSION = 1;

export type TerminalPersistenceStatus = 'IDLE' | 'SAVED' | 'ERROR' | 'UNAVAILABLE';

export interface TerminalPersistenceMeta {
  status: TerminalPersistenceStatus;
  lastSavedAt: string | null;
  errorMessage: string | null;
}

export interface PersistedTerminalSave<TSnapshot> {
  schemaVersion: typeof TERMINAL_SAVE_SCHEMA_VERSION;
  savedAt: string;
  snapshot: TSnapshot;
}

export interface TerminalPersistenceResult<TSnapshot = never> {
  ok: boolean;
  status: TerminalPersistenceStatus;
  savedAt?: string;
  snapshot?: TSnapshot;
  errorMessage?: string;
}

function browserStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probeKey = '__evu_terminal_storage_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Persists only serializable snapshot data. The caller supplies a deterministic
 * simulation timestamp; wall-clock time is intentionally not part of gameplay.
 */
export function saveTerminalSnapshot<TSnapshot>(
  snapshot: TSnapshot,
  savedAt: string,
): TerminalPersistenceResult {
  const storage = browserStorage();
  if (!storage) {
    return {
      ok: false,
      status: 'UNAVAILABLE',
      errorMessage: 'Lokaler Speicher ist in diesem Browser nicht verfügbar.',
    };
  }

  try {
    const envelope: PersistedTerminalSave<TSnapshot> = {
      schemaVersion: TERMINAL_SAVE_SCHEMA_VERSION,
      savedAt,
      snapshot,
    };
    storage.setItem(TERMINAL_SAVE_STORAGE_KEY, JSON.stringify(envelope));
    return { ok: true, status: 'SAVED', savedAt };
  } catch {
    return {
      ok: false,
      status: 'ERROR',
      errorMessage: 'Spielstand konnte nicht im lokalen Speicher abgelegt werden.',
    };
  }
}

/**
 * Loads only the current, validated envelope shape. Unknown or corrupted data
 * is never passed to the game store and cannot overwrite the active state.
 */
export function loadTerminalSnapshot<TSnapshot>(
  isSnapshot: (value: unknown) => value is TSnapshot,
): TerminalPersistenceResult<TSnapshot> {
  const storage = browserStorage();
  if (!storage) {
    return {
      ok: false,
      status: 'UNAVAILABLE',
      errorMessage: 'Lokaler Speicher ist in diesem Browser nicht verfügbar.',
    };
  }
  try {
    const raw = storage.getItem(TERMINAL_SAVE_STORAGE_KEY);
    if (!raw) return { ok: false, status: 'IDLE', errorMessage: 'Kein gespeicherter Terminal-Spielstand gefunden.' };
    const candidate: unknown = JSON.parse(raw);
    if (
      !candidate
      || typeof candidate !== 'object'
      || !('schemaVersion' in candidate)
      || !('savedAt' in candidate)
      || !('snapshot' in candidate)
      || candidate.schemaVersion !== TERMINAL_SAVE_SCHEMA_VERSION
      || typeof candidate.savedAt !== 'string'
      || !isSnapshot(candidate.snapshot)
    ) {
      return { ok: false, status: 'ERROR', errorMessage: 'Der gespeicherte Spielstand ist ungültig oder stammt aus einer inkompatiblen Version.' };
    }
    return { ok: true, status: 'SAVED', savedAt: candidate.savedAt, snapshot: candidate.snapshot };
  } catch {
    return { ok: false, status: 'ERROR', errorMessage: 'Der gespeicherte Spielstand konnte nicht gelesen werden.' };
  }
}

export function clearTerminalSnapshot(): TerminalPersistenceResult {
  const storage = browserStorage();
  if (!storage) return { ok: false, status: 'UNAVAILABLE', errorMessage: 'Lokaler Speicher ist in diesem Browser nicht verfügbar.' };
  try {
    storage.removeItem(TERMINAL_SAVE_STORAGE_KEY);
    return { ok: true, status: 'IDLE' };
  } catch {
    return { ok: false, status: 'ERROR', errorMessage: 'Der gespeicherte Spielstand konnte nicht gelöscht werden.' };
  }
}
