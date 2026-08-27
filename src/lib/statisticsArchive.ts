import type { AchievementCounters } from '@/lib/achievements';
import type { Company, Order } from '@/lib/supabase';
import { loadJson, saveJson, TICKS_PER_DAY } from '@/lib/storage';

export const CURRENT_RUN_STATS_KEY = 'evu-current-run-statistics';
export const STATISTICS_ARCHIVE_KEY = 'evu-statistics-archive';
const ARCHIVE_LIMIT = 50;

export type DifficultyId = 'hardcore' | 'standard' | 'komfort';

export interface DifficultyMeta {
  id: DifficultyId;
  label: string;
  startCapital: number;
}

export const DIFFICULTY_LEVELS: readonly DifficultyMeta[] = [
  { id: 'hardcore', label: 'Hardcore Simulation', startCapital: 50_000 },
  { id: 'standard', label: 'Standard / Einsteiger', startCapital: 150_000 },
  { id: 'komfort', label: 'Komfort Modus', startCapital: 250_000 },
];

export interface CurrentRunStatistics {
  id: string;
  companyName: string;
  hqLocation: string;
  difficulty: DifficultyId;
  startCapital: number;
  startedTick: number;
  completedTrips: number;
  freightTonnes: number;
  totalRevenue: number;
  peakRevenue: number;
}

export interface HistoricalCompanyStatistics extends CurrentRunStatistics {
  archivedAt: string;
  endedTick: number;
  endingBalance: number;
  endingLevel: number;
  reputation: number;
  source: 'reset';
}

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value: unknown): number {
  return Math.max(0, finite(value));
}

function difficultyForCapital(startCapital: number): DifficultyId {
  return DIFFICULTY_LEVELS.reduce((closest, level) =>
    Math.abs(level.startCapital - startCapital) < Math.abs(closest.startCapital - startCapital) ? level : closest,
  ).id;
}

function normalizeCurrent(value: CurrentRunStatistics | null): CurrentRunStatistics | null {
  if (!value || typeof value.companyName !== 'string' || !value.companyName.trim()) return null;
  const difficulty = DIFFICULTY_LEVELS.some((level) => level.id === value.difficulty)
    ? value.difficulty
    : difficultyForCapital(finite(value.startCapital, 150_000));
  return {
    id: typeof value.id === 'string' && value.id ? value.id : `run-${Date.now()}`,
    companyName: value.companyName.trim(),
    hqLocation: typeof value.hqLocation === 'string' ? value.hqLocation.trim() : '',
    difficulty,
    startCapital: nonNegative(value.startCapital) || 150_000,
    startedTick: Math.max(0, Math.floor(finite(value.startedTick))),
    completedTrips: Math.max(0, Math.floor(finite(value.completedTrips))),
    freightTonnes: nonNegative(value.freightTonnes),
    totalRevenue: nonNegative(value.totalRevenue),
    peakRevenue: nonNegative(value.peakRevenue),
  };
}

function normalizeHistorical(value: HistoricalCompanyStatistics | null): HistoricalCompanyStatistics | null {
  const current = normalizeCurrent(value);
  if (!current || !value || typeof value.archivedAt !== 'string') return null;
  return {
    ...current,
    archivedAt: value.archivedAt,
    endedTick: Math.max(current.startedTick, Math.floor(finite(value.endedTick))),
    endingBalance: finite(value.endingBalance),
    endingLevel: Math.max(1, Math.floor(finite(value.endingLevel, 1))),
    reputation: Math.max(0, Math.min(100, Math.round(finite(value.reputation)))),
    source: 'reset',
  };
}

export function loadCurrentRunStatistics(): CurrentRunStatistics | null {
  return normalizeCurrent(loadJson<CurrentRunStatistics | null>(CURRENT_RUN_STATS_KEY, null));
}

export function loadStatisticsArchive(): HistoricalCompanyStatistics[] {
  const raw = loadJson<HistoricalCompanyStatistics[]>(STATISTICS_ARCHIVE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return sortedArchive(
    raw
      .map((entry) => normalizeHistorical(entry))
      .filter((entry): entry is HistoricalCompanyStatistics => Boolean(entry)),
  );
}

export function startStatisticsRun(input: Pick<CurrentRunStatistics, 'companyName' | 'hqLocation' | 'startCapital' | 'startedTick'>): CurrentRunStatistics {
  const startCapital = nonNegative(input.startCapital) || 150_000;
  const next: CurrentRunStatistics = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyName: input.companyName.trim() || 'Unbenanntes EVU',
    hqLocation: input.hqLocation.trim(),
    difficulty: difficultyForCapital(startCapital),
    startCapital,
    startedTick: Math.max(0, Math.floor(finite(input.startedTick))),
    completedTrips: 0,
    freightTonnes: 0,
    totalRevenue: 0,
    peakRevenue: 0,
  };
  saveJson(CURRENT_RUN_STATS_KEY, next);
  return next;
}

