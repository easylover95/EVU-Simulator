import { loadJson, saveJson } from '@/lib/storage';

export const SESSION_KEY = 'evu-session-active';

/** Missing key = in-game (bestehende Saves nicht ins Menü zwingen). */
export function isSessionActive(): boolean {
  const value = loadJson<string | number | boolean | null>(SESSION_KEY, '1');
  return value !== '0' && value !== 0 && value !== false;
}

export function setSessionActive(active: boolean): void {
  saveJson(SESSION_KEY, active ? '1' : '0');
}
