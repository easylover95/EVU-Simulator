import { STATISTICS_ARCHIVE_KEY } from '@/lib/statisticsArchive';
import { PERFORMANCE_SETTINGS_KEY } from '@/lib/performanceSettings';

const GAME_STORAGE_PREFIX = 'evu-';
const PRESERVED_GAME_STORAGE_KEYS = new Set([STATISTICS_ARCHIVE_KEY, PERFORMANCE_SETTINGS_KEY]);

/**
 * Entfernt ausschließlich den lokalen Spielstand des EVU-Simulators.
 * Andere Websites und nicht zum Spiel gehörende Browserdaten bleiben unberührt.
 */
export function clearLocalGameState(): void {
  if (typeof window === 'undefined') return;

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(GAME_STORAGE_PREFIX) && !PRESERVED_GAME_STORAGE_KEYS.has(key)) {
      window.localStorage.removeItem(key);
    }
  }
}
