export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
    queueIndexedDbWrite(key, serialized);
  } catch {
    /* quota / private mode */
  }
}

export const TICKS_PER_DAY = 24;
export const GAME_STORAGE_PREFIX = 'evu-';
const IDB_NAME = 'evu-simulator';
const IDB_STORE = 'kv';

export function isNewGameDay(prevTick: number, nextTick: number): boolean {
  return Math.floor(nextTick / TICKS_PER_DAY) > Math.floor(prevTick / TICKS_PER_DAY);
}

export function clampReputation(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

type IdbPending = { key: string; value: string };
const idbQueue: IdbPending[] = [];
let idbFlushing = false;

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function queueIndexedDbWrite(key: string, value: string): void {
  if (!canUseIndexedDb() || !key.startsWith(GAME_STORAGE_PREFIX)) return;
  idbQueue.push({ key, value });
  if (!idbFlushing) void flushIndexedDbQueue();
}

async function flushIndexedDbQueue(): Promise<void> {
  if (!canUseIndexedDb()) return;
  idbFlushing = true;
  try {
    while (idbQueue.length > 0) {
      const batch = idbQueue.splice(0, 40);
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        for (const row of batch) store.put(row.value, row.key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      });
      db.close();
    }
  } catch {
    idbQueue.length = 0;
  } finally {
    idbFlushing = false;
  }
}

/** Restores evu-* keys from IndexedDB when localStorage is empty (reload / private quota). */
export async function hydrateLocalStorageFromIndexedDb(): Promise<number> {
  if (!canUseIndexedDb() || typeof localStorage === 'undefined') return 0;
  try {
    const db = await openDb();
    const entries = await new Promise<Array<[string, string]>>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      const rows: Array<[string, string]> = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(rows);
          return;
        }
        if (typeof cursor.key === 'string' && typeof cursor.value === 'string') {
          rows.push([cursor.key, cursor.value]);
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    db.close();
    let restored = 0;
    for (const [key, value] of entries) {
      if (!key.startsWith(GAME_STORAGE_PREFIX)) continue;
      if (localStorage.getItem(key)) continue;
      localStorage.setItem(key, value);
      restored += 1;
    }
    return restored;
  } catch {
    return 0;
  }
}

export function snapshotGameStorage(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  if (typeof localStorage === 'undefined') return snapshot;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(GAME_STORAGE_PREFIX)) continue;
    const value = localStorage.getItem(key);
    if (value != null) snapshot[key] = value;
  }
  return snapshot;
}

export function restoreGameStorage(snapshot: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  for (const [key, value] of Object.entries(snapshot)) {
    if (!key.startsWith(GAME_STORAGE_PREFIX)) continue;
    localStorage.setItem(key, value);
    queueIndexedDbWrite(key, value);
  }
}