/** Fortschreibung erfolgt ausschließlich bei tatsächlich abgeschlossenen Fahrten. */
export function recordCompletedRun(order: Pick<Order, 'weight_t' | 'yield'>): CurrentRunStatistics | null {
  const current = loadCurrentRunStatistics();
  if (!current) return null;
  const revenue = nonNegative(order.yield);
  const next: CurrentRunStatistics = {
    ...current,
    completedTrips: current.completedTrips + 1,
    freightTonnes: current.freightTonnes + nonNegative(order.weight_t),
    totalRevenue: current.totalRevenue + revenue,
    peakRevenue: Math.max(current.peakRevenue, revenue),
  };
  saveJson(CURRENT_RUN_STATS_KEY, next);
  return next;
}

function legacyRun(company: Company, counters: AchievementCounters): CurrentRunStatistics {
  const completedTrips = Math.max(0, counters.spotOrders + counters.contractsCompleted + counters.baugleisCompleted);
  return {
    id: `legacy-${company.id}-${company.tick}`,
    companyName: company.name || 'Unbenanntes EVU',
    hqLocation: company.hq_location ?? '',
    difficulty: 'standard',
    startCapital: 150_000,
    startedTick: 0,
    completedTrips,
    freightTonnes: nonNegative(counters.freightTonnes),
    totalRevenue: 0,
    peakRevenue: 0,
  };
}

/**
 * Schreibt vor einem destruktiven Reset einen fertigen, unveränderlichen Lauf in die Ruhmeshalle.
 * Das Archiv bleibt von clearLocalGameState bewusst ausgenommen.
 */
export function archiveCurrentRun(company: Company, counters: AchievementCounters): HistoricalCompanyStatistics {
  const current = loadCurrentRunStatistics() ?? legacyRun(company, counters);
  const archive: HistoricalCompanyStatistics = {
    ...current,
    completedTrips: Math.max(current.completedTrips, counters.spotOrders + counters.contractsCompleted + counters.baugleisCompleted),
    freightTonnes: Math.max(current.freightTonnes, nonNegative(counters.freightTonnes)),
    archivedAt: new Date().toISOString(),
    endedTick: Math.max(current.startedTick, company.tick),
    endingBalance: finite(company.balance),
    endingLevel: Math.max(1, Math.floor(finite(company.level, 1))),
    reputation: Math.max(0, Math.min(100, Math.round(finite(company.reputation)))),
    source: 'reset',
  };
  const previous = loadStatisticsArchive().filter((entry) => entry.id !== archive.id);
  saveJson(STATISTICS_ARCHIVE_KEY, [archive, ...previous].slice(0, ARCHIVE_LIMIT));
  return archive;
}

export function formatRunDuration(startedTick: number, endedTick: number): string {
  const elapsedTicks = Math.max(0, Math.floor(endedTick) - Math.floor(startedTick));
  const days = Math.floor(elapsedTicks / TICKS_PER_DAY);
  const hours = elapsedTicks % TICKS_PER_DAY;
  if (days === 0) return `${hours} Std.`;
  return `${days} T. ${hours} Std.`;
}

export function difficultyLabel(id: DifficultyId): string {
  return DIFFICULTY_LEVELS.find((level) => level.id === id)?.label ?? 'Standard / Einsteiger';
}

export interface StatisticsArchiveExport {
  format: 'evu-statistics-archive';
  version: 1;
  exportedAt: string;
  archive: HistoricalCompanyStatistics[];
}

export interface StatisticsArchiveImportResult {
  added: number;
  skipped: number;
  archive: HistoricalCompanyStatistics[];
}

function sortedArchive(entries: HistoricalCompanyStatistics[]): HistoricalCompanyStatistics[] {
  return entries.sort((a, b) =>
    b.peakRevenue - a.peakRevenue ||
    b.totalRevenue - a.totalRevenue ||
    b.endingBalance - a.endingBalance ||
    Date.parse(b.archivedAt) - Date.parse(a.archivedAt),
  );
}

/** Erstellt ein portables, versioniertes Backup ausschließlich der historischen Ruhmeshalle. */
export function exportStatisticsArchive(): StatisticsArchiveExport {
  return {
    format: 'evu-statistics-archive',
    version: 1,
    exportedAt: new Date().toISOString(),
    archive: loadStatisticsArchive(),
  };
}

/**
 * Führt ein exportiertes Archiv ausschließlich nach einer strikten Strukturprüfung zusammen.
 * Bestehende Läufe werden niemals überschrieben; identische IDs werden ausgelassen.
 */
export function importStatisticsArchive(value: unknown): StatisticsArchiveImportResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Die Datei enthält kein gültiges Statistik-Archiv.');
  }
  const payload = value as Partial<StatisticsArchiveExport>;
  if (payload.format !== 'evu-statistics-archive' || payload.version !== 1 || !Array.isArray(payload.archive)) {
    throw new Error('Die Datei ist kein unterstütztes EVU-Statistikarchiv.');
  }

  const existing = loadStatisticsArchive();
  const knownIds = new Set(existing.map((entry) => entry.id));
  let added = 0;
  let skipped = 0;
  const imported = payload.archive.flatMap((entry) => {
    const normalized = normalizeHistorical(entry);
    if (!normalized || knownIds.has(normalized.id)) {
      skipped += 1;
      return [];
    }
    knownIds.add(normalized.id);
    added += 1;
    return [normalized];
  });
  const archive = sortedArchive([...existing, ...imported]).slice(0, ARCHIVE_LIMIT);
  saveJson(STATISTICS_ARCHIVE_KEY, archive);
  return { added, skipped, archive };
}
