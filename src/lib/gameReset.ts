const GAME_STORAGE_PREFIX = 'evu-';

/**
 * Entfernt ausschließlich den lokalen Spielstand des EVU-Simulators.
 * Andere Websites und nicht zum Spiel gehörende Browserdaten bleiben unberührt.
 */
export function clearLocalGameState(): void {
  if (typeof window === 'undefined') return;

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(GAME_STORAGE_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  }
}
