import { loadJson, saveJson } from '@/lib/storage';

export const PERFORMANCE_SETTINGS_KEY = 'evu-performance-settings';

export interface PerformanceSettings {
  powerSaving: boolean;
  webVitalsOptIn: boolean;
}

const DEFAULT_SETTINGS: PerformanceSettings = {
  powerSaving: false,
  webVitalsOptIn: false,
};

function normalize(value: Partial<PerformanceSettings> | null | undefined): PerformanceSettings {
  return {
    powerSaving: Boolean(value?.powerSaving),
    webVitalsOptIn: Boolean(value?.webVitalsOptIn),
  };
}

/** Lädt die gerätebezogene Darstellungseinstellung unabhängig vom Spielstand. */
export function loadPerformanceSettings(): PerformanceSettings {
  return normalize(loadJson<Partial<PerformanceSettings>>(PERFORMANCE_SETTINGS_KEY, DEFAULT_SETTINGS));
}

/** Speichert die gewählte Darstellung lokal, ohne Spielstand oder Archivdaten zu beeinflussen. */
export function savePerformanceSettings(settings: PerformanceSettings): PerformanceSettings {
  const normalized = normalize(settings);
  saveJson(PERFORMANCE_SETTINGS_KEY, normalized);
  return normalized;
}

/** Wendet die Darstellung unmittelbar per Dokumentattribut an, damit CSS keine Re-Render-Kaskade benötigt. */
export function applyPerformanceSettings(settings: PerformanceSettings): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.performanceMode = settings.powerSaving ? 'power-saver' : 'balanced';
}
