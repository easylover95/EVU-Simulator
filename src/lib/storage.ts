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
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export const TICKS_PER_DAY = 24;

export function isNewGameDay(prevTick: number, nextTick: number): boolean {
  return Math.floor(nextTick / TICKS_PER_DAY) > Math.floor(prevTick / TICKS_PER_DAY);
}

export function clampReputation(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
